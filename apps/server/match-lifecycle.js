// Pure round lifecycle for the core adapter.
// Deterministic state only: injected monotonic time, no timers, no I/O, no map builder.
// Flag rules and the command-point economy stay outside this module.

export const TEAMS = Object.freeze(["red", "bot"]);
export const WIN_CAPTURES = 3;
export const ROUND_DURATION_MS = 6 * 60 * 1000;
export const RESULTS_DURATION_MS = 10 * 1000;

// Run only when an event says runHooks. reset() itself does not run them again.
export const NEW_ROUND_HOOKS = Object.freeze([
  "regenerateMap",
  "resetUnits",
  "resetFlags",
  "resetOrders",
  "resetCp",
  "resetBeerRush",
  "resetFog",
]);

// beerRushUsed: clear the once-per-round Beer Rush usage flag.
// Amounts, regen, comeback CP, cost, and the Beer Rush effect are not applied here.
export const NEW_ROUND_BUDGET_RESETS = Object.freeze({
  cp: true,
  orderLimit: true,
  beerRushUsed: true,
});

function isValidTime(now) {
  return typeof now === "number" && Number.isFinite(now);
}

function copyBudgetResets() {
  return {
    cp: NEW_ROUND_BUDGET_RESETS.cp,
    orderLimit: NEW_ROUND_BUDGET_RESETS.orderLimit,
    beerRushUsed: NEW_ROUND_BUDGET_RESETS.beerRushUsed,
  };
}

function roundStartedEvent(roundId, startedAtMs, endsAtMs, runHooks) {
  return {
    type: "roundStarted",
    roundId,
    startedAtMs,
    endsAtMs,
    atMs: startedAtMs,
    hooks: NEW_ROUND_HOOKS,
    budgetResets: copyBudgetResets(),
    runHooks,
  };
}

// Red in the top-left quadrant, bot in the bottom-right quadrant.
export function basesAreOppositeDiagonals(bases, width, height) {
  if (!bases || !bases.red || !bases.bot) return false;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  const { red, bot } = bases;
  if (![red.x, red.y, bot.x, bot.y].every((value) => Number.isFinite(value))) {
    return false;
  }
  const midX = width / 2;
  const midY = height / 2;
  const inside = (point) =>
    point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
  return (
    inside(red) &&
    inside(bot) &&
    red.x < midX &&
    red.y < midY &&
    bot.x > midX &&
    bot.y > midY
  );
}

// Corners used by the current generator: red (2, 2), bot (width - 3, height - 3).
export function canonicalOppositeDiagonalBases(width, height) {
  return {
    red: { x: 2, y: 2 },
    bot: { x: width - 3, y: height - 3 },
  };
}

export class MatchLifecycle {
  #lastNowMs;
  #roundId;
  #score;
  #phase;
  #winner;
  #winReason;
  #resetRequired;
  #roundStartedAtMs;
  #roundEndsAtMs;
  #resultsEndsAtMs;

  constructor(now) {
    if (!isValidTime(now)) {
      throw new TypeError("MatchLifecycle requires a finite millisecond timestamp");
    }
    this.#lastNowMs = now;
    this.#roundId = 1;
    this.#score = { red: 0, bot: 0 };
    this.#phase = "playing";
    this.#winner = null;
    this.#winReason = null;
    this.#resetRequired = false;
    this.#roundStartedAtMs = now;
    this.#roundEndsAtMs = now + ROUND_DURATION_MS;
    this.#resultsEndsAtMs = null;
  }

  snapshot() {
    return this.#view([]);
  }

  tick(now) {
    const observed = this.#observe(now);
    if (!observed.ok) return this.#timeIgnored(now, observed.reason);
    if (this.#resetRequired) return this.#view([]);
    const events = [];
    this.#resolveDue(now, events);
    return this.#view(events);
  }

  capture(team, now) {
    const observed = this.#observe(now);
    if (!observed.ok) return this.#timeIgnored(now, observed.reason);
    const events = [];
    const phaseBefore = this.#phase;
    if (!this.#resetRequired) this.#resolveDue(now, events);
    const endedOnBuzzer =
      phaseBefore === "playing" &&
      events.some((event) => event.type === "roundEnded" && event.reason === "time");
    if (this.#phase !== "playing" && this.#phase !== "sudden_death") {
      const reason = endedOnBuzzer
        ? "after_buzzer"
        : this.#resetRequired
          ? "reset_pending"
          : "not_live";
      events.push(this.#captureIgnored(team, now, reason));
      return this.#view(events);
    }
    if (team !== "red" && team !== "bot") {
      events.push(this.#captureIgnored(team, now, "invalid_team"));
      return this.#view(events);
    }

    this.#score[team] += 1;
    events.push({
      type: "capture",
      team,
      score: this.#copyScore(),
      roundId: this.#roundId,
      atMs: now,
    });
    if (this.#phase === "sudden_death" || this.#score[team] >= WIN_CAPTURES) {
      const reason = this.#phase === "sudden_death" ? "sudden_death" : "captures";
      this.#enterResults(team, reason, now, events);
    }
    return this.#view(events);
  }

  reset(now) {
    const observed = this.#observe(now);
    if (!observed.ok) return this.#timeIgnored(now, observed.reason);
    if (!this.#resetRequired) {
      return this.#view([
        {
          type: "resetIgnored",
          reason: "not_due",
          roundId: this.#roundId,
          atMs: now,
          remainingMs: this.#remaining(now),
          resetRequired: false,
        },
      ]);
    }

    this.#roundId += 1;
    this.#score = { red: 0, bot: 0 };
    this.#phase = "playing";
    this.#winner = null;
    this.#winReason = null;
    this.#resetRequired = false;
    this.#roundStartedAtMs = now;
    this.#roundEndsAtMs = now + ROUND_DURATION_MS;
    this.#resultsEndsAtMs = null;
    return this.#view([
      roundStartedEvent(this.#roundId, now, this.#roundEndsAtMs, false),
    ]);
  }

  #observe(now) {
    if (!isValidTime(now)) return { ok: false, reason: "invalid_time" };
    if (now < this.#lastNowMs) return { ok: false, reason: "non_monotonic" };
    this.#lastNowMs = now;
    return { ok: true };
  }

  #resolveDue(now, events) {
    if (this.#phase === "playing" && now >= this.#roundEndsAtMs) {
      if (this.#score.red === this.#score.bot) {
        this.#phase = "sudden_death";
        events.push({
          type: "suddenDeath",
          roundId: this.#roundId,
          score: this.#copyScore(),
          atMs: this.#roundEndsAtMs,
        });
      } else {
        const winner = this.#score.red > this.#score.bot ? "red" : "bot";
        this.#enterResults(winner, "time", this.#roundEndsAtMs, events);
      }
    }
    if (
      this.#phase === "results" &&
      this.#resultsEndsAtMs !== null &&
      now >= this.#resultsEndsAtMs &&
      !this.#resetRequired
    ) {
      this.#resetRequired = true;
      events.push({
        type: "resetRequired",
        roundId: this.#roundId,
        atMs: this.#resultsEndsAtMs,
        hooks: NEW_ROUND_HOOKS,
        budgetResets: copyBudgetResets(),
        runHooks: true,
      });
    }
  }

  #enterResults(winner, reason, atMs, events) {
    this.#phase = "results";
    this.#winner = winner;
    this.#winReason = reason;
    this.#resultsEndsAtMs = atMs + RESULTS_DURATION_MS;
    events.push({
      type: "roundEnded",
      roundId: this.#roundId,
      winner,
      reason,
      score: this.#copyScore(),
      atMs,
      resultsEndsAtMs: this.#resultsEndsAtMs,
    });
  }

  #captureIgnored(team, now, reason) {
    return {
      type: "captureIgnored",
      team,
      reason,
      roundId: this.#roundId,
      atMs: now,
      score: this.#copyScore(),
    };
  }

  #timeIgnored(now, reason) {
    return this.#view([
      {
        type: "timeIgnored",
        reason,
        roundId: this.#roundId,
        atMs: now,
      },
    ]);
  }

  #copyScore() {
    return { red: this.#score.red, bot: this.#score.bot };
  }

  #remaining(now) {
    if (this.#resetRequired) return 0;
    if (this.#phase === "sudden_death") return null;
    if (this.#phase === "results") return Math.max(0, this.#resultsEndsAtMs - now);
    return Math.max(0, this.#roundEndsAtMs - now);
  }

  #view(events) {
    return {
      phase: this.#phase,
      score: this.#copyScore(),
      winner: this.#winner,
      remainingMs: this.#remaining(this.#lastNowMs),
      roundId: this.#roundId,
      roundStartedAtMs: this.#roundStartedAtMs,
      roundEndsAtMs: this.#roundEndsAtMs,
      resultsEndsAtMs: this.#resultsEndsAtMs,
      resetRequired: this.#resetRequired,
      winReason: this.#winReason,
      events,
    };
  }
}

export function createMatchLifecycle(now) {
  const lifecycle = new MatchLifecycle(now);
  const view = lifecycle.snapshot();
  view.events = [
    roundStartedEvent(view.roundId, view.roundStartedAtMs, view.roundEndsAtMs, true),
  ];
  return { lifecycle, ...view };
}
