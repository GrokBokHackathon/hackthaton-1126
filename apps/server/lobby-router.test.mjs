import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";
import { WebSocket } from "ws";
import { shouldBroadcastState } from "./lobby-router.js";
import { Match } from "./game.js";

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not listen\n${output}`)), 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const found = output.match(/listening on (\d+)/);
      if (found) {
        clearTimeout(timer);
        resolve(Number(found[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("exit", (code) => {
      if (!output.includes("listening on")) reject(new Error(`server exited ${code}\n${output}`));
    });
  });
  return { child, ready };
}

function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const incoming = [];
  ws.on("message", (data) => incoming.push(JSON.parse(String(data))));
  return { ws, incoming };
}

function waitFor(incoming, predicate, timeoutMs = 4000) {
  const found = incoming.find(predicate);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error(`timed out; last=${JSON.stringify(incoming.at(-1))}`));
    }, timeoutMs);
    const poll = setInterval(() => {
      const message = incoming.find(predicate);
      if (!message) return;
      clearTimeout(timer);
      clearInterval(poll);
      resolve(message);
    }, 10);
  });
}

function latest(incoming, predicate) {
  const matches = incoming.filter(predicate);
  return matches.at(-1) || null;
}

test("state broadcasts include sudden death and results", () => {
  assert.equal(shouldBroadcastState("waiting"), true);
  assert.equal(shouldBroadcastState("playing"), true);
  assert.equal(shouldBroadcastState("sudden_death"), true);
  assert.equal(shouldBroadcastState("results"), true);
  assert.equal(shouldBroadcastState("ended"), false);
});

test("live Match results and newMap stay on the broadcast path", () => {
  const match = new Match();
  const player = match.addPlayer("p1", "Ada", "human");
  const ids = [...match.players.keys()].sort();
  for (let i = 0; i < 3; i++) {
    player.x = match.map.bases.bot.x;
    player.y = match.map.bases.bot.y;
    player.hasFlag = false;
    match.flags.bot.carrier = null;
    match.flags.bot.x = player.x;
    match.flags.bot.y = player.y;
    match.tick(0.05);
    player.x = match.map.bases.red.x;
    player.y = match.map.bases.red.y;
    match.tick(0.05);
  }
  assert.equal(match.phase, "results");
  assert.equal(shouldBroadcastState(match.phase), true);
  const view = match.clientStateFor("red");
  assert.equal(view.phase, "results");
  assert.equal(view.winner, "red");
  assert.equal(view.winReason, "captures");
  assert.equal(typeof view.remainingMs, "number");
  assert.equal(view.roundId, 1);
  assert.equal(view.players.some((body) => body.id === "p1"), true);

  match.nowMs = match.resultsEndsAtMs;
  const events = match.tick(0);
  const reset = events.find((event) => event.type === "newMap");
  assert.ok(reset);
  assert.equal(reset.roundId, 2);
  assert.equal(match.phase, "playing");
  assert.equal(shouldBroadcastState(match.phase), true);
  assert.deepEqual([...match.players.keys()].sort(), ids);
  assert.equal(match.clientStateFor("red").roundId, 2);
  assert.equal(match.clientStateFor("red").winner, null);
});

test("a commander room does not tick until core activates the match", async () => {
  const { child, ready } = startServer();
  try {
    const port = await ready;
    const red = connect(port);
    const bot = connect(port);
    await Promise.all([once(red.ws, "open"), once(bot.ws, "open")]);
    red.ws.send(JSON.stringify({ type: "room_create" }));
    const created = await waitFor(red.incoming, (message) => message.type === "room_welcome");
    bot.ws.send(JSON.stringify({ type: "room_join", roomId: created.roomId }));
    const joined = await waitFor(bot.incoming, (message) => message.type === "room_welcome");
    assert.equal(joined.started, true);
    assert.equal(joined.team, "bot");
    const first = await waitFor(red.incoming, (message) => message.type === "state");
    assert.equal(first.phase, "waiting");
    assert.equal(first.players.some((player) => player.kind === "human"), false);
    assert.ok(first.players.length > 0);
    const places = (message) =>
      message.players.map((player) => [player.id, player.x, player.y]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const startedAt = places(first);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const last = latest(red.incoming, (message) => message.type === "state");
    assert.equal(last.phase, "waiting");
    assert.equal(last.remainingMs, first.remainingMs);
    assert.deepEqual(places(last), startedAt);
    red.ws.send(JSON.stringify({ type: "join", name: "Ada", kind: "human" }));
    const rejected = await waitFor(red.incoming, (message) => message.type === "join_rejected");
    assert.equal(rejected.reason, "already_seated");
    const after = latest(red.incoming, (message) => message.type === "state");
    assert.equal(after.players.some((player) => player.kind === "human"), false);
    red.ws.close();
    bot.ws.close();
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
});

test("two websocket clients seat opposite commanders on separate room matches", async () => {
  const { child, ready } = startServer();
  try {
    const port = await ready;

    const red = connect(port);
    const bot = connect(port);
    await Promise.all([once(red.ws, "open"), once(bot.ws, "open")]);
    await waitFor(red.incoming, (message) => message.type === "hello");
    await waitFor(bot.incoming, (message) => message.type === "hello");

    red.ws.send(JSON.stringify({ type: "room_create" }));
    const created = await waitFor(red.incoming, (message) => message.type === "room_welcome");
    assert.equal(created.ok, true);
    assert.equal(created.seat, 1);
    assert.equal(created.team, "red");
    assert.equal(created.started, false);
    assert.equal(typeof created.resumeToken, "string");
    const lobbyState = await waitFor(
      red.incoming,
      (message) => message.type === "room_state" && message.roomId === created.roomId
    );
    assert.equal(JSON.stringify(lobbyState).includes(created.resumeToken), false);
    assert.equal(lobbyState.phase, "lobby");

    red.ws.close();
    await once(red.ws, "close");
    const resumedLobby = connect(port);
    await once(resumedLobby.ws, "open");
    resumedLobby.ws.send(JSON.stringify({
      type: "room_join",
      roomId: created.roomId,
      resumeToken: created.resumeToken,
    }));
    const restored = await waitFor(resumedLobby.incoming, (message) => message.type === "room_welcome");
    assert.equal(restored.seat, 1);
    assert.equal(restored.team, "red");
    assert.equal(restored.started, false);
    assert.equal(restored.resumeToken, created.resumeToken);

    bot.ws.send(JSON.stringify({ type: "room_join", roomId: created.roomId }));
    const joined = await waitFor(bot.incoming, (message) => message.type === "room_welcome");
    assert.equal(joined.seat, 2);
    assert.equal(joined.team, "bot");
    assert.equal(joined.started, true);
    assert.notEqual(joined.resumeToken, restored.resumeToken);
    const started = await waitFor(
      resumedLobby.incoming,
      (message) => message.type === "room_state" && message.phase === "match" && message.mapSeed
    );
    assert.equal(started.roomId, created.roomId);
    assert.equal(JSON.stringify(started).includes(restored.resumeToken), false);
    assert.equal(started.seats[0].team, "red");
    assert.equal(started.seats[1].team, "bot");

    const redState = await waitFor(
      resumedLobby.incoming,
      (message) => message.type === "state" && message.fog?.team === "red"
    );
    const botState = await waitFor(
      bot.incoming,
      (message) => message.type === "state" && message.fog?.team === "bot"
    );
    assert.equal(redState.fog.team, "red");
    assert.equal(botState.fog.team, "bot");
    assert.equal(redState.players.some((player) => player.kind === "human"), false);
    assert.equal(botState.players.some((player) => player.kind === "human"), false);

    const full = connect(port);
    await once(full.ws, "open");
    full.ws.send(JSON.stringify({ type: "room_join", roomId: created.roomId }));
    const rejected = await waitFor(full.incoming, (message) => message.type === "room_error");
    assert.equal(rejected.error, "room_full");

    const bad = connect(port);
    await once(bad.ws, "open");
    bad.ws.send(JSON.stringify({ type: "room_join", roomId: "ZZZZ" }));
    const invalid = await waitFor(bad.incoming, (message) => message.type === "room_error");
    assert.equal(invalid.error, "invalid_room");

    resumedLobby.ws.close();
    await once(resumedLobby.ws, "close");
    const resumedMatch = connect(port);
    await once(resumedMatch.ws, "open");
    resumedMatch.ws.send(JSON.stringify({
      type: "room_join",
      roomId: created.roomId,
      resumeToken: created.resumeToken,
    }));
    const back = await waitFor(resumedMatch.incoming, (message) => message.type === "room_welcome");
    assert.equal(back.seat, 1);
    assert.equal(back.team, "red");
    assert.equal(back.started, false);
    assert.equal(back.mapSeed, started.mapSeed);

    const otherRed = connect(port);
    const otherBot = connect(port);
    await Promise.all([once(otherRed.ws, "open"), once(otherBot.ws, "open")]);
    otherRed.ws.send(JSON.stringify({ type: "room_create" }));
    const otherCreated = await waitFor(otherRed.incoming, (message) => message.type === "room_welcome");
    otherBot.ws.send(JSON.stringify({ type: "room_join", roomId: otherCreated.roomId }));
    const otherJoined = await waitFor(otherBot.incoming, (message) => message.type === "room_welcome");
    assert.equal(otherJoined.started, true);
    assert.equal(otherJoined.team, "bot");
    const otherState = await waitFor(
      otherRed.incoming,
      (message) => message.type === "room_state" && message.phase === "match" && message.mapSeed
    );
    assert.notEqual(otherCreated.roomId, created.roomId);
    assert.notEqual(otherState.mapSeed, started.mapSeed);

    resumedMatch.ws.send(JSON.stringify({
      type: "command",
      seq: 1,
      order: "scout",
      unitIds: ["auto-red-0"],
      target: { x: 10, y: 10 },
    }));
    const ack = await waitFor(resumedMatch.incoming, (message) => message.type === "command_ack");
    assert.equal(ack.seq, 1);
    assert.equal(ack.view.budget.current, 5);
    const ownView = await waitFor(
      resumedMatch.incoming,
      (message) => message.type === "command_view" && message.budget?.current === 5
    );
    assert.equal(ownView.budget.current, 5);
    await waitFor(
      otherRed.incoming,
      (message) => message.type === "command_view" && message.budget?.current === 6
    );
    const otherView = latest(otherRed.incoming, (message) => message.type === "command_view");
    assert.equal(otherView.budget.current, 6);

    for (const client of [bot, full, bad, resumedMatch, otherRed, otherBot]) client.ws.close();
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
});
