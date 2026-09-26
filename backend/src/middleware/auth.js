import jwt from 'jsonwebtoken';

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV !== 'test') {
        throw new Error('JWT_SECRET is not configured');
    }
    return secret || 'test-secret';
}

export function verifyToken(token) {
    return jwt.verify(token, getJwtSecret());
}

export function extractBearerToken(req) {
    const header = req.headers?.authorization || req.headers?.Authorization;
    if (!header || typeof header !== 'string') {
        return null;
    }
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return null;
    }
    return token;
}

export function requireAuth(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const payload = verifyToken(token);
        req.user = { id: payload.userId };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}
