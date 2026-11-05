// Core game logic: map generation, match loop, rules
import { randomBytes } from "node:crypto";
import { steerSquad } from "./autopilot.js";
import { beerActive, grantCaptureLoss, resetEconomy, speedScale, tickEconomy } from "./commands.js";
import { clientSnapshot, resetFog } from "./fog.js";
import { createMatchLifecycle } from "./match-lifecycle.js";

// Configuration
export const CONFIG = {
  tileSize: 32,
  mapWidth: 64,
  mapHeight: 40,
  playerSpeed: 3.0, // tiles per second
  playerRadius: 0.4,
  flagPickupRadius: 0.7,
  tagRadius: 0.8,
  respawnTimeMs: 2000,
  botRespawnTimeMs: 3000,
  tickRate: 20, // Hz
  winScore: 3,
  matchEndDelayMs: 5000,
  // Fog of war (prepare for future PR)
  visionRadius: 7, // tiles
  visionBlockers: [1, 3, 4], // WALL, BUSH, and TREE
  // Character footprint (relative to center position, in tiles)
  // Pivot is at (16, 30) pixels = (0.5, 0.9375) tiles on a 32px grid
  // Footprint represents the character's feet/base collision area
  footprintRadius: 0.3, // circular footprint for collision checks
  // Tree slowdown factor (multiplicative speed reduction when in trees)
  treeSlowdown: 0.5, // 50% speed in trees (same as documented mud behavior)
  // Maximum movement step to prevent tunneling (in tiles)
  maxMovementStep: 0.5,
};

const TICK_MS = 1000 / CONFIG.tickRate;

export const TEAMS = Object.freeze(["red", "bot"]);

/** Optional `team` on a join. Missing keeps the old default (humans red, bots bot). */
export function resolveJoinTeam(value) {
  if (value == null || value === "") return { ok: true, team: null };
  if (TEAMS.includes(value)) return { ok: true, team: value };
  return { ok: false, error: "invalid_team" };
}

// Tile types
const FLOOR = 0;
const WALL = 1;
const CRATE = 2;
const BUSH = 3;
const TREE = 4;

function randomId() {
  return randomBytes(8).toString("hex");
}

function randomSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}

// Simple seeded PRNG (mulberry32)
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate map with bases in opposite corners
export function generateMap(seed, config = CONFIG) {
  const rng = createRng(seed);
  const MAP_WIDTH = config.mapWidth;
  const MAP_HEIGHT = config.mapHeight;
  const tiles = Array.from({ length: MAP_HEIGHT }, () =>
    Array.from({ length: MAP_WIDTH }, () => FLOOR)
  );

  // Add walls along edges
  for (let x = 0; x < MAP_WIDTH; x++) {
    tiles[0][x] = WALL;
    tiles[MAP_HEIGHT - 1][x] = WALL;
  }
  for (let y = 0; y < MAP_HEIGHT; y++) {
    tiles[y][0] = WALL;
    tiles[y][MAP_WIDTH - 1] = WALL;
  }

  // Add random walls, crates, bushes (but not in base areas)
  const baseSize = 4;
  let wallCount = 0;
  let crateCount = 0;
  let bushCount = 0;

  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      // Skip base areas (top-left and bottom-right corners)
      if (
        (x < baseSize && y < baseSize) ||
        (x >= MAP_WIDTH - baseSize && y >= MAP_HEIGHT - baseSize)
      ) {
        continue;
      }

      const r = rng();
      if (r < 0.08) {
        tiles[y][x] = WALL;
        wallCount++;
      } else if (r < 0.12) {
        tiles[y][x] = CRATE;
        crateCount++;
      } else if (r < 0.18) {
        tiles[y][x] = BUSH;
        bushCount++;
      }
    }
  }

  // Base positions (center of 2x2 area)
  const bases = {
    red: { x: 2, y: 2 },
    bot: { x: MAP_WIDTH - 3, y: MAP_HEIGHT - 3 },
  };

  // Verify connectivity via flood fill
  const visited = Array.from({ length: MAP_HEIGHT }, () =>
    Array(MAP_WIDTH).fill(false)
  );
  const queue = [{ x: bases.red.x, y: bases.red.y }];
  visited[bases.red.y][bases.red.x] = true;

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (
        nx >= 0 &&
        nx < MAP_WIDTH &&
        ny >= 0 &&
        ny < MAP_HEIGHT &&
        !visited[ny][nx] &&
        (tiles[ny][nx] === FLOOR || tiles[ny][nx] === BUSH)
      ) {
        visited[ny][nx] = true;
        queue.push({ x: nx, y: ny });
      }
    }
  }

  const connected =
    visited[bases.bot.y][bases.bot.x] ||
    visited[Math.floor(bases.bot.y)][Math.floor(bases.bot.x)];

  // Ensure meaningful obstacle density: at least 40 total obstacles with variety
  const totalObstacles = wallCount + crateCount + bushCount;
  const hasVariety = wallCount > 0 && crateCount > 0 && bushCount > 0;

  if (!connected || totalObstacles < 40 || !hasVariety) {
    // Regenerate if not connected or insufficient obstacles
    return generateMap(seed + 1);
  }

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    seed,
    tiles,
    bases,
  };
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Check if a tile is hard-blocking (walls, crates, out of bounds)
function isBlocking(tiles, x, y, mapWidth, mapHeight) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) return true;
  const tile = tiles[ty][tx];
  return tile === WALL || tile === CRATE;
}

// Check if a tile is a tree (walkable but slows movement)
function isTileTree(tiles, x, y, mapWidth, mapHeight) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) return false;
  return tiles[ty][tx] === TREE;
}

// Check if the character footprint collides with blocking terrain
// Uses a circular footprint around the character's center position
function checkFootprintCollision(tiles, x, y, radius, mapWidth, mapHeight) {
  // Check the center point
  if (isBlocking(tiles, x, y, mapWidth, mapHeight)) return true;
  
  // Check cardinal and diagonal points around the footprint perimeter
  const checkPoints = [
    { dx: radius, dy: 0 },      // East
    { dx: -radius, dy: 0 },     // West
    { dx: 0, dy: radius },      // South
    { dx: 0, dy: -radius },     // North
    { dx: radius * 0.707, dy: radius * 0.707 },    // SE
    { dx: -radius * 0.707, dy: radius * 0.707 },   // SW
    { dx: radius * 0.707, dy: -radius * 0.707 },   // NE
    { dx: -radius * 0.707, dy: -radius * 0.707 },  // NW
  ];
  
  for (const point of checkPoints) {
    if (isBlocking(tiles, x + point.dx, y + point.dy, mapWidth, mapHeight)) {
      return true;
    }
  }
  
  return false;
}

// Calculate movement speed multiplier based on terrain at position
// Returns 1.0 for normal terrain, CONFIG.treeSlowdown for trees
function getTerrainSpeedMultiplier(tiles, x, y, mapWidth, mapHeight, config) {
  if (isTileTree(tiles, x, y, mapWidth, mapHeight)) {
    return config.treeSlowdown;
  }
  return 1.0;
}

function directionName(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  } else if (dy !== 0) {
    return dy > 0 ? "down" : "up";
  }
  return "down"; // default
}

export class Match {
  constructor() {
    this.players = new Map();
    this.nowMs = 0;
    this.tickCount = 0;
    this.installFreshRound();
    const opened = createMatchLifecycle(this.nowMs);
    this.lifecycle = opened.lifecycle;
    // Opening roundStarted has runHooks. installFreshRound already did that work once.
    this.phase = "waiting";
    this.commanderRoom = false;
    this.score = { red: 0, bot: 0 };
    this.winner = null;
    this.winReason = null;
    this.remainingMs = opened.remainingMs;
    this.roundId = opened.roundId;
    this.resultsEndsAtMs = null;
    this.endTime = null;
    this.newMapGenerated = true;
  }

  installFreshRound() {
    const seed = randomSeed();
    this.map = generateMap(seed);
    this.flags = {
      red: { x: this.map.bases.red.x, y: this.map.bases.red.y, carrier: null },
      bot: { x: this.map.bases.bot.x, y: this.map.bases.bot.y, carrier: null },
    };
    resetFog(this);
    resetEconomy(this);
  }

  applyNewRoundHooks() {
    this.installFreshRound();
    for (const player of this.players.values()) {
      const base = this.map.bases[player.team];
      player.x = base.x;
      player.y = base.y;
      player.hasFlag = false;
      player.state = "idle";
      player.dx = 0;
      player.dy = 0;
      player.respawnTime = null;
      player.waypoints = null;
      player.waypointIndex = 0;
      player.order = player.role ? { source: "role-default", role: player.role } : null;
    }
  }

  publishLifecycle(view) {
    this.score = { red: view.score.red, bot: view.score.bot };
    this.winner = view.winner;
    this.winReason = view.winReason;
    this.remainingMs = view.remainingMs;
    this.roundId = view.roundId;
    this.resultsEndsAtMs = view.resultsEndsAtMs;
    if (this.phase === "waiting") return;
    this.phase = view.phase;
  }

  absorbLifecycle(view, events) {
    this.publishLifecycle(view);
    const ended = view.events.find((event) => event.type === "roundEnded");
    if (ended) {
      events.push({
        type: "matchEnd",
        winner: ended.winner,
        finalScore: ended.score,
        winReason: ended.reason,
        resultsEndsAtMs: view.resultsEndsAtMs,
        remainingMs: view.remainingMs,
        roundId: view.roundId,
      });
    }
  }

  clientStateFor(team) {
    const snap = clientSnapshot(this, team, CONFIG.visionRadius, CONFIG.visionBlockers);
    return {
      ...snap,
      phase: this.phase,
      score: { ...this.score },
      winner: this.winner,
      winReason: this.winReason,
      remainingMs: this.remainingMs,
      roundId: this.roundId,
    };
  }

  getMapData() {
    return {
      width: this.map.width,
      height: this.map.height,
      seed: this.map.seed,
      tiles: this.map.tiles,
      bases: this.map.bases,
    };
  }

  addPlayer(id, name, kind, teamOverride) {
    const team = teamOverride === "red" || teamOverride === "bot" ? teamOverride : kind === "human" ? "red" : "bot";
    const base = this.map.bases[team];
    const player = {
      id,
      name,
      team,
      kind,
      x: base.x + (Math.random() - 0.5) * 1.5,
      y: base.y + (Math.random() - 0.5) * 1.5,
      dir: "down",
      hasFlag: false,
      state: "idle", // idle, running, carrying, tagged, respawn
      dx: 0,
      dy: 0,
      respawnTime: null,
      autopilot: false,
      controller: kind === "human" ? "human" : "client",
      role: null,
      order: null,
    };
    this.players.set(id, player);

    // Start match if we have at least one human
    if (this.hasHumans() && (this.phase === "waiting" || this.phase === "playing" || this.phase === "sudden_death")) {
      const live = this.lifecycle.snapshot().phase;
      if (live === "playing" || live === "sudden_death") this.phase = live;
    }

    return player;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (player && player.hasFlag) {
      // Return flag
      const flag = this.flags[player.team === "red" ? "bot" : "red"];
      flag.carrier = null;
      flag.x = this.map.bases[player.team === "red" ? "bot" : "red"].x;
      flag.y = this.map.bases[player.team === "red" ? "bot" : "red"].y;
    }
    this.players.delete(id);

    // A commander room has human sessions, not human bodies. Legacy rooms
    // still pause when the last human unit leaves.
    if (!this.commanderRoom && !this.hasHumans() && (this.phase === "playing" || this.phase === "sudden_death")) {
      this.phase = "waiting";
    }
  }

  activateCommanderRoom() {
    this.commanderRoom = true;
    if (this.phase !== "waiting") return this.snapshotPhase();
    const live = this.lifecycle.snapshot().phase;
    if (live === "playing" || live === "sudden_death") this.phase = live;
    return this.snapshotPhase();
  }

  releaseCommanderRoom() {
    this.commanderRoom = false;
    if (!this.hasHumans() && (this.phase === "playing" || this.phase === "sudden_death")) {
      this.phase = "waiting";
    }
    return this.snapshotPhase();
  }

  snapshotPhase() {
    return {
      commanderRoom: this.commanderRoom,
      phase: this.phase,
      roundId: this.roundId,
    };
  }

  hasHumans() {
    for (const player of this.players.values()) {
      if (player.kind === "human") return true;
    }
    return false;
  }

  setInput(id, dx, dy) {
    const player = this.players.get(id);
    if (player && player.state !== "tagged" && player.state !== "respawn") {
      player.dx = dx;
      player.dy = dy;
    }
  }

  tick(dt) {
    const events = [];
    if (this.phase !== "waiting") {
      this.nowMs += dt * 1000;
      let life = this.lifecycle.tick(this.nowMs);
      const due = life.events.find((event) => event.type === "resetRequired" && event.runHooks);
      if (due) {
        this.applyNewRoundHooks();
        life = this.lifecycle.reset(this.nowMs);
        this.absorbLifecycle(life, events);
        events.push({ type: "newMap", map: this.getMapData(), roundId: life.roundId });
        return events;
      }
      this.absorbLifecycle(life, events);
      if (this.phase === "results") {
        this.tickCount++;
        return events;
      }
    }

    if (this.phase !== "playing" && this.phase !== "sudden_death") {
      return events;
    }

    this.tickCount++;
    tickEconomy(this, dt);
    steerSquad(this, CONFIG.flagPickupRadius);

    // Update players
    for (const player of this.players.values()) {
      if (this.phase === "results") break;
      if (player.state === "tagged") {
        if (Date.now() >= player.respawnTime) {
          // Respawn at base
          const base = this.map.bases[player.team];
          player.x = base.x;
          player.y = base.y;
          player.state = "respawn";
          player.respawnTime = Date.now() + 500; // Brief invuln
        }
        continue;
      }

      if (player.state === "respawn") {
        if (Date.now() >= player.respawnTime) {
          player.state = "idle";
          player.respawnTime = null;
        }
        continue;
      }

      // Movement
      if (player.dx !== 0 || player.dy !== 0) {
        const len = Math.sqrt(player.dx ** 2 + player.dy ** 2);
        const ndx = player.dx / len;
        const ndy = player.dy / len;
        player.dir = directionName(ndx, ndy);

        // Base speed with economy modifier
        const baseSpeed = CONFIG.playerSpeed * dt * speedScale(this, player.team);
        
        // Apply terrain slowdown at current position
        const terrainMultiplier = getTerrainSpeedMultiplier(
          this.map.tiles, 
          player.x, 
          player.y, 
          this.map.width, 
          this.map.height,
          CONFIG
        );
        const speed = baseSpeed * terrainMultiplier;
        
        // Calculate desired movement
        const deltaX = ndx * speed;
        const deltaY = ndy * speed;
        
        // Prevent tunneling: if movement is large, break into smaller steps
        const movementMagnitude = Math.sqrt(deltaX ** 2 + deltaY ** 2);
        const numSteps = Math.max(1, Math.ceil(movementMagnitude / CONFIG.maxMovementStep));
        const stepX = deltaX / numSteps;
        const stepY = deltaY / numSteps;
        
        // Apply movement in substeps with footprint collision checking
        for (let step = 0; step < numSteps; step++) {
          const candidateX = player.x + stepX;
          const candidateY = player.y + stepY;
          
          // Try moving in both axes
          if (!checkFootprintCollision(
            this.map.tiles, 
            candidateX, 
            candidateY, 
            CONFIG.footprintRadius,
            this.map.width, 
            this.map.height
          )) {
            player.x = candidateX;
            player.y = candidateY;
          } else {
            // Try X-only movement (slide along walls)
            if (!checkFootprintCollision(
              this.map.tiles, 
              candidateX, 
              player.y, 
              CONFIG.footprintRadius,
              this.map.width, 
              this.map.height
            )) {
              player.x = candidateX;
            }
            // Try Y-only movement (slide along walls)
            if (!checkFootprintCollision(
              this.map.tiles, 
              player.x, 
              candidateY, 
              CONFIG.footprintRadius,
              this.map.width, 
              this.map.height
            )) {
              player.y = candidateY;
            }
          }
        }

        player.state = player.hasFlag ? "carrying" : "running";
      } else {
        player.state = player.hasFlag ? "carrying" : "idle";
      }

      // Flag pickup
      const enemyTeam = player.team === "red" ? "bot" : "red";
      const flag = this.flags[enemyTeam];
      if (!flag.carrier && distance(player, flag) < CONFIG.flagPickupRadius) {
        flag.carrier = player.id;
        player.hasFlag = true;
        player.state = "carrying";
      }

      // Flag carrier updates flag position
      if (player.hasFlag) {
        flag.x = player.x;
        flag.y = player.y;

        // Check for capture
        const base = this.map.bases[player.team];
        if (distance(player, base) < CONFIG.flagPickupRadius && (this.phase === "playing" || this.phase === "sudden_death")) {
          const view = this.lifecycle.capture(player.team, this.nowMs);
          const accepted = view.events.some((event) => event.type === "capture" && event.team === player.team);
          if (accepted) {
            grantCaptureLoss(this, enemyTeam);
            flag.carrier = null;
            flag.x = this.map.bases[enemyTeam].x;
            flag.y = this.map.bases[enemyTeam].y;
            player.hasFlag = false;
            this.absorbLifecycle(view, events);
            events.push({
              type: "scored",
              team: player.team,
              carrier: player.id,
              score: { ...this.score },
            });
          }
        }
      }
    }

    // Check for tags (carrier in enemy half)
    for (const player of this.players.values()) {
      if (player.state === "respawn" || player.state === "tagged") continue;

      const inOwnHalf =
        player.team === "red"
          ? player.y < this.map.height / 2
          : player.y >= this.map.height / 2;

      if (inOwnHalf) {
        // Check if we can tag enemy carriers
        for (const other of this.players.values()) {
          if (
            other.id !== player.id &&
            other.team !== player.team &&
            other.hasFlag &&
            !beerActive(this, other.team) &&
            distance(player, other) < CONFIG.tagRadius
          ) {
            // Tagged!
            const enemyTeam = other.team === "red" ? "bot" : "red";
            const flag = this.flags[enemyTeam];
            flag.carrier = null;
            flag.x = this.map.bases[enemyTeam].x;
            flag.y = this.map.bases[enemyTeam].y;
            other.hasFlag = false;
            other.state = "tagged";
            const respawnMs = other.kind === "bot" ? CONFIG.botRespawnTimeMs : CONFIG.respawnTimeMs;
            other.respawnTime = Date.now() + respawnMs;
          }
        }
      }
    }

    return events;
  }

  getState() {
    return {
      type: "state",
      tick: this.tickCount,
      phase: this.phase,
      winner: this.winner,
      winReason: this.winReason,
      remainingMs: this.remainingMs,
      roundId: this.roundId,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        kind: p.kind,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        dir: p.dir,
        hasFlag: p.hasFlag,
        state: p.state,
        role: p.role || null,
        controller: p.controller || null,
        order: p.order || null,
      })),
      flags: {
        red: {
          x: Math.round(this.flags.red.x * 100) / 100,
          y: Math.round(this.flags.red.y * 100) / 100,
          carrier: this.flags.red.carrier,
        },
        bot: {
          x: Math.round(this.flags.bot.x * 100) / 100,
          y: Math.round(this.flags.bot.y * 100) / 100,
          carrier: this.flags.bot.carrier,
        },
      },
      score: { ...this.score },
    };
  }
}
