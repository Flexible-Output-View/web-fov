import express from "express";
import fs from "fs";
import path from "path";
import cors from 'cors';
import { spawn } from "child_process";
import { randomUUID } from "crypto";

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), "media");
const HLS_DIR = path.join(MEDIA_ROOT, "hls");

await fs.promises.mkdir(HLS_DIR, { recursive: true });

const ffmpegProcesses = new Map();
const registeredStreams = new Map();
const baseSrtPort = parseInt(process.env.SRT_PORT || "9999", 10);

function clearHLSFiles() {
    try {
        if (fs.existsSync(HLS_DIR)) {
            for (const file of fs.readdirSync(HLS_DIR)) {
                fs.rmSync(path.join(HLS_DIR, file), { recursive: true, force: true });
            }
            console.log("🧹 HLS directory cleared");
        }
    } catch (err) {
        console.error("⚠️ Failed to clear HLS directory:", err);
    }
}

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

function buildFfmpegArgs(videoTrackCount, streamId, srtUrl) {
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

    const srtParams = [
        'mode=listener',
        'latency=4000000',
        'rcvbuf=134217728',
        'sndbuf=134217728',
        'peerlatency=4000000',
        'tlpktdrop=0',
        'nakreport=1',
        'connect_timeout=5000',
        'linger=0'
    ].join('&');

    const inputSource = srtUrl
        ? `${srtUrl}?${srtParams}`
        : "pipe:";

    const ffmpegArgs = [
        "-err_detect", "ignore_err",
        "-fflags", "+genpts+discardcorrupt+igndts",
        "-flags", "low_delay",
        "-strict", "experimental",
        "-i", inputSource,
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

function startFFmpegListener(streamId, tracks, socket, srtUrl = null) {
    if (!tracks || tracks === 0) {
        if (socket) socket.destroy();
        return;
    }

    const ffmpegArgs = buildFfmpegArgs(tracks, streamId, srtUrl);

    console.log(`📀 Spawning FFmpeg for stream ${streamId}:`, "ffmpeg", ffmpegArgs.join(" "));

    const stdio = srtUrl ? ["inherit", "inherit", "inherit"] : ["pipe", "inherit", "inherit"];
    const ffmpegProc = spawn("ffmpeg", ffmpegArgs, { stdio });

    if (socket) {
        socket.pipe(ffmpegProc.stdin);
    }

    ffmpegProc.on("exit", (code, signal) => {
        console.log(`ℹ️ FFmpeg for stream ${streamId} exited (code=${code} signal=${signal})`);
        clearStreamHLSFiles(streamId);
        ffmpegProcesses.delete(streamId);
        registeredStreams.delete(streamId);
        console.log(`📊 Active streams: ${ffmpegProcesses.size}`);
        if (socket) socket.destroy();
    });

    ffmpegProc.on("error", (err) => {
        console.error(`⚠️ FFmpeg spawn failed for stream ${streamId}:`, err);
        if (socket) socket.destroy();
    });

    if (socket) {
        socket.on("error", (err) => {
            console.error(`⚠️ Socket error for stream ${streamId}:`, err);
            ffmpegProc.kill("SIGINT");
        });

        socket.on("end", () => {
            console.log(`📴 Socket closed for stream ${streamId}`);
            ffmpegProc.kill("SIGINT");
        });
    }

    ffmpegProcesses.set(streamId, {
        process: ffmpegProc,
        tracks,
        socket,
        stopped: false
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

    // POST /ffmpeg/register — register a stream and create a unique SRT listener
    router.post("/ffmpeg/register", (req, res) => {
        const { tracks, streamId: providedStreamId } = req.body ?? {};
        const trackNum = Number.parseInt(tracks, 10);

        if (!Number.isInteger(trackNum) || trackNum <= 0) {
            return res.status(400).json({ error: "Invalid 'tracks' parameter." });
        }

        const streamId = providedStreamId || randomUUID();

        if (registeredStreams.has(streamId)) {
            return res.status(409).json({ error: "StreamId already registered", streamId });
        }

        try {
            let url = process.env.SRT_URL || '127.0.0.1';
            let srtPort = baseSrtPort;
            while (Array.from(registeredStreams.values()).some(s => s.port === srtPort)) {
                srtPort++;
            }

            const srtUrl = `srt://0.0.0.0:${srtPort}`;

            const srtUrlExternal = [
                `srt://${url}:${srtPort}`,
                '?mode=caller',
                '&latency=4000000',
                '&rcvbuf=134217728',
                '&sndbuf=134217728',
                '&peerlatency=4000000',
                '&tlpktdrop=0',
                '&nakreport=1'
            ].join('');

            startFFmpegListener(streamId, trackNum, null, srtUrl);

            registeredStreams.set(streamId, {
                tracks: trackNum,
                port: srtPort,
                srtUrl
            });

            console.log(`📝 Stream registered: ${streamId} (tracks=${trackNum}, port=${srtPort})`);

            return res.status(200).json({
                status: "registered",
                streamId,
                tracks: trackNum,
                srtUrl: srtUrlExternal,
                hlsUrl: `/hls/${streamId}/0/playlist.m3u8`
            });
        } catch (err) {
            console.error(`⚠️ Failed to register stream ${streamId}:`, err);
            return res.status(500).json({ error: "Failed to register stream" });
        }
    });

    // POST /ffmpeg/stop — request FFmpeg to stop for a specific stream
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
                if (streamData.socket) {
                    streamData.socket.destroy();
                }
                ffmpegProcesses.delete(streamId);
            }

            if (registered) {
                registeredStreams.delete(streamId);
                console.log(`🗑️ Cancelled registration for stream ${streamId}`);
            }

            clearStreamHLSFiles(streamId);
            return res.status(200).json({ status: "stopped", streamId });
        } catch (err) {
            console.error(`⚠️ Failed to stop stream ${streamId}:`, err);
            return res.status(500).json({ error: "Failed to stop stream" });
        }
    });

    // GET /ffmpeg/status — get current FFmpeg state for all or a specific stream
    router.get("/ffmpeg/status", (req, res) => {
        const { streamId } = req.query;

        if (streamId) {
            const streamData = ffmpegProcesses.get(streamId);
            const registered = registeredStreams.get(streamId);

            if (streamData) {
                return res.status(200).json({
                    streamId,
                    status: "active",
                    running: true,
                    pid: streamData.process?.pid,
                    tracks: streamData.tracks,
                    hlsUrl: `/hls/${streamId}/0/playlist.m3u8`,
                    srtUrl: registered
                        ? `srt://localhost:${registered.port}?mode=caller&latency=4000000&tlpktdrop=0`
                        : null
                });
            }

            return res.status(200).json({ streamId, status: "not_found" });
        }

        const allStreams = {};

        for (const [id, data] of ffmpegProcesses.entries()) {
            const registered = registeredStreams.get(id);
            allStreams[id] = {
                status: "active",
                running: true,
                pid: data.process.pid,
                tracks: data.tracks,
                hlsUrl: `/hls/${id}/0/playlist.m3u8`,
                srtUrl: registered
                    ? `srt://localhost:${registered.port}?mode=caller&latency=4000000&tlpktdrop=0`
                    : null,
                srtPort: registered ? registered.port : null
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

async function startMediaServer(app) {
    console.log("🚀 Media server ready!");
    console.log(`   📝 Register stream: POST http://localhost/ffmpeg/register with {"tracks": 2}`);
    console.log(`   🔗 FFmpeg starts immediately with its own SRT URL`);
    console.log(`   📊 Check status: GET http://localhost/ffmpeg/status`);
}

export { createMediaRoutes, startMediaServer };
