import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    isPlaylistReady,
    getSegmentCount,
    getCurrentTracksState
} from '../routes/streams.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Stream Utilities', () => {
    const testDir = path.join(__dirname, 'test-playlists');

    beforeEach(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('isPlaylistReady', () => {
        test('should return false for non-existent file', () => {
            const result = isPlaylistReady(path.join(testDir, 'nonexistent.m3u8'));
            expect(result).toBe(false);
        });

        test('should return false for file without #EXTM3U header', () => {
            const playlistPath = path.join(testDir, 'no-header.m3u8');
            fs.writeFileSync(playlistPath, 'segment1.ts\nsegment2.ts\n');

            const result = isPlaylistReady(playlistPath);
            expect(result).toBe(false);
        });

        test('should return false when fewer than minSegments present', () => {
            const playlistPath = path.join(testDir, 'insufficient.m3u8');
            fs.writeFileSync(playlistPath, '#EXTM3U\n#EXT-X-VERSION:3\nsegment1.ts\n');

            const result = isPlaylistReady(playlistPath, 2);
            expect(result).toBe(false);
        });

        test('should return true when playlist has enough segments', () => {
            const playlistPath = path.join(testDir, 'ready.m3u8');
            const content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
segment2.ts
#EXTINF:10.0,
segment3.ts`;
            fs.writeFileSync(playlistPath, content);

            const result = isPlaylistReady(playlistPath, 2);
            expect(result).toBe(true);
        });

        test('should use default minSegments of 2', () => {
            const playlistPath = path.join(testDir, 'default-min.m3u8');
            const content = `#EXTM3U
#EXT-X-VERSION:3
segment1.ts
segment2.ts`;
            fs.writeFileSync(playlistPath, content);

            const result = isPlaylistReady(playlistPath);
            expect(result).toBe(true);
        });
    });

    describe('getSegmentCount', () => {
        test('should return 0 for non-existent file', () => {
            const result = getSegmentCount(path.join(testDir, 'nonexistent.m3u8'));
            expect(result).toBe(0);
        });

        test('should count .ts segments correctly', () => {
            const playlistPath = path.join(testDir, 'count.m3u8');
            const content = `#EXTM3U
segment1.ts
segment2.ts
segment3.ts
segment4.ts`;
            fs.writeFileSync(playlistPath, content);

            const result = getSegmentCount(playlistPath);
            expect(result).toBe(4);
        });

        test('should return 0 when no segments present', () => {
            const playlistPath = path.join(testDir, 'empty.m3u8');
            fs.writeFileSync(playlistPath, '#EXTM3U\n#EXT-X-VERSION:3\n');

            const result = getSegmentCount(playlistPath);
            expect(result).toBe(0);
        });

        test('should handle malformed playlists gracefully', () => {
            const playlistPath = path.join(testDir, 'malformed.m3u8');
            fs.writeFileSync(playlistPath, 'not a valid m3u8 file');

            const result = getSegmentCount(playlistPath);
            expect(result).toBe(0);
        });
    });

    describe('getCurrentTracksState', () => {
        const hlsTestRoot = path.join(__dirname, '..', '..', 'media', 'hls');
        const testStreamId = 'utils-test-stream';

        beforeEach(() => {
            if (!fs.existsSync(hlsTestRoot)) {
                fs.mkdirSync(hlsTestRoot, { recursive: true });
            }
        });

        afterEach(() => {
            const streamDirs = [
                path.join(hlsTestRoot, testStreamId),
                path.join(hlsTestRoot, `${testStreamId}-pending`)
            ];
            for (const streamDir of streamDirs) {
                if (fs.existsSync(streamDir)) {
                    fs.rmSync(streamDir, { recursive: true, force: true });
                }
            }
        });

        test('should return information for a ready track directory', () => {
            const streamDir = path.join(hlsTestRoot, testStreamId);
            fs.mkdirSync(streamDir, { recursive: true });
            fs.writeFileSync(path.join(streamDir, 'playlist.m3u8'), '#EXTM3U\nsegment1.ts\nsegment2.ts');

            const result = getCurrentTracksState('http');

            expect(result.tracks).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    name: testStreamId,
                    segments: 2,
                    videoUrl: expect.stringContaining(`/api/hls/${testStreamId}/playlist.m3u8`)
                })
            ]));
            expect(result.videoCount).toBeGreaterThanOrEqual(1);
        });

        test('should return pending state when playlist is not ready', () => {
            const streamDir = path.join(hlsTestRoot, `${testStreamId}-pending`);
            fs.mkdirSync(streamDir, { recursive: true });
            fs.writeFileSync(path.join(streamDir, 'playlist.m3u8'), '#EXTM3U\nsegment1.ts');

            const result = getCurrentTracksState('https');

            expect(result.tracks).toEqual([]);
            expect(result.pending).toBe(1);
            expect(result.totalDirs).toBe(1);
            expect(result.ready).toBe(false);
        });
    });
});
