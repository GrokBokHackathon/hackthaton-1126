// Authoritative 2-seat commander lobby. No sockets, no match, no fog, no orders.
// Seat 1 is team "red". Seat 2 is team "bot" (same ids as match-lifecycle).
// Issue 19's seat 1 / team A is red. Seat 2 / team B is bot.
// Mid-lobby disconnect frees the seat. Mid-match disconnect keeps the seat and does not end the match.

export const SEAT_COUNT = 2;
export const ROOM_ID_LENGTH = 4;
export const TOKEN_LENGTH = 12;
export const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LOBBY_TEAMS = Object.freeze(["red", "bot"]);

function randomString(random, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(random() * ROOM_ID_ALPHABET.length) % ROOM_ID_ALPHABET.length;
    out += ROOM_ID_ALPHABET[index];
  }
  return out;
}

export function normalizeRoomId(value) {
  if (typeof value !== "string") return null;
  const id = value.trim().toUpperCase();
  if (id.length !== ROOM_ID_LENGTH) return null;
  for (const char of id) {
    if (!ROOM_ID_ALPHABET.includes(char)) return null;
  }
  return id;
}

export function lobbySharePath(roomId) {
  return `/lobby.html?room=${roomId}`;
}

export function lobbyHandoffPath(roomId, seat, team) {
  return `/game.html?room=${encodeURIComponent(roomId)}&seat=${seat}&team=${team}&commander=1`;
}

function isFiniteNow(now) {
  return typeof now === "number" && Number.isFinite(now);
}

function isConnectionId(connectionId) {
  return typeof connectionId === "string" && connectionId.length > 0;
}

function publicSeat(seat) {
  return {
    seat: seat.seat,
    team: seat.team,
    filled: seat.resumeToken !== null,
    connected: seat.connected,
  };
}

function roomState(room, now) {
  return {
    type: "room_state",
    roomId: room.id,
    sharePath: lobbySharePath(room.id),
    phase: room.phase,
    atMs: now,
    seats: room.seats.map(publicSeat),
  };
}

function fail(error, roomId, now) {
  return {
    ok: false,
    error,
    roomId: roomId ?? null,
    seat: null,
    team: null,
    started: false,
    events: [
      {
        type: "room_error",
        error,
        roomId: roomId ?? null,
        atMs: now,
      },
    ],
  };
}

function okResult(room, seat, started, now) {
  return {
    ok: true,
    error: null,
    roomId: room.id,
    seat: seat.seat,
    team: seat.team,
    resumeToken: seat.resumeToken,
    started,
    events: [roomState(room, now)],
  };
}

export function createLobbyRegistry({ random = Math.random, createId, createToken } = {}) {
  if (typeof random !== "function") throw new TypeError("random must be a function");
  const rooms = new Map();
  const byConnection = new Map();

  function nextId() {
    return createId ? createId() : randomString(random, ROOM_ID_LENGTH);
  }

  function nextToken() {
    return createToken ? createToken() : randomString(random, TOKEN_LENGTH);
  }

  function addRoom() {
    let id = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const normalized = normalizeRoomId(String(nextId() ?? ""));
      if (normalized && !rooms.has(normalized)) {
        id = normalized;
        break;
      }
    }
    if (!id) throw new Error("could not allocate a room id");
    const room = {
      id,
      phase: "lobby",
      seats: [
        { seat: 1, team: "red", connectionId: null, resumeToken: null, connected: false },
        { seat: 2, team: "bot", connectionId: null, resumeToken: null, connected: false },
      ],
      released: new Map(),
      lost: new Set(),
    };
    rooms.set(id, room);
    return room;
  }

  function seatFor(connectionId) {
    const located = byConnection.get(connectionId);
    if (!located) return null;
    const room = rooms.get(located.roomId);
    if (!room) return null;
    const seat = room.seats[located.seat - 1];
    if (!seat || seat.connectionId !== connectionId) return null;
    return { room, seat };
  }

  function dropReleased(room, seatNumber, exceptToken) {
    for (const [token, claim] of room.released) {
      if (claim.seat !== seatNumber) continue;
      room.released.delete(token);
      if (token !== exceptToken) room.lost.add(token);
    }
  }

  function assign(room, seat, connectionId) {
    dropReleased(room, seat.seat, null);
    seat.connectionId = connectionId;
    seat.resumeToken = nextToken();
    seat.connected = true;
    byConnection.set(connectionId, { roomId: room.id, seat: seat.seat });
    return seat;
  }

  function maybeStart(room) {
    if (room.phase !== "lobby") return false;
    if (!room.seats.every((seat) => seat.resumeToken)) return false;
    room.phase = "match";
    return true;
  }

  function restore(room, seat, connectionId, token) {
    const previous = seat.connectionId;
    if (previous && previous !== connectionId) byConnection.delete(previous);
    dropReleased(room, seat.seat, token);
    seat.connectionId = connectionId;
    seat.resumeToken = token;
    seat.connected = true;
    byConnection.set(connectionId, { roomId: room.id, seat: seat.seat });
  }

  return {
    createRoom(connectionId, now) {
      if (!isFiniteNow(now)) return fail("invalid_time", null, now);
      if (!isConnectionId(connectionId)) return fail("invalid_connection", null, now);
      const existing = seatFor(connectionId);
      if (existing) return okResult(existing.room, existing.seat, false, now);
      const room = addRoom();
      const seat = assign(room, room.seats[0], connectionId);
      return okResult(room, seat, false, now);
    },

    joinRoom(roomId, connectionId, resumeToken, now) {
      if (!isFiniteNow(now)) return fail("invalid_time", null, now);
      if (!isConnectionId(connectionId)) return fail("invalid_connection", null, now);
      const id = normalizeRoomId(roomId);
      if (!id || !rooms.has(id)) return fail("invalid_room", id, now);
      const room = rooms.get(id);
      const existing = seatFor(connectionId);
      if (existing && existing.room.id !== id) return fail("already_seated", existing.room.id, now);
      if (existing && existing.room.id === id) return okResult(room, existing.seat, false, now);

      const token = typeof resumeToken === "string" && resumeToken.length > 0 ? resumeToken : null;
      if (token) {
        const held = room.seats.find((seat) => seat.resumeToken === token);
        if (held) {
          restore(room, held, connectionId, token);
          return okResult(room, held, false, now);
        }
        if (room.lost.has(token)) return fail("seat_lost", id, now);
        const claim = room.released.get(token);
        if (!claim) return fail("invalid_token", id, now);
        const seat = room.seats[claim.seat - 1];
        if (seat.resumeToken) return fail("seat_lost", id, now);
        room.released.delete(token);
        restore(room, seat, connectionId, token);
        return okResult(room, seat, maybeStart(room), now);
      }

      if (room.phase === "match") return fail("room_full", id, now);
      const open = room.seats.find((seat) => seat.resumeToken === null);
      if (!open) return fail("room_full", id, now);
      const seat = assign(room, open, connectionId);
      return okResult(room, seat, maybeStart(room), now);
    },

    disconnect(connectionId, now) {
      if (!isFiniteNow(now)) return fail("invalid_time", null, now);
      if (!isConnectionId(connectionId)) return fail("invalid_connection", null, now);
      const existing = seatFor(connectionId);
      if (!existing) {
        return {
          ok: true,
          error: null,
          roomId: null,
          seat: null,
          team: null,
          started: false,
          events: [],
        };
      }
      const { room, seat } = existing;
      byConnection.delete(connectionId);
      seat.connectionId = null;
      seat.connected = false;
      if (room.phase === "lobby") {
        room.released.set(seat.resumeToken, { seat: seat.seat });
        seat.resumeToken = null;
      }
      return {
        ok: true,
        error: null,
        roomId: room.id,
        seat: seat.seat,
        team: seat.team,
        started: false,
        events: [roomState(room, now)],
      };
    },

    snapshot(roomId) {
      const id = normalizeRoomId(roomId);
      const room = id ? rooms.get(id) : null;
      if (!room) return null;
      return {
        roomId: room.id,
        sharePath: lobbySharePath(room.id),
        phase: room.phase,
        seats: room.seats.map(publicSeat),
      };
    },
  };
}
