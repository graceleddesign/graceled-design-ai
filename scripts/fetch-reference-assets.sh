#!/usr/bin/env bash
set -euo pipefail

URL="${REFERENCE_ASSETS_URL:-https://github.com/graceleddesign/graceled-design-ai/releases/download/assets-v1/reference_assets_v1.zip}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p .cache
ZIP=".cache/reference_assets.zip"

curl -L "$URL" -o "$ZIP"
unzip -o "$ZIP" -d "$ROOT"
