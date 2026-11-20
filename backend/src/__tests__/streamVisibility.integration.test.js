import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

/**
 * End-to-end visibility check using the real filesystem track builder.
 *
 * Existing route tests mock `buildTracks`; this test writes an actual HLS
 * folder (with `meta.json`) so we prove that an unlisted stream, while absent
 * from `/available`, still returns usable tracks through its direct link.
 */

const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fov-visibility-'));
const previousMediaRoot = process.env.MEDIA_ROOT;
const previousApiHostname = process.env.API_HOSTNAME;
const previousApiProtocol = process.env.API_PROTOCOL;
const hlsRoot = path.join(mediaRoot, 'hls');
const streamDir = path.join(hlsRoot, 'u12');

fs.mkdirSync(path.join(streamDir, '0'), { recursive: true });
fs.mkdirSync(path.join(streamDir, '1'), { recursive: true });
fs.writeFileSync(
    path.join(streamDir, 'meta.json'),
    JSON.stringify({ tracksV: 1, tracksA: 1, videoTrackNames: ['Cam'], audioTrackNames: ['Mic'] })
);

process.env.MEDIA_ROOT = mediaRoot;
delete process.env.API_HOSTNAME;
delete process.env.API_PROTOCOL;

const dbQuery = jest.fn();
const streamRow = {
    user_id: 12,
    username: 'Alice',
    title: 'Unlisted link',
    description: 'Only reachable by URL',
    visibility: 'unlisted',
    category: 'Just Chatting',
    avatar_url: '',
    thumbnail_url: ''
};

jest.unstable_mockModule('../db.js', () => ({
    default: { query: dbQuery }
}));

const { default: streamsRouter } = await import('../routes/streams.js');

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/', streamsRouter);
    return app;
}

describe('stream visibility with real HLS files', () => {
    beforeEach(() => {
        dbQuery.mockReset();
        dbQuery.mockResolvedValue([streamRow]);
    });

    afterAll(() => {
        fs.rmSync(mediaRoot, { recursive: true, force: true });

        if (previousMediaRoot === undefined) delete process.env.MEDIA_ROOT;
        else process.env.MEDIA_ROOT = previousMediaRoot;
        if (previousApiHostname === undefined) delete process.env.API_HOSTNAME;
        else process.env.API_HOSTNAME = previousApiHostname;
        if (previousApiProtocol === undefined) delete process.env.API_PROTOCOL;
        else process.env.API_PROTOCOL = previousApiProtocol;
    });

    test('does not list an unlisted stream in discovery', async () => {
        const response = await request(createApp()).get('/available');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test('serves the unlisted stream and its real tracks by direct link', async () => {
        const response = await request(createApp())
            .get('/Alice/live')
            .set('Host', 'stream.example.test');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            streamId: 'Alice',
            visibility: 'unlisted',
            trackCount: 2,
            title: 'Unlisted link'
        });
        expect(response.body.tracks).toEqual([
            {
                trackId: 'v:0',
                name: 'Cam',
                videoUrl: 'http://stream.example.test/api/hls/u12/0/playlist.m3u8',
                isVideo: true,
                isAudio: false
            },
            {
                trackId: 'a:0',
                name: 'Mic',
                videoUrl: 'http://stream.example.test/api/hls/u12/0/playlist.m3u8',
                isVideo: false,
                isAudio: true
            }
        ]);
    });

    test('keeps working through the legacy u<id> direct link', async () => {
        const response = await request(createApp()).get('/u12/live');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            streamId: 'Alice',
            visibility: 'unlisted',
            trackCount: 2
        });
    });
});
