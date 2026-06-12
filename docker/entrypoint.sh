#!/bin/sh
set -e

echo "[entrypoint] running database migrations (DATABASE_PATH=${DATABASE_PATH:-./data/data.sqlite})"
node dist/migrate.js

echo "[entrypoint] starting server on port ${PORT:-3000}"
exec node dist/index.js
