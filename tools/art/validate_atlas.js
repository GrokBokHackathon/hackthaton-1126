#!/usr/bin/env node
// Validate that atlas_v2.json references valid images and coordinates
// Usage: node validate_atlas.js [path-to-assets-dir] [atlas-filename]
// Default: validates apps/web/assets/atlas_v2.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PNG signature for validation
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPNGDimensions(filepath) {
  try {
    const fd = fs.openSync(filepath, "r");
    const buffer = Buffer.alloc(24);
    fs.readSync(fd, buffer, 0, 24, 0);
    fs.closeSync(fd);

    // Check PNG signature
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error("Not a valid PNG file");
    }

    // Read IHDR chunk (width and height at bytes 16-23)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    return { width, height };
  } catch (err) {
    throw new Error(`Failed to read PNG dimensions: ${err.message}`);
  }
}

function validateAtlas(assetsDir, atlasFilename = "atlas_v2.json") {
  console.log(`Validating ${atlasFilename} in: ${assetsDir}\n`);

  const atlasPath = path.join(assetsDir, atlasFilename);
  if (!fs.existsSync(atlasPath)) {
    console.error(`❌ ${atlasFilename} not found`);
    return false;
  }

  let atlas;
  try {
    atlas = JSON.parse(fs.readFileSync(atlasPath, "utf-8"));
  } catch (err) {
    console.error(`❌ Failed to parse ${atlasFilename}: ${err.message}`);
    return false;
  }

  let isValid = true;
  let totalFrames = 0;
  const checkedImages = new Map();

  for (const [groupName, group] of Object.entries(atlas)) {
    if (!group.meta || !group.frames) {
      console.warn(`⚠️  Group "${groupName}" missing meta or frames`);
      continue;
    }

    const imagePath = group.meta.image;
    if (!imagePath) {
      console.error(`❌ Group "${groupName}" has no image path`);
      isValid = false;
      continue;
    }

    console.log(`\n📦 Group: ${groupName}`);
    console.log(`   Image: ${imagePath}`);

    // Get all unique image paths (handle {team} template)
    const imagePaths = imagePath.includes("{team}")
      ? ["red", "bot", "mask"].map((t) => imagePath.replace("{team}", t))
      : [imagePath];

    // Check each image variant
    for (const imgPath of imagePaths) {
      const fullPath = path.join(assetsDir, imgPath);

      if (!fs.existsSync(fullPath)) {
        console.error(`   ❌ Image not found: ${imgPath}`);
        isValid = false;
        continue;
      }

      // Get dimensions (cache to avoid reading multiple times)
      if (!checkedImages.has(imgPath)) {
        try {
          const dims = readPNGDimensions(fullPath);
          checkedImages.set(imgPath, dims);
          console.log(`   ✅ ${imgPath} (${dims.width}×${dims.height})`);
        } catch (err) {
          console.error(`   ❌ ${imgPath}: ${err.message}`);
          isValid = false;
          continue;
        }
      }

      const { width, height } = checkedImages.get(imgPath);

      // Validate all frames for this image
      const frames = Object.entries(group.frames);
      let validFrames = 0;
      let invalidFrames = 0;

      for (const [frameName, frame] of frames) {
        totalFrames++;
        const { x, y, w, h } = frame;

        // Check if frame fits within image
        if (x < 0 || y < 0 || x + w > width || y + h > height) {
          console.error(
            `   ❌ Frame "${frameName}" out of bounds: ` +
              `rect(${x},${y},${w},${h}) exceeds image (${width}×${height})`
          );
          invalidFrames++;
          isValid = false;
        } else {
          validFrames++;
        }
      }

      if (invalidFrames === 0) {
        console.log(`   ✅ All ${validFrames} frames valid`);
      } else {
        console.log(
          `   ⚠️  ${validFrames} valid, ${invalidFrames} invalid frames`
        );
      }
    }

    // Check pivot
    if (group.meta.pivot) {
      const [px, py] = group.meta.pivot;
      console.log(`   📍 Pivot: (${px}, ${py})`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  if (isValid) {
    console.log(`✅ Atlas validation passed!`);
    console.log(`   ${totalFrames} frames across ${checkedImages.size} images`);
  } else {
    console.log(`❌ Atlas validation FAILED - see errors above`);
  }
  console.log(`${"=".repeat(60)}\n`);

  return isValid;
}

// Main
const assetsDir = process.argv[2] || path.join(__dirname, "../../apps/web/assets");
const atlasFilename = process.argv[3] || "atlas_v2.json";

if (!fs.existsSync(assetsDir)) {
  console.error(`Error: Assets directory not found: ${assetsDir}`);
  process.exit(1);
}

const success = validateAtlas(assetsDir, atlasFilename);
process.exit(success ? 0 : 1);
