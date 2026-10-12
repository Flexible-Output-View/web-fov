import jwt from 'jsonwebtoken';
import {
    validateRegister,
    validateLogin,
    normalizeEmail,
    hashPassword,
    comparePassword,
    signToken,
    sanitizeUser
} from '../utils/auth.js';

describe('Auth utilities', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.JWT_SECRET = 'unit-test-secret';
        process.env.JWT_EXPIRES_IN = '1h';
    });

    test('validates valid registration and login input', () => {
        expect(validateRegister({ username: 'alice_1', email: 'alice@example.com', password: 'secret123' })).toEqual({ ok: true, errors: {} });
        expect(validateLogin({ login: 'alice', password: 'secret123' })).toEqual({ ok: true, errors: {} });
    });

    test('reports each invalid registration field', () => {
        const result = validateRegister({ username: 'a!', email: 'invalid', password: 'short' });

        expect(result.ok).toBe(false);
        expect(result.errors).toEqual(expect.objectContaining({ username: expect.any(String), email: expect.any(String), password: expect.any(String) }));
    });

    test('reports each invalid login field', () => {
        expect(validateLogin({ login: '', password: '' })).toEqual({
            ok: false,
            errors: { login: 'Username or email is required', password: 'Password is required' }
        });
    });

    test('normalizes email addresses', () => {
        expect(normalizeEmail('  Alice@EXAMPLE.COM ')).toBe('alice@example.com');
    });

    test('hashes and compares passwords', async () => {
        const hash = await hashPassword('secret123');

        await expect(comparePassword('secret123', hash)).resolves.toBe(true);
        await expect(comparePassword('wrong', hash)).resolves.toBe(false);
    });

    test('signs a verifiable token with the user id and expiry', () => {
        const token = signToken(42);
        const payload = jwt.verify(token, 'unit-test-secret');

        expect(payload.userId).toBe(42);
        expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    test('sanitizes the password hash', () => {
        expect(sanitizeUser({ id: 1, username: 'alice', password_hash: 'secret' })).toEqual({ id: 1, username: 'alice' });
        expect(sanitizeUser(null)).toBeNull();
    });
});