/**
 * Stream key format shared by the API and the media server.
 *
 * Keys are generated as `fov_` + 32 random bytes encoded as base64url
 * (43 characters, no padding). Keeping this module independent from the
 * database lets the media server reject malformed keys synchronously, before
 * any lookup, and without importing the DB pool.
 */
export const STREAM_KEY_PREFIX = 'fov_';

export const STREAM_KEY_PATTERN = /^fov_[A-Za-z0-9_-]{43}$/;

export function isStreamKeyFormat(value) {
    return typeof value === 'string' && STREAM_KEY_PATTERN.test(value);
}
