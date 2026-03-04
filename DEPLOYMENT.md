# AccoAdmin Backend Deployment Guide

This guide deploys the `scan-portal` backend (Node/Express) to the production server 
using PM2 as the process manager and Nginx as the reverse proxy, mirroring the 
`cogni-agent` deployment pattern.

## 1. SSH Into the Server

```bash
ssh ubuntu@your-server-ip
cd ~/cogni/Ticketing_system_cogni/scan-portal/backend
```

## 2. Run the Deploy Script

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
- Pull the latest code from `main`
- Run `npm install --production`
- (Re)start the PM2 process named **`cogni-acco`**

## 3. Configure Nginx

Open the Nginx config:

```bash
sudo nano /etc/nginx/sites-available/default
```

Find the `server` block handling HTTPS (port 443) and add the following **inside** it:

```nginx
# --------------------------------------------------
# AccoAdmin Backend Reverse Proxy
# --------------------------------------------------
location /api/acco/ {
    # Strip /api/acco/ prefix before forwarding to Express
    rewrite ^/api/acco/(.*) /$1 break;

    # Forward to the local Node server on port 5000
    proxy_pass http://localhost:5000;

    # Standard proxy headers
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

### Verify and Reload

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Update Frontend Configuration

In `Hofond/.env` (and `.env.production` if you have one), set:

```
VITE_ACCO_API_DOMAIN=https://cognizance.org.in/api/acco/
```

Then rebuild Hofond:

```bash
cd ~/cogni/Hofond
npm run build
```

## 5. Verify

### Check PM2
```bash
pm2 list
pm2 logs cogni-acco
```

### Test via curl
```bash
curl https://cognizance.org.in/api/acco/api/admin/participants
```
Should return a JSON response.

## Troubleshooting

| Problem | Command |
|---|---|
| Check Nginx status | `sudo systemctl status nginx` |
| View Nginx error log | `sudo tail -f /var/log/nginx/error.log` |
| View backend logs | `pm2 logs cogni-acco` |
| Restart backend | `pm2 restart cogni-acco` |
| Check port in use | `ss -tlnp \| grep 5000` |
