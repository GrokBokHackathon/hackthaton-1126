// Asset configuration and rendering with art-pack sprites via spriteLoader
import { spriteLoader } from "./spriteLoader.js";

export const CONFIG = {
  tileSize: 32,
  frameSize: 32,
  pivotX: 16,
  pivotY: 30,
  scale: 2,
  animFrameMs: 150,
};

// Team colors
export const TEAM_COLORS = {
  red: "#C42032",
  bot: "#A27BFF",
};

// Animation frame timing (ms)
export const FRAME_TIMING = {
  run: 150,
  flag: 250,
  respawn: 80,
  hit: 60,
  dizzy: 150,
  carry: 250,
};

// Tile rendering
export const TILE_TYPES = {
  0: { name: "floor", color: "#3a3a3a" },
  1: { name: "wall", color: "#666" },
  2: { name: "crate", color: "#8b6f47" },
  3: { name: "bush", color: "#2d5016" },
};

function calculateNeighbors(map, x, y, tileType) {
  let neighbors = 0;
  const tx = Math.floor(x / CONFIG.tileSize);
  const ty = Math.floor(y / CONFIG.tileSize);
  
  if (ty > 0 && map[ty - 1][tx] === tileType) neighbors |= 1; // N
  if (tx < map[0].length - 1 && map[ty][tx + 1] === tileType) neighbors |= 2; // E
  if (ty < map.length - 1 && map[ty + 1][tx] === tileType) neighbors |= 4; // S
  if (tx > 0 && map[ty][tx - 1] === tileType) neighbors |= 8; // W
  
  return neighbors;
}

export function drawTile(ctx, tile, x, y, map = null) {
  const config = TILE_TYPES[tile];
  if (!config) return;

  const size = CONFIG.tileSize;
  let drawn = false;

  if (tile === 1 && map) {
    // Wall with autotile (4-bit bitmask, zero-padded)
    const neighbors = calculateNeighbors(map, x, y, 1);
    const frameName = `wall_${neighbors.toString().padStart(2, '0')}`;
    drawn = spriteLoader.drawAt(ctx, frameName, x, y, 1);
  } else if (tile === 0) {
    // Floor - alternate grass_a and grass_b deterministically per tile
    const tx = Math.floor(x / CONFIG.tileSize);
    const ty = Math.floor(y / CONFIG.tileSize);
    const grassVariant = ((tx + ty) % 2 === 0) ? "grass_a" : "grass_b";
    drawn = spriteLoader.drawAt(ctx, grassVariant, x, y, 1);
  } else if (tile === 2) {
    // Crate
    drawn = spriteLoader.drawAt(ctx, "crate_beer", x, y, 1);
  } else if (tile === 3) {
    // Bush
    drawn = spriteLoader.drawAt(ctx, "bush", x, y, 1);
  }

  if (!drawn) {
    // Fallback to colored shapes
    ctx.fillStyle = config.color;
    
    if (tile === 1) {
      // Wall
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, size, size);
    } else if (tile === 2) {
      // Crate
      ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
      ctx.strokeStyle = "#6b5037";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    } else if (tile === 3) {
      // Bush (round)
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Floor
      ctx.fillRect(x, y, size, size);
    }
  }
}

const TEAM_EMOJI = {
  red: "🤖",
  bot: "🤖",
};

// Get the character sprite key based on direction, state, and time
function getCharSpriteKey(dir, state, hasFlag, time) {
  const dirMap = { down: "down", left: "left", right: "right", up: "up" };
  const direction = dirMap[dir] || "down";
  
  if (state === "tagged" || state === "respawn") {
    // Dizzy animation when tagged or respawning
    const frameIndex = Math.floor(time / FRAME_TIMING.dizzy) % 3;
    return `char_dizzy_${frameIndex}`;
  }
  
  if (hasFlag) {
    // Carrying flag animation
    const frameIndex = Math.floor(time / FRAME_TIMING.carry) % 2;
    return `char_carry_${frameIndex}`;
  }
  
  if (state === "running" || state === "moving") {
    // Running animation
    const frameIndex = (Math.floor(time / FRAME_TIMING.run) % 2) + 1;
    return `char_${direction}_run${frameIndex}`;
  }
  
  // Idle
  return `char_${direction}_idle`;
}

export function drawPlayer(ctx, player, time, isOwn = false) {
  const size = CONFIG.frameSize;
  const x = player.x * CONFIG.tileSize - size / 2;
  const y = player.y * CONFIG.tileSize - size + (size - CONFIG.pivotY);

  // Highlight own player
  if (isOwn) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
  }

  // Respawn effect
  if (player.state === "respawn") {
    const frameIndex = Math.floor(time / FRAME_TIMING.respawn) % 4;
    const drawn = spriteLoader.drawAt(ctx, `respawn_${frameIndex}`, x, y, 1);
    if (drawn) {
      ctx.globalAlpha = 1;
      return; // Show only respawn effect
    }
  }

  // Tagged/dizzy alpha
  if (player.state === "tagged") {
    ctx.globalAlpha = 0.7;
  }

  // Try to draw sprite from art pack
  const spriteKey = getCharSpriteKey(player.dir, player.state, player.hasFlag, time);
  const drawn = spriteLoader.drawAt(ctx, spriteKey, x, y, 1, player.team);

  if (!drawn && player.state !== "respawn") {
    // Log sprite miss for debugging (exclude respawn which shows effect instead)
    if (typeof window !== "undefined" && !window._spriteMissLogged) {
      console.warn(`Character sprite not drawn: key="${spriteKey}", team="${player.team}"`);
      window._spriteMissLogged = true;
    }
    // Fallback to emoji
    const emoji = TEAM_EMOJI[player.team] || "🤖";
    const color = TEAM_COLORS[player.team] || "#fff";
    
    ctx.font = `${size}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, x + size / 2, y + size / 2);
    
    // Team color indicator ring
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Flag carried indicator (bobbing 2px every 250ms)
  if (player.hasFlag) {
    const bobOffset = Math.floor(time / FRAME_TIMING.flag) % 2 ? 2 : 0;
    const flagDrawn = spriteLoader.drawAt(ctx, "flag_carried_indicator", x + size - 8, y - (8 - bobOffset), 1);
    if (!flagDrawn) {
      ctx.fillStyle = "#ffd700";
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText("🚩", x + size / 2, y - 8);
    }
  }

  // Name tag
  ctx.fillStyle = "#fff";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.fillText(player.name, x + size / 2, y + size + 12);

  ctx.globalAlpha = 1;
}

export function drawFlag(ctx, flag, team, time) {
  const size = CONFIG.tileSize;
  const x = flag.x * CONFIG.tileSize;
  const y = flag.y * CONFIG.tileSize;
  const color = TEAM_COLORS[team] || "#ffd700";

  if (flag.carrier) {
    // Flag is being carried, don't draw at base
    return;
  }

  // Animated flag (2 frames at 250ms)
  const frameIndex = Math.floor(time / FRAME_TIMING.flag) % 2;
  const frameName = `flag_${team}_${frameIndex}`;
  const drawn = spriteLoader.drawAt(ctx, frameName, x - size / 2, y - size / 2, 1);

  if (!drawn) {
    // Fallback emoji flag
    ctx.fillStyle = color;
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🚩", x, y);
  }
}

export function drawBase(ctx, base, team) {
  const size = 64; // 64x64 base (2x2 tiles)
  const x = (base.x - 1) * CONFIG.tileSize;
  const y = (base.y - 1) * CONFIG.tileSize;
  const color = TEAM_COLORS[team] || "#555";

  // Try to draw base sprite (64x64 in atlas)
  const frameName = `base_${team}`;
  const sprite = spriteLoader.getSprite(frameName);
  
  let drawn = false;
  if (sprite) {
    try {
      ctx.drawImage(
        sprite.image,
        sprite.x,
        sprite.y,
        sprite.w,
        sprite.h,
        x,
        y,
        size,
        size
      );
      drawn = true;
    } catch (err) {
      console.warn(`Failed to draw base sprite ${frameName}:`, err);
    }
  }

  if (!drawn) {
    // Fallback colored rectangle
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, size, size);
    
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(x, y, size, size);
    ctx.globalAlpha = 1;
  }
}
