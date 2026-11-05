import assert from "node:assert/strict";
import test from "node:test";
import { spawnSquad } from "../../server/autopilot.js";
import { CONFIG, Match } from "../../server/game.js";
import { boundsFromMap, cameraForViewport, worldToScreen } from "./camera.js";

function onScreen(screen, width, height) {
  return screen && screen.x >= 0 && screen.x <= width && screen.y >= 0 && screen.y <= height;
}

test("each team's opening view contains that team's visible tiles and hides the other base", () => {
  const match = new Match();
  spawnSquad(match, 3);
  match.addPlayer("human-red", "Commander", "human");
  const map = match.getMapData();
  const bounds = boundsFromMap(map, CONFIG.tileSize);
  const width = 1280;
  const height = 720;

  for (const team of ["red", "bot"]) {
    const state = match.clientStateFor(team);
    assert.equal(state.fog.team, team);
    assert.equal(state.fog.encoding, "row-major-u8");
    assert.equal(state.fog.width, map.width);
    assert.equal(state.fog.height, map.height);
    assert.equal(state.fog.visible.length, map.width * map.height);
    assert.equal(state.fog.explored.length, map.width * map.height);

    const camera = cameraForViewport(null, {
      width,
      height,
      bounds,
      map,
      team,
      tileSize: CONFIG.tileSize,
    });
    const own = state.players.filter((player) => player.team === team);
    assert.ok(own.length >= 3, team);
    for (const unit of own) {
      const tileX = Math.floor(unit.x);
      const tileY = Math.floor(unit.y);
      const index = tileY * map.width + tileX;
      assert.equal(state.fog.visible[index], 1, `${team} ${unit.id} tile`);
      const feet = worldToScreen(camera, bounds, unit.x * CONFIG.tileSize, unit.y * CONFIG.tileSize);
      assert.ok(onScreen(feet, width, height), `${team} ${unit.id} feet`);
      const beside = worldToScreen(
        camera,
        bounds,
        (tileX + (team === "red" ? 1 : -1) + 0.5) * CONFIG.tileSize,
        (tileY + 0.5) * CONFIG.tileSize,
      );
      assert.ok(onScreen(beside, width, height), `${team} surroundings`);
      const besideIndex = tileY * map.width + tileX + (team === "red" ? 1 : -1);
      assert.equal(state.fog.visible[besideIndex], 1);
    }

    const enemy = team === "red" ? map.bases.bot : map.bases.red;
    assert.equal(state.fog.visible[enemy.y * map.width + enemy.x], 0);
    assert.equal(state.players.some((player) => player.team !== team), false);
    const middle = worldToScreen(camera, bounds, 32 * CONFIG.tileSize, 20 * CONFIG.tileSize);
    assert.equal(onScreen(middle, width, height), false);
    assert.equal(state.fog.visible[20 * map.width + 32], 0);
  }
});
