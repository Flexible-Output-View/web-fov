import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

// Mock the database module
jest.unstable_mockModule('../db.js', () => ({
    default: {
        query: jest.fn()
    }
}));

// Mock the auth utilities so we can control token verification and password checks
jest.unstable_mockModule('../utils/auth.js', () => ({
    verifyToken: jest.fn(),
    comparePassword: jest.fn(),
    hashPassword: jest.fn()
}));

const { default: usersRouter } = await import('../routes/users.js');
const { default: db } = await import('../db.js');
const authUtils = await import('../utils/auth.js');

const AUTH_HEADER = { Authorization: 'Bearer test-token' };

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/', usersRouter);
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => res.status(500).json({ error: err.message }));
    return app;
}

function profileRow(overrides = {}) {
    return {
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        bio: 'Hello',
        avatar_url: null,
        banner_url: null,
        created_at: '2026-01-01T00:00:00Z',
        followers_count: 2,
        following_count: 3,
        ...overrides
    };
}

describe('Users Routes', () => {
    let app;

    beforeEach(() => {
        app = createApp();
        jest.clearAllMocks();
        process.env.JWT_SECRET = 'test-secret';
        authUtils.verifyToken.mockReturnValue({ userId: 1 });
    });

    describe('GET /me', () => {
        test('returns the authenticated user full profile', async () => {
            db.query.mockResolvedValue([profileRow()]);

            const response = await request(app).get('/me').set(AUTH_HEADER);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                id: 1,
                username: 'alice',
                bio: 'Hello',
                avatarUrl: '',
                bannerUrl: '',
                followersCount: 2,
                followingCount: 3,
                isFollowing: false,
                email: 'alice@example.com'
            });
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.id = ?'), [1]);
        });

        test('returns 401 without a token', async () => {
            const response = await request(app).get('/me');

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error', 'Authentication required');
            expect(db.query).not.toHaveBeenCalled();
        });

        test('returns 401 when the user no longer exists', async () => {
            db.query.mockResolvedValue([]);

            const response = await request(app).get('/me').set(AUTH_HEADER);

            expect(response.status).toBe(401);
        });
    });

    describe('PUT /me', () => {
        test('updates the profile fields and returns the updated profile', async () => {
            db.query
                .mockResolvedValueOnce([{ id: 1 }])
                .mockResolvedValueOnce([profileRow({ bio: 'New bio', avatar_url: 'data:image/png;base64,AAA', banner_url: 'data:image/png;base64,BBB' })]);

            const response = await request(app)
                .put('/me')
                .set(AUTH_HEADER)
                .send({ bio: 'New bio', avatarUrl: 'data:image/png;base64,AAA', bannerUrl: 'data:image/png;base64,BBB' });

            expect(response.status).toBe(200);
            expect(response.body.bio).toBe('New bio');
            expect(response.body.avatarUrl).toBe('data:image/png;base64,AAA');
            expect(response.body.bannerUrl).toBe('data:image/png;base64,BBB');
            expect(db.query).toHaveBeenCalledWith(
                'UPDATE users SET bio = ?, avatar_url = ?, banner_url = ?, updated_at = NOW() WHERE id = ? RETURNING id',
                ['New bio', 'data:image/png;base64,AAA', 'data:image/png;base64,BBB', 1]
            );
        });

        test('stores null when image fields are empty', async () => {
            db.query
                .mockResolvedValueOnce([{ id: 1 }])
                .mockResolvedValueOnce([profileRow()]);

            await request(app).put('/me').set(AUTH_HEADER).send({ bio: '', avatarUrl: '', bannerUrl: '' });

            expect(db.query).toHaveBeenCalledWith(
                'UPDATE users SET bio = ?, avatar_url = ?, banner_url = ?, updated_at = NOW() WHERE id = ? RETURNING id',
                ['', null, null, 1]
            );
        });

        test('rejects a bio longer than 300 characters', async () => {
            const response = await request(app)
                .put('/me')
                .set(AUTH_HEADER)
                .send({ bio: 'x'.repeat(301) });

            expect(response.status).toBe(400);
            expect(response.body.errors).toHaveProperty('bio');
            expect(db.query).not.toHaveBeenCalled();
        });

        test('returns 401 without a token', async () => {
            const response = await request(app).put('/me').send({ bio: 'hi' });

            expect(response.status).toBe(401);
            expect(db.query).not.toHaveBeenCalled();
        });
    });

    describe('PUT /me/password', () => {
        test('changes the password when the current one is correct', async () => {
            db.query
                .mockResolvedValueOnce([{ id: 1, password_hash: 'old-hash' }])
                .mockResolvedValueOnce([]);
            authUtils.comparePassword.mockResolvedValue(true);
            authUtils.hashPassword.mockResolvedValue('new-hash');

            const response = await request(app)
                .put('/me/password')
                .set(AUTH_HEADER)
                .send({ currentPassword: 'old-secret', newPassword: 'new-secret' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });
            expect(authUtils.comparePassword).toHaveBeenCalledWith('old-secret', 'old-hash');
            expect(db.query).toHaveBeenCalledWith(
                'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
                ['new-hash', 1]
            );
        });

        test('returns 401 when the current password is wrong', async () => {
            db.query.mockResolvedValueOnce([{ id: 1, password_hash: 'old-hash' }]);
            authUtils.comparePassword.mockResolvedValue(false);

            const response = await request(app)
                .put('/me/password')
                .set(AUTH_HEADER)
                .send({ currentPassword: 'wrong', newPassword: 'new-secret' });

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Current password is incorrect');
        });

        test('returns 400 when the new password is too short', async () => {
            const response = await request(app)
                .put('/me/password')
                .set(AUTH_HEADER)
                .send({ currentPassword: 'old-secret', newPassword: 'short' });

            expect(response.status).toBe(400);
            expect(response.body.errors).toHaveProperty('newPassword');
            expect(db.query).not.toHaveBeenCalled();
        });

        test('returns 400 when the new password equals the current one', async () => {
            const response = await request(app)
                .put('/me/password')
                .set(AUTH_HEADER)
                .send({ currentPassword: 'same-secret', newPassword: 'same-secret' });

            expect(response.status).toBe(400);
            expect(response.body.errors).toHaveProperty('newPassword');
        });
    });

    describe('POST /:username/follow', () => {
        test('follows another user', async () => {
            db.query
                .mockResolvedValueOnce([{ id: 2 }])
                .mockResolvedValueOnce([]);

            const response = await request(app).post('/bob/follow').set(AUTH_HEADER);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ following: true });
            expect(db.query).toHaveBeenCalledWith(
                'INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
                [1, 2]
            );
        });

        test('returns 404 for an unknown user', async () => {
            db.query.mockResolvedValueOnce([]);

            const response = await request(app).post('/ghost/follow').set(AUTH_HEADER);

            expect(response.status).toBe(404);
        });

        test('returns 400 when following yourself', async () => {
            db.query.mockResolvedValueOnce([{ id: 1 }]);

            const response = await request(app).post('/alice/follow').set(AUTH_HEADER);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('You cannot follow yourself');
        });

        test('returns 401 without a token', async () => {
            const response = await request(app).post('/bob/follow');

            expect(response.status).toBe(401);
            expect(db.query).not.toHaveBeenCalled();
        });
    });

    describe('DELETE /:username/follow', () => {
        test('unfollows a user', async () => {
            db.query
                .mockResolvedValueOnce([{ id: 2 }])
                .mockResolvedValueOnce([]);

            const response = await request(app).delete('/bob/follow').set(AUTH_HEADER);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ following: false });
            expect(db.query).toHaveBeenCalledWith(
                'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
                [1, 2]
            );
        });

        test('returns 404 for an unknown user', async () => {
            db.query.mockResolvedValueOnce([]);

            const response = await request(app).delete('/ghost/follow').set(AUTH_HEADER);

            expect(response.status).toBe(404);
        });
    });

    describe('GET /:username', () => {
        test('returns a public profile without the email', async () => {
            db.query.mockResolvedValue([profileRow({ id: 2, username: 'bob' })]);

            const response = await request(app).get('/bob');

            expect(response.status).toBe(200);
            expect(response.body.username).toBe('bob');
            expect(response.body).not.toHaveProperty('email');
            expect(response.body.isFollowing).toBe(false);
            expect(response.body.followersCount).toBe(2);
            // only the profile query, no follow lookup without auth
            expect(db.query).toHaveBeenCalledTimes(1);
        });

        test('reports isFollowing for an authenticated follower', async () => {
            db.query
                .mockResolvedValueOnce([profileRow({ id: 2, username: 'bob' })])
                .mockResolvedValueOnce([{ '?column?': 1 }]);

            const response = await request(app).get('/bob').set(AUTH_HEADER);

            expect(response.status).toBe(200);
            expect(response.body.isFollowing).toBe(true);
            expect(db.query).toHaveBeenCalledWith(
                'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1',
                [1, 2]
            );
        });

        test('returns 404 when the user does not exist', async () => {
            db.query.mockResolvedValue([]);

            const response = await request(app).get('/ghost');

            expect(response.status).toBe(404);
            expect(response.body.error).toBe('User not found');
        });

        test('handles database errors', async () => {
            db.query.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app).get('/bob');

            expect(response.status).toBe(500);
        });
    });
});
