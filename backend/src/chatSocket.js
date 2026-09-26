import { Server } from 'socket.io';
import db from './db.js';
import { verifyToken } from './middleware/auth.js';
import { appendMemoryMessage, buildMessage, insertMessageRow, lookupUsername } from './routes/chat.js';

let ioInstance = null;

export function getChatIo() {
    return ioInstance;
}

export function broadcastChatMessage(streamId, message) {
    if (ioInstance) {
        ioInstance.to(roomName(streamId)).emit('chat-message', message);
    }
}

export function roomName(streamId) {
    return `stream:${String(streamId)}`;
}

function sanitizeStreamId(streamId) {
    if (typeof streamId !== 'string') {
        return null;
    }
    const trimmed = streamId.trim();
    if (!trimmed || trimmed.length > 120) {
        return null;
    }
    return trimmed;
}

export function initChatSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    ioInstance = io;

    io.on('connection', (socket) => {
        socket.on('join-stream', (streamId) => {
            const clean = sanitizeStreamId(streamId);
            if (!clean) {
                socket.emit('chat-error', { error: 'Invalid stream id' });
                return;
            }
            socket.join(roomName(clean));
        });

        socket.on('leave-stream', (streamId) => {
            const clean = sanitizeStreamId(streamId);
            if (!clean) {
                return;
            }
            socket.leave(roomName(clean));
        });

        socket.on('send-message', async (payload, ack) => {
            try {
                const streamId = sanitizeStreamId(payload?.streamId);
                const token = payload?.token;
                const rawMessage = payload?.message;

                if (!streamId) {
                    const err = { error: 'Invalid stream id' };
                    if (typeof ack === 'function') {
                        ack(err);
                    } else {
                        socket.emit('chat-error', err);
                    }
                    return;
                }

                if (!token) {
                    const err = { error: 'Authentication required' };
                    if (typeof ack === 'function') {
                        ack(err);
                    } else {
                        socket.emit('chat-error', err);
                    }
                    return;
                }

                let userId;
                try {
                    const decoded = verifyToken(token);
                    userId = decoded.userId;
                } catch {
                    const err = { error: 'Invalid or expired token' };
                    if (typeof ack === 'function') {
                        ack(err);
                    } else {
                        socket.emit('chat-error', err);
                    }
                    return;
                }

                const text = typeof rawMessage === 'string' ? rawMessage.trim() : '';
                if (!text || text.length > 500) {
                    const err = { error: 'Message must be between 1 and 500 characters' };
                    if (typeof ack === 'function') {
                        ack(err);
                    } else {
                        socket.emit('chat-error', err);
                    }
                    return;
                }

                const username = await lookupUsername(userId);
                if (!username) {
                    const err = { error: 'User not found' };
                    if (typeof ack === 'function') {
                        ack(err);
                    } else {
                        socket.emit('chat-error', err);
                    }
                    return;
                }

                let message;
                try {
                    const row = await insertMessageRow(streamId, userId, text);
                    message = buildMessage(row, username);
                } catch {
                    message = buildMessage(
                        { id: `mem-${Date.now()}-${Math.round(Math.random() * 1e6)}`, stream_id: streamId, created_at: new Date().toISOString() },
                        username,
                        text,
                        userId
                    );
                }

                appendMemoryMessage(streamId, message);
                io.to(roomName(streamId)).emit('chat-message', message);
                if (typeof ack === 'function') {
                    ack({ ok: true, message });
                }
            } catch (err) {
                console.error('[chatSocket] send-message error:', err?.message || err);
                if (typeof ack === 'function') {
                    ack({ error: 'Unable to send message' });
                } else {
                    socket.emit('chat-error', { error: 'Unable to send message' });
                }
            }
        });
    });

    return io;
}

// Kept for testability: ensures db import is referenced when socket module is loaded standalone.
export function __socketDb() {
    return db;
}
