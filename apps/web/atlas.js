// Atlas-driven sprite rendering
// Loads atlas.json and sprite sheets, falls back to shapes on failure

export const ASSET_CONFIG = {
  // Asset paths - final art drops _placeholder suffix
  basePath: "./assets/",
  atlasFile: "atlas.json",
  sheets: {
    charRed: "char_red_sheet_placeholder.png",
    charBot: "char_bot_sheet_placeholder.png",
    charMask: "char_mask_sheet_placeholder.png",
    tiles: "tiles_placeholder.png",
    fxProps: "fx_props_placeholder.png",
    powerups: "powerups_placeholder.png",
  },
};

class Atlas {
  constructor() {
    this.loaded = false;
    this.atlas = null;
    this.images = {};
    this.loadPromise = this.load();
  }

  async load() {
    try {
      // Load atlas.json
      const response = await fetch(ASSET_CONFIG.basePath + ASSET_CONFIG.atlasFile);
      if (!response.ok) {
        console.warn("Atlas file not found, using fallback rendering");
        return false;
      }
      
      this.atlas = await response.json();
      
      // Load all sprite sheets
      const imagePromises = Object.entries(ASSET_CONFIG.sheets).map(
        ([key, filename]) =>
          this.loadImage(key, ASSET_CONFIG.basePath + filename)
      );
      
      await Promise.all(imagePromises);
      this.loaded = true;
      console.log("Atlas loaded successfully");
      return true;
    } catch (err) {
      console.warn("Failed to load atlas:", err);
      return false;
    }
  }

  async loadImage(key, url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images[key] = img;
        resolve();
      };
      img.onerror = () => {
        console.warn(`Failed to load image: ${url}`);
        resolve(); // Don't fail the whole atlas
      };
      img.src = url;
    });
  }

  getFrame(name) {
    if (!this.loaded || !this.atlas || !this.atlas.frames) {
      return null;
    }
    return this.atlas.frames[name];
  }

  drawFrame(ctx, frameName, x, y, scale = 1) {
    const frame = this.getFrame(frameName);
    if (!frame || !frame.source || !this.images[frame.source]) {
      return false;
    }

    const img = this.images[frame.source];
    const { x: sx, y: sy, w, h } = frame;

    try {
      if (scale === 1) {
        ctx.drawImage(img, sx, sy, w, h, x, y, w, h);
      } else {
        ctx.drawImage(img, sx, sy, w, h, x, y, w * scale, h * scale);
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  drawFrameScaled(ctx, frameName, x, y, width, height) {
    const frame = this.getFrame(frameName);
    if (!frame || !frame.source || !this.images[frame.source]) {
      return false;
    }

    const img = this.images[frame.source];
    const { x: sx, y: sy, w, h } = frame;

    try {
      ctx.drawImage(img, sx, sy, w, h, x, y, width, height);
      return true;
    } catch (err) {
      return false;
    }
  }

  hasFrame(name) {
    return this.loaded && this.atlas && this.atlas.frames && !!this.atlas.frames[name];
  }
}

// Global atlas instance
export const atlas = new Atlas();

// Animation frame mappings
export const ANIM_FRAMES = {
  // Character sheet layout: rows [down, left, right, up], cols [idle, run1, run2]
  char: {
    down: { idle: 0, run1: 1, run2: 2 },
    left: { idle: 3, run1: 4, run2: 5 },
    right: { idle: 6, run1: 7, run2: 8 },
    up: { idle: 9, run1: 10, run2: 11 },
    // Row 4: carrier x2, taunt x2
    carrying_down: 12,
    carrying_right: 13,
    taunt1: 14,
    taunt2: 15,
    // Row 5: dizzy x3 (tagged), spare
    dizzy1: 16,
    dizzy2: 17,
    dizzy3: 18,
  },
  // FX: respawn 4 frames, hit 3 frames
  fx: {
    respawn: [0, 1, 2, 3],
    hit: [0, 1, 2],
  },
};

// Frame timing (ms)
export const FRAME_TIMING = {
  run: 150,
  flag: 250,
  respawn: 80,
  hit: 60,
  dizzy: 150,
};

export function getCharFrame(dir, state, time) {
  const frames = ANIM_FRAMES.char;
  const dirFrames = frames[dir];
  
  if (!dirFrames) return 0;

  if (state === "idle") {
    return dirFrames.idle;
  } else if (state === "running") {
    const cycleTime = FRAME_TIMING.run * 2;
    const t = Math.floor(time / FRAME_TIMING.run) % 2;
    return t === 0 ? dirFrames.run1 : dirFrames.run2;
  } else if (state === "carrying") {
    // Use carrying frames if available, else use idle
    return frames.carrying_down || dirFrames.idle;
  } else if (state === "tagged") {
    // Dizzy animation
    const cycleTime = FRAME_TIMING.dizzy * 3;
    const t = Math.floor(time / FRAME_TIMING.dizzy) % 3;
    return frames.dizzy1 + t;
  } else if (state === "respawn") {
    return dirFrames.idle;
  }

  return dirFrames.idle;
}

export function getCharFrameName(team, frameIndex) {
  // Map frame index to atlas name
  // e.g. "char_red_0" for red idle down, "char_bot_1" for bot run1 down
  const prefix = team === "red" ? "char_red" : "char_bot";
  return `${prefix}_${frameIndex}`;
}
