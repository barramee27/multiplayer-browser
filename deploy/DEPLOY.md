# Multiplayer Browser – VPS Deployment

Your DNS is already set: `multiplayer.codemesh.org` → `72.61.151.199`.

## Quick deploy (from your machine)

```bash
# 1. Deploy files to VPS (replace 'root' with your SSH user if different)
cd /home/barramee27/multiplayer-browser
chmod +x deploy/deploy.sh
./deploy/deploy.sh root@72.61.151.199
```

## On the VPS (SSH in first)

```bash
ssh root@72.61.151.199   # or your user
```

### First-time setup

```bash
# Install Node.js 20, PM2, Nginx (if not already)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

# Go to app directory (after deploy)
cd ~/multiplayer-browser/server
npm install --production
mkdir -p logs

# Start the server
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # run the command it prints to enable on reboot
```

### Nginx + SSL

```bash
# Copy nginx config
sudo cp ~/multiplayer-browser/deploy/nginx-multiplayer.conf /etc/nginx/sites-available/multiplayer
sudo ln -sf /etc/nginx/sites-available/multiplayer /etc/nginx/sites-enabled/

# Remove default site if it conflicts
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t && sudo systemctl reload nginx

# Get free SSL certificate (HTTPS)
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d multiplayer.codemesh.org
```

Certbot will add HTTPS and redirect HTTP → HTTPS.

### Verify

- HTTP: http://multiplayer.codemesh.org
- HTTPS: https://multiplayer.codemesh.org (after certbot)

The extension uses `https://multiplayer.codemesh.org`, so SSL is required for it to work.

## Updates (after code changes)

```bash
# From your machine
./deploy/deploy.sh root@72.61.151.199

# On VPS
cd ~/multiplayer-browser/server && npm install --production && pm2 restart multiplayer-browser
```

## PM2 commands

```bash
pm2 status              # Check status
pm2 logs multiplayer-browser   # View logs
pm2 restart multiplayer-browser # Restart
```
