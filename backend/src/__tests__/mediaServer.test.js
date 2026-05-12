import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

const fakeProcess = {
    pid: 4321,
    killed: false,
    kill: jest.fn(function kill(signal) {
        this.killed = true;
        if (this._exitCallback) {
            this._exitCallback(0, signal);
        }
    }),
    on: jest.fn(function on(event, callback) {
        if (event === 'exit') {
            this._exitCallback = callback;
        }
    }),
    once: jest.fn(function once(event, callback) {
        if (event === 'exit') {
            this._exitCallback = callback;
        }
    }),
    stdin: {
        write: jest.fn(),
        end: jest.fn()
    }
};

const spawnMock = jest.fn(() => fakeProcess);

jest.unstable_mockModule('child_process', () => ({
    spawn: spawnMock
}));

const { createMediaRoutes, ffmpegProcesses, killFFmpegProcess } = await import('../mediaServer.mjs');

const HLS_DIR = path.join(process.cwd(), 'media', 'hls');

describe('Media Server Routes', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        app.use('/', createMediaRoutes());
        ffmpegProcesses.clear();
    });

    afterEach(() => {
        for (const streamId of Array.from(ffmpegProcesses.keys())) {
            ffmpegProcesses.delete(streamId);
        }
        const outputDir = path.join(HLS_DIR, 'mediaServerTestStream');
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }
    });

    test('should reject invalid tracks on register', async () => {
        const response = await request(app).post('/ffmpeg/register').send({ tracks: '0' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "Invalid 'tracks' parameter." });
    });

    test('should register a stream and report active status', async () => {
        process.env.SRT_URL = '127.0.0.1';

        const registerResponse = await request(app)
            .post('/ffmpeg/register')
            .send({ tracks: 1, streamId: 'mediaServerTestStream' });

        expect(registerResponse.status).toBe(200);
        expect(registerResponse.body).toHaveProperty('status', 'registered');
        expect(registerResponse.body).toHaveProperty('streamId', 'mediaServerTestStream');
        expect(registerResponse.body).toHaveProperty('hlsUrl', '/api/hls/mediaServerTestStream/0/playlist.m3u8');
        expect(spawnMock).toHaveBeenCalled();
        expect(ffmpegProcesses.has('mediaServerTestStream')).toBe(true);

        const statusResponse = await request(app).get('/ffmpeg/status').query({ streamId: 'mediaServerTestStream' });
        expect(statusResponse.status).toBe(200);
        expect(statusResponse.body).toMatchObject({ streamId: 'mediaServerTestStream', status: 'active', running: true, tracks: 1 });
    });

    test('should stop a registered stream and return stopped status', async () => {
        process.env.SRT_URL = '127.0.0.1';

        await request(app)
            .post('/ffmpeg/register')
            .send({ tracks: 1, streamId: 'mediaServerTestStream' });

        const stopResponse = await request(app)
            .post('/ffmpeg/stop')
            .send({ streamId: 'mediaServerTestStream' });

        expect(stopResponse.status).toBe(200);
        expect(stopResponse.body).toEqual({ status: 'stopped', streamId: 'mediaServerTestStream' });
        expect(ffmpegProcesses.has('mediaServerTestStream')).toBe(false);
    });

    test('killFFmpegProcess should call kill on a running process', async () => {
        const processObj = {
            killed: false,
            once: jest.fn((event, callback) => {
                if (event === 'exit') {
                    callback(0, 'SIGINT');
                }
            }),
            kill: jest.fn()
        };

        const result = await killFFmpegProcess('test-id', processObj, 10);

        expect(result).toBe(true);
        expect(processObj.kill).toHaveBeenCalledWith('SIGINT');
    });

    test('should report not_found for unknown stream status', async () => {
        const response = await request(app).get('/ffmpeg/status').query({ streamId: 'missing-id' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ streamId: 'missing-id', status: 'not_found' });
    });

    test('should return a not_found status when stopping a stream that does not exist', async () => {
        const response = await request(app).post('/ffmpeg/stop').send({ streamId: 'missing-id' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'not_found', streamId: 'missing-id' });
    });

    test('killFFmpegProcess should resolve when process is already killed', async () => {
        const processObj = { killed: true, once: jest.fn(), kill: jest.fn() };
        const result = await killFFmpegProcess('test-id', processObj, 10);

        expect(result).toBe(true);
    });
});
