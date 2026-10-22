/**
 * In-memory viewer presence tracker.
 *
 * Every viewer on a stream page sends a periodic heartbeat (authenticated or
 * not). Presence is intentionally ephemeral: nothing is persisted, stale
 * entries are pruned after a short TTL, and the counts live in this process
 * only. This keeps the counter independent from the `streams.viewers` column.
 */

export const DEFAULT_TTL_MS = 30000;
export const DEFAULT_MAX_VISITORS_PER_STREAM = 5000;
export const DEFAULT_MAX_TRACKED_STREAMS = 1000;

const MAX_ID_LENGTH = 120;

function sanitizeId(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_ID_LENGTH) {
        return null;
    }
    return trimmed;
}

export function sanitizeStreamId(streamId) {
    return sanitizeId(streamId);
}

export function sanitizeVisitorId(visitorId) {
    return sanitizeId(visitorId);
}

export function createViewerPresenceTracker(options = {}) {
    const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0
        ? options.ttlMs
        : DEFAULT_TTL_MS;
    const maxVisitorsPerStream = Number.isFinite(options.maxVisitorsPerStream) && options.maxVisitorsPerStream > 0
        ? options.maxVisitorsPerStream
        : DEFAULT_MAX_VISITORS_PER_STREAM;
    const maxTrackedStreams = Number.isFinite(options.maxTrackedStreams) && options.maxTrackedStreams > 0
        ? options.maxTrackedStreams
        : DEFAULT_MAX_TRACKED_STREAMS;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();

    // streamId -> { lastActivity, visitors: Map<visitorId, { authenticated, lastSeen }> }
    const streams = new Map();

    function pruneStream(entry, streamId) {
        const cutoff = now() - ttlMs;
        for (const [visitorId, visitor] of entry.visitors) {
            if (visitor.lastSeen <= cutoff) {
                entry.visitors.delete(visitorId);
            }
        }
        if (entry.visitors.size === 0) {
            streams.delete(streamId);
        }
    }

    function pruneAll() {
        for (const [streamId, entry] of streams) {
            pruneStream(entry, streamId);
        }
    }

    function evictOldestStream() {
        let oldestId = null;
        let oldestActivity = Infinity;
        for (const [streamId, entry] of streams) {
            if (entry.lastActivity < oldestActivity) {
                oldestActivity = entry.lastActivity;
                oldestId = streamId;
            }
        }
        if (oldestId !== null) {
            streams.delete(oldestId);
        }
    }

    function countsFor(streamId) {
        const entry = streams.get(streamId);
        let authenticated = 0;
        let anonymous = 0;

        if (entry) {
            pruneStream(entry, streamId);
            const current = streams.get(streamId);
            if (current) {
                for (const visitor of current.visitors.values()) {
                    if (visitor.authenticated) {
                        authenticated += 1;
                    } else {
                        anonymous += 1;
                    }
                }
            }
        }

        return {
            streamId,
            total: authenticated + anonymous,
            authenticated,
            anonymous,
            updatedAt: new Date(now()).toISOString()
        };
    }

    function touch(streamId, visitorId, options = {}) {
        const cleanStreamId = sanitizeStreamId(streamId);
        const cleanVisitorId = sanitizeVisitorId(visitorId);
        if (!cleanStreamId || !cleanVisitorId) {
            return null;
        }

        let entry = streams.get(cleanStreamId);
        if (!entry) {
            if (streams.size >= maxTrackedStreams) {
                pruneAll();
                if (streams.size >= maxTrackedStreams) {
                    evictOldestStream();
                }
            }
            entry = { lastActivity: now(), visitors: new Map() };
            streams.set(cleanStreamId, entry);
        }

        entry.lastActivity = now();
        if (!entry.visitors.has(cleanVisitorId) && entry.visitors.size >= maxVisitorsPerStream) {
            // Capacity reached: keep the existing viewers, ignore the newcomer.
            return countsFor(cleanStreamId);
        }

        entry.visitors.set(cleanVisitorId, {
            authenticated: Boolean(options.authenticated),
            lastSeen: now()
        });

        return countsFor(cleanStreamId);
    }

    function remove(streamId, visitorId) {
        const cleanStreamId = sanitizeStreamId(streamId);
        const cleanVisitorId = sanitizeVisitorId(visitorId);
        if (!cleanStreamId || !cleanVisitorId) {
            return null;
        }

        const entry = streams.get(cleanStreamId);
        if (entry) {
            entry.visitors.delete(cleanVisitorId);
            if (entry.visitors.size === 0) {
                streams.delete(cleanStreamId);
            }
        }

        return countsFor(cleanStreamId);
    }

    function getCounts(streamId) {
        const cleanStreamId = sanitizeStreamId(streamId);
        if (!cleanStreamId) {
            return null;
        }
        return countsFor(cleanStreamId);
    }

    function prune() {
        pruneAll();
        return streams.size;
    }

    function clear() {
        streams.clear();
    }

    function getTrackedStreamCount() {
        return streams.size;
    }

    return {
        touch,
        remove,
        getCounts,
        prune,
        clear,
        getTrackedStreamCount
    };
}

export const viewerPresence = createViewerPresenceTracker();
