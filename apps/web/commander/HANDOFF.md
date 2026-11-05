# Commander camera and unit readability handoff

Status: **MODULE-READY**. **Not integrated.** `apps/web/game.js` is unchanged. CTF Developer owns that file and applies the hook below.

Contract version: `2026-11-05.1` (`HANDOFF_VERSION`).

Issues: [#8](https://github.com/GrokBokHackathon/hackthaton-1126/issues/8) camera, [#10](https://github.com/GrokBokHackathon/hackthaton-1126/issues/10) unit readability. This document does not close them.

Main checked before handoff: `687c16e`. Atlas rects and the world-transform math match that tree. The only `game.js` change since the art merge removes a duplicate `const time` in `render` and does not change the camera. Tile size 32, pivot Y 30, teams `red` and `bot`, player `x`/`y` in tiles, and `welcome.map.width` / `welcome.map.height` are the live contracts this module reads. It does not import `game.js`, `assets.js`, or `spriteLoader.js`.

## Public exports

Import from `apps/web/commander/index.js`.

| Export | Role |
| --- | --- |
| `HANDOFF_VERSION` | `"2026-11-05.1"` |
| `TILE_SIZE` | `32` |
| `ORDER_IDS` | `rally`, `scout`, `defend`, `escort`, `attack`, `tag`, `beer` (issue 6). Not `reroute` (issue 11, out of scope) |
| `REMOVED_MOVEMENT_CONTROLS` | `keyboard-wasd`, `keyboard-arrows`, `on-screen-joystick` |
| `TEAM_COLORS` | `red: #C42032`, `bot: #A27BFF` |
| `atlasFrame(name)` | `{ name, group, image, x, y, w, h }` or `null` |
| `READABILITY_FRAME_NAMES` | Frame names below |
| `computeZoom(viewportWidth, viewportHeight, tileSize?)` | Issue 8 scale |
| `visibleShortSideTiles(viewportWidth, viewportHeight, zoom, tileSize?)` | Tiles on the short side |
| `createCameraState({ viewportWidth, viewportHeight, bounds, focusX?, focusY? })` | Initial state. Focus is world pixels. Default is map center |
| `updateCamera(state, input, dt, bounds)` | Next state. Does not mutate inputs |
| `cameraTransform(state, bounds)` | World pass `{ offsetX, offsetY, zoom, smoothing, imageSmoothingEnabled, space: "world", focusX, focusY, shortSideTiles, nominalShortSideTiles }` |
| `screenSpaceTransform()` | `{ offsetX: 0, offsetY: 0, zoom: 1, space: "screen" }` |
| `layoutScreenRect(rect, transform?)` | HUD rect in screen pixels. Default transform does not zoom |
| `worldToScreen(state, bounds, worldX, worldY)` | World pixels to screen pixels |
| `screenToWorld(state, bounds, screenX, screenY)` | Screen pixels to world pixels |
| `tileToWorld(tileX, tileY, tileSize?)` | `player.x/y` tile space to world pixels |
| `worldToTile(worldX, worldY, tileSize?)` | Inverse |
| `boundsFromMap(map, tileSize?)` | `{ mapWidth, mapHeight, tileSize }` from `welcome.map`. Does not read `tiles` |
| `createPointerTracker(options?)` | `{ handle(event, context), reset() }` |
| `hitTestUnit(screenX, screenY, units, cameraState, bounds, tapRadiusTiles?)` | Closest unit already in `units` |
| `mountCameraInput(target, onGesture, options?)` | Pointer listeners on `target` only. Returns `unmount` |
| `renderUnitOverlay(input)` | `{ markers, warnings, drawOrder }` |
| `paintUnitOverlay(ctx, markers, drawSprite)` | Draws markers. `drawSprite(ctx, frame, x, y, w, h) === true` skips fallback |

Importing the package does not fetch, open a socket, or register listeners.

## Camera state

```js
{
  focusX,          // world pixels at the requested view center, after clamp
  focusY,
  viewportWidth,   // CSS pixels, same space as canvas.width in current game.js
  viewportHeight,
  tileSize,        // 32
  zoom,            // derived cache; cameraTransform recomputes it
  smoothing        // true means ctx.imageSmoothingEnabled during the world pass
}
```

`zoom = shortSide / (16 * 32)`. If that value is `>= 2`, it is floored and `smoothing` is false (nearest-neighbour). Below 2 it stays fractional and `smoothing` is true. Integer flooring can show slightly more than 16 tiles. It does not show fewer.

There is no module-global camera. The call CTF described as `updateCamera(input, dt, bounds)` is settled as:

```js
state = updateCamera(state, input, dt, bounds);
```

`dt` is milliseconds. It is part of the signature and is not applied to drags. `input.panScreenX` / `panScreenY` are screen pixels for that update (positive pan follows the pointer, so focus decreases). Multiplying them by `dt` would make the same drag depend on frame rate.

```js
input = {
  viewportWidth,   // optional
  viewportHeight,  // optional
  panScreenX,      // optional screen pixels
  panScreenY,
  centerOn: { x, y, space }  // optional. space "tile" (default) or "world-px"
}
```

`input.zoom` is ignored. Pinch does not change zoom. Bounds:

```js
bounds = { mapWidth, mapHeight, tileSize }  // tiles, from boundsFromMap(welcome.map)
```

The world transform matches current `game.js`: `ctx.translate(offsetX, offsetY)` then `ctx.scale(zoom, zoom)`. World pixel `(tileX * 32, tileY * 32)` is the same point the current follow-camera uses for `player.x/y`. The map stays clamped to the viewport the same way `game.js` clamps today.

Set `imageSmoothingEnabled` only inside the world `save`/`restore`. Screen-space HUD must use `screenSpaceTransform()` and must not copy `smoothing` from the world pass.

## Input

`createPointerTracker().handle(sample, context)` takes:

```js
sample = { type, pointerId, x, y, timeMs }
// type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel"
// x,y are local to the canvas, the same space as viewportWidth/Height

context = { units, cameraState, bounds }
```

- Drag past 8px emits `{ panScreenX, panScreenY }`.
- Two taps within 300ms and 24px on the **same unit id** emit `{ centerOn: { x, y, space: "tile" } }`.
- A single tap reports `gesture: "tap"` and `unitId` and does not select and does not center. Selection stays with the command panel (issue 9).
- A second pointer does not zoom.
- `movementInput` is always `null`.

`mountCameraInput(element, onGesture, { getContext })` listens for pointer events on that element, converts `clientX/clientY` with `getBoundingClientRect`, and calls `onGesture` with the tracker result. Call the returned function to remove those listeners. It does not call `preventDefault`.

`hitTestUnit` only considers `context.units`. A unit that is not in that array cannot be centered. Radius is 0.75 tiles of client slop, not the server pickup or tag radius.

## Unit renderer

```js
renderUnitOverlay({
  nowMs,
  viewerTeam,       // "red" | "bot" | null. welcome.team. Not a new snapshot field
  selectedUnitId,   // client selection. Not a snapshot field. null draws no ring
  units,            // already filtered by core. This is the only unit list consulted
  presentation,     // { [unitId]: { order, replanning, path } } client annotation, not a snapshot
  mapPings,         // [{ id, team, x, y, startedAtMs }] world markers, not WS {type:"ping"}
  camera,           // camera state
  bounds,
  layout            // optional { tileSize, pivotY }. Defaults 32 and 30
})
```

Rules:

- Do not pass hidden units. This renderer does **not** read `explored`, `visible`, or fog masks. A `visible: false` property does not drop a unit, because a second filter could disagree with the server mask. Filtering stays in core.
- An id that appears only in `presentation` or `selectedUnitId` and is absent from `units` produces a warning and **no marker**. Paths for those ids are not copied into markers or warnings.
- `badge_<order>` (16×16) is drawn for a friendly unit only. Enemies get no badge. Unknown orders, including art-pack `reroute`, warn `unknown-order` and draw nothing.
- The selected unit gets `sel_ring_<team>_0/1` (200ms) and a dotted intent line along `presentation[id].path` only when that unit is on `viewerTeam`.
- `emote_thinking_0..2` (200ms) plays while `presentation[id].replanning === true` for a unit that is in `units`.
- Each `mapPings` entry draws `ping_<team>_0..2` (100ms, one shot, 300ms) and `pin_<team>` at the target for as long as the caller leaves the entry in the array. This module does not invent a pin lifetime.
- Badge destination size is at least 16 screen pixels when zoom is below 1 (`screen = max(16, 16 * zoom)`, world size `screen / zoom`). Other markers use the atlas frame size in world pixels.
- `drawOrder`: intent line, pin, ping, selection ring, badge, thinking.

`paintUnitOverlay` does not load images. Core passes a drawer. Inside an already-scaled world transform, draw the marker's `w`/`h` directly. `spriteLoader.drawAt(ctx, key, x, y, cameraZoom)` would scale a second time. Use zoom `1`, or `getSprite` plus `drawImage` into `(x, y, w, h)`.

Suggested world-pass order, still owned by core:

1. `translate` / `scale` from `cameraTransform`.
2. Map, bases, flags, `drawPlayer` for the same filtered `units`.
3. Fog overlay in **world pixels**, using the server masks (issue 7, CTF). This module does not draw fog.
4. `paintUnitOverlay` so badges of filtered units sit above that fog.
5. `restore`.
6. Screen-space HUD with `screenSpaceTransform()` / DOM. Command panel DOM is issue 9.

## Atlas names in the current pack

Rects are mirrored in `frames.js` and tested against `apps/web/assets/atlas.json`.

| Frame | Group | File | Atlas size |
| --- | --- | --- | --- |
| `badge_rally` `badge_scout` `badge_defend` `badge_escort` `badge_attack` `badge_tag` `badge_beer` | `ui_orders` | `ui_orders_placeholder.png` | 16×16 |
| `sel_ring_red_0/1` `sel_ring_bot_0/1` | `fx_command` | `fx_command_placeholder.png` | 32×16 |
| `ping_red_0..2` `ping_bot_0..2` | `fx_command` | `fx_command_placeholder.png` | 32×32 |
| `pin_red` `pin_bot` | `fx_command` | `fx_command_placeholder.png` | 16×16 |
| `emote_thinking_0..2` | `fx_command` | `fx_command_placeholder.png` | 16×16 |

`badge_*` are in group `ui_orders` in this pack, not under `fx_command`. Final art should keep these frame names. Swapping files is an `atlas.json` `meta.image` change plus `spriteLoader`; this module only needs the rect test updated if coordinates move.

`badge_reroute` and `emote_broke_*` are in the pack and are not used here (`reroute` is out of scope; `emote_broke` belongs to the command panel).

## Adapter core still has to apply

`game.js` today follows the local player and still installs WASD and the joystick. This branch does not delete them.

```js
import {
  boundsFromMap,
  cameraTransform,
  createCameraState,
  mountCameraInput,
  paintUnitOverlay,
  renderUnitOverlay,
  screenSpaceTransform,
  updateCamera,
} from "./commander/index.js";

// after welcome.map is known
this.bounds = boundsFromMap(this.map);
this.camera = createCameraState({
  viewportWidth: this.canvas.width,
  viewportHeight: this.canvas.height,
  bounds: this.bounds,
});
this.unmountCamera = mountCameraInput(this.canvas, (gesture) => {
  if (!gesture.cameraInput) return;
  this.camera = updateCamera(this.camera, gesture.cameraInput, 0, this.bounds);
}, {
  getContext: () => ({
    units: this.filteredUnits,
    cameraState: this.camera,
    bounds: this.bounds,
  }),
});

// replace the follow-player block
const world = cameraTransform(this.camera, this.bounds);
ctx.save();
ctx.imageSmoothingEnabled = world.smoothing;
ctx.translate(world.offsetX, world.offsetY);
ctx.scale(world.zoom, world.zoom);
// map, bases, flags, drawPlayer(filteredUnits)
// fog overlay in world pixels (CTF)
const overlay = renderUnitOverlay({
  nowMs: time,
  viewerTeam: this.team,
  selectedUnitId: this.selectedUnitId ?? null,
  units: this.filteredUnits,
  presentation: this.unitPresentation ?? {},
  mapPings: this.mapPings ?? [],
  camera: this.camera,
  bounds: this.bounds,
});
paintUnitOverlay(ctx, overlay.markers, (ctx, frame, x, y, w, h) => {
  const sprite = spriteLoader.getSprite(frame);
  if (!sprite) return false;
  ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h, x, y, w, h);
  return true;
});
ctx.restore();
screenSpaceTransform(); // HUD stays in CSS pixels / existing #ui DOM

// on teardown
this.unmountCamera?.();
```

Also remove, when integrating: `setupInput`, `setupTouch`, `getInput`, `sendInput`, the key set, joystick deltas, and the `#joystick` nodes in `game.html`. Those files are not edited here.

`filteredUnits` must be the fog-filtered roster core already uses to draw. Until fog lands, that is the `state.players` array the client actually holds, with no extra hidden rows added by this module.

`unitPresentation` and `mapPings` are not on the main snapshot. Autopilot (issue 5) has not published `order`, `path`, or `replanning`. Leave presentation empty and no badges, rings, or thinking emotes appear. Do not invent those fields on `state`.

## Acceptance

| Criterion | Module | Integrated in `game.js` |
| --- | --- | --- |
| Free pan/drag camera | Yes, `updateCamera` + pointer tracker | No |
| Double-tap a unit centers it | Yes, same filtered list only | No |
| Short side targets 16 tiles; floor at zoom >= 2 | Yes, matches current formula | Already the old follow-camera; not the free camera |
| UI does not zoom | Yes, `screenSpaceTransform` | DOM HUD already unscaled; canvas hook not applied |
| WASD and joystick removed | API returns no movement vector | No, `game.js` still sends `input` |
| Friendly `badge_<order>` only | Yes, if presentation is supplied | No |
| Own-team ring (200ms) and dotted path | Yes | No |
| Thinking emote (200ms) while replanning | Yes | No |
| Ping 100ms and pin | Yes, for `mapPings` the caller passes | No |
| Badges at least 16 screen px | Yes | No |

Run: `node --test apps/web/commander/*.test.js`

Executable sketch: `node apps/web/commander/integrate.example.js`
