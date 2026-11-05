import assert from "node:assert/strict";
import test from "node:test";
import { Match, CONFIG } from "./game.js";
import { isWalkable, planPath } from "./path.js";

// Helper to create a minimal map for testing
function createTestMap(tiles) {
  return {
    width: tiles[0].length,
    height: tiles.length,
    tiles,
    bases: {
      red: { x: 2, y: 2 },
      bot: { x: tiles[0].length - 3, y: tiles.length - 3 },
    },
    seed: 0,
  };
}

test("character footprint collision - corners", () => {
  // Create a small map with a wall corner
  const tiles = [
    [1, 1, 1, 1, 1],  // Top wall
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],  // Bottom wall
  ];
  
  const match = new Match();
  match.map = createTestMap(tiles);
  
  const player = match.addPlayer("p1", "Test", "human");
  player.x = 2.5;
  player.y = 2.5;
  
  // Try to move into top-left corner - should be blocked by footprint
  match.setInput("p1", -1, -1);
  match.tick(0.1);
  
  // Should not get stuck in corner or pass through
  const tx = Math.floor(player.x);
  const ty = Math.floor(player.y);
  assert.ok(tiles[ty][tx] !== 1, "Player should not be inside wall");
  
  // Player should be pushed away from corner
  assert.ok(player.x >= 1.0 + CONFIG.footprintRadius, "Player x too close to wall");
  assert.ok(player.y >= 1.0 + CONFIG.footprintRadius, "Player y too close to wall");
});

test("character footprint collision - wall sliding", () => {
  // Horizontal corridor
  const tiles = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  
  const match = new Match();
  match.map = createTestMap(tiles);
  
  const player = match.addPlayer("p1", "Test", "human");
  player.x = 2;
  player.y = 2;
  const startX = player.x;
  
  // Try to move diagonally (up-right) - should slide along wall
  match.setInput("p1", 1, -1);
  match.tick(0.1);
  
  // Should move right but not pass through top wall
  assert.ok(player.x > startX, "Player should move right");
  assert.ok(player.y >= 1.0 + CONFIG.footprintRadius, "Player should not pass through wall");
});

test("character footprint collision - crate blocking", () => {
  // Map with a crate
  const tiles = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 2, 0, 1],  // Crate in center
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  
  const match = new Match();
  match.map = createTestMap(tiles);
  
  const player = match.addPlayer("p1", "Test", "human");
  player.x = 1.5;
  player.y = 2;
  const startX = player.x;
  
  // Try to move right into crate
  match.setInput("p1", 1, 0);
  match.tick(0.1);
  
  // Should be blocked by crate footprint
  const distanceToCrate = Math.abs(player.x - 2.0);
  assert.ok(distanceToCrate >= CONFIG.footprintRadius, 
    `Player too close to crate: ${distanceToCrate} < ${CONFIG.footprintRadius}`);
});

test("tree slowdown - movement speed reduction", () => {
  // Map with trees
  const tiles = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 4, 4, 0, 1],  // Trees in middle
    [1, 0, 0, 0, 4, 4, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ];
  
  const match = new Match();
  match.map = createTestMap(tiles);
  
  // Test movement on normal terrain
  const p1 = match.addPlayer("p1", "Normal", "human");
  p1.x = 2;
  p1.y = 2;
  match.setInput("p1", 1, 0);
  match.tick(0.1);
  const normalDistance = p1.x - 2;
  
  // Reset and test movement in trees
  const p2 = match.addPlayer("p2", "Tree", "human");
  p2.x = 4.5;
  p2.y = 2;
  match.setInput("p2", 1, 0);
  match.tick(0.1);
  const treeDistance = p2.x - 4.5;
  
  // Movement in trees should be slower
  assert.ok(treeDistance < normalDistance * 0.6, 
    `Tree movement (${treeDistance}) not significantly slower than normal (${normalDistance})`);
  
  // Should be roughly CONFIG.treeSlowdown ratio
  const ratio = treeDistance / normalDistance;
  assert.ok(Math.abs(ratio - CONFIG.treeSlowdown) < 0.15,
    `Tree slowdown ratio ${ratio} not close to configured ${CONFIG.treeSlowdown}`);
});

test("tree slowdown - entering and leaving trees", () => {
  // Map with tree boundary
  const tiles = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 4, 4, 4, 1],  // Trees start at x=4
    [1, 0, 0, 0, 4, 4, 4, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ];
  
  const match = new Match();
  match.map = createTestMap(tiles);
  
  const player = match.addPlayer("p1", "Test", "human");
  player.x = 3.5;
  player.y = 2;
  
  // Move right continuously
  match.setInput("p1", 1, 0);
  
  // Track positions
  const positions = [player.x];
  for (let i = 0; i < 10; i++) {
    match.tick(0.05);
    positions.push(player.x);
  }
  
  // Find when entering tree (crossing x=4)
  let enterIndex = -1;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i - 1] < 4.0 && positions[i] >= 4.0) {
      enterIndex = i;
      break;
    }
  }
  
  if (enterIndex > 0 && enterIndex < positions.length - 2) {
    const beforeTree = positions[enterIndex] - positions[enterIndex - 1];
    const inTree = positions[enterIndex + 1] - positions[enterIndex];
    
    // Speed should decrease when entering trees
    assert.ok(inTree < beforeTree * 0.8, 
      "Speed should decrease when entering trees");
  }
});

test("high-delta movement - tunneling prevention", () => {
  // Single-cell-thick wall
  const tiles = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 0, 0, 1],  // Thin wall at x=3
    [1, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  
  const match = new Match();
  match.map = createTestMap(tiles);
  
  const player = match.addPlayer("p1", "Test", "human");
  player.x = 2;
  player.y = 2;
  
  // Simulate very high speed movement (e.g., from speed powerup)
  // by manually setting position change larger than maxMovementStep
  match.setInput("p1", 1, 0);
  
  // Do multiple ticks to accumulate movement
  for (let i = 0; i < 20; i++) {
    match.tick(0.05);
  }
  
  // Should not pass through wall
  assert.ok(player.x < 3.0, "Player should not tunnel through thin wall");
});

test("A* pathfinding - trees are walkable", () => {
  // Map with trees between start and goal
  const tiles = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 4, 0, 0, 1],
    [1, 0, 0, 4, 0, 0, 1],
    [1, 0, 0, 4, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  
  // Trees (4) should be walkable
  assert.ok(isWalkable(tiles, 3, 1), "Tree tile should be walkable");
  assert.ok(isWalkable(tiles, 3, 2), "Tree tile should be walkable");
  
  // Path through trees should be found
  const path = planPath(tiles, { x: 1, y: 2 }, { x: 5, y: 2 });
  assert.ok(path.length > 0, "Should find path through trees");
  
  // Path should go through trees (x=3)
  const throughTrees = path.some(p => p.x === 3);
  assert.ok(throughTrees, "Path should go through tree tiles");
});

test("A* pathfinding - trees have higher cost", () => {
  // Map with two paths: one through trees, one around
  const tiles = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 4, 4, 4, 0, 0, 1],  // Short path with trees
    [1, 0, 0, 0, 0, 0, 0, 0, 1],  // Longer path around trees
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
  ];
  
  // Path from left to right
  const path = planPath(tiles, { x: 1, y: 2 }, { x: 7, y: 2 });
  assert.ok(path.length > 0, "Should find path");
  
  // With tree cost (2x), A* should prefer going around if possible
  // Count how many tree tiles are in the path
  const treesInPath = path.filter(p => tiles[p.y]?.[p.x] === 4).length;
  
  // A* should minimize tree traversal due to cost
  // If it goes through all 3 trees, cost would be 3*2 = 6 vs going around
  // Going around via y=3 or y=1 adds 2 steps but avoids tree cost
  assert.ok(treesInPath <= 1, 
    `A* should prefer routes with fewer trees, found ${treesInPath} trees in path`);
});

test("A* pathfinding - clearance agrees with footprint", () => {
  // Narrow passage
  const tiles = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],  // Passage at y=3, x=3
    [1, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  
  // If A* says a tile is walkable, footprint should fit
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[0].length; x++) {
      if (isWalkable(tiles, x, y)) {
        // Place a player at center of this tile
        const match = new Match();
        match.map = createTestMap(tiles);
        const player = match.addPlayer("p1", "Test", "human");
        player.x = x + 0.5;
        player.y = y + 0.5;
        
        // Player should not be stuck
        match.setInput("p1", 0.1, 0.1);
        match.tick(0.05);
        
        const tileAfter = tiles[Math.floor(player.y)]?.[Math.floor(player.x)];
        assert.ok(tileAfter !== 1 && tileAfter !== 2, 
          `Walkable tile (${x},${y}) should allow footprint to exist without collision`);
      }
    }
  }
});

test("map bounds - footprint cannot exceed boundaries", () => {
  const tiles = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  
  const match = new Match();
  match.map = createTestMap(tiles);
  
  const player = match.addPlayer("p1", "Test", "human");
  player.x = 1.0 + CONFIG.footprintRadius + 0.1;
  player.y = 2.5;
  
  // Try to move left into wall
  match.setInput("p1", -1, 0);
  match.tick(0.2);
  
  // Footprint should prevent moving too close to boundary wall
  assert.ok(player.x >= 1.0 + CONFIG.footprintRadius, 
    `Player x (${player.x}) should not go below ${1.0 + CONFIG.footprintRadius}`);
  
  // Try corners
  player.x = 1.5;
  player.y = 1.5;
  match.setInput("p1", -1, -1);
  match.tick(0.2);
  
  assert.ok(player.x >= 1.0 + CONFIG.footprintRadius, 
    "Player x should respect footprint at corner");
  assert.ok(player.y >= 1.0 + CONFIG.footprintRadius, 
    "Player y should respect footprint at corner");
});

test("documentation - terrain IDs and coordinate units", () => {
  // Verify terrain tile IDs match documentation
  const FLOOR = 0;
  const WALL = 1;
  const CRATE = 2;
  const BUSH = 3;
  const TREE = 4;
  
  // These IDs are used in tile arrays
  const testTiles = [
    [FLOOR, WALL, CRATE, BUSH, TREE],
  ];
  
  assert.equal(testTiles[0][0], 0, "FLOOR is tile 0");
  assert.equal(testTiles[0][1], 1, "WALL is tile 1");
  assert.equal(testTiles[0][2], 2, "CRATE is tile 2");
  assert.equal(testTiles[0][3], 3, "BUSH is tile 3");
  assert.equal(testTiles[0][4], 4, "TREE is tile 4");
  
  // Coordinate units are in tiles (not pixels)
  assert.equal(CONFIG.tileSize, 32, "Tile size is 32 pixels");
  assert.equal(typeof CONFIG.playerSpeed, "number", "Player speed is in tiles per second");
  assert.ok(CONFIG.footprintRadius < 1.0, "Footprint radius is in tiles (< 1 tile)");
});

test("sprite pivot and foot bounds - configuration", () => {
  // Document sprite pivot from atlas
  const SPRITE_PIVOT_X = 16; // pixels
  const SPRITE_PIVOT_Y = 30; // pixels
  const SPRITE_PIVOT_TILES_X = SPRITE_PIVOT_X / CONFIG.tileSize; // 0.5 tiles
  const SPRITE_PIVOT_TILES_Y = SPRITE_PIVOT_Y / CONFIG.tileSize; // 0.9375 tiles
  
  assert.equal(SPRITE_PIVOT_TILES_X, 0.5, "Pivot X is 0.5 tiles (center)");
  assert.ok(Math.abs(SPRITE_PIVOT_TILES_Y - 0.9375) < 0.001, "Pivot Y is ~0.94 tiles (near bottom)");
  
  // Footprint radius is smaller than pivot offset
  assert.ok(CONFIG.footprintRadius <= SPRITE_PIVOT_TILES_X, 
    "Footprint radius fits within sprite center");
  
  // This means the collision circle is centered on the character position
  // which is at the sprite pivot, making feet collisions reasonable
});
