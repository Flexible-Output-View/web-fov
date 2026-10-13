import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const MAX_MESSAGE_LENGTH = 500;

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

export async function lookupUsername(userId) {
    const rows = await db.query('SELECT username FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows && rows.length > 0 ? rows[0].username : null;
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

// POST /api/chat/:streamId — authenticated users only.
// Messages are ephemeral: they are broadcast to connected clients and never stored,
// so a viewer joining later (or after a stream restart) starts with an empty chat.
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

        const message = buildMessage(
            {
                id: `mem-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
                stream_id: streamId,
                user_id: req.user.id,
                message: text,
                created_at: new Date().toISOString()
            },
            username
        );

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
