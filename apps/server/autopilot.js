// Role autopilot. The match tick calls steerSquad. No orders economy here.
// Defaults, when player.order is absent or still the role default:
//   runner — enemy flag, then home
//   guard — home flag; chase an enemy carrier who is in our half
//   roamer — escort a friendly carrier, otherwise patrol midfield
// Any carrier paths home and treats tiles within 4 of an enemy as expensive.

import { commandGoal } from "./commands.js";
import { nearestWalkable, planPath } from "./path.js";

export const DEFAULT_ROLES = ["runner", "guard", "roamer"];
export const AVOID_RADIUS = 4;

const ROLE_LABEL = { runner: "Runner", guard: "Guard", roamer: "Roamer" };

function roleName(team, role) {
  const side = team === "red" ? "Red" : "Bot";
  return `${side} ${ROLE_LABEL[role] || role}`;
}

export function spawnSquad(match, perTeam = 3, roles = DEFAULT_ROLES) {
  const count = Math.max(0, Math.min(12, Number(perTeam) || 0));
  for (const team of ["red", "bot"]) {
    const already = [...match.players.values()].filter((player) => player.autopilot && player.team === team).length;
    for (let i = already; i < count; i++) {
      const role = roles[i % roles.length];
      const player = match.addPlayer(`auto-${team}-${i}`, roleName(team, role), "bot", team);
      player.autopilot = true;
      player.controller = "scripted-autopilot";
      player.role = role;
      player.order = { source: "role-default", role };
      player.waypointIndex = 0;
      player.waypoints = null;
    }
  }
}

function enemyTeam(team) {
  return team === "red" ? "bot" : "red";
}

function inTeamHalf(match, team, point) {
  return team === "red" ? point.y < match.map.height / 2 : point.y >= match.map.height / 2;
}

function enemyCarrierInOurHalf(match, team) {
  const carrierId = match.flags[team].carrier;
  if (!carrierId) return null;
  const carrier = match.players.get(carrierId);
  if (!carrier || carrier.team === team || carrier.state === "tagged") return null;
  return inTeamHalf(match, team, carrier) ? carrier : null;
}

function friendlyCarrier(match, player) {
  for (const other of match.players.values()) {
    if (other.id !== player.id && other.team === player.team && other.hasFlag && other.state !== "tagged") {
      return other;
    }
  }
  return null;
}

function midfieldWaypoints(match) {
  const tiles = match.map.tiles;
  const width = match.map.width;
  const height = match.map.height;
  return [
    { x: Math.floor(width / 2), y: Math.floor(height * 0.35) },
    { x: Math.floor(width / 2), y: Math.floor(height * 0.65) },
  ]
    .map((anchor) => nearestWalkable(tiles, anchor.x, anchor.y))
    .filter(Boolean);
}

function roleGoal(match, player) {
  const role = player.order?.role || player.role || "runner";
  if (role === "guard") {
    return enemyCarrierInOurHalf(match, player.team) || match.flags[player.team];
  }
  if (role === "roamer") {
    const escorted = friendlyCarrier(match, player);
    if (escorted) return escorted;
    if (!player.waypoints || player.waypoints.length === 0) {
      player.waypoints = midfieldWaypoints(match);
      player.waypointIndex = 0;
    }
    if (!player.waypoints.length) return match.map.bases[player.team];
    const index = player.waypointIndex % player.waypoints.length;
    const point = player.waypoints[index];
    if (Math.hypot(point.x + 0.5 - player.x, point.y + 0.5 - player.y) < 1.2) {
      player.waypointIndex = index + 1;
    }
    return player.waypoints[player.waypointIndex % player.waypoints.length];
  }
  return match.flags[enemyTeam(player.team)];
}

function steerToward(match, player, goal, avoid, arriveRadius) {
  const dx = goal.x - player.x;
  const dy = goal.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= arriveRadius) return { dx: 0, dy: 0 };

  const sameTile =
    Math.floor(player.x) === Math.floor(goal.x) && Math.floor(player.y) === Math.floor(goal.y);
  if (sameTile) return { dx, dy };

  const path = planPath(
    match.map.tiles,
    { x: Math.floor(player.x), y: Math.floor(player.y) },
    { x: goal.x, y: goal.y },
    { avoid, avoidRadius: avoid.length ? AVOID_RADIUS : 0 }
  );
  if (path.length < 2) return { dx, dy };
  const next = path[1];
  return { dx: next.x + 0.5 - player.x, dy: next.y + 0.5 - player.y };
}

export function steerSquad(match, arriveRadius = 0.7) {
  for (const player of match.players.values()) {
    if (!player.autopilot) continue;
    if (player.state === "tagged" || player.state === "respawn") continue;
    const carrying = player.hasFlag;
    const ordered = commandGoal(player);
    const goal = carrying ? match.map.bases[player.team] : ordered || roleGoal(match, player);
    if (ordered && !carrying && Math.hypot(ordered.x - player.x, ordered.y - player.y) <= arriveRadius) {
      player.order = { source: "role-default", role: player.role };
    }
    const avoid = [];
    if (carrying) {
      for (const other of match.players.values()) {
        if (other.team !== player.team && other.state !== "tagged" && other.state !== "respawn") {
          avoid.push(other);
        }
      }
    }
    const steer = steerToward(match, player, goal, avoid, arriveRadius);
    player.dx = steer.dx;
    player.dy = steer.dy;
  }
}
