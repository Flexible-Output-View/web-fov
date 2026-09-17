import express from 'express';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mediaRoot = path.join(__dirname, 'test-media');
const hlsRoot = path.join(mediaRoot, 'hls');

const dbQuery = jest.fn();
const readdirSync = jest.fn();
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
    default: { readdirSync }
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

function createApp() {
    const app = express();
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
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
        consoleLogSpy.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
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
        expect(response.body).toEqual(rows[0]);
        expect(dbQuery).toHaveBeenCalledWith(
            'SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC'
        );
    });

    test('returns a stream by id and handles missing streams', async () => {
        dbQuery.mockResolvedValueOnce([{ id: 4, title: 'Found' }]);
        const found = await request(createApp()).get('/4');
        expect(found.status).toBe(200);
        expect(found.body).toEqual({ id: 4, title: 'Found' });
        expect(dbQuery).toHaveBeenCalledWith(
            'SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams WHERE id = ?',
            ['4']
        );

        dbQuery.mockResolvedValueOnce([]);
        const missing = await request(createApp()).get('/99');
        expect(missing.status).toBe(404);
        expect(missing.body).toEqual({ error: 'Stream not found' });
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
        buildSeparatedAvailableTracks.mockImplementation((streamId, trackDirs, url) => {
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
                category: 'Music',
                viewers: 123,
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
                category: '',
                viewers: 0,
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
                category: '',
                viewers: 0,
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
});
