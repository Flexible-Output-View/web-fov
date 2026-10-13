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
});