import { CHAR_ATLAS_PIVOT } from "./supplied-art.js";
import {
  DOUBLE_TAP_DISTANCE_PX,
  DOUBLE_TAP_MS,
  DRAG_THRESHOLD_PX,
  FRAME_SIZE,
  REMOVED_MOVEMENT_CONTROLS,
  TILE_SIZE,
} from "./constants.js";
import { screenToWorld } from "./camera.js";

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

function hitBox(unit, tileSize, pivot, frameW, frameH) {
  return {
    left: unit.x * tileSize - pivot.x,
    top: unit.y * tileSize - pivot.y,
    right: unit.x * tileSize - pivot.x + frameW,
    bottom: unit.y * tileSize - pivot.y + frameH,
  };
}

/**
 * Hit-test only the units the caller passes. A unit that is not in that list
 * cannot be selected. The box is the rendered sprite: pack pivot and frame
 * size, not a circle around the feet. Default pivot is atlas char.meta [16, 30]
 * and the frame is 32×32, so the top of the sprite (30px above the feet) hits.
 */
export function hitTestUnit(screenX, screenY, units, cameraState, bounds, options = {}) {
  if (!cameraState || !bounds || !Array.isArray(units)) return null;
  const world = screenToWorld(cameraState, bounds, screenX, screenY);
  if (!world) return null;
  const tileSize = bounds.tileSize > 0 ? bounds.tileSize : TILE_SIZE;
  const pivot = options.pivot || CHAR_ATLAS_PIVOT;
  const frameW = options.frameWidth > 0 ? options.frameWidth : FRAME_SIZE;
  const frameH = options.frameHeight > 0 ? options.frameHeight : FRAME_SIZE;
  let best = null;
  let bestArea = Infinity;
  for (const unit of units) {
    if (!unit || !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) continue;
    const box = hitBox(unit, tileSize, pivot, frameW, frameH);
    if (world.x < box.left || world.x > box.right || world.y < box.top || world.y > box.bottom) continue;
    const area = frameW * frameH;
    const tie = area === bestArea && best && String(unit.id) < String(best.id);
    if (!best || area < bestArea || tie) {
      best = unit;
      bestArea = area;
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
  const hitOptions = options.hit || {};
  let active = null;
  let lastTap = null;

  function reset() {
    active = null;
    lastTap = null;
  }

  function handle(event, context = {}) {
    const type = event && event.type;
    if (type !== "pointerdown" && type !== "pointermove" && type !== "pointerup" && type !== "pointercancel" && type !== "lostpointercapture") {
      return gestureResult();
    }
    const units = Array.isArray(context.units) ? context.units : [];
    const pointerId = event.pointerId ?? 1;

    if (type === "pointerdown") {
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

    if (type === "pointermove") {
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

    if (type === "pointercancel" || type === "lostpointercapture") {
      active = null;
      return gestureResult({ gesture: "cancel" });
    }

    const snapshot = active;
    active = null;
    if (snapshot.moved) return gestureResult({ gesture: "pointer-up" });

    const hit = context.cameraState && context.bounds
      ? hitTestUnit(snapshot.startX, snapshot.startY, units, context.cameraState, context.bounds, hitOptions)
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
  const types = ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"];

  function release(event) {
    if (typeof target.hasPointerCapture !== "function" || typeof target.releasePointerCapture !== "function") return;
    if (!target.hasPointerCapture(event.pointerId ?? 1)) return;
    try {
      target.releasePointerCapture(event.pointerId ?? 1);
    } catch {
      // The pointer may already be gone. The tracker still clears on this event.
    }
  }

  function listener(event) {
    if (event.type === "pointerdown" && typeof target.setPointerCapture === "function") {
      try {
        target.setPointerCapture(event.pointerId ?? 1);
      } catch {
        // Capture can fail if the pointer is already inactive. The tracker still accepts the down.
      }
    }
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
    if (event.type === "pointerup" || event.type === "pointercancel") release(event);
  }

  for (const type of types) target.addEventListener(type, listener);

  return function unmount() {
    for (const type of types) target.removeEventListener(type, listener);
    tracker.reset();
  };
}
