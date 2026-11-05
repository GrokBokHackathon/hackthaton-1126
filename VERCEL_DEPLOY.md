# Flag Raid - Vercel Deployment Guide

## Quick Start

1. **Go to Vercel**: https://vercel.com/new
2. **Import this repository**: `GrokBokHackathon/hackthaton-1126`
3. **Configure project settings**:
   - Framework Preset: **Other**
   - Root Directory: **`.`** (leave as root)
   - Build Command: *Leave empty*
   - Output Directory: *Leave empty*
   - Install Command: *Leave empty*
4. **Click Deploy**

That's it! Vercel will automatically use the `vercel.json` configuration.

## What Gets Deployed

- **Landing page**: `https://your-project.vercel.app/` (marketing page)
- **Game client**: `https://your-project.vercel.app/game.html` (playable CTF)

## How It Works

### Static File Serving
- `vercel.json` configures Vercel to serve files from `apps/web`
- No build step needed - pure static HTML/CSS/JS
- Landing page (`index.html`) served at root
- Game client and assets served as-is

### WebSocket Connection
- **On Vercel**: Game client connects to `https://hakaton-11-26.wffe.io` (Cloudflare Tunnel)
- **Local dev**: Game client connects to `http://127.0.0.1:8080`
- Smart detection in `apps/web/game.html` based on hostname

### Architecture Split
```
┌─────────────────────────────────────────────┐
│  Vercel (Static Site)                       │
│  - Marketing landing page (/)               │
│  - Game client HTML/CSS/JS (/game.html)     │
└─────────────────┬───────────────────────────┘
                  │ WebSocket
                  │ wss://hakaton-11-26.wffe.io/ws
                  ▼
┌─────────────────────────────────────────────┐
│  Cloudflare Tunnel (Wiktor's Laptop)        │
│  - Realtime game server                     │
│  - WebSocket /ws endpoint                   │
│  - Server-authoritative game logic          │
└─────────────────────────────────────────────┘
```

## Updating Game Server URL

If the Cloudflare Tunnel URL changes, update in two files:

1. **`apps/web/game.html`** (line ~101):
   ```javascript
   const gameServerOrigin = window.location.hostname === 'localhost' 
     ? window.location.origin
     : 'https://YOUR-NEW-URL.wffe.io';
   ```

2. **`apps/web/index.html`** (Play Now button):
   ```html
   <a href="https://YOUR-NEW-URL.wffe.io/game.html" class="btn btn-primary">
   ```

## Custom Domain (Optional)

1. In Vercel project settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions
4. Wait for DNS propagation

## Environment Variables

None needed! This is a static site with no backend API calls from Vercel.

The game server URL is hardcoded in the client for simplicity.

## Troubleshooting

### Game Won't Connect
- Check that `https://hakaton-11-26.wffe.io` is accessible
- Verify WebSocket endpoint at `wss://hakaton-11-26.wffe.io/ws`
- Check browser console for connection errors

### Landing Page 404
- Verify `vercel.json` is in repository root
- Check that `apps/web/index.html` exists
- Rebuild deployment in Vercel dashboard

### Assets Not Loading
- Verify `apps/web/assets/` folder exists
- Check that `assets.js`, `atlas.js`, `game.js` are in `apps/web/`
- Review Vercel function logs for errors

## Local Development

Docker Compose still works independently:

```bash
docker compose up --build server web
```

- Server: http://127.0.0.1:8080
- Landing: http://127.0.0.1:3000/
- Game: http://127.0.0.1:3000/game.html

## Notes

- Vercel deployment is **optional** - game works with tunnel hosting alone
- Realtime game server **must stay** on Cloudflare Tunnel (WebSocket support)
- No secrets in Vercel config - it's all public static files
- Landing page updates deploy instantly on git push (if auto-deploy enabled)
