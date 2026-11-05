# WebSocket Protocol

Flag Raid uses a JSON message protocol over WebSocket at `/ws`. The server is authoritative and runs at 20 Hz (50ms tick rate).

## Client → Server

### join
```json
{
  "type": "join",
  "name": "PlayerName",
  "kind": "human"
}
```
- `kind`: `"human"` or `"bot"`
- Server assigns team (Red for humans, Bot for bots) and responds with `welcome`

### input
```json
{
  "type": "input",
  "dx": -1,
  "dy": 0
}
```
- `dx`, `dy`: direction vector components (typically -1, 0, or 1, but can be fractional from joystick)
- Server normalizes and applies movement on next tick at configured player speed (3.0 tiles/second)

### ping
```json
{
  "type": "ping"
}
```
- Optional keepalive; server responds with `pong`

## Server → Client

### hello
```json
{
  "type": "hello",
  "service": "flag-raid",
  "heartbeatMs": 20000
}
```
- Sent immediately on WebSocket connection

### welcome
```json
{
  "type": "welcome",
  "playerId": "abc123def456",
  "team": "red",
  "map": {
    "width": 64,
    "height": 40,
    "seed": 12345,
    "tiles": [[0,1,2,...], ...],
    "bases": {
      "red": {"x": 2, "y": 2},
      "bot": {"x": 61, "y": 37}
    }
  }
}
```
- `team`: `"red"` (humans, top-left) or `"bot"` (bots, bottom-right)
- `tiles`: 2D array [height][width], tile codes: `0` floor, `1` wall, `2` crate, `3` bush
- `bases`: center of 2×2 base areas at opposite diagonal corners
- Map is always 64×40 tiles

### state
```json
{
  "type": "state",
  "tick": 42,
  "phase": "playing",
  "players": [
    {
      "id": "abc123def456",
      "name": "Alice",
      "team": "red",
      "kind": "human",
      "x": 5.5,
      "y": 3.2,
      "dir": "right",
      "hasFlag": false,
      "state": "idle"
    }
  ],
  "flags": {
    "red": {"x": 2.0, "y": 2.0, "carrier": null},
    "bot": {"x": 61.0, "y": 37.0, "carrier": "abc123def456"}
  },
  "score": {"red": 1, "bot": 0}
}
```
- `phase`: `"waiting"` (no humans connected), `"playing"`, or `"ended"` (match over, new map pending)
- `dir`: `"down"`, `"left"`, `"right"`, or `"up"`
- `state`: `"idle"` (stationary), `"running"` (moving), `"carrying"` (has flag), `"tagged"` (defeated, waiting to respawn), or `"respawn"` (brief invulnerability after respawn)
- `x`, `y`: rounded to 2 decimal places (tile coordinates)
- Broadcast at 20 Hz (every 50ms) during `playing` or `waiting` phase
- Each team has one flag; `carrier` is the player ID holding it, or `null` if at base

### scored
```json
{
  "type": "scored",
  "team": "red",
  "carrier": "abc123def456",
  "score": {"red": 2, "bot": 0}
}
```
- Sent when a flag is captured (carrier brings enemy flag to their own base)
- First to 3 wins

### matchEnd
```json
{
  "type": "matchEnd",
  "winner": "red",
  "finalScore": {"red": 3, "bot": 1}
}
```
- Match ends; server waits 5 seconds (`matchEndDelayMs`), then resets with new map

### newMap
```json
{
  "type": "newMap",
  "map": {
    "width": 64,
    "height": 40,
    "seed": 67890,
    "tiles": [[0,1,2,...], ...],
    "bases": {
      "red": {"x": 2, "y": 2},
      "bot": {"x": 61, "y": 37}
    }
  }
}
```
- Sent to all connected clients when a new round starts after match end
- Fresh procedurally generated map with new seed
- Bases always at (2, 2) for Red and (width-3, height-3) for Bot

### pong
```json
{
  "type": "pong"
}
```
- Response to client `ping`

### heartbeat
```json
{
  "type": "heartbeat"
}
```
- Sent every 20 seconds to keep connection and tunnel alive

## Game Rules (Server-Authoritative)

1. **Teams**: Red (humans, top-left base) vs Bot (bots, bottom-right base)
2. **Flags**: Each team has one flag at their base. Touch enemy flag within pickup radius (0.7 tiles) to pick up.
3. **Capture**: Bring enemy flag to your own base (within pickup radius) to score 1 point.
4. **Tag**: In your own half of the map, get within tag radius (0.8 tiles) of an enemy flag carrier to tag them. Tagged carrier drops flag, which returns to enemy base.
5. **Respawn**: Tagged players wait 2000ms, then respawn at their base with 500ms invulnerability.
6. **Win**: First to 3 captures wins. After 5 second delay, new round starts with fresh map.
7. **Tick rate**: Server runs at 20 Hz. Player speed is 3.0 tiles/second.

## Game Configuration (Server Constants)

From `apps/server/game.js` CONFIG:

- `tileSize`: 32px (rendering)
- `mapWidth`: 64, `mapHeight`: 40
- `playerSpeed`: 3.0 tiles/second
- `playerRadius`: 0.4 tiles (deprecated, see footprintRadius)
- `footprintRadius`: 0.3 tiles (circular collision footprint)
- `treeSlowdown`: 0.5 (50% speed multiplier in trees)
- `maxMovementStep`: 0.5 tiles (substep limit to prevent tunneling)
- `flagPickupRadius`: 0.7 tiles
- `tagRadius`: 0.8 tiles
- `respawnTimeMs`: 2000 (tagged state duration)
- `tickRate`: 20 Hz
- `winScore`: 3 captures
- `matchEndDelayMs`: 5000 (delay before new map)
- `visionRadius`: 7 tiles (Euclidean to the tile center, inclusive)
- `visionBlockers`: [1, 3, 4] (WALL, BUSH, and TREE block line of sight; the blocker tile is seen, past it is not)

## Fog (team snapshot)

`state` on `/ws` is per team, from `Match.clientStateFor`. `getState()` remains the full server view and is not broadcast.

Player `x` and `y` stay tile coordinates. A mask cell is integer tile `(x, y)` at index `y * width + x` (`encoding: "row-major-u8"`, values 0 or 1). `fog.explored` lasts until the round resets. `fog.visible` is this tick. Each team receives only its own masks. Enemies are omitted unless their tile is visible. A flag the team cannot see is `{ "hidden": true }` with no coordinates. The static map in `welcome` / `newMap` is still the full tile grid.

`assessOrderTarget` checks a tile for a later order: `scout` may be unexplored, `tag` must be visible now, other orders must be explored. It does not spend command points or apply an order.

`state.fog` fields, and nothing else is required to draw:

```json
{
  "width": 64,
  "height": 40,
  "encoding": "row-major-u8",
  "team": "red",
  "visible": [0, 1],
  "explored": [0, 1]
}
```

`visible` and `explored` are flat arrays of 0 and 1. Tile size is not in the snapshot. Use 32, or `map.tileSize` if the client already has one. Player `x` and `y` are unchanged: tile coordinates, not pixels.

`apps/web/fog.js` exports `drawFog(ctx, fog, mapOrTileSize)`. It registers no listeners. Call it in the world pass after `translate` / `scale`, so the mask is in world pixels (`width * tileSize` by `height * tileSize`). One source pixel per tile is scaled with smoothing. Unexplored is `#1A1020`, explored is `#1A1020` at 60% alpha, and a visible cell is clear. This file does not edit `game.js`. The client owner calls `drawFog` once `state.fog` exists. A hidden flag must not be drawn when `hidden` is true.

Turning the overlay off cannot reveal enemies or flag coordinates that were left out of `state`.

## Map Generation

- Always 64×40 tiles
- Tile types: 
  - 0=FLOOR (walkable, normal speed)
  - 1=WALL (blocks movement and vision)
  - 2=CRATE (blocks movement)
  - 3=BUSH (walkable, blocks vision)
  - 4=TREE (walkable but slows movement, blocks vision)
- Bases at opposite diagonal corners (Red top-left, Bot bottom-right) in 4×4 clear zones
- Random obstacles: ~8% walls, ~4% crates, ~6% bushes (avoiding base zones)
- Trees may be added by future map generators
- Connectivity validated via flood fill between bases
- Minimum 40 obstacles with variety (walls, crates, bushes) enforced
- Failed maps regenerate with incremented seed until valid

## Lobby contract (not served by `server.js` yet)

Two commander seats. The server is authoritative. `apps/server/lobby.js` is the seat registry. `apps/server/lobby-router.js` is wired into `server.js` on the existing `/ws` port. Each started room gets its own Match. The legacy `join` path still uses the original single match.

Seat 1 is team `red`. Seat 2 is team `bot`. Those ids match match-lifecycle. In issue 19 wording, seat 1 is team A and seat 2 is team B.

A room id is 4 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The share link is `/lobby.html?room=AB2K` and never carries the resume token.

### Client → server

```json
{ "type": "room_create" }
{ "type": "room_join", "roomId": "AB2K" }
{ "type": "room_join", "roomId": "AB2K", "resumeToken": "secret" }
```

`resumeToken` is sent only by the commander who owns that seat, on `room_join`, to reclaim it.

### Server → client

Public, to every commander in the room. No resume token:

```json
{
  "type": "room_state",
  "roomId": "AB2K",
  "sharePath": "/lobby.html?room=AB2K",
  "phase": "lobby",
  "atMs": 0,
  "seats": [
    { "seat": 1, "team": "red", "filled": true, "connected": true },
    { "seat": 2, "team": "bot", "filled": false, "connected": false }
  ]
}
```

```json
{ "type": "room_error", "error": "room_full", "roomId": "AB2K" }
```

`room_error.error` is `invalid_room`, `room_full`, `seat_lost`, or `invalid_token`.

Private unicast to the socket that just created, joined, or resumed. This is the only message that carries `resumeToken`:

```json
{
  "type": "room_welcome",
  "ok": true,
  "error": null,
  "roomId": "AB2K",
  "seat": 1,
  "team": "red",
  "resumeToken": "secret",
  "started": false
}
```

### Library result

`createRoom(connectionId, now)`, `joinRoom(roomId, connectionId, resumeToken, now)`, and `disconnect(connectionId, now)` return `{ ok, error, roomId, seat, team, resumeToken?, started, events }`. `snapshot(roomId)` is the public board and has no token. `events` are `room_state` or `room_error` only.

`started` is true only on the call that fills the second seat. The core then creates one Match for that `roomId` and admits those two commanders, with no human body. Later resumes return `started: false`.

### Seat rules

- The lowest empty seat is assigned. Seats do not renumber.
- A third join, or a join without the matching token after the match has started, is `room_full`.
- A malformed or unknown room id is `invalid_room`.
- Disconnect in `lobby` frees the seat. The same token resumes it if it is still empty. If it was taken, the error is `seat_lost`.
- Disconnect in `match` does not free the seat and does not end the match. The seat stays filled with `connected: false`. The same token resumes it. Bots for that team stay on autopilot; this contract does not run autopilot.
- One match per room. The live `join` path is unchanged until the core adapter lands.
