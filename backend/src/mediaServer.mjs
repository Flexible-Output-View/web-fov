import express from "express";
import fs from "fs";
import path from "path";
import cors from 'cors';
import { spawn } from "child_process";

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), "media");
const HLS_DIR = path.join(MEDIA_ROOT, "hls");

await fs.promises.mkdir(HLS_DIR, { recursive: true });

let ffmpegProc = null;
let stopping = false;
let currentTracks = null;

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

function buildFfmpegArgs(srtURL, videoTrackCount) {
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

        "-i", srtURL,

        ...mapArgs,
        "-c:v", "copy",
        ...audioCodecArgs,

        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "15",
        "-hls_flags", "delete_segments+independent_segments+omit_endlist",
        "-hls_segment_type", "mpegts",
        "-hls_segment_filename", path.join(HLS_DIR, "%v", "seg%05d.ts"),

        "-var_stream_map", varStreamEntries.join(" "),
        path.join(HLS_DIR, "%v", "playlist.m3u8")
    ];

    return ffmpegArgs;
}

function startFFmpegListener(tracks) {
    if (stopping) return;
    if (!tracks || tracks === 0) return;

    const srtPort = process.env.SRT_PORT || 9999;

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

    const srtURL = `srt://0.0.0.0:${srtPort}?${srtParams}`;
    const ffmpegArgs = buildFfmpegArgs(srtURL, tracks);

    console.log("📀 Spawning FFmpeg with SRT URL:", srtURL);
    console.log("📀 FFmpeg args:", ffmpegArgs.join(" "));

    ffmpegProc = spawn("ffmpeg", ffmpegArgs, { stdio: "inherit" });

    ffmpegProc.on("exit", (code, signal) => {
        console.log(`ℹ️ FFmpeg exited (code=${code} signal=${signal})`);
        ffmpegProc = null;
        clearHLSFiles();
        if (!stopping) {
            console.log("🔁 Restarting FFmpeg listener in 2s...");
            setTimeout(() => startFFmpegListener(currentTracks), 2000);
        }
    });

    ffmpegProc.on("error", (err) => {
        console.error("⚠️ FFmpeg spawn failed:", err);
    });
}

async function startMediaServer() {
    const app = express();

    app.use(cors({
        origin: '*',
        methods: ['GET', 'HEAD', 'OPTIONS'],
        allowedHeaders: ['Range', 'Content-Type', 'Cache-Control'],
        exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges']
    }));

    const httpPort = process.env.MEDIA_HTTP_PORT || 8000;

    app.use("/hls", (req, res, next) => {
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

    app.use(express.json());

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
            clearHLSFiles();
            startFFmpegListener(trackNum);
            console.log(`▶️ FFmpeg listener start requested (tracks=${trackNum})`);
            return res.status(200).json({ status: "started", tracks: trackNum });
        } catch (err) {
            console.error("⚠️ Failed to start FFmpeg listener:", err);
            return res.status(500).json({ error: "Failed to start FFmpeg listener" });
        }
    });

    app.post("/ffmpeg/stop", (req, res) => {
        if (!ffmpegProc) {
            stopping = false;
            currentTracks = null;
            clearHLSFiles();
            return res.status(200).json({ status: "not_running" });
        }
        try {
            stopping = true;
            const pid = ffmpegProc.pid;
            ffmpegProc.kill("SIGINT");
            console.log(`⏹️ FFmpeg stop requested (pid=${pid})`);
            currentTracks = null;
            return res.status(200).json({ status: "stopping", pid });
        } catch (err) {
            console.error("⚠️ Failed to stop FFmpeg:", err);
            return res.status(500).json({ error: "Failed to stop FFmpeg" });
        }
    });

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
