import express from "express";
import fs from "fs";
import path from "path";
import cors from 'cors';
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import net from "net";

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), "media");
const HLS_DIR = path.join(MEDIA_ROOT, "hls");

// ensure the directory exists
await fs.promises.mkdir(HLS_DIR, { recursive: true });

// Map to store multiple FFmpeg processes: streamId -> { process, tracks, socket }
const ffmpegProcesses = new Map();
// Map to store registered streams awaiting connection: streamId -> { tracks, srtServer, port }
const registeredStreams = new Map();
const baseSrtPort = parseInt(process.env.SRT_PORT || "9999", 10);

// Clear all HLS files
function clearHLSFiles() {
    return;
    try {
        for (const file of fs.readdirSync(HLS_DIR)) {
            fs.rm(path.join(HLS_DIR, file), { recursive: true, force: true });
        }
        console.log("🧹 HLS directory cleared");
    } catch (err) {
        console.error("⚠️ Failed to clear HLS directory:", err);
    }
}

// Clear HLS files for a specific stream
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
        // map video + optional audio
        mapArgs.push("-map", `0:v:${i}`);
        mapArgs.push("-map", "0:a?");

        // audio codec copy per output audio stream
        audioCodecArgs.push(`-c:a:${i}`, "copy");

        // HLS variant mapping
        varStreamEntries.push(`v:${i},a:${i}`);
    }

    // Use SRT URL or pipe as input
    const inputSource = srtUrl ? `${srtUrl}?mode=listener` : "pipe:";

    const ffmpegArgs = [
        "-analyzeduration", "0",
        "-fflags", "nobuffer",
        "-i", inputSource,

        ...mapArgs,

        "-c:v", "copy",
        ...audioCodecArgs,

        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "5",
        "-hls_flags", "delete_segments+independent_segments",

        "-hls_segment_filename", path.join(streamHlsDir, "%v", "seg%03d.ts"),

        "-var_stream_map", varStreamEntries.join(" "),

        path.join(streamHlsDir, "%v", "playlist.m3u8")
    ];

    return ffmpegArgs;
}

// Start FFmpeg process and pipe socket data to it
function startFFmpegListener(streamId, tracks, socket, srtUrl = null) {
    if (!tracks || tracks === 0) {
        if (socket) socket.destroy();
        return;
    }

    const ffmpegArgs = buildFfmpegArgs(tracks, streamId, srtUrl);

    console.log(`📀 Spawning FFmpeg for stream ${streamId}:`, "ffmpeg", ffmpegArgs.join(" "));

    const stdio = srtUrl ? ["inherit", "inherit", "inherit"] : ["pipe", "inherit", "inherit"];
    const ffmpegProc = spawn("ffmpeg", ffmpegArgs, { stdio });

    // Pipe socket data to FFmpeg stdin only if socket is provided
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

    // Store process and metadata
    ffmpegProcesses.set(streamId, {
        process: ffmpegProc,
        tracks,
        socket,
        stopped: false
    });
}

async function startMediaServer() {
    // Static Express server to serve HLS files
    const app = express();
    app.use(cors());
    app.use("/hls", express.static(HLS_DIR));

    const httpPort = process.env.MEDIA_HTTP_PORT || 8000;

    clearHLSFiles();

    // parse JSON bodies for control routes
    app.use(express.json());

    // POST /ffmpeg/register — register a stream and create a unique SRT listener
    app.post("/ffmpeg/register", (req, res) => {
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
            // Find next available port
            let srtPort = baseSrtPort;
            while (Array.from(registeredStreams.values()).some(s => s.port === srtPort)) {
                srtPort++;
            }

            const srtUrl = `srt://127.0.0.1:${srtPort}`;
            const srtUrlExternal = `srt://127.0.0.1:${srtPort}?mode=caller`;

            // Start FFmpeg listener immediately with SRT URL
            startFFmpegListener(streamId, trackNum, null, srtUrl);

            registeredStreams.set(streamId, {
                tracks: trackNum,
                port: srtPort,
                srtUrl
            });

            console.log(`📝 Stream registered & FFmpeg started: ${streamId} (tracks=${trackNum}, port=${srtPort})`);

            return res.status(200).json({
                status: "registered",
                streamId,
                tracks: trackNum,
                srtUrl: srtUrlExternal,
                hlsUrl: `/hls/${streamId}/0/playlist.m3u8`,
                instructions: {
                    step1: `Send stream to ${srtUrl}`,
                    step2: `Stream will be available at: http://localhost:${httpPort}${'/hls/' + streamId + '/0/playlist.m3u8'}`
                }
            });
        } catch (err) {
            console.error(`⚠️ Failed to register stream ${streamId}:`, err);
            return res.status(500).json({ error: "Failed to register stream" });
        }
    });

    // POST /ffmpeg/stop — request FFmpeg to stop for a specific stream
    app.post("/ffmpeg/stop", (req, res) => {
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
    app.get("/ffmpeg/status", (req, res) => {
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
                    srtUrl: registered ? `srt://localhost:${registered.port}?mode=caller` : null
                });
            }

            return res.status(200).json({ streamId, status: "not_found" });
        }

        // Return all streams
        const allStreams = {};

        for (const [id, data] of ffmpegProcesses.entries()) {
            const registered = registeredStreams.get(id);
            allStreams[id] = {
                status: "active",
                running: true,
                pid: data.process.pid,
                tracks: data.tracks,
                hlsUrl: `/hls/${id}/0/playlist.m3u8`,
                srtUrl: registered ? `srt://localhost:${registered.port}?mode=caller` : null,
                srtPort: registered ? registered.port : null
            };
        }

        return res.status(200).json({
            totalStreams: ffmpegProcesses.size,
            activeStreams: ffmpegProcesses.size,
            streams: allStreams
        });
    });

    app.listen(httpPort, () => {
        console.log(`📺 Serving HLS at http://localhost:${httpPort}/hls`);
    });

    console.log("🚀 Media server ready!");
    console.log(`   📝 Register stream: POST http://localhost:${httpPort}/ffmpeg/register with {"tracks": 2}`);
    console.log(`   🔗 FFmpeg starts immediately with its own SRT URL`);
    console.log(`   📊 Check status: GET http://localhost:${httpPort}/ffmpeg/status`);
}

export { startMediaServer };
