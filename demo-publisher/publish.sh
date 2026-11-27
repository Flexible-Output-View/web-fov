#!/bin/bash

set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
PUBLISH_URL="${API_URL}/api/ffmpeg/register"
SRT_URL="${SRT_URL:-srt://localhost:9999}"

# Ingest is key-only: the demo account is created (or reused) and its real
# backend-generated stream key is used to register the stream. There is no
# hardcoded or arbitrary stream id.
DEMO_USERNAME="${DEMO_USERNAME:-FOVDemo}"
DEMO_EMAIL="${DEMO_EMAIL:-fovdemo@integration.local}"
DEMO_PASSWORD="${DEMO_PASSWORD:-FOVDemoPassword123!}"

curl --silent --show-error \
  --header "Content-Type: application/json" \
  --request POST \
  --data "{\"username\":\"${DEMO_USERNAME}\",\"email\":\"${DEMO_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}" \
  "${API_URL}/api/auth/register" > /dev/null || true

TOKEN="$(curl --silent --show-error \
  --header "Content-Type: application/json" \
  --request POST \
  --data "{\"login\":\"${DEMO_USERNAME}\",\"password\":\"${DEMO_PASSWORD}\"}" \
  "${API_URL}/api/auth/login" | jq -r '.token // empty')"

if [ -z "${TOKEN}" ]; then
  echo "Unable to authenticate the demo account" >&2
  exit 1
fi

STREAM_KEY="$(curl --silent --show-error \
  --header "Authorization: Bearer ${TOKEN}" \
  "${API_URL}/api/streams/me/stream-key" | jq -r '.streamKey // empty')"

if [ -z "${STREAM_KEY}" ]; then
  echo "The backend did not return a stream key for the demo account" >&2
  exit 1
fi

curl --fail --silent --show-error \
  --header "Content-Type: application/json" \
  --request POST \
  --data "$(jq -n \
    --arg streamKey "${STREAM_KEY}" \
    '{
      streamId: $streamKey,
      tracks: 2,
      videoTrackNames: ["BigBuckBunny", "Caminandes 2: Gran Dillama"],
      audioTracks: 2,
      audioTrackNames: ["BigBuckBunny", "Caminandes 2: Gran Dillama"]
    }')" \
  "$PUBLISH_URL"

ffmpeg -re \
  -stream_loop -1 -i "bbb_sunflower_1080p_60fps_normal.mp4" \
  -stream_loop -1 -i "caminandes_gran_dillama.mp4" \
  -map 0:v:0 -c:v:0 copy \
  -map 1:v:0 -c:v:1  copy \
  -map 0:a:0 -c:a:0 copy \
  -map 1:a:0 -c:a:1 copy \
  -f mpegts "${SRT_URL}"

# libx264 -preset veryfast -b:v:0 2000k -pix_fmt yuv420p to transcode video instead of copy
# aac -b:a:0 128k to transcode audio instead of copy
