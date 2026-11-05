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
