import {
  DOUBLE_TAP_DISTANCE_PX,
  DOUBLE_TAP_MS,
  DRAG_THRESHOLD_PX,
  REMOVED_MOVEMENT_CONTROLS,
  TAP_RADIUS_TILES,
  TILE_SIZE,
} from "./constants.js";
import { screenToWorld, worldToTile } from "./camera.js";

function gestureResult(partial) {
  return {
    movementInput: null,
    removedControls: REMOVED_MOVEMENT_CONTROLS,
    gesture: "ignore",
    unitId: null,
    cameraInput: null,
    ...partial,
  };
}

/**
 * Hit-test only the units the caller passes. Those must already be fog-filtered.
 * This function does not consult visibility masks and does not add units.
 */
export function hitTestUnit(screenX, screenY, units, cameraState, bounds, tapRadiusTiles = TAP_RADIUS_TILES) {
  if (!cameraState || !bounds || !Array.isArray(units)) return null;
  const world = screenToWorld(cameraState, bounds, screenX, screenY);
  if (!world) return null;
  const tileSize = bounds.tileSize > 0 ? bounds.tileSize : TILE_SIZE;
  const tile = worldToTile(world.x, world.y, tileSize);
  let best = null;
  let bestDist = Infinity;
  for (const unit of units) {
    if (!unit || !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) continue;
    const dist = Math.hypot(unit.x - tile.x, unit.y - tile.y);
    if (dist > tapRadiusTiles) continue;
    const closer = dist < bestDist - 1e-9;
    const tie = Math.abs(dist - bestDist) <= 1e-9 && best && String(unit.id) < String(best.id);
    if (!best || closer || tie) {
      best = unit;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Pointer gesture tracker. Call handle() with plain samples. No DOM and no globals.
 * Drag pans. A double-tap on the same unit centers the camera. WASD, arrows, and
 * the joystick are not produced: movementInput is always null.
 */
export function createPointerTracker(options = {}) {
  const dragThreshold = options.dragThresholdPx ?? DRAG_THRESHOLD_PX;
  const doubleTapMs = options.doubleTapMs ?? DOUBLE_TAP_MS;
  const doubleTapSlop = options.doubleTapDistancePx ?? DOUBLE_TAP_DISTANCE_PX;
  const tapRadius = options.tapRadiusTiles ?? TAP_RADIUS_TILES;
  let active = null;
  let lastTap = null;

  function reset() {
    active = null;
    lastTap = null;
  }

  function handle(event, context = {}) {
    if (!event || (event.type !== "pointerdown" && event.type !== "pointermove" && event.type !== "pointerup" && event.type !== "pointercancel")) {
      return gestureResult();
    }
    const units = Array.isArray(context.units) ? context.units : [];
    const pointerId = event.pointerId ?? 1;

    if (event.type === "pointerdown") {
      if (active) return gestureResult();
      active = {
        pointerId,
        startX: event.x,
        startY: event.y,
        lastX: event.x,
        lastY: event.y,
        moved: false,
        timeMs: event.timeMs ?? 0,
      };
      return gestureResult({ gesture: "pointer-down" });
    }

    if (!active || pointerId !== active.pointerId) return gestureResult();

    if (event.type === "pointermove") {
      const totalX = event.x - active.startX;
      const totalY = event.y - active.startY;
      if (!active.moved) {
        if (Math.hypot(totalX, totalY) < dragThreshold) {
          active.lastX = event.x;
          active.lastY = event.y;
          return gestureResult({ gesture: "pointer-move" });
        }
        active.moved = true;
        active.lastX = event.x;
        active.lastY = event.y;
        return gestureResult({
          gesture: "pan",
          cameraInput: { panScreenX: totalX, panScreenY: totalY },
        });
      }
      const dx = event.x - active.lastX;
      const dy = event.y - active.lastY;
      active.lastX = event.x;
      active.lastY = event.y;
      return gestureResult({
        gesture: "pan",
        cameraInput: { panScreenX: dx, panScreenY: dy },
      });
    }

    if (event.type === "pointercancel") {
      active = null;
      return gestureResult({ gesture: "cancel" });
    }

    const snapshot = active;
    active = null;
    if (snapshot.moved) return gestureResult({ gesture: "pointer-up" });

    const hit = context.cameraState && context.bounds
      ? hitTestUnit(snapshot.startX, snapshot.startY, units, context.cameraState, context.bounds, tapRadius)
      : null;
    const tap = {
      x: snapshot.startX,
      y: snapshot.startY,
      timeMs: snapshot.timeMs,
      unitId: hit ? hit.id : null,
    };
    const prev = lastTap;
    lastTap = tap;
    if (
      prev &&
      hit &&
      prev.unitId === hit.id &&
      tap.timeMs - prev.timeMs >= 0 &&
      tap.timeMs - prev.timeMs <= doubleTapMs &&
      Math.hypot(tap.x - prev.x, tap.y - prev.y) <= doubleTapSlop
    ) {
      lastTap = null;
      return gestureResult({
        gesture: "center-on-unit",
        unitId: hit.id,
        cameraInput: { centerOn: { x: hit.x, y: hit.y, space: "tile" } },
      });
    }
    return gestureResult({ gesture: "tap", unitId: hit ? hit.id : null });
  }

  return { handle, reset };
}

/**
 * Attach pointer listeners to one element. Returns unmount().
 * Does not register page-level listeners and does not run at import.
 * getContext() supplies the already-filtered unit list and the current camera.
 */
export function mountCameraInput(target, onGesture, options = {}) {
  if (!target || typeof target.addEventListener !== "function" || typeof target.removeEventListener !== "function") {
    throw new TypeError("mountCameraInput requires addEventListener and removeEventListener");
  }
  if (typeof target.getBoundingClientRect !== "function") {
    throw new TypeError("mountCameraInput requires getBoundingClientRect");
  }
  if (typeof onGesture !== "function") {
    throw new TypeError("mountCameraInput requires an onGesture callback");
  }

  const tracker = options.tracker ?? createPointerTracker(options);
  const types = ["pointerdown", "pointermove", "pointerup", "pointercancel"];

  function listener(event) {
    const rect = target.getBoundingClientRect();
    const sample = {
      type: event.type,
      pointerId: event.pointerId ?? 1,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      timeMs: Number.isFinite(event.timeStamp) ? event.timeStamp : 0,
    };
    const context = typeof options.getContext === "function" ? options.getContext() : {};
    onGesture(tracker.handle(sample, context ?? {}));
  }

  for (const type of types) target.addEventListener(type, listener);

  return function unmount() {
    for (const type of types) target.removeEventListener(type, listener);
    tracker.reset();
  };
}
