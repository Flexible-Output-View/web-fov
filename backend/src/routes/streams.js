import express from 'express';
const router = express.Router();
import db from '../db.js';
import fs from 'fs';
import path from 'path';

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
        res.set('Cache-Control', 'no-store'); // Disable caching
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const HLS_DIR = path.join(process.cwd(), "media", "hls");
        const httpPort = `localhost:${process.env.MEDIA_HTTP_PORT || 8000}`;
        const protocol = req.protocol || 'http';

        const streams = [];

        // Get all stream directories
        const streamDirs = fs.readdirSync(HLS_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        // For each stream, count the number of video tracks
        for (const streamId of streamDirs) {
            const streamPath = path.join(HLS_DIR, streamId);
            const trackDirs = fs.readdirSync(streamPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            const tracks = trackDirs.map((trackId) => ({
                trackId: trackId,
                videoUrl: `${protocol}://${httpPort}/hls/${streamId}/${trackId}/playlist.m3u8`
            }));

            streams.push({
                streamId: streamId,
                trackCount: tracks.length,
                tracks: tracks
            });
        }

        res.status(200).json({
            streams: streams,
            streamCount: streams.length
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

export default router;