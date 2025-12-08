require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    try {
        const conn = await mysql.createConnection({
            host: '217.182.104.153',
            user: 'fov-admin',
            password: 'Admin-FOV@EIP-Epitech',
            database: 'fovwebdb',
        });
        console.log('✅ Connected!');
        const res = await conn.query('SELECT 1');
        console.log('✅ Query result:', res);
        await conn.end();
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error('Code:', err.code);
    }
})();