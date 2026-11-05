import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { describeFog, drawableFlags, fogLabel, presentationFromUnits, unitsFromState } from "./live-hook.js";

test("missing fog is explicit and not described as secure", () => {
  const described = describeFog({ players: [], score: { red: 0, bot: 0 } });
  assert.equal(described.availability, "missing-data");
  assert.equal(described.secure, false);
  assert.equal(described.applied, false);
  assert.match(fogLabel(described), /not masked/);
});

test("a well formed mask is not drawn and does not drop players", () => {
  const players = [{ id: "hidden", team: "bot", x: 9, y: 9 }];
  const state = {
    players,
    fog: { width: 1, height: 1, visible: [0], explored: [0] },
  };
  const described = describeFog(state);
  assert.equal(described.availability, "data-present");
  assert.equal(described.secure, false);
  assert.equal(unitsFromState(state).units, players);
  assert.equal(unitsFromState(state).units[0].id, "hidden");
});

test("presentation is copied only from properties the unit already has", () => {
  const units = [{ id: "a", team: "red", x: 1, y: 1, state: "idle" }];
  assert.deepEqual(presentationFromUnits(units), {});
  units[0].order = "scout";
  assert.deepEqual(presentationFromUnits(units), { a: { order: "scout" } });
});

test("hidden and null flags are not drawable", () => {
  assert.deepEqual(drawableFlags(null), []);
  assert.deepEqual(drawableFlags(undefined), []);
  assert.deepEqual(drawableFlags({ red: null, bot: { hidden: true } }), []);
  assert.deepEqual(drawableFlags({ red: { hidden: true }, bot: { x: 1 } }), []);
  const visible = drawableFlags({
    red: { x: 2, y: 2, carrier: null, hidden: false },
    bot: { hidden: true },
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].team, "red");
  assert.equal(visible[0].flag.x, 2);
});

test("the live client draws fog, skips movement input, and does not import a command panel", () => {
  const game = fs.readFileSync(new URL("../game.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../game.html", import.meta.url), "utf8");
  assert.match(game, /from "\.\/fog\.js"/);
  assert.match(game, /drawFog\(/);
  assert.match(game, /drawableFlags/);
  assert.equal(game.includes("command-panel"), false);
  assert.equal(game.includes("joystick"), false);
  assert.equal(game.includes('type: "input"'), false);
  assert.equal(game.includes('type: "command"'), false);
  assert.equal(game.includes("setupInput"), false);
  assert.equal((game.match(/const time/g) || []).length, 1);
  assert.match(game, /spriteLoader/);
  assert.match(game, /updateCamera/);
  assert.equal(html.includes("joystick"), false);
  assert.match(html, /id="fog"/);
});
