import express from 'express';
import request from 'supertest';

const runIntegration = process.env.RUN_INTEGRATION === '1';

const { default: db } = await import('../db.js');
const { default: apiRoutes } = await import('../routes/index.js');

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);
app.use((err, req, res, _next) => {
    res.status(500).json({ error: err.message });
});

(runIntegration ? describe : describe.skip)('Postgres integration', () => {
    beforeEach(async () => {
        await db.query('TRUNCATE users RESTART IDENTITY CASCADE');
    });

    afterAll(async () => {
        await db.pool.end();
    });

    test('serves categories and known streams from PostgreSQL', async () => {
        const categories = await request(app).get('/api/categories');
        expect(categories.status).toBe(200);
        expect(Array.isArray(categories.body)).toBe(true);
        expect(categories.body.length).toBeGreaterThan(0);

        const stream = await request(app).get('/api/streams/1');
        expect(stream.status).toBe(200);
        expect(stream.body.id).toBe(1);

        const missingStream = await request(app).get('/api/streams/999999');
        expect(missingStream.status).toBe(404);

        const invalidStream = await request(app).get('/api/streams/not-a-number');
        expect([400, 404]).toContain(invalidStream.status);
    });

    test('registers and logs in a user with the real database', async () => {
        const username = `integration_${Date.now()}`;
        const credentials = {
            username,
            email: `${username}@example.com`,
            password: 'integration-secret'
        };

        const registration = await request(app).post('/api/auth/register').send(credentials);
        expect(registration.status).toBe(201);
        expect(registration.body.token).toEqual(expect.any(String));
        expect(registration.body.user).not.toHaveProperty('password_hash');

        const login = await request(app).post('/api/auth/login').send({
            login: credentials.email,
            password: credentials.password
        });
        expect(login.status).toBe(200);
        expect(login.body.token).toEqual(expect.any(String));

        const badInput = await request(app).post('/api/auth/login').send({ login: credentials.username });
        expect(badInput.status).toBe(400);
    });

    test('supports profile update, password change, and follow/unfollow', async () => {
        const register = async (name) => {
            const res = await request(app).post('/api/auth/register').send({
                username: name,
                email: `${name}@example.com`,
                password: 'integration-secret'
            });
            expect(res.status).toBe(201);
            return res.body.token;
        };

        const suffix = Date.now();
        const aliceName = `alice_${suffix}`;
        const bobName = `bob_${suffix}`;
        const aliceToken = await register(aliceName);
        const bobToken = await register(bobName);
        const auth = (token) => ({ Authorization: `Bearer ${token}` });

        // public profile (no email exposed)
        const publicProfile = await request(app).get(`/api/users/${bobName}`);
        expect(publicProfile.status).toBe(200);
        expect(publicProfile.body).not.toHaveProperty('email');
        expect(publicProfile.body.followersCount).toBe(0);

        // update own profile
        const update = await request(app)
            .put('/api/users/me')
            .set(auth(bobToken))
            .send({ bio: 'Hello world', avatarUrl: 'data:image/png;base64,AAAA', bannerUrl: '' });
        expect(update.status).toBe(200);
        expect(update.body.bio).toBe('Hello world');
        expect(update.body.email).toBe(`${bobName}@example.com`);

        // alice follows bob
        const follow = await request(app).post(`/api/users/${bobName}/follow`).set(auth(aliceToken));
        expect(follow.status).toBe(200);
        expect(follow.body).toEqual({ following: true });

        const bobAsSeenByAlice = await request(app).get(`/api/users/${bobName}`).set(auth(aliceToken));
        expect(bobAsSeenByAlice.body.followersCount).toBe(1);
        expect(bobAsSeenByAlice.body.isFollowing).toBe(true);

        const unfollow = await request(app).delete(`/api/users/${bobName}/follow`).set(auth(aliceToken));
        expect(unfollow.status).toBe(200);
        expect(unfollow.body).toEqual({ following: false });

        // cannot follow yourself
        const selfFollow = await request(app).post(`/api/users/${bobName}/follow`).set(auth(bobToken));
        expect(selfFollow.status).toBe(400);

        // change password (wrong current one is rejected)
        const wrongPassword = await request(app)
            .put('/api/users/me/password')
            .set(auth(bobToken))
            .send({ currentPassword: 'nope', newPassword: 'brand-new-secret' });
        expect(wrongPassword.status).toBe(401);

        const changePassword = await request(app)
            .put('/api/users/me/password')
            .set(auth(bobToken))
            .send({ currentPassword: 'integration-secret', newPassword: 'brand-new-secret' });
        expect(changePassword.status).toBe(200);

        const login = await request(app)
            .post('/api/auth/login')
            .send({ login: bobName, password: 'brand-new-secret' });
        expect(login.status).toBe(200);
    });
});