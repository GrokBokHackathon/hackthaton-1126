/**
 * Visual bridge from the live protocol tile ids to art-pack frame names.
 * Collision, tree slowdown, and foot bounds are not decided here.
 *
 * Sources checked in this repo:
 * - apps/server/game.js: FLOOR 0, WALL 1, CRATE 2, BUSH 3. No tree id.
 * - docs/PROTOCOL.md: the same four codes.
 * - apps/web/assets/atlas.json: grouped frames. char.meta.pivot is [16, 30].
 *   tiles, tiles2, and fx have no pivot field. The word "foot" does not appear.
 *   tree is a 64x64 frame in tiles2 and is not a protocol id.
 * - docs/art/sprite-spec.md: placement notes (top-left tiles, character pivot).
 *   Those notes are not atlas metadata and are not a server collision box.
 */

export const PROTOCOL_TILE = Object.freeze({
  floor: 0,
  wall: 1,
  crate: 2,
  bush: 3,
});

/** Art frame for protocol crate 2. The pack names it crate_beer, not tile_crate. */
export const CRATE_FRAME = "crate_beer";

/** Art frame for protocol bush 3. This is not the tiles2 tree frame. */
export const BUSH_FRAME = "bush";

export const GRASS_FRAMES = Object.freeze(["grass_a", "grass_b"]);

export const TREE_ART = Object.freeze({
  frame: "tree",
  group: "tiles2",
  image: "tiles2_placeholder.png",
  x: 0,
  y: 96,
  w: 64,
  h: 64,
  protocolTileId: null,
  atlasPivot: null,
  footBounds: null,
});

/** Present only on char.meta in atlas.json. Rendering anchor, not a hitbox. */
export const CHAR_ATLAS_PIVOT = Object.freeze({ x: 16, y: 30 });

/** The atlas and the server contain no foot-bounds field. */
export const FOOT_BOUNDS = null;

export const ART_RUN_FRAME_MS = 150;
export const ART_CARRY_FRAME_MS = 150;
export const ART_DIZZY_FRAME_MS = 60;

export function grassFrame(tileX, tileY) {
  return (tileX + tileY) % 2 === 0 ? "grass_a" : "grass_b";
}

/**
 * Wall frame index. Out of the map counts as wall, matching sprite-spec's
 * autotile note. This chooses a picture only. The server still decides blocking.
 */
export function wallFrameName(tiles, x, y) {
  const height = tiles.length;
  const width = tiles[0].length;
  const wall = (tx, ty) => {
    if (ty < 0 || tx < 0 || ty >= height || tx >= width) return true;
    return tiles[ty][tx] === PROTOCOL_TILE.wall;
  };
  const mask = (wall(x, y - 1) ? 1 : 0)
    | (wall(x + 1, y) ? 2 : 0)
    | (wall(x, y + 1) ? 4 : 0)
    | (wall(x - 1, y) ? 8 : 0);
  return `wall_${String(mask).padStart(2, "0")}`;
}

/** @returns {string|null} frame name, or null when this protocol id has no supplied frame */
export function terrainFrameName(tile, tileX, tileY, tiles) {
  if (tile === PROTOCOL_TILE.floor) return grassFrame(tileX, tileY);
  if (tile === PROTOCOL_TILE.wall) return wallFrameName(tiles, tileX, tileY);
  if (tile === PROTOCOL_TILE.crate) return CRATE_FRAME;
  if (tile === PROTOCOL_TILE.bush) return BUSH_FRAME;
  return null;
}

export function characterFrameName(player, nowMs) {
  const dir = player && ["down", "left", "right", "up"].includes(player.dir) ? player.dir : "down";
  const time = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
  if (!player) return "char_down_idle";
  if (player.state === "carrying" || player.hasFlag) {
    return Math.floor(time / ART_CARRY_FRAME_MS) % 2 === 0 ? "char_carry_0" : "char_carry_1";
  }
  if (player.state === "tagged") {
    return `char_dizzy_${Math.floor(time / ART_DIZZY_FRAME_MS) % 3}`;
  }
  if (player.state === "running") {
    return `char_${dir}_run${(Math.floor(time / ART_RUN_FRAME_MS) % 2) + 1}`;
  }
  return `char_${dir}_idle`;
}

/**
 * Pivot stored on the atlas group that owns this frame.
 * Returns null when the group has no pivot field. Does not invent a center pivot.
 */
export function atlasPivotForFrame(atlas, frameName) {
  if (!atlas || !frameName) return null;
  for (const group of Object.values(atlas)) {
    if (!group?.frames?.[frameName]) continue;
    const pivot = group.meta && group.meta.pivot;
    if (Array.isArray(pivot) && pivot.length === 2 && pivot.every(Number.isFinite)) {
      return { x: pivot[0], y: pivot[1] };
    }
    return null;
  }
  return null;
}

/** Tile pictures sit on the cell's top-left. No tile pivot exists in atlas.json. */
export function terrainDestRect(tileX, tileY, frameW, frameH, tileSize = 32) {
  return { x: tileX * tileSize, y: tileY * tileSize, w: frameW, h: frameH };
}

/**
 * Character top-left from the pack pivot. Returns null when pivot is absent
 * so the caller does not substitute a rectangle center.
 */
export function characterDestRect(unitX, unitY, frameW, frameH, pivot, tileSize = 32) {
  if (!pivot || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) return null;
  return {
    x: unitX * tileSize - pivot.x,
    y: unitY * tileSize - pivot.y,
    w: frameW,
    h: frameH,
  };
}

export function drawLoadedFrame(ctx, loader, frameName, dest, team = null) {
  if (!ctx || !loader || !dest || typeof loader.getSprite !== "function") {
    return { drawn: false, frameName, reason: "missing-args" };
  }
  const sprite = loader.getSprite(frameName, team);
  if (!sprite || !sprite.image) return { drawn: false, frameName, reason: "frame-absent" };
  ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h, dest.x, dest.y, sprite.w, sprite.h);
  return {
    drawn: true,
    frameName,
    team,
    w: sprite.w,
    h: sprite.h,
    destX: dest.x,
    destY: dest.y,
  };
}
