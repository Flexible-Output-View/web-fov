import express from 'express';
import fs from 'fs';
import path from 'path';
import dgram from 'dgram';
import cors from 'cors';
import { spawn, execFileSync } from 'child_process';
import {
    writeStreamMeta,
    parseNamedTrackArray
} from './streamTrackUtils.js';
import { isStreamKeyFormat } from './streamKey.js';

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
const HLS_DIR = path.join(MEDIA_ROOT, 'hls');

await fs.promises.mkdir(HLS_DIR, { recursive: true });

const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

const ffmpegProcesses = new Map();
const registeredStreams = new Map();
const baseSrtPort = parseInt(process.env.SRT_PORT || '9999', 10);
const maxSrtPort = baseSrtPort + 11;
const debugSrtPort = parseInt(process.env.DEBUG_SRT_PORT || String(baseSrtPort), 10);

// Registration only answers 200 once the FFmpeg SRT listener owns its UDP
// port. Encoders otherwise connect too early - noticeably on macOS, where a
// packet sent before the listener binds can break Docker's UDP port mapping
// for the rest of the session.
const parsedReadyTimeout = parseInt(process.env.SRT_READY_TIMEOUT_MS || '5000', 10);
const SRT_READY_TIMEOUT_MS = Number.isFinite(parsedReadyTimeout) ? parsedReadyTimeout : 5000;
const parsedReadyPoll = parseInt(process.env.SRT_READY_POLL_MS || '50', 10);
const SRT_READY_POLL_MS = Number.isFinite(parsedReadyPoll) && parsedReadyPoll > 0 ? parsedReadyPoll : 50;

// Optimistic until startMediaServer() has actually probed the binary. This
// keeps createMediaRoutes() usable in tests and in code paths that never spawn
// FFmpeg, while still failing registration loudly when SRT is unavailable.
let ffmpegSrtSupported = true;

function checkFfmpegSrtSupport() {
    try {
        const protocols = execFileSync(FFMPEG_BIN, ['-hide_banner', '-protocols'], {
            encoding: 'utf8'
        });
        ffmpegSrtSupported = /^\s*srt\s*$/m.test(protocols);
        if (!ffmpegSrtSupported) {
            console.error(
                `⚠️ FFmpeg at "${FFMPEG_BIN}" has no SRT support. ` +
                'Install an SRT-enabled build (macOS: brew install ffmpeg-full) and set ' +
                'FFMPEG_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg.'
            );
        }
    } catch (err) {
        ffmpegSrtSupported = false;
        console.error(
            `⚠️ Cannot run FFmpeg at "${FFMPEG_BIN}": ${err.message}. ` +
            'Install FFmpeg or set FFMPEG_PATH to its full path.'
        );
    }
    return ffmpegSrtSupported;
}

function normalizeSrtHost(host) {
    const value = (host || '').trim();

    // FFmpeg binds the listener on IPv4 (0.0.0.0). On macOS `localhost`
    // resolves to ::1 first, so always hand the encoder an IPv4 address.
    if (!value || value === 'localhost' || value === '::1' || value === '[::1]') {
        return '127.0.0.1';
    }

    const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
    const isIpv6 = value.includes(':');
    const hasDot = value.includes('.');

    // Docker Compose service/container names (e.g. `web-fov-backend-1`) only
    // resolve inside the Docker network. Encoders run on the host, so emit a
    // reachable loopback address instead of a URL that can never connect.
    if (!isIpv4 && !isIpv6 && !hasDot) {
        console.warn(
            `⚠️ SRT_URL "${value}" looks like a container name; ` +
            'using 127.0.0.1 instead. Set SRT_URL to the host address encoders should use.'
        );
        return '127.0.0.1';
    }

    return isIpv6 && !value.startsWith('[') ? `[${value}]` : value;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check whether a UDP port is already owned by another socket.
 *
 * `bind()` succeeding means nobody is listening yet; `EADDRINUSE` means the
 * FFmpeg SRT listener has bound the port. This works both inside Docker and
 * when the backend runs natively.
 */
function isUdpPortBound(port) {
    return new Promise((resolve) => {
        const socket = dgram.createSocket('udp4');

        const finish = (bound) => {
            try {
                socket.close();
            } catch (err) {
                // Socket already closed - nothing to do.
            }
            resolve(bound);
        };

        socket.once('error', (err) => finish(err?.code === 'EADDRINUSE'));
        socket.bind({ address: '0.0.0.0', port, exclusive: true }, () => finish(false));
    });
}

/**
 * Wait until the SRT listener spawned for a stream is accepting traffic.
 *
 * @param {number} port Allocated SRT port.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] Maximum time to wait.
 * @param {number} [options.pollMs] Delay between probes.
 * @param {() => boolean} [options.isAlive] Return false to abort (FFmpeg exited).
 * @returns {Promise<boolean>} true when the listener owns the UDP port.
 */
async function waitForSrtListener(port, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : SRT_READY_TIMEOUT_MS;
    const pollMs = Number.isFinite(options.pollMs) ? options.pollMs : SRT_READY_POLL_MS;
    const { isAlive } = options;
    const deadline = Date.now() + Math.max(0, timeoutMs);

    for (;;) {
        if (typeof isAlive === 'function' && !isAlive()) {
            return false;
        }
        if (await isUdpPortBound(port)) {
            return true;
        }
        if (Date.now() >= deadline) {
            return false;
        }
        await delay(pollMs);
    }
}

function parseRegisterRequest(body) {
    const { tracks: tracksV, audioTracks: tracksA, streamId: providedStreamId } = body ?? {};
    const trackVNum = Number.parseInt(tracksV, 10);
    const trackANum = Number.parseInt(tracksA, 10);
    const videoTrackNames = parseNamedTrackArray(body?.videoTrackNames, 'videoTrackNames');
    const audioTrackNames = parseNamedTrackArray(body?.audioTrackNames, 'audioTrackNames');

    if (!Number.isInteger(trackVNum) || trackVNum <= 0) {
        return { error: "Invalid 'video tracks' parameter." };
    }
    if (!Number.isInteger(trackANum) || trackANum <= 0) {
        return { error: "Invalid 'audio tracks' parameter." };
    }
    if (videoTrackNames.error) {
        return { error: videoTrackNames.error };
    }
    if (audioTrackNames.error) {
        return { error: audioTrackNames.error };
    }

    return {
        trackVNum,
        trackANum,
        videoTrackNames,
        audioTrackNames,
        streamKey: typeof providedStreamId === 'string' ? providedStreamId.trim() : ''
    };
}

/**
 * Default stream key resolver. Imported lazily so the media server can be
 * loaded (and its tests can run) without touching the database unless a key
 * is actually supplied by a caller.
 */
async function resolveStreamKeyFromDatabase(streamKey) {
    if (!streamKey) {
        return null;
    }

    const { findSettingsByStreamKey, toPublicStreamId } = await import('./streamSettings.js');
    const settings = await findSettingsByStreamKey(streamKey);
    if (!settings) {
        return null;
    }

    return {
        userId: settings.user_id,
        streamId: toPublicStreamId(settings.user_id)
    };
}

function buildSrtUrl(host, port, mode) {
    return [
        `srt://${normalizeSrtHost(host)}:${port}`,
        `?mode=${mode}`,
        '&connect_timeout=15000',
        '&latency=4000000',
        '&rcvbuf=134217728',
        '&sndbuf=134217728',
        '&peerlatency=4000000',
        '&tlpktdrop=0',
        '&nakreport=1'
    ].join('');
}

// Configuration for process termination
const PROCESS_GRACE_PERIOD = 5000; // 5 seconds to gracefully shut down
const PROCESS_CHECK_INTERVAL = 30000; // Check every 30 seconds for zombie processes

function clearHLSFiles() {
    try {
        if (fs.existsSync(HLS_DIR)) {
            for (const file of fs.readdirSync(HLS_DIR)) {
                fs.rmSync(path.join(HLS_DIR, file), { recursive: true, force: true });
            }
            console.log('🧹 HLS directory cleared');
        }
    } catch (err) {
        console.error('⚠️ Failed to clear HLS directory:', err);
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

// Safely kill a process with grace period - try SIGINT first, then SIGKILL
function killFFmpegProcess(streamId, process, timeout = PROCESS_GRACE_PERIOD) {
    return new Promise((resolve) => {
        if (!process) {
            resolve(true);
            return;
        }

        const killTimer = setTimeout(() => {
            console.log(`⚠️ FFmpeg for stream ${streamId} did not exit gracefully, force killing (SIGKILL)...`);
            try {
                process.kill('SIGKILL');
            } catch (err) {
                console.error(`⚠️ Failed to SIGKILL ffmpeg for stream ${streamId}:`, err);
            }
            resolve(true);
        }, timeout);

        process.once('exit', () => {
            clearTimeout(killTimer);
            resolve(true);
        });

        // Try graceful shutdown first
        try {
            process.kill('SIGINT');
        } catch (err) {
            console.error(`⚠️ Failed to SIGINT ffmpeg for stream ${streamId}:`, err);
            clearTimeout(killTimer);
            resolve(false);
        }
    });
}

function buildFfmpegArgs(videoTrackCount, audioTrackCount, streamId, srtUrl) {
    const streamHlsDir = path.join(HLS_DIR, streamId);
    const mapArgs = [];
    const audioCodecArgs = [];
    const varStreamEntries = [];

    // 1. Map all available video tracks
    for (let v = 0; v < videoTrackCount; v++) {
        mapArgs.push('-map', `0:v:${v}`);
    }

    // 2. Map all available audio tracks
    for (let a = 0; a < audioTrackCount; a++) {
        mapArgs.push('-map', `0:a:${a}`);
        audioCodecArgs.push(`-c:a:${a}`, 'copy');
    }

    // 3. Pair each video track with its audio at the same index (v:0,a:0).
    // Extra audio tracks beyond the video count get their own audio-only variant.
    const maxTracks = Math.max(videoTrackCount, audioTrackCount);

    for (let i = 0; i < maxTracks; i++) {
        const hasVideo = i < videoTrackCount;
        const hasAudio = i < audioTrackCount;

        if (hasVideo && hasAudio) {
            varStreamEntries.push(`v:${i},a:${i}`);
        } else if (hasVideo) {
            varStreamEntries.push(`v:${i}`);
        } else if (hasAudio) {
            varStreamEntries.push(`a:${i}`);
        }
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
        : 'pipe:';

    const ffmpegArgs = [
        '-err_detect', 'ignore_err',
        '-fflags', '+genpts+discardcorrupt+igndts',
        '-flags', 'low_delay',
        '-strict', 'experimental',
        '-i', inputSource,
        ...mapArgs,
        '-c:v', 'copy',
        ...audioCodecArgs,
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '15',
        // ↓ Added: program_date_time — injects EXT-X-PROGRAM-DATE-TIME into every
        //   playlist segment. HLS.js uses wall-clock timestamps to align tracks,
        //   bypassing the sequence×duration arithmetic that breaks when video
        //   segments are longer than audio segments due to keyframe-only cutting.
        '-hls_flags', 'delete_segments+independent_segments+omit_endlist+program_date_time',
        '-hls_segment_type', 'mpegts',
        '-hls_segment_filename', path.join(streamHlsDir, '%v', 'seg%05d.ts'),
        '-var_stream_map', varStreamEntries.join(' '),
        path.join(streamHlsDir, '%v', 'playlist.m3u8')
    ];

    return ffmpegArgs;
}

function startFFmpegListener(streamId, tracksV, tracksA, socket, srtUrl = null, nameOptions = {}) {
    if (!tracksV || tracksV === 0) {
        if (socket) {
            socket.destroy();
        }
        return null;
    }

    const ffmpegArgs = buildFfmpegArgs(tracksV, tracksA, streamId, srtUrl);

    console.log(`📀 Spawning FFmpeg for stream ${streamId}:`, FFMPEG_BIN, ffmpegArgs.join(' '));

    const stdio = srtUrl ? ['inherit', 'inherit', 'inherit'] : ['pipe', 'inherit', 'inherit'];
    const ffmpegProc = spawn(FFMPEG_BIN, ffmpegArgs, { stdio });

    if (socket) {
        socket.pipe(ffmpegProc.stdin);
    }

    ffmpegProc.on('exit', (code, signal) => {
        console.log(`ℹ️ FFmpeg for stream ${streamId} exited (code=${code} signal=${signal})`);
        const currentProcess = ffmpegProcesses.get(streamId);
        if (currentProcess?.process === ffmpegProc) {
            clearStreamHLSFiles(streamId);
            ffmpegProcesses.delete(streamId);
            registeredStreams.delete(streamId);
        }
        console.log(`📊 Active streams: ${ffmpegProcesses.size}`);
        if (socket) {
            try {
                socket.destroy();
            } catch (err) {
                console.error(`⚠️ Error destroying socket for stream ${streamId}:`, err);
            }
        }
    });

    ffmpegProc.on('error', (err) => {
        console.error(`⚠️ FFmpeg spawn failed for stream ${streamId}:`, err);
        const currentProcess = ffmpegProcesses.get(streamId);
        if (currentProcess?.process === ffmpegProc) {
            clearStreamHLSFiles(streamId);
            ffmpegProcesses.delete(streamId);
            registeredStreams.delete(streamId);
        }
        if (socket) {
            try {
                socket.destroy();
            } catch (err) {
                console.error(`⚠️ Error destroying socket for stream ${streamId}:`, err);
            }
        }
    });

    if (socket) {
        socket.on('error', (err) => {
            console.error(`⚠️ Socket error for stream ${streamId}:`, err);
            // Use the new kill function with grace period
            killFFmpegProcess(streamId, ffmpegProc).catch(err => {
                console.error(`⚠️ Error killing ffmpeg for stream ${streamId}:`, err);
            });
        });

        socket.on('end', () => {
            console.log(`📴 Socket closed for stream ${streamId}`);
            killFFmpegProcess(streamId, ffmpegProc).catch(err => {
                console.error(`⚠️ Error killing ffmpeg for stream ${streamId}:`, err);
            });
        });

        socket.on('close', () => {
            console.log(`🔌 Socket fully closed for stream ${streamId}`);
        });
    }

    const streamEntry = {
        process: ffmpegProc,
        tracksV,
        tracksA,
        videoTrackNames: nameOptions.videoTrackNames ?? [],
        audioTrackNames: nameOptions.audioTrackNames ?? [],
        socket,
        stopped: false,
        createdAt: Date.now()
    };

    ffmpegProcesses.set(streamId, streamEntry);
    return streamEntry;
}

function createMediaRoutes(options = {}) {
    const router = express.Router();
    const resolveStreamKey = typeof options.resolveStreamKey === 'function'
        ? options.resolveStreamKey
        : resolveStreamKeyFromDatabase;
    const isSrtListenerReady = typeof options.isSrtListenerReady === 'function'
        ? options.isSrtListenerReady
        : waitForSrtListener;
    const requestedReadyTimeout = Number(options.srtReadyTimeoutMs);
    const srtReadyTimeoutMs = Number.isFinite(requestedReadyTimeout) && requestedReadyTimeout >= 0
        ? requestedReadyTimeout
        : SRT_READY_TIMEOUT_MS;

    /**
     * Resolve the stream key presented at registration.
     *
     * Ingest is key-only: a missing, malformed, unknown, or revoked key is
     * refused. `u<userId>`, usernames and arbitrary ids are not credentials,
     * so they are rejected before the database is queried.
     */
    async function resolveRegistration(parsed) {
        const { streamKey } = parsed;

        if (!isStreamKeyFormat(streamKey)) {
            return { error: 'Invalid stream key' };
        }

        const identity = await resolveStreamKey(streamKey);
        if (!identity || !identity.streamId) {
            return { error: 'Invalid stream key' };
        }

        return { streamId: identity.streamId, userId: identity.userId };
    }

    router.use(cors({
        origin: '*',
        methods: ['GET', 'HEAD', 'OPTIONS'],
        allowedHeaders: ['Range', 'Content-Type', 'Cache-Control'],
        exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges']
    }));

    router.use('/api/hls', (req, res, next) => {
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
    router.post('/ffmpeg/register', async (req, res) => {
        const parsed = parseRegisterRequest(req.body);
        if (parsed.error) {
            return res.status(400).json({ error: parsed.error });
        }

        if (!ffmpegSrtSupported) {
            return res.status(503).json({
                error:
                    `FFmpeg at "${FFMPEG_BIN}" does not support SRT. ` +
                    'Install an SRT-enabled build and set FFMPEG_PATH to its full path ' +
                    '(macOS: brew install ffmpeg-full, then ' +
                    'FFMPEG_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg).'
            });
        }

        let registration;
        try {
            registration = await resolveRegistration(parsed);
        } catch (err) {
            console.error('⚠️ Failed to validate stream key:', err);
            return res.status(500).json({ error: 'Failed to validate stream key' });
        }
        if (registration.error) {
            return res.status(401).json({ error: registration.error });
        }

        const { trackVNum, trackANum, videoTrackNames, audioTrackNames } = parsed;
        const { streamId } = registration;
        const nameOptions = { videoTrackNames, audioTrackNames };

        if (registeredStreams.has(streamId)) {
            return res.status(409).json({ error: 'StreamId already registered', streamId });
        }

        try {
            const host = process.env.SRT_URL || '127.0.0.1';
            let srtPort = baseSrtPort;
            while (srtPort <= maxSrtPort && Array.from(registeredStreams.values()).some(s => s.port === srtPort)) {
                srtPort++;
            }

            if (srtPort > maxSrtPort) {
                return res.status(503).json({ error: 'No SRT ports available' });
            }

            const srtUrl = `srt://0.0.0.0:${srtPort}`;
            const srtUrlExternal = buildSrtUrl(host, srtPort, 'caller');

            // Reserve the port before the readiness probe so concurrent
            // registrations cannot be handed the same port while we wait.
            const registrationState = {
                tracksV: trackVNum,
                tracksA: trackANum,
                videoTrackNames,
                audioTrackNames,
                port: srtPort,
                srtUrl,
                pending: true
            };
            registeredStreams.set(streamId, registrationState);

            writeStreamMeta(streamId, trackVNum, trackANum, nameOptions, HLS_DIR);
            const started = startFFmpegListener(streamId, trackVNum, trackANum, null, srtUrl, nameOptions);

            // Do not acknowledge before the listener owns its UDP port: an
            // encoder that connects too early can lose the handshake (and on
            // macOS/Docker Desktop break the published UDP mapping entirely).
            const ready = await isSrtListenerReady(srtPort, {
                timeoutMs: srtReadyTimeoutMs,
                isAlive: () => ffmpegProcesses.get(streamId)?.process === started.process
            });

            if (!ready) {
                console.error(
                    `⚠️ SRT listener for stream ${streamId} did not bind port ${srtPort} within ` +
                    `${srtReadyTimeoutMs}ms (Docker Desktop on macOS can drop published UDP ports).`
                );
                if (ffmpegProcesses.get(streamId)?.process === started.process) {
                    await killFFmpegProcess(streamId, started.process);
                    ffmpegProcesses.delete(streamId);
                }
                registeredStreams.delete(streamId);
                clearStreamHLSFiles(streamId);
                return res.status(503).json({
                    error: 'SRT listener did not become ready',
                    streamId,
                    port: srtPort
                });
            }

            console.log(`📝 Stream registered: ${streamId} (tracksV=${trackVNum}, (tracksA=${trackANum}, port=${srtPort})`);

            registrationState.pending = false;

            return res.status(200).json({
                status: 'registered',
                streamId,
                tracksV: trackVNum,
                tracksA: trackANum,
                srtUrl: srtUrlExternal,
                hlsUrl: `/api/hls/${streamId}/0/playlist.m3u8`
            });
        } catch (err) {
            registeredStreams.delete(streamId);
            const running = ffmpegProcesses.get(streamId);
            if (running?.process) {
                try {
                    running.process.kill('SIGKILL');
                } catch (killErr) {
                    // Process already gone.
                }
                ffmpegProcesses.delete(streamId);
            }
            clearStreamHLSFiles(streamId);
            console.error(`⚠️ Failed to register stream ${streamId}:`, err);
            return res.status(500).json({ error: 'Failed to register stream' });
        }
    });

    // POST /ffmpeg/register/debug — same as register but returns a hardcoded SRT listener URL for VLC (no FFmpeg)
    router.post('/ffmpeg/register/debug', async (req, res) => {
        const parsed = parseRegisterRequest(req.body);
        if (parsed.error) {
            return res.status(400).json({ error: parsed.error });
        }

        let registration;
        try {
            registration = await resolveRegistration(parsed);
        } catch (err) {
            console.error('⚠️ Failed to validate stream key:', err);
            return res.status(500).json({ error: 'Failed to validate stream key' });
        }
        if (registration.error) {
            return res.status(401).json({ error: registration.error });
        }

        const { trackVNum, trackANum, videoTrackNames, audioTrackNames } = parsed;
        const { streamId } = registration;
        const nameOptions = { videoTrackNames, audioTrackNames };

        if (registeredStreams.has(streamId)) {
            return res.status(409).json({ error: 'StreamId already registered', streamId });
        }

        try {
            const srtUrlListener = 'srt://0.0.0.0:5555?mode=listener';
            writeStreamMeta(streamId, trackVNum, trackANum, nameOptions, HLS_DIR);

            registeredStreams.set(streamId, {
                tracksV: trackVNum,
                tracksA: trackANum,
                videoTrackNames,
                audioTrackNames,
                port: debugSrtPort,
                debug: true
            });

            console.log(`🐛 Debug stream registered: ${streamId} (tracksV=${trackVNum}, tracksA=${trackANum}, vlc listener port=${debugSrtPort})`);

            return res.status(200).json({
                status: 'registered',
                streamId,
                tracksV: trackVNum,
                tracksA: trackANum,
                srtUrl: srtUrlListener,
                hlsUrl: `/api/hls/${streamId}/0/playlist.m3u8`
            });
        } catch (err) {
            console.error(`⚠️ Failed to register debug stream ${streamId}:`, err);
            return res.status(500).json({ error: 'Failed to register stream' });
        }
    });

    // POST /ffmpeg/stop — request FFmpeg to stop for a specific stream
    router.post('/ffmpeg/stop', async (req, res) => {
        const { streamId: requestedStreamId } = req.body ?? {};

        if (!requestedStreamId) {
            return res.status(400).json({ error: "Missing 'streamId' parameter" });
        }

        const requested = typeof requestedStreamId === 'string'
            ? requestedStreamId.trim()
            : '';

        if (!isStreamKeyFormat(requested)) {
            return res.status(401).json({ error: 'Invalid stream key' });
        }

        // The encoder stops with the same key it arrived with; resolve it to
        // the internal stream id. A revoked or unknown key cannot stop a
        // stream, including its own previous registration.
        let identity;
        try {
            identity = await resolveStreamKey(requested);
        } catch (err) {
            console.error(`⚠️ Failed to resolve stream key for stop ${requested}:`, err);
            return res.status(500).json({ error: 'Failed to resolve stream key' });
        }

        if (!identity?.streamId) {
            return res.status(401).json({ error: 'Invalid stream key' });
        }

        const streamId = identity.streamId;
        const streamData = ffmpegProcesses.get(streamId);
        const registered = registeredStreams.get(streamId);

        if (!streamData && !registered) {
            return res.status(200).json({ status: 'not_found', streamId });
        }

        try {
            if (streamData) {
                if (streamData.process) {
                    const pid = streamData.process.pid;
                    console.log(`⏹️ FFmpeg stop requested for stream ${streamId} (pid=${pid})`);
                    await killFFmpegProcess(streamId, streamData.process);
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
            return res.status(200).json({ status: 'stopped', streamId });
        } catch (err) {
            console.error(`⚠️ Failed to stop stream ${streamId}:`, err);
            return res.status(500).json({ error: 'Failed to stop stream' });
        }
    });

    // GET /ffmpeg/status — get current FFmpeg state for all or a specific stream
    router.get('/ffmpeg/status', (req, res) => {
        const { streamId } = req.query;

        if (streamId) {
            const streamData = ffmpegProcesses.get(streamId);
            const registered = registeredStreams.get(streamId);

            if (streamData) {
                return res.status(200).json({
                    streamId,
                    status: 'active',
                    running: true,
                    pid: streamData.process?.pid,
                    tracks: streamData.tracks,
                    hlsUrl: `/api/hls/${streamId}/0/playlist.m3u8`,
                    srtUrl: registered
                        ? buildSrtUrl(process.env.SRT_URL || '127.0.0.1', registered.port, 'caller')
                        : null
                });
            }

            return res.status(200).json({ streamId, status: 'not_found' });
        }

        const allStreams = {};

        for (const [id, data] of ffmpegProcesses.entries()) {
            const registered = registeredStreams.get(id);
            allStreams[id] = {
                status: 'active',
                running: true,
                pid: data.process.pid,
                tracks: data.tracks,
                hlsUrl: `/api/hls/${id}/0/playlist.m3u8`,
                srtUrl: registered
                    ? buildSrtUrl(process.env.SRT_URL || '127.0.0.1', registered.port, 'caller')
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

async function startMediaServer() {
    const srtReady = checkFfmpegSrtSupport();
    if (srtReady) {
        console.log(`🎬 FFmpeg: ${FFMPEG_BIN} (SRT enabled)`);
    } else {
        console.error('❌ SRT streaming is disabled until FFMPEG_PATH points to an SRT-enabled FFmpeg.');
    }

    console.log('🚀 Media server ready!');
    console.log(`   📝 Register stream: POST ${process.env.API_HOSTNAME || 'localhost'}/ffmpeg/register with {"tracks": 2}`);
    console.log(`   🐛 Debug register: POST ${process.env.API_HOSTNAME || 'localhost'}/ffmpeg/register/debug (returns VLC listener URL on port ${debugSrtPort})`);
    console.log('   🔗 FFmpeg starts immediately with its own SRT URL');
    console.log(`   📊 Check status: GET ${process.env.API_HOSTNAME || 'localhost'}/ffmpeg/status`);

    // Periodic check for zombie processes (every 30 seconds)
    const healthCheckInterval = setInterval(async () => {
        const deadStreams = [];
        for (const [streamId, streamData] of ffmpegProcesses.entries()) {
            if (streamData.process && streamData.process.killed) {
                console.log(`🧟 Detected killed ffmpeg for stream ${streamId}, cleaning up...`);
                deadStreams.push(streamId);
            }
        }
        // Clean up dead processes
        for (const streamId of deadStreams) {
            clearStreamHLSFiles(streamId);
            ffmpegProcesses.delete(streamId);
            registeredStreams.delete(streamId);
        }
    }, PROCESS_CHECK_INTERVAL);

    // Graceful shutdown handler
    async function gracefulShutdown(signal) {
        console.log(`\n⏳ ${signal} received, gracefully shutting down ffmpeg processes...`);

        const shutdownPromises = [];
        for (const [streamId, streamData] of ffmpegProcesses.entries()) {
            console.log(`   Stopping stream ${streamId}...`);
            shutdownPromises.push(killFFmpegProcess(streamId, streamData.process));
        }

        await Promise.all(shutdownPromises);

        // Clear HLS files
        clearHLSFiles();

        // Clean up health check interval
        clearInterval(healthCheckInterval);

        console.log('✅ All ffmpeg processes stopped');
        process.exit(0);
    }

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', async (err) => {
        console.error('💥 Uncaught exception:', err);
        await gracefulShutdown('uncaughtException');
    });
}

export {
    createMediaRoutes,
    startMediaServer,
    startFFmpegListener,
    ffmpegProcesses,
    registeredStreams,
    killFFmpegProcess,
    clearHLSFiles,
    normalizeSrtHost,
    waitForSrtListener,
    isUdpPortBound
};
