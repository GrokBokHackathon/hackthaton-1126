# Match lifecycle (isolated)

Pure state machine in `match-lifecycle.js`. It is not wired into `game.js` or `server.js`. The live server still uses its existing 3-capture / 5-second reset path until the core adapter switches over. Do not run a second results timer beside this module.

Time is a finite monotonic millisecond value supplied by the caller. The module does not read a clock, start timers, or build a map.

## Calls

```js
import { createMatchLifecycle } from "./match-lifecycle.js";

const opened = createMatchLifecycle(now);
const life = opened.lifecycle;
const afterCapture = life.capture("red" | "bot", now);
const afterTick = life.tick(now);
const afterReset = life.reset(now);
const reading = life.snapshot();
```

`createMatchLifecycle(now)` throws if `now` is not a finite number. Later calls with a bad or backwards `now` leave state unchanged and emit `timeIgnored`.

Every returned view has:

| Field | Meaning |
| --- | --- |
| `phase` | `playing`, `sudden_death`, or `results` |
| `score` | `{ red, bot }` copy |
| `winner` | `null`, `red`, or `bot` |
| `remainingMs` | milliseconds left in `playing` or `results`; `null` in sudden death; `0` once `resetRequired` |
| `roundId` | `1` on create, plus 1 on each successful `reset` |
| `roundStartedAtMs` / `roundEndsAtMs` | playing window `[start, start + 360000)` |
| `resultsEndsAtMs` | `null` until a winner exists, then decision time + `10000` |
| `resetRequired` | true after the results hold elapses, until `reset` |
| `winReason` | `null`, `captures`, `time`, or `sudden_death` |
| `events` | transitions from this call only |

## Timing

- Playing captures apply while `now < roundEndsAtMs`. The third capture on one team ends the round (`winReason: "captures"`).
- At `now >= roundEndsAtMs`, a strict score lead wins (`winReason: "time"`) even below 3. The decision time is the buzzer, not a late tick.
- Equal scores at the buzzer enter `sudden_death` on the same `roundId`. There is no further countdown. The next capture wins (`winReason: "sudden_death"`), including from 0-0.
- A call at exactly `roundEndsAtMs` resolves the buzzer before that capture. A lead ignores it (`captureIgnored` / `after_buzzer`). A tie accepts it as the sudden-death capture.
- Results keep `score` and `winner` for 10 seconds. `tick` at `resultsEndsAtMs` sets `resetRequired` and emits one `resetRequired` event. Later ticks repeat neither the event nor the phase change.
- `reset(now)` before `resetRequired` emits `resetIgnored` / `not_due`. `reset` does not move the clock forward into the hook by itself: `tick` first.
- A successful `reset(now)` starts the next round at that `now` with a fresh 6:00 and score 0-0. `now` equal to the last tick is allowed.

## Hooks

Apply hook side effects only when `runHooks` is true.

- Opening `roundStarted` from `createMatchLifecycle`: `runHooks: true`.
- `resetRequired`: `runHooks: true`. Run these, then call `reset(now)`.
- `roundStarted` from `reset`: `runHooks: false`. Do not apply the list again.

`hooks` order:

1. `regenerateMap` — new procedural map for the new round. Bases must pass `basesAreOppositeDiagonals(bases, width, height)`: red in the top-left quadrant, bot in the bottom-right quadrant. `canonicalOppositeDiagonalBases(width, height)` is the current generator contract, red `(2, 2)` and bot `(width - 3, height - 3)`. Sudden death does not ask for a new map.
2. `resetUnits`
3. `resetFlags`
4. `resetOrders` — clear the per-round order count. Issue 6 owns the limit.
5. `resetCp` — clear CP for the new round. Issue 6 owns the starting amount, regen, cap, and the +3 CP award to the team that lost a capture. This module does not grant CP.
6. `resetBeerRush` — clear once-per-round Beer Rush usage. `budgetResets.beerRushUsed` is `true` on hook events. Issue 6 owns the cost, the effect, and `already_used`. This module does not apply them.
7. `resetFog`

`budgetResets` is `{ cp: true, orderLimit: true, beerRushUsed: true }` on those hook events.

## Adapter steps

1. Keep a single `MatchLifecycle` and pass the server loop's monotonic `now` into `tick` on each existing tick.
2. When the current flag rules already record a capture, call `capture(team, now)` once. Do not also apply the old `winScore` / `matchEndDelayMs` end path.
3. Publish `phase`, `score`, `winner`, `remainingMs`, and `roundId` from the view. Results is the 10-second score screen.
4. On `resetRequired`, run the hooks above, then `reset(now)`.

Out of scope here: pickup and tag rules, order costs, CP numbers, Beer Rush effect, fog, autopilot, protocol messages, and the web results screen.
