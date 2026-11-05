# WebSocket Protocol

Flag Raid uses a JSON message protocol over WebSocket at `/ws`.

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
- `dx`, `dy`: normalized direction vector (e.g. -1, 0, 1)
- Server applies movement on next tick

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
- Sent immediately on connection

### welcome
```json
{
  "type": "welcome",
  "playerId": "uuid",
  "team": "red",
  "map": {
    "width": 40,
    "height": 30,
    "seed": 12345,
    "tiles": [[0,1,2,...], ...],
    "bases": {
      "red": {"x": 1, "y": 1},
      "bot": {"x": 38, "y": 28}
    }
  }
}
```
- `team`: `"red"` (humans) or `"bot"`
- `tiles`: 2D array, tile codes: `0` floor, `1` wall, `2` crate, `3` bush
- `bases`: center of base pads (each 2x2 tiles)

### state
```json
{
  "type": "state",
  "tick": 42,
  "phase": "playing",
  "players": [
    {
      "id": "uuid",
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
    "red": {"x": 1, "y": 1, "carrier": null},
    "bot": {"x": 38, "y": 28, "carrier": "uuid-or-null"}
  },
  "score": {"red": 1, "bot": 0}
}
```
- `phase`: `"waiting"` (< 1 human), `"playing"`, `"ended"`
- `dir`: `"down"`, `"left"`, `"right"`, `"up"`
- `state`: `"idle"`, `"running"`, `"carrying"`, `"tagged"`, `"respawn"`
- Broadcast ~20 Hz during match

### scored
```json
{
  "type": "scored",
  "team": "red",
  "carrier": "uuid",
  "score": {"red": 2, "bot": 0}
}
```
- Sent when a team scores (first to 3 wins)

### matchEnd
```json
{
  "type": "matchEnd",
  "winner": "red",
  "finalScore": {"red": 3, "bot": 1}
}
```
- Match ends; new match starts after 5 seconds

### newMap
```json
{
  "type": "newMap",
  "map": {
    "width": 40,
    "height": 30,
    "seed": 67890,
    "tiles": [[0,1,2,...], ...],
    "bases": {
      "red": {"x": 2, "y": 2},
      "bot": {"x": 37, "y": 27}
    }
  }
}
```
- Sent to all connected clients when a new round starts
- Each round uses a fresh procedurally generated map

### pong
```json
{
  "type": "pong"
}
```

### heartbeat
```json
{
  "type": "heartbeat"
}
```
- Sent every 20 seconds to keep tunnel alive

## Rules (Server-Authoritative)

1. Touch enemy flag to pick up
2. Bring enemy flag to your base to score
3. Tag enemy carrier in your half to return their flag
4. First to 3 captures wins
5. New match on new map seed after win
