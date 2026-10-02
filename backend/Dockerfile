FROM node:22.23.3-bookworm-slim

# install ffmpeg for media processing (pinné via base bookworm ; JS deps figées via package-lock.json)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# copy package files first to leverage Docker cache
# NOTE: ne pas régénérer le lock ici — npm ci utilise backend/package-lock.json versionné
COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# copy source
COPY . .

RUN chown -R node:node /usr/src/app
USER node

ENV PORT=4000
EXPOSE 4000
EXPOSE 9999-10010/udp

CMD ["npm", "start"]
