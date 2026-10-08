#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p artifacts
if curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1; then
  exit 0
fi
nohup npm run dev > artifacts/startup.log 2>&1 &