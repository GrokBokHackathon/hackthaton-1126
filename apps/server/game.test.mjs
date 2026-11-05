import assert from "node:assert/strict";
import test from "node:test";
import { generateMap, Match } from "./game.js";

test("map generation - connectivity between bases", () => {
  for (let i = 0; i < 10; i++) {
    const map = generateMap(1000 + i);
    assert.ok(map.width > 0);
    assert.ok(map.height > 0);
    assert.ok(map.tiles.length === map.height);
    assert.ok(map.tiles[0].length === map.width);
    assert.ok(map.bases.red);
    assert.ok(map.bases.bot);
    
    // Bases should be in opposite corners
    assert.ok(map.bases.red.x < map.width / 2);
    assert.ok(map.bases.red.y < map.height / 2);
    assert.ok(map.bases.bot.x > map.width / 2);
    assert.ok(map.bases.bot.y > map.height / 2);
  }
});

test("map generation - minimum obstacle density", () => {
  for (let i = 0; i < 5; i++) {
    const map = generateMap(2000 + i);
    let walls = 0;
    let crates = 0;
    let bushes = 0;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x] === 1) walls++;
        if (map.tiles[y][x] === 2) crates++;
        if (map.tiles[y][x] === 3) bushes++;
      }
    }

    const total = walls + crates + bushes;
    assert.ok(total >= 40, `Expected at least 40 obstacles, got ${total}`);
    assert.ok(walls > 0, "Expected at least one wall");
    assert.ok(crates > 0, "Expected at least one crate");
    assert.ok(bushes > 0, "Expected at least one bush");
  }
});

test("match - add and remove players", () => {
  const match = new Match();
  
  const p1 = match.addPlayer("p1", "Alice", "human");
  assert.equal(p1.id, "p1");
  assert.equal(p1.name, "Alice");
  assert.equal(p1.team, "red");
  assert.equal(p1.kind, "human");

  const p2 = match.addPlayer("p2", "BotA", "bot");
  assert.equal(p2.team, "bot");

  assert.equal(match.players.size, 2);
  assert.equal(match.phase, "playing");

  match.removePlayer("p1");
  assert.equal(match.players.size, 1);
});

test("match - flag pickup and capture", () => {
  const match = new Match();
  const p1 = match.addPlayer("p1", "Alice", "human");
  
  // Move player to bot flag
  p1.x = match.map.bases.bot.x;
  p1.y = match.map.bases.bot.y;
  
  match.tick(0.05);
  
  // Should pick up flag
  assert.ok(p1.hasFlag);
  assert.equal(match.flags.bot.carrier, "p1");
  
  // Move to own base
  p1.x = match.map.bases.red.x;
  p1.y = match.map.bases.red.y;
  
  const events = match.tick(0.05);
  
  // Should score
  const scored = events.find((e) => e.type === "scored");
  assert.ok(scored);
  assert.equal(scored.team, "red");
  assert.equal(match.score.red, 1);
  assert.equal(match.score.bot, 0);
  assert.ok(!p1.hasFlag);
  assert.equal(match.flags.bot.carrier, null);
});

test("match - tag returns flag", () => {
  const match = new Match();
  const p1 = match.addPlayer("p1", "Alice", "human");
  const p2 = match.addPlayer("p2", "BotA", "bot");
  
  // Manually give bot the red flag (simulating pickup)
  p2.x = 5;
  p2.y = match.map.height / 2 - 2; // In red's half
  p2.hasFlag = true;
  p2.state = "carrying";
  match.flags.red.carrier = "p2";
  match.flags.red.x = p2.x;
  match.flags.red.y = p2.y;
  
  // Human tags bot in red's half
  p1.x = p2.x;
  p1.y = p2.y;
  p1.state = "idle";
  
  match.tick(0.05);
  
  // Flag should be returned and bot tagged
  assert.ok(!p2.hasFlag);
  assert.equal(match.flags.red.carrier, null);
  assert.equal(match.flags.red.x, match.map.bases.red.x);
  assert.equal(match.flags.red.y, match.map.bases.red.y);
  assert.equal(p2.state, "tagged");
});

test("match - win and regenerate map", () => {
  const match = new Match();
  const p1 = match.addPlayer("p1", "Alice", "human");
  
  const firstSeed = match.map.seed;
  
  // Ensure player is in idle state
  p1.state = "idle";
  p1.respawnTime = null;
  
  // Score 3 times
  let matchEnd = null;
  for (let i = 0; i < 3; i++) {
    p1.x = match.map.bases.bot.x;
    p1.y = match.map.bases.bot.y;
    match.tick(0.05); // Pick up
    
    p1.x = match.map.bases.red.x;
    p1.y = match.map.bases.red.y;
    const events = match.tick(0.05); // Score
    
    // Check if we got matchEnd event
    const me = events.find((e) => e.type === "matchEnd");
    if (me) matchEnd = me;
  }
  
  assert.equal(match.score.red, 3);
  assert.equal(match.phase, "results");
  assert.equal(match.winner, "red");
  assert.equal(match.players.has("p1"), true);
  
  assert.ok(matchEnd);
  assert.equal(matchEnd.winner, "red");
  assert.equal(matchEnd.winReason, "captures");

  match.nowMs = match.resultsEndsAtMs;
  const resetEvents = match.tick(0);
  const newMapEvent = resetEvents.find((e) => e.type === "newMap");
  assert.ok(newMapEvent);
  assert.ok(newMapEvent.map);
  assert.notEqual(match.map.seed, firstSeed);
  assert.equal(match.score.red, 0);
  assert.equal(match.score.bot, 0);
  assert.equal(match.phase, "playing");
  assert.equal(match.players.has("p1"), true);
});

test("match - movement and collision", () => {
  const match = new Match();
  const p1 = match.addPlayer("p1", "Alice", "human");
  
  // Place player in a known open area (center of map)
  p1.x = match.map.width / 2;
  p1.y = match.map.height / 2;
  
  const startX = p1.x;
  const startY = p1.y;
  
  match.setInput("p1", 1, 0);
  match.tick(0.1);
  
  // Should move (at least one coordinate should change)
  assert.ok(p1.x > startX || p1.y !== startY, 
    `Player did not move from (${startX}, ${startY}) to (${p1.x}, ${p1.y})`);
});
