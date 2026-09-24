import * as dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fovwebdb'
});

try {
    const res = await pool.query('SELECT 1 AS ok');
    console.log('✅ Connected!');
    console.log('✅ Query result:', res.rows);
} catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Code:', err.code);
} finally {
    await pool.end();
}
