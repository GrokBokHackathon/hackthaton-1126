import { TILE_SIZE, TILES_ON_SHORT_SIDE } from "./constants.js";

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Issue 8 zoom. shortSide / (16 * tileSize).
 * At >= 2, floor to an integer and use nearest-neighbour (smoothing false).
 * Below 2, keep the fraction and smooth.
 * Flooring never shows fewer than 16 tiles on the short side.
 */
export function computeZoom(viewportWidth, viewportHeight, tileSize = TILE_SIZE) {
  const width = Number.isFinite(viewportWidth) ? viewportWidth : 0;
  const height = Number.isFinite(viewportHeight) ? viewportHeight : 0;
  const shortSide = Math.min(width, height);
  const safeTile = tileSize > 0 ? tileSize : TILE_SIZE;
  if (!(shortSide > 0)) {
    return {
      shortSide: 0,
      targetZoom: 0,
      zoom: 1,
      smoothing: true,
      floored: false,
      tilesOnShortSide: 0,
      nominalTilesOnShortSide: TILES_ON_SHORT_SIDE,
    };
  }
  const targetZoom = shortSide / (TILES_ON_SHORT_SIDE * safeTile);
  const floored = targetZoom >= 2;
  const zoom = floored ? Math.floor(targetZoom) : targetZoom;
  return {
    shortSide,
    targetZoom,
    zoom,
    smoothing: !floored,
    floored,
    tilesOnShortSide: shortSide / (safeTile * zoom),
    nominalTilesOnShortSide: TILES_ON_SHORT_SIDE,
  };
}

export function visibleShortSideTiles(viewportWidth, viewportHeight, zoom, tileSize = TILE_SIZE) {
  const shortSide = Math.min(
    Number.isFinite(viewportWidth) ? viewportWidth : 0,
    Number.isFinite(viewportHeight) ? viewportHeight : 0,
  );
  if (!(zoom > 0) || !(tileSize > 0)) return 0;
  return shortSide / (tileSize * zoom);
}

function requireBounds(bounds, name) {
  if (!bounds || !Number.isFinite(bounds.mapWidth) || !Number.isFinite(bounds.mapHeight)) {
    throw new TypeError(`${name} requires bounds.mapWidth and bounds.mapHeight in tiles`);
  }
}

function clampFocus(focusX, focusY, viewportWidth, viewportHeight, zoom, bounds, tileSize) {
  const mapW = bounds.mapWidth * tileSize;
  const mapH = bounds.mapHeight * tileSize;
  const z = zoom > 0 ? zoom : 1;
  const viewW = viewportWidth / z;
  const viewH = viewportHeight / z;
  let x = focusX;
  let y = focusY;
  if (!(mapW > viewW)) x = mapW / 2;
  else x = Math.min(mapW - viewW / 2, Math.max(viewW / 2, x));
  if (!(mapH > viewH)) y = mapH / 2;
  else y = Math.min(mapH - viewH / 2, Math.max(viewH / 2, y));
  return { x, y };
}

/**
 * World-pixel focus for the commander's own base. Tile coordinates match
 * welcome.map.bases. Unknown teams return null so the caller keeps the map center.
 * This is an opening frame only. It does not follow units.
 */
export function initialFocusForTeam(map, team, tileSize = TILE_SIZE) {
  const base = map && map.bases && (team === "red" || team === "bot") ? map.bases[team] : null;
  if (!base || !Number.isFinite(base.x) || !Number.isFinite(base.y)) return null;
  const size = tileSize > 0 ? tileSize : TILE_SIZE;
  return { focusX: base.x * size, focusY: base.y * size };
}

/**
 * First viewport opens on the team base. A later call keeps the existing focus,
 * including a user pan. Passing null opens again, which is the new-round path.
 */
export function cameraForViewport(existing, { width, height, bounds, map, team, tileSize } = {}) {
  if (!existing) {
    const home = initialFocusForTeam(map, team, tileSize ?? bounds?.tileSize);
    return createCameraState({
      viewportWidth: width,
      viewportHeight: height,
      bounds,
      ...(home || {}),
    });
  }
  return updateCamera(existing, { viewportWidth: width, viewportHeight: height }, 0, bounds);
}

/**
 * @param {{viewportWidth: number, viewportHeight: number, bounds: {mapWidth: number, mapHeight: number, tileSize?: number}, focusX?: number, focusY?: number}} options
 * focusX/focusY are world pixels. Default is the map center.
 */
export function createCameraState({ viewportWidth, viewportHeight, bounds, focusX, focusY } = {}) {
  requireBounds(bounds, "createCameraState");
  const tileSize = bounds.tileSize > 0 ? bounds.tileSize : TILE_SIZE;
  const zoomInfo = computeZoom(viewportWidth, viewportHeight, tileSize);
  const width = finite(viewportWidth, 0);
  const height = finite(viewportHeight, 0);
  const mapW = bounds.mapWidth * tileSize;
  const mapH = bounds.mapHeight * tileSize;
  const requestedX = finite(focusX, mapW / 2);
  const requestedY = finite(focusY, mapH / 2);
  const clamped = clampFocus(requestedX, requestedY, width, height, zoomInfo.zoom, bounds, tileSize);
  return {
    focusX: clamped.x,
    focusY: clamped.y,
    viewportWidth: width,
    viewportHeight: height,
    tileSize,
    zoom: zoomInfo.zoom,
    smoothing: zoomInfo.smoothing,
  };
}

/**
 * Pure camera step. Does not mutate `state` or `input`.
 * Signature is updateCamera(state, input, dt, bounds): there is no module-global camera.
 * `dt` is milliseconds and is accepted for the frame loop. Pan deltas are screen pixels
 * for this update and are not multiplied by dt.
 * Zoom always comes from the issue 8 formula. `input.zoom` is ignored.
 * centerOn.space "tile" matches player.x/player.y. "world-px" is world pixels. Other spaces are ignored.
 */
export function updateCamera(state, input = {}, dt = 0, bounds) {
  if (!state) throw new TypeError("updateCamera requires a camera state");
  requireBounds(bounds, "updateCamera");
  void dt;

  const tileSize = bounds.tileSize > 0 ? bounds.tileSize : (state.tileSize > 0 ? state.tileSize : TILE_SIZE);
  const viewportWidth = finite(input.viewportWidth, state.viewportWidth);
  const viewportHeight = finite(input.viewportHeight, state.viewportHeight);
  const zoomInfo = computeZoom(viewportWidth, viewportHeight, tileSize);

  let focusX = state.focusX;
  let focusY = state.focusY;
  const center = input.centerOn;
  if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
    const space = center.space ?? "tile";
    if (space === "tile") {
      focusX = center.x * tileSize;
      focusY = center.y * tileSize;
    } else if (space === "world-px") {
      focusX = center.x;
      focusY = center.y;
    }
  }

  const panX = Number.isFinite(input.panScreenX) ? input.panScreenX : 0;
  const panY = Number.isFinite(input.panScreenY) ? input.panScreenY : 0;
  if (zoomInfo.zoom > 0) {
    focusX -= panX / zoomInfo.zoom;
    focusY -= panY / zoomInfo.zoom;
  }

  const clamped = clampFocus(focusX, focusY, viewportWidth, viewportHeight, zoomInfo.zoom, bounds, tileSize);
  return {
    focusX: clamped.x,
    focusY: clamped.y,
    viewportWidth,
    viewportHeight,
    tileSize,
    zoom: zoomInfo.zoom,
    smoothing: zoomInfo.smoothing,
  };
}

/**
 * World pass transform. Matches main's game.js order: translate(offset) then scale(zoom).
 * World pixels are tile * tileSize, the same space drawPlayer uses before the camera scale.
 * Zoom is recomputed from the viewport so a stale state.zoom cannot change the scale.
 */
export function cameraTransform(state, bounds) {
  if (!state) throw new TypeError("cameraTransform requires a camera state");
  requireBounds(bounds, "cameraTransform");
  const tileSize = bounds.tileSize > 0 ? bounds.tileSize : (state.tileSize > 0 ? state.tileSize : TILE_SIZE);
  const zoomInfo = computeZoom(state.viewportWidth, state.viewportHeight, tileSize);
  const focus = clampFocus(
    state.focusX,
    state.focusY,
    state.viewportWidth,
    state.viewportHeight,
    zoomInfo.zoom,
    bounds,
    tileSize,
  );
  return {
    offsetX: state.viewportWidth / 2 - focus.x * zoomInfo.zoom,
    offsetY: state.viewportHeight / 2 - focus.y * zoomInfo.zoom,
    zoom: zoomInfo.zoom,
    smoothing: zoomInfo.smoothing,
    imageSmoothingEnabled: zoomInfo.smoothing,
    space: "world",
    focusX: focus.x,
    focusY: focus.y,
    shortSideTiles: zoomInfo.tilesOnShortSide,
    nominalShortSideTiles: TILES_ON_SHORT_SIDE,
  };
}

/** Screen-space UI. Zoom is always 1. The world camera does not scale HUD rects. */
export function screenSpaceTransform() {
  return { offsetX: 0, offsetY: 0, zoom: 1, space: "screen" };
}

export function layoutScreenRect(rect, transform = screenSpaceTransform()) {
  return {
    x: rect.x * transform.zoom + transform.offsetX,
    y: rect.y * transform.zoom + transform.offsetY,
    w: rect.w * transform.zoom,
    h: rect.h * transform.zoom,
  };
}

export function worldToScreen(state, bounds, worldX, worldY) {
  const transform = cameraTransform(state, bounds);
  if (!(transform.zoom > 0)) return null;
  return {
    x: transform.offsetX + worldX * transform.zoom,
    y: transform.offsetY + worldY * transform.zoom,
  };
}

export function screenToWorld(state, bounds, screenX, screenY) {
  const transform = cameraTransform(state, bounds);
  if (!(transform.zoom > 0)) return null;
  return {
    x: (screenX - transform.offsetX) / transform.zoom,
    y: (screenY - transform.offsetY) / transform.zoom,
  };
}

export function tileToWorld(tileX, tileY, tileSize = TILE_SIZE) {
  return { x: tileX * tileSize, y: tileY * tileSize };
}

export function worldToTile(worldX, worldY, tileSize = TILE_SIZE) {
  const safe = tileSize > 0 ? tileSize : TILE_SIZE;
  return { x: worldX / safe, y: worldY / safe };
}

/** welcome.map on main: width and height in tiles. Does not read the tile array. */
export function boundsFromMap(map, tileSize = TILE_SIZE) {
  if (!map || !Number.isFinite(map.width) || !Number.isFinite(map.height)) {
    throw new TypeError("boundsFromMap requires map.width and map.height");
  }
  return {
    mapWidth: map.width,
    mapHeight: map.height,
    tileSize: tileSize > 0 ? tileSize : TILE_SIZE,
  };
}
