# Flag Raid

Realtime Capture the Flag on one shared 2D map. Bots move. Humans command. This README is the entry point for Wiktor, Grzegorz (Greg), and their bots. The repository is the handoff. It is not a claim that a full match has been accepted in a browser.

Implementation that disagrees with an older doc is described from the modules below, read on `main` at the base of this change. Several older docs still say the commander model is unbuilt. Those pages lag the code.

## Source of truth

Grzegorz’s locked decisions, quoted on GitHub, are:

- [Issue #4](https://github.com/GrokBokHackathon/hackthaton-1126/issues/4) — every unit is a bot; each team has one commander (human or AI) who spends command points; one flag per base; three bots per team by default; WASD and joystick control of units is out of scope; the AI commander is specified as a Grok Bot sending `command` about every 10 seconds.
- [Issue #6](https://github.com/GrokBokHackathon/hackthaton-1126/issues/6) — the command-point numbers, order costs, cooldowns, comeback CP, and Beer Rush.
- The banner at the top of [docs/art/bots-play-flow.md](docs/art/bots-play-flow.md) repeats that decision and says it overrides the proposal underneath. The rest of that file is a UX proposal (including a 4-bot lineup and per-order durations). The running modules do not implement that body.

Code that implements the match, read for this page:

| Topic | Module |
| --- | --- |
| Map, flags, tags, tick | [apps/server/game.js](apps/server/game.js) |
| Three-bot autopilot | [apps/server/autopilot.js](apps/server/autopilot.js) |
| Orders and CP | [apps/server/commands.js](apps/server/commands.js) |
| Round clock | [apps/server/match-lifecycle.js](apps/server/match-lifecycle.js) |
| Two seats | [apps/server/lobby.js](apps/server/lobby.js), [apps/server/lobby-router.js](apps/server/lobby-router.js) |
| Process wiring | [apps/server/server.js](apps/server/server.js) |
| Select, order, target | [apps/web/command-panel.js](apps/web/command-panel.js), [apps/web/game.js](apps/web/game.js) |
| Camera and pointer gestures | [apps/web/commander/camera.js](apps/web/commander/camera.js), [apps/web/commander/input.js](apps/web/commander/input.js) |
| Debug readout gate | [apps/web/commander/debug-overlay.js](apps/web/commander/debug-overlay.js) |

Message shapes are catalogued in [docs/PROTOCOL.md](docs/PROTOCOL.md). Where a sentence in that file disagrees with `server.js` or `game.js`, the module wins. Known lags are called out under [Docs](#docs).

## Working in source

These behaviors are in the modules above. Unit tests cover many of them. This documentation change did not re-run a browser, and it does not close the open acceptance boxes on the issues.

- Server-authoritative match at 20 Hz. Default map is 64×40 tiles. Bases sit on opposite diagonals: red near `(2, 2)`, bot near `(width - 3, height - 3)`. Tile codes are floor `0`, wall `1`, crate `2`, bush `3`, tree `4`. Walls and crates block movement. Bushes and trees block vision. Trees slow movement to half (`treeSlowdown` 0.5). Details: [docs/COLLISION_AND_TERRAIN.md](docs/COLLISION_AND_TERRAIN.md).
- One flag at each base. A unit picks up the enemy flag inside 0.7 tiles and scores by carrying it to its own base. A unit tags an enemy carrier only in its own half, inside 0.8 tiles. A tagged bot waits 3000 ms, then respawns at base with a short invulnerability window. Beer Rush suppresses that tag.
- Each team spawns `BOTS_PER_TEAM` autopilot bots, default **3**, clamped to 0–12 in `spawnSquad`. Roles cycle `runner`, `guard`, `roamer`. Ids look like `auto-red-0` and `auto-bot-0`. The runner paths to the enemy flag. The guard stays on the home flag unless an enemy carrier is in that team’s half. The roamer escorts a friendly carrier, otherwise patrols midfield. Any carrier paths home and treats enemies within 4 tiles as expensive. Pathing is A* in [apps/server/path.js](apps/server/path.js). Tracked by [#5](https://github.com/GrokBokHackathon/hackthaton-1126/issues/5).
- A non-beer order stores an integer tile target. The bot walks to the center of that tile, then returns to its role. The six tactical orders do not apply the separate hold times, patrol rings, or escort offsets written in the bots-play proposal.
- Command points, from [apps/server/commands.js](apps/server/commands.js) and [docs/COMMANDS.md](docs/COMMANDS.md): start 6, +1 every 5 seconds, cap 10, 15 orders a round, 2 seconds between orders, 5 seconds before the same bot is ordered again. The team that loses a capture gains 3 CP, still capped. Costs: rally 1, scout 1, defend 2, escort 3, attack 3, tag 4, beer 8. `beer` is once a round: 1.5× speed and no tags for 4 seconds. At 0 CP or 0 orders left, bots stay on role autopilot. Rejections do not spend CP. Fog rules: `scout` may target an unexplored tile, `tag` needs a tile visible now, other orders need an explored tile ([#7](https://github.com/GrokBokHackathon/hackthaton-1126/issues/7)).
- Rounds, from [apps/server/match-lifecycle.js](apps/server/match-lifecycle.js) and [apps/server/MATCH_LIFECYCLE.md](apps/server/MATCH_LIFECYCLE.md): 6:00 of play, first to 3 captures, a strict lead at the buzzer, or sudden death when the score is tied. Results hold for 10 seconds, then a new map and a fresh CP budget. `CONFIG.winScore` and `CONFIG.matchEndDelayMs` are still declared in `game.js`. The live clock is the lifecycle module, not that 5-second constant. [#11](https://github.com/GrokBokHackathon/hackthaton-1126/issues/11).
- Two commander seats. There is no team id `blue`. Seat 1 is `red`. Seat 2 is `bot` (issue #19’s team A and team B). The bot side’s draw color is purple `#A27BFF`. A room id is 4 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The share path is `/lobby.html?room=CODE` and must not carry the resume token. `room_welcome` is the only frame with that token. The second filled seat starts one Match for that room, spawns the squad, and does not insert a human body. Mid-lobby disconnect frees the seat. Mid-match disconnect keeps the seat. The legacy `join` path still uses one separate match. Wiring note: [apps/server/LOBBY_INTEGRATION.md](apps/server/LOBBY_INTEGRATION.md). [#19](https://github.com/GrokBokHackathon/hackthaton-1126/issues/19).
- The camera is a free view, not a follow camera ([#8](https://github.com/GrokBokHackathon/hackthaton-1126/issues/8)). The first frame centers on that commander’s base. Later resizes keep a pan. Zoom is `shortSide / (16 * 32)`. At 2 or above it floors to an integer and uses nearest-neighbour. Below 2 it stays fractional and smooths. Pinch and `input.zoom` are ignored. A drag past 8 px pans. Pan is in screen pixels for that update and is not multiplied by frame time. A double-tap on the same unit within 300 ms and 24 px centers on that unit. The view clamps to the map. `game.js` does not send `{ "type": "input" }`. WASD, arrows, and the on-screen joystick are not produced by the pointer tracker.
- The command panel’s step list is `select`, then `order`, then `target` ([apps/web/command-panel.js](apps/web/command-panel.js)). Its own catalog is six orders (rally through tag) with no prices and no `beer`. Costs, cooldowns, and `beer` show up only when a `command_view` supplies them. The module’s `COMMAND_PANEL_INTEGRATION` flags `wiredToServer` and `wiredToGameClient` are still `false`, and the file header still says the server has no command messages. Those two flags were not updated when `game.js` started calling `mountCommandPanel` and `server.js` started accepting `command`. In `game.js`, a tap on a unit calls `setSelection`. A tap on empty map, while the step is `target`, offers an integer tile. The server `command` handler exists both for a legacy human `join` and for a seated lobby commander.

## WIP and not verified

Do not treat the client as a finished, playable match. These items are unfinished or were not exercised in a browser for this change.

- **Client lobby handoff is not live.** [apps/web/lobby.html](apps/web/lobby.html) will navigate to `/game.html?room=…&seat=…&team=…&commander=1` after `room_welcome` with `started: true`. [apps/web/game.js](apps/web/game.js) never reads `room`, `seat`, `team`, or `commander`. On socket open it always sends legacy `join` as a human body on the single match. The lobby page also still sets the status line “The live server does not route lobby messages until the core adapter lands,” while `server.js` already routes `room_create` and `room_join`. That handoff was not clicked through in a browser.
- **Debug overlay is source-gated, not browser-checked here.** `#status`, `#fog`, and `#frames` stay hidden unless the page is opened with `?debug=1` (`debugOverlayEnabled`). The bar uses `pointer-events: none` so the readout cannot take clicks. [apps/web/debug-overlay.test.js](apps/web/debug-overlay.test.js) checks the parser and the markup. This pass did not open the page. The public `game.html` fetched during the check below did not contain `data-debug-overlay`, so that host was not serving this gate.
- **Clicks are not accepted.** Selection, order, target, pan, and double-tap center are wired in source, and module tests cover the panel and the pointer tracker. Nobody clicked through a live match for this README. [#9](https://github.com/GrokBokHackathon/hackthaton-1126/issues/9) and [#10](https://github.com/GrokBokHackathon/hackthaton-1126/issues/10) stay open.
- **Beer Rush on the panel still walks the three steps.** The server accepts `beer` with no `unitIds` and no `target`. The panel’s built-in list does not include `beer`. If a server view enables it, `chooseOrder` still moves to `target`, and `buildCommandPayload` still requires a selection and a target.
- **The AI commander is not in the tree.** No module sends `command` on a 10-second timer. [apps/bot/bot.js](apps/bot/bot.js) is the older client: it `join`s as `kind: "bot"` and sends `input`. It is not the Grok Bot commander from issues #4 and #6.
- **Mystery-box powerups are not implemented.**
- **Issue #12 is open.** Serving and accepting the public client is not claimed done here. [#12](https://github.com/GrokBokHackathon/hackthaton-1126/issues/12).

## Setup

Hosting stays on the team machine (Podman or Docker Compose, then Cloudflare Tunnel). Do not deploy this stack onto a bot or a cloud-agent machine. Do not commit `.env`. [`.env.example`](.env.example) leaves `CLOUDFLARE_TUNNEL_TOKEN` empty. Compose maps that variable to cloudflared `TUNNEL_TOKEN` and does not put the token on the process argv. Do not paste `compose config` after the token is set.

The Compose file is [docker-compose.yml](docker-compose.yml). Both `docker compose` and `podman compose` read it. The documented public hostname target is HTTP `http://server:8080` on the Compose network `game`, not `localhost` inside the tunnel container.

```bash
cp .env.example .env
# Set CLOUDFLARE_TUNNEL_TOKEN in .env on the host only. Never commit .env.

podman compose up --build server web
# Docker: docker compose up --build server web
# Tunnel as well, only on the host, only with a local token:
# podman compose up --build
```

What those images actually contain:

- `apps/server/Dockerfile` copies the server modules and the whole `apps/web` tree. `server.js` serves `/` as `game.html`, plus the allowlisted client files (`/lobby.html`, `/command-panel.css`, `/commander/*.js`, and so on) and `GET /health`. Loopback: <http://127.0.0.1:8080/health>, <http://127.0.0.1:8080/game.html>, <http://127.0.0.1:8080/lobby.html>. WebSocket: `ws://127.0.0.1:8080/ws`.
- `apps/web/Dockerfile` copies only top-level `*.html`, `*.js`, and `assets/` into nginx. It does not copy `commander/` or the CSS files. Port 3000 proxies `/ws` and `/health` to `server`, and it is not a complete copy of the commander client.

Without containers, from a checkout:

```bash
npm ci --prefix apps/server
npm start --prefix apps/server
```

`server.js` also finds `apps/web` next to `apps/server`, so the same origin on port 8080 can serve the client. `apps/web` has no `start` script.

### Tests

Server suite (`node --test *.test.mjs` inside `apps/server`):

```bash
npm ci --prefix apps/server
npm test --prefix apps/server
```

That directory holds the map, collision, autopilot, command, fog, round, lobby, and router tests. The web package has no `test` script. Pure module tests, with no browser, include:

```bash
node --test apps/web/debug-overlay.test.js apps/web/command-panel.test.mjs \
  apps/web/commander/commander.test.js apps/web/commander/initial-view.test.js \
  apps/web/commander/live-hook.test.js apps/web/commander/round-hud.test.js \
  apps/web/commander/supplied-art.test.js apps/web/atlas.test.js
```

`apps/web/screenshot.test.mjs` imports Playwright and was not part of this docs pass.

### Public URL

`apps/web/index.html` links the game at <https://hakaton-11-26.wffe.io/game.html>. The same hostname is the one previously written for the tunnel.

On this docs pass, `GET https://hakaton-11-26.wffe.io/health` returned HTTP 200 and JSON whose keys match the `server.js` health body: `ok`, `service` `flag-raid`, `role`, `websocket` `/ws`, `client` `/game.html`, plus a point-in-time `players` count and `phase`. That check used no tunnel token. It is reachability of the host, not a playtest, and not proof the host is running this commit. The `game.html` body returned by that host did not include `data-debug-overlay`. Lobby handoff, the debug readout, and map clicks were not exercised against it.

## Docs

Accurate enough to follow, with the lags named:

| Doc | Use it for |
| --- | --- |
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | JSON frames: `join`, `input`, `state`, fog masks, `command`, lobby messages. The lobby section’s line “not served by `server.js` yet” is stale: `lobby-router.js` is mounted. The fog section’s line that `fog.js` does not edit `game.js` is also stale: `game.js` calls `drawFog`. |
| [docs/COMMANDS.md](docs/COMMANDS.md) | Order payload, costs, and rejection reasons. Matches `commands.js`. |
| [apps/server/LOBBY_INTEGRATION.md](apps/server/LOBBY_INTEGRATION.md) | Seats, one Match per room, and the statement that `game.js` ignores the handoff query. |
| [apps/server/MATCH_LIFECYCLE.md](apps/server/MATCH_LIFECYCLE.md) | 6:00, sudden death, 10-second results, reset hooks. Its note that `server.js` broadcasts only `playing` and `waiting` is stale: `shouldBroadcastState` also includes `sudden_death` and `results`. |
| [docs/COLLISION_AND_TERRAIN.md](docs/COLLISION_AND_TERRAIN.md) | Footprints, tile speeds, vision blockers. [#23](https://github.com/GrokBokHackathon/hackthaton-1126/issues/23). |

These files are still in the tree and are **not** the current status. [docs/STATUS.md](docs/STATUS.md) and large parts of [docs/DECISIONS.md](docs/DECISIONS.md) still describe direct human control and an unbuilt commander model. [docs/COMMAND_PANEL_HANDOFF.md](docs/COMMAND_PANEL_HANDOFF.md) says the panel is not mounted; `game.js` does mount it. [apps/web/commander/HANDOFF.md](apps/web/commander/HANDOFF.md) says the client does not send `command`; `game.js` does. [docs/GAME_CONCEPT_V0_1.md](docs/GAME_CONCEPT_V0_1.md) is an older patron-and-heroes proposal, not the match.

## Issues

| Issue | What it is now |
| --- | --- |
| [#4](https://github.com/GrokBokHackathon/hackthaton-1126/issues/4) | Commander decision. Open. AI commander not built. |
| [#5](https://github.com/GrokBokHackathon/hackthaton-1126/issues/5) | Autopilot. Closed. `autopilot.js` is in the server tick. |
| [#6](https://github.com/GrokBokHackathon/hackthaton-1126/issues/6) | CP economy. Open. Server costs and acks exist. The 10-second AI commander does not. |
| [#7](https://github.com/GrokBokHackathon/hackthaton-1126/issues/7) | Fog. Closed in the server snapshot. |
| [#8](https://github.com/GrokBokHackathon/hackthaton-1126/issues/8) | Camera scale. Closed in the camera module. |
| [#9](https://github.com/GrokBokHackathon/hackthaton-1126/issues/9), [#10](https://github.com/GrokBokHackathon/hackthaton-1126/issues/10) | Panel and unit readability. Open. Wired in source, clicks not accepted. |
| [#11](https://github.com/GrokBokHackathon/hackthaton-1126/issues/11) | Round loop. Closed in `match-lifecycle.js`. |
| [#12](https://github.com/GrokBokHackathon/hackthaton-1126/issues/12) | Public client origin. Open. Not accepted here. |
| [#19](https://github.com/GrokBokHackathon/hackthaton-1126/issues/19) | Two-seat lobby. Open. Server seats exist. Client handoff does not. |
| [#14](https://github.com/GrokBokHackathon/hackthaton-1126/issues/14), [#26](https://github.com/GrokBokHackathon/hackthaton-1126/issues/26) | External controller, and a review of camping plus same-tick flag stalemate. Open. |

## Layout

```
apps/server     Match, autopilot, commands, fog, lobby, GET /health, WebSocket /ws
apps/web        game.html client, lobby page, command panel, commander camera
apps/bot        Legacy bot that joins and sends input. Not the AI commander
docker-compose.yml
docs/PROTOCOL.md
```

## Collaboration

English in docs, commits, issues, and in-repo copy. Shared docs belong on `main`. Do not commit secrets, tunnel tokens, API keys, credentials, or `.env` values. Greg’s bots coordinate through this repository. They do not receive a copy of the tunnel token.
