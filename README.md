# Capture the Flag

Silly realtime party game. **n humans vs m Grok Bots** on a **2D top-down** map. Everyone moves at once. Grab the flag. The plot can be dumb. Aimed at a playable slice in about three hours, beers included.

This repository is the source of truth. Product choices are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Goals

- Realtime Capture the Flag. Humans and bots move continuously on one shared map. Not turns, and not a between-match trainer.
- Any number of humans against any number of Grok Bots. Bots are players.
- Funny, silly, dumb. A party game for drinking with friends.
- 2D top-down, because that is the fastest view to build.
- Web clients over WebSockets. This host runs the server and publishes it with a Cloudflare Tunnel.

## Architecture

```
Humans (web)  --WebSocket-->  Realtime game server
Grok Bots     --WebSocket-->        |
                                     +-- shared 2D top-down map
                                     +-- positions, flag, score
```

The core demo is movement on that map. The server broadcasts state while the match is live. Model calls are not on the movement path.

Stretch, only if the match already runs: between matches, or as a light mid-match tweak, an LLM may rewrite a bot's JSON behavior tree (data, not game code). That work is optional. See the decision log.

## Decisions

See [docs/DECISIONS.md](docs/DECISIONS.md) before changing the match, the map, or hosting.

## Layout

```
apps/server          Realtime game server: GET /health, WebSocket /ws game protocol
apps/web             Canvas web client with WASD/arrow movement
apps/bot             Bot client with simple AI
docker-compose.yml   server + web + cloudflared
.env.example         Empty CLOUDFLARE_TUNNEL_TOKEN=  (copy to .env, do not commit .env)
docs/DECISIONS.md    Product and architecture choices
docs/PROTOCOL.md     WebSocket JSON protocol documentation
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

Compose passes `CLOUDFLARE_TUNNEL_TOKEN` into cloudflared as `TUNNEL_TOKEN`. It is not placed on the process command line. Do not commit `.env`, and do not paste `docker compose config` after the token is set — that printout expands it.

In Cloudflare (Networking → Tunnels → your tunnel → Public hostname):

- Type: HTTP
- URL: `http://server:8080`

`server` is the Compose service name on the `game` network. Do not point the hostname at `localhost`; that is the tunnel container, not the game server.

Published ports are loopback only:

- Game server: <http://127.0.0.1:8080/health>
- Web client: <http://127.0.0.1:3000/>

Open two or more browser tabs at <http://127.0.0.1:3000/> to play as multiple humans. Use WASD or arrow keys to move.

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
```

The server sends a WebSocket ping and a `{ "type": "heartbeat" }` message every 20 seconds. Clients reconnect if the socket drops. Cloudflare can idle-timeout a connection or restart an edge.

## Contributing

- English only in this repo: docs, commits, issues, and in-repo copy.
- Shared work. Invent features as we go and commit often so the other person can continue.
- Never commit secrets, tokens, API keys, tunnel tokens, credentials, or env values.

## Gameplay

- **2 teams**: Red (humans, top-left) vs Bot (bots, bottom-right)
- **Rules**: Touch enemy flag to pick up, bring to your base to score. Tag enemy carriers in your half to return their flag.
- **Win condition**: First to 3 captures
- **Map**: 64x40 tiles, procedurally generated each round with guaranteed connectivity
- **Controls**: WASD/arrows on desktop, on-screen joystick on mobile

## Responsive Design

The client works on phone and desktop with responsive zoom:
- Shorter screen side always shows 16 tiles
- Zoom ≥ 2: whole-number scale with nearest-neighbour (pixel-perfect)
- Zoom < 2: fractional scale with smoothing
- Camera follows your player, clamped to map edges
- HUD rendered in screen space

## Next Steps

1. Wire in the placeholder art pack (atlas.json, sprite sheets)
2. Add fog of war (server-computed, per-client state filtering)
3. Powerups (speed, shield, etc.)
4. LLM behavior tree editing for bots
5. Voice/text commands for tactical changes
