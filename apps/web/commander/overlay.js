import { cameraTransform, tileToWorld } from "./camera.js";
import {
  INTENT_DASH,
  INTENT_LINE_WIDTH,
  MARKER_GAP_SCREEN_PX,
  MIN_BADGE_SCREEN_PX,
  ORDER_IDS,
  PING_FRAME_COUNT,
  PING_FRAME_MS,
  PIVOT_Y,
  SEL_RING_FRAME_COUNT,
  SEL_RING_FRAME_MS,
  TEAM_COLORS,
  TEAM_IDS,
  THINKING_FRAME_COUNT,
  THINKING_FRAME_MS,
  TILE_SIZE,
} from "./constants.js";
import { atlasFrame } from "./frames.js";

const DRAW_ORDER = ["intent-line", "pin", "ping", "selection-ring", "badge", "thinking"];

function loopFrame(nowMs, frameMs, count) {
  const t = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
  return Math.floor(t / frameMs) % count;
}

function oneShotFrame(nowMs, startMs, frameMs, count) {
  const elapsed = nowMs - startMs;
  if (!Number.isFinite(elapsed)) return null;
  if (elapsed < 0) return 0;
  const index = Math.floor(elapsed / frameMs);
  if (index >= count) return null;
  return index;
}

export function dashPolyline(points, dashLength, gapLength) {
  const segments = [];
  if (!Array.isArray(points) || points.length < 2 || !(dashLength > 0)) return segments;
  const gap = gapLength > 0 ? gapLength : 0;
  let drawing = true;
  let remain = dashLength;
  for (let i = 0; i < points.length - 1; i++) {
    let x = points[i].x;
    let y = points[i].y;
    const x2 = points[i + 1].x;
    const y2 = points[i + 1].y;
    let dx = x2 - x;
    let dy = y2 - y;
    let dist = Math.hypot(dx, dy);
    if (dist === 0) continue;
    while (dist > 1e-9) {
      const step = Math.min(remain, dist);
      const nx = x + (dx / dist) * step;
      const ny = y + (dy / dist) * step;
      if (drawing && step > 0) segments.push({ x1: x, y1: y, x2: nx, y2: ny });
      x = nx;
      y = ny;
      dx = x2 - x;
      dy = y2 - y;
      dist = Math.hypot(dx, dy);
      remain -= step;
      if (remain <= 1e-9) {
        drawing = !drawing;
        remain = drawing ? dashLength : gap;
        if (!(remain > 0)) {
          drawing = true;
          remain = dashLength;
        }
      }
    }
  }
  return segments;
}

function teamId(value) {
  return TEAM_IDS.includes(value) ? value : null;
}

function spriteMarker(kind, frameName, worldX, worldY, zoom, unitId, team) {
  const frame = atlasFrame(frameName);
  if (!frame || !(zoom > 0)) return null;
  const screenW = frame.w * zoom;
  const screenH = frame.h * zoom;
  return {
    kind,
    frame: frameName,
    x: worldX - frame.w / 2,
    y: worldY - frame.h / 2,
    w: frame.w,
    h: frame.h,
    screenW,
    screenH,
    sourceW: frame.w,
    sourceH: frame.h,
    unitId: unitId ?? null,
    team: team ?? null,
    fallback: { fill: TEAM_COLORS[team] || "#ffffff", label: frameName },
  };
}

function badgeMarker(frameName, unit, spriteTop, zoom, team) {
  const frame = atlasFrame(frameName);
  if (!frame || !(zoom > 0)) return null;
  const screenW = Math.max(MIN_BADGE_SCREEN_PX, frame.w * zoom);
  const screenH = Math.max(MIN_BADGE_SCREEN_PX, frame.h * zoom);
  const w = screenW / zoom;
  const h = screenH / zoom;
  const gap = MARKER_GAP_SCREEN_PX / zoom;
  const centerX = unit.x * (unit.tileSize || TILE_SIZE);
  return {
    kind: "badge",
    frame: frameName,
    x: centerX - w / 2,
    y: spriteTop - gap - h,
    w,
    h,
    screenW,
    screenH,
    sourceW: frame.w,
    sourceH: frame.h,
    unitId: unit.id,
    team,
    fallback: { fill: TEAM_COLORS[team] || "#ffffff", label: frameName.replace("badge_", "") },
  };
}

function pathPoints(unit, path, tileSize) {
  const points = [tileToWorld(unit.x, unit.y, tileSize)];
  if (!Array.isArray(path)) return points;
  for (const point of path) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const next = tileToWorld(point.x, point.y, tileSize);
    const prev = points[points.length - 1];
    if (Math.hypot(next.x - prev.x, next.y - prev.y) < 0.01) continue;
    points.push(next);
  }
  return points;
}

/**
 * Unit readability overlay. `units` is the already-filtered list from core.
 * Units not in that list are never drawn, including ids mentioned only in presentation.
 * This function does not read fog masks and does not drop units based on a visible flag.
 * presentation and mapPings are client annotations. They are not server snapshot fields.
 * mapPings are world markers, not the protocol keepalive `{type:"ping"}`.
 */
export function renderUnitOverlay(input) {
  if (!input || !input.camera || !input.bounds) {
    throw new TypeError("renderUnitOverlay requires camera and bounds");
  }
  const units = Array.isArray(input.units) ? input.units : [];
  const presentation = input.presentation && typeof input.presentation === "object" ? input.presentation : {};
  const mapPings = Array.isArray(input.mapPings) ? input.mapPings : [];
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  const viewer = teamId(input.viewerTeam);
  const tileSize = input.bounds.tileSize > 0
    ? input.bounds.tileSize
    : (input.layout?.tileSize > 0 ? input.layout.tileSize : TILE_SIZE);
  const pivotY = input.layout?.pivotY > 0 ? input.layout.pivotY : PIVOT_Y;
  const transform = cameraTransform(input.camera, input.bounds);
  const zoom = transform.zoom;
  const warnings = [];
  const knownIds = new Set(units.map((unit) => unit && unit.id).filter((id) => id != null));

  for (const id of Object.keys(presentation)) {
    if (!knownIds.has(id)) warnings.push({ code: "presentation-for-unknown-unit", unitId: id });
  }

  const buckets = {
    "intent-line": [],
    pin: [],
    ping: [],
    "selection-ring": [],
    badge: [],
    thinking: [],
  };

  const orderedUnits = units.filter((unit) => unit && unit.id != null).slice().sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

  for (const unit of orderedUnits) {
    if (!Number.isFinite(unit.x) || !Number.isFinite(unit.y)) continue;
    const team = teamId(unit.team);
    const friendly = viewer != null && team === viewer;
    const extra = presentation[unit.id] && typeof presentation[unit.id] === "object" ? presentation[unit.id] : null;
    const spriteTop = unit.y * tileSize - pivotY;

    if (friendly && extra && extra.order != null) {
      if (!ORDER_IDS.includes(extra.order)) {
        warnings.push({ code: "unknown-order", unitId: unit.id, order: extra.order });
      } else {
        const badge = badgeMarker(`badge_${extra.order}`, { ...unit, tileSize }, spriteTop, zoom, team);
        if (badge) buckets.badge.push(badge);
        else warnings.push({ code: "missing-frame", frame: `badge_${extra.order}` });
      }
    }

    if (extra && extra.replanning === true && team) {
      const index = loopFrame(nowMs, THINKING_FRAME_MS, THINKING_FRAME_COUNT);
      const frameName = `emote_thinking_${index}`;
      const badge = buckets.badge.find((marker) => marker.unitId === unit.id);
      const frame = atlasFrame(frameName);
      if (frame) {
        const gap = MARKER_GAP_SCREEN_PX / zoom;
        const top = badge ? badge.y : spriteTop - gap;
        buckets.thinking.push({
          kind: "thinking",
          frame: frameName,
          x: unit.x * tileSize - frame.w / 2,
          y: top - gap - frame.h,
          w: frame.w,
          h: frame.h,
          screenW: frame.w * zoom,
          screenH: frame.h * zoom,
          sourceW: frame.w,
          sourceH: frame.h,
          unitId: unit.id,
          team,
          fallback: { fill: "#ffe08a", label: "..." },
        });
      }
    }

    if (friendly && input.selectedUnitId === unit.id && team) {
      const index = loopFrame(nowMs, SEL_RING_FRAME_MS, SEL_RING_FRAME_COUNT);
      const ring = spriteMarker(
        "selection-ring",
        `sel_ring_${team}_${index}`,
        unit.x * tileSize,
        unit.y * tileSize,
        zoom,
        unit.id,
        team,
      );
      if (ring) buckets["selection-ring"].push(ring);
      const points = pathPoints(unit, extra && extra.path, tileSize);
      if (points.length >= 2) {
        buckets["intent-line"].push({
          kind: "intent-line",
          unitId: unit.id,
          team,
          color: TEAM_COLORS[team],
          points,
          dash: INTENT_DASH.slice(),
          lineWidth: INTENT_LINE_WIDTH,
          segments: dashPolyline(points, INTENT_DASH[0], INTENT_DASH[1]),
        });
      }
    }
  }

  if (input.selectedUnitId != null && !knownIds.has(input.selectedUnitId)) {
    warnings.push({ code: "selection-not-in-filtered-units", unitId: input.selectedUnitId });
  }

  for (const ping of mapPings) {
    const team = teamId(ping && ping.team);
    if (!ping || !team || !Number.isFinite(ping.x) || !Number.isFinite(ping.y)) {
      warnings.push({ code: "map-ping-invalid", id: ping && ping.id != null ? ping.id : null });
      continue;
    }
    const world = tileToWorld(ping.x, ping.y, tileSize);
    const pin = spriteMarker("pin", `pin_${team}`, world.x, world.y, zoom, null, team);
    if (pin) {
      pin.pingId = ping.id ?? null;
      buckets.pin.push(pin);
    }
    const frameIndex = oneShotFrame(nowMs, ping.startedAtMs, PING_FRAME_MS, PING_FRAME_COUNT);
    if (frameIndex != null) {
      const burst = spriteMarker("ping", `ping_${team}_${frameIndex}`, world.x, world.y, zoom, null, team);
      if (burst) {
        burst.pingId = ping.id ?? null;
        buckets.ping.push(burst);
      }
    }
  }

  const markers = DRAW_ORDER.flatMap((kind) => buckets[kind]);
  return { markers, warnings, drawOrder: DRAW_ORDER.slice() };
}

export function paintUnitOverlay(ctx, markers, drawSprite) {
  if (!ctx || !Array.isArray(markers)) return;
  for (const marker of markers) {
    if (marker.kind === "intent-line") {
      ctx.save();
      ctx.strokeStyle = marker.color;
      ctx.lineWidth = marker.lineWidth;
      ctx.setLineDash(marker.dash);
      ctx.beginPath();
      const points = marker.points || [];
      if (points.length > 0) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
      continue;
    }
    const drawn = typeof drawSprite === "function"
      && drawSprite(ctx, marker.frame, marker.x, marker.y, marker.w, marker.h) === true;
    if (drawn) continue;
    ctx.save();
    ctx.fillStyle = marker.fallback?.fill || "#ffffff";
    ctx.fillRect(marker.x, marker.y, marker.w, marker.h);
    if (marker.fallback?.label) {
      ctx.fillStyle = "#111111";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(marker.fallback.label, marker.x + marker.w / 2, marker.y + marker.h / 2);
    }
    ctx.restore();
  }
}
