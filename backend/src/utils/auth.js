import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV !== 'test') {
        throw new Error('JWT_SECRET is not configured');
    }
    return secret || 'test-secret';
}

export function validateRegister({ username, email, password }) {
    const errors = {};

    if (!username || !USERNAME_REGEX.test(username)) {
        errors.username = 'Username must be 3-30 characters and contain only letters, numbers, and underscores';
    }

    if (!email || !EMAIL_REGEX.test(email)) {
        errors.email = 'A valid email is required';
    }

    if (!password || password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
    }

    return {
        ok: Object.keys(errors).length === 0,
        errors
    };
}

export function validateLogin({ login, password }) {
    const errors = {};

    if (!login || typeof login !== 'string' || login.trim().length === 0) {
        errors.login = 'Username or email is required';
    }

    if (!password || typeof password !== 'string' || password.length === 0) {
        errors.password = 'Password is required';
    }

    return {
        ok: Object.keys(errors).length === 0,
        errors
    };
}

export function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

export async function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

export function signToken(userId) {
    return jwt.sign(
        { userId },
        getJwtSecret(),
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

export function sanitizeUser(row) {
    if (!row) {
        return null;
    }

    const { password_hash, ...user } = row;
    return user;
}
