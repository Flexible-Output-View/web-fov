require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

const db = require('./db');
const apiRoutes = require('./routes');
const { startMediaServer } = require('./mediaServer');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
const path = require('path');

const mediaRoot = process.env.MEDIA_ROOT || path.join(__dirname, '..', 'media');
app.use('/hls', express.static(mediaRoot));

app.get('/', (req, res) => res.json({ ok: true, message: 'FOV backend running' }));

// Mount API routes under /api
app.use('/api', apiRoutes);

app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

async function start() {
    try {
        // verify connection
        const conn = await db.getConnection();
        await conn.ping();
        conn.release();
        console.log('✅ Connected to BDD');

        // start media server (RTMP ingest + HLS)
        startMediaServer();

        app.listen(PORT, () => {
            console.log(`🚀 Server listening on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Unable to connect to DB', err);
        process.exit(1);
    }
}

start();
