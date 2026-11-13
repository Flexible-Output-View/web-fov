import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { ffmpegProcesses } from '../mediaServer.mjs';
import {
    STREAM_VISIBILITIES,
    getOrCreateSettings,
    rotateStreamKey,
    serializeSettings,
    toPublicStreamId,
    updateSettings
} from '../streamSettings.js';

const router = express.Router();

const MAX_IMAGE_LENGTH = 5 * 1024 * 1024; // 5 MB data URL (front resizes images client-side)
const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;

// These responses contain a secret (the stream key): never cache them.
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    next();
});

function validateUpdate(body = {}) {
    const errors = {};
    const updates = {};

    if (body.title !== undefined) {
        if (typeof body.title !== 'string') {
            errors.title = 'Title must be a string';
        } else {
            const title = body.title.trim();
            if (title.length === 0) {
                errors.title = 'Title is required';
            } else if (title.length > MAX_TITLE_LENGTH) {
                errors.title = `Title must be at most ${MAX_TITLE_LENGTH} characters`;
            } else {
                updates.title = title;
            }
        }
    }

    if (body.description !== undefined) {
        if (typeof body.description !== 'string' || body.description.length > MAX_DESCRIPTION_LENGTH) {
            errors.description = `Description must be a string of at most ${MAX_DESCRIPTION_LENGTH} characters`;
        } else {
            updates.description = body.description;
        }
    }

    if (body.visibility !== undefined) {
        if (!STREAM_VISIBILITIES.includes(body.visibility)) {
            errors.visibility = `Visibility must be one of: ${STREAM_VISIBILITIES.join(', ')}`;
        } else {
            updates.visibility = body.visibility;
        }
    }

    if (body.thumbnailUrl !== undefined) {
        if (typeof body.thumbnailUrl !== 'string' || body.thumbnailUrl.length > MAX_IMAGE_LENGTH) {
            errors.thumbnailUrl = 'Thumbnail must be a string of at most 5 MB';
        } else {
            updates.thumbnailUrl = body.thumbnailUrl;
        }
    }

    if (body.categoryId !== undefined) {
        if (body.categoryId === null) {
            updates.categoryId = null;
        } else if (!Number.isInteger(body.categoryId) || body.categoryId <= 0) {
            errors.categoryId = 'Category id must be a positive integer';
        } else {
            updates.categoryId = body.categoryId;
        }
    }

    return { errors, updates };
}

function withLiveStatus(row) {
    const settings = serializeSettings(row);
    return {
        ...settings,
        isLive: ffmpegProcesses.has(settings.streamId)
    };
}

function streamKeyResponse(row) {
    const streamId = toPublicStreamId(row.user_id);
    return {
        streamKey: row.stream_key,
        streamId,
        isLive: ffmpegProcesses.has(streamId),
        updatedAt: row.updated_at
    };
}

// GET /api/streams/me -> own stream configuration (created on first access)
router.get('/', requireAuth, async (req, res, next) => {
    try {
        const row = await getOrCreateSettings(req.userId);
        if (!row) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        res.json(withLiveStatus(row));
    } catch (err) {
        next(err);
    }
});

// PUT /api/streams/me -> partial update of the stream properties
router.put('/', requireAuth, async (req, res, next) => {
    const { errors, updates } = validateUpdate(req.body ?? {});

    if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
    }

    try {
        const existing = await getOrCreateSettings(req.userId);
        if (!existing) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (updates.categoryId !== undefined && updates.categoryId !== null) {
            const categories = await db.query('SELECT id FROM categories WHERE id = ?', [updates.categoryId]);
            if (!categories || categories.length === 0) {
                return res.status(400).json({ errors: { categoryId: 'Unknown category' } });
            }
        }

        const row = await updateSettings(req.userId, updates);
        if (!row) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        res.json(withLiveStatus(row));
    } catch (err) {
        next(err);
    }
});

// GET /api/streams/me/stream-key -> retrieve the current key
router.get('/stream-key', requireAuth, async (req, res, next) => {
    try {
        const row = await getOrCreateSettings(req.userId);
        if (!row) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        res.json(streamKeyResponse(row));
    } catch (err) {
        next(err);
    }
});

// POST /api/streams/me/stream-key/rotate -> replace the key (old one is revoked)
router.post('/stream-key/rotate', requireAuth, async (req, res, next) => {
    try {
        const existing = await getOrCreateSettings(req.userId);
        if (!existing) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const row = await rotateStreamKey(req.userId);
        if (!row) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        res.json(streamKeyResponse(row));
    } catch (err) {
        next(err);
    }
});

export default router;
