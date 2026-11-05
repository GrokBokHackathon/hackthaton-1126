# Capture the Flag

Silly realtime multiplayer **Capture the Flag**: humans versus Grok Bots on a **2D top-down** map (emoji / Grok Bot party theme). Everyone moves at once. Grab the flag. Aimed at a playable hackathon slice in about three hours, beers included.

This repository is the handoff surface for Wiktor, Greg, and their bots. Product choices live in [docs/DECISIONS.md](docs/DECISIONS.md). The mock WebSocket contract is in [PROTOCOL.md](PROTOCOL.md).

## Status on `main`

**The current `main` branch contains a mock connectivity scaffold.** This build has HTTP health, WebSocket `/ws` echo, web stub, and Cloudflare Tunnel Compose. It is not a playable Capture the Flag match yet — no map, positions, or flag logic exists.

## Product vision (target game)

These are the product targets. **The match logic is not implemented yet; the current build is echo-only.**

- Realtime CTF, not turn-based.
- Two sides: **humans vs bot(s)**, silly Grok Bot / emoji theme (**n humans vs m Grok Bots** — both counts can be more than one).
- Bases on **opposite diagonals**; a **procedural map** each round with random obstacles and a **guaranteed path** between bases.
- Server runs on a **team computer**, published with a **Cloudflare Tunnel**; gameplay traffic is **WebSocket** at `/ws`.
- Each player runs their **own client** and joins the public tunnel URL.
- **Mystery-box powerups** are the **next** slice after a live match exists (**planned, not started**).

Stretch (optional, after a playable match): LLM rewrites of bot JSON behavior trees between matches or as a light mid-match tweak. See the decision log.

## Architecture (target)

```
Humans (web clients)  --WebSocket /ws-->  Realtime game server (team host)
Grok Bots (players)   --WebSocket /ws-->         |
                                                  +-- shared 2D map
                                                  +-- positions, flags, score
```

Hosting stays on Wiktor's laptop (Podman / Docker Compose + Cloudflare Tunnel). Do not deploy the game stack onto a bot or cloud-agent machine. Coordinate only through this repo.

## Docs map

| Doc | Purpose |
| --- | --- |
| [README.md](README.md) | Status, vision, run pointers |
| [PROTOCOL.md](PROTOCOL.md) | HTTP + WebSocket message shapes (mock today) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Product and architecture decisions |
| [docs/GAME_CONCEPT_V0_1.md](docs/GAME_CONCEPT_V0_1.md) | Alternative discussion proposal only (two patrons, six AI heroes). Not the baseline, not implemented. |

## Verified deployment

Checked on Wiktor's laptop, checkout `~/Projects/hackthaton-1126`. Wiktor owns hosting: the server and clients run on that laptop with Podman via `docker-compose`, then Cloudflare Tunnel. Do not run this stack on a bot or cloud-agent machine.

- Local server: <http://127.0.0.1:8080>
- Local web stub: <http://127.0.0.1:3000>
- Public URL: <https://hakaton-11-26.wffe.io>
- `GET /health` → `200` with `{"ok":true,"service":"ctf-mock","role":"realtime-game-server","websocket":"/ws"}`
- `wss://…/ws` from an external machine: hello received, message echoed
- Cloudflare public hostname → `http://server:8080` on the Compose `game` network
- `CLOUDFLARE_TUNNEL_TOKEN` only in ignored local `.env` — never commit tokens

## Layout

```
apps/server          Mock realtime server: GET /health, GET /, WebSocket /ws echo
apps/web             Static client stub (local only)
docker-compose.yml   server + web + cloudflared
.env.example         Empty CLOUDFLARE_TUNNEL_TOKEN=  (copy to .env; never commit .env)
docs/DECISIONS.md    Product and architecture choices
```

The mock only proves HTTP and WebSocket through the tunnel. It does not run a match yet.

## Local run

This host runs the stack. Humans and Grok Bots join the same public tunnel URL as players. Bots are not a Compose service yet.

```bash
cp .env.example .env
# Put the tunnel token in .env as CLOUDFLARE_TUNNEL_TOKEN. Never commit .env.

docker compose up --build
# Podman: podman compose up --build
```

Compose maps `CLOUDFLARE_TUNNEL_TOKEN` → cloudflared `TUNNEL_TOKEN` (env only; not on the process argv). Do not commit `.env`, and do not paste `docker compose config` after the token is set — that printout expands it.

Cloudflare public hostname: Type **HTTP**, URL **`http://server:8080`** (Compose service name on network `game`). Do not point at `localhost` inside the tunnel container; that is the tunnel container, not the game server.

Loopback ports:

- Mock server: <http://127.0.0.1:8080/health> and <http://127.0.0.1:8080/> (same-origin echo page)
- Web stub: <http://127.0.0.1:3000/>

Public URL already checked: [Verified deployment](#verified-deployment).

The mock sends a WebSocket ping and a `{ "type": "heartbeat" }` message every 20 seconds. Both pages reconnect if the socket drops. Cloudflare can idle-timeout a connection or restart an edge.

Without a token: `docker compose up --build server web` (cloudflared exits until the token is set).

Server smoke test (no containers):

```bash
npm ci --prefix apps/server
npm test --prefix apps/server
# scripts: npm start → node server.js ; npm test → node --test smoke.test.mjs
# env: PORT (default 8080); listen 0.0.0.0
```

### Mock protocol summary

Full shapes: [PROTOCOL.md](PROTOCOL.md). Short version:

- `GET /health` → JSON health (CORS `*`)
- `GET /` → static echo HTML from the server
- `WebSocket /ws` → server sends `{ "type": "hello", "service": "ctf-mock", "heartbeatMs": 20000 }`, then every 20s a WebSocket ping **and** `{ "type": "heartbeat" }`; any client message is echoed byte-for-byte
- No match / move / flag messages yet

## Next steps

1. Replace the echo socket with a live match (positions, bases, flag state, procedural map).
2. Draw the map top-down; keyboard movement in the web client.
3. End a match when a side captures / scores with the flag.
4. Let a Grok Bot join via the public tunnel URL as a player.
5. **Planned next slice after a live match:** mystery-box powerups.
6. Stretch: behavior-tree rewrites — see [docs/DECISIONS.md](docs/DECISIONS.md).

## Contributing

This repository is the only place Wiktor, Greg, and their bots coordinate. Greg has his own separate Grok Bots. Write decisions and handoffs here, in English, so every collaborator can see them.

Wiktor owns hosting. The server and clients stay on his laptop (Podman and Cloudflare Tunnel). Do not deploy them onto a bot or cloud-agent computer.

- English only in this repo (docs, commits, issues, in-repo copy).
- Docs for teammates land on **`main`** so `git pull` stays fresh; do not park shared docs on long-lived feature branches.
- Code/gameplay changes are owned separately; docs bots only touch `*.md` / docs paths.
- Invent features as we go and commit often.
- Never commit secrets, tokens, API keys, tunnel tokens, credentials, or env values.
