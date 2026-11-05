// Issue 6 economy. The socket payload already includes type: "command".
// Do not wrap it again. Target objects are stored as sent.
// Gameplay reads integer target.x/target.y as tile coordinates
// (same space as Math.floor of a unit's x/y). Floats are rejected, not rounded.

import { assessOrderTarget, refreshFog } from "./fog.js";

export const ORDER_COST = Object.freeze({
  rally: 1,
  scout: 1,
  defend: 2,
  escort: 3,
  attack: 3,
  tag: 4,
  beer: 8,
});

export const ORDER_FRAME = Object.freeze({
  rally: "badge_rally",
  scout: "badge_scout",
  defend: "badge_defend",
  escort: "badge_escort",
  attack: "badge_attack",
  tag: "badge_tag",
  beer: "badge_beer",
});

export const CP_START = 6;
export const CP_CAP = 10;
export const CP_REGEN_MS = 5000;
export const CP_ON_LOSS = 3;
export const ORDER_LIMIT = 15;
export const GLOBAL_COOLDOWN_MS = 2000;
export const BOT_COOLDOWN_MS = 5000;
export const BEER_MS = 4000;
export const BEER_SPEED = 1.5;

const ORDER_IDS = Object.keys(ORDER_COST);

function freshTeam() {
  return {
    cp: CP_START,
    regenMs: 0,
    ordersUsed: 0,
    cooldownUntil: 0,
    beerUsed: false,
    beerUntil: 0,
    botCooldownUntil: {},
  };
}

export function resetEconomy(match) {
  match.commandMs = 0;
  match.economy = { red: freshTeam(), bot: freshTeam(), seq: { red: 1, bot: 1 } };
}

function book(match) {
  if (!match.economy) resetEconomy(match);
  return match.economy;
}

export function tickEconomy(match, dtSeconds) {
  const economy = book(match);
  if (match.phase !== "playing") return;
  match.commandMs += dtSeconds * 1000;
  for (const team of ["red", "bot"]) {
    const side = economy[team];
    side.regenMs += dtSeconds * 1000;
    while (side.regenMs >= CP_REGEN_MS && side.cp < CP_CAP) {
      side.cp += 1;
      side.regenMs -= CP_REGEN_MS;
    }
    if (side.cp >= CP_CAP) side.regenMs = 0;
  }
}

export function grantCaptureLoss(match, team) {
  const side = book(match)[team];
  if (!side) return;
  side.cp = Math.min(CP_CAP, side.cp + CP_ON_LOSS);
}

export function beerActive(match, team) {
  const side = book(match)[team];
  return Boolean(side && match.commandMs < side.beerUntil);
}

export function speedScale(match, team) {
  return beerActive(match, team) ? BEER_SPEED : 1;
}

function squad(match, team) {
  return [...match.players.values()].filter((player) => player.autopilot && player.team === team);
}

function reject(match, team, seq, reason) {
  return {
    type: "command_rejected",
    seq,
    reason,
    view: { ...commandView(match, team), commandResult: { type: "command_rejected", seq, reason } },
  };
}

function selection(match, team, payload) {
  const hasAll = payload.all === true;
  const hasIds = Array.isArray(payload.unitIds);
  if (hasAll && hasIds) return { error: "invalid_command" };
  if (hasAll) return { units: squad(match, team) };
  if (!hasIds || payload.unitIds.length === 0) return { error: "invalid_command" };
  const units = [];
  for (const id of payload.unitIds) {
    const player = match.players.get(id);
    if (!player || player.team !== team || !player.autopilot) return { error: "invalid_command" };
    units.push(player);
  }
  return { units };
}

function exactTarget(target, width, height) {
  if (!target || typeof target !== "object" || Array.isArray(target)) return null;
  if (!Number.isInteger(target.x) || !Number.isInteger(target.y)) return null;
  if (target.x < 0 || target.y < 0 || target.x >= width || target.y >= height) return null;
  return { ...target };
}

export function applyCommand(match, team, payload, vision) {
  const economy = book(match);
  const side = economy[team];
  const seq = payload?.seq;
  if (!Number.isInteger(seq) || seq <= 0) return reject(match, team, seq ?? null, "invalid_command");
  const order = payload.order;
  if (!Object.hasOwn(ORDER_COST, order)) return reject(match, team, seq, "invalid_command");
  const now = match.commandMs || 0;
  if (now < side.cooldownUntil) return reject(match, team, seq, "cooldown");
  if (side.ordersUsed >= ORDER_LIMIT) return reject(match, team, seq, "no_orders_left");
  if (order === "beer" && side.beerUsed) return reject(match, team, seq, "already_used");
  if (side.cp < ORDER_COST[order]) return reject(match, team, seq, "not_enough_cp");

  let units = [];
  let storedTarget = null;
  if (order !== "beer") {
    const picked = selection(match, team, payload);
    if (picked.error) return reject(match, team, seq, picked.error);
    units = picked.units;
    storedTarget = exactTarget(payload.target, match.map.width, match.map.height);
    if (!storedTarget) return reject(match, team, seq, "invalid_command");
    const exposure = assessOrderTarget(
      {
        width: match.map.width,
        height: match.map.height,
        explored: vision.explored,
        visible: vision.visible,
      },
      order,
      storedTarget
    );
    if (!exposure.ok) return reject(match, team, seq, exposure.reason === "invalid_target" ? "invalid_command" : exposure.reason);
    for (const player of units) {
      if (now < (side.botCooldownUntil[player.id] || 0)) return reject(match, team, seq, "cooldown");
    }
  }

  side.cp -= ORDER_COST[order];
  side.ordersUsed += 1;
  side.cooldownUntil = now + GLOBAL_COOLDOWN_MS;
  if (order === "beer") {
    side.beerUsed = true;
    side.beerUntil = now + BEER_MS;
    for (const player of squad(match, team)) side.botCooldownUntil[player.id] = now + BOT_COOLDOWN_MS;
  } else {
    for (const player of units) {
      side.botCooldownUntil[player.id] = now + BOT_COOLDOWN_MS;
      player.order = {
        source: "command",
        order,
        role: player.role,
        target: storedTarget,
        seq,
        all: payload.all === true,
      };
    }
  }
  economy.seq[team] = Math.max(economy.seq[team], seq + 1);
  const view = commandView(match, team);
  view.commandResult = { type: "command_ack", seq };
  return { type: "command_ack", seq, view };
}

export function visionFor(match, team, radius, blockers) {
  const visible = refreshFog(match, radius, blockers);
  return {
    explored: match.fogMemory[team],
    visible: visible[team],
  };
}

function orderRow(match, team, id) {
  const side = book(match)[team];
  const now = match.commandMs || 0;
  const cost = ORDER_COST[id];
  let disabledReason;
  if (id === "beer" && side.beerUsed) disabledReason = "already_used";
  else if (side.ordersUsed >= ORDER_LIMIT) disabledReason = "no_orders_left";
  else if (now < side.cooldownUntil) disabledReason = "cooldown";
  else if (side.cp < cost) disabledReason = "not_enough_cp";
  const row = {
    id,
    label: id,
    frame: ORDER_FRAME[id],
    cost,
    enabled: disabledReason ? false : true,
  };
  if (disabledReason) row.disabledReason = disabledReason;
  if (now < side.cooldownUntil) {
    row.cooldown = { remainingMs: side.cooldownUntil - now, durationMs: GLOBAL_COOLDOWN_MS };
  }
  return row;
}

export function commandView(match, team) {
  const side = book(match)[team];
  return {
    nextSeq: book(match).seq[team],
    units: squad(match, team).map((player) => ({
      id: player.id,
      name: player.name,
      selectable: true,
    })),
    budget: { current: side.cp, cap: CP_CAP },
    orderCount: { used: side.ordersUsed, max: ORDER_LIMIT },
    capabilities: { orders: ORDER_IDS.map((id) => orderRow(match, team, id)) },
  };
}

export function commandGoal(player) {
  const order = player.order;
  if (!order || order.source !== "command" || !order.target) return null;
  if (!Number.isInteger(order.target.x) || !Number.isInteger(order.target.y)) return null;
  return { x: order.target.x + 0.5, y: order.target.y + 0.5 };
}
