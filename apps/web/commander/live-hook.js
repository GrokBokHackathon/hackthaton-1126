import { screenToWorld, worldToTile } from "./camera.js";

/**
 * Live snapshot adapters. These read fields the server already sends.
 * They do not add fog, orders, or paths when those fields are absent.
 */

export function unitsFromState(state) {
  if (!state || !Object.prototype.hasOwnProperty.call(state, "players")) {
    return { units: [], availability: "missing-data" };
  }
  if (!Array.isArray(state.players)) {
    return { units: [], availability: "invalid" };
  }
  return { units: state.players, availability: "server-list" };
}

export function presentationFromUnits(units) {
  const presentation = {};
  if (!Array.isArray(units)) return presentation;
  for (const unit of units) {
    if (!unit || unit.id == null) continue;
    const extra = {};
    if (Object.prototype.hasOwnProperty.call(unit, "order")) extra.order = unit.order;
    if (Object.prototype.hasOwnProperty.call(unit, "replanning")) extra.replanning = unit.replanning;
    if (Object.prototype.hasOwnProperty.call(unit, "path")) extra.path = unit.path;
    if (Object.keys(extra).length > 0) presentation[unit.id] = extra;
  }
  return presentation;
}

export function mapPingsFromState(state) {
  if (!state || !Object.prototype.hasOwnProperty.call(state, "mapPings")) return [];
  return Array.isArray(state.mapPings) ? state.mapPings : [];
}

/**
 * A flag the snapshot marks hidden, or a flag with no finite coordinates, is not drawable.
 * `{hidden:true}` is the live fog wire and has no x/y. Null and missing flags are skipped.
 */
function copyNumberPair(source, a, b) {
  if (!source || typeof source !== "object") return null;
  if (!Number.isFinite(source[a]) || !Number.isFinite(source[b])) return null;
  return { [a]: source[a], [b]: source[b] };
}

/** Fields the snapshot actually carries. Missing economy and capabilities stay omitted. */
export function panelPatchFromState(state) {
  const patch = {};
  if (!state || typeof state !== "object") return patch;
  const roster = unitsFromState(state);
  if (roster.availability === "server-list") {
    patch.units = roster.units.filter((unit) => unit && unit.id != null).map((unit) => {
      const row = { id: unit.id };
      if (Object.prototype.hasOwnProperty.call(unit, "name")) row.name = unit.name;
      if (Object.prototype.hasOwnProperty.call(unit, "selectable")) row.selectable = unit.selectable;
      return row;
    });
  }
  const budget = copyNumberPair(state.budget, "current", "cap");
  if (budget) patch.budget = budget;
  const orderCount = copyNumberPair(state.orderCount, "used", "max");
  if (orderCount) patch.orderCount = orderCount;
  if (state.capabilities && Object.prototype.hasOwnProperty.call(state.capabilities, "orders")) {
    patch.capabilities = { orders: state.capabilities.orders };
  }
  if (Number.isInteger(state.nextSeq) && state.nextSeq > 0) patch.nextSeq = state.nextSeq;
  return patch;
}

/**
 * command_view is a top-level patch with no commandResult.
 * command_ack and command_rejected carry the same patch on view, including commandResult.
 * The transport type is not passed to the panel.
 */
export function panelPatchFromCommandMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  if (msg.type === "command_view") {
    const patch = { ...msg };
    delete patch.type;
    delete patch.commandResult;
    return patch;
  }
  if (msg.type === "command_ack" || msg.type === "command_rejected") {
    if (!msg.view || typeof msg.view !== "object" || Array.isArray(msg.view)) return null;
    const patch = { ...msg.view };
    delete patch.type;
    return patch;
  }
  return null;
}

/**
 * The panel payload already includes type "command". Send that object once.
 * Do not wrap it in another envelope.
 */
export function forwardCommand(payload, send) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.type !== "command") {
    return { sent: false, reason: "payload-must-already-be-command" };
  }
  if (typeof send !== "function") return { sent: false, reason: "no-socket" };
  const wire = JSON.stringify(payload);
  send(payload);
  return { sent: true, wire };
}

/** Integer tile from a canvas point. Shape matches assessOrderTarget's {x,y} check. */
export function commandTargetFromScreen(camera, bounds, screenX, screenY) {
  if (!camera || !bounds) return null;
  const world = screenToWorld(camera, bounds, screenX, screenY);
  if (!world) return null;
  const tileSize = bounds.tileSize > 0 ? bounds.tileSize : 32;
  const tile = worldToTile(world.x, world.y, tileSize);
  const x = Math.floor(tile.x);
  const y = Math.floor(tile.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

/**
 * Fog tile check from docs/PROTOCOL.md and apps/server/fog.js assessOrderTarget.
 * Without a fog snapshot or an order id, the target is not sent.
 */
export function commandTargetMeta(fog, order, target) {
  if (!fog || !Number.isInteger(fog.width) || !Number.isInteger(fog.height)) {
    return { valid: false, reason: "target rules unavailable" };
  }
  if (!Array.isArray(fog.explored) || !Array.isArray(fog.visible)) {
    return { valid: false, reason: "target rules unavailable" };
  }
  if (typeof order !== "string" || order.length === 0) {
    return { valid: false, reason: "target rules unavailable" };
  }
  if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y)) {
    return { valid: false, reason: "invalid_target" };
  }
  if (target.x < 0 || target.y < 0 || target.x >= fog.width || target.y >= fog.height) {
    return { valid: false, reason: "invalid_target" };
  }
  const index = target.y * fog.width + target.x;
  const visible = fog.visible[index] === 1;
  const explored = fog.explored[index] === 1;
  if (order === "tag" && !visible) return { valid: false, reason: "target_not_visible" };
  if (order !== "scout" && !explored) return { valid: false, reason: "target_not_explored" };
  return { valid: true };
}

export function drawableFlags(flags) {
  if (!flags || typeof flags !== "object") return [];
  const drawn = [];
  for (const team of ["red", "bot"]) {
    const flag = flags[team];
    if (!flag || flag.hidden === true) continue;
    if (!Number.isFinite(flag.x) || !Number.isFinite(flag.y)) continue;
    drawn.push({ team, flag });
  }
  return drawn;
}

function maskOk(mask, cells) {
  return Array.isArray(mask)
    && mask.length === cells
    && mask.every((value) => value === 0 || value === 1);
}

/**
 * Describes fog data on a snapshot. secure is always false: this client does
 * not filter units and does not treat a mask as proof that hidden units are gone.
 * fog.js is not imported here.
 */
export function describeFog(state) {
  const base = { applied: false, secure: false };
  if (!state || !Object.prototype.hasOwnProperty.call(state, "fog") || state.fog == null) {
    return {
      ...base,
      availability: "missing-data",
      reason: "Snapshot has no fog field. This view is not masked.",
    };
  }
  const fog = state.fog;
  const width = fog.width;
  const height = fog.height;
  const cells = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? width * height
    : 0;
  if (!cells || !maskOk(fog.visible, cells) || !maskOk(fog.explored, cells)) {
    return {
      ...base,
      availability: "invalid",
      reason: "Fog field is present but does not match width, height, and 0/1 masks.",
    };
  }
  return {
    ...base,
    availability: "data-present",
    reason: "Fog masks are in the snapshot. No drawFog renderer is loaded, so masks are not drawn.",
  };
}

export function fogLabel(description) {
  if (!description) return "Fog: unknown";
  if (description.availability === "missing-data") return "Fog: no snapshot data (view is not masked)";
  if (description.availability === "invalid") return "Fog: snapshot field is invalid (not applied)";
  if (description.availability === "data-present") return "Fog: masks present, renderer not loaded (not drawn)";
  if (description.availability === "applied") return "Fog: supplied masks drawn (client does not filter units)";
  return "Fog: unknown";
}
