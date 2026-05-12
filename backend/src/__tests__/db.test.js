import { jest } from '@jest/globals';

const fakeConnection = {
    query: jest.fn(),
    release: jest.fn()
};
const fakePool = {
    getConnection: jest.fn(() => fakeConnection)
};

jest.unstable_mockModule('mysql2/promise', () => ({
    default: {
        createPool: jest.fn(() => fakePool)
    }
}));

const { default: db } = await import('../db.js');

describe('Database Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should create a connection pool', () => {
        expect(db.pool).toBe(fakePool);
    });

    test('getConnection should return a connection from the pool', async () => {
        const connection = await db.getConnection();

        expect(fakePool.getConnection).toHaveBeenCalledTimes(1);
        expect(connection).toBe(fakeConnection);
    });

    test('query should execute SQL and release the connection', async () => {
        fakeConnection.query.mockResolvedValue(['result', 'fields']);

        const result = await db.query('SELECT 1', [123]);

        expect(fakePool.getConnection).toHaveBeenCalledTimes(1);
        expect(fakeConnection.query).toHaveBeenCalledWith('SELECT 1', [123]);
        expect(fakeConnection.release).toHaveBeenCalledTimes(1);
        expect(result).toEqual('result');
    });

    test('query should release the connection when the query fails', async () => {
        fakeConnection.query.mockRejectedValue(new Error('Query failed'));

        await expect(db.query('SELECT 1', [])).rejects.toThrow('Query failed');
        expect(fakeConnection.release).toHaveBeenCalledTimes(1);
    });
});
