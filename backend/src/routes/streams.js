import express from 'express';
const router = express.Router();
import db from '../db.js';
import fs from 'fs';
import path from 'path';
import { ffmpegProcesses } from '../mediaServer.mjs';
import {
    buildSeparatedAvailableTracks,
    probeTrackHasVideo,
    probeTrackHasAudio,
    sortTrackIds
} from '../streamTrackUtils.js';
import { optionalAuth } from '../middleware/auth.js';
import { sanitizeVisitorId, viewerPresence } from '../viewerPresence.js';
import streamSettingsRouter from './streamSettings.js';
import { parseUserStreamId } from '../streamSettings.js';

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
const HLS_DIR = path.join(MEDIA_ROOT, 'hls');

// Authenticated stream configuration endpoints. Mounted before `/:id` so
// `/api/streams/me` is never interpreted as a stream id.
router.use('/me', streamSettingsRouter);

/*function isPlaylistReady(playlistPath, minSegments = 2) {
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
}*/

/*function getSegmentCount(playlistPath) {
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
}*/

/*function getCurrentTracksState(protocol = 'http') {
    try {
        if (!fs.existsSync(HLS_DIR)) {
            return {
                tracks: [],
                videoCount: 0,
                ready: false,
                pending: 0,
                totalDirs: 0,
                message: 'HLS directory does not exist yet'
            };
        }

        let dirs;
        try {
            dirs = fs.readdirSync(HLS_DIR, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name)
                .sort((a, b) => parseInt(a) - parseInt(b));
        } catch (err) {
            return {
                tracks: [],
                videoCount: 0,
                ready: false,
                pending: 0,
                totalDirs: 0,
                message: 'Cannot read HLS directory'
            };
        }

        if (dirs.length === 0) {
            return {
                tracks: [],
                videoCount: 0,
                ready: false,
                pending: 0,
                totalDirs: 0,
                message: 'No track directories found'
            };
        }

        const httpPort = `localhost:${process.env.PORT || 4000}`;
        const readyTracks = [];
        const pendingTracks = [];

        for (const id of dirs) {
            const playlistPath = path.join(HLS_DIR, id, 'playlist.m3u8');
            const segmentCount = getSegmentCount(playlistPath);

            if (isPlaylistReady(playlistPath, 2)) {
                readyTracks.push({
                    index: readyTracks.length,
                    name: id,
                    videoUrl: `${protocol}://${httpPort}/api/hls/${id}/playlist.m3u8`,
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

        return {
            tracks: readyTracks,
            videoCount: readyTracks.length,
            ready: readyTracks.length > 0 && pendingTracks.length === 0 && readyTracks.length === dirs.length,
            pending: pendingTracks.length,
            totalDirs: dirs.length
        };
    } catch (err) {
        console.error('[getCurrentTracksState] Error:', err);
        return {
            tracks: [],
            videoCount: 0,
            ready: false,
            pending: 0,
            totalDirs: 0,
            message: 'Error reading tracks'
        };
    }
}*/

async function buildTracks(streamId, trackDirs, url) {
    const trackOptions = { hlsDir: HLS_DIR, ffmpegProcesses };
    const separated = buildSeparatedAvailableTracks(streamId, trackDirs, url, trackOptions);
    if (separated && separated.length > 0) {
        return separated;
    }

    const sortedTrackIds = sortTrackIds(trackDirs);
    const tracks = [];
    let videoIndex = 0;
    let audioIndex = 0;

    for (const variantId of sortedTrackIds) {
        const trackPath = path.join(HLS_DIR, streamId, variantId);
        const hasVideo = await probeTrackHasVideo(trackPath);
        const hasAudio = await probeTrackHasAudio(trackPath);

        if (hasVideo) {
            tracks.push({
                trackId: `v:${videoIndex}`,
                name: `Video ${videoIndex}`,
                videoUrl: `${url}/api/hls/${streamId}/${variantId}/playlist.m3u8`,
                isVideo: true,
                isAudio: false
            });
            videoIndex++;
        }

        if (hasAudio) {
            tracks.push({
                trackId: `a:${audioIndex}`,
                name: `Audio ${audioIndex}`,
                videoUrl: `${url}/api/hls/${streamId}/${variantId}/playlist.m3u8`,
                isVideo: false,
                isAudio: true
            });
            audioIndex++;
        }
    }

    return tracks;
}

function isNumericStreamId(streamId) {
    return /^\d+$/.test(streamId);
}

async function fetchUserStreamInfo(userId) {
    const rows = await db.query(
        `SELECT
            ss.user_id,
            ss.title,
            ss.description,
            ss.visibility,
            ss.thumbnail_url,
            c.name AS category,
            u.username,
            u.avatar_url
        FROM stream_settings ss
        JOIN users u ON u.id = ss.user_id
        LEFT JOIN categories c ON c.id = ss.category_id
        WHERE ss.user_id = ?`,
        [userId]
    );

    if (rows.length === 0) {
        return null;
    }

    const row = rows[0];
    return {
        user_id: row.user_id,
        streamer: row.username,
        streamer_username: row.username,
        title: row.title,
        description: row.description,
        visibility: row.visibility,
        category: row.category,
        viewers: 0,
        avatar_url: row.avatar_url,
        thumbnail_url: row.thumbnail_url
    };
}

async function fetchStreamInfo(streamId) {
    if (isNumericStreamId(streamId)) {
        const dbRows = await db.query(
            `SELECT
                s.id,
                s.streamer,
                s.title,
                s.viewers,
                s.avatar_url,
                s.thumbnail_url,
                c.name as category,
                (
                    SELECT u.username
                    FROM users u
                    WHERE LOWER(u.username) = LOWER(s.streamer)
                    ORDER BY u.id
                    LIMIT 1
                ) AS streamer_username
            FROM streams s
            LEFT JOIN categories c ON s.category_id = c.id
            WHERE s.id = ?`,
            [streamId]
        );

        return dbRows.length > 0 ? dbRows[0] : null;
    }

    const userId = parseUserStreamId(streamId);
    if (!userId) {
        return null;
    }

    return fetchUserStreamInfo(userId);
}

/** Whether a stream may appear in discovery listings (`/available`). */
function canDiscover(streamInfo, viewerId) {
    const visibility = streamInfo?.visibility || 'public';
    if (visibility === 'public') {
        return true;
    }
    if (visibility === 'private') {
        return Boolean(viewerId) && streamInfo?.user_id === viewerId;
    }
    return false; // unlisted streams are only reachable via a direct link
}

/** Whether the caller may open a stream page / fetch its tracks. */
function canView(streamInfo, viewerId) {
    const visibility = streamInfo?.visibility || 'public';
    if (visibility === 'public' || visibility === 'unlisted') {
        return true;
    }
    return Boolean(viewerId) && streamInfo?.user_id === viewerId;
}

function buildStreamEntry(streamId, tracks, streamInfo) {
    return {
        streamId,
        trackCount: tracks.length,
        tracks,
        title: streamInfo?.title || '',
        description: streamInfo?.description || '',
        visibility: streamInfo?.visibility || 'public',
        category: streamInfo?.category || '',
        viewers: streamInfo?.viewers || 0,
        streamer: streamInfo?.streamer || '',
        streamerUsername: streamInfo?.streamer_username || null,
        avatarUrl: streamInfo?.avatar_url || '',
        thumbnailUrl: streamInfo?.thumbnail_url || ''
    };
}

function buildBaseUrl(req) {
    const port = process.env.PORT || 4000;
    const rawHost = process.env.API_HOSTNAME || req.get('host') || `localhost:${port}`;
    const normalizedHost = rawHost.trim().replace(/:\s*/, ':');
    const hostUrl = new URL(/^https?:\/\//i.test(normalizedHost) ? normalizedHost : `http://${normalizedHost}`);
    const host = hostUrl.host.replace(/\/api(?:\/.*)?$/i, '');
    const protocol = process.env.API_PROTOCOL || req.protocol || hostUrl.protocol.replace(':', '') || 'http';
    return `${protocol}://${host}`;
}

export function broadcastViewerCount(app, streamId, counts) {
    if (!counts) {
        return;
    }
    const io = app?.get?.('io');
    if (io && typeof io.to === 'function') {
        io.to(`stream:${streamId}`).emit('viewer-count', counts);
    }
}

// Public: every viewer on a stream page reports presence here, authenticated
// or not. Counts are kept in memory and pushed live to the stream room.
router.post('/:id/viewers/heartbeat', optionalAuth, (req, res) => {
    const visitorId = sanitizeVisitorId(req.body?.visitorId);
    if (!visitorId) {
        return res.status(400).json({ error: 'Invalid visitor id' });
    }

    const counts = viewerPresence.touch(req.params.id, visitorId, {
        authenticated: Boolean(req.userId)
    });
    if (!counts) {
        return res.status(400).json({ error: 'Invalid stream id' });
    }

    broadcastViewerCount(req.app, counts.streamId, counts);
    res.json(counts);
});

router.post('/:id/viewers/leave', (req, res) => {
    const visitorId = sanitizeVisitorId(req.body?.visitorId);
    if (!visitorId) {
        return res.status(400).json({ error: 'Invalid visitor id' });
    }

    const counts = viewerPresence.remove(req.params.id, visitorId);
    if (!counts) {
        return res.status(400).json({ error: 'Invalid stream id' });
    }

    broadcastViewerCount(req.app, counts.streamId, counts);
    res.status(204).end();
});

router.get('/', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC');
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.get('/available', optionalAuth, async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store'); // Disable caching
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const url = buildBaseUrl(req);
        const streams = [];

        // Get all stream directories
        const streamDirs = fs.readdirSync(HLS_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        // For each stream, get database info and HLS tracks
        for (const streamId of streamDirs) {
            const isUserStream = Boolean(parseUserStreamId(streamId));

            try {
                const streamInfo = await fetchStreamInfo(streamId);

                // A user stream without settings cannot be attributed safely.
                if (isUserStream && !streamInfo) {
                    continue;
                }

                if (!canDiscover(streamInfo, req.userId)) {
                    continue;
                }

                const streamPath = path.join(HLS_DIR, streamId);
                const trackDirs = fs.readdirSync(streamPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                const tracks = await buildTracks(streamId, trackDirs, url);
                streams.push(buildStreamEntry(streamId, tracks, streamInfo));
            } catch (err) {
                console.error(`Error processing stream ${streamId}: `, err);

                // Never expose an unverified user stream with default metadata.
                if (isUserStream) {
                    continue;
                }

                const streamPath = path.join(HLS_DIR, streamId);
                const trackDirs = fs.readdirSync(streamPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                const tracks = await buildTracks(streamId, trackDirs, url);
                streams.push(buildStreamEntry(streamId, tracks, null));
            }
        }

        res.status(200).json(streams);
    } catch (err) {
        console.error('[/available] Error:', err);
        next(err);
    }
});

// GET /api/streams/:id/live -> one live stream with tracks, visibility-aware.
// This is the direct-link lookup for unlisted streams and for private streams
// opened by their owner.
router.get('/:id/live', optionalAuth, async (req, res, next) => {
    try {
        const streamId = req.params.id;
        const isUserStream = Boolean(parseUserStreamId(streamId));

        if (!isUserStream && !isNumericStreamId(streamId)) {
            return res.status(404).json({ error: 'Stream not found' });
        }

        const streamPath = path.join(HLS_DIR, streamId);
        if (!fs.existsSync(streamPath)) {
            return res.status(404).json({ error: 'Stream not found' });
        }

        const trackDirs = fs.readdirSync(streamPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        if (trackDirs.length === 0) {
            return res.status(404).json({ error: 'Stream not found' });
        }

        const streamInfo = await fetchStreamInfo(streamId);

        if (isUserStream) {
            if (!streamInfo || !canView(streamInfo, req.userId)) {
                return res.status(404).json({ error: 'Stream not found' });
            }
        }

        const tracks = await buildTracks(streamId, trackDirs, buildBaseUrl(req));
        res.json(buildStreamEntry(streamId, tracks, streamInfo));
    } catch (err) {
        next(err);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        if (!isNumericStreamId(req.params.id)) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        const rows = await db.query(
            `SELECT
                s.id,
                s.streamer,
                s.title,
                s.category_id,
                s.viewers,
                s.thumbnail_url,
                s.avatar_url,
                s.is_live,
                (
                    SELECT u.username
                    FROM users u
                    WHERE LOWER(u.username) = LOWER(s.streamer)
                    ORDER BY u.id
                    LIMIT 1
                ) AS "streamerUsername"
            FROM streams s
            WHERE s.id = ?`,
            [req.params.id]
        );
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Stream not found' });
        }
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
        const hlsUrl = `${protocol}://${host}/api/hls/live/${streamId}/playlist.m3u8`;
        console.log(`DEBUG 111 HLS URL: ${hlsUrl}`);
        res.json({ hls: hlsUrl });
    } catch (err) {
        next(err);
    }
});

export default router;
