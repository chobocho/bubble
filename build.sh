#!/usr/bin/env bash
# 단일 index.html 릴리스 빌드 스크립트
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm ci
fi

npm run typecheck
npm test
npm run build
npm run verify:release

echo "OK: release/index.html"
