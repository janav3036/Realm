#!/usr/bin/env bash
set -e

REPO_DIR="$HOME/realm"
CLIENT_DIR="$REPO_DIR/client"

echo "=== Pulling latest code ==="
cd "$REPO_DIR" && git pull

echo "=== Rebuilding client ==="
cd "$CLIENT_DIR" && npm install && npm run build

echo "=== Restarting server ==="
sudo systemctl restart realm

echo "=== Done — realm is live ==="
sudo systemctl status realm --no-pager
