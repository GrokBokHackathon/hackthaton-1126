# Decision log

Current choices for the hackathon. This repo is the source of truth. Keep new entries short.

Legend: **decided** = team choice; **planned** = agreed direction, not built; **implemented** = exists in code on the named ref.

## 1. Game — realtime Capture the Flag

**Decided.** The match is Capture the Flag on one shared map. Humans and bots move continuously. It is not turn-based, and it is not a between-round trainer.

The core demo is that movement: positions and flag state over WebSockets while the match is live.

**Implemented:** Full playable game on `main` — server-authoritative match at 20 Hz, procedural maps, capture/score/tag rules.

## 2. Who plays

**Decided / implemented:** two sides — **Red humans vs Bot team** — silly Grok Bot / emoji theme. Grok Bots are players in the match, not a Compose sidecar.

**n humans vs m Grok Bots.** Both counts can be more than one. Humans join Red team (top-left base), bots join Bot team (bottom-right base).

This host runs the server and the local client. Humans and bots join through the public tunnel URL. The bot client (`apps/bot`) connects as a WebSocket player.

## 3. Map and bases

**Implemented:** bases on **opposite diagonals** (Red top-left, Bot bottom-right); **procedural 64×40 tile map** each round with random obstacles; **path between bases is guaranteed** via flood-fill validation. Minimum obstacle density enforced (40+ with variety: walls, crates, bushes).

## 4. Tone and time

**Decided.** Funny, silly, dumb. A party game for drinking with friends. The plot can be thin or stupid.

Ship a playable slice in about three hours. Cut work that does not put people and bots on the same map.

**Implemented:** Playable slice complete — full match, map generation, capture rules.

## 5. View

**Decided / implemented.** **2D top-down.** Isometric and low-poly 3D were considered; top-down is fastest for this time box: a flat canvas, no camera rig. Colored shapes, public assets, emoji, or generated art are all fine.

Web client uses canvas rendering with responsive zoom (16 tiles on short side), camera follows player.

## 6. Clients and transport

**Decided / implemented.** Web clients. Gameplay traffic is WebSocket at **`/ws`**. The server owns shared state. Clients heartbeat and reconnect (Cloudflare can idle-timeout a socket or restart an edge).

Each player runs their own client against the published tunnel URL. Full JSON protocol documented in [PROTOCOL.md](PROTOCOL.md).

## 7. Mystery-box powerups

**Planned — next slice after the live match exists.** Not started. Do not document wire fields for boxes until code exists.

Config hooks exist in game.js; powerups not implemented yet.

## 8. Stretch — behavior trees

**Stretch, not core.** Between matches, or as a light tweak during a match, an LLM may rewrite a bot's JSON behavior tree (data, not game code) so a slow model call cannot stall movement.

If built: Tactician proposes edits, Critic checks schema / power, Narrator writes a silly line. Small action set is enough: `chase`, `flank`, `retreat`, `ambush`, `wait`.

Voice or text commands that edit an ally tree are later still, and outside the three-hour slice.

## 9. Hosting

**Decided.** Run the stack on the **team host** (Wiktor's laptop) with Docker Compose or Podman; publish with a **Cloudflare Tunnel** on a custom domain.

Do **not** deploy the game server onto a bot or cloud-agent machine. Greg's bots coordinate through this repository only.

Vercel is not used for the game server (short WebSocket lifetime). Tailscale was considered as a backup if the tunnel path is blocked.

## 10. Cloudflare Tunnel and secrets

**Decided.** Tunnel supports WebSockets. There is no hard documented WebSocket connection limit to design around at this scale.

Token only as `CLOUDFLARE_TUNNEL_TOKEN` from env / secret store; Compose maps it to cloudflared `TUNNEL_TOKEN`. Never commit secrets, tokens, API keys, credentials, or env values. `.env.example` leaves the variable empty.

Public hostname targets `http://server:8080` on the Compose network.

## 11. Repository language and docs placement

**Decided.** All repository content is English: docs, commits, issues, and in-repo copy. On-screen jokes can be silly. They stay in English in this repo.

Shared docs that teammates need after `git pull` land on **`main`**, not on long-lived feature branches. Code may use short-lived PR branches; docs bots push doc-only commits to `main` (or a docs PR merged immediately if branch protection blocks direct push).

## 12. Collaboration

**Decided.** Shared work between Wiktor and Grześ (Greg). Invent features as we go. Commit frequently so the repo stays the handoff.

## 13. First runnable slice — live match

**Implemented on `main`:** monorepo `apps/server` (realtime game server) + `apps/web` (canvas client) + `apps/bot` (simple AI); `docker-compose.yml` runs server, web, and `cloudflared`.

The server runs a full Capture the Flag match with procedural maps, server-authoritative movement, capture/score/tag rules, and win conditions. First to 3 captures wins, then new round with fresh map.

See [PROTOCOL.md](PROTOCOL.md) and [STATUS.md](STATUS.md) for implementation details.

## 12. WebSocket Protocol

**Implemented.** JSON message protocol over `/ws`. Client sends `join` (name, kind: human|bot), `input` (dx, dy). Server sends `welcome` (playerId, team, map), `state` (players, flags, score), `scored`, `matchEnd`, `newMap` on round reset. Documented in [PROTOCOL.md](PROTOCOL.md).

## 13. Game Rules

**Implemented.** Server-authoritative at ~20 Hz:
- Exactly 2 teams: Red humans (top-left base) vs Bot team (bottom-right base)
- Touch enemy flag to pick up, bring to your base to score
- Tag enemy carrier in your half to return their flag
- Tagged players respawn at base after 2 seconds
- First to 3 captures wins
- New procedurally generated map each round with guaranteed connectivity and meaningful obstacles

## 14. Art and Assets

**In progress.** 32×32 tiles and character frames, rendered at 2× scale (default) with nearest-neighbour filtering. Character pivot at center-bottom (16, 30). Animation timings: run 150ms, flag 250ms, respawn 80ms, hit 60ms per frame.

Asset rendering goes through a single atlas/config module (`apps/web/assets.js`) for easy sprite sheet swapping. Team colors: Red #C42032 (humans), Purple #A27BFF (Bot team). Placeholder emoji/shapes until art pack is fully wired.

## 15. Responsive Design and Mobile

**Implemented.** Zoom calculation: `shortSidePx / (16 * 32)` so shorter screen side always shows 16 tiles.
- Zoom ≥2: whole-number scale with nearest-neighbour (pixel-perfect)
- Zoom <2: fractional scale with smoothing
- Camera follows local player, clamped to map edges
- On-screen joystick for touch devices
- HUD in screen space, handles resize and orientation changes

## 16. Fog of War Preparation

**Prepared, not implemented.** Vision radius (7 tiles) and line-of-sight blockers (walls, bushes) are in `CONFIG`. State broadcast structure supports per-client filtering. Implementation is a future PR: server-side visibility computation + per-client state filtering + client fog overlay.

## Answered Questions

1. **Team sizes:** Fully dynamic n humans vs m bots. Humans join Red, bots join Bot team.
2. **Flags:** One flag per side. Capture rule: bring enemy flag to your base to score.
3. **Movement model:** Server-authoritative at 20 Hz tick rate, client sends normalized input vectors.
4. **Mystery-box effects:** Planned for next slice (speed, shield, etc.)
