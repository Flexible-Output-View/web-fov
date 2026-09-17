import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
const DEFAULT_HLS_DIR = path.join(MEDIA_ROOT, 'hls');

function getFfprobePath() {
    const ffmpegPath = process.env.FFMPEG_PATH;
    if (ffmpegPath) {
        return ffmpegPath.replace(/ffmpeg$/, 'ffprobe');
    }
    return 'ffprobe';
}

function isVideoVariant(variantIndex, tracksV) {
    return variantIndex < tracksV;
}

function isAudioVariant(variantIndex, tracksA) {
    return variantIndex < tracksA;
}

function parseNamedTrackArray(raw, fieldName) {
    if (raw === undefined || raw === null) {
        return [];
    }
    if (!Array.isArray(raw)) {
        return { error: `Invalid '${fieldName}' parameter.` };
    }

    return raw.map((entry) => {
        if (entry && typeof entry === 'object' && entry.name !== undefined) {
            return String(entry.name).trim();
        }
        if (typeof entry === 'string') {
            return entry.trim();
        }
        return '';
    });
}

function getTrackNamesFromSource(meta, liveData, type) {
    if (type === 'video') {
        return meta?.videoTrackNames ?? liveData?.videoTrackNames ?? [];
    }
    return meta?.audioTrackNames ?? liveData?.audioTrackNames ?? [];
}

function buildSeparatedAvailableTracks(streamId, trackDirs, url, options = {}) {
    const { hlsDir = DEFAULT_HLS_DIR, ffmpegProcesses = null } = options;
    const meta = readStreamMeta(streamId, hlsDir);
    const liveData = ffmpegProcesses?.get(streamId);
    const tracksV = meta?.tracksV ?? liveData?.tracksV;
    const tracksA = meta?.tracksA ?? liveData?.tracksA;

    if (!Number.isInteger(tracksV) || !Number.isInteger(tracksA)) {
        return null;
    }

    const availableVariants = new Set(trackDirs.map(String));
    const tracks = [];
    const videoNames = getTrackNamesFromSource(meta, liveData, 'video');
    const audioNames = getTrackNamesFromSource(meta, liveData, 'audio');

    for (let v = 0; v < tracksV; v++) {
        const variantId = String(v);
        if (!availableVariants.has(variantId)) {
            continue;
        }
        tracks.push({
            trackId: `v:${v}`,
            name: videoNames[v] || `Video ${v}`,
            videoUrl: `${url}/api/hls/${streamId}/${variantId}/playlist.m3u8`,
            isVideo: true,
            isAudio: false
        });
    }

    for (let a = 0; a < tracksA; a++) {
        const variantId = String(a);
        if (!availableVariants.has(variantId)) {
            continue;
        }
        tracks.push({
            trackId: `a:${a}`,
            name: audioNames[a] || `Audio ${a}`,
            videoUrl: `${url}/api/hls/${streamId}/${variantId}/playlist.m3u8`,
            isVideo: false,
            isAudio: true
        });
    }

    return tracks;
}

function getStreamMetaPath(streamId, hlsDir = DEFAULT_HLS_DIR) {
    return path.join(hlsDir, streamId, 'meta.json');
}

function readStreamMeta(streamId, hlsDir = DEFAULT_HLS_DIR) {
    try {
        const metaPath = getStreamMetaPath(streamId, hlsDir);
        if (!fs.existsSync(metaPath)) {
            return null;
        }
        const content = fs.readFileSync(metaPath, 'utf8');
        const meta = JSON.parse(content);
        if (!Number.isInteger(meta.tracksV) || !Number.isInteger(meta.tracksA)) {
            return null;
        }
        if (meta.trackNames !== undefined && !Array.isArray(meta.trackNames)) {
            return null;
        }
        if (meta.videoTrackNames !== undefined && !Array.isArray(meta.videoTrackNames)) {
            return null;
        }
        if (meta.audioTrackNames !== undefined && !Array.isArray(meta.audioTrackNames)) {
            return null;
        }
        return meta;
    } catch (err) {
        console.error(`Error reading stream meta for ${streamId}:`, err.message);
        return null;
    }
}

function writeStreamMeta(streamId, tracksV, tracksA, nameOptions = null, hlsDir = DEFAULT_HLS_DIR) {
    const streamDir = path.join(hlsDir, streamId);
    fs.mkdirSync(streamDir, { recursive: true });
    const metaPath = getStreamMetaPath(streamId, hlsDir);
    const meta = { tracksV, tracksA };

    if (Array.isArray(nameOptions) && nameOptions.length > 0) {
        meta.trackNames = nameOptions;
    } else if (nameOptions && typeof nameOptions === 'object') {
        if (Array.isArray(nameOptions.videoTrackNames) && nameOptions.videoTrackNames.length > 0) {
            meta.videoTrackNames = nameOptions.videoTrackNames;
        }
        if (Array.isArray(nameOptions.audioTrackNames) && nameOptions.audioTrackNames.length > 0) {
            meta.audioTrackNames = nameOptions.audioTrackNames;
        }
        if (Array.isArray(nameOptions.trackNames) && nameOptions.trackNames.length > 0) {
            meta.trackNames = nameOptions.trackNames;
        }
    }

    fs.writeFileSync(metaPath, JSON.stringify(meta));
}

function findFirstSegment(trackDir) {
    if (!fs.existsSync(trackDir)) {
        return null;
    }

    const playlistPath = path.join(trackDir, 'playlist.m3u8');
    if (fs.existsSync(playlistPath)) {
        const content = fs.readFileSync(playlistPath, 'utf8');
        const segmentMatch = content.match(/^(seg\d+\.ts)$/m);
        if (segmentMatch) {
            return path.join(trackDir, segmentMatch[1]);
        }
    }

    const tsFiles = fs.readdirSync(trackDir)
        .filter((name) => name.endsWith('.ts'))
        .sort();
    return tsFiles.length > 0 ? path.join(trackDir, tsFiles[0]) : null;
}

async function probeTrackStreamType(trackDir, streamType) {
    const segmentPath = findFirstSegment(trackDir);
    if (!segmentPath) {
        return false;
    }

    try {
        const { stdout } = await execFileAsync(getFfprobePath(), [
            '-v', 'error',
            '-select_streams', streamType,
            '-show_entries', 'stream=codec_type',
            '-of', 'csv=p=0',
            segmentPath
        ]);
        return stdout.trim().length > 0;
    } catch (err) {
        console.error(`Error probing ${streamType} track at ${trackDir}:`, err.message);
        return false;
    }
}

async function probeTrackHasVideo(trackDir) {
    return probeTrackStreamType(trackDir, 'v');
}

async function probeTrackHasAudio(trackDir) {
    return probeTrackStreamType(trackDir, 'a');
}

function resolveTrackTypeFromMeta(variantIndex, meta, ffmpegProcesses, streamId, type) {
    if (meta) {
        return type === 'video'
            ? isVideoVariant(variantIndex, meta.tracksV)
            : isAudioVariant(variantIndex, meta.tracksA);
    }

    const liveData = ffmpegProcesses?.get(streamId);
    if (liveData) {
        const count = type === 'video' ? liveData.tracksV : liveData.tracksA;
        if (count !== null && count !== undefined) {
            return type === 'video'
                ? isVideoVariant(variantIndex, count)
                : isAudioVariant(variantIndex, count);
        }
    }

    return null;
}

async function resolveTrackIsVideo(streamId, trackId, trackPath, options = {}) {
    const { hlsDir = DEFAULT_HLS_DIR, ffmpegProcesses = null } = options;
    const variantIndex = parseInt(trackId, 10);

    if (Number.isFinite(variantIndex)) {
        const meta = readStreamMeta(streamId, hlsDir);
        const resolved = resolveTrackTypeFromMeta(variantIndex, meta, ffmpegProcesses, streamId, 'video');
        if (resolved !== null) {
            return resolved;
        }
    }

    return probeTrackHasVideo(trackPath);
}

async function resolveTrackIsAudio(streamId, trackId, trackPath, options = {}) {
    const { hlsDir = DEFAULT_HLS_DIR, ffmpegProcesses = null } = options;
    const variantIndex = parseInt(trackId, 10);

    if (Number.isFinite(variantIndex)) {
        const meta = readStreamMeta(streamId, hlsDir);
        const resolved = resolveTrackTypeFromMeta(variantIndex, meta, ffmpegProcesses, streamId, 'audio');
        if (resolved !== null) {
            return resolved;
        }
    }

    return probeTrackHasAudio(trackPath);
}

function resolveTrackName(streamId, trackId, options = {}) {
    const { hlsDir = DEFAULT_HLS_DIR, ffmpegProcesses = null } = options;
    const liveData = ffmpegProcesses?.get(streamId);
    const meta = readStreamMeta(streamId, hlsDir);

    const videoMatch = /^v:(\d+)$/.exec(trackId);
    if (videoMatch) {
        const names = getTrackNamesFromSource(meta, liveData, 'video');
        const index = Number(videoMatch[1]);
        return names[index] || trackId;
    }

    const audioMatch = /^a:(\d+)$/.exec(trackId);
    if (audioMatch) {
        const names = getTrackNamesFromSource(meta, liveData, 'audio');
        const index = Number(audioMatch[1]);
        return names[index] || trackId;
    }

    const variantIndex = parseInt(trackId, 10);
    if (Number.isFinite(variantIndex)) {
        const trackNames = meta?.trackNames ?? liveData?.trackNames;
        if (Array.isArray(trackNames) && trackNames[variantIndex]) {
            return trackNames[variantIndex];
        }
    }

    return trackId;
}

function sortTrackIds(trackIds) {
    return [...trackIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

export {
    isVideoVariant,
    isAudioVariant,
    parseNamedTrackArray,
    buildSeparatedAvailableTracks,
    readStreamMeta,
    writeStreamMeta,
    probeTrackHasVideo,
    probeTrackHasAudio,
    resolveTrackIsVideo,
    resolveTrackIsAudio,
    resolveTrackName,
    sortTrackIds,
    findFirstSegment,
    getFfprobePath
};
