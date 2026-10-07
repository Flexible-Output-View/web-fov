#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE_FILE="$ROOT_DIR/docker-compose.test.yml"

cleanup() {
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
}

cleanup
trap cleanup EXIT INT TERM

docker compose -f "$COMPOSE_FILE" up -d --wait

export RUN_INTEGRATION=1
export DB_HOST=127.0.0.1
export DB_PORT=55432
export DB_USER=root
export DB_PASSWORD=postgres
export DB_NAME=fovwebdb
export JWT_SECRET=integration-test-secret

npm run test:integration:raw
