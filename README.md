# Capture the Flag

Silly realtime multiplayer **Capture the Flag**: humans versus Grok Bots on a **2D top-down** map (emoji / Grok Bot party theme). Everyone moves at once. Grab the flag. Aimed at a playable hackathon slice in about three hours, beers included.

This repository is the handoff surface for Wiktor, Greg, and their bots. Product choices live in [docs/DECISIONS.md](docs/DECISIONS.md). The WebSocket game protocol is in [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Status on `main`

**The game is now playable!** This build has a full realtime Capture the Flag match with procedurally generated 64×40 tile maps, server-authoritative gameplay at 20 Hz, web client with responsive camera and touch controls, and a bot client with simple AI. First to 3 captures wins, then a new map generates.

## Product vision

- Realtime CTF, not turn-based — **✅ Implemented**
- Two sides: **humans vs bot(s)**, silly Grok Bot / emoji theme (**n humans vs m Grok Bots** — both counts can be more than one) — **✅ Implemented**
- Bases on **opposite diagonals**; a **procedural map** each round with random obstacles and a **guaranteed path** between bases — **✅ Implemented**
- Server runs on a **team computer**, published with a **Cloudflare Tunnel**; gameplay traffic is **WebSocket** at `/ws` — **✅ Ready**
- Each player runs their **own client** and joins the public tunnel URL — **✅ Implemented**
- **Commander model**: bots play autonomously, humans steer with orders, AI commander on bot team — **🔒 Locked design, not built** (see [issues #4-#11](https://github.com/GrokBokHackathon/hackthaton-1126/issues))
- **Mystery-box powerups** — **planned, not started**

Stretch (optional): LLM rewrites of bot JSON behavior trees between matches or as a light mid-match tweak. See the decision log.

## Architecture

```
Humans (web clients)  --WebSocket /ws-->  Realtime game server (team host)
Grok Bots (players)   --WebSocket /ws-->         |
                                                  +-- shared 2D map (64×40 tiles)
                                                  +-- positions, flags, score
```

Hosting stays on Wiktor's laptop (Podman / Docker Compose + Cloudflare Tunnel). Do not deploy the game stack onto a bot or cloud-agent machine. Coordinate only through this repo.

## Gameplay

- **2 teams**: Red (humans, top-left base) vs Bot (bots, bottom-right base)
- **Rules**: Touch enemy flag to pick up, bring to your base to score. Tag enemy carriers in your half to return their flag.
- **Win condition**: First to 3 captures
- **Map**: 64×40 tiles, procedurally generated each round with guaranteed connectivity and meaningful obstacles
- **Controls**: WASD/arrows on desktop, on-screen joystick on mobile
- **Camera**: Follows your player, clamped to map edges with responsive zoom

## Responsive Design

The client works on phone and desktop with responsive zoom:
- Shorter screen side always shows 16 tiles
- Zoom ≥ 2: whole-number scale with nearest-neighbour (pixel-perfect)
- Zoom < 2: fractional scale with smoothing
- HUD rendered in screen space, handles resize and orientation changes

## Docs map

| Doc | Purpose |
| --- | --- |
| [README.md](README.md) | Status, vision, run pointers |
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | WebSocket JSON game protocol (join, input, state, scored, matchEnd, newMap) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Product and architecture decisions |
| [docs/STATUS.md](docs/STATUS.md) | Current implementation status and roadmap |
| [docs/ART_INTEGRATION.md](docs/ART_INTEGRATION.md) | Atlas rendering system, sprite specs, graceful fallback |
| [docs/GAME_CONCEPT_V0_1.md](docs/GAME_CONCEPT_V0_1.md) | Alternative patron-and-heroes proposal (discussion only, not implemented) |

## Verified deployment

Checked on Wiktor's laptop, checkout `~/Projects/hackthaton-1126`. Wiktor owns hosting: the server and clients run on that laptop with Podman via `docker-compose`, then Cloudflare Tunnel. Do not run this stack on a bot or cloud-agent machine.

- Local server: <http://127.0.0.1:8080>
- Local web client: <http://127.0.0.1:3000>
- Public URL: <https://hakaton-11-26.wffe.io>
- `GET /health` → `200` with `{"ok":true,"service":"flag-raid","role":"realtime-game-server","websocket":"/ws","players":N,"phase":"playing|waiting|ended"}`
- `wss://…/ws` from an external machine: full game protocol (see [docs/PROTOCOL.md](docs/PROTOCOL.md))
- Cloudflare public hostname → `http://server:8080` on the Compose `game` network
- `CLOUDFLARE_TUNNEL_TOKEN` only in ignored local `.env` — never commit tokens

## Layout

```
apps/server          Realtime game server: GET /health, WebSocket /ws game protocol
apps/web             Canvas web client with WASD/arrow movement and touch controls
apps/bot             Bot client with simple AI
docker-compose.yml   server + web + cloudflared
.env.example         Empty CLOUDFLARE_TUNNEL_TOKEN=  (copy to .env; never commit .env)
docs/DECISIONS.md    Product and architecture choices
docs/PROTOCOL.md     WebSocket JSON protocol documentation
docs/STATUS.md       Implementation status and roadmap
```

The game is playable: procedurally generated maps, realtime movement, capture the flag rules, and bot AI.

## Local run

This host runs the stack. Humans and bots join through the public tunnel URL or local ports as players.

### With Docker Compose

```bash
cp .env.example .env
# Put the tunnel token in .env as CLOUDFLARE_TUNNEL_TOKEN. Never commit .env.

docker compose up --build server web
# Podman: podman compose up --build server web
```

Compose maps `CLOUDFLARE_TUNNEL_TOKEN` → cloudflared `TUNNEL_TOKEN` (env only; not on the process argv). Do not commit `.env`, and do not paste `docker compose config` after the token is set — that printout expands it.

Cloudflare public hostname: Type **HTTP**, URL **`http://server:8080`** (Compose service name on network `game`). Do not point at `localhost` inside the tunnel container; that is the tunnel container, not the game server.

Loopback ports:

- Game server: <http://127.0.0.1:8080/health>
- Web client: <http://127.0.0.1:3000/>

Open <http://127.0.0.1:3000/> in two or more browser tabs to play as multiple humans. Use WASD or arrow keys to move.

The server sends a WebSocket ping and a `{ "type": "heartbeat" }` message every 20 seconds. Clients reconnect if the socket drops. Cloudflare can idle-timeout a connection or restart an edge.

Without a token: `docker compose up --build server web` (cloudflared exits until the token is set).

### Run a bot

```bash
npm ci --prefix apps/bot
node apps/bot/bot.js ws://127.0.0.1:8080/ws BotName
# Or with tunnel: node apps/bot/bot.js wss://your-hostname/ws BotName
```

### Without containers

```bash
# Terminal 1: Server
npm ci --prefix apps/server
npm start --prefix apps/server

# Terminal 2: Serve web client (or just open game.html in browser)
cd apps/web && python3 -m http.server 3000

# Terminal 3: Bot
npm ci --prefix apps/bot
node apps/bot/bot.js ws://127.0.0.1:8080/ws
```

### Tests

```bash
npm ci --prefix apps/server
npm test --prefix apps/server
# Tests: map connectivity, obstacle density, flag pickup, capture, tag-return, win/reset
```

## Next steps

**Current implementation** (direct player control) is playable on `main`. **Next phase** switches to the commander model:

1. **Commander model** (locked design, tracked in [issues #4-#11](https://github.com/GrokBokHackathon/hackthaton-1126/issues)) — bots play autonomously with A* pathfinding, human commanders steer with orders under CP economy (6 start, +1/5s, cap 10, max 15 orders/round, Beer Rush 8 CP once/round), AI commander on bot team
2. **Fog of war** (server-computed, per-client state filtering) — planned, config ready
3. **Mystery-box powerups**: speed, shield, etc. — planned
4. Final art pack (sprite sheets) — rendering system ready, placeholders working
5. Stretch: behavior-tree rewrites — see [docs/DECISIONS.md](docs/DECISIONS.md)

## Contributing

This repository is the only place Wiktor, Greg, and their bots coordinate. Greg has his own separate Grok Bots. Write decisions and handoffs here, in English, so every collaborator can see them.

Wiktor owns hosting. The server and clients stay on his laptop (Podman and Cloudflare Tunnel). Do not deploy them onto a bot or cloud-agent computer.

- English only in this repo (docs, commits, issues, in-repo copy).
- Docs for teammates land on **`main`** so `git pull` stays fresh; do not park shared docs on long-lived feature branches.
- Code/gameplay changes are owned separately; docs bots only touch `*.md` / docs paths.
- Invent features as we go and commit often.
- Never commit secrets, tokens, API keys, tunnel tokens, credentials, or env values.
