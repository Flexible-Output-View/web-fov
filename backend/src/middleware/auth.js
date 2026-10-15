import { verifyToken } from '../utils/auth.js';

function extractBearerToken(req) {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header || typeof header !== 'string') {
        return null;
    }
    const [scheme, token] = header.split(' ');
    if (!token || scheme.toLowerCase() !== 'bearer') {
        return null;
    }
    return token.trim() || null;
}

function resolveUserId(req) {
    const token = extractBearerToken(req);
    if (!token) {
        return null;
    }

    try {
        const payload = verifyToken(token);
        const userId = parseInt(payload?.userId, 10);
        return Number.isInteger(userId) ? userId : null;
    } catch {
        return null;
    }
}

/**
 * Reject the request with 401 unless a valid JWT is provided.
 * On success attaches `req.userId`.
 */
export function requireAuth(req, res, next) {
    const userId = resolveUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    req.userId = userId;
    next();
}

/**
 * Attach `req.userId` when a valid JWT is provided, but never reject the
 * request. Useful for public endpoints that enrich their response when the
 * caller is authenticated (e.g. `isFollowing` on a public profile).
 */
export function optionalAuth(req, res, next) {
    const userId = resolveUserId(req);
    if (userId) {
        req.userId = userId;
    }
    next();
}
