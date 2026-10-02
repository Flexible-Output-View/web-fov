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

const { default: chatRouter } = await import('../routes/chat.js');
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
    });

    test('GET /:streamId returns 404 — no chat history is stored', async () => {
        const response = await request(createApp()).get('/1?limit=10');

        expect(response.status).toBe(404);
        expect(dbQuery).not.toHaveBeenCalled();
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

    test('POST /:streamId broadcasts an authenticated message without persisting it', async () => {
        jwt.verify.mockReturnValue({ userId: 7 });
        dbQuery.mockResolvedValueOnce([{ username: 'alice' }]);

        const emitted = [];
        const ioMock = {
            to: jest.fn(() => ({ emit: jest.fn((event, payload) => emitted.push({ event, payload })) }))
        };

        const response = await request(createApp(ioMock))
            .post('/1')
            .set('Authorization', 'Bearer valid-token')
            .send({ message: 'hello chat' });

        expect(response.status).toBe(201);
        expect(response.body.message).toMatchObject({
            username: 'alice',
            message: 'hello chat',
            streamId: '1',
            userId: 7
        });
        expect(String(response.body.message.id)).toMatch(/^mem-/);
        expect(ioMock.to).toHaveBeenCalledWith('stream:1');
        expect(emitted[0].event).toBe('chat-message');
        expect(emitted[0].payload).toEqual(response.body.message);

        const queries = dbQuery.mock.calls.map((call) => String(call[0]));
        expect(queries.some((q) => /INSERT/i.test(q))).toBe(false);
        expect(queries.every((q) => /SELECT username FROM users/i.test(q))).toBe(true);
    });

    test('POST /:streamId rejects invalid token', async () => {
        jwt.verify.mockImplementation(() => {
            throw new Error('invalid');
        });

        const response = await request(createApp())
            .post('/1')
            .set('Authorization', 'Bearer bad-token')
            .send({ message: 'hi' });

        expect(response.status).toBe(401);
    });
});
