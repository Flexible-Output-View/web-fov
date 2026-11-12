import express from 'express';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { signToken } from '../utils/auth.js';
import { viewerPresence } from '../viewerPresence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mediaRoot = path.join(__dirname, 'test-media');
const hlsRoot = path.join(mediaRoot, 'hls');

const dbQuery = jest.fn();
const readdirSync = jest.fn();
const existsSync = jest.fn(() => true);
const buildSeparatedAvailableTracks = jest.fn();
const probeTrackHasVideo = jest.fn();
const probeTrackHasAudio = jest.fn();
const sortTrackIds = jest.fn(trackIds => [...trackIds].sort((a, b) => Number(a) - Number(b)));

process.env.MEDIA_ROOT = mediaRoot;
delete process.env.API_HOSTNAME;
delete process.env.API_PROTOCOL;

jest.unstable_mockModule('../db.js', () => ({
    default: { query: dbQuery }
}));
jest.unstable_mockModule('fs', () => ({
    default: { readdirSync, existsSync }
}));
jest.unstable_mockModule('../mediaServer.mjs', () => ({
    ffmpegProcesses: new Map()
}));
jest.unstable_mockModule('../streamTrackUtils.js', () => ({
    buildSeparatedAvailableTracks,
    probeTrackHasVideo,
    probeTrackHasAudio,
    sortTrackIds
}));

const { default: streamsRouter } = await import('../routes/streams.js');

function createApp(ioMock) {
    const app = express();
    app.use(express.json());
    if (ioMock) {
        app.set('io', ioMock);
    }
    app.use('/', streamsRouter);
    app.use((err, req, res, _next) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

function setDirectoryEntries(entries) {
    readdirSync.mockImplementation(directory => {
        if (directory === hlsRoot) {
            return entries;
        }
        return [{ name: '10', isDirectory: () => true }, { name: '2', isDirectory: () => true }];
    });
}

function buildSeparatedTrack(trackId, name, streamId, variantId, host, type) {
    const isVideo = type === 'video';
    return {
        trackId,
        name,
        videoUrl: `http://${host}/api/hls/${streamId}/${variantId}/playlist.m3u8`,
        isVideo,
        isAudio: !isVideo
    };
}

describe('Streams Routes', () => {
    let consoleErrorSpy;
    let consoleLogSpy;

    beforeAll(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
        consoleLogSpy.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        viewerPresence.clear();
        existsSync.mockReturnValue(true);
        buildSeparatedAvailableTracks.mockReturnValue(null);
        probeTrackHasVideo.mockResolvedValue(true);
        probeTrackHasAudio.mockResolvedValue(true);
        setDirectoryEntries([]);
        delete process.env.API_HOSTNAME;
        delete process.env.API_PROTOCOL;
    });

    test('lists streams from the database', async () => {
        const rows = [{ id: 1, title: 'Live now' }];
        dbQuery.mockResolvedValue(rows);

        const response = await request(createApp()).get('/');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(rows);
        expect(dbQuery).toHaveBeenCalledWith(
            'SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC'
        );
    });

    test('returns an empty list when no streams exist', async () => {
        dbQuery.mockResolvedValue([]);

        const response = await request(createApp()).get('/');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test('returns every stream when several streams exist', async () => {
        const rows = [
            { id: 1, title: 'Most viewed' },
            { id: 2, title: 'Also live' }
        ];
        dbQuery.mockResolvedValue(rows);

        const response = await request(createApp()).get('/');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(rows);
    });

    test('returns a stream by id and handles missing streams', async () => {
        dbQuery.mockResolvedValueOnce([{ id: 4, title: 'Found' }]);
        const found = await request(createApp()).get('/4');
        expect(found.status).toBe(200);
        expect(found.body).toEqual({ id: 4, title: 'Found' });
        expect(dbQuery).toHaveBeenCalledWith(
            expect.stringContaining('WHERE LOWER(u.username) = LOWER(s.streamer)'),
            ['4']
        );

        dbQuery.mockResolvedValueOnce([]);
        const missing = await request(createApp()).get('/99');
        expect(missing.status).toBe(404);
        expect(missing.body).toEqual({ error: 'Stream not found' });

        const invalid = await request(createApp()).get('/not-a-number');
        expect(invalid.status).toBe(404);
        expect(invalid.body).toEqual({ error: 'Stream not found' });
    });

    test('returns an HLS URL using the request host and protocol', async () => {
        const response = await request(createApp()).get('/abc/hls').set('Host', 'stream.example.test');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            hls: 'http://stream.example.test/api/hls/live/abc/playlist.m3u8'
        });
    });

    test('builds available streams with separated tracks and database metadata', async () => {
        setDirectoryEntries([
            { name: '12', isDirectory: () => true },
            { name: '2', isDirectory: () => true },
            { name: 'live', isDirectory: () => true }
        ]);
        buildSeparatedAvailableTracks.mockImplementation((streamId, _trackDirs, _url) => {
            if (streamId === '12') {
                return [
                    buildSeparatedTrack('v:0', 'Main Cam', '12', '2', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:0', 'Mic', '12', '2', 'edge.example.test:8080', 'audio'),
                    buildSeparatedTrack('v:1', 'Side Cam', '12', '10', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:1', 'Game Audio', '12', '10', 'edge.example.test:8080', 'audio')
                ];
            }
            if (streamId === '2') {
                return [
                    buildSeparatedTrack('v:0', 'Cam', '2', '2', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:0', 'Audio', '2', '2', 'edge.example.test:8080', 'audio'),
                    buildSeparatedTrack('v:1', 'Cam 2', '2', '10', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:1', 'Audio 2', '2', '10', 'edge.example.test:8080', 'audio')
                ];
            }
            return [
                buildSeparatedTrack('v:0', 'Live Cam', 'live', '2', 'edge.example.test:8080', 'video'),
                buildSeparatedTrack('a:0', 'Live Audio', 'live', '2', 'edge.example.test:8080', 'audio'),
                buildSeparatedTrack('v:1', 'Live Cam 2', 'live', '10', 'edge.example.test:8080', 'video'),
                buildSeparatedTrack('a:1', 'Live Audio 2', 'live', '10', 'edge.example.test:8080', 'audio')
            ];
        });
        dbQuery.mockResolvedValueOnce([{
            streamer: 'DJ Test',
            streamer_username: 'dj_test',
            title: 'Concert',
            category: 'Music',
            viewers: 123,
            avatar_url: 'avatar.png',
            thumbnail_url: 'thumb.png'
        }]).mockResolvedValueOnce([]);

        const response = await request(createApp()).get('/available').set('Host', 'edge.example.test:8080');

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers.pragma).toBe('no-cache');
        expect(response.body).toEqual([
            {
                streamId: '12',
                trackCount: 4,
                tracks: [
                    buildSeparatedTrack('v:0', 'Main Cam', '12', '2', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:0', 'Mic', '12', '2', 'edge.example.test:8080', 'audio'),
                    buildSeparatedTrack('v:1', 'Side Cam', '12', '10', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:1', 'Game Audio', '12', '10', 'edge.example.test:8080', 'audio')
                ],
                title: 'Concert',
                description: '',
                visibility: 'public',
                category: 'Music',
                viewers: 123,
                streamer: 'DJ Test',
                streamerUsername: 'dj_test',
                avatarUrl: 'avatar.png',
                thumbnailUrl: 'thumb.png'
            },
            {
                streamId: '2',
                trackCount: 4,
                tracks: [
                    buildSeparatedTrack('v:0', 'Cam', '2', '2', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:0', 'Audio', '2', '2', 'edge.example.test:8080', 'audio'),
                    buildSeparatedTrack('v:1', 'Cam 2', '2', '10', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:1', 'Audio 2', '2', '10', 'edge.example.test:8080', 'audio')
                ],
                title: '',
                description: '',
                visibility: 'public',
                category: '',
                viewers: 0,
                streamer: '',
                streamerUsername: null,
                avatarUrl: '',
                thumbnailUrl: ''
            },
            {
                streamId: 'live',
                trackCount: 4,
                tracks: [
                    buildSeparatedTrack('v:0', 'Live Cam', 'live', '2', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:0', 'Live Audio', 'live', '2', 'edge.example.test:8080', 'audio'),
                    buildSeparatedTrack('v:1', 'Live Cam 2', 'live', '10', 'edge.example.test:8080', 'video'),
                    buildSeparatedTrack('a:1', 'Live Audio 2', 'live', '10', 'edge.example.test:8080', 'audio')
                ],
                title: '',
                description: '',
                visibility: 'public',
                category: '',
                viewers: 0,
                streamer: '',
                streamerUsername: null,
                avatarUrl: '',
                thumbnailUrl: ''
            }
        ]);
        expect(buildSeparatedAvailableTracks).toHaveBeenCalledTimes(3);
        expect(probeTrackHasVideo).not.toHaveBeenCalled();
        expect(probeTrackHasAudio).not.toHaveBeenCalled();
    });

    test('falls back to probing variants when metadata is unavailable', async () => {
        setDirectoryEntries([{ name: '7', isDirectory: () => true }]);
        dbQuery.mockResolvedValueOnce([]);

        const response = await request(createApp()).get('/available').set('Host', 'edge.example.test:8080');

        expect(response.status).toBe(200);
        expect(response.body[0].tracks).toEqual([
            {
                trackId: 'v:0',
                name: 'Video 0',
                videoUrl: 'http://edge.example.test:8080/api/hls/7/2/playlist.m3u8',
                isVideo: true,
                isAudio: false
            },
            {
                trackId: 'a:0',
                name: 'Audio 0',
                videoUrl: 'http://edge.example.test:8080/api/hls/7/2/playlist.m3u8',
                isVideo: false,
                isAudio: true
            },
            {
                trackId: 'v:1',
                name: 'Video 1',
                videoUrl: 'http://edge.example.test:8080/api/hls/7/10/playlist.m3u8',
                isVideo: true,
                isAudio: false
            },
            {
                trackId: 'a:1',
                name: 'Audio 1',
                videoUrl: 'http://edge.example.test:8080/api/hls/7/10/playlist.m3u8',
                isVideo: false,
                isAudio: true
            }
        ]);
        expect(probeTrackHasVideo).toHaveBeenCalledTimes(2);
        expect(probeTrackHasAudio).toHaveBeenCalledTimes(2);
    });

    test('continues with tracks when stream metadata lookup fails', async () => {
        setDirectoryEntries([{ name: '7', isDirectory: () => true }]);
        dbQuery.mockRejectedValue(new Error('database unavailable'));

        const response = await request(createApp()).get('/available');

        expect(response.status).toBe(200);
        expect(response.body[0]).toMatchObject({
            streamId: '7',
            title: '',
            category: '',
            viewers: 0
        });
    });

    test('forwards HLS directory errors to error middleware', async () => {
        readdirSync.mockImplementation(() => {
            throw new Error('HLS directory unavailable');
        });

        const response = await request(createApp()).get('/available');

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'HLS directory unavailable' });
    });

    test('mounts the authenticated stream settings under /me', async () => {
        const response = await request(createApp()).get('/me');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Authentication required' });
    });

    describe('user streams and visibility', () => {
        function userStreamRow(overrides = {}) {
            return {
                user_id: 12,
                username: 'alice',
                title: 'Ranked grind',
                description: 'Climbing the ladder',
                visibility: 'public',
                category: 'Just Chatting',
                avatar_url: 'avatar.png',
                thumbnail_url: 'thumb.png',
                ...overrides
            };
        }

        test('enriches u<id> folders from the user stream settings', async () => {
            setDirectoryEntries([{ name: 'u12', isDirectory: () => true }]);
            dbQuery.mockResolvedValue([userStreamRow()]);

            const response = await request(createApp()).get('/available');

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0]).toMatchObject({
                streamId: 'u12',
                trackCount: 4,
                title: 'Ranked grind',
                description: 'Climbing the ladder',
                visibility: 'public',
                category: 'Just Chatting',
                streamer: 'alice',
                streamerUsername: 'alice',
                avatarUrl: 'avatar.png',
                thumbnailUrl: 'thumb.png'
            });
            expect(dbQuery).toHaveBeenCalledWith(
                expect.stringContaining('FROM stream_settings ss'),
                [12]
            );
        });

        test('hides unlisted and private streams from discovery', async () => {
            setDirectoryEntries([
                { name: 'u12', isDirectory: () => true },
                { name: 'u13', isDirectory: () => true }
            ]);
            dbQuery
                .mockResolvedValueOnce([userStreamRow({ user_id: 12, visibility: 'unlisted' })])
                .mockResolvedValueOnce([userStreamRow({ user_id: 13, visibility: 'private' })]);

            const anonymous = await request(createApp()).get('/available');
            expect(anonymous.body).toEqual([]);

            dbQuery
                .mockResolvedValueOnce([userStreamRow({ user_id: 12, visibility: 'unlisted' })])
                .mockResolvedValueOnce([userStreamRow({ user_id: 13, visibility: 'private' })]);

            const owner = await request(createApp())
                .get('/available')
                .set('Authorization', `Bearer ${signToken(13)}`);

            expect(owner.body).toHaveLength(1);
            expect(owner.body[0].streamId).toBe('u13');
        });

        test('does not expose a user folder without settings', async () => {
            setDirectoryEntries([{ name: 'u99', isDirectory: () => true }]);
            dbQuery.mockResolvedValue([]);

            const response = await request(createApp()).get('/available');

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('serves a public stream through the direct-link endpoint', async () => {
            dbQuery.mockResolvedValue([userStreamRow()]);

            const response = await request(createApp()).get('/u12/live');

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                streamId: 'u12',
                title: 'Ranked grind',
                visibility: 'public'
            });
        });

        test('serves an unlisted stream by direct link', async () => {
            dbQuery.mockResolvedValue([userStreamRow({ visibility: 'unlisted' })]);

            const response = await request(createApp()).get('/u12/live');

            expect(response.status).toBe(200);
            expect(response.body.visibility).toBe('unlisted');
        });

        test('restricts a private stream to its owner', async () => {
            dbQuery.mockResolvedValue([userStreamRow({ visibility: 'private' })]);

            const anonymous = await request(createApp()).get('/u12/live');
            expect(anonymous.status).toBe(404);

            const otherUser = await request(createApp())
                .get('/u12/live')
                .set('Authorization', `Bearer ${signToken(99)}`);
            expect(otherUser.status).toBe(404);

            const owner = await request(createApp())
                .get('/u12/live')
                .set('Authorization', `Bearer ${signToken(12)}`);
            expect(owner.status).toBe(200);
            expect(owner.body.title).toBe('Ranked grind');
        });

        test('returns 404 for an offline user stream', async () => {
            existsSync.mockReturnValue(false);

            const response = await request(createApp()).get('/u12/live');

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Stream not found' });
        });
    });

    describe('viewer presence', () => {
        test('counts an anonymous viewer on heartbeat', async () => {
            const response = await request(createApp())
                .post('/1/viewers/heartbeat')
                .send({ visitorId: 'visitor-a' });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                streamId: '1',
                total: 1,
                authenticated: 0,
                anonymous: 1
            });
            expect(typeof response.body.updatedAt).toBe('string');
        });

        test('never double counts a visitor sending repeated heartbeats', async () => {
            const app = createApp();
            await request(app).post('/1/viewers/heartbeat').send({ visitorId: 'visitor-a' });
            const response = await request(app).post('/1/viewers/heartbeat').send({ visitorId: 'visitor-a' });

            expect(response.body.total).toBe(1);
        });

        test('counts a valid bearer token as an authenticated viewer', async () => {
            const token = signToken(42);

            const response = await request(createApp())
                .post('/1/viewers/heartbeat')
                .set('Authorization', `Bearer ${token}`)
                .send({ visitorId: 'visitor-a' });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ total: 1, authenticated: 1, anonymous: 0 });
        });

        test('treats an invalid bearer token as anonymous', async () => {
            const response = await request(createApp())
                .post('/1/viewers/heartbeat')
                .set('Authorization', 'Bearer not-a-token')
                .send({ visitorId: 'visitor-a' });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ total: 1, authenticated: 0, anonymous: 1 });
        });

        test('broadcasts the updated count to the stream room', async () => {
            const emitted = [];
            const ioMock = {
                to: jest.fn(() => ({
                    emit: jest.fn((event, payload) => emitted.push({ event, payload }))
                }))
            };

            const response = await request(createApp(ioMock))
                .post('/1/viewers/heartbeat')
                .send({ visitorId: 'visitor-a' });

            expect(ioMock.to).toHaveBeenCalledWith('stream:1');
            expect(emitted).toHaveLength(1);
            expect(emitted[0].event).toBe('viewer-count');
            expect(emitted[0].payload).toEqual(response.body);
        });

        test('removes a viewer on leave and broadcasts the new count', async () => {
            const emitted = [];
            const ioMock = {
                to: jest.fn(() => ({
                    emit: jest.fn((event, payload) => emitted.push({ event, payload }))
                }))
            };
            const app = createApp(ioMock);

            await request(app).post('/1/viewers/heartbeat').send({ visitorId: 'visitor-a' });
            const leave = await request(app).post('/1/viewers/leave').send({ visitorId: 'visitor-a' });

            expect(leave.status).toBe(204);
            expect(viewerPresence.getCounts('1').total).toBe(0);
            expect(emitted[emitted.length - 1]).toMatchObject({
                event: 'viewer-count',
                payload: { total: 0, authenticated: 0, anonymous: 0 }
            });
        });

        test('rejects a missing or invalid visitor id', async () => {
            const missing = await request(createApp()).post('/1/viewers/heartbeat').send({});
            expect(missing.status).toBe(400);
            expect(missing.body).toEqual({ error: 'Invalid visitor id' });

            const invalid = await request(createApp())
                .post('/1/viewers/heartbeat')
                .send({ visitorId: 'x'.repeat(121) });
            expect(invalid.status).toBe(400);

            const leave = await request(createApp()).post('/1/viewers/leave').send({});
            expect(leave.status).toBe(400);
        });

        test('rejects an invalid stream id', async () => {
            const longStreamId = encodeURIComponent('x'.repeat(121));

            const heartbeat = await request(createApp())
                .post(`/${longStreamId}/viewers/heartbeat`)
                .send({ visitorId: 'visitor-a' });
            expect(heartbeat.status).toBe(400);
            expect(heartbeat.body).toEqual({ error: 'Invalid stream id' });

            const leave = await request(createApp())
                .post(`/${longStreamId}/viewers/leave`)
                .send({ visitorId: 'visitor-a' });
            expect(leave.status).toBe(400);
        });
    });
});
