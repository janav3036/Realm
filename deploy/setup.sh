#!/usr/bin/env bash
set -e

REPO_DIR="$HOME/realm"
SERVER_DIR="$REPO_DIR/server"
CLIENT_DIR="$REPO_DIR/client"

echo "=== Installing system packages ==="
sudo apt-get update -q
sudo apt-get install -y python3-pip python3-venv nginx certbot python3-certbot-nginx git

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== Cloning repo ==="
git clone https://github.com/janav3036/Realm.git "$REPO_DIR"

echo "=== Python virtualenv ==="
python3 -m venv "$SERVER_DIR/venv"
"$SERVER_DIR/venv/bin/pip" install -r "$REPO_DIR/requirements.txt"

echo "=== Building client ==="
cd "$CLIENT_DIR" && npm install && npm run build

echo "=== systemd service ==="
sudo cp "$REPO_DIR/deploy/realm.service" /etc/systemd/system/realm.service
sudo systemctl daemon-reload
sudo systemctl enable realm
sudo systemctl start realm

echo "=== nginx config ==="
sudo ln -sf "$REPO_DIR/deploy/realm.nginx" /etc/nginx/sites-available/realm
sudo ln -sf /etc/nginx/sites-available/realm /etc/nginx/sites-enabled/realm
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo ""
echo "=== Done! Next steps ==="
echo "1. Point your DNS A record to this VM's external IP"
echo "2. Run: sudo certbot --nginx -d realm.janavshah.com"
