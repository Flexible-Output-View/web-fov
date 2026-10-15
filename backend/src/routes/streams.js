import express from 'express';
const router = express.Router();
import db from '../db.js';
import fs from 'fs';
import path from 'path';
import { ffmpegProcesses, registeredStreams } from '../mediaServer.mjs';
import {
    buildSeparatedAvailableTracks,
    probeTrackHasVideo,
    probeTrackHasAudio,
    sortTrackIds
} from '../streamTrackUtils.js';

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
const HLS_DIR = path.join(MEDIA_ROOT, 'hls');

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

async function fetchStreamInfo(streamId) {
    if (!isNumericStreamId(streamId)) {
        return null;
    }

    const dbRows = await db.query(
        'SELECT s.id, s.title, s.viewers, s.avatar_url, s.thumbnail_url, c.name as category FROM streams s LEFT JOIN categories c ON s.category_id = c.id WHERE s.id = ?',
        [streamId]
    );

    return dbRows.length > 0 ? dbRows[0] : null;
}

function buildStreamEntry(streamId, tracks, streamInfo) {
    return {
        streamId,
        trackCount: tracks.length,
        tracks,
        protocol: 'hls',
        title: streamInfo?.title || '',
        category: streamInfo?.category || '',
        viewers: streamInfo?.viewers || 0,
        avatarUrl: streamInfo?.avatar_url || '',
        thumbnailUrl: streamInfo?.thumbnail_url || ''
    };
}

function buildStreamEntryMOQ(stream, streamInfo) {
    return {
        streamId: stream.streamId,
        trackCount: stream.tracksA + stream.tracksV,
        tracks: [], // TODO get from moq relay
        protocol: 'moq',
        title: streamInfo?.title || '',
        category: streamInfo?.category || '',
        viewers: streamInfo?.viewers || 0,
        avatarUrl: streamInfo?.avatar_url || '',
        thumbnailUrl: streamInfo?.thumbnail_url || ''
    };
}

router.get('/', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC');
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.get('/available', async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store'); // Disable caching
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const port = process.env.PORT || 4000;
        const rawHost = process.env.API_HOSTNAME || req.get('host') || `localhost:${port}`;
        const normalizedHost = rawHost.trim().replace(/:\s*/, ':');
        const hostUrl = new URL(/^https?:\/\//i.test(normalizedHost) ? normalizedHost : `http://${normalizedHost}`);
        const host = hostUrl.host.replace(/\/api(?:\/.*)?$/i, '');
        const protocol = process.env.API_PROTOCOL || req.protocol || hostUrl.protocol.replace(':', '') || 'http';
        const url = `${protocol}://${host}`;
        const streams = [];

        // Get all stream directories
        const streamDirs = fs.readdirSync(HLS_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        // Get all MoQ streams
        const moqStreams = Array.from(registeredStreams.values()).filter((elm) => (elm.protocol !== undefined && elm.protocol === 'moq'));

        // For each stream, get database info and HLS tracks
        for (const streamId of streamDirs) {
            try {
                const streamInfo = await fetchStreamInfo(streamId);

                const streamPath = path.join(HLS_DIR, streamId);
                const trackDirs = fs.readdirSync(streamPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                const tracks = await buildTracks(streamId, trackDirs, url);
                streams.push(buildStreamEntry(streamId, tracks, streamInfo));
            } catch (err) {
                console.error(`Error processing stream ${streamId}: `, err);
                const streamPath = path.join(HLS_DIR, streamId);
                const trackDirs = fs.readdirSync(streamPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                const tracks = await buildTracks(streamId, trackDirs, url);
                streams.push(buildStreamEntry(streamId, tracks, null));
            }
        }

        for (const stream of moqStreams) {
            streams.push(
                buildStreamEntryMOQ(stream, [], null)
            );
        }
        console.log(streams); // TODO: rm debug line

        res.status(200).json(streams);
    } catch (err) {
        console.error('[/available] Error:', err);
        next(err);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        if (!isNumericStreamId(req.params.id)) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        const rows = await db.query('SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams WHERE id = ?', [req.params.id]);
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
