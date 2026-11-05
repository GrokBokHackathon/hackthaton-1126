// Tile pathfinding for autopilot. Coordinates are tile indexes.
// 0 floor, 3 bush, and 4 tree are walkable. 1 wall and 2 crate are not.
// Trees (4) slow movement but do not block pathfinding.

export function isWalkable(tiles, x, y) {
  if (!tiles.length || y < 0 || x < 0 || y >= tiles.length || x >= tiles[0].length) return false;
  const tile = tiles[y][x];
  // Walls (1) and crates (2) block movement
  // Floor (0), bush (3), and tree (4) are walkable
  return tile !== 1 && tile !== 2;
}

// Get movement cost multiplier for a tile (higher cost = slower movement)
// Trees have higher cost to reflect speed reduction
function getTileCost(tiles, x, y) {
  if (!tiles.length || y < 0 || x < 0 || y >= tiles.length || x >= tiles[0].length) return 1;
  const tile = tiles[y][x];
  // Tree tiles have 2x cost (reflecting 0.5x speed = 2x time to traverse)
  if (tile === 4) return 2;
  return 1;
}

export function nearestWalkable(tiles, x, y) {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (isWalkable(tiles, sx, sy)) return { x: sx, y: sy };
  const height = tiles.length;
  const width = tiles[0]?.length || 0;
  const seen = new Set([sy * width + sx]);
  const queue = [{ x: sx, y: sy }];
  while (queue.length) {
    const current = queue.shift();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = ny * width + nx;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isWalkable(tiles, nx, ny)) return { x: nx, y: ny };
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

function reconstruct(came, current, keyOf) {
  const path = [current];
  let cursor = keyOf(current.x, current.y);
  while (came.has(cursor)) {
    current = came.get(cursor);
    path.push(current);
    cursor = keyOf(current.x, current.y);
  }
  path.reverse();
  return path;
}

export function planPath(tiles, start, goal, options = {}) {
  if (!tiles.length || !tiles[0]?.length) return [];
  const width = tiles[0].length;
  const from = nearestWalkable(tiles, start.x, start.y);
  const to = nearestWalkable(tiles, goal.x, goal.y);
  if (!from || !to) return [];
  if (from.x === to.x && from.y === to.y) return [from];

  const avoid = options.avoid || [];
  const avoidRadius = options.avoidRadius || 0;
  const keyOf = (x, y) => y * width + x;
  const penalty = (x, y) => {
    if (!avoidRadius) return 0;
    const cx = x + 0.5;
    const cy = y + 0.5;
    for (const enemy of avoid) {
      if (Math.hypot(cx - enemy.x, cy - enemy.y) <= avoidRadius) return 50;
    }
    return 0;
  };

  const open = [from];
  const openKeys = new Set([keyOf(from.x, from.y)]);
  const gScore = new Map([[keyOf(from.x, from.y), 0]]);
  const fScore = new Map([[keyOf(from.x, from.y), Math.abs(from.x - to.x) + Math.abs(from.y - to.y)]]);
  const came = new Map();

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      const left = fScore.get(keyOf(open[i].x, open[i].y)) ?? Infinity;
      const right = fScore.get(keyOf(open[best].x, open[best].y)) ?? Infinity;
      if (left < right) best = i;
    }
    const current = open.splice(best, 1)[0];
    const currentKey = keyOf(current.x, current.y);
    openKeys.delete(currentKey);
    if (current.x === to.x && current.y === to.y) return reconstruct(came, current, keyOf);

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!isWalkable(tiles, nx, ny)) continue;
      const nextKey = keyOf(nx, ny);
      // Include tile cost (trees = 2x, normal = 1x) plus avoidance penalty
      const tileCost = getTileCost(tiles, nx, ny);
      const tentative = gScore.get(currentKey) + tileCost + penalty(nx, ny);
      if (tentative >= (gScore.get(nextKey) ?? Infinity)) continue;
      came.set(nextKey, current);
      gScore.set(nextKey, tentative);
      fScore.set(nextKey, tentative + Math.abs(nx - to.x) + Math.abs(ny - to.y));
      if (!openKeys.has(nextKey)) {
        open.push({ x: nx, y: ny });
        openKeys.add(nextKey);
      }
    }
  }
  return [];
}
