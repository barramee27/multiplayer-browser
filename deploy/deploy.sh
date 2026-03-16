#!/bin/bash
# Deploy Multiplayer Browser server to VPS via rsync
# Usage: ./deploy.sh [user@72.61.151.199]
# Or set: export VPS="user@72.61.151.199"

VPS="${1:-$VPS}"
if [ -z "$VPS" ]; then
    echo "Usage: ./deploy.sh user@72.61.151.199"
    echo "   or: export VPS=user@72.61.151.199 && ./deploy.sh"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_DIR="~/multiplayer-browser"

echo "Deploying to $VPS:$REMOTE_DIR"

# Sync server + deploy configs (exclude node_modules, will run npm install on VPS)
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'logs' \
    "$REPO_ROOT/server/" "$VPS:$REMOTE_DIR/server/"

rsync -avz "$REPO_ROOT/deploy/" "$VPS:$REMOTE_DIR/deploy/"

echo ""
echo "Files synced. SSH into VPS and run:"
echo "  cd ~/multiplayer-browser/server && npm install --production && pm2 restart multiplayer-browser"
echo "  (or: pm2 start ecosystem.config.cjs   if first deploy)"
echo ""
