#!/usr/bin/env bash
# Publicly host the app (production-minified web build + Expo Go manifest) through Expo's
# ngrok tunnel at a stable https://<id>-anonymous-8081.exp.direct URL. No account needed.
# Restarts automatically if the tunnel/dev server ever exits.
cd "$(dirname "$0")/.."
while true; do
  echo "[$(date -u +%FT%TZ)] starting expo tunnel"
  CI=1 npx expo start --tunnel ngrok --no-dev --minify --port 8081
  echo "[$(date -u +%FT%TZ)] expo exited ($?), restarting in 5s"
  sleep 5
done
