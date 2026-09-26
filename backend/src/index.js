import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { createServer } from 'http';

import db from './db.js';
import apiRoutes from './routes/index.js';
import { createMediaRoutes, startMediaServer, clearHLSFiles } from './mediaServer.mjs';
import swaggerDocument from './swagger.js';
import { initChatSocket } from './chatSocket.js';
import { ensureChatTable } from './routes/chat.js';

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.enable('trust proxy');

// Mount media routes (HLS and FFmpeg endpoints)
const mediaRouter = createMediaRoutes();
app.use(mediaRouter);

app.get('/', (req, res) => res.json({ ok: true, message: 'FOV backend running' }));
app.get('/api-docs.json', (req, res) => res.json(swaggerDocument));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Mount API routes under /api
app.use('/api', apiRoutes);

// eslint-disable-next-line
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

async function start() { 
    try {
        // verify PostgreSQL connection
        await db.query('SELECT 1');
        console.log('✅ Connected to BDD');
        // Ensure chat persistence table exists (safe on existing DBs)
        try {
            await ensureChatTable();
            console.log('✅ Chat table ready');
        } catch (err) {
            console.error('⚠️ Unable to ensure chat table', err?.message || err);
        }
        // Clear HLS files on server start
        clearHLSFiles();

        // initialize media server
        await startMediaServer(app);

        const httpServer = createServer(app);
        const io = initChatSocket(httpServer);
        app.set('io', io);

        const server = httpServer.listen(PORT, () => {
            console.log(`🚀 Server listening on http://localhost:${PORT}`);
            console.log(`📺 HLS available at http://localhost:${PORT}/api/hls`);
            console.log(`💬 Chat realtime ready (Socket.IO)`);
        });

        // Handle server errors
        server.on('error', (err) => {
            console.error('Server error:', err);
            process.exit(1);
        });
    } catch (err) {
        console.error('Unable to connect to DB', err);
        process.exit(1);
    }
}

start();
