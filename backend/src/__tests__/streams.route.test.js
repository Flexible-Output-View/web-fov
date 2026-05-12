import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

const dbMock = {
    query: jest.fn()
};

jest.unstable_mockModule('../db.js', () => ({
    default: dbMock
}));

const { default: db } = await import('../db.js');
const { default: streamsRouter } = await import('../routes/streams.js');

describe('Streams Routes', () => {
    let app;
    const hlsRoot = path.join(process.cwd(), 'media', 'hls');
    const streamId = 'route-test-stream';
    const streamDir = path.join(hlsRoot, streamId);
    const trackDir = path.join(streamDir, 'track1');

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/', streamsRouter);
        app.use((err, req, res, next) => {
            res.status(500).json({ error: err.message });
        });
        jest.clearAllMocks();
    });

    afterEach(() => {
        if (fs.existsSync(streamDir)) {
            fs.rmSync(streamDir, { recursive: true, force: true });
        }
    });

    test('GET / should return all streams from the database', async () => {
        const mockStreams = [
            {
                id: '1',
                streamer: 'tester',
                title: 'Test Stream',
                category_id: 1,
                viewers: 42,
                thumbnail_url: 'thumb.jpg',
                avatar_url: 'avatar.jpg',
                is_live: true
            }
        ];

        db.query.mockResolvedValue(mockStreams);

        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockStreams);
        expect(db.query).toHaveBeenCalledWith(
            'SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC'
        );
    });

    test('GET / should return 500 when database query fails', async () => {
        db.query.mockRejectedValue(new Error('Database failed'));

        const response = await request(app).get('/');

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error', 'Database failed');
    });

    test('GET /:id should return a stream by id', async () => {
        const mockStream = {
            id: 'route-test-stream',
            streamer: 'tester',
            title: 'Test Stream',
            category_id: 1,
            viewers: 42,
            thumbnail_url: 'thumb.jpg',
            avatar_url: 'avatar.jpg',
            is_live: true
        };

        db.query.mockResolvedValue([mockStream]);

        const response = await request(app).get(`/${streamId}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockStream);
        expect(db.query).toHaveBeenCalledWith(
            'SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams WHERE id = ?',
            [streamId]
        );
    });

    test('GET /:id should return 404 when stream is not found', async () => {
        db.query.mockResolvedValue([]);

        const response = await request(app).get('/missing-id');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error', 'Stream not found');
    });

    test('GET /:id/hls should return a constructed HLS URL', async () => {
        const response = await request(app).get(`/${streamId}/hls`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('hls');
        expect(response.body.hls).toContain(`/api/hls/live/${streamId}/playlist.m3u8`);
    });

    test('GET /available should return available streams from HLS and database metadata', async () => {
        fs.mkdirSync(trackDir, { recursive: true });
        fs.writeFileSync(path.join(trackDir, 'playlist.m3u8'), '#EXTM3U\nsegment1.ts\nsegment2.ts');

        db.query.mockImplementation(async (sql, params) => {
            if (params && params[0] === streamId) {
                return [
                    {
                        id: streamId,
                        title: 'Route Test Stream',
                        viewers: 100,
                        avatar_url: 'avatar.png',
                        thumbnail_url: 'thumb.png',
                        category: 'Testing'
                    }
                ];
            }
            return [];
        });

        const response = await request(app).get('/available');

        expect(response.status).toBe(200);
        const stream = response.body.find((item) => item.streamId === streamId);
        expect(stream).toBeDefined();
        expect(stream.trackCount).toBe(1);
        expect(stream.tracks[0].videoUrl).toContain(`/api/hls/${streamId}/track1/playlist.m3u8`);
        expect(stream.title).toBe('Route Test Stream');
    });

    test('GET /available should include a stream even when DB query fails for that stream', async () => {
        fs.mkdirSync(trackDir, { recursive: true });
        fs.writeFileSync(path.join(trackDir, 'playlist.m3u8'), '#EXTM3U\nsegment1.ts\nsegment2.ts');

        db.query.mockRejectedValue(new Error('DB error'));

        const response = await request(app).get('/available');

        expect(response.status).toBe(200);
        const stream = response.body.find((item) => item.streamId === streamId);
        expect(stream).toBeDefined();
        expect(stream.title).toBe('');
        expect(stream.trackCount).toBe(1);
    });

    test('GET /:id should return 500 when the database query fails', async () => {
        db.query.mockRejectedValue(new Error('DB failure'));

        const response = await request(app).get(`/${streamId}`);

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error');
    });

    test('GET /available should return 500 when HLS directory read fails', async () => {
        const originalReaddir = fs.readdirSync;
        jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
            throw new Error('Filesystem failure');
        });

        const response = await request(app).get('/available');

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error');

        fs.readdirSync.mockRestore();
        fs.readdirSync = originalReaddir;
    });

    test('GET /:id/hls should call next on request errors', async () => {
        const layer = streamsRouter.stack.find((layer) => layer.route?.path === '/:id/hls');
        const handler = layer.route.stack[0].handle;
        const fakeReq = {
            params: { id: streamId },
            get: () => { throw new Error('host failure'); },
            protocol: 'http'
        };
        const fakeRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
        };
        const next = jest.fn();

        await handler(fakeReq, fakeRes, next);

        expect(next).toHaveBeenCalled();
    });
});
