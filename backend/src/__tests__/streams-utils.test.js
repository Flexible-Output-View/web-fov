import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock implementation of stream helper functions from streams.js
function isPlaylistReady(playlistPath, minSegments = 2) {
    try {
        if (!fs.existsSync(playlistPath)) {
            return false;
        }

        const content = fs.readFileSync(playlistPath, 'utf8');

        if (!content.includes('#EXTM3U')) {
            return false;
        }

        const segmentMatches = content.match(/\.ts/g);
        if (!segmentMatches) {
            return false;
        }

        return segmentMatches.length >= minSegments;
    } catch (err) {
        return false;
    }
}

function getSegmentCount(playlistPath) {
    try {
        if (!fs.existsSync(playlistPath)) {
            return 0;
        }
        const content = fs.readFileSync(playlistPath, 'utf8');
        const segmentMatches = content.match(/\.ts/g);
        return segmentMatches ? segmentMatches.length : 0;
    } catch (err) {
        return 0;
    }
}

describe('Stream Utilities', () => {
    const testDir = path.join(__dirname, 'test-playlists');

    beforeEach(() => {
        // Create test directory
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Cleanup test files
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
});
