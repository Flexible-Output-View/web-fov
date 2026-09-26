import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const dbQuery = jest.fn();

jest.unstable_mockModule('../db.js', () => ({
    default: { query: dbQuery }
}));

jest.unstable_mockModule('jsonwebtoken', () => ({
    default: { verify: jest.fn() }
}));

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const { default: chatRouter, clearMemoryMessages } = await import('../routes/chat.js');
const jwt = (await import('jsonwebtoken')).default;

function createApp(ioMock) {
    const app = express();
    app.use(express.json());
    if (ioMock) {
        app.set('io', ioMock);
    }
    app.use('/', chatRouter);
    // eslint-disable-next-line
    app.use((err, req, res, _next) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

describe('Chat Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearMemoryMessages();
    });

    test('GET /:streamId returns history without auth', async () => {
        dbQuery.mockResolvedValue([
            { id: 1, stream_id: '1', user_id: 7, username: 'alice', message: 'hello', created_at: new Date('2026-01-01T00:00:00Z') }
        ]);

        const response = await request(createApp()).get('/1?limit=10');

        expect(response.status).toBe(200);
        expect(response.body.streamId).toBe('1');
        expect(response.body.messages).toHaveLength(1);
        expect(response.body.messages[0]).toMatchObject({ username: 'alice', message: 'hello' });
    });

    test('GET /:streamId rejects invalid stream id', async () => {
        const response = await request(createApp()).get('/%20');
        expect(response.status).toBe(400);
    });

    test('POST /:streamId requires authentication', async () => {
        const response = await request(createApp()).post('/1').send({ message: 'hi' });
        expect(response.status).toBe(401);
    });

    test('POST /:streamId rejects empty message when authenticated', async () => {
        jwt.verify.mockReturnValue({ userId: 7 });
        dbQuery.mockResolvedValue([{ username: 'alice' }]);

        const response = await request(createApp())
            .post('/1')
            .set('Authorization', 'Bearer valid-token')
            .send({ message: '   ' });

        expect(response.status).toBe(400);
    });

    test('POST /:streamId stores, caches and broadcasts an authenticated message', async () => {
        jwt.verify.mockReturnValue({ userId: 7 });
        dbQuery
            .mockResolvedValueOnce([{ username: 'alice' }])
            .mockResolvedValueOnce([{ id: 42, stream_id: '1', user_id: 7, message: 'hello chat', created_at: new Date('2026-01-01T00:00:00Z') }]);

        const emitted = [];
        const ioMock = {
            to: jest.fn(() => ({ emit: jest.fn((event, payload) => emitted.push({ event, payload })) }))
        };

        const response = await request(createApp(ioMock))
            .post('/1')
            .set('Authorization', 'Bearer valid-token')
            .send({ message: 'hello chat' });

        expect(response.status).toBe(201);
        expect(response.body.message).toMatchObject({ username: 'alice', message: 'hello chat', streamId: '1' });
        expect(ioMock.to).toHaveBeenCalledWith('stream:1');
        expect(emitted[0].event).toBe('chat-message');
    });

    test('POST /:streamId rejects invalid token', async () => {
        jwt.verify.mockImplementation(() => { throw new Error('invalid'); });

        const response = await request(createApp())
            .post('/1')
            .set('Authorization', 'Bearer bad-token')
            .send({ message: 'hi' });

        expect(response.status).toBe(401);
    });
});
