import express from 'express';
import fs from 'fs';
import dgram from 'dgram';
import path from 'path';
import { EventEmitter } from 'events';
import request from 'supertest';
import { jest } from '@jest/globals';

const mediaRoot = path.join(process.cwd(), 'src', '__tests__', 'media-server-test-media');
const spawnMock = jest.fn();
const execFileMock = jest.fn();
const execFileSyncMock = jest.fn();

process.env.MEDIA_ROOT = mediaRoot;
process.env.SRT_PORT = '9999';

jest.unstable_mockModule('child_process', () => ({
    spawn: spawnMock,
    execFile: execFileMock,
    execFileSync: execFileSyncMock
}));

const {
    createMediaRoutes,
    ffmpegProcesses,
    registeredStreams,
    killFFmpegProcess,
    isUdpPortBound,
    waitForSrtListener
} = await import('../mediaServer.mjs');

function createProcess({ exitsOnSigint = false } = {}) {
    const process = new EventEmitter();
    process.pid = Math.floor(Math.random() * 10000) + 1;
    process.killed = false;
    process.kill = jest.fn(signal => {
        process.killed = true;
        if (signal === 'SIGINT' && exitsOnSigint) {
            process.emit('exit', 0, signal);
        }
    });
    return process;
}

// Deterministic, correctly-shaped keys so tests exercise the production
// format without needing a database. `knownKeys` maps each key to the internal
// stream id the fake resolver will return.
const knownKeys = new Map();

function keyFor(streamId) {
    const suffix = Buffer.from(String(streamId))
        .toString('base64url')
        .padEnd(43, '0')
        .slice(0, 43);
    const key = `fov_${suffix}`;
    knownKeys.set(key, String(streamId));
    return key;
}

function createApp(options = {}) {
    const app = express();
    const resolveStreamKey = options.resolveStreamKey
        || (async (key) => {
            const streamId = knownKeys.get(key);
            return streamId ? { userId: 1, streamId } : null;
        });
    app.use(createMediaRoutes({
        // ffmpeg is mocked in these tests, so the real UDP readiness probe
        // would always report "not bound" and wait for the full timeout.
        isSrtListenerReady: async () => true,
        ...options,
        resolveStreamKey
    }));
    return app;
}

describe('Media server lifecycle', () => {
    beforeEach(() => {
        jest.useRealTimers();
        spawnMock.mockReset();
        knownKeys.clear();
        ffmpegProcesses.clear();
        registeredStreams.clear();
        fs.rmSync(mediaRoot, { recursive: true, force: true });
    });

    afterAll(() => {
        fs.rmSync(mediaRoot, { recursive: true, force: true });
    });

    test('force kills a process that ignores SIGINT after the grace period', async () => {
        jest.useFakeTimers();
        const process = createProcess();
        const stopping = killFFmpegProcess('ignored', process, 1000);

        expect(process.kill).toHaveBeenCalledWith('SIGINT');
        jest.advanceTimersByTime(1000);
        await stopping;

        expect(process.kill).toHaveBeenCalledWith('SIGKILL');
    });

    test('cleans up a stream and frees its port when ffmpeg spawn fails', async () => {
        const process = createProcess();
        spawnMock.mockReturnValue(process);
        const app = createApp();

        const response = await request(app).post('/ffmpeg/register').send({
            streamId: keyFor('spawn-error'),
            tracks: 1,
            audioTracks: 1
        });
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        process.emit('error', new Error('ffmpeg not installed'));
        consoleErrorSpy.mockRestore();

        expect(response.status).toBe(200);
        expect(ffmpegProcesses.has('spawn-error')).toBe(false);
        expect(registeredStreams.has('spawn-error')).toBe(false);
        expect(fs.existsSync(path.join(mediaRoot, 'hls', 'spawn-error'))).toBe(false);

        const replacement = createProcess();
        spawnMock.mockReturnValue(replacement);
        const reused = await request(app).post('/ffmpeg/register').send({
            streamId: keyFor('replacement'),
            tracks: 1,
            audioTracks: 1
        });

        expect(reused.body.srtUrl).toContain(':9999?');
    });

    test('validates registration requests and supports debug registration', async () => {
        const app = createApp();

        const invalid = await request(app).post('/ffmpeg/register').send({ tracks: 0, audioTracks: 1 });
        expect(invalid.status).toBe(400);

        const debugKey = keyFor('debug-stream');
        const debug = await request(app).post('/ffmpeg/register/debug').send({
            streamId: debugKey,
            tracks: 1,
            audioTracks: 1
        });
        expect(debug.status).toBe(200);
        expect(debug.body.srtUrl).toBe('srt://0.0.0.0:5555?mode=listener');

        const duplicate = await request(app).post('/ffmpeg/register/debug').send({
            streamId: debugKey,
            tracks: 1,
            audioTracks: 1
        });
        expect(duplicate.status).toBe(409);
    });

    test('links an arriving stream key to the owner public stream id', async () => {
        const process = createProcess();
        spawnMock.mockReturnValue(process);
        const resolveStreamKey = jest.fn(async () => ({ userId: 12, streamId: 'u12' }));
        const app = createApp({ resolveStreamKey });
        const streamKey = `fov_${'a'.repeat(43)}`;

        const response = await request(app).post('/ffmpeg/register').send({
            streamId: streamKey,
            tracks: 1,
            audioTracks: 1
        });

        expect(response.status).toBe(200);
        expect(response.body.streamId).toBe('u12');
        expect(response.body.srtUrl).toContain('connect_timeout=15000');
        expect(response.body.hlsUrl).toBe('/api/hls/u12/0/playlist.m3u8');
        expect(resolveStreamKey).toHaveBeenCalledWith(streamKey);
        expect(ffmpegProcesses.has('u12')).toBe(true);
        expect(fs.existsSync(path.join(mediaRoot, 'hls', 'u12'))).toBe(true);
    });

    test('rejects an unknown arriving stream key without registering anything', async () => {
        const resolveStreamKey = jest.fn(async () => null);
        const app = createApp({ resolveStreamKey });

        const response = await request(app).post('/ffmpeg/register').send({
            streamId: `fov_${'c'.repeat(43)}`,
            tracks: 1,
            audioTracks: 1
        });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Invalid stream key' });
        expect(spawnMock).not.toHaveBeenCalled();
        expect(ffmpegProcesses.size).toBe(0);
        expect(registeredStreams.size).toBe(0);
    });

    test('refuses to register into a u<id> folder without a key', async () => {
        const resolveStreamKey = jest.fn(async () => ({ userId: 12, streamId: 'u12' }));
        const app = createApp({ resolveStreamKey });

        const response = await request(app).post('/ffmpeg/register').send({
            streamId: 'u12',
            tracks: 1,
            audioTracks: 1
        });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Invalid stream key' });
        expect(resolveStreamKey).not.toHaveBeenCalled();
        expect(ffmpegProcesses.size).toBe(0);
    });

    test('refuses registration when no stream key is provided', async () => {
        const resolveStreamKey = jest.fn(async () => ({ userId: 12, streamId: 'u12' }));
        const app = createApp({ resolveStreamKey });

        const response = await request(app).post('/ffmpeg/register').send({
            tracks: 1,
            audioTracks: 1
        });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Invalid stream key' });
        expect(resolveStreamKey).not.toHaveBeenCalled();
        expect(spawnMock).not.toHaveBeenCalled();
        expect(ffmpegProcesses.size).toBe(0);
        expect(registeredStreams.size).toBe(0);
    });

    test('refuses legacy arbitrary stream ids and usernames', async () => {
        const resolveStreamKey = jest.fn(async () => ({ userId: 12, streamId: 'u12' }));
        const app = createApp({ resolveStreamKey });

        for (const streamId of ['FOVDemo', 'alice', 'stream-0', 'u12']) {
            const response = await request(app).post('/ffmpeg/register').send({
                streamId,
                tracks: 1,
                audioTracks: 1
            });

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Invalid stream key' });
        }

        expect(resolveStreamKey).not.toHaveBeenCalled();
        expect(spawnMock).not.toHaveBeenCalled();
        expect(ffmpegProcesses.size).toBe(0);
        expect(registeredStreams.size).toBe(0);
    });

    test('refuses malformed stream keys before querying the database', async () => {
        const resolveStreamKey = jest.fn(async () => ({ userId: 12, streamId: 'u12' }));
        const app = createApp({ resolveStreamKey });

        for (const streamId of [
            'fov_',
            'fov_short',
            `fov_${'a'.repeat(42)}`,
            `fov_${'a'.repeat(44)}`,
            `fov_${'a'.repeat(42)}!`,
            `FOV_${'a'.repeat(43)}`
        ]) {
            const response = await request(app).post('/ffmpeg/register').send({
                streamId,
                tracks: 1,
                audioTracks: 1
            });

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Invalid stream key' });
        }

        expect(resolveStreamKey).not.toHaveBeenCalled();
        expect(spawnMock).not.toHaveBeenCalled();
        expect(ffmpegProcesses.size).toBe(0);
    });

    test('refuses an invalid key on the debug registration endpoint', async () => {
        const resolveStreamKey = jest.fn(async () => ({ userId: 12, streamId: 'u12' }));
        const app = createApp({ resolveStreamKey });

        const response = await request(app).post('/ffmpeg/register/debug').send({
            streamId: 'debug-stream',
            tracks: 1,
            audioTracks: 1
        });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Invalid stream key' });
        expect(resolveStreamKey).not.toHaveBeenCalled();
        expect(spawnMock).not.toHaveBeenCalled();
        expect(registeredStreams.size).toBe(0);
    });

    test('refuses stop requests with an invalid key without touching the stream', async () => {
        const process = createProcess({ exitsOnSigint: true });
        spawnMock.mockReturnValue(process);
        const validKey = `fov_${'e'.repeat(43)}`;
        const resolveStreamKey = jest.fn(async (key) => (
            key === validKey ? { userId: 12, streamId: 'u12' } : null
        ));
        const app = createApp({ resolveStreamKey });

        await request(app).post('/ffmpeg/register').send({
            streamId: validKey,
            tracks: 1,
            audioTracks: 1
        });
        expect(registeredStreams.has('u12')).toBe(true);

        for (const streamId of ['u12', 'alice', `fov_${'z'.repeat(43)}`]) {
            const refused = await request(app).post('/ffmpeg/stop').send({ streamId });
            expect(refused.status).toBe(401);
            expect(refused.body).toEqual({ error: 'Invalid stream key' });
        }

        expect(process.kill).not.toHaveBeenCalled();
        expect(registeredStreams.has('u12')).toBe(true);
        expect(ffmpegProcesses.has('u12')).toBe(true);
    });

    test('resolves the arriving key when stopping an owned stream', async () => {
        const process = createProcess({ exitsOnSigint: true });
        spawnMock.mockReturnValue(process);
        const resolveStreamKey = jest.fn(async () => ({ userId: 12, streamId: 'u12' }));
        const app = createApp({ resolveStreamKey });
        const streamKey = `fov_${'d'.repeat(43)}`;

        await request(app).post('/ffmpeg/register').send({
            streamId: streamKey,
            tracks: 1,
            audioTracks: 1
        });
        expect(registeredStreams.has('u12')).toBe(true);

        const stopped = await request(app).post('/ffmpeg/stop').send({ streamId: streamKey });
        expect(stopped.status).toBe(200);
        expect(stopped.body.streamId).toBe('u12');
        expect(registeredStreams.has('u12')).toBe(false);
    });

    test('reports active, missing, and all stream status', async () => {
        const process = createProcess();
        spawnMock.mockReturnValue(process);
        const app = createApp();

        await request(app).post('/ffmpeg/register').send({ streamId: keyFor('status-stream'), tracks: 1, audioTracks: 1 });

        const active = await request(app).get('/ffmpeg/status').query({ streamId: 'status-stream' });
        expect(active.status).toBe(200);
        expect(active.body).toMatchObject({
            streamId: 'status-stream',
            status: 'active',
            running: true,
            pid: process.pid,
            srtUrl: expect.stringContaining(':9999?mode=caller')
        });

        const all = await request(app).get('/ffmpeg/status');
        expect(all.status).toBe(200);
        expect(all.body).toMatchObject({ totalStreams: 1, activeStreams: 1 });
        expect(all.body.streams['status-stream'].srtPort).toBe(9999);

        const missing = await request(app).get('/ffmpeg/status').query({ streamId: 'missing' });
        expect(missing.body).toEqual({ streamId: 'missing', status: 'not_found' });
    });

    test('handles stop requests for missing and registration-only streams', async () => {
        const app = createApp();

        const missingParameter = await request(app).post('/ffmpeg/stop').send({});
        expect(missingParameter.status).toBe(400);

        const missing = await request(app).post('/ffmpeg/stop').send({ streamId: keyFor('missing') });
        expect(missing.status).toBe(200);
        expect(missing.body).toEqual({ status: 'not_found', streamId: 'missing' });

        await request(app).post('/ffmpeg/register/debug').send({ streamId: keyFor('debug-stop'), tracks: 1, audioTracks: 1 });
        const stopped = await request(app).post('/ffmpeg/stop').send({ streamId: keyFor('debug-stop') });
        expect(stopped.status).toBe(200);
        expect(registeredStreams.has('debug-stop')).toBe(false);
    });

    test('sets cache headers for HLS playlists and segments', async () => {
        const playlistDir = path.join(mediaRoot, 'hls', 'headers');
        fs.mkdirSync(playlistDir, { recursive: true });
        fs.writeFileSync(path.join(playlistDir, 'playlist.m3u8'), '#EXTM3U\n');
        fs.writeFileSync(path.join(playlistDir, 'segment.ts'), 'segment');
        const app = createApp();

        const playlist = await request(app).get('/api/hls/headers/playlist.m3u8');
        expect(playlist.status).toBe(200);
        expect(playlist.headers['cache-control']).toContain('no-cache');

        const segment = await request(app).get('/api/hls/headers/segment.ts');
        expect(segment.status).toBe(200);
        expect(segment.headers['cache-control']).toBe('public, max-age=30');
    });

    test('an old process exit cannot remove a replacement registration or HLS folder', async () => {
        const oldProcess = createProcess({ exitsOnSigint: true });
        spawnMock.mockReturnValue(oldProcess);
        const app = createApp();

        await request(app).post('/ffmpeg/register').send({ streamId: keyFor('same-id'), tracks: 1, audioTracks: 1 });
        await request(app).post('/ffmpeg/stop').send({ streamId: keyFor('same-id') });

        const newProcess = createProcess();
        spawnMock.mockReturnValue(newProcess);
        await request(app).post('/ffmpeg/register').send({ streamId: keyFor('same-id'), tracks: 1, audioTracks: 1 });
        const hlsFolder = path.join(mediaRoot, 'hls', 'same-id');

        oldProcess.emit('exit', 0, 'SIGINT');

        expect(ffmpegProcesses.get('same-id').process).toBe(newProcess);
        expect(registeredStreams.get('same-id').port).toBe(9999);
        expect(fs.existsSync(hlsFolder)).toBe(true);
    });

    test('reuses a port after a stream stops and rejects exhausted allocation', async () => {
        const app = createApp();
        const processes = [];

        for (let index = 0; index < 12; index++) {
            const process = createProcess();
            processes.push(process);
            spawnMock.mockReturnValueOnce(process);
            const response = await request(app).post('/ffmpeg/register').send({
                streamId: keyFor(`stream-${index}`),
                tracks: 1,
                audioTracks: 1
            });
            expect(response.status).toBe(200);
            expect(response.body.srtUrl).toContain(`:${9999 + index}?`);
        }

        const exhausted = await request(app).post('/ffmpeg/register').send({ streamId: keyFor('exhausted'), tracks: 1, audioTracks: 1 });
        expect(exhausted.status).toBe(503);

        processes[0].kill.mockImplementation(signal => {
            processes[0].killed = true;
            if (signal === 'SIGINT') {
                processes[0].emit('exit', 0, signal);
            }
        });
        const stopped = await request(app).post('/ffmpeg/stop').send({ streamId: keyFor('stream-0') });
        expect(stopped.status).toBe(200);

        const replacement = createProcess();
        spawnMock.mockReturnValue(replacement);
        const reused = await request(app).post('/ffmpeg/register').send({ streamId: keyFor('reused'), tracks: 1, audioTracks: 1 });
        expect(reused.status).toBe(200);
        expect(reused.body.srtUrl).toContain(':9999?');
    });

    test('does not acknowledge registration before the SRT listener is ready', async () => {
        const process = createProcess();
        spawnMock.mockReturnValue(process);
        let releaseListener;
        const listenerReady = new Promise(resolve => {
            releaseListener = resolve;
        });
        const isSrtListenerReady = jest.fn(() => listenerReady);
        const app = createApp({ isSrtListenerReady });

        let settled = false;
        const pending = request(app).post('/ffmpeg/register').send({
            streamId: keyFor('slow-listener'),
            tracks: 1,
            audioTracks: 1
        }).then(response => {
            settled = true;
            return response;
        });

        await new Promise(resolve => setTimeout(resolve, 40));
        expect(isSrtListenerReady).toHaveBeenCalledWith(9999, expect.objectContaining({
            timeoutMs: expect.any(Number),
            isAlive: expect.any(Function)
        }));
        expect(settled).toBe(false);
        expect(registeredStreams.get('slow-listener')).toMatchObject({ port: 9999, pending: true });

        releaseListener(true);
        const response = await pending;
        expect(response.status).toBe(200);
        expect(registeredStreams.get('slow-listener').pending).toBe(false);
    });

    test('returns 503 and cleans up when the SRT listener never binds', async () => {
        const process = createProcess({ exitsOnSigint: true });
        spawnMock.mockReturnValue(process);
        const isSrtListenerReady = jest.fn(async () => false);
        const app = createApp({ isSrtListenerReady, srtReadyTimeoutMs: 25 });

        const response = await request(app).post('/ffmpeg/register').send({
            streamId: keyFor('not-ready'),
            tracks: 1,
            audioTracks: 1
        });

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({
            error: 'SRT listener did not become ready',
            streamId: 'not-ready',
            port: 9999
        });
        expect(isSrtListenerReady).toHaveBeenCalledWith(9999, expect.objectContaining({ timeoutMs: 25 }));
        expect(process.kill).toHaveBeenCalledWith('SIGINT');
        expect(ffmpegProcesses.has('not-ready')).toBe(false);
        expect(registeredStreams.has('not-ready')).toBe(false);
        expect(fs.existsSync(path.join(mediaRoot, 'hls', 'not-ready'))).toBe(false);
    });

    test('normalizes unreachable SRT host names and formats IPv6 hosts', async () => {
        const originalHost = process.env.SRT_URL;
        const cases = [
            ['localhost', '127.0.0.1'],
            ['web-fov-backend-1', '127.0.0.1'],
            ['::1', '127.0.0.1'],
            ['api.example.com', 'api.example.com'],
            ['192.168.1.10', '192.168.1.10'],
            ['2001:db8::1', '[2001:db8::1]']
        ];
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

        try {
            for (let index = 0; index < cases.length; index++) {
                const [configuredHost, expectedHost] = cases[index];
                process.env.SRT_URL = configuredHost;
                spawnMock.mockReturnValue(createProcess());

                const app = createApp();
                const response = await request(app).post('/ffmpeg/register').send({
                    streamId: keyFor(`host-${index}`),
                    tracks: 1,
                    audioTracks: 1
                });

                expect(response.status).toBe(200);
                expect(response.body.srtUrl).toContain(`srt://${expectedHost}:${9999 + index}?`);
            }
        } finally {
            warnSpy.mockRestore();
            if (originalHost === undefined) {
                delete process.env.SRT_URL;
            } else {
                process.env.SRT_URL = originalHost;
            }
        }
    });

    test('detects an occupied UDP port and waits for it to become ready', async () => {
        const socket = dgram.createSocket('udp4');
        await new Promise((resolve, reject) => {
            socket.once('error', reject);
            socket.bind({ address: '0.0.0.0', port: 0 }, resolve);
        });
        const occupiedPort = socket.address().port;

        expect(await isUdpPortBound(occupiedPort)).toBe(true);
        expect(await waitForSrtListener(occupiedPort, { timeoutMs: 100 })).toBe(true);
        await new Promise(resolve => socket.close(resolve));

        const freeSocket = dgram.createSocket('udp4');
        await new Promise(resolve => freeSocket.bind({ address: '0.0.0.0', port: 0 }, resolve));
        const freePort = freeSocket.address().port;
        await new Promise(resolve => freeSocket.close(resolve));

        expect(await isUdpPortBound(freePort)).toBe(false);
        expect(await waitForSrtListener(freePort, { timeoutMs: 25 })).toBe(false);
    });
});