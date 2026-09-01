import * as dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fovwebdb',
    max: 5,
    idleTimeoutMillis: 30000,
    keepAlive: true
});

export default {
    pool,
    async query(text, params) {
        const res = await pool.query(text, params);
        return res.rows;
    },
    async getClient() {
        return pool.connect();
    }
};