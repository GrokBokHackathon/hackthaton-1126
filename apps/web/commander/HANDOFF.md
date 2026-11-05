# Commander camera and unit readability handoff

Status: MODULE-READY camera math stays in this folder. Live `game.js` draws supplied art, the free camera, and `drawFog` from `apps/web/fog.js` in world pixels. Orders panel: **Not integrated**. `apps/web/command-panel.mjs` is not in this tree, so this client does not import it and does not send `command`. That is not a commander-ready match.

Contract version: `2026-11-05.2` (`HANDOFF_VERSION`).

Issues: [#8](https://github.com/GrokBokHackathon/hackthaton-1126/issues/8) camera, [#10](https://github.com/GrokBokHackathon/hackthaton-1126/issues/10) unit readability. This document does not close them.

Main at publication: `46d2848`, which contains bootfix `687c16e`, camera modules from #21, fog from #22, and the isolated lobby from #27. This client does not import the lobby. Tile size 32 and teams `red` / `bot` still match `assets.js` and the protocol. Character pivot `[16, 30]` used for drawing is the atlas field, not a claim that `assets.js` `pivotY` is the art-pack collision box. The pure modules still do not import `game.js`.

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
| `describeFog(state)` | `missing-data`, `invalid`, or `data-present`. `secure` is always false |
| `fogLabel(description)` | Screen-space HUD sentence. It does not claim concealment |
| `unitsFromState(state)` | The server `players` array, or missing/invalid. No client filter |
| `presentationFromUnits(units)` | Copies `order` / `replanning` / `path` only when those own properties exist |
| `mapPingsFromState(state)` | `state.mapPings` only when that own property exists. Otherwise `[]` |
| `drawableFlags(flags)` | Skips null, missing, non-finite, and `{hidden:true}` flags |
| `characterFrameName(player, nowMs)` | Pack names such as `char_down_idle` |
| `terrainFrameName(tile, x, y, tiles)` | Protocol 0/1/2/3 to `grass_*`, `wall_XX`, `crate_beer`, `bush`. Never `tree` |
| `wallFrameName(tiles, x, y)` | `wall_00` … `wall_15` |
| `grassFrame(x, y)` | `grass_a` or `grass_b` |
| `atlasPivotForFrame(atlas, frameName)` | Group `meta.pivot` or null. Does not invent a center |
| `characterDestRect(...)` | Top-left from that pivot. Null when pivot is absent |
| `terrainDestRect(...)` | Cell top-left, frame `w`/`h` unchanged |
| `drawLoadedFrame(ctx, loader, frameName, dest, team)` | `drawImage` at the atlas size |
| `CHAR_ATLAS_PIVOT` | `{x:16, y:30}` from `atlas.json` `char.meta.pivot` |
| `FOOT_BOUNDS` | `null`. The pack has no foot-bounds field |
| `TREE_ART` | Frame rect only. `protocolTileId` is null |
| `CRATE_FRAME` | `crate_beer` |
| `BUSH_FRAME` | `bush` |

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

The snippet below is the hook the live `game.js` now runs. WASD and the joystick are gone from that file.

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

`game.js` now mounts that camera, drops WASD and the joystick, and does not send `{type:"input"}`. `game.html` has no `#joystick`. The HUD (`#score`, `#status`, `#fog`, `#frames`) stays in screen space.

`unitsFromState` returns `state.players` unchanged. This client does not remove units with a fog mask. Until the server filters that array, the list is whoever the snapshot contains.

`presentationFromUnits` copies `order`, `path`, and `replanning` only when a player object already has that property. Main snapshots do not. Badges, intent lines, and thinking emotes therefore do not appear yet. `mapPings` is read only when present.

## Supplied art inspection (not a collision contract)

Checked `apps/web/assets/atlas.json`, `apps/server/game.js` (`FLOOR`/`WALL`/`CRATE`/`BUSH`), `docs/PROTOCOL.md`, and `docs/art/sprite-spec.md`.

| Fact | Where it is written | What this client does |
| --- | --- | --- |
| Character pivot `[16, 30]` | `atlas.json` `char.meta.pivot` only | `characterDestRect` subtracts that pivot. Sprite `w`/`h` stay 32. This is a draw anchor, not a hitbox |
| Foot bounds | Absent. Atlas JSON has no `foot`, `bounds`, or `hitbox` field | `FOOT_BOUNDS` is null. Nothing here is a collision radius |
| Tile pivot | Absent on `tiles`, `tiles2`, and `fx` | Terrain is drawn at the cell top-left at the frame size. `spriteLoader.getSprite` would otherwise invent `[w/2, h/2]`; this path does not use that value |
| Protocol tiles | `0` floor, `1` wall, `2` crate, `3` bush | `grass_a`/`grass_b`, `wall_00`–`wall_15`, `crate_beer`, `bush` |
| `assets.js` names `tile_grass`, `tile_crate`, `wall_0` | Old loader keys. They are not in the grouped atlas | Not used when `spriteLoader` has the pack frame. Colored shapes remain only if the frame is missing |
| `tree` | `tiles2` frame `{x:0,y:96,w:64,h:64}`. No protocol id. `atlasPivot` null | Not drawn. `artProof.treeDrawn` stays 0 |
| `path`, water, rocks, and the rest of `tiles2` | Frames exist. The live map generator never emits those ids | Not drawn |
| Flag pivot `(9, 30)` | sprite-spec table only, not `atlas.json` | Flags stay on the old centered point. That is placement, not a new pivot field |
| `atlas.js` `getFrame` | Requires top-level `atlas.frames` | The live path uses `spriteLoader`, which reads grouped sheets |

`docs/art/sprite-spec.md` also says a tree blocks movement and sight, and gives tile placement notes. That page is not the server contract. Server collision and any tree slowdown stay with core.

## Acceptance

| Criterion | Live `game.js` |
| --- | --- |
| Free pan/drag and double-tap center | Wired |
| Short-side scale and unscaled HUD | Wired |
| WASD and joystick removed | Wired. No movement `input` message |
| Supplied character and protocol terrain sprites | Wired through `spriteLoader` when the frame loads |
| Badges, ring, path, thinking, ping | Code path wired; snapshot fields are absent, so those markers are not invented |
| Fog overlay | `drawFog(ctx, state.fog, tileSize)` after the terrain and before flags and units, same camera transform. `secure` stays false: paint is not the filter |
| Orders to bots | Not integrated. No command-panel module in this tree |

Run: `node --test apps/web/commander/*.test.js`

Executable sketch: `node apps/web/commander/integrate.example.js`
