const express = require('express');
const router = express.Router();
const db = require('../db');
const { config } = require('../mediaServer');

// GET /api/streams -> list streams
router.get('/', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC');
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams WHERE id = ?', [req.params.id]);
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Stream not found' });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

// GET /api/streams/:id/hls -> :id = cle de stream
router.get('/:id/hls', async (req, res, next) => {
    try {
        const streamId = req.params.id;
        const host = req.get('host') || `localhost:${process.env.PORT || 4000}`;
        const protocol = req.protocol || 'http';
        const hlsUrl = `${protocol}://${host}/hls/live/${streamId}/index.m3u8`;
        res.json({ hls: hlsUrl });
    } catch (err) {
        next(err);
    }
});
