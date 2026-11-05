// Routes lobby sockets onto the live server. One Match per started room.
// Commanders are seats, not map bodies. Callers inject Match creation.

import { applyCommand, commandView, visionFor } from "./commands.js";
import { createLobbyRegistry } from "./lobby.js";

// waiting/playing are live today. sudden_death/results arrive with the lifecycle Match.
export function shouldBroadcastState(phase) {
  return (
    phase === "waiting" ||
    phase === "playing" ||
    phase === "sudden_death" ||
    phase === "results"
  );
}

export function createLobbyRouter({
  createMatch,
  onNewMap,
  visionRadius,
  visionBlockers,
  now = () => Date.now(),
} = {}) {
  if (typeof createMatch !== "function") {
    throw new TypeError("createMatch is required");
  }
  const lobby = createLobbyRegistry();
  const sessions = new Map();
  const matches = new Map();
  let nextConnection = 1;

  function send(ws, message) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(message));
  }

  function roomMatch(roomId) {
    return matches.get(roomId)?.match || null;
  }

  function ensureMatch(roomId) {
    if (matches.has(roomId)) return matches.get(roomId).match;
    const match = createMatch();
    matches.set(roomId, { match });
    return match;
  }

  function deliver(connectionId, ws, result) {
    if (result.ok) {
      if (result.started) ensureMatch(result.roomId);
      sessions.set(connectionId, {
        ws,
        roomId: result.roomId,
        team: result.team,
        seat: result.seat,
      });
      const match = roomMatch(result.roomId);
      const welcome = {
        type: "room_welcome",
        ok: true,
        error: null,
        roomId: result.roomId,
        seat: result.seat,
        team: result.team,
        resumeToken: result.resumeToken,
        started: result.started,
      };
      if (match) welcome.mapSeed = match.map.seed;
      send(ws, welcome);
    } else {
      send(ws, { type: "room_error", error: result.error, roomId: result.roomId });
    }

    for (const event of result.events) {
      if (event.type !== "room_state") continue;
      const match = roomMatch(event.roomId);
      const message = { ...event };
      delete message.resumeToken;
      if (match) message.mapSeed = match.map.seed;
      for (const entry of sessions.values()) {
        if (entry.roomId === event.roomId) send(entry.ws, message);
      }
    }
  }

  return {
    open() {
      const connectionId = `room-${nextConnection}`;
      nextConnection += 1;
      return connectionId;
    },

    handle(connectionId, ws, msg) {
      if (!msg || typeof msg !== "object") return false;
      const at = now();
      if (msg.type === "room_create") {
        deliver(connectionId, ws, lobby.createRoom(connectionId, at));
        return true;
      }
      if (msg.type === "room_join") {
        deliver(
          connectionId,
          ws,
          lobby.joinRoom(msg.roomId, connectionId, msg.resumeToken, at)
        );
        return true;
      }
      if (msg.type === "command" && sessions.has(connectionId)) {
        const session = sessions.get(connectionId);
        const match = roomMatch(session.roomId);
        if (!match || !session.team) {
          send(ws, { type: "command_rejected", seq: msg.seq ?? null, reason: "invalid_command" });
          return true;
        }
        const vision = visionFor(match, session.team, visionRadius, visionBlockers);
        send(ws, applyCommand(match, session.team, msg, vision));
        return true;
      }
      if (msg.type === "input" && sessions.has(connectionId)) return true;
      return false;
    },

    close(connectionId) {
      if (!sessions.has(connectionId)) {
        lobby.disconnect(connectionId, now());
        return;
      }
      const result = lobby.disconnect(connectionId, now());
      sessions.delete(connectionId);
      for (const event of result.events) {
        if (event.type !== "room_state") continue;
        const match = roomMatch(event.roomId);
        const message = { ...event };
        delete message.resumeToken;
        if (match) message.mapSeed = match.map.seed;
        for (const entry of sessions.values()) {
          if (entry.roomId === event.roomId) send(entry.ws, message);
        }
      }
    },

    tick(dt) {
      for (const [roomId, entry] of matches) {
        const events = entry.match.tick(dt);
        const seated = [...sessions.values()].filter((session) => session.roomId === roomId);
        for (const event of events) {
          if (event.type === "newMap" && onNewMap) onNewMap(entry.match);
          for (const session of seated) send(session.ws, event);
        }
        if (!shouldBroadcastState(entry.match.phase)) continue;
        for (const session of seated) {
          send(session.ws, entry.match.clientStateFor(session.team));
          send(session.ws, { type: "command_view", ...commandView(entry.match, session.team) });
        }
      }
    },
  };
}
