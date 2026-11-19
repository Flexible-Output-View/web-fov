#!/usr/bin/env bash
# Generates CycloneDX SBOMs for the Node.js parts of web-fov.
#
# Outputs:
#   sbom/web-fov-backend.cdx.json    backend inventory   -> web-fov-backend
#   sbom/web-fov-frontend.cdx.json   Angular inventory   -> web-fov-frontend
#
# Usage: ./scripts/generate-sbom.sh [output-dir]
# Default output dir: <repo>/sbom
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/sbom}"
CYCLONEDX_NPM_VERSION="${CYCLONEDX_NPM_VERSION:-7}"

mkdir -p "$OUT_DIR"

# --package-lock-only keeps generation deterministic and independent from
# whatever happens to be installed in node_modules.
generate() {
  local workspace="$1" name="$2"
  echo "==> SBOM for $workspace"
  (cd "$ROOT_DIR/$workspace" && \
    npx --yes "@cyclonedx/cyclonedx-npm@$CYCLONEDX_NPM_VERSION" \
      --package-lock-only \
      --output-format json \
      --output-file "$OUT_DIR/$name")
  echo "    -> $OUT_DIR/$name"
}

generate backend      web-fov-backend.cdx.json
generate fov-angular  web-fov-frontend.cdx.json

echo "==> Done:"
ls -lh "$OUT_DIR"/*.cdx.json
