import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../utils/auth.js', () => ({
    verifyToken: jest.fn()
}));

const { requireAuth, optionalAuth } = await import('../middleware/auth.js');
const authUtils = await import('../utils/auth.js');

function buildApp() {
    const app = express();
    app.get('/protected', requireAuth, (req, res) => res.json({ userId: req.userId }));
    app.get('/optional', optionalAuth, (req, res) => res.json({ userId: req.userId ?? null }));
    return app;
}

describe('Auth middleware', () => {
    let app;

    beforeEach(() => {
        app = buildApp();
        jest.clearAllMocks();
    });

    describe('requireAuth', () => {
        test('attaches the user id for a valid bearer token', async () => {
            authUtils.verifyToken.mockReturnValue({ userId: 5 });

            const response = await request(app)
                .get('/protected')
                .set({ Authorization: 'Bearer valid-token' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ userId: 5 });
            expect(authUtils.verifyToken).toHaveBeenCalledWith('valid-token');
        });

        test('rejects a request without an authorization header', async () => {
            const response = await request(app).get('/protected');

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error', 'Authentication required');
        });

        test('rejects a non-bearer authorization scheme', async () => {
            const response = await request(app)
                .get('/protected')
                .set({ Authorization: 'Basic abc' });

            expect(response.status).toBe(401);
            expect(authUtils.verifyToken).not.toHaveBeenCalled();
        });

        test('rejects an invalid token', async () => {
            authUtils.verifyToken.mockImplementation(() => {
                throw new Error('invalid token');
            });

            const response = await request(app)
                .get('/protected')
                .set({ Authorization: 'Bearer broken-token' });

            expect(response.status).toBe(401);
        });

        test('rejects a payload without a numeric user id', async () => {
            authUtils.verifyToken.mockReturnValue({ userId: 'not-a-number' });

            const response = await request(app)
                .get('/protected')
                .set({ Authorization: 'Bearer token' });

            expect(response.status).toBe(401);
        });
    });

    describe('optionalAuth', () => {
        test('allows anonymous requests', async () => {
            const response = await request(app).get('/optional');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ userId: null });
        });

        test('attaches the user id when a valid token is provided', async () => {
            authUtils.verifyToken.mockReturnValue({ userId: 9 });

            const response = await request(app)
                .get('/optional')
                .set({ Authorization: 'Bearer token' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ userId: 9 });
        });

        test('ignores an invalid token', async () => {
            authUtils.verifyToken.mockImplementation(() => {
                throw new Error('invalid token');
            });

            const response = await request(app)
                .get('/optional')
                .set({ Authorization: 'Bearer token' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ userId: null });
        });
    });
});
