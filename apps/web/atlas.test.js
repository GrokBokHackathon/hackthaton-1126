import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Load atlas.json
const atlasPath = fileURLToPath(new URL("./assets/atlas.json", import.meta.url));
const atlas = JSON.parse(fs.readFileSync(atlasPath, "utf8"));

// Helper to check if a sprite key exists in the grouped atlas
function hasSprite(key) {
  for (const group of Object.values(atlas)) {
    if (group.frames && group.frames[key]) return true;
  }
  return false;
}

test("character sprites exist for all directions and states", () => {
  const directions = ["down", "left", "right", "up"];
  const states = ["idle", "run1", "run2"];
  
  for (const dir of directions) {
    for (const state of states) {
      const key = `char_${dir}_${state}`;
      assert.ok(hasSprite(key), `Missing character sprite: ${key}`);
    }
  }
  
  // Carrying sprites
  assert.ok(hasSprite("char_carry_0"), "Missing char_carry_0");
  assert.ok(hasSprite("char_carry_1"), "Missing char_carry_1");
  
  // Dizzy sprites (tagged/respawn)
  assert.ok(hasSprite("char_dizzy_0"), "Missing char_dizzy_0");
  assert.ok(hasSprite("char_dizzy_1"), "Missing char_dizzy_1");
  assert.ok(hasSprite("char_dizzy_2"), "Missing char_dizzy_2");
  
  // Taunt sprites (optional, but check if present)
  assert.ok(hasSprite("char_taunt_0"), "Missing char_taunt_0");
  assert.ok(hasSprite("char_taunt_1"), "Missing char_taunt_1");
});

test("tile sprites exist for grass, walls, crate, and bush", () => {
  // Grass variants
  assert.ok(hasSprite("grass_a"), "Missing grass_a");
  assert.ok(hasSprite("grass_b"), "Missing grass_b");
  
  // Crate and bush
  assert.ok(hasSprite("crate_beer"), "Missing crate_beer");
  assert.ok(hasSprite("bush"), "Missing bush");
  
  // Wall autotile (all 16 combinations, zero-padded)
  for (let i = 0; i < 16; i++) {
    const key = `wall_${i.toString().padStart(2, '0')}`;
    assert.ok(hasSprite(key), `Missing wall sprite: ${key}`);
  }
  
  // Base sprites
  assert.ok(hasSprite("base_red"), "Missing base_red");
  assert.ok(hasSprite("base_bot"), "Missing base_bot");
});

test("fx sprites exist for flags, respawn, and tag hit", () => {
  // Flag animations for both teams
  assert.ok(hasSprite("flag_red_0"), "Missing flag_red_0");
  assert.ok(hasSprite("flag_red_1"), "Missing flag_red_1");
  assert.ok(hasSprite("flag_bot_0"), "Missing flag_bot_0");
  assert.ok(hasSprite("flag_bot_1"), "Missing flag_bot_1");
  
  // Flag carried indicator
  assert.ok(hasSprite("flag_carried_indicator"), "Missing flag_carried_indicator");
  
  // Respawn effect (4 frames)
  assert.ok(hasSprite("respawn_0"), "Missing respawn_0");
  assert.ok(hasSprite("respawn_1"), "Missing respawn_1");
  assert.ok(hasSprite("respawn_2"), "Missing respawn_2");
  assert.ok(hasSprite("respawn_3"), "Missing respawn_3");
  
  // Tag hit effect (3 frames)
  assert.ok(hasSprite("tag_hit_0"), "Missing tag_hit_0");
  assert.ok(hasSprite("tag_hit_1"), "Missing tag_hit_1");
  assert.ok(hasSprite("tag_hit_2"), "Missing tag_hit_2");
});

test("character group has team-templated image path", () => {
  assert.ok(atlas.char, "Missing char group");
  assert.ok(atlas.char.meta, "Missing char.meta");
  assert.ok(atlas.char.meta.image, "Missing char.meta.image");
  assert.ok(
    atlas.char.meta.image.includes("{team}"),
    "char.meta.image should contain {team} template"
  );
  
  // Check pivot is correct (16, 30)
  assert.deepEqual(atlas.char.meta.pivot, [16, 30], "char pivot should be [16, 30]");
});

test("all sprite groups have valid meta and frames", () => {
  const requiredGroups = ["char", "tiles", "fx"];
  
  for (const groupName of requiredGroups) {
    assert.ok(atlas[groupName], `Missing group: ${groupName}`);
    assert.ok(atlas[groupName].meta, `Missing meta for group: ${groupName}`);
    assert.ok(atlas[groupName].meta.image, `Missing image for group: ${groupName}`);
    assert.ok(atlas[groupName].frames, `Missing frames for group: ${groupName}`);
    assert.ok(Object.keys(atlas[groupName].frames).length > 0, `No frames in group: ${groupName}`);
  }
});

test("atlas is grouped format, not flat format", () => {
  // Ensure we don't have old flat format with top-level frames
  assert.equal(atlas.frames, undefined, "Atlas should not have top-level frames (grouped format expected)");
  
  // Ensure groups exist
  assert.ok(typeof atlas.char === "object", "Atlas should have char group");
  assert.ok(typeof atlas.tiles === "object", "Atlas should have tiles group");
  assert.ok(typeof atlas.fx === "object", "Atlas should have fx group");
});
