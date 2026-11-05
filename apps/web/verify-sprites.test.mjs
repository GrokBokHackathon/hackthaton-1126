// Enhanced screenshot test to verify sprite rendering with base crops and color validation
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const GAME_URL = `${SERVER_URL}/game.html`;
const ARTIFACTS_DIR = "/opt/cursor/artifacts";

// Expected team colors from the art pack
const TEAM_COLORS = {
  red: { hex: "#C42032", rgb: { r: 196, g: 32, b: 50 } },
  bot: { hex: "#A27BFF", rgb: { r: 162, g: 123, b: 255 } },
};

async function startProcess(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: "/workspace",
      env: { ...process.env, ...env },
    });

    proc.stdout.on("data", (data) => {
      console.log(`[${args[0] || command}] ${data.toString().trim()}`);
    });

    proc.stderr.on("data", (data) => {
      console.error(`[${args[0] || command}] ${data.toString().trim()}`);
    });

    proc.on("error", reject);

    // Wait a bit for startup
    setTimeout(() => resolve(proc), 2000);
  });
}

async function captureAndCrop(page, fullScreenshotPath, redCropPath, botCropPath) {
  console.log("Taking full screenshot...");
  await page.screenshot({ path: fullScreenshotPath, fullPage: false });

  // Get base locations from the game state
  const baseInfo = await page.evaluate(() => {
    const game = window.game;
    if (!game || !game.map) return null;
    
    const zoom = game.zoom;
    const tileSize = 32;
    const redBase = game.map.bases.red;
    const botBase = game.map.bases.bot;
    
    // Calculate screen positions (bases are 2x2 tiles, centered)
    // Base coordinates are the center tile, so we need to offset by 1 tile to get top-left
    return {
      zoom,
      tileSize,
      red: {
        tileX: redBase.x - 1,
        tileY: redBase.y - 1,
        centerX: redBase.x,
        centerY: redBase.y,
      },
      bot: {
        tileX: botBase.x - 1,
        tileY: botBase.y - 1,
        centerX: botBase.x,
        centerY: botBase.y,
      },
      mapWidth: game.map.width,
      mapHeight: game.map.height,
      canvasWidth: game.canvas.width,
      canvasHeight: game.canvas.height,
    };
  });

  if (!baseInfo) {
    console.warn("Could not get base info from game");
    return;
  }

  console.log(`Base info: zoom=${baseInfo.zoom}, red=(${baseInfo.red.centerX},${baseInfo.red.centerY}), bot=(${baseInfo.bot.centerX},${baseInfo.bot.centerY})`);

  // Create 4x crops centered on each base (128x128 area = 4 tiles at 4x zoom)
  const cropSize = 128;
  
  // Calculate screen positions for crops
  // We need to find where the bases are on screen
  // This is complex because of camera offset, so let's just take larger crops
  
  // For now, let's use the canvas screenshot API with specific coordinates
  // We'll read the full PNG and extract crops
  
  console.log(`Creating 4x nearest-neighbor crops of base areas...`);
  
  // Use page.evaluate to get pixel data from specific regions
  const redCropData = await page.evaluate((info) => {
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    
    // Find the red base on screen
    const game = window.game;
    const state = game.state;
    if (!state) return null;
    
    // Calculate where the red base appears on screen
    const ownPlayer = state.players.find(p => p.id === game.playerId);
    if (!ownPlayer) return null;
    
    const tileSize = 32;
    const zoom = game.zoom;
    
    // Camera offset calculation (simplified - center on own player)
    const camX = ownPlayer.x * tileSize * zoom;
    const camY = ownPlayer.y * tileSize * zoom;
    const offsetX = canvas.width / 2 - camX;
    const offsetY = canvas.height / 2 - camY;
    
    // Red base screen position
    const baseScreenX = info.red.tileX * tileSize * zoom + offsetX;
    const baseScreenY = info.red.tileY * tileSize * zoom + offsetY;
    
    // Crop a 96x96 area (3 tiles) around the base at current zoom
    const cropSizeWorld = 96;
    const cropX = Math.max(0, Math.floor(baseScreenX - 16));
    const cropY = Math.max(0, Math.floor(baseScreenY - 16));
    const cropW = Math.min(cropSizeWorld * zoom, canvas.width - cropX);
    const cropH = Math.min(cropSizeWorld * zoom, canvas.height - cropY);
    
    if (cropW <= 0 || cropH <= 0) return null;
    
    const imageData = ctx.getImageData(cropX, cropY, cropW, cropH);
    return {
      data: Array.from(imageData.data),
      width: imageData.width,
      height: imageData.height,
    };
  }, baseInfo);

  const botCropData = await page.evaluate((info) => {
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    
    const game = window.game;
    const state = game.state;
    if (!state) return null;
    
    const ownPlayer = state.players.find(p => p.id === game.playerId);
    if (!ownPlayer) return null;
    
    const tileSize = 32;
    const zoom = game.zoom;
    
    const camX = ownPlayer.x * tileSize * zoom;
    const camY = ownPlayer.y * tileSize * zoom;
    const offsetX = canvas.width / 2 - camX;
    const offsetY = canvas.height / 2 - camY;
    
    const baseScreenX = info.bot.tileX * tileSize * zoom + offsetX;
    const baseScreenY = info.bot.tileY * tileSize * zoom + offsetY;
    
    const cropSizeWorld = 96;
    const cropX = Math.max(0, Math.floor(baseScreenX - 16));
    const cropY = Math.max(0, Math.floor(baseScreenY - 16));
    const cropW = Math.min(cropSizeWorld * zoom, canvas.width - cropX);
    const cropH = Math.min(cropSizeWorld * zoom, canvas.height - cropY);
    
    if (cropW <= 0 || cropH <= 0) return null;
    
    const imageData = ctx.getImageData(cropX, cropY, cropW, cropH);
    return {
      data: Array.from(imageData.data),
      width: imageData.width,
      height: imageData.height,
    };
  }, baseInfo);

  if (redCropData) {
    // Scale up 4x with nearest-neighbor
    const scaled = scaleNearestNeighbor(redCropData, 4);
    await savePNG(scaled, redCropPath);
    console.log(`✓ Saved red base crop (${scaled.width}x${scaled.height})`);
  }

  if (botCropData) {
    const scaled = scaleNearestNeighbor(botCropData, 4);
    await savePNG(scaled, botCropPath);
    console.log(`✓ Saved bot base crop (${scaled.width}x${scaled.height})`);
  }
}

function scaleNearestNeighbor(imageData, scale) {
  const { data, width, height } = imageData;
  const newWidth = width * scale;
  const newHeight = height * scale;
  const newData = new Uint8Array(newWidth * newHeight * 4);

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * newWidth + x) * 4;

      newData[dstIdx] = data[srcIdx];
      newData[dstIdx + 1] = data[srcIdx + 1];
      newData[dstIdx + 2] = data[srcIdx + 2];
      newData[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return { data: newData, width: newWidth, height: newHeight };
}

async function savePNG(imageData, path) {
  const { data, width, height } = imageData;
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  
  return new Promise((resolve, reject) => {
    png.pack()
      .pipe(createWriteStream(path))
      .on("finish", resolve)
      .on("error", reject);
  });
}

async function verifyColors(imagePath, teamName) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(imagePath);
    const png = new PNG();
    
    stream
      .pipe(png)
      .on("parsed", function() {
        const expectedColor = TEAM_COLORS[teamName].rgb;
        let colorFound = false;
        let colorCount = 0;
        
        // Check if expected team color appears in the image
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            const idx = (this.width * y + x) * 4;
            const r = this.data[idx];
            const g = this.data[idx + 1];
            const b = this.data[idx + 2];
            const a = this.data[idx + 3];
            
            // Check if pixel matches expected color (within tolerance)
            if (a > 200) {
              const dr = Math.abs(r - expectedColor.r);
              const dg = Math.abs(g - expectedColor.g);
              const db = Math.abs(b - expectedColor.b);
              
              if (dr < 10 && dg < 10 && db < 10) {
                colorFound = true;
                colorCount++;
              }
            }
          }
        }
        
        resolve({ found: colorFound, count: colorCount, expected: expectedColor });
      })
      .on("error", reject);
  });
}

async function main() {
  console.log("Starting server...");
  const server = await startProcess("node", ["apps/server/server.js"], { PORT: SERVER_PORT.toString() });

  console.log("Starting bots...");
  const bots = [];
  for (let i = 0; i < 3; i++) {
    const bot = await startProcess("node", ["apps/bot/bot.js", `ws://localhost:${SERVER_PORT}/ws`, `Bot${i}`], {});
    bots.push(bot);
    await new Promise(r => setTimeout(r, 500)); // Stagger bot connections
  }

  try {
    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    console.log(`Navigating to ${GAME_URL}...`);
    await page.goto(GAME_URL, { waitUntil: "networkidle", timeout: 10000 });

    console.log("Waiting for sprites to load...");
    await page.waitForTimeout(2000);

    const spritesLoaded = await page.evaluate(() => window.spritesLoaded);
    if (!spritesLoaded) {
      throw new Error("Sprites failed to load");
    }
    console.log("✓ Sprites loaded successfully");

    // Wait for game to have both red and bot players
    console.log("Waiting for players from both teams...");
    let attempts = 0;
    while (attempts < 30) {
      const gameState = await page.evaluate(() => {
        const game = window.game;
        if (!game || !game.state) return null;
        
        const players = game.state.players || [];
        const redCount = players.filter(p => p.team === "red").length;
        const botCount = players.filter(p => p.team === "bot").length;
        
        return {
          total: players.length,
          red: redCount,
          bot: botCount,
          hasMap: !!game.map,
        };
      });
      
      if (gameState && gameState.red > 0 && gameState.bot > 0) {
        console.log(`✓ Game has ${gameState.red} red and ${gameState.bot} bot players`);
        break;
      }
      
      await page.waitForTimeout(500);
      attempts++;
    }

    await page.waitForTimeout(2000);

    // Ensure artifacts directory exists
    await mkdir(ARTIFACTS_DIR, { recursive: true });

    const fullPath = `${ARTIFACTS_DIR}/game-full-view.png`;
    const redCropPath = `${ARTIFACTS_DIR}/red-base-crop-4x.png`;
    const botCropPath = `${ARTIFACTS_DIR}/bot-base-crop-4x.png`;

    await captureAndCrop(page, fullPath, redCropPath, botCropPath);
    console.log(`✓ Full screenshot: ${fullPath}`);

    // Verify colors in crops
    console.log("\nVerifying team colors in sprites...");
    
    const redColorCheck = await verifyColors(redCropPath, "red");
    console.log(`Red team color ${TEAM_COLORS.red.hex}: ${redColorCheck.found ? '✓ FOUND' : '✗ NOT FOUND'} (${redColorCheck.count} pixels)`);
    
    const botColorCheck = await verifyColors(botCropPath, "bot");
    console.log(`Bot team color ${TEAM_COLORS.bot.hex}: ${botColorCheck.found ? '✓ FOUND' : '✗ NOT FOUND'} (${botColorCheck.count} pixels)`);

    if (!redColorCheck.found || !botColorCheck.found) {
      throw new Error("Expected team colors not found in sprites - may be using fallback rendering");
    }

    console.log("\n✓ All validations passed");
    console.log(`\nArtifacts:`);
    console.log(`- Full view: ${fullPath}`);
    console.log(`- Red base crop (4x): ${redCropPath}`);
    console.log(`- Bot base crop (4x): ${botCropPath}`);

    await browser.close();
  } finally {
    console.log("\nStopping processes...");
    bots.forEach(bot => bot.kill("SIGTERM"));
    server.kill("SIGTERM");
    
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
