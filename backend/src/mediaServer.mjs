import express from "express";
import fs from "fs";
import path from "path";
import cors from 'cors';
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import http from "http";

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), "media");
const HLS_DIR = path.join(MEDIA_ROOT, "hls");

// MediaMTX configuration
const MEDIAMTX_HOST = process.env.MEDIAMTX_HOST || "localhost";
const MEDIAMTX_RTMP_PORT = process.env.MEDIAMTX_RTMP_PORT || "1935";
const SRT_URL = process.env.SRT_URL || "127.0.0.1";

await fs.promises.mkdir(HLS_DIR, { recursive: true });

// Map to store FFmpeg processes: streamId -> { process, tracks, startedAt }
const ffmpegProcesses = new Map();
// Map to track registered streams: streamId -> { tracks, registeredAt }
const registeredStreams = new Map();

function clearStreamHLSFiles(streamId) {
    try {
        const streamHlsDir = path.join(HLS_DIR, streamId);
        if (fs.existsSync(streamHlsDir)) {
            fs.rmSync(streamHlsDir, { recursive: true, force: true });
            console.log(`🧹 HLS directory cleared for stream ${streamId}`);
        }
    } catch (err) {
        console.error(`⚠️ Failed to clear HLS directory for stream ${streamId}:`, err);
    }
}

function buildFfmpegArgs(videoTrackCount, streamId, rtmpUrl) {
    const streamHlsDir = path.join(HLS_DIR, streamId);
    const mapArgs = [];
    const audioCodecArgs = [];
    const varStreamEntries = [];

    for (let i = 0; i < videoTrackCount; i++) {
        mapArgs.push("-map", `0:v:${i}`);
        mapArgs.push("-map", "0:a?");
        audioCodecArgs.push(`-c:a:${i}`, "copy");
        varStreamEntries.push(`v:${i},a:${i}`);
    }

    const ffmpegArgs = [
        "-err_detect", "ignore_err",
        "-fflags", "+genpts+discardcorrupt+igndts",
        "-flags", "low_delay",
        "-strict", "experimental",
        "-i", rtmpUrl,
        ...mapArgs,
        "-c:v", "copy",
        ...audioCodecArgs,
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "15",
        "-hls_flags", "delete_segments+independent_segments+omit_endlist",
        "-hls_segment_type", "mpegts",
        "-hls_segment_filename", path.join(streamHlsDir, "%v", "seg%05d.ts"),
        "-var_stream_map", varStreamEntries.join(" "),
        path.join(streamHlsDir, "%v", "playlist.m3u8")
    ];

    return ffmpegArgs;
}

function startFFmpegListener(streamId, tracks, rtmpUrl) {
    if (!tracks || tracks === 0) {
        return;
    }

    const ffmpegArgs = buildFfmpegArgs(tracks, streamId, rtmpUrl);
    console.log(`📀 Spawning FFmpeg for stream ${streamId}:`, "ffmpeg", ffmpegArgs.join(" "));

    const ffmpegProc = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "inherit", "inherit"] });

    ffmpegProc.on("exit", (code, signal) => {
        console.log(`ℹ️ FFmpeg for stream ${streamId} exited (code=${code} signal=${signal})`);
        clearStreamHLSFiles(streamId);
        ffmpegProcesses.delete(streamId);
        console.log(`📊 Active streams: ${ffmpegProcesses.size}`);
    });

    ffmpegProc.on("error", (err) => {
        console.error(`⚠️ FFmpeg spawn failed for stream ${streamId}:`, err);
    });

    ffmpegProcesses.set(streamId, {
        process: ffmpegProc,
        tracks,
        startedAt: new Date().toISOString()
    });
}

function createMediaRoutes() {
    const router = express.Router();

    router.use(cors({
        origin: '*',
        methods: ['GET', 'HEAD', 'OPTIONS'],
        allowedHeaders: ['Range', 'Content-Type', 'Cache-Control'],
        exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges']
    }));

    router.use("/hls", (req, res, next) => {
        if (req.path.endsWith('.m3u8')) {
            res.set({
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/vnd.apple.mpegurl'
            });
        } else if (req.path.endsWith('.ts')) {
            res.set({
                'Cache-Control': 'public, max-age=30',
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'video/mp2t'
            });
        }
        next();
    }, express.static(HLS_DIR, {
        etag: false,
        lastModified: false
    }));

    router.use(express.json());

    // POST /ffmpeg/register — register a stream and spawn FFmpeg
    router.post("/ffmpeg/register", (req, res) => {
        const { tracks, streamId: providedStreamId } = req.body ?? {};
        const trackNum = Number.parseInt(tracks, 10);

        if (!Number.isInteger(trackNum) || trackNum <= 0) {
            return res.status(400).json({ error: "Invalid 'tracks' parameter. Must be a positive integer." });
        }

        const streamId = providedStreamId || randomUUID();

        if (registeredStreams.has(streamId)) {
            return res.status(409).json({ error: "StreamId already registered", streamId });
        }

        try {
            const mediamtxStreamId = `publish:${streamId}`;
            const srtUrlExternal = `srt://${SRT_URL}:9999?mode=caller&streamid=${mediamtxStreamId}`;
            const rtmpUrl = `rtmp://${MEDIAMTX_HOST}:${MEDIAMTX_RTMP_PORT}/${streamId}`;

            // Start FFmpeg listener to pull from MediaMTX RTMP
            startFFmpegListener(streamId, trackNum, rtmpUrl);

            registeredStreams.set(streamId, {
                tracks: trackNum,
                registeredAt: new Date().toISOString()
            });

            console.log(`📝 Stream registered: ${streamId} (tracks=${trackNum})`);

            const hlsUrls = {};
            for (let i = 0; i < trackNum; i++) {
                hlsUrls[`track_${i}`] = `/hls/${streamId}/${i}/playlist.m3u8`;
            }

            return res.status(200).json({
                status: "registered",
                streamId,
                tracks: trackNum,
                srtUrl: srtUrlExternal,
                hlsUrls,
                instructions: {
                    step1: `Send SRT stream with ${trackNum} video track(s) to:`,
                    step2: `${srtUrlExternal}`,
                    step3: `FFmpeg will split tracks into separate HLS playlists`,
                    tracks: hlsUrls
                }
            });
        } catch (err) {
            console.error(`⚠️ Failed to register stream ${streamId}:`, err);
            return res.status(500).json({ error: "Failed to register stream" });
        }
    });

    // POST /ffmpeg/stop — stop FFmpeg for a stream
    router.post("/ffmpeg/stop", (req, res) => {
        const { streamId } = req.body ?? {};

        if (!streamId) {
            return res.status(400).json({ error: "Missing 'streamId' parameter" });
        }

        const streamData = ffmpegProcesses.get(streamId);
        const registered = registeredStreams.get(streamId);

        if (!streamData && !registered) {
            return res.status(200).json({ status: "not_found", streamId });
        }

        try {
            if (streamData) {
                if (streamData.process) {
                    const pid = streamData.process.pid;
                    streamData.process.kill("SIGINT");
                    console.log(`⏹️ FFmpeg stop requested for stream ${streamId} (pid=${pid})`);
                }
                ffmpegProcesses.delete(streamId);
            }

            if (registered) {
                registeredStreams.delete(streamId);
                console.log(`🗑️ Stream unregistered: ${streamId}`);
            }

            clearStreamHLSFiles(streamId);
            return res.status(200).json({ status: "stopped", streamId });
        } catch (err) {
            console.error(`⚠️ Failed to stop stream ${streamId}:`, err);
            return res.status(500).json({ error: "Failed to stop stream" });
        }
    });

    // GET /ffmpeg/status — get stream status
    router.get("/ffmpeg/status", (req, res) => {
        const { streamId } = req.query;

        if (streamId) {
            const streamData = ffmpegProcesses.get(streamId);
            const registered = registeredStreams.get(streamId);

            if (streamData || registered) {
                const trackCount = registered?.tracks || streamData?.tracks || 0;
                const hlsUrls = {};
                for (let i = 0; i < trackCount; i++) {
                    hlsUrls[`track_${i}`] = `/hls/${streamId}/${i}/playlist.m3u8`;
                }

                return res.status(200).json({
                    streamId,
                    status: streamData ? "active" : "registered",
                    running: !!streamData,
                    pid: streamData?.process?.pid,
                    tracks: trackCount,
                    hlsUrls,
                    startedAt: streamData?.startedAt,
                    registeredAt: registered?.registeredAt
                });
            }

            return res.status(200).json({ streamId, status: "not_found" });
        }

        // Return all streams
        const allStreams = {};
        for (const [id, data] of ffmpegProcesses.entries()) {
            const registered = registeredStreams.get(id);
            const trackCount = data.tracks;
            const hlsUrls = {};
            for (let i = 0; i < trackCount; i++) {
                hlsUrls[`track_${i}`] = `/hls/${id}/${i}/playlist.m3u8`;
            }
            allStreams[id] = {
                status: "active",
                running: true,
                pid: data.process?.pid,
                tracks: trackCount,
                hlsUrls,
                startedAt: data.startedAt
            };
        }

        return res.status(200).json({
            totalStreams: ffmpegProcesses.size,
            activeStreams: ffmpegProcesses.size,
            streams: allStreams
        });
    });

    return router;
}

async function startMediaServer() {
    console.log("🚀 Media server ready with MediaMTX + FFmpeg!");
    console.log(`   📡 MediaMTX SRT listener: srt://0.0.0.0:9999`);
    console.log(`   🎬 FFmpeg converts multi-track streams to separate HLS tracks`);
    console.log(`   📝 Register stream: POST http://localhost:4000/ffmpeg/register with {"tracks": 2}`);
    console.log(`   📊 Check status: GET http://localhost:4000/ffmpeg/status`);
    console.log(`   🎥 Access tracks: /hls/{streamId}/0/playlist.m3u8, /hls/{streamId}/1/playlist.m3u8, etc`);
}

export { createMediaRoutes, startMediaServer };
