# Issue 12 runbook: Podman Compose source and two-session smoke

Headless check for two live `/ws` sessions, plus a source reading of the existing Compose file. This change adds this note, `scripts/issue12-two-session-smoke.mjs`, and `tests/issue12-two-session-smoke.test.mjs`. It does not edit the server, the client, Compose, Dockerfiles, lockfiles, README, or `docs/PROTOCOL.md`.

Deployment was not run. Nothing here claims the laptop stack or the public tunnel was verified.

## Reservations

Issue 12 is already in progress for Server Ops (infrastructure, tunnel, and public hosting). This slice is only the remaining headless two-session smoke, the reconnect gap, and this ops note.

Issue 19 is reserved by Match Developer: `apps/server/server.js`, lobby files, and the integration harness. Those paths were not edited. The preserved branch `cursor/lobby-server-routing-272a` was not checked out. Open PR 42 also edits `apps/server/server.js` and `apps/server/smoke.test.mjs`; those files were left untouched. The planned room contract is not treated as live.

## Source inspected

Compose and server files were read at main `0f8b15da64f57248cf201bb9acb35934025f2aa8`. No `.env` file was opened. `docker compose config` and `podman compose config` were not run, because a resolved config would expand `CLOUDFLARE_TUNNEL_TOKEN`.

`docker-compose.yml` defines three services on network `game`:

| Service | Source | Host binding |
| --- | --- | --- |
| `server` | Build context `.`, Dockerfile `apps/server/Dockerfile`. `PORT=8080`. Healthcheck runs `fetch('http://127.0.0.1:8080/health')` inside the container. | `127.0.0.1:8080:8080` |
| `web` | Build context `./apps/web`. Image base `nginx:1.27-alpine`. `apps/web/nginx.conf` listens on 80 and proxies `/ws` and `/health` to `http://server:8080`. | `127.0.0.1:3000:80` |
| `cloudflared` | Image `docker.io/cloudflare/cloudflared:latest`. Command `tunnel --no-autoupdate run`. `TUNNEL_TOKEN` is `${CLOUDFLARE_TUNNEL_TOKEN:-}`. No host port. | none |

The server image Dockerfile sets `ENV PORT=8080`, `EXPOSE 8080`, and its `COPY` list does not include `lobby.js`. The file comment says Docker Compose and Podman Compose both read this file, and that a Cloudflare public hostname should target `http://server:8080` on the `game` network. That dashboard setting was not re-checked.

The loopback ports in the current file are 8080 for the game server and 3000 for the web container. That matches the historical laptop notes. It was confirmed by reading the file, not by starting Compose.

`apps/server/server.js` on this main answers `/health` and `/ws` (`hello`, `join`, `welcome`, `state`, `ping`/`pong`, `input`). On socket close it deletes that player. It has no `room_create` or `room_join` branch. `docs/PROTOCOL.md` describes the planned lobby messages as not served by `server.js` yet. `apps/web/game.js` reconnects by opening a new socket and sending `join` again. The browser was not started.

## Commands from the Compose file (not executed)

Wiktor's laptop is the production host (Podman / `docker-compose`). These commands were not run on this VM, on that laptop, or against the public game.

```bash
podman compose up --build server web
docker compose up --build server web
```

`server` and `web` are the gameplay services. Including the tunnel is `podman compose up --build` or `docker compose up --build`, which also starts `cloudflared` and needs `CLOUDFLARE_TUNNEL_TOKEN` in an uncommitted `.env`. That was not run, and the token was not read.

## Commands actually executed

This VM has no `podman`, `docker`, or `docker-compose` on `PATH` (`command -v` for each printed nothing). Compose was not started.

The smoke used an isolated `node server.js` with `PORT=0` (ephemeral port, not 8080) and the existing `ws` package:

```bash
npm ci --prefix apps/server
node scripts/issue12-two-session-smoke.mjs
node --test tests/issue12-two-session-smoke.test.mjs
```

`npm ci` did not change the lockfile or package manifest. `node_modules` stays untracked.

### Script result (expected non-zero)

`node scripts/issue12-two-session-smoke.mjs` exited **2**.

| Check | Result |
| --- | --- |
| Two sessions: distinct red human ids, both present on each other's `state`, `ping`/`pong`, `input` visible as `dir: "right"`, phase `playing` | pass |
| New socket after close: `hello` only until `join`, then a new `playerId`, a 64×40 `welcome` map, and a snapshot that omits the dropped id | pass (fresh session) |
| Same-identity reconnect: dropped id restored | **unsupported** |
| `room_create` / `room_join`: `room_welcome`, `room_state`, or `room_error` | **unsupported** |

Health on that process reported `players` 6 before the two joins (default squad) and 8 after the dropped human had been replaced by the new join. The JSON report contained no probe token and no `resumeToken` field. Public room messages did not carry a token (none were sent).

Exit 2 means the supported checks passed and at least one capability is missing. Exit 0 would mean same-identity reconnect and `room_welcome` were both observed. Exit 1 would mean a supported check failed or a public message leaked a token. This run was exit 2, not 0 or 1.

### Test result (expected failures)

`node --test tests/issue12-two-session-smoke.test.mjs` exited **1**.

- pass: two distinct websocket sessions share a live snapshot
- pass: a new connection after close is a fresh snapshot, not a resume
- **fail (expected):** `same-identity reconnect restores the dropped player` — assertion `identityRestored === true` was false. The failure text begins `UNSUPPORTED: same-identity reconnect/resync is not provided.`
- **fail (expected):** `live /ws answers room_create with room_welcome` — `sawRoomWelcome === true` was false. The failure text begins `UNSUPPORTED: live /ws did not send room_welcome, room_state, or room_error`.
- pass: probe report redacts the private token

Counts: 5 tests, 3 pass, 2 fail. No unexpected failure.

`apps/server` `npm test` was not changed and does not pick up `tests/`. The existing smoke file was not edited.

## Gap

Close removes the player. The next socket is a new player with a fresh `welcome` map and a fresh `state`. Sending the old id on `join` does not restore it. That new session must not be reported as a successful reconnect.

Issue 19's registry (`createRoom`, `joinRoom`, `disconnect`, `snapshot`) and the private `room_welcome` token stay in the lobby library and the protocol note. This probe talks only to the live `/ws` handler, which did not answer. The planned contract is not live on this main.

## Limits

- Protocol only. No browser, no reconnect UI, no tunnel.
- No Podman or Docker build, and no claim that laptop production was deployed.
- Timeouts are bounded: server ready 5s, socket open and messages 3s, state 2s, direction 1.5s, lobby silence 0.5s, pre-join silence 0.3s, process stop 3s. Sockets are closed and the child is stopped with `SIGTERM`, then `SIGKILL` if it is still up.
- Squad size follows the server default unless `BOTS_PER_TEAM` is already set in the environment. The probe deletes `CLOUDFLARE_TUNNEL_TOKEN` and `TUNNEL_TOKEN` from the child environment and does not print token values.
