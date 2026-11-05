import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { roundHudFromState } from "./round-hud.js";

test("playing shows only a supplied clock and round id", () => {
  const hud = roundHudFromState({ phase: "playing", roundId: 1, remainingMs: 360000, winner: null, winReason: null });
  assert.equal(hud.text, "Round 1 · 6:00");
  assert.equal(roundHudFromState({ phase: "playing", roundId: 1, remainingMs: 360000 }).text, hud.text);
  assert.equal(roundHudFromState({ phase: "playing" }).visible, false);
});

test("sudden death does not invent a clock when remainingMs is null", () => {
  const hud = roundHudFromState({ phase: "sudden_death", roundId: 1, remainingMs: null, winner: null, winReason: null });
  assert.equal(hud.text, "Round 1 · Sudden death");
  assert.equal(hud.text.includes(":"), false);
});

test("results then the next playing snapshot replaces the banner", () => {
  const results = roundHudFromState({
    phase: "results",
    roundId: 1,
    winner: "red",
    winReason: "captures",
    remainingMs: 10000,
  });
  assert.equal(results.text, "Round 1 · Red wins · captures · Next round 0:10");
  const next = roundHudFromState({
    phase: "playing",
    roundId: 2,
    winner: null,
    winReason: null,
    remainingMs: 360000,
  });
  assert.equal(next.text, "Round 2 · 6:00");
  assert.equal(next.text.includes("wins"), false);
});

test("the current ended phase is not relabeled as results", () => {
  const hud = roundHudFromState({ phase: "ended", winner: "red" });
  assert.equal(hud.visible, false);
  assert.equal(hud.text, "");
});

test("the live client renders the round line from state only", () => {
  const game = fs.readFileSync(new URL("../game.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../game.html", import.meta.url), "utf8");
  assert.match(game, /roundHudFromState\(msg\)/);
  assert.match(html, /id="round"/);
  assert.equal(game.includes("matchEndDelay"), false);
});
