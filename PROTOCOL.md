# Protocol

Wire contract for the Capture the Flag server.

## Status

| Scope | On `main`? | Notes |
| --- | --- | --- |
| Match / movement / flag messages | No | Not implemented anywhere yet |
| Mock health + `/ws` echo | **Yes, on `main`** | Implemented in `apps/server/server.js` |

Transport: WebSocket path **`/ws`** (also exposed as `wss://` through the Cloudflare Tunnel). JSON text frames unless noted. Heartbeats use both a WebSocket **ping** and a JSON message.

---

## Mock connectivity scaffold

Source of truth: `apps/server/server.js` on `main`. Verified externally at `https://hakaton-11-26.wffe.io` (health + echo).

### HTTP

| Method | Path | Response |
| --- | --- | --- |
| `OPTIONS` | any | `204`; CORS allow `*`, methods `GET, OPTIONS`, headers `content-type`, max-age `600` |
| `GET` | `/health` | `200` JSON (below); `cache-control: no-store`; CORS `*` |
| `GET` | `/` or `/index.html` | `200` `text/html` — server-bundled echo page (`apps/server/public/index.html`) |
| `GET` | other | `404` JSON `{ "ok": false, "error": "not_found" }` |
| non-`GET` (except `OPTIONS`) | any | `405` JSON `{ "ok": false, "error": "method_not_allowed" }` |

#### `GET /health` body

```json
{
  "ok": true,
  "service": "ctf-mock",
  "role": "realtime-game-server",
  "websocket": "/ws"
}
```

Env: **`PORT`** (default `8080`). Process binds `0.0.0.0`.

### WebSocket `/ws`

On connect, the server sends one text frame:

```json
{
  "type": "hello",
  "service": "ctf-mock",
  "heartbeatMs": 20000
}
```

Every **`heartbeatMs` (20000)** ms while the socket is open:

1. WebSocket **ping** control frame
2. Text frame `{ "type": "heartbeat" }`

On any client message (text or binary): the server **echoes the same payload** back to that client only (no broadcast, no parse).

Clients in the PR stubs reconnect with backoff if the socket drops (Cloudflare can idle-timeout or restart an edge).

### Not in the mock (TODO / future match protocol)

These are **not** sent or accepted by the mock server. Names below are placeholders for when the live match lands — **confirm with the gameplay bot before coding clients against them**:

- Join / team assignment (humans vs bots)
- Map seed / obstacle grid / base positions
- Player position / input / movement snapshots
- Flag pickup, carry, capture / score
- Mystery-box spawns and pickups (**planned next slice**, not started)
- Match start / end events

When those land in code, update this file from the implementation — do not invent payloads here.

### Local client stubs

- `apps/server/public/index.html` — same-origin `/health` + `/ws` echo UI (also served at the public hostname)
- `apps/web/index.html` — configurable server origin (default `http://127.0.0.1:8080`); health check + `/ws` echo; Compose publishes it on loopback `:3000`
