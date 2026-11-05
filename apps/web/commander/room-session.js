// Room handoff. The server seat is authoritative. Query team and seat are ignored.
// The resume token stays in the caller-supplied storage and is never put on a URL.

import { LOBBY_STORAGE_KEY } from "../lobby.js";

export { LOBBY_STORAGE_KEY };

export const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_ID_LENGTH = 4;
export const ROOM_TEAMS = Object.freeze({ 1: "red", 2: "bot" });

const ROOM_ERRORS = {
  invalid_room: "That room id is not valid.",
  room_full: "That room is full.",
  seat_lost: "Your seat was taken.",
  invalid_token: "Reconnect failed.",
  already_seated: "You are already seated.",
};

export function normalizeRoomId(value) {
  if (typeof value !== "string") return null;
  const id = value.trim().toUpperCase();
  if (id.length !== ROOM_ID_LENGTH) return null;
  for (const char of id) {
    if (!ROOM_ID_ALPHABET.includes(char)) return null;
  }
  return id;
}

/** Commander handoff is commander=1 plus a room id. Team and seat in the query are dropped. */
export function roomQuery(search) {
  const raw = typeof search === "string" ? search : "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  if (params.get("commander") !== "1") return null;
  const roomId = normalizeRoomId(params.get("room"));
  if (!roomId) return null;
  return { roomId };
}

export function authoritativeSeat(message) {
  if (!message || message.type !== "room_welcome" || message.ok === false) return null;
  const roomId = normalizeRoomId(message.roomId);
  if (!roomId) return null;
  if (message.seat !== 1 && message.seat !== 2) return null;
  if (message.team !== ROOM_TEAMS[message.seat]) return null;
  return {
    roomId,
    seat: message.seat,
    team: message.team,
    started: message.started === true,
    mapSeed: Number.isFinite(message.mapSeed) ? message.mapSeed : null,
  };
}

export function loadRoomSession(storage, roomId) {
  if (!storage || typeof storage.getItem !== "function") return null;
  const expected = normalizeRoomId(roomId);
  let saved;
  try {
    saved = JSON.parse(storage.getItem(LOBBY_STORAGE_KEY) || "");
  } catch {
    return null;
  }
  if (!saved || typeof saved.resumeToken !== "string" || saved.resumeToken.length === 0) return null;
  const savedId = normalizeRoomId(saved.roomId);
  if (!savedId || (expected && savedId !== expected)) return null;
  return { roomId: savedId, resumeToken: saved.resumeToken };
}

export function saveRoomSession(storage, welcome) {
  const seat = authoritativeSeat(welcome);
  if (!storage || typeof storage.setItem !== "function" || !seat) return false;
  if (typeof welcome.resumeToken !== "string" || welcome.resumeToken.length === 0) return false;
  storage.setItem(LOBBY_STORAGE_KEY, JSON.stringify({
    roomId: seat.roomId,
    resumeToken: welcome.resumeToken,
    seat: seat.seat,
    team: seat.team,
  }));
  return true;
}

export function clearRoomSession(storage) {
  if (!storage || typeof storage.removeItem !== "function") return;
  storage.removeItem(LOBBY_STORAGE_KEY);
}

export function roomJoinMessage(roomId, saved) {
  const id = normalizeRoomId(roomId);
  if (!id) return null;
  const message = { type: "room_join", roomId: id };
  if (saved && saved.roomId === id && typeof saved.resumeToken === "string" && saved.resumeToken.length > 0) {
    message.resumeToken = saved.resumeToken;
  }
  return message;
}

export function publicRoomBoard(message) {
  if (!message || message.type !== "room_state") return null;
  const roomId = normalizeRoomId(message.roomId);
  const seats = Array.isArray(message.seats)
    ? message.seats.map((seat) => ({
      seat: seat && seat.seat,
      team: seat && seat.team,
      filled: Boolean(seat && seat.filled),
      connected: Boolean(seat && seat.connected),
    }))
    : [];
  return {
    type: "room_state",
    roomId,
    sharePath: typeof message.sharePath === "string" ? message.sharePath : null,
    phase: message.phase ?? null,
    atMs: Number.isFinite(message.atMs) ? message.atMs : null,
    mapSeed: Number.isFinite(message.mapSeed) ? message.mapSeed : null,
    seats,
  };
}

export function roomErrorText(error) {
  return ROOM_ERRORS[error] || "Could not enter that room.";
}

export function roomErrorClearsSession(error) {
  return error === "invalid_token" || error === "seat_lost";
}

export function roomErrorHoldsSocket(error) {
  return error === "invalid_room" || error === "room_full" || error === "seat_lost" || error === "invalid_token" || error === "already_seated";
}

/**
 * Opening bounds when the room snapshot has fog and units but no tile array.
 * Corner bases match the live generator. Own units, when present, replace that
 * team's corner for the first camera only.
 */
export function openingMap(snapshot, team) {
  const fog = snapshot && snapshot.fog;
  if (!fog || !Number.isInteger(fog.width) || fog.width <= 0 || !Number.isInteger(fog.height) || fog.height <= 0) {
    return null;
  }
  const bases = {
    red: { x: 2, y: 2 },
    bot: { x: Math.max(0, fog.width - 3), y: Math.max(0, fog.height - 3) },
  };
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const own = players.filter((player) => player && player.team === team && Number.isFinite(player.x) && Number.isFinite(player.y));
  if ((team === "red" || team === "bot") && own.length > 0) {
    bases[team] = {
      x: own.reduce((sum, player) => sum + player.x, 0) / own.length,
      y: own.reduce((sum, player) => sum + player.y, 0) / own.length,
    };
  }
  return {
    width: fog.width,
    height: fog.height,
    seed: Number.isFinite(snapshot.mapSeed) ? snapshot.mapSeed : null,
    tiles: null,
    bases,
  };
}
