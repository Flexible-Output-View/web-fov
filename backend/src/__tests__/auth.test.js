import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../db.js', () => ({
    default: {
        query: jest.fn()
    }
}));

jest.unstable_mockModule('../utils/auth.js', () => ({
    validateRegister: jest.fn(),
    validateLogin: jest.fn(),
    normalizeEmail: jest.fn((email) => email.trim().toLowerCase()),
    hashPassword: jest.fn(),
    comparePassword: jest.fn(),
    signToken: jest.fn(),
    sanitizeUser: jest.fn((row) => {
        if (!row) {
            return null;
        }
        const { password_hash, ...user } = row;
        return user;
    })
}));

const { default: authRouter } = await import('../routes/auth.js');
const { default: db } = await import('../db.js');
const authUtils = await import('../utils/auth.js');

describe('Auth Routes', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/', authRouter);
        jest.clearAllMocks();
        process.env.NODE_ENV = 'test';
        process.env.JWT_SECRET = 'test-secret';
    });

    describe('POST /register', () => {
        test('should register a new user and return a token', async () => {
            const mockUser = {
                id: 1,
                username: 'alice',
                email: 'alice@example.com',
                created_at: '2026-01-01T00:00:00Z'
            };

            authUtils.validateRegister.mockReturnValue({ ok: true, errors: {} });
            authUtils.hashPassword.mockResolvedValue('hashed-password');
            authUtils.signToken.mockReturnValue('jwt-token');
            db.query.mockResolvedValue([{ ...mockUser, password_hash: 'hashed-password' }]);

            const response = await request(app)
                .post('/register')
                .send({
                    username: 'alice',
                    email: 'alice@example.com',
                    password: 'secret123'
                });

            expect(response.status).toBe(201);
            expect(response.body.token).toBe('jwt-token');
            expect(response.body.user).toEqual(mockUser);
            expect(authUtils.hashPassword).toHaveBeenCalledWith('secret123');
            expect(db.query).toHaveBeenCalledWith(
                'INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, NOW()) RETURNING id, username, email, created_at',
                ['alice', 'alice@example.com', 'hashed-password']
            );
        });

        test('should return 400 for invalid registration input', async () => {
            authUtils.validateRegister.mockReturnValue({
                ok: false,
                errors: { password: 'Password must be at least 8 characters' }
            });

            const response = await request(app)
                .post('/register')
                .send({
                    username: 'alice',
                    email: 'alice@example.com',
                    password: 'short'
                });

            expect(response.status).toBe(400);
            expect(response.body.errors).toHaveProperty('password');
            expect(db.query).not.toHaveBeenCalled();
        });

        test('should return 409 when username or email already exists', async () => {
            authUtils.validateRegister.mockReturnValue({ ok: true, errors: {} });
            authUtils.hashPassword.mockResolvedValue('hashed-password');
            db.query.mockRejectedValue({ code: '23505' });

            const response = await request(app)
                .post('/register')
                .send({
                    username: 'alice',
                    email: 'alice@example.com',
                    password: 'secret123'
                });

            expect(response.status).toBe(409);
            expect(response.body.error).toBe('Username or email already exists');
        });
    });

    describe('POST /login', () => {
        const mockUserRow = {
            id: 1,
            username: 'alice',
            email: 'alice@example.com',
            password_hash: 'hashed-password',
            created_at: '2026-01-01T00:00:00Z'
        };

        test('should login with username and return a token', async () => {
            authUtils.validateLogin.mockReturnValue({ ok: true, errors: {} });
            authUtils.comparePassword.mockResolvedValue(true);
            authUtils.signToken.mockReturnValue('jwt-token');
            db.query.mockResolvedValue([mockUserRow]);

            const response = await request(app)
                .post('/login')
                .send({ login: 'alice', password: 'secret123' });

            expect(response.status).toBe(200);
            expect(response.body.token).toBe('jwt-token');
            expect(response.body.user).toEqual({
                id: 1,
                username: 'alice',
                email: 'alice@example.com',
                created_at: '2026-01-01T00:00:00Z'
            });
            expect(db.query).toHaveBeenCalledWith(
                'SELECT id, username, email, password_hash, created_at FROM users WHERE username = ? OR LOWER(email) = LOWER(?) LIMIT 1',
                ['alice', 'alice']
            );
        });

        test('should login with email and return a token', async () => {
            authUtils.validateLogin.mockReturnValue({ ok: true, errors: {} });
            authUtils.comparePassword.mockResolvedValue(true);
            authUtils.signToken.mockReturnValue('jwt-token');
            db.query.mockResolvedValue([mockUserRow]);

            const response = await request(app)
                .post('/login')
                .send({ login: 'alice@example.com', password: 'secret123' });

            expect(response.status).toBe(200);
            expect(response.body.token).toBe('jwt-token');
            expect(db.query).toHaveBeenCalledWith(
                'SELECT id, username, email, password_hash, created_at FROM users WHERE username = ? OR LOWER(email) = LOWER(?) LIMIT 1',
                ['alice@example.com', 'alice@example.com']
            );
        });

        test('should return 401 for unknown user', async () => {
            authUtils.validateLogin.mockReturnValue({ ok: true, errors: {} });
            db.query.mockResolvedValue([]);

            const response = await request(app)
                .post('/login')
                .send({ login: 'missing', password: 'secret123' });

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Invalid credentials');
        });

        test('should return 401 for wrong password', async () => {
            authUtils.validateLogin.mockReturnValue({ ok: true, errors: {} });
            authUtils.comparePassword.mockResolvedValue(false);
            db.query.mockResolvedValue([mockUserRow]);

            const response = await request(app)
                .post('/login')
                .send({ login: 'alice', password: 'wrong-password' });

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Invalid credentials');
        });

        test('should return 400 for invalid login input', async () => {
            authUtils.validateLogin.mockReturnValue({
                ok: false,
                errors: { login: 'Username or email is required' }
            });

            const response = await request(app)
                .post('/login')
                .send({ password: 'secret123' });

            expect(response.status).toBe(400);
            expect(response.body.errors).toHaveProperty('login');
            expect(db.query).not.toHaveBeenCalled();
        });
    });
});
