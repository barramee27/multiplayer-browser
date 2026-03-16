#!/bin/bash
# Run this script on your VPS (72.61.151.199) to set up Multiplayer Browser
# Usage: bash setup-vps.sh

set -e

echo "=== Multiplayer Browser VPS Setup ==="

# 1. Install Node.js 20.x if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# 2. Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# 3. Install Nginx if not present
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    sudo apt-get update
    sudo apt-get install -y nginx
fi

# 4. Create app directory (use $HOME - works for root and regular users)
APP_DIR="$HOME/multiplayer-browser"
mkdir -p "$APP_DIR"
echo "App directory: $APP_DIR"

# 5. Copy server files (run deploy.sh from your local machine first, or clone repo)
if [ ! -f "$APP_DIR/server/package.json" ]; then
    echo ""
    echo ">>> Server files not found. Run deploy.sh from your local machine first,"
    echo "    or clone: git clone https://github.com/barramee27/multiplayer-browser.git $APP_DIR"
    echo ""
    exit 1
fi

# 6. Install dependencies
cd "$APP_DIR/server"
npm install --production
mkdir -p logs

# 7. Start with PM2
pm2 delete multiplayer-browser 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Run the command it outputs to enable startup on boot

# 8. Nginx config
NGINX_CONF="/etc/nginx/sites-available/multiplayer"
if [ ! -f "$NGINX_CONF" ]; then
    echo "Copy nginx config to $NGINX_CONF and enable:"
    echo "  sudo cp deploy/nginx-multiplayer.conf $NGINX_CONF"
    echo "  sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/"
    echo "  sudo nginx -t && sudo systemctl reload nginx"
fi

# 9. SSL (Let's Encrypt)
echo ""
echo "=== Next: Get SSL certificate ==="
echo "  sudo apt install certbot python3-certbot-nginx -y"
echo "  sudo certbot --nginx -d multiplayer.codemesh.org"
echo ""
echo "Then uncomment the HTTPS server block in nginx config and reload."
echo ""
echo "=== Done. Server running on port 4000 ==="
pm2 status
