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
// Map to store registered streams awaiting connection: streamId -> { tracks }
const registeredStreams = new Map();
const srtServer = net.createServer();

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

function buildFfmpegArgs(videoTrackCount, streamId) {
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

    const ffmpegArgs = [
        "-analyzeduration", "0",
        "-fflags", "nobuffer",
        "-i", "pipe:",

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
function startFFmpegListener(streamId, tracks, socket) {
    if (!tracks || tracks === 0) {
        socket.destroy();
        return;
    }

    const ffmpegArgs = buildFfmpegArgs(tracks, streamId);

    console.log(`📀 Spawning FFmpeg for stream ${streamId}:`, "ffmpeg", ffmpegArgs.join(" "));

    const ffmpegProc = spawn("ffmpeg", ffmpegArgs, { stdio: ["pipe", "inherit", "inherit"] });

    // Pipe socket data to FFmpeg stdin
    socket.pipe(ffmpegProc.stdin);

    ffmpegProc.on("exit", (code, signal) => {
        console.log(`ℹ️ FFmpeg for stream ${streamId} exited (code=${code} signal=${signal})`);
        ffmpegProcesses.delete(streamId);
        console.log(`📊 Active streams: ${ffmpegProcesses.size}`);
        socket.destroy();
    });

    ffmpegProc.on("error", (err) => {
        console.error(`⚠️ FFmpeg spawn failed for stream ${streamId}:`, err);
        socket.destroy();
    });

    socket.on("error", (err) => {
        console.error(`⚠️ Socket error for stream ${streamId}:`, err);
        ffmpegProc.kill("SIGINT");
    });

    socket.on("end", () => {
        console.log(`📴 Socket closed for stream ${streamId}`);
        ffmpegProc.kill("SIGINT");
    });

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
    const srtPort = parseInt(process.env.SRT_PORT || "9999", 10);

    clearHLSFiles();

    // parse JSON bodies for control routes
    app.use(express.json());

    // SRT server: accept incoming connections on port 9999
    srtServer.on("connection", (socket) => {
        let streamId = null;
        let dataReceived = false;

        // Read first message to get streamId
        const onFirstData = (data) => {
            if (dataReceived) return;
            dataReceived = true;

            // Try to extract streamId from first message (assuming JSON: {"streamId": "..."})
            try {
                const message = data.toString().split('\n')[0];
                const parsed = JSON.parse(message);
                streamId = parsed.streamId;
            } catch (e) {
                // If not JSON, treat entire first chunk as streamId
                streamId = data.toString().trim();
            }

            if (!streamId) {
                console.error("❌ No streamId provided");
                socket.destroy();
                return;
            }

            const registered = registeredStreams.get(streamId);
            if (!registered) {
                console.error(`❌ StreamId not registered: ${streamId}`);
                socket.write(JSON.stringify({ error: "StreamId not registered. Call POST /ffmpeg/register first." }));
                socket.destroy();
                return;
            }

            // Remove listener for first data and re-attach to listen to socket error/end
            socket.removeListener("data", onFirstData);

            console.log(`✅ Stream ${streamId} connected with ${registered.tracks} track(s)`);
            registeredStreams.delete(streamId);

            // Start FFmpeg immediately
            startFFmpegListener(streamId, registered.tracks, socket);
        };

        socket.on("data", onFirstData);
        socket.on("error", (err) => {
            console.error("⚠️ Socket error:", err);
        });

        // 10 second timeout for client to send streamId
        const timeout = setTimeout(() => {
            if (!dataReceived) {
                console.log("⏱️ Connection timeout waiting for streamId");
                socket.destroy();
            }
        }, 10000);

        socket.on("close", () => {
            clearTimeout(timeout);
        });
    });

    srtServer.on("error", (err) => {
        console.error("⚠️ SRT server error:", err);
    });

    // Start SRT server
    srtServer.listen(srtPort, "0.0.0.0", () => {
        console.log(`🆎 SRT server listening on port ${srtPort}`);
    });

    // POST /ffmpeg/register — register a stream before connecting
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
            registeredStreams.set(streamId, { tracks: trackNum });
            console.log(`📝 Stream registered: ${streamId} (tracks=${trackNum})`);
            return res.status(200).json({
                status: "registered",
                streamId,
                tracks: trackNum,
                message: `Connect to srt://localhost:${srtPort} and send {"streamId": "${streamId}"} as first message`,
                srtPort
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
                    hlsUrl: `/hls/${streamId}/0/playlist.m3u8`
                });
            }

            if (registered) {
                return res.status(200).json({
                    streamId,
                    status: "registered",
                    message: "Registered and waiting for SRT connection"
                });
            }

            return res.status(200).json({ streamId, status: "not_found" });
        }

        // Return all streams
        const allStreams = {};

        for (const [id, data] of ffmpegProcesses.entries()) {
            allStreams[id] = {
                status: "active",
                running: true,
                pid: data.process.pid,
                tracks: data.tracks,
                hlsUrl: `/hls/${id}/0/playlist.m3u8`
            };
        }

        for (const [id, data] of registeredStreams.entries()) {
            allStreams[id] = {
                status: "registered",
                message: "Registered and waiting for SRT connection",
                tracks: data.tracks
            };
        }

        return res.status(200).json({
            totalStreams: ffmpegProcesses.size + registeredStreams.size,
            activeStreams: ffmpegProcesses.size,
            registeredStreams: registeredStreams.size,
            streams: allStreams
        });
    });

    app.listen(httpPort, () => {
        console.log(`📺 Serving HLS at http://localhost:${httpPort}/hls`);
    });

    console.log("🚀 Media server ready!");
    console.log(`   📝 Register streams: POST http://localhost:${httpPort}/ffmpeg/register`);
    console.log(`   🔗 Connect SRT stream to: srt://localhost:${srtPort}`);
    console.log(`   📊 Check status: GET http://localhost:${httpPort}/ffmpeg/status`);
}

export { startMediaServer };
