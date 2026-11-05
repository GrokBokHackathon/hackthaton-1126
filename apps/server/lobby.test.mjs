import assert from "node:assert/strict";
import test from "node:test";
import {
  LOBBY_TEAMS,
  createLobbyRegistry,
  lobbyHandoffPath,
  lobbySharePath,
} from "./lobby.js";
import { createLobbyClient, renderLobby } from "../web/lobby.js";

function ids(list) {
  let index = 0;
  return () => list[index++] || list.at(-1);
}

function registry() {
  return createLobbyRegistry({
    createId: ids(["ABCD", "EFGH", "JKLM"]),
    createToken: ids(["tok-red", "tok-bot", "tok-c", "tok-d"]),
  });
}

function dump(value) {
  return JSON.stringify(value);
}

test("create seats red and keeps the resume token private", () => {
  const lobby = registry();
  const created = lobby.createRoom("conn-1", 10);
  assert.equal(created.ok, true);
  assert.equal(created.error, null);
  assert.equal(created.roomId, "ABCD");
  assert.equal(created.seat, 1);
  assert.equal(created.team, "red");
  assert.equal(created.resumeToken, "tok-red");
  assert.equal(created.started, false);
  assert.equal(created.events[0].type, "room_state");
  assert.equal(created.events[0].phase, "lobby");
  assert.equal(dump(created.events).includes("tok-red"), false);
  const snap = lobby.snapshot("abcd");
  assert.equal(dump(snap).includes("tok-red"), false);
  assert.equal(dump(snap).includes("resumeToken"), false);
  assert.equal(snap.seats[0].filled, true);
  assert.equal(snap.seats[0].team, "red");
  assert.equal(snap.seats[1].filled, false);
  assert.equal(snap.sharePath, lobbySharePath("ABCD"));
  assert.deepEqual(LOBBY_TEAMS, ["red", "bot"]);
});

test("second seat is bot and auto-starts once", () => {
  const lobby = registry();
  const created = lobby.createRoom("conn-1", 0);
  const joined = lobby.joinRoom(created.roomId, "conn-2", undefined, 5);
  assert.equal(joined.ok, true);
  assert.equal(joined.seat, 2);
  assert.equal(joined.team, "bot");
  assert.equal(joined.resumeToken, "tok-bot");
  assert.equal(joined.started, true);
  assert.equal(joined.events[0].type, "room_state");
  assert.equal(joined.events[0].phase, "match");
  assert.equal(dump(joined.events).includes("tok-bot"), false);
  assert.equal(lobby.snapshot("ABCD").phase, "match");
  const again = lobby.joinRoom("ABCD", "conn-2", undefined, 6);
  assert.equal(again.started, false);
  assert.equal(again.resumeToken, "tok-bot");
});

test("full room and invalid id are errors", () => {
  const lobby = registry();
  const created = lobby.createRoom("conn-1", 0);
  lobby.joinRoom(created.roomId, "conn-2", undefined, 1);
  const full = lobby.joinRoom("ABCD", "conn-3", undefined, 2);
  assert.deepEqual(
    { ok: full.ok, error: full.error, started: full.started },
    { ok: false, error: "room_full", started: false }
  );
  assert.equal("resumeToken" in full, false);
  assert.equal(full.events[0].type, "room_error");
  const bad = lobby.joinRoom("nope", "conn-3", undefined, 3);
  assert.equal(bad.error, "invalid_room");
  const missing = lobby.joinRoom("ZZZZ", "conn-3", undefined, 4);
  assert.equal(missing.error, "invalid_room");
  assert.equal(lobby.snapshot("ZZZZ"), null);
});

test("lobby disconnect frees the seat and the resume token can restore it", () => {
  const lobby = registry();
  const created = lobby.createRoom("conn-1", 0);
  const left = lobby.disconnect("conn-1", 1);
  assert.equal(left.ok, true);
  assert.equal(left.started, false);
  assert.equal("resumeToken" in left, false);
  assert.equal(lobby.snapshot("ABCD").seats[0].filled, false);
  assert.equal(lobby.snapshot("ABCD").phase, "lobby");
  const back = lobby.joinRoom("ABCD", "conn-9", created.resumeToken, 2);
  assert.equal(back.ok, true);
  assert.equal(back.seat, 1);
  assert.equal(back.team, "red");
  assert.equal(back.resumeToken, created.resumeToken);
  assert.equal(back.started, false);
});

test("a taken seat is not restored and teams do not swap", () => {
  const lobby = registry();
  const created = lobby.createRoom("conn-1", 0);
  lobby.disconnect("conn-1", 1);
  const taken = lobby.joinRoom("ABCD", "conn-2", undefined, 2);
  assert.equal(taken.seat, 1);
  assert.equal(taken.team, "red");
  const lost = lobby.joinRoom("ABCD", "conn-1", created.resumeToken, 3);
  assert.equal(lost.error, "seat_lost");
  assert.equal(lobby.snapshot("ABCD").seats[0].team, "red");
  assert.equal(lobby.snapshot("ABCD").seats[1].filled, false);
});

test("mid-match disconnect keeps the seat and does not end the match", () => {
  const lobby = registry();
  lobby.createRoom("conn-1", 0);
  lobby.joinRoom("ABCD", "conn-2", undefined, 1);
  const dropped = lobby.disconnect("conn-1", 2);
  assert.equal(dropped.seat, 1);
  assert.equal(dropped.team, "red");
  assert.equal(dropped.started, false);
  assert.equal(dropped.events[0].phase, "match");
  assert.equal(dropped.events[0].seats[0].filled, true);
  assert.equal(dropped.events[0].seats[0].connected, false);
  const late = lobby.joinRoom("ABCD", "conn-3", undefined, 3);
  assert.equal(late.error, "room_full");
  const back = lobby.joinRoom("ABCD", "conn-4", "tok-red", 4);
  assert.equal(back.ok, true);
  assert.equal(back.seat, 1);
  assert.equal(back.team, "red");
  assert.equal(back.started, false);
  assert.equal(lobby.snapshot("ABCD").phase, "match");
  assert.equal(lobby.snapshot("ABCD").seats[0].connected, true);
});

test("two clients create, join, and start without a socket server", () => {
  const lobby = registry();
  const sent = [];
  const clients = [0, 1].map(() =>
    createLobbyClient({
      origin: "https://play.example",
      send(message) {
        sent.push(message);
      },
    })
  );
  clients[0].create();
  assert.deepEqual(sent[0], { type: "room_create" });
  const created = lobby.createRoom("c1", 0);
  clients[0].receive({
    type: "room_welcome",
    ok: true,
    roomId: created.roomId,
    seat: created.seat,
    team: created.team,
    resumeToken: created.resumeToken,
    started: created.started,
  });
  clients[0].receive(created.events[0]);
  assert.equal(clients[0].view().you.team, "red");
  assert.equal(clients[0].view().shareUrl, "https://play.example/lobby.html?room=ABCD");
  assert.match(renderLobby(clients[0].view()), /Seat 1 · red · Filled/);
  assert.match(renderLobby(clients[0].view()), /Seat 2 · bot · Empty/);

  clients[1].join("ABCD");
  assert.deepEqual(sent[1], { type: "room_join", roomId: "ABCD" });
  const joined = lobby.joinRoom("ABCD", "c2", undefined, 1);
  clients[1].receive({
    type: "room_welcome",
    ok: true,
    roomId: joined.roomId,
    seat: joined.seat,
    team: joined.team,
    resumeToken: joined.resumeToken,
    started: joined.started,
  });
  for (const client of clients) client.receive(joined.events[0]);
  assert.equal(clients[1].view().you.team, "bot");
  assert.equal(clients[0].view().mode, "match");
  assert.equal(clients[1].view().mode, "match");
  assert.equal(clients[1].view().handoffUrl.includes("resumeToken"), false);
  assert.equal(
    clients[1].view().handoffPath,
    lobbyHandoffPath("ABCD", 2, "bot")
  );
  assert.match(renderLobby(clients[1].view()), /Match started/);
  assert.equal(dump(clients[0].view().seats).includes("tok-"), false);
});

test("the client stores a resume token only from the private welcome", () => {
  const storage = new Map();
  const client = createLobbyClient({
    origin: "https://play.example",
    send() {},
  });
  const store = {
    setItem(key, value) {
      storage.set(key, value);
    },
    getItem(key) {
      return storage.get(key) ?? null;
    },
    removeItem(key) {
      storage.delete(key);
    },
  };
  client.receive({
    type: "room_state",
    roomId: "ABCD",
    sharePath: "/lobby.html?room=ABCD",
    phase: "lobby",
    seats: [],
    resumeToken: "leaked",
  });
  client.save(store);
  assert.equal(storage.size, 0);
  client.receive(
    {
      type: "room_welcome",
      ok: true,
      roomId: "ABCD",
      seat: 1,
      team: "red",
      resumeToken: "tok-red",
      started: false,
    },
    store
  );
  assert.equal(client.load(store).resumeToken, "tok-red");
  client.receive({ type: "room_error", error: "room_full" });
  assert.match(renderLobby(client.view()), /room is full/);
  client.receive({ type: "room_error", error: "invalid_room" });
  assert.match(renderLobby(client.view()), /not valid/);
});
