import assert from "node:assert/strict";
import test from "node:test";
import { spawnSquad } from "./autopilot.js";
import { applyCommand } from "./commands.js";
import { CONFIG, Match } from "./game.js";

function scoreThree(match, player) {
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
}

test("a connected commander and the squads survive results and can order again", () => {
  const match = new Match();
  spawnSquad(match, 3);
  const commander = match.addPlayer("p1", "Ada", "human");
  const ids = [...match.players.keys()].sort();
  const roles = [...match.players.values()]
    .filter((player) => player.autopilot)
    .map((player) => `${player.id}:${player.role}`)
    .sort();
  match.economy.red.cp = 10;
  const beer = applyCommand(match, "red", { type: "command", seq: 1, order: "beer" }, {
    explored: Array(match.map.width * match.map.height).fill(1),
    visible: Array(match.map.width * match.map.height).fill(1),
  });
  assert.equal(beer.type, "command_ack");
  assert.equal(match.economy.red.beerUsed, true);
  const far = match.map.width * match.map.height - 2;
  match.fogMemory.red[far] = 1;
  const firstSeed = match.map.seed;

  scoreThree(match, commander);
  assert.equal(match.phase, "results");
  assert.equal(match.score.red, 3);
  assert.equal(match.players.get("p1").id, "p1");

  match.nowMs = match.resultsEndsAtMs;
  const events = match.tick(0);
  assert.ok(events.some((event) => event.type === "newMap"));
  assert.notEqual(match.map.seed, firstSeed);
  assert.equal(match.phase, "playing");
  assert.equal(match.roundId, 2);
  assert.equal(match.score.red, 0);
  assert.deepEqual([...match.players.keys()].sort(), ids);
  assert.deepEqual(
    [...match.players.values()].filter((player) => player.autopilot).map((player) => `${player.id}:${player.role}`).sort(),
    roles
  );
  assert.equal(match.economy.red.cp, 6);
  assert.equal(match.economy.red.ordersUsed, 0);
  assert.equal(match.economy.red.beerUsed, false);
  assert.equal(match.fogMemory.red[far], 0);

  const runner = [...match.players.values()].find((player) => player.team === "red" && player.role === "runner");
  const again = applyCommand(match, "red", {
    type: "command",
    seq: 1,
    order: "rally",
    unitIds: [runner.id],
    target: { x: 8, y: 8 },
  }, {
    explored: Array(match.map.width * match.map.height).fill(1),
    visible: Array(match.map.width * match.map.height).fill(1),
  });
  assert.equal(again.type, "command_ack");
  assert.deepEqual(runner.order.target, { x: 8, y: 8 });
});

test("a lead at 6:00 wins and a tie goes to sudden death", () => {
  const match = new Match();
  const player = match.addPlayer("p1", "Ada", "human");
  player.x = match.map.bases.bot.x;
  player.y = match.map.bases.bot.y;
  match.flags.bot.x = player.x;
  match.flags.bot.y = player.y;
  match.tick(0.05);
  player.x = match.map.bases.red.x;
  player.y = match.map.bases.red.y;
  match.tick(0.05);
  assert.equal(match.score.red, 1);
  match.nowMs = match.lifecycle.snapshot().roundEndsAtMs;
  const expired = match.tick(0);
  assert.equal(match.phase, "results");
  assert.equal(match.winner, "red");
  assert.equal(expired.find((event) => event.type === "matchEnd").winReason, "time");

  const tied = new Match();
  tied.addPlayer("p1", "Ada", "human");
  tied.nowMs = tied.lifecycle.snapshot().roundEndsAtMs;
  tied.tick(0);
  assert.equal(tied.phase, "sudden_death");
  assert.equal(tied.remainingMs, null);
  const scorer = tied.players.get("p1");
  scorer.x = tied.map.bases.bot.x;
  scorer.y = tied.map.bases.bot.y;
  tied.flags.bot.x = scorer.x;
  tied.flags.bot.y = scorer.y;
  tied.tick(0.05);
  scorer.x = tied.map.bases.red.x;
  scorer.y = tied.map.bases.red.y;
  const won = tied.tick(0.05);
  assert.equal(tied.phase, "results");
  assert.equal(tied.winner, "red");
  assert.equal(won.find((event) => event.type === "matchEnd").winReason, "sudden_death");
});

test("clientStateFor broadcasts phase, winner, and remainingMs in results and sudden_death", () => {
  const match = new Match();
  const player = match.addPlayer("p1", "Ada", "human");
  
  scoreThree(match, player);
  assert.equal(match.phase, "results");
  
  const resultState = match.clientStateFor("red");
  assert.equal(resultState.phase, "results");
  assert.equal(resultState.winner, "red");
  assert.equal(resultState.winReason, "captures");
  assert.equal(resultState.roundId, 1);
  assert.ok(resultState.remainingMs > 0);
  
  const tied = new Match();
  const scorer = tied.addPlayer("p2", "Bob", "human");
  tied.nowMs = tied.lifecycle.snapshot().roundEndsAtMs;
  tied.tick(0);
  assert.equal(tied.phase, "sudden_death");
  
  const suddenDeathState = tied.clientStateFor("red");
  assert.equal(suddenDeathState.phase, "sudden_death");
  assert.equal(suddenDeathState.remainingMs, null);
  assert.equal(suddenDeathState.roundId, 1);
});
