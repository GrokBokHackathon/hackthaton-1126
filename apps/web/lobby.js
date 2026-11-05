// Lobby screen for the room contract. It does not open a server and it does not join a unit.

export const LOBBY_STORAGE_KEY = "flagRaidLobby";

const ERROR_TEXT = {
  invalid_room: "That room id is not valid.",
  room_full: "That room is full.",
  seat_lost: "Your seat was taken.",
  invalid_token: "Reconnect failed.",
  already_seated: "You are already seated.",
  invalid_time: "Could not enter that room.",
  invalid_connection: "Could not enter that room.",
};

function emptyView() {
  return {
    mode: "form",
    roomId: null,
    sharePath: null,
    shareUrl: null,
    handoffPath: null,
    handoffUrl: null,
    phase: null,
    you: null,
    seats: [
      { seat: 1, team: "red", filled: false, connected: false },
      { seat: 2, team: "bot", filled: false, connected: false },
    ],
    error: null,
  };
}

function withOrigin(origin, path) {
  if (!path) return null;
  if (!origin) return path;
  return `${String(origin).replace(/\/$/, "")}${path}`;
}

function handoffFor(roomId, seat, team) {
  if (!roomId || !seat || !team) return null;
  return `/game.html?room=${encodeURIComponent(roomId)}&seat=${seat}&team=${team}&commander=1`;
}

export function createLobbyClient({ send, origin = "" } = {}) {
  if (typeof send !== "function") throw new TypeError("send must be a function");
  let view = emptyView();

  function remember(storage) {
    if (!storage || !view.you?.resumeToken || !view.roomId) return;
    storage.setItem(
      LOBBY_STORAGE_KEY,
      JSON.stringify({
        roomId: view.roomId,
        resumeToken: view.you.resumeToken,
        seat: view.you.seat,
        team: view.you.team,
      })
    );
  }

  return {
    view() {
      return view;
    },

    create() {
      send({ type: "room_create" });
    },

    join(roomId, resumeToken) {
      const message = { type: "room_join", roomId: String(roomId || "").trim() };
      if (resumeToken) message.resumeToken = resumeToken;
      send(message);
    },

    load(storage) {
      if (!storage) return null;
      const raw = storage.getItem(LOBBY_STORAGE_KEY);
      if (!raw) return null;
      try {
        const saved = JSON.parse(raw);
        if (!saved?.roomId || !saved.resumeToken) return null;
        return saved;
      } catch {
        return null;
      }
    },

    save(storage) {
      remember(storage);
    },

    clear(storage) {
      storage?.removeItem(LOBBY_STORAGE_KEY);
    },

    receive(message, storage) {
      if (!message || typeof message !== "object") return view;
      if (message.type === "room_error" || (message.type === "room_welcome" && message.ok === false)) {
        view = {
          ...view,
          error: ERROR_TEXT[message.error] || "Could not enter that room.",
        };
        return view;
      }
      if (message.type === "room_welcome" && message.ok !== false) {
        const handoffPath = handoffFor(message.roomId, message.seat, message.team);
        view = {
          ...view,
          mode: message.started ? "match" : "lobby",
          roomId: message.roomId,
          phase: message.started ? "match" : view.phase || "lobby",
          handoffPath,
          handoffUrl: withOrigin(origin, handoffPath),
          error: null,
          you: {
            seat: message.seat,
            team: message.team,
            resumeToken: message.resumeToken,
          },
        };
        remember(storage);
        return view;
      }
      if (message.type === "room_state") {
        const handoffPath = view.you
          ? handoffFor(message.roomId, view.you.seat, view.you.team)
          : view.handoffPath;
        view = {
          ...view,
          mode: message.phase === "match" ? "match" : view.you ? "lobby" : view.mode,
          roomId: message.roomId,
          sharePath: message.sharePath,
          shareUrl: withOrigin(origin, message.sharePath),
          phase: message.phase,
          seats: message.seats,
          handoffPath,
          handoffUrl: withOrigin(origin, handoffPath),
          error: null,
        };
        return view;
      }
      return view;
    },
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

export function renderLobby(view) {
  const seats = (view.seats || [])
    .map((seat) => {
      const state = seat.filled ? (seat.connected ? "filled" : "away") : "empty";
      const who = seat.filled ? (seat.connected ? "Filled" : "Away") : "Empty";
      return `<li data-seat="${seat.seat}" data-team="${escapeHtml(seat.team)}" data-state="${state}">Seat ${seat.seat} · ${escapeHtml(seat.team)} · ${who}</li>`;
    })
    .join("");
  const you = view.you
    ? `<p id="lobby-you">You are seat ${view.you.seat}, team ${escapeHtml(view.you.team)}.</p>`
    : `<p id="lobby-you">You are not seated.</p>`;
  const error = view.error ? `<p id="lobby-error" role="alert">${escapeHtml(view.error)}</p>` : "";
  const share = view.shareUrl || view.sharePath;
  const link = share
    ? `<p id="lobby-share">Share link <a href="${escapeHtml(share)}">${escapeHtml(share)}</a></p>`
    : "";
  const match =
    view.mode === "match"
      ? `<p id="lobby-start">Match started. Both commander seats are filled.</p>`
      : "";
  return `${error}${you}${link}${match}<ul id="lobby-seats">${seats}</ul>`;
}
