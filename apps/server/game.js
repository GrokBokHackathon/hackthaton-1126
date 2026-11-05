// Core game logic: map generation, match loop, rules
import { randomBytes } from "node:crypto";
import { steerSquad } from "./autopilot.js";
import { clientSnapshot, resetFog } from "./fog.js";

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
  visionBlockers: [1, 3], // WALL and BUSH
};

const TICK_MS = 1000 / CONFIG.tickRate;

// Tile types
const FLOOR = 0;
const WALL = 1;
const CRATE = 2;
const BUSH = 3;

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

function isBlocking(tiles, x, y, mapWidth, mapHeight) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) return true;
  const tile = tiles[ty][tx];
  return tile === WALL || tile === CRATE;
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
    this.reset();
  }

  reset() {
    const seed = randomSeed();
    this.map = generateMap(seed);
    this.players = new Map();
    this.flags = {
      red: { x: this.map.bases.red.x, y: this.map.bases.red.y, carrier: null },
      bot: { x: this.map.bases.bot.x, y: this.map.bases.bot.y, carrier: null },
    };
    this.score = { red: 0, bot: 0 };
    this.phase = "waiting"; // waiting, playing, ended
    this.tickCount = 0;
    this.winner = null;
    this.endTime = null;
    this.newMapGenerated = true; // Flag for server to send newMap message
    resetFog(this);
  }

  clientStateFor(team) {
    return clientSnapshot(this, team, CONFIG.visionRadius, CONFIG.visionBlockers);
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
    if (this.phase === "waiting" && this.hasHumans()) {
      this.phase = "playing";
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

    // Stop match if no humans
    if (this.phase === "playing" && !this.hasHumans()) {
      this.phase = "waiting";
    }
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
    if (this.phase === "ended") {
      if (Date.now() >= this.endTime) {
        const hadPlayers = this.players.size > 0;
        this.reset();
        if (hadPlayers) {
          // Respawn existing players at their bases
          for (const player of this.players.values()) {
            const base = this.map.bases[player.team];
            player.x = base.x + (Math.random() - 0.5) * 1.5;
            player.y = base.y + (Math.random() - 0.5) * 1.5;
            player.hasFlag = false;
            player.state = "idle";
            player.dx = 0;
            player.dy = 0;
            player.respawnTime = null;
          }
          return [{ type: "newMap", map: this.getMapData() }];
        }
      }
      return [];
    }

    if (this.phase !== "playing") {
      return [];
    }

    this.tickCount++;
    const events = [];
    steerSquad(this, CONFIG.flagPickupRadius);

    // Update players
    for (const player of this.players.values()) {
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

        const speed = CONFIG.playerSpeed * dt;
        const newX = player.x + ndx * speed;
        const newY = player.y + ndy * speed;

        // Collision check
        if (!isBlocking(this.map.tiles, newX, player.y, this.map.width, this.map.height)) {
          player.x = newX;
        }
        if (!isBlocking(this.map.tiles, player.x, newY, this.map.width, this.map.height)) {
          player.y = newY;
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
        if (distance(player, base) < CONFIG.flagPickupRadius) {
          // Score!
          this.score[player.team]++;
          events.push({
            type: "scored",
            team: player.team,
            carrier: player.id,
            score: { ...this.score },
          });

          // Return flag
          flag.carrier = null;
          flag.x = this.map.bases[enemyTeam].x;
          flag.y = this.map.bases[enemyTeam].y;
          player.hasFlag = false;

          // Check win
          if (this.score[player.team] >= CONFIG.winScore) {
            this.phase = "ended";
            this.winner = player.team;
            this.endTime = Date.now() + CONFIG.matchEndDelayMs;
            events.push({
              type: "matchEnd",
              winner: player.team,
              finalScore: { ...this.score },
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
