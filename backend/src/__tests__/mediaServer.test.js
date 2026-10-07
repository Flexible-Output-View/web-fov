import express from 'express';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import request from 'supertest';
import { jest } from '@jest/globals';

const mediaRoot = path.join(process.cwd(), 'src', '__tests__', 'media-server-test-media');
const spawnMock = jest.fn();
const execFileMock = jest.fn();

process.env.MEDIA_ROOT = mediaRoot;
process.env.SRT_PORT = '9999';

jest.unstable_mockModule('child_process', () => ({ spawn: spawnMock, execFile: execFileMock }));

const {
    createMediaRoutes,
    ffmpegProcesses,
    registeredStreams,
    killFFmpegProcess
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

function createApp() {
    const app = express();
    app.use(createMediaRoutes());
    return app;
}

describe('Media server lifecycle', () => {
    beforeEach(() => {
        jest.useRealTimers();
        spawnMock.mockReset();
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
            streamId: 'spawn-error',
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
            streamId: 'replacement',
            tracks: 1,
            audioTracks: 1
        });

        expect(reused.body.srtUrl).toContain(':9999?');
    });

    test('validates registration requests and supports debug registration', async () => {
        const app = createApp();

        const invalid = await request(app).post('/ffmpeg/register').send({ tracks: 0, audioTracks: 1 });
        expect(invalid.status).toBe(400);

        const debug = await request(app).post('/ffmpeg/register/debug').send({
            streamId: 'debug-stream',
            tracks: 1,
            audioTracks: 1
        });
        expect(debug.status).toBe(200);
        expect(debug.body.srtUrl).toBe('srt://0.0.0.0:5555?mode=listener');

        const duplicate = await request(app).post('/ffmpeg/register/debug').send({
            streamId: 'debug-stream',
            tracks: 1,
            audioTracks: 1
        });
        expect(duplicate.status).toBe(409);
    });

    test('reports active, missing, and all stream status', async () => {
        const process = createProcess();
        spawnMock.mockReturnValue(process);
        const app = createApp();

        await request(app).post('/ffmpeg/register').send({ streamId: 'status-stream', tracks: 1, audioTracks: 1 });

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

        const missing = await request(app).post('/ffmpeg/stop').send({ streamId: 'missing' });
        expect(missing.status).toBe(200);
        expect(missing.body).toEqual({ status: 'not_found', streamId: 'missing' });

        await request(app).post('/ffmpeg/register/debug').send({ streamId: 'debug-stop', tracks: 1, audioTracks: 1 });
        const stopped = await request(app).post('/ffmpeg/stop').send({ streamId: 'debug-stop' });
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

        await request(app).post('/ffmpeg/register').send({ streamId: 'same-id', tracks: 1, audioTracks: 1 });
        await request(app).post('/ffmpeg/stop').send({ streamId: 'same-id' });

        const newProcess = createProcess();
        spawnMock.mockReturnValue(newProcess);
        await request(app).post('/ffmpeg/register').send({ streamId: 'same-id', tracks: 1, audioTracks: 1 });
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
                streamId: `stream-${index}`,
                tracks: 1,
                audioTracks: 1
            });
            expect(response.status).toBe(200);
            expect(response.body.srtUrl).toContain(`:${9999 + index}?`);
        }

        const exhausted = await request(app).post('/ffmpeg/register').send({ streamId: 'exhausted', tracks: 1, audioTracks: 1 });
        expect(exhausted.status).toBe(503);

        processes[0].kill.mockImplementation(signal => {
            processes[0].killed = true;
            if (signal === 'SIGINT') {
                processes[0].emit('exit', 0, signal);
            }
        });
        const stopped = await request(app).post('/ffmpeg/stop').send({ streamId: 'stream-0' });
        expect(stopped.status).toBe(200);

        const replacement = createProcess();
        spawnMock.mockReturnValue(replacement);
        const reused = await request(app).post('/ffmpeg/register').send({ streamId: 'reused', tracks: 1, audioTracks: 1 });
        expect(reused.status).toBe(200);
        expect(reused.body.srtUrl).toContain(':9999?');
    });
});