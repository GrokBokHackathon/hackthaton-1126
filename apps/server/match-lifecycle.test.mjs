import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateMap } from "./game.js";
import {
  NEW_ROUND_BUDGET_RESETS,
  NEW_ROUND_HOOKS,
  RESULTS_DURATION_MS,
  ROUND_DURATION_MS,
  WIN_CAPTURES,
  basesAreOppositeDiagonals,
  canonicalOppositeDiagonalBases,
  createMatchLifecycle,
} from "./match-lifecycle.js";

const SIX_MINUTES = 360_000;
const TEN_SECONDS = 10_000;

function types(view) {
  return view.events.map((event) => event.type);
}

test("constants match the round rules", () => {
  assert.equal(WIN_CAPTURES, 3);
  assert.equal(ROUND_DURATION_MS, SIX_MINUTES);
  assert.equal(RESULTS_DURATION_MS, TEN_SECONDS);
  assert.deepEqual(NEW_ROUND_HOOKS, [
    "regenerateMap",
    "resetUnits",
    "resetFlags",
    "resetOrders",
    "resetCp",
    "resetBeerRush",
    "resetFog",
  ]);
  assert.deepEqual(NEW_ROUND_BUDGET_RESETS, {
    cp: true,
    orderLimit: true,
    beerRushUsed: true,
  });
});

test("create opens round 1 and requests budget hooks including Beer Rush usage", () => {
  const opened = createMatchLifecycle(1_000);
  assert.equal(opened.phase, "playing");
  assert.deepEqual(opened.score, { red: 0, bot: 0 });
  assert.equal(opened.winner, null);
  assert.equal(opened.winReason, null);
  assert.equal(opened.remainingMs, SIX_MINUTES);
  assert.equal(opened.roundId, 1);
  assert.equal(opened.roundStartedAtMs, 1_000);
  assert.equal(opened.roundEndsAtMs, 1_000 + SIX_MINUTES);
  assert.equal(opened.resultsEndsAtMs, null);
  assert.equal(opened.resetRequired, false);
  assert.deepEqual(types(opened), ["roundStarted"]);
  const started = opened.events[0];
  assert.equal(started.runHooks, true);
  assert.equal(started.roundId, 1);
  assert.equal(started.hooks.includes("resetBeerRush"), true);
  assert.equal(started.budgetResets.beerRushUsed, true);
  assert.equal(started.budgetResets.cp, true);
  assert.equal(started.budgetResets.orderLimit, true);
  assert.deepEqual(started.hooks, NEW_ROUND_HOOKS);
});

test("third capture wins and holds a 10 second results view", () => {
  const { lifecycle } = createMatchLifecycle(0);
  let view = lifecycle.capture("red", 10);
  assert.equal(view.phase, "playing");
  assert.deepEqual(view.score, { red: 1, bot: 0 });
  view = lifecycle.capture("bot", 20);
  assert.deepEqual(view.score, { red: 1, bot: 1 });
  view = lifecycle.capture("red", 30);
  assert.equal(view.phase, "playing");
  assert.equal(view.winner, null);
  view = lifecycle.capture("red", 40);
  assert.equal(view.phase, "results");
  assert.deepEqual(view.score, { red: 3, bot: 1 });
  assert.equal(view.winner, "red");
  assert.equal(view.winReason, "captures");
  assert.equal(view.remainingMs, TEN_SECONDS);
  assert.equal(view.resetRequired, false);
  assert.equal(view.roundId, 1);
  assert.deepEqual(types(view), ["capture", "roundEnded"]);
  assert.equal(view.events[1].reason, "captures");
  assert.equal(view.events[1].resultsEndsAtMs, 40 + TEN_SECONDS);

  const during = lifecycle.tick(40 + TEN_SECONDS - 1);
  assert.equal(during.phase, "results");
  assert.equal(during.resetRequired, false);
  assert.equal(during.remainingMs, 1);
  assert.deepEqual(during.score, { red: 3, bot: 1 });
  assert.equal(during.winner, "red");
  assert.deepEqual(during.events, []);

  const early = lifecycle.reset(40 + TEN_SECONDS - 1);
  assert.equal(early.events[0].type, "resetIgnored");
  assert.equal(early.roundId, 1);

  const due = lifecycle.tick(40 + TEN_SECONDS);
  assert.equal(due.resetRequired, true);
  assert.equal(due.remainingMs, 0);
  assert.equal(due.phase, "results");
  assert.deepEqual(types(due), ["resetRequired"]);
  const hook = due.events[0];
  assert.equal(hook.runHooks, true);
  assert.equal(hook.atMs, 40 + TEN_SECONDS);
  assert.equal(hook.budgetResets.beerRushUsed, true);
  assert.equal(hook.hooks.includes("resetCp"), true);
  assert.equal(hook.hooks.includes("resetOrders"), true);
  assert.equal(hook.hooks.includes("resetBeerRush"), true);
  assert.equal(hook.hooks.includes("regenerateMap"), true);

  const again = lifecycle.tick(40 + TEN_SECONDS + 50);
  assert.equal(again.resetRequired, true);
  assert.deepEqual(again.events, []);

  const next = lifecycle.reset(40 + TEN_SECONDS + 50);
  assert.equal(next.phase, "playing");
  assert.equal(next.roundId, 2);
  assert.deepEqual(next.score, { red: 0, bot: 0 });
  assert.equal(next.winner, null);
  assert.equal(next.winReason, null);
  assert.equal(next.resetRequired, false);
  assert.equal(next.remainingMs, SIX_MINUTES);
  assert.equal(next.roundStartedAtMs, 40 + TEN_SECONDS + 50);
  assert.equal(next.events[0].type, "roundStarted");
  assert.equal(next.events[0].runHooks, false);
  assert.equal(next.events[0].budgetResets.beerRushUsed, true);
});

test("bot team wins at 3 captures", () => {
  const { lifecycle } = createMatchLifecycle(0);
  lifecycle.capture("bot", 1);
  lifecycle.capture("bot", 2);
  const view = lifecycle.capture("bot", 3);
  assert.equal(view.winner, "bot");
  assert.equal(view.winReason, "captures");
  assert.deepEqual(view.score, { red: 0, bot: 3 });
});

test("a lead at 6:00 wins without a third capture", () => {
  const { lifecycle } = createMatchLifecycle(0);
  lifecycle.capture("red", 1_000);
  lifecycle.capture("red", 2_000);
  lifecycle.capture("bot", 3_000);
  const before = lifecycle.tick(SIX_MINUTES - 1);
  assert.equal(before.phase, "playing");
  assert.equal(before.remainingMs, 1);
  assert.equal(before.winner, null);

  const view = lifecycle.tick(SIX_MINUTES);
  assert.equal(view.phase, "results");
  assert.equal(view.winner, "red");
  assert.equal(view.winReason, "time");
  assert.deepEqual(view.score, { red: 2, bot: 1 });
  assert.equal(view.events[0].reason, "time");
  assert.equal(view.events[0].atMs, SIX_MINUTES);
  assert.equal(view.resultsEndsAtMs, SIX_MINUTES + TEN_SECONDS);
  assert.equal(view.remainingMs, TEN_SECONDS);
});

test("a late tick still ends the round at the buzzer", () => {
  const { lifecycle } = createMatchLifecycle(0);
  lifecycle.capture("bot", 5);
  const view = lifecycle.tick(SIX_MINUTES + 2_500);
  assert.equal(view.winner, "bot");
  assert.equal(view.winReason, "time");
  assert.equal(view.events[0].atMs, SIX_MINUTES);
  assert.equal(view.resultsEndsAtMs, SIX_MINUTES + TEN_SECONDS);
  assert.equal(view.remainingMs, TEN_SECONDS - 2_500);
  assert.equal(view.resetRequired, false);
});

test("a tick past the results window emits round end and reset hooks once", () => {
  const { lifecycle } = createMatchLifecycle(0);
  lifecycle.capture("red", 1);
  const view = lifecycle.tick(SIX_MINUTES + TEN_SECONDS + 20);
  assert.deepEqual(types(view), ["roundEnded", "resetRequired"]);
  assert.equal(view.resetRequired, true);
  assert.equal(view.remainingMs, 0);
  assert.equal(view.events[1].budgetResets.beerRushUsed, true);
  assert.equal(view.events[1].atMs, SIX_MINUTES + TEN_SECONDS);
  const repeat = lifecycle.tick(SIX_MINUTES + TEN_SECONDS + 20);
  assert.deepEqual(repeat.events, []);
});

test("a tie at 6:00 enters sudden death until the next capture", () => {
  const { lifecycle } = createMatchLifecycle(0);
  lifecycle.capture("red", 10);
  lifecycle.capture("bot", 20);
  lifecycle.capture("red", 30);
  lifecycle.capture("bot", 40);
  const tied = lifecycle.tick(SIX_MINUTES);
  assert.equal(tied.phase, "sudden_death");
  assert.equal(tied.winner, null);
  assert.equal(tied.remainingMs, null);
  assert.equal(tied.roundId, 1);
  assert.deepEqual(tied.score, { red: 2, bot: 2 });
  assert.deepEqual(types(tied), ["suddenDeath"]);
  assert.equal(tied.events[0].atMs, SIX_MINUTES);

  const still = lifecycle.tick(SIX_MINUTES + 60_000);
  assert.equal(still.phase, "sudden_death");
  assert.equal(still.winner, null);
  assert.deepEqual(still.events, []);

  const won = lifecycle.capture("bot", SIX_MINUTES + 60_001);
  assert.equal(won.phase, "results");
  assert.equal(won.winner, "bot");
  assert.equal(won.winReason, "sudden_death");
  assert.deepEqual(won.score, { red: 2, bot: 3 });
  assert.equal(won.roundId, 1);
  assert.deepEqual(types(won), ["capture", "roundEnded"]);
  assert.equal(won.events[1].reason, "sudden_death");
  assert.equal(won.resetRequired, false);
});

test("sudden death from 0-0 is won by the next capture", () => {
  const { lifecycle } = createMatchLifecycle(0);
  const tied = lifecycle.tick(SIX_MINUTES);
  assert.equal(tied.phase, "sudden_death");
  const won = lifecycle.capture("red", SIX_MINUTES + 1);
  assert.equal(won.winner, "red");
  assert.equal(won.winReason, "sudden_death");
  assert.deepEqual(won.score, { red: 1, bot: 0 });
});

test("a capture in the last millisecond still counts as 3 captures", () => {
  const { lifecycle } = createMatchLifecycle(0);
  lifecycle.capture("red", 1);
  lifecycle.capture("red", 2);
  const view = lifecycle.capture("red", SIX_MINUTES - 1);
  assert.equal(view.winReason, "captures");
  assert.equal(view.winner, "red");
  assert.deepEqual(view.score, { red: 3, bot: 0 });
  assert.equal(view.events[1].atMs, SIX_MINUTES - 1);
});

test("an exact-buzzer capture resolves the clock before scoring", () => {
  const lead = createMatchLifecycle(0);
  lead.lifecycle.capture("red", 1);
  lead.lifecycle.capture("red", 2);
  lead.lifecycle.capture("bot", 3);
  const ignored = lead.lifecycle.capture("bot", SIX_MINUTES);
  assert.equal(ignored.winner, "red");
  assert.equal(ignored.winReason, "time");
  assert.deepEqual(ignored.score, { red: 2, bot: 1 });
  assert.deepEqual(types(ignored), ["roundEnded", "captureIgnored"]);
  assert.equal(ignored.events[1].reason, "after_buzzer");

  const tied = createMatchLifecycle(0);
  tied.lifecycle.capture("red", 1);
  tied.lifecycle.capture("bot", 2);
  const sudden = tied.lifecycle.capture("red", SIX_MINUTES);
  assert.deepEqual(types(sudden), ["suddenDeath", "capture", "roundEnded"]);
  assert.equal(sudden.winner, "red");
  assert.equal(sudden.winReason, "sudden_death");
  assert.deepEqual(sudden.score, { red: 2, bot: 1 });
});

test("captures are ignored when the round is not live or the team is unknown", () => {
  const { lifecycle } = createMatchLifecycle(0);
  lifecycle.capture("red", 1);
  lifecycle.capture("red", 2);
  lifecycle.capture("red", 3);
  const ignored = lifecycle.capture("bot", 4);
  assert.equal(ignored.events.at(-1).type, "captureIgnored");
  assert.equal(ignored.events.at(-1).reason, "not_live");
  assert.deepEqual(ignored.score, { red: 3, bot: 0 });

  const fresh = createMatchLifecycle(0);
  const bad = fresh.lifecycle.capture("blue", 5);
  assert.equal(bad.events[0].reason, "invalid_team");
  assert.deepEqual(bad.score, { red: 0, bot: 0 });
  assert.equal(bad.phase, "playing");
});

test("time must be finite and monotonic", () => {
  assert.throws(() => createMatchLifecycle(Number.NaN), TypeError);
  const { lifecycle } = createMatchLifecycle(10);
  const backwards = lifecycle.tick(9);
  assert.equal(backwards.events[0].type, "timeIgnored");
  assert.equal(backwards.events[0].reason, "non_monotonic");
  assert.equal(backwards.phase, "playing");
  const bad = lifecycle.capture("red", "20");
  assert.equal(bad.events[0].reason, "invalid_time");
  assert.deepEqual(bad.score, { red: 0, bot: 0 });
  const same = lifecycle.tick(10);
  assert.deepEqual(same.events, []);
  assert.equal(same.remainingMs, SIX_MINUTES);
});

test("returned scores are copies", () => {
  const opened = createMatchLifecycle(0);
  opened.score.red = 9;
  const view = opened.lifecycle.snapshot();
  assert.deepEqual(view.score, { red: 0, bot: 0 });
  assert.deepEqual(view.events, []);
});

test("reset at the same timestamp as resetRequired starts the next round", () => {
  const { lifecycle } = createMatchLifecycle(0);
  lifecycle.capture("red", 1);
  lifecycle.capture("red", 2);
  lifecycle.capture("red", 3);
  const due = lifecycle.tick(3 + TEN_SECONDS);
  assert.equal(due.resetRequired, true);
  const next = lifecycle.reset(3 + TEN_SECONDS);
  assert.equal(next.roundId, 2);
  assert.equal(next.phase, "playing");
  assert.equal(next.events[0].runHooks, false);
  const scored = lifecycle.capture("bot", 3 + TEN_SECONDS + 1);
  assert.equal(scored.phase, "playing");
  assert.deepEqual(scored.score, { red: 0, bot: 1 });
});

test("current generator keeps opposite-diagonal bases", () => {
  const canonical = canonicalOppositeDiagonalBases(64, 40);
  assert.deepEqual(canonical, {
    red: { x: 2, y: 2 },
    bot: { x: 61, y: 37 },
  });
  assert.equal(basesAreOppositeDiagonals(canonical, 64, 40), true);
  assert.equal(
    basesAreOppositeDiagonals(
      { red: { x: 61, y: 37 }, bot: { x: 2, y: 2 } },
      64,
      40
    ),
    false
  );
  assert.equal(
    basesAreOppositeDiagonals(
      { red: { x: 2, y: 37 }, bot: { x: 61, y: 2 } },
      64,
      40
    ),
    false
  );
  for (let seed = 0; seed < 6; seed += 1) {
    const map = generateMap(4000 + seed);
    assert.equal(basesAreOppositeDiagonals(map.bases, map.width, map.height), true);
    assert.deepEqual(map.bases, canonicalOppositeDiagonalBases(map.width, map.height));
  }
});

test("module stays free of timers, clock reads, and map generation", () => {
  const source = readFileSync(new URL("./match-lifecycle.js", import.meta.url), "utf8");
  assert.equal(source.includes("setTimeout"), false);
  assert.equal(source.includes("setInterval"), false);
  assert.equal(source.includes("Date.now"), false);
  assert.equal(source.includes("generateMap("), false);
  assert.equal(source.includes("node:timers"), false);
});
