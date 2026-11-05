import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { LOBBY_TEAMS, normalizeRoomId as serverNormalizeRoomId } from "../../server/lobby.js";
import { LOBBY_STORAGE_KEY } from "../lobby.js";
import {
  ROOM_TEAMS,
  authoritativeSeat,
  clearRoomSession,
  loadRoomSession,
  normalizeRoomId,
  openingMap,
  publicRoomBoard,
  roomErrorClearsSession,
  roomJoinMessage,
  roomQuery,
  saveRoomSession,
} from "./room-session.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length === 0 || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

test("wire teams are red and bot, and the query team is ignored", () => {
  assert.deepEqual(LOBBY_TEAMS, ["red", "bot"]);
  assert.equal(ROOM_TEAMS[1], "red");
  assert.equal(ROOM_TEAMS[2], "bot");
  assert.equal(normalizeRoomId("ab2k"), serverNormalizeRoomId("ab2k"));
  const query = roomQuery("?room=ab2k&seat=1&team=blue&commander=1");
  assert.deepEqual(query, { roomId: "AB2K" });
  assert.equal(JSON.stringify(query).includes("blue"), false);
  assert.equal(roomQuery("?room=AB2K"), null);
});

test("room join uses the stored token for that room only", () => {
  const storage = memoryStorage();
  const welcome = {
    type: "room_welcome",
    ok: true,
    roomId: "AB2K",
    seat: 2,
    team: "bot",
    resumeToken: "stored-secret",
    started: true,
    mapSeed: 17,
  };
  assert.equal(saveRoomSession(storage, welcome), true);
  const seat = authoritativeSeat(welcome);
  assert.equal(seat.team, "bot");
  assert.equal(seat.seat, 2);
  assert.equal(seat.mapSeed, 17);
  const saved = loadRoomSession(storage, "ab2k");
  assert.equal(sameSecret(saved.resumeToken, welcome.resumeToken), true);
  const message = roomJoinMessage(saved.roomId, saved);
  assert.equal(message.type, "room_join");
  assert.equal(sameSecret(message.resumeToken, welcome.resumeToken), true);
  assert.equal(Object.hasOwn(roomJoinMessage("CD3M", null) || {}, "resumeToken"), false);
  assert.equal(loadRoomSession(storage, "CD3M"), null);
  const board = publicRoomBoard({
    type: "room_state",
    roomId: "AB2K",
    sharePath: "/lobby.html?room=AB2K",
    phase: "match",
    mapSeed: 17,
    resumeToken: welcome.resumeToken,
    seats: [
      { seat: 1, team: "red", filled: true, connected: true },
      { seat: 2, team: "bot", filled: true, connected: false },
    ],
  });
  assert.equal(JSON.stringify(board).includes("stored-secret"), false);
  assert.equal(board.sharePath.includes("resumeToken"), false);
  assert.equal(authoritativeSeat({ ...welcome, seat: 2, team: "blue" }), null);
  assert.equal(authoritativeSeat({ ...welcome, seat: 1, team: "bot" }), null);
});

test("a rejected token is cleared and the next join has no token", () => {
  const storage = memoryStorage();
  saveRoomSession(storage, {
    type: "room_welcome",
    ok: true,
    roomId: "AB2K",
    seat: 1,
    team: "red",
    resumeToken: "stored-secret",
    started: false,
  });
  assert.equal(roomErrorClearsSession("invalid_token"), true);
  assert.equal(roomErrorClearsSession("room_full"), false);
  clearRoomSession(storage);
  assert.equal(storage.getItem(LOBBY_STORAGE_KEY), null);
  const message = roomJoinMessage("AB2K", loadRoomSession(storage, "AB2K"));
  assert.deepEqual(message, { type: "room_join", roomId: "AB2K" });
});

test("opening map frames own units and does not invent tiles", () => {
  const map = openingMap({
    mapSeed: 9,
    fog: { width: 64, height: 40 },
    players: [
      { id: "auto-bot-0", team: "bot", kind: "bot", x: 61.2, y: 36.5 },
      { id: "auto-red-0", team: "red", kind: "bot", x: 2, y: 2 },
    ],
  }, "bot");
  assert.equal(map.tiles, null);
  assert.ok(Math.abs(map.bases.bot.x - 61.2) < 1e-9);
  assert.equal(map.bases.red.x, 2);
});

test("a seated room does not send a unit join", () => {
  const game = fs.readFileSync(new URL("../game.js", import.meta.url), "utf8");
  const open = game.slice(game.indexOf('this.ws.addEventListener("open"'), game.indexOf('this.ws.addEventListener("message"'));
  assert.match(open, /roomJoinMessage/);
  assert.match(open, /type: "join"/);
  assert.ok(open.indexOf("this.roomMode") < open.indexOf('type: "join"'));
  assert.equal(open.includes("resumeToken"), false);
  assert.equal(game.includes('type: "input"'), false);
  assert.match(game, /already_seated|room_welcome/);
  const html = fs.readFileSync(new URL("../lobby.html", import.meta.url), "utf8");
  assert.match(html, /handoffUrl && !view\.handoffUrl\.includes\("resumeToken"\)/);
  assert.equal(html.includes("does not route lobby"), false);
});
