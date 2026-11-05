# Decision log

Current choices for the hackathon. This repo is the source of truth. Keep new entries short.

## 1. Game — realtime Capture the Flag

The match is Capture the Flag on one shared map. Humans and bots move continuously. It is not turn-based, and it is not a between-round trainer.

The core demo is that movement: positions and flag state over WebSockets while the match is live.

## 2. Who plays

**n humans vs m Grok Bots.** Both counts can be more than one. Grok Bots are players in the match.

This host runs the server and the local client. Humans and bots join through the public tunnel URL. A bot is not a Compose service yet.

## 3. Tone and time

Funny, silly, dumb. A party game for drinking with friends. The plot can be thin or stupid.

Ship a playable slice in about three hours. Cut work that does not put people and bots on the same map.

## 4. Map

**2D top-down.** Isometric and low-poly 3D were on the table. Top-down is the fastest for this time box: a flat canvas, no camera rig. Colored shapes, public assets, or generated art are all fine.

## 5. Clients

Web clients. Gameplay traffic is WebSocket. The server broadcasts the shared map. Clients heartbeat and reconnect, because Cloudflare can idle-timeout a socket or restart an edge.

## 6. Stretch — behavior trees

Not part of the core demo. Between matches, or as a light tweak during a match, an LLM may rewrite a bot's JSON behavior tree. The model edits that data, not game code, so a slow response cannot stall movement.

If that stretch is built: a Tactician proposes edits, a Critic checks the schema and that the bot did not become too strong, and a Narrator writes a silly line. A small action set is enough: `chase`, `flank`, `retreat`, `ambush`, `wait`.

Voice or text commands that edit an ally tree are later still, and outside the three-hour slice.

## 7. Hosting

Run the stack on this host with Docker Compose or Podman, and publish it with a Cloudflare Tunnel on a custom domain.

Vercel is not used for the game server. Its WebSocket connections are limited to about five minutes.

Tailscale was considered as a backup if the tunnel path is blocked.

## 8. Cloudflare Tunnel and secrets

The tunnel supports WebSockets. There is no hard documented WebSocket connection limit to design around at this scale.

The tunnel token is supplied only as `CLOUDFLARE_TUNNEL_TOKEN` from the environment or a secret store. Compose maps it to cloudflared's `TUNNEL_TOKEN`. Never commit secrets, tokens, API keys, credentials, or env values. `.env.example` leaves the variable empty.

In Cloudflare, the public hostname targets `http://server:8080` on the Compose network.

## 9. Repository language

All repository content is English: docs, commits, issues, and in-repo copy. On-screen jokes can be silly. They stay in English in this repo.

## 10. Collaboration

Shared work between Wiktor and Grześ. Invent features as we go. Commit frequently so the repo stays the handoff.

## 11. First runnable slice — mock behind the tunnel

Monorepo: `apps/server` (mock realtime server) and `apps/web` (client stub). `docker-compose.yml` runs the mock, the stub, and `cloudflared`.

The mock answers `GET /health` and echoes `WebSocket /ws`, with heartbeats. That is enough to prove the tunnel. The Capture the Flag match is the next step, not this container.

## 12. WebSocket Protocol

JSON message protocol over `/ws`. Client sends `join` (name, kind: human|bot), `input` (dx, dy). Server sends `welcome` (playerId, team, map), `state` (players, flags, score), `scored`, `matchEnd`, `newMap` on round reset. See `docs/PROTOCOL.md` for full spec.

## 13. Game Rules

- Exactly 2 teams: Red humans (top-left base) vs Bot team (bottom-right base)
- Touch enemy flag to pick up, bring to your base to score
- Tag enemy carrier in your half to return their flag
- First to 3 captures wins
- New procedurally generated map each round with guaranteed connectivity and meaningful obstacles
- Server-authoritative at ~20 Hz tick rate

## 14. Art and Assets

32x32 tiles and character frames, rendered at 2x scale with nearest-neighbour filtering. Character pivot at center-bottom (16, 30). Animation: run 150ms, flag 250ms, respawn 80ms, hit 60ms per frame. Asset rendering goes through a single atlas/config module (`apps/web/assets.js`) for easy sprite sheet swapping. Team colors: Red #C42032 (humans), Purple #A27BFF (Bot team).
