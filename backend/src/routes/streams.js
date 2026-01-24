const express = require('express');
const router = express.Router();
const db = require('../db');
const { config } = require('../mediaServer.mjs');
const fs = require('fs');
const path = require('path');

// GET /api/streams -> list streams
router.get('/', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC');
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// GET /api/streams/available -> available streams for player
router.get('/available', async (req, res, next) => {
    try {
        const HLS_DIR = path.join(process.cwd(), "media", "hls");
        const dirs = fs.readdirSync(HLS_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .sort((a, b) => parseInt(a) - parseInt(b)); // sort numerically
        const httpPort = `localhost:${process.env.MEDIA_HTTP_PORT || 8000}`;
        const protocol = req.protocol || 'http';
        const tracks = dirs.map((id, index) => ({
            index: index,
            name: id,
            videoUrl: `${protocol}://${httpPort}/hls/${id}/playlist.m3u8`
        }));
        res.json({
            tracks: tracks,
            videoCount: tracks.length
        });
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
        const hlsUrl = `${protocol}://${host}/hls/live/${streamId}/playlist.m3u8`;
        res.json({ hls: hlsUrl });
    } catch (err) {
        next(err);
    }
});
