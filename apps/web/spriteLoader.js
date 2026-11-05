// Sprite loader for the Flag Raid art pack
// Loads the grouped atlas_v2.json format and provides sprite access
// Note: The original atlas.json uses a flat format read by atlas.js

export class SpriteLoader {
  constructor(basePath = "./assets/", atlasFile = "atlas_v2.json") {
    this.basePath = basePath;
    this.atlasFile = atlasFile;
    this.atlas = null;
    this.images = new Map();
    this.loaded = false;
    this.loadPromise = null;
  }

  /**
   * Load the atlas and all sprite sheets
   * @returns {Promise<boolean>} true if successful
   */
  async load() {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const response = await fetch(this.basePath + this.atlasFile);
        if (!response.ok) {
          console.warn(`Failed to load ${this.atlasFile}`);
          return false;
        }

        this.atlas = await response.json();

        // Collect unique image paths from all groups
        const imagePaths = new Set();
        for (const group of Object.values(this.atlas)) {
          if (group.meta && group.meta.image) {
            imagePaths.add(group.meta.image);
          }
        }

        // Load all images
        const imagePromises = Array.from(imagePaths).map((path) =>
          this.loadImage(path)
        );

        await Promise.all(imagePromises);
        this.loaded = true;
        console.log("Sprite atlas loaded successfully");
        return true;
      } catch (err) {
        console.warn("Failed to load sprite atlas:", err);
        return false;
      }
    })();

    return this.loadPromise;
  }

  async loadImage(filename) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(filename, img);
        resolve();
      };
      img.onerror = () => {
        console.warn(`Failed to load sprite sheet: ${filename}`);
        resolve();
      };
      img.src = this.basePath + filename;
    });
  }

  /**
   * Get sprite data for a given key
   * @param {string} key - Sprite key (e.g. "char_down_idle", "wall_00")
   * @param {string} team - For char sprites: "red", "bot", or "mask"
   * @returns {object|null} {image, x, y, w, h, pivot} or null if not found
   */
  getSprite(key, team = null) {
    if (!this.loaded || !this.atlas) return null;

    // Search through all groups for the frame
    for (const [groupName, group] of Object.entries(this.atlas)) {
      if (!group.frames || !group.meta) continue;

      const frame = group.frames[key];
      if (!frame) continue;

      // Resolve image path (handle {team} template for characters)
      let imagePath = group.meta.image;
      if (team && imagePath.includes("{team}")) {
        imagePath = imagePath.replace("{team}", team);
      }

      const image = this.images.get(imagePath);
      if (!image) {
        console.warn(`Image not loaded: ${imagePath}`);
        return null;
      }

      return {
        image,
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
        pivot: group.meta.pivot || [frame.w / 2, frame.h / 2],
      };
    }

    return null;
  }

  /**
   * Draw a sprite at a tile position
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key - Sprite key
   * @param {number} tileX - Tile X coordinate
   * @param {number} tileY - Tile Y coordinate
   * @param {number} tileSize - Tile size in pixels
   * @param {number} zoom - Integer zoom level (default 1)
   * @param {string} team - For char sprites: "red", "bot", or "mask"
   * @returns {boolean} true if drawn successfully
   */
  drawTile(ctx, key, tileX, tileY, tileSize = 32, zoom = 1, team = null) {
    const sprite = this.getSprite(key, team);
    if (!sprite) return false;

    const [pivotX, pivotY] = sprite.pivot;
    const screenX = Math.round(tileX * tileSize * zoom - pivotX * zoom);
    const screenY = Math.round(tileY * tileSize * zoom - pivotY * zoom);
    const drawW = sprite.w * zoom;
    const drawH = sprite.h * zoom;

    try {
      ctx.drawImage(
        sprite.image,
        sprite.x,
        sprite.y,
        sprite.w,
        sprite.h,
        screenX,
        screenY,
        drawW,
        drawH
      );
      return true;
    } catch (err) {
      console.warn(`Failed to draw sprite ${key}:`, err);
      return false;
    }
  }

  /**
   * Draw a sprite at exact pixel coordinates
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key - Sprite key
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @param {number} zoom - Integer zoom level (default 1)
   * @param {string} team - For char sprites: "red", "bot", or "mask"
   * @returns {boolean} true if drawn successfully
   */
  drawAt(ctx, key, x, y, zoom = 1, team = null) {
    const sprite = this.getSprite(key, team);
    if (!sprite) return false;

    const drawW = sprite.w * zoom;
    const drawH = sprite.h * zoom;

    try {
      ctx.drawImage(
        sprite.image,
        sprite.x,
        sprite.y,
        sprite.w,
        sprite.h,
        Math.round(x),
        Math.round(y),
        drawW,
        drawH
      );
      return true;
    } catch (err) {
      console.warn(`Failed to draw sprite ${key}:`, err);
      return false;
    }
  }

  /**
   * Check if a sprite exists
   * @param {string} key - Sprite key
   * @returns {boolean}
   */
  hasSprite(key) {
    if (!this.loaded || !this.atlas) return false;

    for (const group of Object.values(this.atlas)) {
      if (group.frames && group.frames[key]) return true;
    }
    return false;
  }

  /**
   * Get all sprite keys in a group
   * @param {string} groupName - Group name (e.g. "char", "tiles")
   * @returns {string[]} Array of sprite keys
   */
  getGroupKeys(groupName) {
    if (!this.loaded || !this.atlas || !this.atlas[groupName]) return [];
    return Object.keys(this.atlas[groupName].frames || {});
  }

  /**
   * Get all group names
   * @returns {string[]} Array of group names
   */
  getGroups() {
    if (!this.loaded || !this.atlas) return [];
    return Object.keys(this.atlas);
  }
}

// Global instance for convenience (uses atlas_v2.json)
export const spriteLoader = new SpriteLoader();

/**
 * Initialize sprite loading with custom configuration
 * @param {string} basePath - Base path for assets
 * @param {string} atlasFile - Atlas filename (default: atlas_v2.json)
 * @returns {Promise<boolean>}
 */
export async function initSprites(basePath = "./assets/", atlasFile = "atlas_v2.json") {
  const loader = new SpriteLoader(basePath, atlasFile);
  await loader.load();
  return loader.loaded;
}
