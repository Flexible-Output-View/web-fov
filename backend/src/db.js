require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fovwebdb',
    connectionLimit: 5,
    enableKeepAlive: true,
});

module.exports = {
    pool,
    async getConnection() {
        return pool.getConnection();
    },
    async query(sql, params) {
        const conn = await pool.getConnection();
        try {
            const res = await conn.query(sql, params);
            return res;
        } finally {
            if (conn) conn.release();
        }
    }
};
