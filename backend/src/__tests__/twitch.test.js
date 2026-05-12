import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const fetchMock = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
    default: fetchMock
}));

process.env.TWITCH_ID = 'test-client-id';
process.env.TWITCH_SECRET = 'test-secret';

const { default: twitchRouter, getAccessToken, resetTokenCache } = await import('../routes/twitch.js');

describe('Twitch Routes', () => {
    let app;

    beforeEach(() => {
        resetTokenCache();
        app = express();
        app.use(express.json());
        app.use('/', twitchRouter);
        app.use((err, req, res, next) => {
            res.status(500).json({ error: err.message });
        });
        jest.clearAllMocks();
    });

    test('GET /top-categories should fetch categories from Twitch', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'token123', expires_in: 3600 })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        {
                            name: 'Game One',
                            box_art_url: 'https://example.com/{width}x{height}.jpg'
                        }
                    ]
                })
            });

        const response = await request(app).get('/top-categories?limit=1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([
            {
                name: 'Game One',
                viewers: '',
                image: 'https://example.com/285x380.jpg'
            }
        ]);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toContain('https://id.twitch.tv/oauth2/token');
        expect(fetchMock.mock.calls[1][0]).toContain('https://api.twitch.tv/helix/games/top?first=1');
    });

    test('GET /top-categories should reuse the cached access token between requests', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'cached-token', expires_in: 3600 })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        {
                            name: 'Game One',
                            box_art_url: 'https://example.com/{width}x{height}.jpg'
                        }
                    ]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        {
                            name: 'Game Two',
                            box_art_url: 'https://example.com/{width}x{height}.jpg'
                        }
                    ]
                })
            });

        const firstResponse = await request(app).get('/top-categories?limit=1');
        const secondResponse = await request(app).get('/top-categories?limit=1');

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[0][0]).toContain('https://id.twitch.tv/oauth2/token');
    });

    test('getAccessToken should reuse an in-flight token request', async () => {
        let resolveToken;
        const tokenPromise = new Promise((resolve) => {
            resolveToken = resolve;
        });

        fetchMock.mockImplementationOnce(() => tokenPromise);

        const firstRequest = getAccessToken();
        const secondRequest = getAccessToken();

        resolveToken({
            ok: true,
            json: async () => ({ access_token: 'token-123', expires_in: 3600 })
        });

        await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
            'token-123',
            'token-123'
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('GET /top-categories should handle Twitch API failures', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: false,
                statusText: 'Unauthorized',
                json: async () => ({})
            });

        const response = await request(app).get('/top-categories');

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error');
    });
});
