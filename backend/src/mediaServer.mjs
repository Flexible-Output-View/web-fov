import express from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), "media");
const HLS_DIR = path.join(MEDIA_ROOT, "hls");

// ensure the directory exists
await fs.promises.mkdir(HLS_DIR, { recursive: true });

let ffmpegProc = null;
let stopping = false;

// Clear all HLS files
function clearHLSFiles() {
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
        "-hls_time", "2",
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

    clearHLSFiles();

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
    app.use("/hls", express.static(HLS_DIR));

    const httpPort = process.env.MEDIA_HTTP_PORT || 8000;
    app.listen(httpPort, () => {
        console.log(`📺 Serving HLS at http://localhost:${httpPort}/hls`);
    });

    console.log("🚀 Media server ready — listening for SRT streams...");
    startFFmpegListener(3);
}

export { startMediaServer };
