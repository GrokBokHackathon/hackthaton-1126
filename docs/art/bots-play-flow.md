> **Decided 2026-11-05 (Grzegorz), overrides anything below:** one flag per base; 3 bots per team (default 3, configurable); economy as written; the AI commander is a real Grok Bot sending `command` about every 10 s under the same limits; Beer Rush stays (8 CP, once per round). Reroute is still cut.

# Flag Raid: "Bots play, humans command" flow proposal
*Art director / UX review, 2026-11-05. Read-only review of `GrokBokHackathon/hackthaton-1126` (`main` @ fbe460b, PR #2 head @ 0283fc3). Nothing was changed on GitHub.*

**TL;DR:** Every unit on the map is an emoji bot. Each team has **1 commander** (human, or an AI such as Grok Bot) and **4 bots**. The commander does not steer anything. They spend **Command Points (CP ⚡)** on a small set of **orders**, and **orders per round are capped**. Between orders and at 0 CP, bots play on **autopilot**. The goal stays the same: capture the flag, first to 3 or best after 6 min.

---

## 1. Fit check: where the repo assumes direct control or contradicts itself

| # | Where | What it assumes / conflict | Impact on the "bots play" model |
|---|---|---|---|
| F1 | `main` `docs/DECISIONS.md` §1, L153: "Humans and bots move continuously" | Humans control bodies directly | Rewrite as "bots move; humans command" |
| F2 | `main` `docs/DECISIONS.md` §2, L161–163, and `README.md` L16: "humans vs Grok Bot(s)", "n humans vs m Grok Bots" | Humans are units on one side | Both sides become bot units. Humans/AI are **commanders**. Lineup = human-commanded Red vs AI-commanded Bot (purple) |
| F3 | `main` `docs/DECISIONS.md` §8, L195–199: commands that edit an ally tree are "later still, and outside the three-hour slice" | Commanding is stretch work | Commanding is now **the core loop**. The decision log needs a new entry (fixed order set, no LLM text) |
| F4 | `main` `README.md` L116: "keyboard movement in the web client" | Direct input is a next step | Replace with "command panel + tap-to-target" |
| F5 | `main` `docs/GAME_CONCEPT_V0_1.md` §Relationship to the baseline, L13 ("Humans… move themselves") and L21 (PR #2 is out of scope) | The concept says it is an *alternative* to direct control | The twist **adopts** the concept's indirect control. Conflicts F6–F9 still need choices |
| F6 | `GAME_CONCEPT_V0_1.md` §Match sketch, L41: **one neutral centre flag** | PR #2 `docs/PROTOCOL.md` L90–93 and `apps/server/game.js` L187–190 use **one flag per base** | **Recommend PR #2's two flags** (already built and tested). Q1 |
| F7 | `GAME_CONCEPT_V0_1.md` L48 and L53: 8-min clock, 10 s respawn | PR #2 `game.js` L13–15: 2 s respawn, first to 3, **no clock** | Use first to 3 **or** a 6 min clock (needs a small timer), and a 3 s respawn |
| F8 | `GAME_CONCEPT_V0_1.md` §Patron influence, L59–81: one hero per proposal, a bonus budget with reserve/pay/refund, a free-text persuasion message | Free text means LLM calls, latency and cost (L137), and refund exploits (L135) | Keep the **objectives** and the **10 s cadence** (L73). Swap the bounty ledger for a flat CP cost. Cut free text |
| F9 | `GAME_CONCEPT_V0_1.md` L29–37: 2 patrons × 3 heroes (warrior/scout/support personalities) | PR #2 has one generic unit type | Roles become **autopilot defaults** (Runner/Guard/Roamer), with no personality AI in the slice |
| F10 | PR #2 `apps/web/game.js` L74–138 (touch joystick), L141–167 (WASD/arrows), `game.html` L95–96 (`#joystick`) | Direct movement input | Remove both. Add a command panel and tap targeting |
| F11 | PR #2 `apps/web/game.js` L288–297: the camera follows `playerId`'s body | One body per client | The commander has no body. Use a free camera (drag to pan) plus jump buttons |
| F12 | PR #2 `docs/PROTOCOL.md` L18–27, `server.js` L125–128, `game.js` L260–266: `input {dx,dy}` per player | One unit per socket, client-driven movement | Server-side bot brains drive `dx,dy` internally. The client sends `command` |
| F13 | PR #2 `game.js` L209–210: `team = kind === "human" ? "red" : "bot"`, and L228–250: the match runs only while a human is connected | The team comes from player kind | The team comes from the **side picked in the lobby**. Bots spawn per team, not per socket. Keep "starts when ≥1 human commander" |
| F14 | PR #2 `apps/bot/bot.js` L116–127: a straight line to the target with no pathfinding; one bot = one socket | Gets stuck on walls/crates. Bots are separate clients | Move the brain **into the server** with A*. `bot.js` becomes an optional *AI commander* that sends `command` |
| F15 | PR #2 `game.js` L391–421: you can tag only an enemy **carrier**, only in **your own half** | Fine, but it limits "Tag that unit" | Focus orders can target only an enemy carrier, or an enemy inside your half |
| F16 | PR #2 `game.js` L426–455 `getState()` sends every player to everyone. `visionRadius` is config only (L18–19) | No fog yet | 3-state fog per team is needed for the "orders target explored tiles" rule |
| F17 | `main` has `PROTOCOL.md` at the root. PR #2 deletes it and adds `docs/PROTOCOL.md`. `docs/PROTOCOL.md` **does not exist on `main` yet**. The PR #2 example map is 40×30 (L56–57) but the config is 64×40 (`game.js` L7–8). PR #2 is `mergeable: false` (dirty) | Doc drift | Fix it when PR #2 is rebased |
| F18 | `flag-raid/palette.md` and `style-guide.md`: "Team Red (humans)", "Team Bot (AI)" | The art labels say humans are units | Relabel as "Red commander side" vs "Bot (purple) side". The sprites stay the same |

---

## 2. Proposed flow

### Recommended model: "Commander + 4 bots"
- Each team: **1 commander and 4 bots**. Bots start in autopilot roles: 1 **Runner**, 1 **Guard**, 2 **Roamers**.
- Commander types: a human (web client), or an AI (Grok Bot/`bot.js`) that sends the **same `command` messages** under the **same economy**. With no commander, the side runs on free autopilot.
- A 2nd human on the same side becomes a **co-commander**. Co-commanders share one CP pool and one order cap, so a bigger team does not get more power.
- **Alternative (named): "Squad leaders".** Each human owns 1–2 bots and pays from a shared team pool. It is more personal, but more players makes it spammy and harder to balance.

### Lobby / join
1. Open the tunnel URL. Enter a name (prefilled with a silly name). Pick **Red / Purple / Watch**.
2. If the side has no commander, you are the commander. Otherwise you are a co-commander. An empty Purple side auto-fills with an AI commander.
3. The match starts when ≥1 human commander is in. 3-2-1 countdown, then a new procedural map (PR #2 already does this).

### What the commander sees
- **Arena view:** the camera fits 16 tiles on the short side and **pans freely** (drag, or WASD/edge on desktop). Jump buttons: 🏠 Base · 🚩 Enemy flag · 🏃 Our carrier. Fog of war: unexplored, explored (dim), visible.
- **Command panel:** a budget bar, an order counter, unit chips, order buttons with costs, and the ultimate (layouts in §3).

### Issuing orders (tap order → tap target)
1. Select: tap a unit chip, tap a bot on the map, or tap **All**. The default selection is **All**.
2. Tap an order button. Targeted orders enter target mode (the cursor shows a valid or invalid tile).
3. Tap the map or a unit. The server validates it and the bot shows 💭 "thinking" for 0.4 s, then switches its badge. A rejected order shows the 🪫 emote and a toast with the reason.
4. **Tap-to-ping** with no order selected drops a **Rally ping** (1 CP). Selected bots go there and hold for 10 s.

### Order set and cost ladder (CP ⚡)
| Tier | Order | Target | Effect | Duration | CP |
|---|---|---|---|---|---|
| Cheap | 📣 **Rally / Ping** | explored tile | Go there, hold, then autopilot | 10 s | **1** |
| Cheap | 👀 **Scout** | **any** tile (it is the only order allowed into black fog) | Path there to reveal it, then autopilot | until arrived | **1** |
| Mid | 🏰 **Defend base** | (own base) | Patrol a ring of 3 tiles around the base and intercept carriers in our half | 20 s | **2** |
| Mid | 🤝 **Escort carrier** | own carrier (auto) | Follow the carrier 1–2 tiles behind and body-block | until score/tag | **3** |
| Expensive | 🚩 **Attack flag** | (enemy flag) | Selected bots rush the flag by the shortest A* path | until pickup/tag | **3** |
| Expensive | 🎯 **Tag that unit** | visible enemy carrier or enemy in our half | All selected bots chase that unit | 12 s or tag | **4** |
| Expensive | ↪️ **Reroute carrier** | explored waypoint | The carrier detours through the waypoint (dodge an ambush) | until home | **4** |
| Ultimate | 🍺 **Beer Rush** | (whole team) | All own bots get +50% speed and are immune to tagging for 4 s (**once per round**) | 4 s | **8** |

**Economy rules**
- **Pool:** start at **6 CP**, regen **+1 CP every 5 s**, **cap 10** (anything over the cap is wasted, which pushes you to spend).
- **Order cap:** **15 orders per round** (round = one match to 3 / 6 min). Pings count. The counter shows "orders left".
- **Cooldowns:** **2 s** global per commander, and the **same bot can't be re-ordered for 5 s**. This stops the cheap "1 CP rally" spam.
- **Balance logic:** regen is ~12 CP/min, about 3–4 meaningful orders per minute. Cheap orders (1 CP) are positioning only and can't score on their own. Mid orders (2–3) are defensive and time-limited, so camping on Defend costs 6 CP/min. Expensive orders (3–4) win or deny a capture directly, so you save up ~20 s for one. Attack costs the **same CP whether you send 1 or 4 bots**, but sending All leaves the base empty: the risk is the price. The Ultimate is about a minute of saving and is the clutch play.
- **Comeback:** the team that **gets scored on** gets **+3 CP** at once (still capped at 10).
- **Carry-over:** CP carries over **within** a round (up to the cap). **Nothing carries between rounds**: the pool resets to 6, the order cap to 15, and the ultimate re-arms.
- **At 0 CP or 0 orders left:** bots keep playing on **autopilot** (free, identical for both sides). The order buttons grey out, but you can still pan the camera and read the board.
- **Fairness for the AI team:** the AI commander uses the same pool, regen, cap, cooldowns and costs, and the server validates them the same way. It gets no extra vision either (fog-filtered state). The autopilot code is shared by both teams.

### Autopilot (between orders)
- **Runner:** go to the enemy flag, then carry it home.
- **Guard:** stay within 6 tiles of the home flag and chase an enemy carrier in our half.
- **Roamer:** if our team has a carrier, escort it. Otherwise patrol midfield toward the last seen enemy.
- **Everyone:** **when tagged** → dizzy, then respawn at base after 3 s, then resume the current order if its TTL is still alive, else the role default. **Carrier panic:** if an enemy is within 3 tiles, path away from it toward home.
- A* on the 4-neighbour tile grid. Walls and crates block. Bushes are walkable but block vision. Replan every 500 ms or when the goal tile changes.

### Win / lose
- **First to 3 captures**, or the **6:00 clock** runs out and the higher score wins. A tie goes to **sudden death** (next capture wins). Then a 5 s result screen ("RED BOTS DID IT, commander spent 42 ⚡") and a new map.

---

## 3. Art / UI implications

### Command panel layout
**Phone portrait (e.g. 390×844):** the arena takes the top ~68% and the panel the bottom ~32%, in 3 rows.
```
[⚡■■■■■■□□□□ 6/10]  [📜 11/15]   [🍺 8]   <- row 1: budget bar, order counter, ultimate
[All][🤖1][🤖2][🤖3][🤖4]                  <- row 2: unit chips 44 px (badge shows current order)
[📣1][👀1][🏰2][🤝3][🚩3][🎯4][↪️4]         <- row 3: order buttons 48 px, horizontal scroll if narrow
```
- Order buttons: a 32×32 icon on a round bubble drawn at x1.5 (48 px), with the cost pip (16×16 ⚡ + number) at the bottom-right.
- Thumb zone: the ultimate sits top-right of the panel, away from the order row, so it doesn't get mis-tapped.
- Jump buttons (🏠🚩🏃) float top-right of the arena as 40 px bubbles.

**Desktop landscape:** the arena on the left, a **right panel 280 px** wide: budget bar and counter at the top, unit list (name, role, order, state), a 2×4 order grid at 64 px, the ultimate at the bottom. Hotkeys: `1–7` orders, `R` ultimate, `Tab` cycles a unit, `A` selects All, right-click = ping.

**Button states:** normal · pressed (1 px down, `face_hi` rim) · **unaffordable/cooldown** = icon at 40% alpha over `wall` #9A9AB8 with the cost number in `red_1`, plus a radial cooldown sweep in `shadow` 35% · **active** (the order being targeted) = a pulsing team-colour ring.

### How an AI-controlled unit reads
- **Current-order badge:** a 16×16 mini order icon in a 20 px bubble, 6 px above the head (above the existing flag-carried indicator, which stays loudest). It is shown on **own team only**. Enemies show no badge, so orders stay hidden from the other side.
- **Intent line:** a dashed line in team `_2` colour (`red_2` #FF7A6E / `bot_2` #DCC8FF) from the bot along its A* path (max 8 waypoints), ending in an 8×8 dot. Own team only, drawn in code. Always shown for selected bots, faint (40%) for the rest.
- **Thinking emote 💭:** a 16×16 "…" bubble, 3 frames at 120 ms, shown for 0.4 s after an order lands. The same bubble also plays while an AI commander's command is pending.
- **Not-enough-points emote 🪫:** a 16×16 empty-battery shake, shown over the panel's budget bar (and over the selected bot), with a toast "Need 4 ⚡".
- **Selection ring:** a 32×16 ellipse at the feet, in team `_1` with a 2 px `outline`, 2 frames (pulse) at 300 ms. It draws under the shadow layer's top.
- **Ping marker:** 32×32, a 3-frame ripple (ring grows) at 100 ms, then a 16×16 pin that holds for the order TTL. It uses the team colour. **Own team only.**

### Fog-of-war rules for orders
- Targeted orders (Rally, Reroute) need an **explored** tile. **Scout** may target unexplored tiles.
- **Tag that unit** needs the target to be **currently visible**.
- Attack/Defend/Escort use known positions (your own base and flags are always known; the enemy flag position counts as remembered, explored).
- An invalid target shows a 16×16 ❌ cursor and a "Can't see there" toast. The CP is not spent.

### New assets (palette: `palette.md` only; 2 px `#2B1B33` outline; light from the top-left)
| Pri | Asset | Size / frames | Notes |
|---|---|---|---|
| P0 | `ui_bubble` order button base | 32×32, 1f (+ pressed, disabled variants = 3f) | `eye_white` fill, team `_1` 2 px ring inside the outline |
| P0 | `ord_rally` 📣 megaphone | 32×32 | `face`/`face_shadow` body, `eye_white` sound arcs |
| P0 | `ord_scout` 👀 eyes | 32×32 | 2 eyeballs, `outline` pupils |
| P0 | `ord_defend` 🏰 base-pad castle | 32×32 | `wall`/`wall_dark` and a team flag (not a shield, which would clash with `pu_shield`) |
| P0 | `ord_escort` 🤝 buddy (two small faces) | 32×32 | `face`, `blush` |
| P0 | `ord_attack` 🚩 grabbing hand + flag | 32×32 | `wood` pole, enemy-colour cloth (no weapons) |
| P0 | `ord_tag` 🎯 target | 32×32 | `red_1` rings on `eye_white` (team-neutral) |
| P0 | `cp_icon` ⚡ energy coin | 32×32 and 16×16 | `face` coin, `face_shadow` rim, `face_hi` bolt |
| P0 | Budget bar pips | 8×12 segment ×2 states (full `face`, empty `wall_dark`) | the bar = 10 pips plus the cp_icon |
| P0 | `ui_orders_counter` 📜 scroll | 16×16 | `path` paper, `wood_dark` rods |
| P0 | Order badges (mini) | 16×16 ×6 (rally, scout, defend, escort, attack, tag) | downscaled, re-drawn, not resampled |
| P0 | Selection ring | 32×16, 2f at 300 ms | team mask `mask_1` → recolour |
| P0 | Ping marker | 32×32 3f ripple at 100 ms + 16×16 pin | mask-recoloured |
| P0 | `emote_thinking` 💭 | 16×16, 3f at 120 ms | dots `outline` on `eye_white` |
| P0 | `emote_broke` 🪫 not enough points | 16×16, 2f shake at 80 ms | `wall_dark` battery, `red_1` empty bar |
| P1 | `ord_reroute` ↪️ curved arrow | 32×32 + 16×16 badge | `eye_white` arrow on team `_1` |
| P1 | `ord_ultimate` 🍺 Beer Rush | 32×32 + 16×16 badge | the existing beer-crate language, `face_hi` foam |
| P1 | Beer Rush FX (speed lines and foam trail) | 32×32, 3f at 80 ms | `face_hi`, `eye_white` |
| P1 | Cooldown sweep overlay | code-drawn (`shadow` 35%) | no asset |
| P1 | Invalid-target cursor ❌ | 16×16 | `red_1` X, `outline` |
| P1 | Jump buttons 🏠 🚩 🏃 | 16×16 icons ×3 in a 40 px bubble | reuse base, flag, run art |
| P1 | Role chips (Runner/Guard/Roamer) | 16×16 ×3 | shoe, home, compass |
| P2 | Commander portrait (human vs AI 🤖 antenna) | 32×32 ×2 | for the score bar |
| P2 | Result-screen "CP spent" stamp | 64×32 | — |
*Intent line, dashed path and end dot are code-drawn, so they need no asset.*

---

## 4. Implementation guidance (3-hour scope)

### Flow steps
1. **Rebase PR #2** onto `main` (it is dirty). Keep `game.js` rules, the map gen and the atlas renderer.
2. **Server: spawn 4 bot units per team** at round start (`Match.reset`). Sockets no longer own units. A socket = a commander (`join {kind:"commander", side}`).
3. **Server: brain loop.** Each tick, before movement, set `unit.dx/dy` from the brain (below). Delete client `input` handling for commanders (keep it behind a dev flag).
4. **Server: economy + `command` handler** with validation and an ack/reject.
5. **Server: per-team state.** Add `order`, `role`, `path` to own units. Add a fog filter (`visible` from the 7-tile radius plus a Bresenham LOS check with walls/bushes as blockers; `explored` as a bitset per team).
6. **Client:** remove the joystick/WASD movement. Add the free camera, the command panel (DOM over canvas, which is fastest), tap → target mode, badges, intent line, ping, and emotes.
7. **AI commander:** turn `apps/bot/bot.js` into a commander. Example rule: "if CP ≥ 3 and no carrier, Attack with 2 bots; if an enemy carrier is seen, Tag". It goes over the same WS.
8. **Timer + sudden death**, then playtest with 1 phone + 1 desktop + the AI commander.

### Protocol additions (JSON over `/ws`)
```jsonc
// C→S
{ "type":"join", "name":"Greg", "kind":"commander", "side":"red" }      // kind: commander | ai_commander | spectator
{ "type":"command", "seq":17, "order":"attack",                          // rally|scout|defend|escort|attack|tag|reroute|ultimate
  "unitIds":["u3","u4"],            // or "all": true   (omit for team-wide orders)
  "target":{ "x":40, "y":22 } }     // or { "unitId":"e2" } for tag; omitted for defend/attack/escort/ultimate

// S→C (own team only)
{ "type":"command_ack", "seq":17, "cp":3, "ordersLeft":11, "cooldownMs":2000 }
{ "type":"command_rejected", "seq":17, "reason":"not_enough_cp", "need":4, "have":3 }
//   reason ∈ not_enough_cp | order_cap | cooldown | unit_cooldown | unexplored | not_visible
//            | invalid_target | not_your_unit | ultimate_used | not_commander | match_not_playing
{ "type":"ping", "team":"red", "x":30, "y":12, "by":"Greg", "ttlMs":10000 }

// S→C state (per team; enemy units appear only when visible, without order/path)
{ "type":"state", "tick":42, "phase":"playing", "clockMs":271000,
  "units":[{ "id":"u3","team":"red","x":5.5,"y":3.2,"dir":"right","state":"running","hasFlag":false,
             "role":"runner","order":"attack","orderTtlMs":0,"thinking":false,
             "path":[[6,3],[7,3],[7,4]] }],
  "economy":{ "cp":3,"cpMax":10,"regenMs":5000,"ordersLeft":11,"ordersMax":15,"ultimateReady":true },
  "fog":{ "visible":"<base64 bitset>", "exploredDelta":[[x,y],...] },
  "flags":{...}, "score":{...} }
```
Costs live in one server table `ORDER_COSTS` and go to clients in `welcome.economy.costs`, so the UI never hard-codes them. The server is the only judge: clients may grey a button early, but the server still validates.

### Server bot loop (per tick, 20 Hz)
```
regen CP per team; expire orders whose TTL is done
for unit in units:
  if tagged/respawn: continue
  goal = order ? goalFor(order) : goalFor(role)      // autopilot is free
  if carrier and enemyWithin(3): goal = home (panic)
  if goal.tile != unit.pathGoal or now - unit.lastPlan > 500ms:
      unit.path = astar(tiles, unit.tile, goal.tile)  // cache per goal; cap 2 replans per tick for the whole match
  steer toward next waypoint -> unit.dx, unit.dy  (existing collision/move code)
then existing pickup / capture / tag code
```
`handleCommand(team, cmd)`: is it a commander → match playing → order known → cap → global cooldown → unit cooldown → cost ≤ cp → target valid (explored/visible) → apply (`unit.order = {kind,target,ttl}`, `thinkingUntil = now+400`) → deduct → ack.

### Cut for 3 hours
- **Cut:** personalities/LLM persuasion text, the bounty reserve/refund ledger, the behaviour-tree editor, a minimap, the Reroute and Beer Rush orders (P1), co-commanders (first human per side only), mystery boxes, client prediction, per-bot hotkeys.
- **Keep (P0):** 4 bots per side, 6 orders (Rally, Scout, Defend, Escort, Attack, Tag), CP + cap + cooldown, autopilot roles with A*, own-team badges, intent line, ping, a simple fog (if short on time: visible/hidden only, no explored memory, and then the "explored" rule becomes "visible or own half"), first-to-3 plus a clock.

---

## 5. Open questions for Grzegorz
1. One flag per base (PR #2, already built) or one neutral centre flag (concept doc)? *Rec: per base.*
2. Is 1 commander + 4 bots per side right, or do you want 3 or 5 bots per side?
3. Are the economy numbers OK (start 6 CP, +1 every 5 s, cap 10, 15 orders per round, +3 CP comeback)?
4. Should the AI commander be the simple scripted `bot.js`, or a real Grok Bot (LLM) issuing orders every ~10 s?
5. Keep Beer Rush as a once-per-round 8 CP ultimate, or cut it from the slice?
