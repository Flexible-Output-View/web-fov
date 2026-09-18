import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

// Mock the database module
jest.unstable_mockModule('../db.js', () => ({
    default: {
        query: jest.fn()
    }
}));

const { default: usersRouter } = await import('../routes/users.js');
const { default: db } = await import('../db.js');

describe('Users Routes', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/', usersRouter);
        jest.clearAllMocks();
    });

    describe('GET /:id', () => {
        test('should return user by id', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                display_name: 'Test User',
                created_at: '2026-01-01T00:00:00Z'
            };

            db.query.mockResolvedValue([mockUser]);

            const response = await request(app).get('/1');

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual(mockUser);
            expect(db.query).toHaveBeenCalledWith(
                'SELECT id, username, display_name, created_at FROM users WHERE id = ?',
                ['1']
            );
        });

        test('should return 404 when user not found', async () => {
            db.query.mockResolvedValue([]);

            const response = await request(app).get('/999');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'User not found');
        });

        test('should handle database errors', async () => {
            db.query.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app).get('/1');

            expect(response.status).toBe(500);
        });
    });
});
