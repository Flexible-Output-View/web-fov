import express from 'express';
import db from '../db.js';
import {
    validateRegister,
    validateLogin,
    normalizeEmail,
    hashPassword,
    comparePassword,
    signToken,
    sanitizeUser
} from '../utils/auth.js';

const router = express.Router();

router.post('/register', async (req, res, next) => {
    const { username, email, password } = req.body;
    const validation = validateRegister({ username, email, password });

    if (!validation.ok) {
        return res.status(400).json({ errors: validation.errors });
    }

    try {
        const normalizedEmail = normalizeEmail(email);
        const passwordHash = await hashPassword(password);
        const rows = await db.query(
            'INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, NOW()) RETURNING id, username, email, created_at',
            [username, normalizedEmail, passwordHash]
        );
        const user = sanitizeUser(rows[0]);
        const token = signToken(user.id);

        res.status(201).json({ token, user });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        next(err);
    }
});

router.post('/login', async (req, res, next) => {
    const { login, password } = req.body;
    const validation = validateLogin({ login, password });

    if (!validation.ok) {
        return res.status(400).json({ errors: validation.errors });
    }

    try {
        const normalizedLogin = login.trim();
        const rows = await db.query(
            'SELECT id, username, email, password_hash, created_at FROM users WHERE username = ? OR LOWER(email) = LOWER(?) LIMIT 1',
            [normalizedLogin, normalizedLogin]
        );

        if (!rows || rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const userRow = rows[0];
        const passwordMatches = await comparePassword(password, userRow.password_hash);

        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = sanitizeUser(userRow);
        const token = signToken(user.id);

        res.json({ token, user });
    } catch (err) {
        next(err);
    }
});

export default router;
