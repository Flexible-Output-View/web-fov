FROM node:18-slim

# install ffmpeg for media processing and track conversion
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# copy package files first to leverage Docker cache
COPY package*.json ./

RUN npm i --package-lock-only

RUN npm ci --only=production

# copy source
COPY . .

RUN chown -R node:node /usr/src/app
USER node

ENV PORT=4000
EXPOSE 4000

# Note: SRT/RTMP media server is handled by MediaMTX container
# Backend spawns FFmpeg to convert multi-track streams to HLS
CMD ["npm", "start"]
