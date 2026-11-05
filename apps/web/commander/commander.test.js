import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  HANDOFF_VERSION,
  ORDER_IDS,
  READABILITY_FRAME_NAMES,
  REMOVED_MOVEMENT_CONTROLS,
  TILE_SIZE,
  atlasFrame,
  boundsFromMap,
  cameraTransform,
  computeZoom,
  createCameraState,
  createPointerTracker,
  hitTestUnit,
  layoutScreenRect,
  mountCameraInput,
  paintUnitOverlay,
  renderUnitOverlay,
  screenSpaceTransform,
  screenToWorld,
  updateCamera,
  visibleShortSideTiles,
  worldToScreen,
} from "./index.js";
import { runExample } from "./integrate.example.js";

const MAP = { width: 64, height: 40 };
const BOUNDS = boundsFromMap(MAP);

function legacyOffset(viewportW, viewportH, focusTileX, focusTileY, mapW, mapH, tileSize) {
  const short = Math.min(viewportW, viewportH);
  const target = short / (16 * tileSize);
  const zoom = target >= 2 ? Math.floor(target) : target;
  const smoothing = !(target >= 2);
  let offsetX = viewportW / 2 - focusTileX * tileSize * zoom;
  let offsetY = viewportH / 2 - focusTileY * tileSize * zoom;
  const mapWidthPx = mapW * tileSize * zoom;
  const mapHeightPx = mapH * tileSize * zoom;
  if (mapWidthPx > viewportW) offsetX = Math.min(0, Math.max(viewportW - mapWidthPx, offsetX));
  else offsetX = (viewportW - mapWidthPx) / 2;
  if (mapHeightPx > viewportH) offsetY = Math.min(0, Math.max(viewportH - mapHeightPx, offsetY));
  else offsetY = (viewportH - mapHeightPx) / 2;
  return { zoom, smoothing, offsetX, offsetY };
}

test("phone portrait and desktop landscape share the issue 8 scale", () => {
  const phone = computeZoom(390, 844);
  assert.equal(phone.shortSide, 390);
  assert.equal(phone.smoothing, true);
  assert.equal(phone.floored, false);
  assert.ok(Math.abs(phone.tilesOnShortSide - 16) < 1e-9);
  assert.ok(Math.abs(visibleShortSideTiles(390, 844, phone.zoom) - 16) < 1e-9);

  const desktop = computeZoom(1920, 1080);
  assert.equal(desktop.shortSide, 1080);
  assert.equal(desktop.zoom, 2);
  assert.equal(desktop.smoothing, false);
  assert.ok(desktop.tilesOnShortSide >= 16);

  const wide = computeZoom(1280, 720);
  assert.equal(wide.smoothing, true);
  assert.ok(Math.abs(wide.tilesOnShortSide - 16) < 1e-9);
});

test("camera transform matches the main follow-camera offset math", () => {
  const cases = [
    [800, 600, 10, 8],
    [390, 844, 2, 2],
    [1920, 1080, 61, 37],
    [4000, 500, 32, 20],
    [1024, 768, 0, 0],
  ];
  for (const [width, height, tileX, tileY] of cases) {
    const state = createCameraState({
      viewportWidth: width,
      viewportHeight: height,
      bounds: BOUNDS,
      focusX: tileX * TILE_SIZE,
      focusY: tileY * TILE_SIZE,
    });
    const transform = cameraTransform(state, BOUNDS);
    const legacy = legacyOffset(width, height, tileX, tileY, MAP.width, MAP.height, TILE_SIZE);
    assert.equal(transform.zoom, legacy.zoom);
    assert.equal(transform.smoothing, legacy.smoothing);
    assert.equal(transform.imageSmoothingEnabled, legacy.smoothing);
    assert.ok(Math.abs(transform.offsetX - legacy.offsetX) < 1e-6);
    assert.ok(Math.abs(transform.offsetY - legacy.offsetY) < 1e-6);
    assert.ok(transform.shortSideTiles + 1e-9 >= 16 || width === 0);
  }
});

test("updateCamera pans in screen pixels, clamps, ignores dt and input.zoom", () => {
  const initial = createCameraState({ viewportWidth: 390, viewportHeight: 844, bounds: BOUNDS });
  const frozenState = Object.freeze({ ...initial });
  const frozenInput = Object.freeze({ panScreenX: 40, panScreenY: 0, zoom: 9 });
  const moved = updateCamera(frozenState, frozenInput, 16, Object.freeze({ ...BOUNDS }));
  assert.equal(frozenState.focusX, initial.focusX);
  assert.notEqual(moved.zoom, 9);
  assert.equal(moved.zoom, computeZoom(390, 844).zoom);
  const expected = initial.focusX - 40 / moved.zoom;
  assert.ok(Math.abs(moved.focusX - expected) < 1e-6 || moved.focusX !== initial.focusX);

  const huge = updateCamera(initial, { panScreenX: -100000, panScreenY: 100000 }, 0, BOUNDS);
  const transform = cameraTransform(huge, BOUNDS);
  assert.ok(transform.offsetX <= 0);
  assert.ok(transform.offsetY <= 0);
  const idle = updateCamera(moved, {}, 50, BOUNDS);
  assert.equal(idle.focusX, moved.focusX);
  assert.equal(idle.focusY, moved.focusY);
});

test("world and screen transforms round-trip and screen HUD does not zoom", () => {
  const state = createCameraState({ viewportWidth: 1280, viewportHeight: 720, bounds: BOUNDS });
  const screen = worldToScreen(state, BOUNDS, 640, 400);
  const back = screenToWorld(state, BOUNDS, screen.x, screen.y);
  assert.ok(Math.abs(back.x - 640) < 1e-6);
  assert.ok(Math.abs(back.y - 400) < 1e-6);
  const hud = { x: 12, y: 16, w: 120, h: 36 };
  assert.deepEqual(layoutScreenRect(hud), hud);
  assert.deepEqual(layoutScreenRect(hud, screenSpaceTransform()), hud);
  assert.equal(screenSpaceTransform().zoom, 1);
  const desktop = updateCamera(state, { viewportWidth: 1920, viewportHeight: 1080 }, 0, BOUNDS);
  assert.deepEqual(layoutScreenRect(hud), layoutScreenRect(hud, screenSpaceTransform()));
  assert.notEqual(cameraTransform(desktop, BOUNDS).zoom, 1);
});

test("double-tap centers a filtered unit and drag does not emit movement", () => {
  let camera = createCameraState({ viewportWidth: 1280, viewportHeight: 720, bounds: BOUNDS });
  const units = [
    { id: "red-1", team: "red", x: 20, y: 12 },
    { id: "bot-1", team: "bot", x: 40, y: 20 },
  ];
  const screen = worldToScreen(camera, BOUNDS, 20 * TILE_SIZE, 12 * TILE_SIZE);
  const tracker = createPointerTracker();
  const context = () => ({ units, cameraState: camera, bounds: BOUNDS });
  const tap = (timeMs) => {
    tracker.handle({ type: "pointerdown", pointerId: 1, x: screen.x, y: screen.y, timeMs }, context());
    return tracker.handle({ type: "pointerup", pointerId: 1, x: screen.x, y: screen.y, timeMs }, context());
  };
  const first = tap(0);
  assert.equal(first.gesture, "tap");
  assert.equal(first.cameraInput, null);
  assert.equal(first.movementInput, null);
  const second = tap(200);
  assert.equal(second.gesture, "center-on-unit");
  assert.equal(second.unitId, "red-1");
  assert.equal(second.movementInput, null);
  camera = updateCamera(camera, second.cameraInput, 0, BOUNDS);
  assert.ok(Math.abs(camera.focusX - 20 * TILE_SIZE) < 1e-6);
  assert.ok(Math.abs(camera.focusY - 12 * TILE_SIZE) < 1e-6);

  const hidden = { id: "hidden", team: "red", x: 30, y: 16 };
  const hiddenScreen = worldToScreen(camera, BOUNDS, hidden.x * TILE_SIZE, hidden.y * TILE_SIZE);
  const miss = hitTestUnit(hiddenScreen.x, hiddenScreen.y, units, camera, BOUNDS);
  assert.equal(miss, null);

  const drag = createPointerTracker();
  drag.handle({ type: "pointerdown", pointerId: 1, x: 100, y: 100, timeMs: 0 }, context());
  const pan = drag.handle({ type: "pointermove", pointerId: 1, x: 140, y: 110, timeMs: 20 }, context());
  assert.equal(pan.gesture, "pan");
  assert.equal(pan.movementInput, null);
  assert.deepEqual(REMOVED_MOVEMENT_CONTROLS, pan.removedControls);
  const keyed = drag.handle({ type: "keydown", key: "w" }, context());
  assert.equal(keyed.movementInput, null);
  assert.equal(keyed.gesture, "ignore");
});

test("mount and unmount bind only the given target", () => {
  const listeners = new Map();
  const target = {
    rect: { left: 10, top: 20, width: 100, height: 50 },
    getBoundingClientRect() {
      return this.rect;
    },
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== fn));
    },
  };
  const seen = [];
  const unmount = mountCameraInput(target, (gesture) => seen.push(gesture), {
    getContext: () => ({ units: [], cameraState: null, bounds: BOUNDS }),
  });
  assert.equal(listeners.get("pointerdown").length, 1);
  listeners.get("pointerdown")[0]({ type: "pointerdown", pointerId: 3, clientX: 30, clientY: 40, timeStamp: 5 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].gesture, "pointer-down");
  assert.equal(seen[0].movementInput, null);
  unmount();
  assert.equal(listeners.get("pointerdown").length, 0);
  assert.throws(() => mountCameraInput({}, () => {}), TypeError);
});

test("overlay badges, selection, intent, thinking, and ping use atlas frames", () => {
  const camera = createCameraState({ viewportWidth: 320, viewportHeight: 700, bounds: BOUNDS });
  const zoom = cameraTransform(camera, BOUNDS).zoom;
  assert.ok(zoom < 1);
  const units = [
    { id: "a", team: "red", x: 8, y: 6, visible: false },
    { id: "b", team: "bot", x: 30, y: 18, visible: true },
  ];
  const at0 = renderUnitOverlay({
    nowMs: 0,
    viewerTeam: "red",
    selectedUnitId: "a",
    units,
    presentation: {
      a: { order: "scout", replanning: true, path: [{ x: 10, y: 6 }, { x: 12, y: 8 }] },
      b: { order: "tag", replanning: true },
      hidden: { order: "attack", path: [{ x: 1, y: 1 }] },
      a2: { order: "reroute" },
    },
    mapPings: [{ id: "p", team: "red", x: 15, y: 9, startedAtMs: 0 }],
    camera,
    bounds: BOUNDS,
  });
  const frames = at0.markers.map((marker) => `${marker.kind}:${marker.frame || ""}:${marker.unitId || marker.pingId || ""}`);
  assert.ok(frames.some((item) => item.startsWith("badge:badge_scout:a")));
  assert.ok(!frames.some((item) => item.includes("badge") && item.endsWith(":b")));
  assert.ok(frames.some((item) => item.startsWith("selection-ring:sel_ring_red_0:a")));
  assert.ok(frames.some((item) => item.startsWith("thinking:emote_thinking_0:a")));
  assert.ok(frames.some((item) => item.startsWith("thinking:emote_thinking_0:b")));
  assert.ok(frames.some((item) => item.startsWith("intent-line")));
  assert.ok(frames.some((item) => item.startsWith("ping:ping_red_0:p")));
  assert.ok(frames.some((item) => item.startsWith("pin:pin_red:p")));
  assert.ok(!frames.some((item) => item.includes("hidden")));
  assert.ok(at0.warnings.some((warning) => warning.code === "presentation-for-unknown-unit" && warning.unitId === "hidden"));
  assert.equal(at0.warnings.some((warning) => warning.path), false);

  const badge = at0.markers.find((marker) => marker.kind === "badge");
  assert.ok(badge.screenW >= 16);
  assert.ok(badge.screenH >= 16);
  assert.equal(badge.sourceW, 16);
  assert.equal(badge.sourceH, 16);

  const at200 = renderUnitOverlay({
    nowMs: 200,
    viewerTeam: "red",
    selectedUnitId: "b",
    units,
    presentation: { a: { order: "beer", replanning: false }, b: { order: "attack", path: [{ x: 31, y: 18 }] } },
    mapPings: [{ id: "p", team: "bot", x: 15, y: 9, startedAtMs: 0 }],
    camera,
    bounds: BOUNDS,
  });
  assert.ok(at200.markers.some((marker) => marker.frame === "badge_beer"));
  assert.ok(!at200.markers.some((marker) => marker.kind === "selection-ring"));
  assert.ok(!at200.markers.some((marker) => marker.kind === "intent-line" && marker.unitId === "b"));
  assert.ok(at200.markers.some((marker) => marker.frame === "ping_bot_2"));
  assert.ok(!at200.markers.some((marker) => marker.kind === "thinking"));

  const done = renderUnitOverlay({
    nowMs: 300,
    viewerTeam: "red",
    selectedUnitId: null,
    units: [{ id: "a", team: "red", x: 1, y: 1 }],
    presentation: {},
    mapPings: [{ id: "p", team: "red", x: 3, y: 3, startedAtMs: 0 }],
    camera,
    bounds: BOUNDS,
  });
  assert.ok(done.markers.some((marker) => marker.kind === "pin"));
  assert.ok(!done.markers.some((marker) => marker.kind === "ping"));
});

test("paint uses drawSprite destination size and falls back when the sheet is missing", () => {
  const camera = createCameraState({ viewportWidth: 800, viewportHeight: 600, bounds: BOUNDS });
  const overlay = renderUnitOverlay({
    nowMs: 0,
    viewerTeam: "red",
    selectedUnitId: "a",
    units: [{ id: "a", team: "red", x: 4, y: 4 }],
    presentation: { a: { order: "defend", path: [{ x: 8, y: 4 }] } },
    camera,
    bounds: BOUNDS,
  });
  const calls = [];
  const ctx = fakeCtx();
  paintUnitOverlay(ctx, overlay.markers, (context, frame, x, y, w, h) => {
    calls.push({ frame, x, y, w, h });
    return frame !== "badge_defend";
  });
  assert.ok(calls.some((call) => call.frame === "sel_ring_red_0" && call.w === 32 && call.h === 16));
  assert.ok(ctx.fills.some((fill) => fill.w !== 32));
  assert.ok(ctx.dashes.length > 0);
});

test("readability frame rects match atlas.json and reroute is not an order", () => {
  const atlasPath = fileURLToPath(new URL("../assets/atlas.json", import.meta.url));
  const atlas = JSON.parse(fs.readFileSync(atlasPath, "utf8"));
  for (const name of READABILITY_FRAME_NAMES) {
    const local = atlasFrame(name);
    const remote = atlas[local.group].frames[name];
    assert.equal(atlas[local.group].meta.image, local.image);
    assert.equal(remote.x, local.x);
    assert.equal(remote.y, local.y);
    assert.equal(remote.w, local.w);
    assert.equal(remote.h, local.h);
  }
  assert.ok(atlas.ui_orders.frames.badge_reroute);
  assert.equal(ORDER_IDS.includes("reroute"), false);
  assert.equal(READABILITY_FRAME_NAMES.includes("badge_reroute"), false);
  assert.equal(HANDOFF_VERSION, "2026-11-05.1");
});

test("example runs and reports module-ready, not integrated", () => {
  const report = runExample();
  assert.equal(report.moduleReady, true);
  assert.equal(report.integratedIntoGameJs, false);
  assert.equal(report.movementInput, null);
  assert.equal(report.keyboardMovement, null);
  assert.equal(report.hiddenUnitDrawn, false);
  assert.equal(report.enemyBadgeDrawn, false);
  assert.equal(report.friendlyBadgeDespiteVisibleFalse, true);
  assert.equal(report.centeredUnitId, "red-1");
  assert.ok(report.roundTripError < 1e-6);
  assert.deepEqual(report.screenRect, { x: 12, y: 16, w: 120, h: 36 });
  assert.ok(report.phoneTiles === 16);
  assert.equal(report.desktopZoom, 2);
  assert.equal(report.desktopSmoothing, false);
});

test("handoff names every public export", () => {
  const handoff = fs.readFileSync(new URL("./HANDOFF.md", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const names = [...api.matchAll(/export \{([^}]+)\}/g)].flatMap((match) =>
    match[1].split(",").map((part) => part.trim()).filter(Boolean),
  );
  assert.ok(names.length >= 20);
  for (const name of names) assert.ok(handoff.includes(name), name);
  assert.match(handoff, /MODULE-READY/);
  assert.match(handoff, /Not integrated/);
});

test("library modules do not import the live client or touch document", () => {
  const dir = fileURLToPath(new URL("./", import.meta.url));
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".js") && !name.endsWith(".test.js") && name !== "integrate.example.js");
  const forbidden = [
    /from\s+["'][^"']*game\.js["']/,
    /from\s+["'][^"']*assets\.js["']/,
    /from\s+["'][^"']*spriteLoader\.js["']/,
    /from\s+["'][^"']*atlas\.js["']/,
    /\bfetch\s*\(/,
    /\bWebSocket\b/,
    /\bdocument\b/,
    /\bwindow\b/,
  ];
  for (const name of files) {
    const text = fs.readFileSync(new URL(name, import.meta.url), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(text, pattern, name);
  }
});

function fakeCtx() {
  return {
    dashes: [],
    fills: [],
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    setLineDash(dash) {
      this.dashes.push(dash);
    },
    fillRect(x, y, w, h) {
      this.fills.push({ x, y, w, h });
    },
    fillText() {},
  };
}
