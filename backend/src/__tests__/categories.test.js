import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const dbMock = {
    query: jest.fn()
};

jest.unstable_mockModule('../db.js', () => ({
    default: dbMock
}));

const { default: categoriesRouter } = await import('../routes/categories.js');

describe('Categories Routes', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/', categoriesRouter);
        app.use((err, req, res, next) => {
            res.status(500).json({ error: err.message });
        });
        jest.clearAllMocks();
    });

    describe('GET /', () => {
        test('should return all categories', async () => {
            const mockCategories = [
                { id: 1, name: 'Gaming', viewers: 100, image_url: 'game.jpg' },
                { id: 2, name: 'Music', viewers: 50, image_url: 'music.jpg' }
            ];

            dbMock.query.mockResolvedValue(mockCategories);

            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockCategories);
            expect(dbMock.query).toHaveBeenCalledWith(
                'SELECT id, name, viewers, image_url FROM categories ORDER BY viewers DESC'
            );
        });

        test('should return empty array when no categories', async () => {
            dbMock.query.mockResolvedValue([]);

            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('should handle database errors', async () => {
            dbMock.query.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app).get('/');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('GET /:id', () => {
        test('should return a category by id', async () => {
            const category = { id: 1, name: 'Gaming', viewers: 100, image_url: 'game.jpg' };
            dbMock.query.mockResolvedValue([category]);

            const response = await request(app).get('/1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(category);
            expect(dbMock.query).toHaveBeenCalledWith(
                'SELECT id, name, viewers, image_url FROM categories WHERE id = ?',
                ['1']
            );
        });

        test('should return 404 when category is not found', async () => {
            dbMock.query.mockResolvedValue([]);

            const response = await request(app).get('/999');

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Categorie not found' });
        });

        test('should handle database errors for category by id', async () => {
            dbMock.query.mockRejectedValue(new Error('Database failure'));

            const response = await request(app).get('/1');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });
});
