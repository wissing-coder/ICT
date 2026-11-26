#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo 'Install Docker Engine and its Compose plugin before starting this project.' >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo 'Copy .env.example to .env, then set the domain and approved ICP number.' >&2
  exit 1
fi
docker info >/dev/null
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 120
docker compose ps
echo 'Containers are ready. Verify HTTPS from an external network and open /healthz.'
