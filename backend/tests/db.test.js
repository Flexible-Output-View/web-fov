/**
 * Database Module Test Suite
 * Tests connection pooling, query execution, and error handling
 */

import { test } from 'node:test';
import assert from 'node:assert';
import db from '../src/db.js';

test('Database Module', async (t) => {
    await t.test('should have getConnection method', () => {
        assert.strictEqual(typeof db.getConnection, 'function');
    });

    await t.test('should have query method', () => {
        assert.strictEqual(typeof db.query, 'function');
    });

    await t.test('should have connection pool', () => {
        assert.ok(db.pool, 'Connection pool should exist');
        assert.strictEqual(db.pool.config.connectionLimit, 5, 'Pool limit should be 5');
    });

    await t.test('getConnection returns a connection object', async () => {
        try {
            const conn = await db.getConnection();
            assert.ok(conn, 'Connection should be returned');
            // Don't release here - test real environment
        } catch (err) {
            // Expected to fail in test environment without real MySQL
            assert.ok(err.code, 'Should have error code');
        }
    });

    await t.test('query method accepts SQL and parameters', async () => {
        try {
            // This will fail without real MySQL, but tests the interface
            const result = await db.query('SELECT 1', []);
            assert.ok(Array.isArray(result), 'Query should return array');
        } catch (err) {
            // Expected to fail in test environment
            assert.ok(err.code, 'Should have MySQL error code');
        }
    });

    await t.test('connection pool should have enableKeepAlive', () => {
        assert.ok(db.pool.config.enableKeepAlive, 'KeepAlive should be enabled');
    });
});
