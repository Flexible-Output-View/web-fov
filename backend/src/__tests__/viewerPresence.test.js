import {
    DEFAULT_TTL_MS,
    createViewerPresenceTracker,
    sanitizeStreamId,
    sanitizeVisitorId
} from '../viewerPresence.js';

describe('viewerPresence', () => {
    let clock;
    let tracker;

    beforeEach(() => {
        clock = 1000;
        tracker = createViewerPresenceTracker({ now: () => clock });
    });

    test('counts a new visitor as anonymous', () => {
        const counts = tracker.touch('1', 'visitor-a');

        expect(counts).toMatchObject({
            streamId: '1',
            total: 1,
            authenticated: 0,
            anonymous: 1
        });
        expect(typeof counts.updatedAt).toBe('string');
    });

    test('repeated heartbeats from the same visitor do not inflate the count', () => {
        tracker.touch('1', 'visitor-a');
        clock += 1000;
        tracker.touch('1', 'visitor-a');
        const counts = tracker.touch('1', 'visitor-a');

        expect(counts.total).toBe(1);
        expect(counts.anonymous).toBe(1);
    });

    test('splits authenticated and anonymous viewers', () => {
        tracker.touch('1', 'guest');
        tracker.touch('1', 'member', { authenticated: true });

        expect(tracker.getCounts('1')).toMatchObject({
            total: 2,
            authenticated: 1,
            anonymous: 1
        });
    });

    test('tracks the latest authentication state of a visitor', () => {
        tracker.touch('1', 'visitor-a', { authenticated: false });
        tracker.touch('1', 'visitor-a', { authenticated: true });
        expect(tracker.getCounts('1')).toMatchObject({ total: 1, authenticated: 1, anonymous: 0 });

        tracker.touch('1', 'visitor-a', { authenticated: false });
        expect(tracker.getCounts('1')).toMatchObject({ total: 1, authenticated: 0, anonymous: 1 });
    });

    test('keeps counts isolated per stream', () => {
        tracker.touch('1', 'visitor-a');
        tracker.touch('2', 'visitor-b');
        tracker.touch('2', 'visitor-c');

        expect(tracker.getCounts('1').total).toBe(1);
        expect(tracker.getCounts('2').total).toBe(2);
        expect(tracker.getCounts('3').total).toBe(0);
    });

    test('prunes viewers that stop sending heartbeats after the TTL', () => {
        tracker.touch('1', 'visitor-a');
        clock += DEFAULT_TTL_MS + 1;

        expect(tracker.getCounts('1')).toMatchObject({ total: 0, authenticated: 0, anonymous: 0 });
        expect(tracker.getTrackedStreamCount()).toBe(0);
    });

    test('keeps a visitor alive across heartbeats within the TTL', () => {
        tracker.touch('1', 'visitor-a');
        clock += DEFAULT_TTL_MS - 1;
        tracker.touch('1', 'visitor-a');
        clock += DEFAULT_TTL_MS - 1;

        expect(tracker.getCounts('1').total).toBe(1);
    });

    test('remove() decrements the count and cleans up empty streams', () => {
        tracker.touch('1', 'visitor-a');
        tracker.touch('1', 'visitor-b');

        const counts = tracker.remove('1', 'visitor-a');

        expect(counts).toMatchObject({ total: 1, anonymous: 1 });
        expect(tracker.getTrackedStreamCount()).toBe(1);

        tracker.remove('1', 'visitor-b');
        expect(tracker.getTrackedStreamCount()).toBe(0);
    });

    test('remove() is a no-op for unknown visitors', () => {
        tracker.touch('1', 'visitor-a');

        expect(tracker.remove('1', 'unknown')).toMatchObject({ total: 1 });
        expect(tracker.remove('2', 'unknown')).toMatchObject({ total: 0 });
    });

    test('rejects invalid identifiers', () => {
        expect(tracker.touch('', 'visitor-a')).toBeNull();
        expect(tracker.touch('1', '')).toBeNull();
        expect(tracker.touch('1', '   ')).toBeNull();
        expect(tracker.touch('1', 'x'.repeat(121))).toBeNull();
        expect(tracker.getCounts('')).toBeNull();
        expect(tracker.remove('1', '')).toBeNull();
    });

    test('caps the number of visitors tracked per stream', () => {
        const capped = createViewerPresenceTracker({ now: () => clock, maxVisitorsPerStream: 2 });

        capped.touch('1', 'visitor-a');
        capped.touch('1', 'visitor-b');
        const counts = capped.touch('1', 'visitor-c');

        expect(counts.total).toBe(2);
        expect(capped.remove('1', 'visitor-c').total).toBe(2);
    });

    test('evicts the least recently active stream when the stream cap is reached', () => {
        const capped = createViewerPresenceTracker({
            now: () => clock,
            ttlMs: 60000,
            maxTrackedStreams: 2
        });

        capped.touch('1', 'visitor-a');
        clock += 1000;
        capped.touch('2', 'visitor-b');
        clock += 1000;
        capped.touch('3', 'visitor-c');

        expect(capped.getTrackedStreamCount()).toBe(2);
        expect(capped.getCounts('1').total).toBe(0);
        expect(capped.getCounts('2').total).toBe(1);
        expect(capped.getCounts('3').total).toBe(1);
    });

    test('clear() resets all counters', () => {
        tracker.touch('1', 'visitor-a');
        tracker.touch('2', 'visitor-b');

        tracker.clear();

        expect(tracker.getTrackedStreamCount()).toBe(0);
        expect(tracker.getCounts('1').total).toBe(0);
    });

    test('prune() removes expired streams', () => {
        tracker.touch('1', 'visitor-a');
        tracker.touch('2', 'visitor-b');
        clock += DEFAULT_TTL_MS + 1;

        expect(tracker.prune()).toBe(0);
    });
});

describe('viewerPresence identifier sanitizers', () => {
    test('trims valid identifiers', () => {
        expect(sanitizeStreamId('  stream-1  ')).toBe('stream-1');
        expect(sanitizeVisitorId('  visitor-1  ')).toBe('visitor-1');
    });

    test('rejects non-strings, empty strings and oversized identifiers', () => {
        for (const value of [null, undefined, 42, {}, '', '   ', 'x'.repeat(121)]) {
            expect(sanitizeStreamId(value)).toBeNull();
            expect(sanitizeVisitorId(value)).toBeNull();
        }
    });
});
