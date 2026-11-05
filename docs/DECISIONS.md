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

**Planned — not implemented.** Next slice after fog of war. Do not document wire protocol fields for powerups until code exists.

Config hooks exist in `apps/server/game.js`; powerups are not implemented yet.

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

**Implemented on `main`.** JSON message protocol over `/ws`. Client sends `join` (name, kind: human|bot), `input` (dx, dy), optional `ping`. Server sends `hello`, `welcome` (playerId, team, map), `state` (players, flags, score at 20 Hz), `scored`, `matchEnd`, `newMap` on round reset, `heartbeat` (every 20s), `pong`. Fully documented in [PROTOCOL.md](PROTOCOL.md).

## 13. Game Rules

**Implemented on `main`.** Server-authoritative at 20 Hz:
- Exactly 2 teams: Red humans (top-left base at 2,2) vs Bot team (bottom-right base at 61,37)
- Each team has one flag at their base
- Touch enemy flag (within 0.7 tiles) to pick up, bring to your base to score
- Tag enemy carrier in your half (within 0.8 tiles) to return their flag
- Tagged players respawn at base after 2 seconds (plus 500ms invulnerability)
- First to 3 captures wins
- New procedurally generated 64×40 map each round with guaranteed connectivity and 40+ obstacles with variety

## 14. Art and Assets

**Implemented on `main`.** Atlas-driven rendering system with graceful fallback. 32×32 tiles and character frames, rendered at responsive zoom (2× default) with adaptive smoothing. Character pivot at center-bottom (16, 30). Animation timings: run 150ms, flag 250ms, respawn 80ms, hit 60ms per frame.

Asset rendering goes through `apps/web/atlas.js` (loading) and `apps/web/assets.js` (rendering) for easy sprite sheet swapping. Team colors: Red #C42032 (humans), Purple #A27BFF (Bot team). System currently uses placeholder emoji/shapes when sprite sheets not present; works perfectly as fallback.

## 15. Responsive Design and Mobile

**Implemented on `main`.** Zoom calculation: `shortSidePx / (16 * 32)` so shorter screen side always shows 16 tiles.
- Zoom ≥2: whole-number scale with nearest-neighbour (pixel-perfect)
- Zoom <2: fractional scale with smoothing
- Camera follows local player, clamped to map edges
- On-screen joystick for touch devices
- HUD in screen space, handles resize and orientation changes
- Works on desktop (WASD/arrows) and mobile (touch joystick)

## 16. Fog of War

**Planned, not implemented.** Vision radius (7 tiles) and line-of-sight blockers (walls, bushes) are in `CONFIG` on `main`. State broadcast structure supports per-client filtering. Implementation planned: server-side visibility computation + per-client state filtering + client fog overlay.

Tracked in [issue #7](https://github.com/GrokBokHackathon/hackthaton-1126/issues/7).

## 17. Commander Model (Locked, Not Built)

**Locked decision, not yet implemented.** The game switches from direct player control to a **commander model**: bots play autonomously, and human commanders steer them with orders.

**Core rules:**
- Each team has **3 bots** (configurable count)
- One flag per base (unchanged from current implementation)
- Humans do not control movement directly; they issue orders to bots
- AI commander on the bot team issues `command` messages roughly every 10 seconds under the same economy limits

**Tracked in:**
- [#4: Decision: switch to the commander model (bots play, humans command)](https://github.com/GrokBokHackathon/hackthaton-1126/issues/4)
- [#5: Bot autopilot with A* pathfinding and roles](https://github.com/GrokBokHackathon/hackthaton-1126/issues/5)
- [#8: Commander camera and one scale for phone and desktop](https://github.com/GrokBokHackathon/hackthaton-1126/issues/8)
- [#9: Command panel UI (orders, budget, counter)](https://github.com/GrokBokHackathon/hackthaton-1126/issues/9)
- [#10: Unit readability: order badges, selection, intent line, ping](https://github.com/GrokBokHackathon/hackthaton-1126/issues/10)

## 18. Order Economy (Locked, Not Built)

**Locked decision, not yet implemented.** Command-point (CP) economy for issuing orders:

**Starting and regeneration:**
- Start each round with **6 CP**
- Gain **+1 CP every 5 seconds**
- Cap at **10 CP** (cannot exceed)
- Allow at most **15 orders per round** (hard limit)

**Comeback mechanic:**
- **+3 CP comeback bonus** when trigger condition met
- **TODO**: Exact trigger condition not specified (likely score-based or time-based)

**Special order:**
- **Beer Rush**: costs **8 CP**, can be used **once per round**
- Effect details TBD in implementation

**Tracked in:**
- [#6: Orders and the command-point economy (server-side)](https://github.com/GrokBokHackathon/hackthaton-1126/issues/6)

## 19. AI Commander (Locked, Not Built)

**Locked decision, not yet implemented.** The bot team has a real Grok Bot commander:

- Issues `command` messages roughly every **10 seconds**
- Operates under the **same CP economy** and order limits as human commanders
- Uses LLM decision-making to choose which bots to order and what orders to issue

**Tracked in:**
- [#4: Decision: switch to the commander model (bots play, humans command)](https://github.com/GrokBokHackathon/hackthaton-1126/issues/4)

## Answered Questions (Closed by Implementation on `main`)

1. **Team sizes:** Fully dynamic n humans vs m bots. Humans join Red team, bots join Bot team. Server assigns teams automatically.
2. **Flags:** Two flags (one per side). Each team defends their own flag and attempts to capture the enemy flag. Capture rule: bring enemy flag to your base to score.
3. **Movement model:** Server-authoritative at 20 Hz tick rate (50ms intervals). Client sends input vectors (dx, dy). Server normalizes and applies movement at 3.0 tiles/second.
4. **Map size:** 64×40 tiles, procedurally generated each round with guaranteed connectivity.
5. **Base positions:** Red at (2,2) top-left, Bot at (61,37) bottom-right (opposite diagonal corners).
6. **Player states:** idle, running, carrying, tagged, respawn (with 500ms invulnerability).
7. **Collision and interaction radii:** playerRadius 0.4, flagPickupRadius 0.7, tagRadius 0.8 tiles.

## Answered Questions (Closed by Locked Decisions)

8. **Grok Bot LLM integration:** AI commander issues `command` ~10s under same CP economy (see Decision #19).
9. **Bot count per team:** 3 bots per team (configurable) in commander model (see Decision #17).
10. **Order frequency and limits:** 15 orders max per round, CP regenerates at +1/5s up to cap of 10 (see Decision #18).

## Open Questions (Not Yet Implemented)

1. **Mystery-box powerup effects:** Speed, shield, etc. — planned but not built. Design TBD.
2. **Fog of war visibility calculation:** Line-of-sight algorithm choice and per-client filtering strategy.
3. **Comeback bonus trigger:** +3 CP bonus trigger condition (score-based? time-based?) — TBD in implementation (see Decision #18).
4. **Beer Rush effect:** 8 CP special order, once per round — effect details TBD.
5. **Order types:** Specific order vocabulary beyond Beer Rush — TBD in implementation.
6. **Bot roles:** Specific roles/behaviors for 3-bot autopilot — TBD in implementation.
7. **Behavior-tree rewrites (stretch):** JSON schema, edit safety, in-match vs between-match timing.
