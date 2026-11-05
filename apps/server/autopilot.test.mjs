import assert from "node:assert/strict";
import test from "node:test";
import { spawnSquad } from "./autopilot.js";
import { Match } from "./game.js";
import { isWalkable, planPath } from "./path.js";

function grid(rows) {
  return rows.map((row) => row.split("").map((cell) => ({ ".": 0, "#": 1, C: 2, B: 3 })[cell]));
}

test("pathfinding walks bushes, blocks walls and crates, and reaches the goal", () => {
  const tiles = grid([
    "#######",
    "#..#..#",
    "#..#B.#",
    "#..#C.#",
    "#.....#",
    "#######",
  ]);
  assert.equal(isWalkable(tiles, 4, 2), true);
  assert.equal(isWalkable(tiles, 3, 1), false);
  assert.equal(isWalkable(tiles, 4, 3), false);

  const throughBush = planPath(tiles, { x: 4, y: 1 }, { x: 4, y: 4 });
  assert.ok(throughBush.length > 1);
  assert.ok(throughBush.some((step) => tiles[step.y][step.x] === 3));
  assert.ok(throughBush.every((step) => isWalkable(tiles, step.x, step.y)));
  assert.deepEqual(throughBush.at(-1), { x: 4, y: 4 });

  const aroundWall = planPath(tiles, { x: 1, y: 1 }, { x: 5, y: 1 });
  assert.ok(aroundWall.length > 4);
  assert.ok(aroundWall.every((step) => tiles[step.y][step.x] !== 1 && tiles[step.y][step.x] !== 2));
  assert.deepEqual(aroundWall.at(-1), { x: 5, y: 1 });
});

test("a flag carrier paths home around an enemy within 4 tiles", () => {
  const tiles = Array.from({ length: 15 }, (_, y) =>
    Array.from({ length: 21 }, (_, x) => (x === 0 || y === 0 || x === 20 || y === 14 ? 1 : 0))
  );
  const enemy = { x: 10.5, y: 7.5 };
  const path = planPath(tiles, { x: 2, y: 7 }, { x: 18, y: 7 }, { avoid: [enemy], avoidRadius: 4 });
  assert.ok(path.length > 2);
  assert.deepEqual(path.at(-1), { x: 18, y: 7 });
  for (const step of path) {
    if (step.x === 2 || step.x === 18) continue;
    assert.ok(Math.hypot(step.x + 0.5 - enemy.x, step.y + 0.5 - enemy.y) > 4);
  }
});

test("squad is one runner, guard, and roamer per team", () => {
  const match = new Match();
  spawnSquad(match, 3);
  for (const team of ["red", "bot"]) {
    const roles = [...match.players.values()]
      .filter((player) => player.team === team)
      .map((player) => player.role)
      .sort();
    assert.deepEqual(roles, ["guard", "roamer", "runner"]);
  }
  assert.equal(match.players.size, 6);
});

test("match tick steers autopilot bots without an external input", () => {
  const match = new Match();
  spawnSquad(match, 3);
  match.phase = "playing";
  const runner = [...match.players.values()].find((player) => player.team === "red" && player.role === "runner");
  runner.dx = 0;
  runner.dy = 0;
  const startX = runner.x;
  const startY = runner.y;
  for (let i = 0; i < 30; i++) match.tick(0.05);
  const moved = Math.hypot(runner.x - startX, runner.y - startY);
  assert.ok(moved > 0.4, `expected the tick loop to move the runner, moved ${moved}`);
  assert.equal(runner.controller, "scripted-autopilot");
  assert.equal(runner.order.role, "runner");
});

test("a tagged bot respawns after 3s at base and keeps its last order", () => {
  const match = new Match();
  const human = match.addPlayer("human", "Ada", "human");
  const bot = match.addPlayer("bot", "Runner", "bot");
  bot.role = "runner";
  bot.order = { source: "role-default", role: "runner" };
  bot.x = 5;
  bot.y = match.map.height / 2 - 2;
  bot.hasFlag = true;
  bot.state = "idle";
  match.flags.red.carrier = bot.id;
  match.flags.red.x = bot.x;
  match.flags.red.y = bot.y;
  human.x = bot.x;
  human.y = bot.y;
  human.state = "idle";

  const before = Date.now();
  match.tick(0.05);
  assert.equal(bot.state, "tagged");
  assert.ok(!bot.hasFlag);
  const wait = bot.respawnTime - before;
  assert.ok(wait >= 2900 && wait <= 3200, `bot respawn wait ${wait}`);
  assert.equal(bot.order.role, "runner");

  bot.respawnTime = Date.now() - 1;
  match.tick(0.05);
  assert.equal(bot.state, "respawn");
  assert.equal(bot.order.source, "role-default");
  assert.ok(Math.hypot(bot.x - match.map.bases.bot.x, bot.y - match.map.bases.bot.y) < 0.2);
});

test("a tagged human still respawns after 2s", () => {
  const match = new Match();
  const human = match.addPlayer("human", "Ada", "human");
  const bot = match.addPlayer("bot", "Tagger", "bot");
  human.hasFlag = true;
  human.state = "idle";
  human.x = 10;
  human.y = match.map.height / 2 + 2;
  match.flags.bot.carrier = human.id;
  match.flags.bot.x = human.x;
  match.flags.bot.y = human.y;
  bot.x = human.x;
  bot.y = human.y;
  bot.state = "idle";
  const before = Date.now();
  match.tick(0.05);
  assert.equal(human.state, "tagged");
  const wait = human.respawnTime - before;
  assert.ok(wait >= 1900 && wait <= 2200, `human respawn wait ${wait}`);
});
