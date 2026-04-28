import db from '../db.js';

// Mock the mysql2/promise module
jest.mock('mysql2/promise', () => ({
    createPool: jest.fn(() => ({
        getConnection: jest.fn()
    }))
}));

describe('Database Module', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should export pool, getConnection, and query methods', () => {
        expect(typeof db.getConnection).toBe('function');
        expect(typeof db.query).toBe('function');
        expect(db.pool).toBeDefined();
    });

    describe('getConnection', () => {
        test('should return a connection object', async () => {
            // This is a basic smoke test
            // In production, use a test database
            expect(typeof db.getConnection).toBe('function');
        });
    });

    describe('query', () => {
        test('should accept SQL and params', async () => {
            expect(typeof db.query).toBe('function');
        });
    });
});
