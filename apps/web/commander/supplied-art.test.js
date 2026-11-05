import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { atlasImagePaths } from "../spriteLoader.js";
import {
  BUSH_FRAME,
  CHAR_ATLAS_PIVOT,
  CRATE_FRAME,
  FOOT_BOUNDS,
  TREE_ART,
  atlasPivotForFrame,
  characterDestRect,
  characterFrameName,
  drawLoadedFrame,
  terrainDestRect,
  terrainFrameName,
} from "./supplied-art.js";

const atlas = JSON.parse(fs.readFileSync(new URL("../assets/atlas.json", import.meta.url), "utf8"));

test("the loader expands char_{team} sheets instead of fetching the template name", () => {
  const paths = atlasImagePaths(atlas);
  assert.ok(paths.includes("char_red_sheet_placeholder.png"));
  assert.ok(paths.includes("char_bot_sheet_placeholder.png"));
  assert.ok(paths.includes("char_mask_sheet_placeholder.png"));
  assert.equal(paths.includes("char_{team}_sheet_placeholder.png"), false);
  assert.ok(paths.includes("tiles_placeholder.png"));
  assert.ok(paths.includes("tiles2_placeholder.png"));
});

test("character pivot is the pack field and foot bounds are absent", () => {
  assert.deepEqual(atlas.char.meta.pivot, [16, 30]);
  assert.equal(CHAR_ATLAS_PIVOT.x, 16);
  assert.equal(CHAR_ATLAS_PIVOT.y, 30);
  assert.equal(FOOT_BOUNDS, null);
  assert.equal(atlas.tiles.meta.pivot, undefined);
  assert.equal(atlas.tiles2.meta.pivot, undefined);
  assert.equal(atlas.fx.meta.pivot, undefined);
  assert.equal(JSON.stringify(atlas).includes("foot"), false);
  assert.deepEqual(atlasPivotForFrame(atlas, "char_down_idle"), { x: 16, y: 30 });
  assert.equal(atlasPivotForFrame(atlas, "bush"), null);
  assert.equal(atlasPivotForFrame(atlas, "tree"), null);
});

test("protocol tiles map onto supplied frames and tree has no id", () => {
  const tiles = [
    [1, 1, 1],
    [1, 0, 3],
    [1, 2, 1],
  ];
  assert.equal(terrainFrameName(0, 1, 1, tiles), "grass_a");
  assert.equal(terrainFrameName(0, 2, 1, tiles), "grass_b");
  assert.equal(terrainFrameName(3, 2, 1, tiles), BUSH_FRAME);
  assert.equal(terrainFrameName(2, 1, 2, tiles), CRATE_FRAME);
  assert.equal(terrainFrameName(1, 0, 0, tiles), "wall_15");
  assert.equal(terrainFrameName(9, 0, 0, tiles), null);
  for (const name of ["grass_a", "grass_b", "bush", "crate_beer", "wall_00", "wall_15"]) {
    assert.ok(atlas.tiles.frames[name], name);
  }
  assert.deepEqual(atlas.tiles2.frames.tree, { x: 0, y: 96, w: 64, h: 64 });
  assert.equal(TREE_ART.protocolTileId, null);
  assert.equal(TREE_ART.atlasPivot, null);
  assert.equal(TREE_ART.footBounds, null);
  assert.equal(terrainFrameName(0, 0, 0, [[0]]).includes("tree"), false);
});

test("draw size stays the frame size and character placement uses only a real pivot", () => {
  const idle = characterFrameName({ dir: "down", state: "idle", hasFlag: false }, 0);
  assert.equal(idle, "char_down_idle");
  assert.equal(characterDestRect(4, 5, 32, 32, null), null);
  assert.deepEqual(characterDestRect(4, 5, 32, 32, CHAR_ATLAS_PIVOT), {
    x: 4 * 32 - 16,
    y: 5 * 32 - 30,
    w: 32,
    h: 32,
  });
  assert.deepEqual(terrainDestRect(3, 8, 32, 32), { x: 96, y: 256, w: 32, h: 32 });
  assert.deepEqual(terrainDestRect(1, 1, 64, 64), { x: 32, y: 32, w: 64, h: 64 });

  const calls = [];
  const ctx = { drawImage: (...args) => calls.push(args) };
  const loader = {
    atlas,
    getSprite(name) {
      if (name !== "bush") return null;
      return { image: { id: "tiles" }, x: 96, y: 0, w: 32, h: 32, pivot: [16, 16] };
    },
  };
  const dest = terrainDestRect(2, 3, 32, 32);
  const drawn = drawLoadedFrame(ctx, loader, "bush", dest);
  assert.equal(drawn.drawn, true);
  assert.deepEqual(calls[0].slice(1), [96, 0, 32, 32, dest.x, dest.y, 32, 32]);
  assert.equal(drawLoadedFrame(ctx, loader, "tree", dest).drawn, false);
});
