# Flag Raid - Current Status

**Branch**: `main`  
**Last updated**: Nov 5, 2026 (post PR #2 merge, commit 4255147)

## ✅ Completed on Main - Playable Game

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
   - Marketing landing page at `/` with play CTA and game info
   - Game client at `/game.html`
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

## 🎨 Art Integration - System Ready

### Current State

The asset rendering system is complete with graceful fallback:
- Atlas loading system (`apps/web/atlas.js`) loads `atlas.json` and sprite sheets
- All rendering goes through atlas with fallback to emoji/shapes when images missing
- Character animations (idle, run, carrying, dizzy, respawn) working
- Wall autotile with 4-bit bitmask working
- Animated flags and base rendering working
- FX system (respawn, hit effects) ready

### Next

- Drop final art PNGs into `apps/web/assets/` when ready
- System automatically loads sprites when present, falls back to placeholders otherwise
- See `docs/ART_INTEGRATION.md` for complete specs

## 🌫️ Fog of War - Planned (Not Built)

### Config Ready

- Vision radius: 7 tiles (in CONFIG)
- LOS blockers: walls and bushes (in CONFIG.visionBlockers)
- State broadcast structure supports per-client filtering

### Implementation Needed

1. Server-side visibility computation (line-of-sight from player)
2. Filter `state` message per client (only send visible entities)
3. Client-side fog overlay (darken unseen tiles)

**Status**: Config in place, implementation not started.

## 🎁 Mystery-Box Powerups - Planned (Not Built)

**Status**: Config hooks exist in game.js, but powerups are not implemented. This is the next slice after fog of war.

Planned effects (not implemented):
- Speed boost
- Shield/invulnerability
- Other power-ups TBD

**Status**: Not started. Do not document wire protocol fields until code exists.

## 🚀 How to Test Now

### Local Docker Compose
```bash
docker compose up --build server web
# Landing page: http://127.0.0.1:3000/
# Game client: http://127.0.0.1:3000/game.html (open in multiple tabs to play)
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
# Landing: https://<your-hostname>/
# Game: https://<your-hostname>/game.html (open from any device)
node apps/bot/bot.js wss://<your-hostname>/ws BotA
```

## 📋 Known Limitations (By Design for ~3 Hour Slice)

1. **Art**: Placeholder colored shapes and emoji - art pack wiring is next
2. **Fog of war**: Prepared but not implemented - full visibility for now
3. **Powerups**: Config hooks in place, not implemented yet
4. **Bot AI**: Very simple (beeline to flag/base) - Grok Bot brain comes later
5. **Sounds**: None - outside scope
6. **Animations**: Frame hooks exist, but placeholders don't animate yet

## 🎮 Commander Model - Locked Design, Not Yet Built

**Status**: Design decisions locked, implementation tracked in issues #4-#11 (Wiktor owns).

### What's Changing

The game is switching from direct player control to a **commander model**:
- **Bots play autonomously** with A* pathfinding and roles
- **Human commanders steer** with orders (not direct movement)
- **3 bots per team** (configurable)
- **One flag per base** (unchanged)

### Order Economy (Locked, Not Built)

- Start with **6 CP** (command points)
- Gain **+1 CP every 5 seconds**
- Cap at **10 CP**
- Maximum **15 orders per round**
- **+3 CP comeback bonus** (trigger condition TODO)
- **Beer Rush**: 8 CP special order, once per round

### AI Commander (Locked, Not Built)

- Grok Bot commander issues `command` messages roughly every **10 seconds**
- Operates under same CP economy and order limits as humans

### Implementation Roadmap

**Tracked issues (Wiktor owns):**
1. [#4: Decision: switch to the commander model (bots play, humans command)](https://github.com/GrokBokHackathon/hackthaton-1126/issues/4)
2. [#5: Bot autopilot with A* pathfinding and roles](https://github.com/GrokBokHackathon/hackthaton-1126/issues/5)
3. [#6: Orders and the command-point economy (server-side)](https://github.com/GrokBokHackathon/hackthaton-1126/issues/6)
4. [#7: Server-side fog of war](https://github.com/GrokBokHackathon/hackthaton-1126/issues/7)
5. [#8: Commander camera and one scale for phone and desktop](https://github.com/GrokBokHackathon/hackthaton-1126/issues/8)
6. [#9: Command panel UI (orders, budget, counter)](https://github.com/GrokBokHackathon/hackthaton-1126/issues/9)
7. [#10: Unit readability: order badges, selection, intent line, ping](https://github.com/GrokBokHackathon/hackthaton-1126/issues/10)
8. [#11: Round loop: win condition, new map each round, results screen](https://github.com/GrokBokHackathon/hackthaton-1126/issues/11)

---

**Status**: ✅ Current implementation merged to main and playable!  
**Demo**: Spin up server, open 2+ tabs, run bots, play to 3 captures  
**Next**: Commander model implementation (see issues #4-#11), fog of war, mystery-box powerups
