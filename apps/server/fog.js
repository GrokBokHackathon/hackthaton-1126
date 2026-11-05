// Team fog. Positions stay in tile units (the same x/y as the rest of the match).
// Masks are row-major: index = y * width + x, one byte per tile, 0 or 1.
// encoding name: "row-major-u8". Explored sticks until resetFog. Visible is current.
// Walls (1) and bushes (3) block sight. The blocking tile itself is visible; beyond it is not.
// Distance is Euclidean from the unit position to the tile center, radius inclusive.

export const MASK_ENCODING = "row-major-u8";

export function resetFog(match) {
  const cells = match.map.width * match.map.height;
  match.fogMemory = {
    red: new Uint8Array(cells),
    bot: new Uint8Array(cells),
  };
}

export function seesTile(tiles, x0, y0, x1, y1, blockers) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (x !== x1 || y !== y1) {
    const doubled = 2 * err;
    if (doubled > -dy) {
      err -= dy;
      x += sx;
    }
    if (doubled < dx) {
      err += dx;
      y += sy;
    }
    if (x === x1 && y === y1) return true;
    const tile = tiles[y]?.[x];
    if (tile === undefined || blockers.includes(tile)) return false;
  }
  return true;
}

export function visibleMask(tiles, viewers, radius, blockers) {
  const height = tiles.length;
  const width = tiles[0].length;
  const mask = new Uint8Array(width * height);
  for (const origin of viewers) {
    const ox = Math.floor(origin.x);
    const oy = Math.floor(origin.y);
    const minX = Math.max(0, Math.floor(origin.x - radius));
    const maxX = Math.min(width - 1, Math.ceil(origin.x + radius));
    const minY = Math.max(0, Math.floor(origin.y - radius));
    const maxY = Math.min(height - 1, Math.ceil(origin.y + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (Math.hypot(x + 0.5 - origin.x, y + 0.5 - origin.y) > radius) continue;
        if (!seesTile(tiles, ox, oy, x, y, blockers)) continue;
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

function viewersFor(match, team) {
  const viewers = [];
  for (const player of match.players.values()) {
    if (player.team === team && player.state !== "tagged") viewers.push(player);
  }
  return viewers;
}

export function refreshFog(match, radius, blockers) {
  if (!match.fogMemory) resetFog(match);
  const visible = {};
  for (const team of ["red", "bot"]) {
    const mask = visibleMask(match.map.tiles, viewersFor(match, team), radius, blockers);
    const explored = match.fogMemory[team];
    if (explored.length !== mask.length) {
      resetFog(match);
      return refreshFog(match, radius, blockers);
    }
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) explored[i] = 1;
    }
    visible[team] = mask;
  }
  match.fogVisible = visible;
  return visible;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function tileVisible(mask, width, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0) return false;
  return mask[ty * width + tx] === 1;
}

function flagView(match, team, flagTeam, mask) {
  const flag = match.flags[flagTeam];
  const width = match.map.width;
  const carrier = flag.carrier ? match.players.get(flag.carrier) : null;
  const friendlyCarrier = carrier && carrier.team === team;
  const seenTile = tileVisible(mask, width, flag.x, flag.y);
  const seenCarrier = carrier && (friendlyCarrier || tileVisible(mask, width, carrier.x, carrier.y));
  const ownFlagAtHome = flagTeam === team && !carrier;
  if (seenTile || seenCarrier || ownFlagAtHome) {
    return {
      x: round2(flag.x),
      y: round2(flag.y),
      carrier: carrier && !seenCarrier ? null : flag.carrier,
      hidden: false,
    };
  }
  return { hidden: true };
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    kind: player.kind,
    x: round2(player.x),
    y: round2(player.y),
    dir: player.dir,
    hasFlag: player.hasFlag,
    state: player.state,
  };
}

export function clientSnapshot(match, team, radius, blockers) {
  const visible = refreshFog(match, radius, blockers);
  const mask = visible[team];
  const width = match.map.width;
  const players = [];
  for (const player of match.players.values()) {
    if (player.team === team || tileVisible(mask, width, player.x, player.y)) {
      players.push(publicPlayer(player));
    }
  }
  return {
    type: "state",
    tick: match.tickCount,
    phase: match.phase,
    players,
    flags: {
      red: flagView(match, team, "red", mask),
      bot: flagView(match, team, "bot", mask),
    },
    score: { ...match.score },
    fog: {
      team,
      width,
      height: match.map.height,
      encoding: MASK_ENCODING,
      explored: Array.from(match.fogMemory[team]),
      visible: Array.from(mask),
    },
  };
}

// Fog check only. Does not price an order or change the match.
// "scout" may target an unexplored tile. "tag" needs a tile that is visible now.
export function assessOrderTarget(fog, order, target) {
  if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y)) {
    return { ok: false, reason: "invalid_target" };
  }
  if (target.x < 0 || target.y < 0 || target.x >= fog.width || target.y >= fog.height) {
    return { ok: false, reason: "invalid_target" };
  }
  const index = target.y * fog.width + target.x;
  const explored = fog.explored[index] === 1;
  const visible = fog.visible[index] === 1;
  if (order === "tag" && !visible) return { ok: false, reason: "target_not_visible" };
  if (order !== "scout" && !explored) return { ok: false, reason: "target_not_explored" };
  return { ok: true };
}
