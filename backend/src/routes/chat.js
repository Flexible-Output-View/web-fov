import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const MAX_MESSAGE_LENGTH = 500;
const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_MAX_LIMIT = 100;
const MEMORY_CAP_PER_STREAM = 200;

const memoryMessages = new Map();

export function buildMessage(row, username, fallbackText, fallbackUserId) {
    return {
        id: row?.id ?? `mem-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        streamId: String(row?.stream_id ?? row?.streamId ?? ''),
        userId: row?.user_id ?? fallbackUserId ?? null,
        username: username ?? row?.username ?? 'unknown',
        message: row?.message ?? fallbackText ?? '',
        createdAt: row?.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row?.created_at ?? new Date().toISOString())
    };
}

export function appendMemoryMessage(streamId, message) {
    const key = String(streamId);
    const list = memoryMessages.get(key) || [];
    list.push(message);
    while (list.length > MEMORY_CAP_PER_STREAM) {
        list.shift();
    }
    memoryMessages.set(key, list);
}

export function getMemoryMessages(streamId, limit = HISTORY_DEFAULT_LIMIT) {
    const list = memoryMessages.get(String(streamId)) || [];
    return list.slice(-limit);
}

export function clearMemoryMessages() {
    memoryMessages.clear();
}

export async function ensureChatTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            stream_id VARCHAR(120) NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message VARCHAR(500) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_chat_messages_stream_id ON chat_messages (stream_id, created_at)');
}

export async function lookupUsername(userId) {
    const rows = await db.query('SELECT username FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows && rows.length > 0 ? rows[0].username : null;
}

export async function insertMessageRow(streamId, userId, text) {
    const rows = await db.query(
        'INSERT INTO chat_messages (stream_id, user_id, message) VALUES (?, ?, ?) RETURNING id, stream_id, user_id, message, created_at',
        [streamId, userId, text]
    );
    return rows[0];
}

function sanitizeStreamId(streamId) {
    if (typeof streamId !== 'string') {
        return null;
    }
    const trimmed = streamId.trim();
    if (!trimmed || trimmed.length > 120) {
        return null;
    }
    return trimmed;
}

function parseLimit(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return HISTORY_DEFAULT_LIMIT;
    }
    return Math.min(parsed, HISTORY_MAX_LIMIT);
}

function toPublicMessage(row) {
    return {
        id: row.id,
        streamId: String(row.stream_id),
        userId: row.user_id,
        username: row.username,
        message: row.message,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
    };
}

// GET /api/chat/:streamId?limit=50 — public, readable without authentication
router.get('/:streamId', async (req, res, next) => {
    try {
        const streamId = sanitizeStreamId(req.params.streamId);
        if (!streamId) {
            return res.status(400).json({ error: 'Invalid stream id' });
        }
        const limit = parseLimit(req.query.limit);

        try {
            const rows = await db.query(
                'SELECT m.id, m.stream_id, m.user_id, u.username, m.message, m.created_at FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.stream_id = ? ORDER BY m.created_at ASC LIMIT ?',
                [streamId, limit]
            );
            return res.json({ streamId, messages: rows.map(toPublicMessage) });
        } catch (err) {
            // Missing table (fresh DB without migration) or DB unavailable:
            // fall back to in-memory history so chat stays readable.
            if (err?.code === '42P01') {
                return res.json({ streamId, messages: getMemoryMessages(streamId, limit) });
            }
            throw err;
        }
    } catch (err) {
        next(err);
    }
});

// POST /api/chat/:streamId — authenticated users only
router.post('/:streamId', requireAuth, async (req, res, next) => {
    try {
        const streamId = sanitizeStreamId(req.params.streamId);
        if (!streamId) {
            return res.status(400).json({ error: 'Invalid stream id' });
        }

        const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
        if (!text) {
            return res.status(400).json({ error: 'Message must not be empty' });
        }
        if (text.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ error: 'Message must be 500 characters or fewer' });
        }

        const username = await lookupUsername(req.user.id);
        if (!username) {
            return res.status(401).json({ error: 'User not found' });
        }

        let message;
        try {
            const row = await insertMessageRow(streamId, req.user.id, text);
            message = buildMessage({ ...row, username }, username);
            message.username = username;
        } catch (err) {
            if (err?.code === '42P01') {
                // Table missing: keep chat working in-memory.
                message = buildMessage(
                    { id: `mem-${Date.now()}-${Math.round(Math.random() * 1e6)}`, stream_id: streamId, created_at: new Date().toISOString() },
                    username,
                    text,
                    req.user.id
                );
            } else {
                throw err;
            }
        }

        appendMemoryMessage(streamId, message);

        const io = req.app?.get?.('io');
        if (io) {
            io.to(`stream:${streamId}`).emit('chat-message', message);
        }

        return res.status(201).json({ message });
    } catch (err) {
        next(err);
    }
});

export default router;
