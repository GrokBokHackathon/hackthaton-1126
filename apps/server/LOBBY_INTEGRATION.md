# Lobby routing (wired)

`server.js` now routes `room_create` and `room_join` through `lobby-router.js` on the existing `/ws` listener. Do not add a second listener.

- Seat 1 is `red`. Seat 2 is `bot`.
- `room_welcome` is unicast and is the only frame with `resumeToken`.
- `room_state` is the public board. After the room starts it includes `mapSeed` for that room's Match.
- `result.started` creates one Match, spawns the existing autopilot squad, and sets `phase` to `playing`. Match itself only enters `playing` when a human body joins, and commanders are not bodies. `onNewMap` does the same after a round reset.
- Commands from a seated commander call the existing `applyCommand` / `visionFor` / `command_view` path on that room's Match. Fogged `clientStateFor(team)` is sent only to that room, during `waiting`, `playing`, `sudden_death`, and `results`. `newMap` is forwarded when the match emits it. `spawnSquad` on that event only fills missing bots, so preserved unit ids stay.
- Legacy `join` still uses the original single match.
- Mid-lobby disconnect frees the seat. Mid-match disconnect keeps the seat and the Match.

`apps/web/game.js` still ignores `/game.html?room&seat&team&commander=1`. That handoff is not live.
