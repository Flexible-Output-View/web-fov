import express from 'express';
import request from 'supertest';

const { default: indexRouter } = await import('../routes/index.js');

describe('Index API Route', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use('/', indexRouter);
    });

    test('GET / should return API status', async () => {
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true, api: true });
    });
});
