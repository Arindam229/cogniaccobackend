#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Navigate to the backend directory (where this script lives)
cd "$(dirname "$0")"

echo "🚀 Starting AccoAdmin Backend Deployment..."

# 1. Pull latest changes
echo "📥 Pulling latest changes from main..."
git fetch origin
git reset --hard origin/main

# 2. Install production dependencies
echo "📦 Installing Node dependencies..."
nvm deactivate
npm install --production

# 3. Restart PM2 process
echo "🔄 Restarting PM2 process (cogni-acco)..."
if pm2 list | grep -q "cogni-acco"; then
    pm2 delete cogni-acco
fi

pm2 start ecosystem.config.js

# 4. Save PM2 process list so it survives reboots
pm2 save

echo "✅ AccoAdmin Backend Deployment Complete!"
echo "ℹ️  Verify with: pm2 logs cogni-acco"
