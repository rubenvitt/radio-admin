#!/bin/sh
set -e

IMAGE="${1:-radio-admin:dev}"
NAME="radio-admin-smoke"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" \
  -e AUTH_DEV_BYPASS=true \
  -e DEV_USER_ROLE=admin \
  -e DEV_USER_NAME="Smoke User" \
  -e SESSION_SECRET=smoke-secret-not-for-prod-0123456789 \
  -e DATABASE_PATH=/data/data.sqlite \
  -e NODE_ENV=development \
  -p 3000:3000 \
  "$IMAGE"

# NODE_ENV=development above overrides the image's NODE_ENV=production for this
# throwaway smoke container only: the config refuses to boot the dev auth bypass
# in production, and the smoke check exercises the bypass on purpose.

echo "[smoke] waiting for server..."
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:3000/api/auth/me" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[smoke] checking SPA root /"
root_code=$(curl -s -o /tmp/root.html -w '%{http_code}' "http://localhost:3000/")
test "$root_code" = "200" || { echo "root returned $root_code"; docker logs "$NAME"; exit 1; }
grep -qi "<title" /tmp/root.html || { echo "root is not HTML"; exit 1; }

echo "[smoke] checking /api/auth/me"
me_code=$(curl -s -o /tmp/me.json -w '%{http_code}' "http://localhost:3000/api/auth/me")
test "$me_code" = "200" || { echo "/api/auth/me returned $me_code"; docker logs "$NAME"; exit 1; }
grep -q '"role"' /tmp/me.json || { echo "/api/auth/me missing role"; cat /tmp/me.json; exit 1; }

echo "[smoke] OK"
