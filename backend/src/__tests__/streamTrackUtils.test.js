import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testHlsDir = path.join(__dirname, 'test-hls');

describe('streamTrackUtils', () => {
    let isVideoVariant;
    let isAudioVariant;
    let parseNamedTrackArray;
    let buildSeparatedAvailableTracks;
    let readStreamMeta;
    let writeStreamMeta;
    let sortTrackIds;
    let findFirstSegment;
    let resolveTrackIsVideo;
    let resolveTrackIsAudio;
    let resolveTrackName;
    let probeTrackHasVideo;
    let probeTrackHasAudio;

    beforeEach(async () => {
        jest.resetModules();
        if (!fs.existsSync(testHlsDir)) {
            fs.mkdirSync(testHlsDir, { recursive: true });
        }

        ({
            isVideoVariant,
            isAudioVariant,
            parseNamedTrackArray,
            buildSeparatedAvailableTracks,
            readStreamMeta,
            writeStreamMeta,
            sortTrackIds,
            findFirstSegment,
            resolveTrackIsVideo,
            resolveTrackIsAudio,
            resolveTrackName,
            probeTrackHasVideo,
            probeTrackHasAudio
        } = await import('../streamTrackUtils.js'));
    });

    afterEach(() => {
        if (fs.existsSync(testHlsDir)) {
            fs.rmSync(testHlsDir, { recursive: true, force: true });
        }
    });

    describe('isVideoVariant', () => {
        test('returns true for indices below tracksV', () => {
            expect(isVideoVariant(0, 2)).toBe(true);
            expect(isVideoVariant(1, 2)).toBe(true);
        });

        test('returns false for audio-only indices when tracksA exceeds tracksV', () => {
            expect(isVideoVariant(2, 2)).toBe(false);
            expect(isVideoVariant(1, 1)).toBe(false);
            expect(isVideoVariant(2, 1)).toBe(false);
        });
    });

    describe('isAudioVariant', () => {
        test('returns true for indices below tracksA', () => {
            expect(isAudioVariant(0, 3)).toBe(true);
            expect(isAudioVariant(2, 3)).toBe(true);
        });

        test('returns false for indices at or above tracksA', () => {
            expect(isAudioVariant(2, 2)).toBe(false);
            expect(isAudioVariant(3, 3)).toBe(false);
        });
    });

    describe('parseNamedTrackArray', () => {
        test('extracts name from OBS objects', () => {
            expect(parseNamedTrackArray([
                { name: 'Main Cam' },
                { name: 'Side Cam' }
            ], 'videoTrackNames')).toEqual(['Main Cam', 'Side Cam']);
        });

        test('returns empty array when field is missing', () => {
            expect(parseNamedTrackArray(undefined, 'videoTrackNames')).toEqual([]);
        });

        test('returns error for non-array values', () => {
            expect(parseNamedTrackArray('invalid', 'videoTrackNames')).toEqual({
                error: "Invalid 'videoTrackNames' parameter."
            });
        });
    });

    describe('buildSeparatedAvailableTracks', () => {
        test('returns separate video and audio entries from metadata', () => {
            writeStreamMeta('stream-separated', 2, 3, {
                videoTrackNames: ['Main Cam', 'Side Cam'],
                audioTrackNames: ['Game Audio', 'Mic', 'Commentary']
            }, testHlsDir);

            expect(buildSeparatedAvailableTracks(
                'stream-separated',
                ['0', '1', '2'],
                'http://example.test',
                { hlsDir: testHlsDir }
            )).toEqual([
                {
                    trackId: 'v:0',
                    name: 'Main Cam',
                    videoUrl: 'http://example.test/api/hls/stream-separated/0/playlist.m3u8',
                    isVideo: true,
                    isAudio: false
                },
                {
                    trackId: 'v:1',
                    name: 'Side Cam',
                    videoUrl: 'http://example.test/api/hls/stream-separated/1/playlist.m3u8',
                    isVideo: true,
                    isAudio: false
                },
                {
                    trackId: 'a:0',
                    name: 'Game Audio',
                    videoUrl: 'http://example.test/api/hls/stream-separated/0/playlist.m3u8',
                    isVideo: false,
                    isAudio: true
                },
                {
                    trackId: 'a:1',
                    name: 'Mic',
                    videoUrl: 'http://example.test/api/hls/stream-separated/1/playlist.m3u8',
                    isVideo: false,
                    isAudio: true
                },
                {
                    trackId: 'a:2',
                    name: 'Commentary',
                    videoUrl: 'http://example.test/api/hls/stream-separated/2/playlist.m3u8',
                    isVideo: false,
                    isAudio: true
                }
            ]);
        });

        test('returns null when metadata is missing', () => {
            expect(buildSeparatedAvailableTracks(
                'missing-stream',
                ['0'],
                'http://example.test',
                { hlsDir: testHlsDir }
            )).toBeNull();
        });
    });

    describe('readStreamMeta / writeStreamMeta', () => {
        test('writes and reads stream metadata', () => {
            writeStreamMeta('stream-1', 2, 3, null, testHlsDir);
            expect(readStreamMeta('stream-1', testHlsDir)).toEqual({
                tracksV: 2,
                tracksA: 3
            });
        });

        test('writes and reads separate video and audio track names', () => {
            writeStreamMeta('stream-1b', 2, 3, {
                videoTrackNames: ['Main Cam', 'Side Cam'],
                audioTrackNames: ['Mic', 'Game Audio', 'Commentary']
            }, testHlsDir);
            expect(readStreamMeta('stream-1b', testHlsDir)).toEqual({
                tracksV: 2,
                tracksA: 3,
                videoTrackNames: ['Main Cam', 'Side Cam'],
                audioTrackNames: ['Mic', 'Game Audio', 'Commentary']
            });
        });

        test('returns null when metadata is missing', () => {
            expect(readStreamMeta('missing-stream', testHlsDir)).toBeNull();
        });
    });

    describe('sortTrackIds', () => {
        test('sorts track ids numerically', () => {
            expect(sortTrackIds(['2', '10', '1'])).toEqual(['1', '2', '10']);
        });
    });

    describe('findFirstSegment', () => {
        test('returns first segment from playlist', () => {
            const trackDir = path.join(testHlsDir, 'stream-1', '0');
            fs.mkdirSync(trackDir, { recursive: true });
            fs.writeFileSync(path.join(trackDir, 'playlist.m3u8'), '#EXTM3U\nseg00001.ts\n');
            fs.writeFileSync(path.join(trackDir, 'seg00001.ts'), '');

            expect(findFirstSegment(trackDir)).toBe(path.join(trackDir, 'seg00001.ts'));
        });

        test('returns null when no segments exist', () => {
            const trackDir = path.join(testHlsDir, 'stream-1', '1');
            fs.mkdirSync(trackDir, { recursive: true });

            expect(findFirstSegment(trackDir)).toBeNull();
        });
    });

    describe('resolveTrackIsVideo', () => {
        test('uses metadata when available', async () => {
            writeStreamMeta('stream-2', 2, 3, null, testHlsDir);
            const trackPath = path.join(testHlsDir, 'stream-2', '2');

            await expect(resolveTrackIsVideo('stream-2', '2', trackPath, {
                hlsDir: testHlsDir
            })).resolves.toBe(false);

            await expect(resolveTrackIsVideo('stream-2', '1', trackPath, {
                hlsDir: testHlsDir
            })).resolves.toBe(true);
        });

        test('uses live ffmpeg process data when metadata is missing', async () => {
            const ffmpegProcesses = new Map([
                ['stream-3', { tracksV: 1, tracksA: 2 }]
            ]);
            const trackPath = path.join(testHlsDir, 'stream-3', '1');

            await expect(resolveTrackIsVideo('stream-3', '1', trackPath, {
                hlsDir: testHlsDir,
                ffmpegProcesses
            })).resolves.toBe(false);
        });
    });

    describe('resolveTrackIsAudio', () => {
        test('uses metadata when available', async () => {
            writeStreamMeta('stream-2a', 2, 3, null, testHlsDir);
            const trackPath = path.join(testHlsDir, 'stream-2a', '2');

            await expect(resolveTrackIsAudio('stream-2a', '2', trackPath, {
                hlsDir: testHlsDir
            })).resolves.toBe(true);

            await expect(resolveTrackIsAudio('stream-2a', '3', trackPath, {
                hlsDir: testHlsDir
            })).resolves.toBe(false);
        });
    });

    describe('resolveTrackName', () => {
        test('returns separated video and audio names', () => {
            writeStreamMeta('stream-6', 2, 2, {
                videoTrackNames: ['Camera', 'Side Cam'],
                audioTrackNames: ['Mic', 'Commentary']
            }, testHlsDir);

            expect(resolveTrackName('stream-6', 'v:1', { hlsDir: testHlsDir })).toBe('Side Cam');
            expect(resolveTrackName('stream-6', 'a:0', { hlsDir: testHlsDir })).toBe('Mic');
        });

        test('falls back to trackId when name is missing', () => {
            writeStreamMeta('stream-7', 1, 1, null, testHlsDir);

            expect(resolveTrackName('stream-7', 'v:0', { hlsDir: testHlsDir })).toBe('v:0');
        });
    });

    describe('probeTrackHasVideo', () => {
        test('returns false when track has no segments', async () => {
            const trackDir = path.join(testHlsDir, 'stream-4', '0');
            fs.mkdirSync(trackDir, { recursive: true });

            await expect(probeTrackHasVideo(trackDir)).resolves.toBe(false);
        });

        test('returns true when ffprobe reports a video stream', async () => {
            jest.resetModules();
            const promisifyCustom = Symbol.for('nodejs.util.promisify.custom');
            const mockExecFile = jest.fn();
            mockExecFile[promisifyCustom] = () => Promise.resolve({ stdout: 'video\n', stderr: '' });

            jest.unstable_mockModule('child_process', () => ({
                execFile: mockExecFile
            }));

            ({ probeTrackHasVideo } = await import('../streamTrackUtils.js'));

            const trackDir = path.join(testHlsDir, 'stream-5', '0');
            fs.mkdirSync(trackDir, { recursive: true });
            fs.writeFileSync(path.join(trackDir, 'seg00001.ts'), '');

            await expect(probeTrackHasVideo(trackDir)).resolves.toBe(true);
        });
    });
});
