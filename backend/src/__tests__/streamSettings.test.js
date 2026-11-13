import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const dbQuery = jest.fn();
const ffmpegProcesses = new Map();

jest.unstable_mockModule('../db.js', () => ({
    default: { query: dbQuery }
}));

jest.unstable_mockModule('../utils/auth.js', () => ({
    verifyToken: jest.fn()
}));

jest.unstable_mockModule('../mediaServer.mjs', () => ({
    ffmpegProcesses
}));

const { default: streamSettingsRouter } = await import('../routes/streamSettings.js');
const authUtils = await import('../utils/auth.js');

const AUTH_HEADER = { Authorization: 'Bearer test-token' };

function createApp() {
    const app = express();
    app.use(express.json({ limit: '6mb' }));
    app.use('/', streamSettingsRouter);
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => res.status(500).json({ error: err.message }));
    return app;
}

function settingsRow(overrides = {}) {
    return {
        user_id: 1,
        stream_key: 'fov_existing_key_1234567890',
        title: 'alice',
        description: '',
        visibility: 'public',
        thumbnail_url: null,
        category_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        username: 'alice',
        avatar_url: null,
        category_name: null,
        ...overrides
    };
}

function installDb({ user = { id: 1, username: 'alice' }, settings = settingsRow(), categoryExists = true } = {}) {
    let state = settings ? { ...settings } : null;

    dbQuery.mockImplementation(async (sql, params = []) => {
        if (sql.includes('FROM users WHERE id =')) {
            return user ? [user] : [];
        }

        if (sql.includes('INSERT INTO stream_settings')) {
            if (!state) {
                state = settingsRow({
                    user_id: params[0],
                    stream_key: params[1],
                    title: params[2]
                });
            }
            return [];
        }

        if (sql.includes('FROM categories WHERE id =')) {
            return categoryExists ? [{ id: params[0] }] : [];
        }

        if (sql.includes('UPDATE stream_settings') && sql.includes('stream_key = ?')) {
            if (!state) {
                return [];
            }
            state.stream_key = params[0];
            return [{ user_id: state.user_id }];
        }

        if (sql.includes('UPDATE stream_settings SET')) {
            if (!state) {
                return [];
            }
            const columns = [...sql.split('WHERE')[0].matchAll(/([a-z_]+) = \?/g)]
                .map((match) => match[1]);
            columns.forEach((column, index) => {
                state[column] = params[index];
            });
            return [];
        }

        if (sql.includes('FROM stream_settings ss')) {
            if (!state) {
                return [];
            }
            if (sql.includes('ss.stream_key =')) {
                return state.stream_key === params[0] ? [{ ...state }] : [];
            }
            return state.user_id === params[0] ? [{ ...state }] : [];
        }

        throw new Error(`Unexpected query in test: ${sql}`);
    });

    return {
        getState: () => state
    };
}

describe('Stream settings routes', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        ffmpegProcesses.clear();
        process.env.JWT_SECRET = 'test-secret';
        authUtils.verifyToken.mockReturnValue({ userId: 1 });
        app = createApp();
    });

    test('rejects unauthenticated requests', async () => {
        installDb();

        const get = await request(app).get('/');
        expect(get.status).toBe(401);
        expect(get.body).toEqual({ error: 'Authentication required' });

        const put = await request(app).put('/').send({ title: 'Nope' });
        expect(put.status).toBe(401);

        const key = await request(app).get('/stream-key');
        expect(key.status).toBe(401);

        const rotate = await request(app).post('/stream-key/rotate');
        expect(rotate.status).toBe(401);
    });

    test('creates the settings and a backend-generated key on first access', async () => {
        installDb({ settings: null });

        const response = await request(app).get('/').set(AUTH_HEADER);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            streamId: 'u1',
            title: 'alice',
            description: '',
            visibility: 'public',
            thumbnailUrl: '',
            categoryId: null,
            isLive: false
        });
        expect(response.body.streamKey).toMatch(/^fov_[A-Za-z0-9_-]{43}$/);
        expect(dbQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO stream_settings'),
            [1, expect.stringMatching(/^fov_/), 'alice']
        );
    });

    test('returns the existing configuration without replacing its key', async () => {
        installDb({ settings: settingsRow({ stream_key: 'fov_keep_this_key' }) });

        const response = await request(app).get('/').set(AUTH_HEADER);

        expect(response.status).toBe(200);
        expect(response.body.streamKey).toBe('fov_keep_this_key');
    });

    test('rejects a token whose user no longer exists', async () => {
        installDb({ user: null, settings: null });

        const response = await request(app).get('/').set(AUTH_HEADER);

        expect(response.status).toBe(401);
    });

    test('validates every configurable property', async () => {
        installDb();

        const response = await request(app)
            .put('/')
            .set(AUTH_HEADER)
            .send({
                title: '',
                description: 'x'.repeat(2001),
                visibility: 'secret',
                thumbnailUrl: 42,
                categoryId: 0
            });

        expect(response.status).toBe(400);
        expect(response.body.errors).toEqual({
            title: 'Title is required',
            description: 'Description must be a string of at most 2000 characters',
            visibility: 'Visibility must be one of: public, unlisted, private',
            thumbnailUrl: 'Thumbnail must be a string of at most 5 MB',
            categoryId: 'Category id must be a positive integer'
        });
    });

    test('rejects a title longer than 255 characters', async () => {
        installDb();

        const response = await request(app)
            .put('/')
            .set(AUTH_HEADER)
            .send({ title: 'x'.repeat(256) });

        expect(response.status).toBe(400);
        expect(response.body.errors.title).toBe('Title must be at most 255 characters');
    });

    test('rejects an unknown category', async () => {
        installDb({ categoryExists: false });

        const response = await request(app)
            .put('/')
            .set(AUTH_HEADER)
            .send({ categoryId: 999 });

        expect(response.status).toBe(400);
        expect(response.body.errors).toEqual({ categoryId: 'Unknown category' });
    });

    test('updates the stream properties', async () => {
        const db = installDb();

        const response = await request(app)
            .put('/')
            .set(AUTH_HEADER)
            .send({
                title: 'Ranked grind',
                description: 'Climbing the ladder',
                visibility: 'unlisted',
                thumbnailUrl: 'data:image/png;base64,AAAA',
                categoryId: 2
            });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            streamId: 'u1',
            title: 'Ranked grind',
            description: 'Climbing the ladder',
            visibility: 'unlisted',
            thumbnailUrl: 'data:image/png;base64,AAAA',
            categoryId: 2
        });
        expect(db.getState()).toMatchObject({
            title: 'Ranked grind',
            description: 'Climbing the ladder',
            visibility: 'unlisted',
            category_id: 2
        });
    });

    test('allows clearing the category', async () => {
        const db = installDb({ settings: settingsRow({ category_id: 3, category_name: 'Music' }) });

        const response = await request(app)
            .put('/')
            .set(AUTH_HEADER)
            .send({ categoryId: null });

        expect(response.status).toBe(200);
        expect(response.body.categoryId).toBeNull();
        expect(db.getState().category_id).toBeNull();
    });

    test('ignores a client-supplied stream key', async () => {
        const db = installDb({ settings: settingsRow({ stream_key: 'fov_owner_key' }) });

        const response = await request(app)
            .put('/')
            .set(AUTH_HEADER)
            .send({ title: 'Updated', streamKey: 'fov_attacker_key' });

        expect(response.status).toBe(200);
        expect(response.body.streamKey).toBe('fov_owner_key');
        expect(db.getState().stream_key).toBe('fov_owner_key');
    });

    test('returns the key and whether the stream is live', async () => {
        installDb();
        ffmpegProcesses.set('u1', { tracksV: 1, tracksA: 1 });

        const response = await request(app).get('/stream-key').set(AUTH_HEADER);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            streamKey: 'fov_existing_key_1234567890',
            streamId: 'u1',
            isLive: true
        });
    });

    test('rotates the stream key', async () => {
        const db = installDb({ settings: settingsRow({ stream_key: 'fov_old_key' }) });

        const response = await request(app).post('/stream-key/rotate').set(AUTH_HEADER);

        expect(response.status).toBe(200);
        expect(response.body.streamKey).toMatch(/^fov_[A-Za-z0-9_-]{43}$/);
        expect(response.body.streamKey).not.toBe('fov_old_key');
        expect(response.body.streamId).toBe('u1');
        expect(db.getState().stream_key).toBe(response.body.streamKey);
    });

    test('surfaces database failures through the error handler', async () => {
        dbQuery.mockRejectedValue(new Error('database unavailable'));

        const response = await request(app).get('/').set(AUTH_HEADER);

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'database unavailable' });
    });
});
