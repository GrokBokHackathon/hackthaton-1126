# Issue-ready tickets: bots play, humans command (art + logic)
The full design is in bots-play-flow.md. The art pack is in /workspace/flag-raid (atlas.json, sprite-spec.md). The order is the suggested build order.

## 1. Decision: switch to commander model (docs)
Update DECISIONS.md and the README: all units are bots, and each team has 1 commander (a human or an AI) who spends command points (CP) on orders. Remove the WASD/joystick unit control from scope.
- [ ] A new DECISIONS entry supersedes §1 L153, §2 L161-163 and §8 L195-199
- [ ] The README no longer says "keyboard movement" or "humans vs bots" as units
- [ ] The flag rule is picked and written down (one per base, recommended, vs one neutral centre flag)

## 2. Bot autopilot with A* pathfinding
Replace the straight-line walking in bot.js with A* on the 32 px tile grid, so units stop getting stuck on walls.
- [ ] Bots path around walls and crates; bushes can be walked through
- [ ] Roles Runner, Guard and Roamer, with 4 bots per team by default (configurable)
- [ ] A tagged bot respawns after 3 s at its base and goes back to its last order
- [ ] A bot carrying the flag heads home and steers away from any enemy within 4 tiles

## 3. Orders and the CP economy (server logic)
Accept `command {seq, order, unitIds|all, target}`, check it, and apply it.
- [ ] Costs: rally 1, scout 1, defend 2, escort 3, attack 3, tag 4
- [ ] Start at 6 CP, +1 every 5 s, cap 10; 15 orders per round; 2 s global cooldown; 5 s cooldown per bot
- [ ] The team that was just scored on gets +3 CP; CP resets every round
- [ ] Replies `command_ack` or `command_rejected {reason}` with not_enough_cp, no_orders_left, cooldown, target_not_explored or target_not_visible
- [ ] At 0 CP or 0 orders left, bots keep playing on autopilot
- [ ] The AI commander uses the same message and the same limits

## 4. Fog of war (server-side)
- [ ] Vision radius is 7 tiles; walls and bushes block line of sight
- [ ] Each team's `state` carries only the enemies that team can see, plus its own explored and visible masks
- [ ] Orders can only target explored tiles (Scout is exempt); Tag needs a target visible right now
- [ ] Client draws 3 states: unexplored = #1A1020 solid, explored = #1A1020 at 60%, visible = no overlay (spec in sprite-spec.md)

## 5. Commander camera and view
- [ ] The camera pans and drags freely instead of following one unit; double-tapping a bot centres on it
- [ ] Zoom = shortSidePx / (16*32); whole-number zoom with nearest-neighbour when >= 2, otherwise fractional with smoothing
- [ ] The same experience on phone portrait and desktop landscape

## 6. Command panel UI
Use the ui_orders, ui_economy and fx_command sheets (placeholders, layout in the mocks).
- [ ] Phone: panel along the bottom. Desktop: panel on the right side
- [ ] 6 order buttons, each with its CP cost; greyed out when the team can't afford it or it's on cooldown, plus a cooldown sweep
- [ ] A budget bar (x/10 CP) and an orders counter (x/15)
- [ ] Flow: select a bot or All, tap an order, tap a target; an invalid target shows an X cursor and a reason
- [ ] A rejected order plays the "not enough points" emote over the panel

## 7. Unit readability (client)
- [ ] A 16x16 badge for the current order sits above each bot of your own team (enemies show no badge)
- [ ] The selected bot gets a selection ring and an intent line along its path (own team only)
- [ ] A "thinking" emote while a bot is re-planning; a ping ripple and pin at the target of a rally order
- [ ] Every frame comes from atlas.json; switching to final art only changes file paths

## 8. Round loop
- [ ] Win at 3 captures, or the higher score at 6:00; a tie goes to sudden death (next capture wins)
- [ ] A new procedural map every round, with bases in opposite diagonal corners
- [ ] A result screen with the score, then the next round starts after 10 s

## Out of scope for the hackathon
LLM persuasion, the bounty ledger, co-commanders, Reroute, Beer Rush, the minimap, mystery boxes.
