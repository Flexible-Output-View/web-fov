#!/bin/bash

if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
    echo "Environment variables loaded."
else
    echo "Error: .env file not found."
    exit 1
fi

mkdir -p ./backend/media/hls
chmod -R 777 ./backend/media

docker compose down

docker compose up --build



