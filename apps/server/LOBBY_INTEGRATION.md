# Lobby integration patch (for the core owner to apply)

`apps/server/lobby.js` is not imported by `server.js`. This file is the patch to review. Do not treat the library as a live lobby.

When `result.started` is true, create one new `Match` for that `roomId` only. Admit the two seated commanders. Do not spawn a human body for them, and do not call `match.addPlayer` for the commander socket. There is no command API to call here. Fog and session routing stay in the core.

Seat 1 is team `red`. Seat 2 is team `bot`. Those are the match-lifecycle team ids. Issue 19's seat 1 / team A is `red`. Seat 2 / team B is `bot`.

## Disconnect

`disconnect(connectionId, now)` is what the socket `close` handler calls.

- Phase `lobby`: the seat is freed. The same `resumeToken` can reclaim it through `joinRoom` while that seat is still empty. If another commander took it, the result is `seat_lost`.
- Phase `match`: the seat stays assigned and the match stays up. `connected` becomes false. A new join without that token is `room_full`. `joinRoom(roomId, newConnectionId, resumeToken, now)` binds the same seat again and returns `started: false`, so the core must not create a second Match.

This is the simpler mid-match choice from issue 19: keep the seat, leave bots on autopilot, do not end the match. This module does not run autopilot.

## Wire names

Client to server: `room_create`, `room_join`.

Public server messages: `room_state`, `room_error`. Copy those from `result.events` only.

Private unicast to the calling socket, and nowhere else: `room_welcome` with `resumeToken`. Never copy `resumeToken` into `room_state`, `snapshot`, or a share URL.

```js
import { createLobbyRegistry } from "./lobby.js";

const lobby = createLobbyRegistry();
const lobbySockets = new Map(); // connectionId -> { ws, roomId }

function sendRaw(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function welcomeFrom(result) {
  return {
    type: "room_welcome",
    ok: result.ok,
    error: result.error,
    roomId: result.roomId,
    seat: result.seat,
    team: result.team,
    resumeToken: result.resumeToken,
    started: result.started,
  };
}

function fanOut(result, connectionId, ws) {
  if (result.ok) {
    lobbySockets.set(connectionId, { ws, roomId: result.roomId });
    sendRaw(ws, welcomeFrom(result));
  } else {
    sendRaw(ws, { type: "room_error", error: result.error, roomId: result.roomId });
  }
  for (const event of result.events) {
    if (event.type !== "room_state") continue;
    for (const entry of lobbySockets.values()) {
      if (entry.roomId === event.roomId) sendRaw(entry.ws, event);
    }
  }
  if (result.started) {
    // Create a distinct Match for result.roomId here.
    // Seat 1 red, seat 2 bot. Commanders only. No human body.
  }
}

// On each socket, before the existing unit `join` handler:
// connectionId is the id you already assign to that socket.
if (msg.type === "room_create") {
  fanOut(lobby.createRoom(connectionId, Date.now()), connectionId, ws);
  return;
}
if (msg.type === "room_join") {
  fanOut(
    lobby.joinRoom(msg.roomId, connectionId, msg.resumeToken, Date.now()),
    connectionId,
    ws
  );
  return;
}

// On socket close, after the lobby socket is still in the map:
const entry = lobbySockets.get(connectionId);
if (entry) {
  const result = lobby.disconnect(connectionId, Date.now());
  lobbySockets.delete(connectionId);
  for (const event of result.events) {
    if (event.type !== "room_state") continue;
    for (const other of lobbySockets.values()) {
      if (other.roomId === event.roomId) sendRaw(other.ws, event);
    }
  }
}
```

`Date.now()` above is the core clock. The lobby module does not read a clock. Pass the same monotonic milliseconds you use for the rest of the server.

`lobby.snapshot(roomId)` is the public seat board. It has no `resumeToken`. Use it if you need to rebuild `room_state` without a fresh call.

The page `apps/web/lobby.html` already sends `room_create` / `room_join` and reads `room_welcome`, `room_state`, and `room_error`. On start it navigates to `/game.html?room&seat&team&commander=1` with no token. `apps/web/game.js` does not read that query yet. Leave it unchanged until you admit commanders there.

Do not route these messages by editing this patch into the tree until you have reviewed it. The current `join` path stays the live unit path.
