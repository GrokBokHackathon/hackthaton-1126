// Asset configuration and rendering
// Easily swap between shapes, emoji, and sprite sheets

export const CONFIG = {
  tileSize: 32,
  frameSize: 32,
  pivotX: 16,
  pivotY: 30,
  scale: 2,
  animFrameMs: 150,
};

// Tile rendering
export const TILE_TYPES = {
  0: { name: "floor", color: "#3a3a3a" },
  1: { name: "wall", color: "#666" },
  2: { name: "crate", color: "#8b6f47" },
  3: { name: "bush", color: "#2d5016" },
};

// Autotile wall indices (4-bit: N=1, E=2, S=4, W=8)
const WALL_AUTOTILE = [
  // 16 variants based on neighbors
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

export function drawTile(ctx, tile, x, y, neighbors = 0) {
  const config = TILE_TYPES[tile];
  if (!config) return;

  const size = CONFIG.tileSize;
  ctx.fillStyle = config.color;

  if (tile === 1) {
    // Wall with simple autotile pattern
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

// Player rendering modes
const PLAYER_MODE = "emoji"; // "shape", "emoji", or "sprite"

const TEAM_COLORS = {
  red: "#e74c3c",
  bot: "#3498db",
};

const TEAM_EMOJI = {
  red: "🤖",
  bot: "🤖",
};

// Animation frames: rows = [down, left, right, up], cols = [idle, run1, run2]
const ANIM_FRAMES = {
  down: { idle: 0, run1: 1, run2: 2 },
  left: { idle: 3, run1: 4, run2: 5 },
  right: { idle: 6, run1: 7, run2: 8 },
  up: { idle: 9, run1: 10, run2: 11 },
};

// State to animation mapping
function getAnimFrame(player, time) {
  const dir = player.dir || "down";
  const frames = ANIM_FRAMES[dir];
  if (!frames) return 0;

  if (player.state === "idle" || player.state === "carrying") {
    return frames.idle;
  } else if (player.state === "running") {
    const cycleTime = CONFIG.animFrameMs * 2;
    const t = Math.floor(time / CONFIG.animFrameMs) % 2;
    return t === 0 ? frames.run1 : frames.run2;
  } else if (player.state === "tagged") {
    return frames.idle; // Could use dizzy frames
  } else if (player.state === "respawn") {
    return frames.idle; // Could use respawn pop frames
  }
  return frames.idle;
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

  // Tagged or respawn effects
  if (player.state === "tagged" || player.state === "respawn") {
    ctx.globalAlpha = 0.5;
  }

  if (PLAYER_MODE === "emoji") {
    const emoji = TEAM_EMOJI[player.team] || "🤖";
    const color = TEAM_COLORS[player.team] || "#fff";
    
    // Draw emoji or colored circle
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
  } else if (PLAYER_MODE === "shape") {
    const color = TEAM_COLORS[player.team] || "#fff";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 3, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator
    const dirMap = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 };
    const angle = dirMap[player.dir] || 0;
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(angle);
    ctx.fillStyle = "#fff";
    ctx.fillRect(size / 4, -2, size / 6, 4);
    ctx.restore();
  } else if (PLAYER_MODE === "sprite") {
    // Sprite mode: draw placeholder for now
    const color = TEAM_COLORS[player.team] || "#fff";
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    
    // Frame indicator (for animation)
    const frame = getAnimFrame(player, time);
    ctx.fillStyle = "#000";
    ctx.font = "10px monospace";
    ctx.fillText(`F${frame}`, x + 2, y + 10);
  }

  // Flag indicator
  if (player.hasFlag) {
    ctx.fillStyle = "#ffd700";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🚩", x + size / 2, y - 8);
  }

  // Name tag
  ctx.fillStyle = "#fff";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.fillText(player.name, x + size / 2, y + size + 12);

  ctx.globalAlpha = 1;
}

export function drawFlag(ctx, flag, team) {
  const size = CONFIG.tileSize;
  const x = flag.x * CONFIG.tileSize;
  const y = flag.y * CONFIG.tileSize;
  const color = TEAM_COLORS[team] || "#ffd700";

  if (flag.carrier) {
    // Flag is being carried, don't draw at base
    return;
  }

  // Draw flag at base
  ctx.fillStyle = color;
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🚩", x, y);

  // Pole
  ctx.fillStyle = color;
  ctx.fillRect(x - 2, y, 4, size);
}

export function drawBase(ctx, base, team) {
  const size = CONFIG.tileSize * 2; // 2x2 base
  const x = (base.x - 1) * CONFIG.tileSize;
  const y = (base.y - 1) * CONFIG.tileSize;
  const color = TEAM_COLORS[team] || "#555";

  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, size, size);
  
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(x, y, size, size);
  ctx.globalAlpha = 1;
}
