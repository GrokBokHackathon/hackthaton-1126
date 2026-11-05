# Command panel handoff

Isolated presentation module for issue 9. It is not mounted by `apps/web/game.js` and it does not talk to the match server. `wiredToServer` and `wiredToGameClient` are both false.

## What was read

Fetched live on 2026-11-05 from `GrokBokHackathon/hackthaton-1126`:

| Issue | Title | Comments |
| --- | --- | --- |
| [#4](https://github.com/GrokBokHackathon/hackthaton-1126/issues/4) | Commander model decision | none |
| [#6](https://github.com/GrokBokHackathon/hackthaton-1126/issues/6) | Orders and the command-point economy | none |
| [#9](https://github.com/GrokBokHackathon/hackthaton-1126/issues/9) | Command panel UI | none |

Issue 6's body says the economy numbers are decided and that the server should accept `command {seq, order, unitIds|all, target}` and answer `command_ack` or `command_rejected {reason}`. Checked `apps/server/server.js` on this branch's base: the socket accepts `join`, `input`, and `ping` only. There is no `command` handler and no `command_ack` / `command_rejected` sender. This module therefore does not claim a live command API.

Issue 6's amounts (order costs, 6 CP start, +1/5s, cap 10, 15 orders, 2s/5s cooldowns, +3 comeback, Beer Rush, AI every 10s) are **not** copied into the panel. The coordinator's contract for this task says those amounts and AI mode are still blocked. The panel shows server-supplied numbers only. Missing numbers stay `unknown`, and orders stay disabled until a capability says `enabled: true`.

Issue 4's doc updates (DECISIONS.md / README) are out of scope here. Issue 9's art filenames are recorded below. Those files are not in the repo. `apps/web/assets/atlas.json` has no command-panel frames.

## Files

- `apps/web/command-panel.js` — session, payload builder, DOM mount
- `apps/web/command-panel.css` — `cp-` styles and the phone/desktop shell
- `apps/web/command-panel.test.mjs` — module tests
- `apps/web/dev/command-panel.preview.html` — harness only. Not linked from the game
- `docs/COMMAND_PANEL_HANDOFF.md` — this note

Not changed: `apps/web/game.js`, `apps/server/server.js`, `apps/server/game.js`, `docs/PROTOCOL.md`, Dockerfile, nginx config.

`apps/web/Dockerfile` copies every `*.js` and `*.html` from `apps/web/` into the image. The next image build will therefore contain `command-panel.js` even though nothing imports it. It will not contain `command-panel.css` or `dev/command-panel.preview.html`. Serving the stylesheet is remaining core/web wiring. This change does not edit the Dockerfile.

## Exports

Import from `apps/web/command-panel.js`.

| Export | Role |
| --- | --- |
| `mountCommandPanel(container, options)` | Creates the panel. Returns the controller below. |
| `createCommandSession({ onCommand })` | Same rules with no DOM. |
| `buildCommandPayload({ seq, order, selection, target })` | `{ ok, payload }` or `{ ok:false, error }`. |
| `layoutForViewport({ width, height })` | `{ mode, dock, arenaHeightRatio, panelMinPx, panelWidthPx, breakpointKnown }`. |
| `applyCommandPanelShell(shell, mode)` | Sets `cp-shell--phone` or `cp-shell--desktop`. `mode` may be `"phone"`, `"desktop"`, or `"auto"`. |
| `paintCommandPanel(parts, viewModel, context)` | Writes one view into `{ root, body, emote, polite, assertive }`. |
| `viewModelToHtml(viewModel, { idPrefix })` | Body markup. |
| `rejectionText(code)` | English for a known issue 6 reason. |
| `COMMAND_ORDERS` | The six issue 9 orders: id, label, frame. No costs. |
| `COMMAND_FLOW_STEPS` | `select`, `order`, `target`. |
| `KNOWN_REJECTION_REASONS` | `not_enough_cp`, `no_orders_left`, `cooldown`, `target_not_explored`, `target_not_visible`, `already_used`. |
| `LAYOUT_RULES` | Phone arena ratio `0.63`, phone panel minimum `300`, desktop minimum width `900`, desktop column `360`, pip row limit `16`. |
| `PLACEHOLDER_ASSETS` | Issue 9 filenames and frames. `status` is `"missing"`. |
| `SERVER_STATE_FIELDS` | Shape of `update()`. |
| `COMMAND_PANEL_INTEGRATION` | `{ wiredToServer: false, wiredToGameClient: false, payloadType, resultTypes }`. |
| `COMMAND_PANEL_VERSION` | `1`. |

### `mountCommandPanel` options

- `onCommand(payload)` — required before a command can be delivered. The panel does not open a socket.
- `layout` — `"phone"`, `"desktop"`, or `"auto"` (default). Auto uses `window` resize.
- `listenResize` — set false to keep a forced layout.
- `injectStylesheet` — default true. Inserts `<link id="cp-stylesheet">` pointing at `command-panel.css` next to the module.
- `stylesheetHref` — override that URL.
- `idPrefix` — defaults to a unique `cpN`.
- `document` — defaults to `container.ownerDocument`.

### Controller

- `update(patch)` — merge. Omitted keys are left as they were. `null` clears that key back to unknown.
- `setSelection(selection)` — unit ids only. See forms below.
- `setTarget(target, meta)` — opaque target from the camera/core bridge.
- `getCursorHint()` — `{ cursor: "default" \| "target" \| "invalid", frame: null \| "cursor_invalid" }`. This panel does not move a canvas cursor.
- `getViewModel()` — current presentation state, including `lastPayload` and `pendingSeq`.
- `getLayout()` — `"phone"` or `"desktop"`.
- `destroy()` — removes the panel. Later calls no-op.
- `root` — the `<section>`.

The container must have a real height (the shell dock does). The panel root is absolutely positioned inside a `cp-mount` wrapper so a tall button list scrolls inside the dock instead of growing the page.

## Shell the integrator owns

Suggested mount, not applied to `game.html`:

```html
<div id="command-shell" class="cp-shell cp-shell--phone">
  <div class="cp-arena-slot"><!-- camera/canvas stays here --></div>
  <div class="cp-dock" id="command-dock"></div>
</div>
```

```js
import { applyCommandPanelShell, mountCommandPanel } from "./command-panel.js";

applyCommandPanelShell(document.getElementById("command-shell"), "auto");
const panel = mountCommandPanel(document.getElementById("command-dock"), {
  onCommand(payload) {
    // core sends this on the socket once a command API exists
  },
});
```

Phone (`layoutForViewport` when the viewport is not both at least 900px wide and wider than it is tall): column, arena `flex-basis: 63%`, dock `37%` with `min-height: 300px`. Desktop: row, dock `360px` on the right.

The 900px and 360px values are presentation choices. Issue 9 specifies the dock side, the about-63% arena, and the about-300px phone panel. It does not specify the breakpoint or the desktop column width. On a viewport shorter than about 811px, the 300px minimum makes the arena smaller than 63%. Measured in headless Chrome: 390×844 keeps the dock at about 311px; 360×640 keeps the 300px minimum and the last button row is tight against the bottom edge.

## Server snapshot

`update` accepts:

```js
{
  units: [{ id, name, selectable }],   // omit if the roster is unknown
  budget: { current, cap },             // both numbers, or the readout stays unknown
  orderCount: { used, max },            // both numbers, or the counter stays unknown
  capabilities: {
    orders: [
      {
        id,                // required
        label,             // optional
        frame,             // optional
        cost,              // optional number; omitted => "CP unknown"
        enabled,           // must be true to allow the order
        disabledReason,    // issue 6 code, or prose if it contains a space
        cooldown: { remainingMs, durationMs } // optional
      }
    ]
  },
  commandResult: { type: "command_ack", seq } |
                 { type: "command_rejected", seq, reason },
  nextSeq: 8               // positive integer; see sequence below
}
```

`capabilities.orders` may also be an id-keyed object.

Rules this panel actually applies:

- No capabilities, or an order missing from them: button disabled, reason "Waiting for the server", cost "unknown". No sweep.
- `enabled` must be boolean `true`. Anything else is disabled.
- The panel does **not** compare `cost` with `budget`. A supplied cost is label text only.
- A partial budget (`current` without `cap`, or the reverse) stays unknown. Same for `orderCount`.
- Cooldown omitted: no timer is invented. `enabled` stands.
- Cooldown object missing either millisecond field, or `durationMs <= 0`: status `unknown`, button disabled, no sweep.
- `remainingMs > 0` and a positive `durationMs`: button disabled, reason `cooldown` unless the server already sent a `disabledReason` while `enabled` was false, and a CSS conic sweep of `remaining/duration` is drawn.
- `remainingMs <= 0` with a valid duration: cooldown `clear`, no sweep.
- Pips (`pip_full` / `pip_empty`) render only when `current` and `cap` are integers, `0 <= current <= cap`, and `cap <= 16`. Otherwise the numeric text is shown alone. `16` is a row-length limit, not a command-point cap.
- An order id outside the six catalog entries (for example a later `beer`) is appended only when the snapshot lists it. This module has no Beer Rush price or rule.
- While a command is pending, selection, order, and target changes do not send a second payload.
- A `command_rejected` whose `seq` matches the pending seq (or whose seq is omitted) shows the `emote_broke` placeholder and an assertive live region. `target_*` reasons stay on the target step with cursor `invalid`. Other reasons return to the order step and keep the selection.
- A rejection whose `seq` does not match the pending seq is announced and does not clear the in-flight command.
- `command_ack` clears the pending order and keeps the selection.

## Selection and target

`setSelection` accepts:

- `"all"`, `{ all: true }`, or `{ unitIds: "all" }`
- `{ unitIds: ["b1", "b2"] }` — ids are copied through; order is kept; duplicates dropped
- `null` or `{ unitIds: [] }` — clear
- an object that only has `x` / `y` — rejected with `coordinates`. No conversion is attempted.

A unit with `selectable: false` cannot be selected. Unknown ids are allowed when the roster did not mark them. Panel clicks select one id or All. A bridge may pass several ids; the payload will list them. This module does not decide whether multi-select is legal.

`setTarget(target, meta)`:

- Call it only after a selection and an enabled order. Otherwise nothing is sent.
- `meta.valid === false` or a target object with `valid: false` does not send. `meta.reason` or `target.reason` is shown. Cursor hint becomes `{ cursor: "invalid", frame: "cursor_invalid" }`.
- Any other non-null `target` is cloned onto the payload unchanged. `x` and `y` are not interpreted.

## Payload

Specific units:

```json
{ "type": "command", "seq": 1, "order": "rally", "unitIds": ["b1"], "target": { "ref": "bridge-target" } }
```

All:

```json
{ "type": "command", "seq": 2, "order": "scout", "all": true, "target": { "ref": "bridge-target" } }
```

`unitIds` and `all` are mutually exclusive. There is no `cost` field. `target` is whatever the bridge passed.

Sequence: until `update({ nextSeq })`, the panel assigns a local correlation integer starting at 1. That is not a claim that the server owns or echoes seq. After `nextSeq` is passed, the panel uses that value once and then waits for another `nextSeq`. A send without a seq reports "Sequence number is unavailable" and does not call `onCommand`.

`onCommand` missing: nothing is sent, step stays on target. `onCommand` throwing: "Command was not delivered.", seq is spent, step stays on target.

## Art

Placeholder policy matches `docs/ART_INTEGRATION.md`: missing images are labeled fallbacks, not stand-in final art. Expected files, all absent:

- `ui_orders_placeholder.png`
- `ui_economy_placeholder.png`
- `fx_command_placeholder.png`
- mockup references `ui_mock_portrait.png`, `ui_mock_landscape.png` (not used as assets)

Frames named on elements via `data-frame` / `data-order-frame` / `data-disabled-frame`: `ord_rally`, `ord_scout`, `ord_defend`, `ord_escort`, `ord_attack`, `ord_tag`, `btn_disabled`, `pip_full`, `pip_empty`, `cp_coin_16`, `orders_counter`, `cursor_invalid`, `emote_broke`. `data-art="placeholder"` is set on those nodes. The rejection emote is a dashed label, positioned above the phone dock and at the top of the desktop column.

## Accessibility

- Region label "Command panel".
- Steps expose `aria-current="step"`.
- Disabled orders use `aria-disabled` and `aria-describedby` (not the `disabled` attribute) so the reason can be focused.
- Polite live region: guidance, pending, acknowledged.
- Assertive live region: invalid target, rejection, delivery failure.
- Cooldown sweep is `aria-hidden`; the button text includes the supplied seconds.
- `:focus-visible` rings. `prefers-reduced-motion` and `forced-colors` are covered in the stylesheet.

## Tests

```text
node --test apps/web/command-panel.test.mjs
# tests 19
# pass 19
# fail 0

npm test --prefix apps/server
# tests 8
# pass 8
# fail 0
```

Server tests are the existing map/match/health suite. They were not modified.

Browser check: headless Chrome against `apps/web/dev/command-panel.preview.html` (python http.server, not the game server). Chrome was given `--screenshot` and did not exit on its own; the PNGs were written and the process was then stopped. This was not a physical phone.

| Viewport | Scenario | What was visible |
| --- | --- | --- |
| 390×844 | unknown | Bottom dock. Rules, CP, and orders read "unknown". Six orders disabled. |
| 390×844 | supplied fixture | Dock about 311px tall. `4/10` pips and `Orders 2/15` from the fixture only. Six orders, mixed disabled reasons, attack cooldown sweep. |
| 390×844 | flow / rejected | DOM clicks on All and Rally, then `setTarget`. Arena log showed the `command` payload and "not sent to a server". Rejection showed `emote_broke` text above the panel and "Not enough command points". |
| 1280×800 and 1440×900 | supplied / rejected | Panel on the right, six orders visible, same states. |
| 360×640 | supplied | 300px minimum wins, so the arena is under 63%. Last button row sits on the bottom edge. |

The fixture numbers in the preview are not module defaults. Clearing the snapshot returns every economy slot to unknown.

## Remaining core wiring

1. Implement the real `command` / `command_ack` / `command_rejected` path in the server, then call `onCommand` from the client socket code. Do not treat this module as that path.
2. Agree the target object and the selection bridge with the camera owner. This module will not convert world coordinates.
3. Push budget, order count, per-order `enabled`, `disabledReason`, `cost`, and cooldown milliseconds from the server. Until those fields exist, the panel stays on the unknown state.
4. Decide who allocates `seq`. Pass `nextSeq` if the server allocates it.
5. Decide whether Beer Rush is a seventh button. It appears only if the snapshot lists it.
6. Link `command-panel.css` when the panel is mounted in the real page, and teach the web image to serve that file.
7. Drop the issue 9 PNGs in later. Keep `data-art="placeholder"` until they load. This module does not load them yet.
8. AI commander mode is untouched.
