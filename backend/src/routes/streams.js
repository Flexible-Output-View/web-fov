import express from 'express';
const router = express.Router();
import db from '../db.js';
import fs from 'fs';
import path from 'path';

function isPlaylistReady(playlistPath, minSegments = 2) {
  try {
    if (!fs.existsSync(playlistPath)) {
      return false;
    }
    
    const content = fs.readFileSync(playlistPath, 'utf8');
    
    if (!content.includes('#EXTM3U')) {
      return false;
    }
    
    const segmentMatches = content.match(/\.ts/g);
    if (!segmentMatches) {
      return false;
    }
    
    return segmentMatches.length >= minSegments;
  } catch (err) {
    console.error(`Error checking playlist ${playlistPath}:`, err.message);
    return false;
  }
}

function getSegmentCount(playlistPath) {
  try {
    if (!fs.existsSync(playlistPath)) {
      return 0;
    }
    const content = fs.readFileSync(playlistPath, 'utf8');
    const segmentMatches = content.match(/\.ts/g);
    return segmentMatches ? segmentMatches.length : 0;
  } catch (err) {
    return 0;
  }
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query('SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/available', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const HLS_DIR = path.join(process.cwd(), "media", "hls");

    if (!fs.existsSync(HLS_DIR)) {
      return res.status(200).json({
        tracks: [],
        videoCount: 0,
        ready: false,
        message: 'HLS directory does not exist yet'
      });
    }

    let dirs;
    try {
      dirs = fs.readdirSync(HLS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .sort((a, b) => parseInt(a) - parseInt(b));
    } catch (err) {
      return res.status(200).json({
        tracks: [],
        videoCount: 0,
        ready: false,
        message: 'Cannot read HLS directory'
      });
    }

    if (dirs.length === 0) {
      return res.status(200).json({
        tracks: [],
        videoCount: 0,
        ready: false,
        message: 'No track directories found'
      });
    }

    const httpPort = `localhost:${process.env.MEDIA_HTTP_PORT || 8000}`;
    const protocol = req.protocol || 'http';

    const readyTracks = [];
    const pendingTracks = [];

    for (const id of dirs) {
      const playlistPath = path.join(HLS_DIR, id, 'playlist.m3u8');
      const segmentCount = getSegmentCount(playlistPath);
      
      if (isPlaylistReady(playlistPath, 2)) {
        readyTracks.push({
          index: readyTracks.length,
          name: id,
          videoUrl: `${protocol}://${httpPort}/hls/${id}/playlist.m3u8`,
          segments: segmentCount
        });
      } else {
        pendingTracks.push({
          name: id,
          segments: segmentCount,
          exists: fs.existsSync(playlistPath)
        });
      }
    }

    if (pendingTracks.length > 0) {
      console.log(`[/available] ${readyTracks.length} ready, ${pendingTracks.length} pending:`, 
        pendingTracks.map(t => `${t.name}(${t.segments} segs, exists=${t.exists})`).join(', '));
    }

    res.status(200).json({
      tracks: readyTracks,
      videoCount: readyTracks.length,
      ready: readyTracks.length > 0,
      pending: pendingTracks.length,
      totalDirs: dirs.length
    });
  } catch (err) {
    console.error('[/available] Error:', err);
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
