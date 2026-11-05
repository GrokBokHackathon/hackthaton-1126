# Game concept proposal v0.1 — patrons and autonomous heroes

**Status: first discussion proposal.** This document is a v0.1 idea for the team to accept, revise, or reject. It is not approved implementation scope. It does not record a decision, a protocol, or behavior that exists in code.

Coordinator note: Pan Wiktor identified this path (`docs/GAME_CONCEPT_V0_1.md`) as the proposed destination. The language is English, matching the rest of the repository.

## How to read the numbers

Every tuning number in this document is **provisional**. Score target, match clock, respawn delay, flag-reset delay, and the patron proposal interval are starting points for a conversation and a later playtest. They are not engine constants. Purse size, income, task prices, and the carrier slowdown are deliberately left open. This draft does not claim the economy or the combat math is solved.

## Relationship to the baseline

The baseline on `main` stays **realtime Capture the Flag: n humans versus m Grok Bots**. [README.md](../README.md) and [docs/DECISIONS.md](DECISIONS.md) describe that game. Humans and Grok Bots are the players. They move themselves on one shared 2D map. Both counts can be more than one. On `main` today that match is still a target: the tree has a mock connectivity scaffold (HTTP health and WebSocket `/ws` echo), and it does not contain map, movement, or flag logic. [PROTOCOL.md](../PROTOCOL.md) is the mock wire contract. This proposal does not edit it.

This file is an **alternative proposal** beside that baseline. It is a different way to play, offered for discussion:

- Two human **patrons**.
- Each patron influences **three autonomous AI heroes**.
- Heroes pursue personality and accepted tasks. Patrons do not pilot hero bodies.

Merging this file does not replace the baseline, does not close the open questions in the decision log, and does not adopt this mode as the product. A change of product would be a separate, explicit decision in `docs/DECISIONS.md`. Concurrent direct-control work (pull request #2, branch `cursor/playable-slice-cba3`) is out of scope for this document. This proposal does not rewrite that work and does not describe it as the contents of `main`.

## Pitch

A Majesty-inspired, beer-friendly casual versus match. Control is indirect. Two friends watch six heroes on a small map, spend equal replenishing budgets, and try to talk their own heroes into a flag run. The tone matches the hackathon: silly, short, and playable between drinks. The interesting failure is a hero who explains itself and still does something in character. The uninteresting failure is a hero that obeys whichever prompt was longest.

## Players and roster

Two human players. Each one is a patron with the same three heroes. The roster is mirrored so neither side starts with a unique role.

| Role | Personality | What they seek |
| --- | --- | --- |
| Warrior | Greedy | Paid combat |
| Scout | Vain | The flag and personal glory, while avoiding unequal fights |
| Support | Loyal | Allies first |

Six heroes total. No extra unit types in this proposal.

## Match sketch

Small map, two routes, six heroes. One **neutral flag** begins at the center. Each patron has a base. A hero scores by carrying that flag to their own base. This is one shared flag, not one flag planted in each base.

Provisional match rules, for discussion only:

- A carry into the carrier's own base scores **one point**.
- **First to 3** points wins, if that happens before the clock.
- The match clock is **8 minutes**.
- If the clock expires and the scores are **unequal**, the side with more points wins.
- If the clock expires and the scores are **tied**, the match enters **sudden death**: the next point wins. This sketch adds no second clock.
- The flag carrier is **visible** to both sides and moves **slower** than the other heroes. The exact speed reduction is an open playtest question.
- On defeat, the carrier **drops** the flag.
- If a dropped flag stays **untouched for 10 seconds**, it **resets to the center**.
- A defeated hero **respawns after 10 seconds**. Where the hero reappears is unspecified here.

The engine would own flag state and score. This document does not define hit points, damage, attack range, or a tag rule. "Defeat" is the moment the engine says a hero is out, after which the drop and respawn timers above would apply.

## Patron influence

A patron does not steer. A patron sends a **proposal**. One proposal contains:

1. **Selected hero** — one of that patron's three heroes.
2. **Objective** — one of: **capture**, **escort**, **intercept**, **defend**.
3. **Reserved bonus** — an amount set aside from that patron's budget.
4. **Optional short message** — persuasion, not a script and not a stat change.

Plain meanings of the four objectives, still provisional:

- **Capture** — pursue the flag and bring it to the patron's base.
- **Escort** — accompany an ally, usually the carrier or the scout.
- **Intercept** — move to stop an enemy, usually the carrier.
- **Defend** — hold a place or stay with a base or the flag site.

**One proposal per 10 seconds per human.** That cadence is the spam limit in this sketch. A longer message, a louder message, or a message that claims to be higher priority does not grant extra power. The strongest prompt does not win, and the longest prompt does not win.

Both patrons have **equal, replenishing budgets**. The sketch of a bonus is:

- **Reserved** when the hero accepts the task (no longer spendable, not yet paid).
- **Paid** when the hero completes the task.
- **Refunded** when the task fails.

Amounts, income rate, and prices are open playtest questions. Acceptance, completion, and failure are not fully defined below; see the open questions before treating this ledger as final.

## Heroes, persuasion, and the engine

Heroes are autonomous. Given a proposal, a hero **chooses the method**. The intended behavior is a readable choice of how to pursue the objective, not a capricious rejection of the task.

- Personality and the visible situation shape the method and the emphasis.
- The hero shows **visible intent** and a **concise reason**.
- The hero **replans** when the visible situation changes.
- Persuasion can matter because a hero has a personality. A loyalty appeal is aimed at the support; a combat bonus is aimed at the warrior; glory and the flag are aimed at the scout.

Persuasion has a hard boundary. It never:

- changes the game rules,
- grants stats or other mechanical buffs,
- controls an opponent's hero,
- overrides engine policy or safety rules.

**The model owns high-level goals only.** The **engine** owns pathfinding, combat, which actions are legal, flag state, and score. A message cannot award a point, move a flag, or make an illegal action legal.

If an AI response is late, the hero **keeps the last valid plan**. If there is no valid plan, the engine uses a **safe fallback**: the hero continues a legal action, and the match clock, flag, and score stay consistent. A slow model is not a pause and not a forfeit.

## Worked example

The vain scout is carrying the flag and is keeping away from the enemy warrior, because that fight looks unequal. The scout's patron proposes **escort** for their loyal support, reserves a bonus for that escort, and adds a short appeal to loyalty: stay with the scout, they are on our side. The opposing patron proposes **intercept** for their greedy warrior and reserves a combat bonus, because that hero seeks paid fighting. The scout still chooses the path, the support chooses how to stay close, and the warrior chooses how to take the fight. What each of them does next comes from personality and the situation they can see. It does not come from which human wrote more text.

## Minimal prototype, if the team later wants one

A first experiment, only after an explicit decision, would be the match sketch above: six heroes, a small two-route map, one center flag, patron proposals, visible intent, and engine-owned movement, combat, flag, and score.

That minimal prototype excludes:

- base construction,
- crafting,
- equipment progression,
- a metagame (unlocks, loadouts, seasons, or between-match progression).

It also adds no mystery-box powerups and no behavior-tree editor. Those remain separate items in the decision log for the baseline game.

## Playtest question

The question for a playtest is **agency versus arbitrary behavior**.

- Do the six heroes read as greedy, vain, and loyal, and do they replan when the flag, a fight, or an ally changes?
- Does a patron's proposal change what heroes attempt, while a longer or more forceful message still fails to beat a shorter one?
- Does one proposal every 10 seconds keep spam from becoming the game?

A successful playtest is heroes with readable reasons. It is not a contest of prompt length or prompt force.

## Open questions

Nothing in this list is fixed. These are the questions a discussion or a playtest would have to answer before anyone could call the mode specified.

1. **Defensive camping.** Does **defend**, plus a slower visible carrier, make sitting on a base or on the flag the dominant plan? What, if anything, should make a permanent camp a poor plan?
2. **Task commitments and refund exploitation.** How long does an accepted task bind a hero? Who decides failure? Can a patron reserve a bonus, arrange a fail, and take the refund on purpose?
3. **Economy tuning.** Purse size, replenishment rate, and the price of each objective are unknown. Equal replenishing budgets are the only budget commitment in this draft. Balance would be a result of playtests, not a number this v0.1 pretends to know.
4. **AI latency and cost.** How slow or expensive can a replan be before "keep the last valid plan" feels like the patron is being ignored? Model calls have a cost on the team host; this draft does not set a budget for them.
5. **Comeback and personality balance.** First to 3 inside an eight-minute cap may snowball. The vain scout may avoid too many fights. The greedy warrior may take all of them. Mirrored rosters are a fairness starting point, not evidence that the sides feel even. Sudden death covers a tie at the cap only; it does not by itself fix a one-sided match.

Related details this v0.1 also leaves unspecified, on purpose: the carrier's exact slowdown, the respawn point, the map's dimensions, and any character limit on the optional message beyond the rule that length does not buy power.

## What this file is asking for

A discussion. Comments, a revised v0.2, or an explicit "not this" are all complete outcomes. Implementation would start only after the team writes a decision. Until then, the product on `main` remains realtime Capture the Flag for n humans versus m Grok Bots, and this page remains a proposal.
