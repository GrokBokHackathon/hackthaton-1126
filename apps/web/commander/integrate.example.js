/**
 * Runnable integration sketch. Not imported by apps/web/game.js.
 * node apps/web/commander/integrate.example.js
 */
import { pathToFileURL } from "node:url";
import {
  HANDOFF_VERSION,
  ORDER_IDS,
  REMOVED_MOVEMENT_CONTROLS,
  TILE_SIZE,
  boundsFromMap,
  computeZoom,
  createCameraState,
  createPointerTracker,
  layoutScreenRect,
  renderUnitOverlay,
  screenToWorld,
  tileToWorld,
  updateCamera,
  worldToScreen,
} from "./index.js";

export function runExample() {
  const map = {
    width: 64,
    height: 40,
    bases: { red: { x: 2, y: 2 }, bot: { x: 61, y: 37 } },
  };
  const bounds = boundsFromMap(map);
  let camera = createCameraState({ viewportWidth: 390, viewportHeight: 844, bounds });
  const phone = computeZoom(390, 844);
  const desktop = computeZoom(1920, 1080);
  camera = updateCamera(camera, { viewportWidth: 1280, viewportHeight: 720 }, 16, bounds);
  const focusBeforePan = camera.focusX;
  camera = updateCamera(camera, { panScreenX: 48, panScreenY: -12, zoom: 99 }, 16, bounds);

  const units = [
    { id: "red-1", team: "red", x: 20, y: 12, visible: false },
    { id: "bot-1", team: "bot", x: 48, y: 30, visible: false },
  ];
  const overlay = renderUnitOverlay({
    nowMs: 200,
    viewerTeam: "red",
    selectedUnitId: "red-1",
    units,
    presentation: {
      "red-1": { order: "rally", replanning: true, path: [{ x: 22, y: 12 }, { x: 24, y: 14 }] },
      "bot-1": { order: "attack" },
      "hidden-1": { order: "tag", path: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
    },
    mapPings: [{ id: "rally-1", team: "red", x: 24, y: 14, startedAtMs: 50 }],
    camera,
    bounds,
  });

  const tracker = createPointerTracker();
  const context = { units, cameraState: camera, bounds };
  const world = tileToWorld(20, 12, TILE_SIZE);
  const screen = worldToScreen(camera, bounds, world.x, world.y);
  const back = screenToWorld(camera, bounds, screen.x, screen.y);
  const down = { type: "pointerdown", pointerId: 1, x: screen.x, y: screen.y, timeMs: 0 };
  const up = { type: "pointerup", pointerId: 1, x: screen.x, y: screen.y, timeMs: 0 };
  tracker.handle(down, context);
  tracker.handle(up, context);
  tracker.handle({ ...down, timeMs: 120 }, context);
  const centered = tracker.handle({ ...up, timeMs: 120 }, context);
  const afterCenter = updateCamera(camera, centered.cameraInput, 0, bounds);
  const keyed = tracker.handle({ type: "keydown", key: "w" }, context);

  const hud = { x: 12, y: 16, w: 120, h: 36 };
  return {
    handoffVersion: HANDOFF_VERSION,
    moduleReady: true,
    integratedIntoGameJs: false,
    movementInput: centered.movementInput,
    removedControls: REMOVED_MOVEMENT_CONTROLS,
    orderIds: ORDER_IDS,
    phoneTiles: phone.tilesOnShortSide,
    phoneSmoothing: phone.smoothing,
    desktopZoom: desktop.zoom,
    desktopSmoothing: desktop.smoothing,
    panChangedFocus: camera.focusX !== focusBeforePan,
    ignoredInputZoom: camera.zoom !== 99,
    roundTripError: Math.hypot(back.x - world.x, back.y - world.y),
    centeredUnitId: centered.unitId,
    centeredFocus: { x: afterCenter.focusX, y: afterCenter.focusY },
    keyboardMovement: keyed.movementInput,
    screenRect: layoutScreenRect(hud),
    markerFrames: overlay.markers.map((marker) => marker.frame || marker.kind),
    hiddenUnitDrawn: overlay.markers.some((marker) => marker.unitId === "hidden-1"),
    enemyBadgeDrawn: overlay.markers.some((marker) => marker.kind === "badge" && marker.unitId === "bot-1"),
    friendlyBadgeDespiteVisibleFalse: overlay.markers.some((marker) => marker.frame === "badge_rally"),
    warnings: overlay.warnings.map((warning) => warning.code),
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  console.log(JSON.stringify(runExample(), null, 2));
}
