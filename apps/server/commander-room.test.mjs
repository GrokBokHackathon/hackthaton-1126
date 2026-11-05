import assert from "node:assert/strict";
import test from "node:test";
import { spawnSquad } from "./autopilot.js";
import { Match } from "./game.js";

function redRunner(match) {
  return [...match.players.values()].find((player) => player.team === "red" && player.role === "runner");
}

test("bots alone stay waiting and do not advance the clock", () => {
  const match = new Match();
  spawnSquad(match, 3);
  const runner = redRunner(match);
  const start = runner.x;
  for (let i = 0; i < 30; i++) match.tick(0.05);
  assert.equal(match.phase, "waiting");
  assert.equal(match.nowMs, 0);
  assert.equal(runner.x, start);
  assert.equal([...match.players.values()].some((player) => player.kind === "human"), false);
});

test("activateCommanderRoom runs the clock and bots without a human body", () => {
  const match = new Match();
  spawnSquad(match, 3);
  const runner = redRunner(match);
  const start = runner.x;
  const armed = match.activateCommanderRoom();
  assert.equal(armed.commanderRoom, true);
  assert.equal(armed.phase, "playing");
  for (let i = 0; i < 30; i++) match.tick(0.05);
  assert.equal(match.phase, "playing");
  assert.ok(match.nowMs >= 1500);
  assert.ok(Math.abs(runner.x - start) > 0.4);
  assert.equal([...match.players.values()].some((player) => player.kind === "human"), false);
});

test("removing a bot does not stall an activated commander room", () => {
  const match = new Match();
  spawnSquad(match, 3);
  match.activateCommanderRoom();
  const victim = [...match.players.values()].find((player) => player.team === "bot");
  match.removePlayer(victim.id);
  const before = match.nowMs;
  match.tick(0.05);
  assert.equal(match.phase, "playing");
  assert.ok(match.nowMs > before);
});

test("legacy human join still starts, and the last human body still pauses", () => {
  const match = new Match();
  spawnSquad(match, 3);
  assert.equal(match.phase, "waiting");
  const human = match.addPlayer("p1", "Ada", "human");
  assert.equal(match.phase, "playing");
  assert.equal(match.commanderRoom, false);
  match.tick(0.05);
  const moved = match.nowMs;
  match.removePlayer(human.id);
  assert.equal(match.phase, "waiting");
  match.tick(0.05);
  assert.equal(match.nowMs, moved);
});
