/**
 * View constants for the commander camera and unit overlay.
 * Tile size, pivot, and team colors match apps/web/assets.js on main.
 * This module does not import assets.js or spriteLoader.js (those load images).
 */

export const HANDOFF_VERSION = "2026-11-05.1";

export const TILE_SIZE = 32;
export const FRAME_SIZE = 32;
export const PIVOT_X = 16;
export const PIVOT_Y = 30;

/** Issue 8: the short side of the viewport shows this many tiles. */
export const TILES_ON_SHORT_SIDE = 16;

export const TEAM_IDS = Object.freeze(["red", "bot"]);

export const TEAM_COLORS = Object.freeze({
  red: "#C42032",
  bot: "#A27BFF",
});

/**
 * Order ids from issue 6. Issue 10 badge frames are `badge_<order>`.
 * `reroute` is drawn in the art pack and is out of scope (issue 11); it is not an order id here.
 */
export const ORDER_IDS = Object.freeze([
  "rally",
  "scout",
  "defend",
  "escort",
  "attack",
  "tag",
  "beer",
]);

export const SEL_RING_FRAME_MS = 200;
export const SEL_RING_FRAME_COUNT = 2;
export const THINKING_FRAME_MS = 200;
export const THINKING_FRAME_COUNT = 3;
export const PING_FRAME_MS = 100;
export const PING_FRAME_COUNT = 3;

export const BADGE_SOURCE_PX = 16;
export const MIN_BADGE_SCREEN_PX = 16;
export const MARKER_GAP_SCREEN_PX = 2;

export const DRAG_THRESHOLD_PX = 8;
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_DISTANCE_PX = 24;

/** Client pick slop for double-tap centering. Not a server collision radius. */
export const TAP_RADIUS_TILES = 0.75;

export const INTENT_DASH = Object.freeze([4, 4]);
export const INTENT_LINE_WIDTH = 2;

export const REMOVED_MOVEMENT_CONTROLS = Object.freeze([
  "keyboard-wasd",
  "keyboard-arrows",
  "on-screen-joystick",
]);
