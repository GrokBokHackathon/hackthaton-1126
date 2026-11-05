# Issue 12 runbook: Podman Compose source and two-session smoke

Headless check for two live `/ws` sessions, plus a source reading of the existing Compose file. This note, `scripts/issue12-two-session-smoke.mjs`, and `tests/issue12-two-session-smoke.test.mjs` are the only files in this slice. They do not edit the server, the client, Compose, Dockerfiles, lockfiles, README, or `docs/PROTOCOL.md`.

Deployment was not run. Nothing here claims the laptop stack or the public tunnel was verified.

## `welcome.started` and the room phase

Checked on current `origin/main` `d70eb4d04624a7960f33677f9722a33d150b82de`. Its `server.js` blob `490536dc30b798ba2428f0100f346b55784d4c17` and `lobby-router.js` blob `0192fa0bc368fb24937d45f7f174e015bfb92454` match pull request 48 head `3f7abf744c9f4f5dec018495c3f008901431d9dc`.

`room_welcome.started` is true only on the call that fills the second seat. `lobby.js` returns that boolean from `joinRoom`, and a token resume returns `started: false` so the router does not create a second Match. `docs/PROTOCOL.md` on that head says the same thing. The public `room_state.phase` stays `match`. A resume with `started: false` is the same match, not a match that ended.

Required acceptance:

1. Connection A sends `room_create`. The room id comes only from its private `room_welcome`. That call has `started: false` and seat 1 `red`.
2. Connection B sends `room_join` with that id and no token. Seat 2 is `bot`, that call's `started` is true, and the public phase is `match` with one shared map seed.
3. After A closes, connection C sends `room_join` with that id and A's token. Seat 1 returns, that call's `started` is false, the token and map seed match, public phase stays `match`, and a `playing` snapshot advances `remainingMs` within 2s.

The probe never invents a room id. If `room_create` produces no `room_welcome`, `room_join` is not sent.

Optional, not acceptance: legacy `join` on fresh sockets. On both servers tried below, that allocates a new player id. It is not a resume.

## Reservations

Issue 19 / pull request 48 owns the server and lobby router. Those paths were not edited. The branch was read in a detached worktree at `/tmp/pr48-head` and was not checked out over this working tree.

## Source inspected

Compose files were read at main `0f8b15da64f57248cf201bb9acb35934025f2aa8`. No `.env` file was opened. `docker compose config` and `podman compose config` were not run, because a resolved config would expand `CLOUDFLARE_TUNNEL_TOKEN`.

`docker-compose.yml` defines three services on network `game`:

| Service | Source | Host binding |
| --- | --- | --- |
| `server` | Build context `.`, Dockerfile `apps/server/Dockerfile`. `PORT=8080`. Healthcheck runs `fetch('http://127.0.0.1:8080/health')` inside the container. | `127.0.0.1:8080:8080` |
| `web` | Build context `./apps/web`. Image base `nginx:1.27-alpine`. `apps/web/nginx.conf` listens on 80 and proxies `/ws` and `/health` to `http://server:8080`. | `127.0.0.1:3000:80` |
| `cloudflared` | Image `docker.io/cloudflare/cloudflared:latest`. Command `tunnel --no-autoupdate run`. `TUNNEL_TOKEN` is `${CLOUDFLARE_TUNNEL_TOKEN:-}`. No host port. | none |

The server image Dockerfile sets `ENV PORT=8080`, `EXPOSE 8080`. The file comment says Docker Compose and Podman Compose both read this file, and that a Cloudflare public hostname should target `http://server:8080` on the `game` network. That dashboard setting was not re-checked. Loopback ports 8080 and 3000 were confirmed by reading the file, not by starting Compose.

## Commands from the Compose file (not executed)

Wiktor's laptop is the production host (Podman / `docker-compose`). These commands were not run.

```bash
podman compose up --build server web
docker compose up --build server web
```

Including the tunnel is `podman compose up --build` or `docker compose up --build`. That was not run, and the token was not read. This VM has no `docker`, `podman`, or `docker-compose` on `PATH`. That absence did not block the Node runs below.

## Commands actually executed

`npm ci --prefix` was used only to install the existing `ws` package. No manifest was edited. Each server was `node server.js` with `PORT=0`.

Workspace server, blob `3173cb53d41852ebd760de4c79b46fb36341a402`, commit `111792914b594ca859e92c8d2f4115ac8e100796`:

```bash
node scripts/issue12-two-session-smoke.mjs
node --test tests/issue12-two-session-smoke.test.mjs
```

Script exit **2**. `room_create` produced no `room_welcome`, so `room_join` was not sent. Resume `attempted` is false and `identityRestored` is false. Legacy `join` was observed and did not restore the dropped id. Test exit **1**: 6 tests, 4 pass, 2 fail. Both failures are the required room checks. The failure text begins `UNSUPPORTED: room_create on its own connection produced no room_welcome.`

Current main `d70eb4d04624a7960f33677f9722a33d150b82de`, server blob `490536dc30b798ba2428f0100f346b55784d4c17`, router blob `0192fa0bc368fb24937d45f7f174e015bfb92454` (same blobs as pull request 48 head `3f7abf744c9f4f5dec018495c3f008901431d9dc`). This branch was not merged with main. The server process was a detached worktree:

```bash
ISSUE12_SERVER_DIR=/tmp/main-d70eb4d/apps/server node scripts/issue12-two-session-smoke.mjs
ISSUE12_SERVER_DIR=/tmp/main-d70eb4d/apps/server node --test tests/issue12-two-session-smoke.test.mjs
```

Outer limit 45s. Neither command hit it.

Script exit **0** in 414ms. Seat 2's `welcome.started` was true and `roomPhase` was `match`. Resume `welcome.started` was false, `roomPhase` stayed `match`, seat 1 returned, the token and map seed matched, and `matchClockAdvanced` was true. The server issued the room id (this run: `L8LD`). Legacy `join` did not restore a player id. Test exit **0**: 6 tests, 6 pass, 0 fail.

The same blobs at `3f7abf7` had already exited 0 in 351ms (6 pass, 0 fail; room id `NQZM`). `node --test lobby-router.test.mjs` in that tree exited 0 in 583ms (4 pass, 0 fail), including `a commander room ticks bots and the clock with no human body`. A room tick stall was not reproduced. `merge-tree` of this branch with `origin/main` exited 0 with no conflict. Main was not merged into this branch.

## Limits

- No Compose, no tunnel, no laptop deploy, no merge of this branch.
- This branch still contains server blob `3173cb53d41852ebd760de4c79b46fb36341a402`. A run without `ISSUE12_SERVER_DIR` uses that file and exits 2. Exit 0 applies to current main `d70eb4d04624a7960f33677f9722a33d150b82de`.
- Timeouts: server ready 5s, room frames 2s, playing-clock wait 2s, process stop 3s. The child is stopped with `SIGTERM`, then `SIGKILL` if needed.
- The probe deletes `CLOUDFLARE_TUNNEL_TOKEN` and `TUNNEL_TOKEN` from the child environment and does not print token values.
