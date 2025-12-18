const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');

const config = {
    rtmp: {
        port: process.env.RTMP_PORT ? parseInt(process.env.RTMP_PORT) : 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
    },
    http: {
        port: process.env.MEDIA_HTTP_PORT ? parseInt(process.env.MEDIA_HTTP_PORT) : 8000,
        allow_origin: '*',
        mediaroot: process.env.MEDIA_ROOT || path.join(__dirname, '..', 'media')
    },
    trans: {
        ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
        tasks: [
            {
                app: 'live',
                hls: true,
                hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
                dash: false
            }
        ]
    }
};

let nms;

function startMediaServer() {
    if (nms) return nms;
    try {
        const mr = config.http.mediaroot;
        fs.mkdirSync(mr, { recursive: true });
    } catch (err) {
        console.error('Unable to create media root:', err);
        throw err;
    }
    nms = new NodeMediaServer(config);

    nms.on('postPublish', (id, StreamPath, args) => {
        const session = nms.getSession(id);
        console.log('🔴 Stream started:', StreamPath, 'from', session ? session.socket.remoteAddress : 'unknown');
    });

    nms.on('donePublish', (id, StreamPath, args) => {
        console.log('⚪ Stream ended:', StreamPath);
    });

    nms.run();
    console.log(`NodeMediaServer running (RTMP:${config.rtmp.port}, HTTP:${config.http.port}) mediaroot=${config.http.mediaroot}`);
    return nms;
}

module.exports = { startMediaServer, config };
