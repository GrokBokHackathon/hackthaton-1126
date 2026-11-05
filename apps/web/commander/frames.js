/**
 * Readability frames copied from apps/web/assets/atlas.json on main.
 * Rects are checked against that file by commander tests.
 * badge_* live in group ui_orders; rings, pings, pins, and thinking live in fx_command.
 */

export const READABILITY_FRAME_NAMES = Object.freeze([
  "badge_rally",
  "badge_scout",
  "badge_defend",
  "badge_escort",
  "badge_attack",
  "badge_tag",
  "badge_beer",
  "sel_ring_red_0",
  "sel_ring_red_1",
  "sel_ring_bot_0",
  "sel_ring_bot_1",
  "ping_red_0",
  "ping_red_1",
  "ping_red_2",
  "ping_bot_0",
  "ping_bot_1",
  "ping_bot_2",
  "pin_red",
  "pin_bot",
  "emote_thinking_0",
  "emote_thinking_1",
  "emote_thinking_2",
]);

const UI_ORDERS = "ui_orders_placeholder.png";
const FX_COMMAND = "fx_command_placeholder.png";

/** @type {Record<string, {group: string, image: string, x: number, y: number, w: number, h: number}>} */
const FRAMES = {
  badge_rally: { group: "ui_orders", image: UI_ORDERS, x: 0, y: 64, w: 16, h: 16 },
  badge_scout: { group: "ui_orders", image: UI_ORDERS, x: 16, y: 64, w: 16, h: 16 },
  badge_defend: { group: "ui_orders", image: UI_ORDERS, x: 32, y: 64, w: 16, h: 16 },
  badge_escort: { group: "ui_orders", image: UI_ORDERS, x: 48, y: 64, w: 16, h: 16 },
  badge_attack: { group: "ui_orders", image: UI_ORDERS, x: 64, y: 64, w: 16, h: 16 },
  badge_tag: { group: "ui_orders", image: UI_ORDERS, x: 80, y: 64, w: 16, h: 16 },
  badge_beer: { group: "ui_orders", image: UI_ORDERS, x: 112, y: 64, w: 16, h: 16 },
  sel_ring_red_0: { group: "fx_command", image: FX_COMMAND, x: 0, y: 0, w: 32, h: 16 },
  sel_ring_red_1: { group: "fx_command", image: FX_COMMAND, x: 32, y: 0, w: 32, h: 16 },
  sel_ring_bot_0: { group: "fx_command", image: FX_COMMAND, x: 64, y: 0, w: 32, h: 16 },
  sel_ring_bot_1: { group: "fx_command", image: FX_COMMAND, x: 96, y: 0, w: 32, h: 16 },
  ping_red_0: { group: "fx_command", image: FX_COMMAND, x: 0, y: 16, w: 32, h: 32 },
  ping_red_1: { group: "fx_command", image: FX_COMMAND, x: 32, y: 16, w: 32, h: 32 },
  ping_red_2: { group: "fx_command", image: FX_COMMAND, x: 64, y: 16, w: 32, h: 32 },
  ping_bot_0: { group: "fx_command", image: FX_COMMAND, x: 96, y: 16, w: 32, h: 32 },
  ping_bot_1: { group: "fx_command", image: FX_COMMAND, x: 128, y: 16, w: 32, h: 32 },
  ping_bot_2: { group: "fx_command", image: FX_COMMAND, x: 160, y: 16, w: 32, h: 32 },
  pin_red: { group: "fx_command", image: FX_COMMAND, x: 192, y: 16, w: 16, h: 16 },
  pin_bot: { group: "fx_command", image: FX_COMMAND, x: 208, y: 16, w: 16, h: 16 },
  emote_thinking_0: { group: "fx_command", image: FX_COMMAND, x: 0, y: 48, w: 16, h: 16 },
  emote_thinking_1: { group: "fx_command", image: FX_COMMAND, x: 16, y: 48, w: 16, h: 16 },
  emote_thinking_2: { group: "fx_command", image: FX_COMMAND, x: 32, y: 48, w: 16, h: 16 },
};

export function atlasFrame(name) {
  const frame = FRAMES[name];
  return frame ? { name, ...frame } : null;
}
