# Capture the Flag

Silly realtime party game. **n humans vs m Grok Bots** on a **2D top-down** map. Everyone moves at once. Grab the flag. The plot can be dumb. Aimed at a playable slice in about three hours, beers included.

This repository is the source of truth. Product choices are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Verified deployment

Checked on Wiktor's laptop, checkout `~/Projects/hackthaton-1126`. Wiktor owns hosting: the server and clients run on that laptop with Podman via `docker-compose`, then Cloudflare Tunnel. Do not run this stack on a bot or cloud-agent machine. This build is a mock connectivity scaffold, not a playable Capture the Flag match yet.

- Local server: <http://127.0.0.1:8080>
- Local web stub: <http://127.0.0.1:3000>
- Public URL: <https://hakaton-11-26.wffe.io>
- `GET https://hakaton-11-26.wffe.io/health` returned **200** with `{"ok":true,"service":"ctf-mock","role":"realtime-game-server","websocket":"/ws"}`.
- `wss://hakaton-11-26.wffe.io/ws`, tested from an external machine, received hello and echoed a message.
- The Cloudflare published hostname routes to `http://server:8080` on the Compose network.
- `CLOUDFLARE_TUNNEL_TOKEN` stays in the ignored local `.env` only. Do not write token values or credentials into this repo.

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
apps/server          Mock realtime server: GET /health, GET /, WebSocket /ws echo
apps/web             Static client stub (local only)
docker-compose.yml   server + web + cloudflared
.env.example         Empty CLOUDFLARE_TUNNEL_TOKEN=  (copy to .env, do not commit .env)
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

Compose passes `CLOUDFLARE_TUNNEL_TOKEN` into cloudflared as `TUNNEL_TOKEN`. It is not placed on the process command line. Do not commit `.env`, and do not paste `docker compose config` after the token is set — that printout expands it.

In Cloudflare (Networking → Tunnels → your tunnel → Public hostname):

- Type: HTTP
- URL: `http://server:8080`

`server` is the Compose service name on the `game` network. Do not point the hostname at `localhost`; that is the tunnel container, not the game server.

Published ports are loopback only:

- Mock server: <http://127.0.0.1:8080/health> and <http://127.0.0.1:8080/> (same-origin echo page)
- Web stub: <http://127.0.0.1:3000/>

Public URL already checked: [Verified deployment](#verified-deployment).

The mock sends a WebSocket ping and a `{ "type": "heartbeat" }` message every 20 seconds. Both pages reconnect if the socket drops. Cloudflare can idle-timeout a connection or restart an edge.

Without a token, start only the local apps: `docker compose up --build server web`. `cloudflared` exits until `CLOUDFLARE_TUNNEL_TOKEN` is set.

Server smoke test, no containers:

```bash
npm ci --prefix apps/server
npm test --prefix apps/server
```

## Contributing

This repository is the only place Wiktor, Greg, and their bots coordinate. Greg has his own separate Grok Bots. Write decisions and handoffs here, in English, so every collaborator can see them.

Wiktor owns hosting. The server and clients stay on his laptop (Podman and Cloudflare Tunnel). Do not deploy them onto a bot or cloud-agent computer.

- English only: docs, commits, issues, and in-repo copy.
- Invent features as we go and commit often.
- Never commit secrets, tokens, API keys, tunnel tokens, credentials, or env values.

## Next steps

1. Replace the echo socket with a live match: positions for n humans and m bots, plus flag state, on one 2D map.
2. Draw that map top-down in the web client and move with the keyboard.
3. End a match when a side takes the flag. Keep the rules silly and short.
4. Let a Grok Bot connect through the public tunnel URL as a player.
5. Stretch: between matches, or a light mid-match tweak, rewrite a bot's JSON behavior tree. Not required for the first playable game.
