#!/bin/bash

set -euox

API_URL="${API_URL:-http://localhost:8080}"
PUBLISH_URL="${API_URL}/ffmpeg/register"
SRT_URL="${SRT_URL:-srt://localhost:9999}"

curl --header "Content-Type: application/json" \
  --request POST \
  --data '{
    "streamId": "FOVDemo",
    "tracks": 2,
    "videoTrackNames": ["BigBuckBunny", "Caminandes 2: Gran Dillama"],
    "audioTracks": 2,
    "audioTrackNames": ["BigBuckBunny", "Caminandes 2: Gran Dillama"]
  }' \
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