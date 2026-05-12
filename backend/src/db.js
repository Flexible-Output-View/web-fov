import * as dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fovwebdb',
    connectionLimit: 5,
    enableKeepAlive: true
});

export default {
    pool,
    async getConnection() {
        return pool.getConnection();
    },
    async query(sql, params) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(sql, params);
            return rows;
        } finally {
            if (conn) {
                conn.release();
            }
        }
    }
};