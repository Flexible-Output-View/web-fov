import express from 'express';
const router = express.Router();
import db from '../db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { comparePassword, hashPassword } from '../utils/auth.js';

const MAX_IMAGE_LENGTH = 5 * 1024 * 1024; // 5 MB data URL (front resizes images client-side)

const PROFILE_SELECT = `
    SELECT
        u.id,
        u.username,
        u.email,
        u.bio,
        u.avatar_url,
        u.banner_url,
        u.created_at,
        (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers_count,
        (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count
    FROM users u
`;

function toProfile(row, { includeEmail = false, isFollowing = false } = {}) {
    const profile = {
        id: row.id,
        username: row.username,
        bio: row.bio || '',
        avatarUrl: row.avatar_url || '',
        bannerUrl: row.banner_url || '',
        followersCount: Number(row.followers_count) || 0,
        followingCount: Number(row.following_count) || 0,
        isFollowing: !!isFollowing
    };

    if (includeEmail) {
        profile.email = row.email;
    }

    return profile;
}

async function findUserByUsername(username) {
    const rows = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    return rows.length > 0 ? rows[0] : null;
}

// GET /api/users/me -> own full profile (requires auth)
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const rows = await db.query(`${PROFILE_SELECT} WHERE u.id = ?`, [req.userId]);
        if (!rows || rows.length === 0) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        res.json(toProfile(rows[0], { includeEmail: true }));
    } catch (err) {
        next(err);
    }
});

// PUT /api/users/me -> update own public profile fields
router.put('/me', requireAuth, async (req, res, next) => {
    const { bio = '', avatarUrl = '', bannerUrl = '' } = req.body ?? {};

    const errors = {};
    if (typeof bio !== 'string' || bio.length > 300) {
        errors.bio = 'Bio must be a string of at most 300 characters';
    }
    if (typeof avatarUrl !== 'string' || avatarUrl.length > MAX_IMAGE_LENGTH) {
        errors.avatarUrl = 'Avatar must be a string of at most 5 MB';
    }
    if (typeof bannerUrl !== 'string' || bannerUrl.length > MAX_IMAGE_LENGTH) {
        errors.bannerUrl = 'Banner must be a string of at most 5 MB';
    }
    if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
    }

    try {
        const rows = await db.query(
            'UPDATE users SET bio = ?, avatar_url = ?, banner_url = ?, updated_at = NOW() WHERE id = ? RETURNING id',
            [bio, avatarUrl || null, bannerUrl || null, req.userId]
        );

        if (!rows || rows.length === 0) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const profileRows = await db.query(`${PROFILE_SELECT} WHERE u.id = ?`, [req.userId]);
        res.json(toProfile(profileRows[0], { includeEmail: true }));
    } catch (err) {
        next(err);
    }
});

// PUT /api/users/me/password -> change own password
router.put('/me/password', requireAuth, async (req, res, next) => {
    const { currentPassword, newPassword } = req.body ?? {};

    const errors = {};
    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        errors.currentPassword = 'Current password is required';
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
        errors.newPassword = 'New password must be at least 8 characters';
    }
    if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
    }
    if (currentPassword === newPassword) {
        return res.status(400).json({
            errors: { newPassword: 'New password must be different from the current one' }
        });
    }

    try {
        const rows = await db.query('SELECT id, password_hash FROM users WHERE id = ?', [req.userId]);
        if (!rows || rows.length === 0) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const matches = await comparePassword(currentPassword, rows[0].password_hash);
        if (!matches) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const passwordHash = await hashPassword(newPassword);
        await db.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [passwordHash, req.userId]);

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/users/me -> permanently delete own account
router.delete('/me', requireAuth, async (req, res, next) => {
    const { password } = req.body ?? {};

    if (typeof password !== 'string' || password.length === 0) {
        return res.status(400).json({ errors: { password: 'Password is required' } });
    }

    try {
        const rows = await db.query('SELECT id, password_hash FROM users WHERE id = ?', [req.userId]);
        if (!rows || rows.length === 0) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const matches = await comparePassword(password, rows[0].password_hash);
        if (!matches) {
            // 400 rather than 401: the session is valid, only the confirmation failed.
            // A 401 here would make the frontend interceptor log the user out.
            return res.status(400).json({ errors: { password: 'Password is incorrect' } });
        }

        // `follows` rows are removed automatically via ON DELETE CASCADE.
        const deleted = await db.query('DELETE FROM users WHERE id = ? RETURNING id', [req.userId]);
        if (!deleted || deleted.length === 0) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/:username/follow -> follow a user
router.post('/:username/follow', requireAuth, async (req, res, next) => {
    try {
        const target = await findUserByUsername(req.params.username);
        if (!target) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (target.id === req.userId) {
            return res.status(400).json({ error: 'You cannot follow yourself' });
        }

        await db.query(
            'INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
            [req.userId, target.id]
        );
        res.json({ following: true });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/users/:username/follow -> unfollow a user
router.delete('/:username/follow', requireAuth, async (req, res, next) => {
    try {
        const target = await findUserByUsername(req.params.username);
        if (!target) {
            return res.status(404).json({ error: 'User not found' });
        }

        await db.query(
            'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
            [req.userId, target.id]
        );
        res.json({ following: false });
    } catch (err) {
        next(err);
    }
});

// GET /api/users/:username -> public profile
router.get('/:username', optionalAuth, async (req, res, next) => {
    try {
        const rows = await db.query(`${PROFILE_SELECT} WHERE u.username = ?`, [req.params.username]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const row = rows[0];
        let isFollowing = false;

        if (req.userId && req.userId !== row.id) {
            const followRows = await db.query(
                'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1',
                [req.userId, row.id]
            );
            isFollowing = followRows.length > 0;
        }

        res.json(toProfile(row, { isFollowing }));
    } catch (err) {
        next(err);
    }
});

export default router;
