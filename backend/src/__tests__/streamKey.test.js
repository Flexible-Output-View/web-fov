import { isStreamKeyFormat } from '../streamKey.js';

describe('stream key format', () => {
    test('accepts the backend-generated format', () => {
        expect(isStreamKeyFormat(`fov_${'a'.repeat(43)}`)).toBe(true);
        expect(isStreamKeyFormat(`fov_${'A1_-'.repeat(10)}xyz`)).toBe(true);
    });

    test('rejects missing, malformed, and non-string values', () => {
        for (const value of [
            undefined,
            null,
            12345678,
            {},
            '',
            'stream-key',
            'FOVDemo',
            'u12',
            'fov_',
            'fov_short',
            `fov_${'a'.repeat(42)}`,
            `fov_${'a'.repeat(44)}`,
            `fov_${'a'.repeat(43)}!`,
            `FOV_${'a'.repeat(43)}`
        ]) {
            expect(isStreamKeyFormat(value)).toBe(false);
        }
    });
});
