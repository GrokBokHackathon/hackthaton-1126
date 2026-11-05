# Flag Raid - Current Status

**Branch**: `cursor/playable-slice-cba3`  
**PR**: #2 (stacked on #1 `cursor/decision-docs-1503`)  
**Date**: Nov 5, 2026

## ✅ Completed - First Playable Slice

### What Works

1. **Full multiplayer capture the flag game**
   - Server-authoritative at 20 Hz
   - True networked multiplayer (each player on their own device/browser)
   - 2 teams: Red humans (top-left) vs Bot team (bottom-right)
   - First to 3 captures wins

2. **Rules implemented**
   - Touch enemy flag to pick up
   - Bring to your base to score
   - Tag enemy carriers in your half to return flag
   - Tagged players respawn at base after 2 seconds

3. **Map generation**
   - 64×40 tiles per map
   - Fresh procedural map each round
   - Guaranteed connectivity between bases (flood fill validation)
   - Minimum obstacle density enforced (40+ obstacles with variety)
   - Tile types: floor, wall (blocks), crate (blocks), bush (walkable, blocks vision)

4. **Web client**
   - Responsive zoom system: 16 tiles always visible on short side
   - Camera follows local player, clamped to map edges
   - Works on desktop (WASD/arrows) and mobile (on-screen joystick)
   - HUD in screen space (score, status)
   - Handles resize and orientation changes

5. **Bot client**
   - Simple AI: chase enemy flag, bring home, tag carriers
   - Easy for Grok Bot to replace via same WebSocket protocol

6. **Tests**
   - 8/8 passing
   - Map connectivity between diagonal bases
   - Obstacle density requirements
   - Flag pickup and capture flow
   - Tag returns flag
   - Win condition and map reset

### Technical Details

- **Protocol**: JSON over WebSocket at `/ws` (documented in `docs/PROTOCOL.md`)
- **Config**: Map size, vision radius (7 tiles), LOS blockers in `apps/server/game.js` CONFIG
- **Asset system**: `apps/web/assets.js` - structured for easy sprite sheet drop-in

## 🎨 Art Integration - Next

### What's Ready

The asset rendering system in `apps/web/assets.js` is structured to accept:
- Character sheets (Red, Bot, recolor mask) with animation frames
- Tile atlas with autotile walls
- FX and props (flags, respawn effects, etc.)
- All rendering goes through config for easy path swapping

### When Art Pack Arrives

1. Drop files into `apps/web/assets/`
2. Update paths in `assets.js` CONFIG
3. Wire atlas.json frame lookups
4. Replace placeholder shapes with sprite rendering

This is a **separate follow-up PR** to keep this one shippable.

## 🌫️ Fog of War - Future PR

### Already Prepared

- Vision radius: 7 tiles (in CONFIG)
- LOS blockers: walls and bushes (in CONFIG.visionBlockers)
- State broadcast structure supports per-client filtering

### What's Needed

1. Server-side visibility computation (line-of-sight from player)
2. Filter `state` message per client (only send visible entities)
3. Client-side fog overlay (darken unseen tiles)

## 🚀 How to Test Now

### Local Docker Compose
```bash
docker compose up --build server web
# Open http://127.0.0.1:3000/ in multiple tabs
```

### Add a bot
```bash
npm ci --prefix apps/bot
node apps/bot/bot.js ws://127.0.0.1:8080/ws BotA
```

### Via public tunnel
If `CLOUDFLARE_TUNNEL_TOKEN` is set in `.env`:
```bash
docker compose up --build
# Open https://<your-hostname>/ from any device
node apps/bot/bot.js wss://<your-hostname>/ws BotA
```

## 📋 Known Limitations (By Design for ~3 Hour Slice)

1. **Art**: Placeholder colored shapes and emoji - art pack wiring is next
2. **Fog of war**: Prepared but not implemented - full visibility for now
3. **Powerups**: Config hooks in place, not implemented yet
4. **Bot AI**: Very simple (beeline to flag/base) - Grok Bot brain comes later
5. **Sounds**: None - outside scope
6. **Animations**: Frame hooks exist, but placeholders don't animate yet

## 🎯 Next Priorities

1. **Art wiring** (small, client-only) - drop sprite sheets into atlas system
2. **Fog of war** (server + client) - visibility filtering per player
3. **More testing** with multiple real humans + multiple bots
4. **Polish**: Better respawn effects, flag trail indicators, minimap
5. **Grok Bot integration** - replace simple AI with LLM decision-making

---

**Status**: ✅ Ready to merge and play!  
**Demo-able**: Yes - spin up server, open 2 tabs, run a bot, play to 3 captures
