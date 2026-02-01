import express from "express";
import fs from "fs";
import path from "path";
import cors from 'cors';
import { spawn } from "child_process";

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), "media");
const HLS_DIR = path.join(MEDIA_ROOT, "hls");

// ensure the directory exists
await fs.promises.mkdir(HLS_DIR, { recursive: true });

let ffmpegProc = null;
let stopping = false;
let currentTracks = null;

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

function buildFfmpegArgs(srtURL, videoTrackCount) {
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
        "-i", srtURL,

        ...mapArgs,

        "-c:v", "copy",
        ...audioCodecArgs,

        "-f", "hls",
        "-hls_time", "6",
        "-hls_list_size", "3",
        "-hls_flags", "delete_segments+independent_segments",

        "-hls_segment_filename", path.join(HLS_DIR, "%v", "seg%03d.ts"),

        "-var_stream_map", varStreamEntries.join(" "),

        path.join(HLS_DIR, "%v", "playlist.m3u8")
    ];

    return ffmpegArgs;
}

// Start (or restart) the FFmpeg listener
function startFFmpegListener(tracks) {
    if (stopping) return;
    if (tracks && tracks == 0) return;

    const srtPort = process.env.SRT_PORT || 9999;
    const srtURL = `srt://0.0.0.0:${srtPort}?mode=listener`;

    const ffmpegArgs = buildFfmpegArgs(srtURL, tracks);

    console.log("📀 Spawning FFmpeg:", "ffmpeg", ffmpegArgs.join(" "));

    ffmpegProc = spawn("ffmpeg", ffmpegArgs, { stdio: "inherit" });

    ffmpegProc.on("exit", (code, signal) => {
        console.log(`ℹ️ FFmpeg exited (code=${code} signal=${signal})`);

        // Immediately restart listener if not stopping
        ffmpegProc = null;
        if (!stopping) {
            console.log("🔁 Restarting FFmpeg listener...");
            setTimeout(startFFmpegListener, 1000);
        }
    });

    ffmpegProc.on("error", (err) => {
        console.error("⚠️ FFmpeg spawn failed:", err);
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

    // POST /ffmpeg/start — start FFmpeg listener with { tracks: <number> }
    app.post("/ffmpeg/start", (req, res) => {
        const { tracks } = req.body ?? {};
        const trackNum = Number.parseInt(tracks, 10);
        if (!Number.isInteger(trackNum) || trackNum <= 0) {
            return res.status(400).json({ error: "Invalid 'tracks' parameter. Must be a positive integer." });
        }

        if (ffmpegProc) {
            return res.status(409).json({ error: "FFmpeg listener already running", pid: ffmpegProc.pid });
        }

        try {
            stopping = false;
            currentTracks = trackNum;
            startFFmpegListener(trackNum);
            console.log(`▶️ FFmpeg listener start requested (tracks=${trackNum})`);
            return res.status(200).json({ status: "started", tracks: trackNum });
        } catch (err) {
            console.error("⚠️ Failed to start FFmpeg listener:", err);
            return res.status(500).json({ error: "Failed to start FFmpeg listener" });
        }
    });

    // POST /ffmpeg/stop — request FFmpeg to stop
    app.post("/ffmpeg/stop", (req, res) => {
        if (!ffmpegProc) {
            stopping = false;
            currentTracks = null;
            return res.status(200).json({ status: "not_running" });
        }

        try {
            stopping = true;
            const pid = ffmpegProc.pid;
            ffmpegProc.kill("SIGINT");
            console.log(`⏹️ FFmpeg stop requested (pid=${pid})`);
            currentTracks = null;
            clearHLSFiles();
            return res.status(200).json({ status: "stopping", pid });
        } catch (err) {
            console.error("⚠️ Failed to stop FFmpeg:", err);
            return res.status(500).json({ error: "Failed to stop FFmpeg" });
        }
    });

    // GET /ffmpeg/status — get current FFmpeg state
    app.get("/ffmpeg/status", (req, res) => {
        return res.status(200).json({
            running: !!ffmpegProc,
            pid: ffmpegProc ? ffmpegProc.pid : null,
            tracks: currentTracks
        });
    });

    app.listen(httpPort, () => {
        console.log(`📺 Serving HLS at http://localhost:${httpPort}/hls`);
    });

    console.log("🚀 Media server ready — listening for SRT streams...");
}

export { startMediaServer };
