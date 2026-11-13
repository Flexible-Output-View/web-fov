import { randomBytes } from 'crypto';
import db from './db.js';

const STREAM_KEY_PREFIX = 'fov_';
const STREAM_KEY_BYTES = 32;
const STREAM_KEY_ATTEMPTS = 5;
const MAX_STREAM_KEY_LENGTH = 64;

export const STREAM_VISIBILITIES = ['public', 'unlisted', 'private'];

const SETTINGS_SELECT = `
    SELECT
        ss.user_id,
        ss.stream_key,
        ss.title,
        ss.description,
        ss.visibility,
        ss.thumbnail_url,
        ss.category_id,
        ss.created_at,
        ss.updated_at,
        u.username,
        u.avatar_url,
        c.name AS category_name
    FROM stream_settings ss
    JOIN users u ON u.id = ss.user_id
    LEFT JOIN categories c ON c.id = ss.category_id
`;

/**
 * Stream keys are shown to their owner, so they are stored as-is (not hashed).
 * They must stay cryptographically random: 32 bytes of entropy, base64url.
 */
export function generateStreamKey() {
    return `${STREAM_KEY_PREFIX}${randomBytes(STREAM_KEY_BYTES).toString('base64url')}`;
}

export function isStreamKeyFormat(value) {
    return typeof value === 'string'
        && value.length >= 8
        && value.length <= MAX_STREAM_KEY_LENGTH
        && /^[A-Za-z0-9_-]+$/.test(value);
}

export function toPublicStreamId(userId) {
    return `u${Number(userId)}`;
}

/**
 * Public stream ids for registered users are `u<userId>`, which keeps the
 * secret stream key out of HLS paths and shared stream URLs.
 */
export function parseUserStreamId(streamId) {
    if (typeof streamId !== 'string') {
        return null;
    }
    const match = /^u(\d+)$/.exec(streamId);
    if (!match) {
        return null;
    }
    const userId = Number.parseInt(match[1], 10);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export function serializeSettings(row, { includeKey = true } = {}) {
    if (!row) {
        return null;
    }

    const settings = {
        streamId: toPublicStreamId(row.user_id),
        title: row.title || '',
        description: row.description || '',
        visibility: row.visibility || 'public',
        thumbnailUrl: row.thumbnail_url || '',
        categoryId: row.category_id === null || row.category_id === undefined
            ? null
            : Number(row.category_id),
        category: row.category_name || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };

    if (includeKey) {
        settings.streamKey = row.stream_key;
    }

    return settings;
}

async function findUser(userId) {
    const rows = await db.query('SELECT id, username FROM users WHERE id = ?', [userId]);
    return rows.length > 0 ? rows[0] : null;
}

export async function findSettingsByUserId(userId) {
    const rows = await db.query(`${SETTINGS_SELECT} WHERE ss.user_id = ? LIMIT 1`, [userId]);
    return rows.length > 0 ? rows[0] : null;
}

export async function findSettingsByStreamKey(streamKey) {
    if (!isStreamKeyFormat(streamKey)) {
        return null;
    }
    const rows = await db.query(`${SETTINGS_SELECT} WHERE ss.stream_key = ? LIMIT 1`, [streamKey]);
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Get the caller's settings, creating them (and their stream key) on first use.
 * Returns null when the authenticated user no longer exists.
 */
export async function getOrCreateSettings(userId) {
    const user = await findUser(userId);
    if (!user) {
        return null;
    }

    let inserted = false;
    for (let attempt = 0; attempt < STREAM_KEY_ATTEMPTS; attempt += 1) {
        const streamKey = generateStreamKey();
        try {
            await db.query(
                `INSERT INTO stream_settings (user_id, stream_key, title)
                 VALUES (?, ?, ?)
                 ON CONFLICT (user_id) DO NOTHING`,
                [userId, streamKey, user.username]
            );
            inserted = true;
            break;
        } catch (err) {
            // Extremely unlikely key collision: retry with a fresh key.
            if (err.code !== '23505') {
                throw err;
            }
        }
    }

    if (!inserted) {
        throw new Error('Unable to generate a unique stream key');
    }

    return findSettingsByUserId(userId);
}

const UPDATE_COLUMNS = {
    title: 'title',
    description: 'description',
    visibility: 'visibility',
    thumbnailUrl: 'thumbnail_url',
    categoryId: 'category_id'
};

/** Partial update: only keys present in `updates` are written. */
export async function updateSettings(userId, updates = {}) {
    const clauses = [];
    const params = [];

    for (const [field, column] of Object.entries(UPDATE_COLUMNS)) {
        if (updates[field] !== undefined) {
            clauses.push(`${column} = ?`);
            params.push(updates[field]);
        }
    }

    if (clauses.length > 0) {
        clauses.push('updated_at = NOW()');
        params.push(userId);
        await db.query(
            `UPDATE stream_settings SET ${clauses.join(', ')} WHERE user_id = ?`,
            params
        );
    }

    return findSettingsByUserId(userId);
}

/** Replace the caller's key. The previous key stops working immediately. */
export async function rotateStreamKey(userId) {
    for (let attempt = 0; attempt < STREAM_KEY_ATTEMPTS; attempt += 1) {
        const streamKey = generateStreamKey();
        try {
            const rows = await db.query(
                `UPDATE stream_settings
                 SET stream_key = ?, updated_at = NOW()
                 WHERE user_id = ?
                 RETURNING user_id`,
                [streamKey, userId]
            );
            if (!rows || rows.length === 0) {
                return null;
            }
            return findSettingsByUserId(userId);
        } catch (err) {
            if (err.code !== '23505') {
                throw err;
            }
        }
    }

    throw new Error('Unable to generate a unique stream key');
}
