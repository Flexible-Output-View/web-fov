import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

import db from './db.js';
import apiRoutes from './routes/index.js';
import { startMediaServer } from './mediaServer.mjs';


const PORT = process.env.PORT || 4000;

const app = express();
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
import path from 'path';

const mediaRoot = process.env.MEDIA_ROOT; //|| path.join(__dirname, '..', 'media');
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
        await startMediaServer();

        app.listen(PORT, () => {
            console.log(`🚀 Server listening on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Unable to connect to DB', err);
        process.exit(1);
    }
}

start();
