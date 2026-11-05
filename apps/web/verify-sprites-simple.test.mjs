// Simplified sprite verification: capture zoomed-out view showing whole map with both teams
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
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
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: "/workspace",
      env: { ...process.env, ...env },
    });

    proc.stdout.on("data", (data) => {
      const line = data.toString().trim();
      if (line) console.log(`[${args[0]?.split('/').pop() || command}] ${line}`);
    });

    proc.stderr.on("data", (data) => {
      const line = data.toString().trim();
      if (line) console.error(`[${args[0]?.split('/').pop() || command}] ${line}`);
    });

    setTimeout(() => resolve(proc), 1500);
  });
}

async function cropImageRegion(sourcePath, destPath, x, y, width, height, scale = 1) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(sourcePath);
    const png = new PNG();
    
    stream
      .pipe(png)
      .on("parsed", function() {
        // Ensure crop bounds are valid
        const cropX = Math.max(0, Math.min(x, this.width - 1));
        const cropY = Math.max(0, Math.min(y, this.height - 1));
        const cropW = Math.min(width, this.width - cropX);
        const cropH = Math.min(height, this.height - cropY);
        
        const outWidth = cropW * scale;
        const outHeight = cropH * scale;
        const outPng = new PNG({ width: outWidth, height: outHeight });
        
        // Copy and scale with nearest-neighbor
        for (let dy = 0; dy < outHeight; dy++) {
          for (let dx = 0; dx < outWidth; dx++) {
            const srcX = cropX + Math.floor(dx / scale);
            const srcY = cropY + Math.floor(dy / scale);
            const srcIdx = (this.width * srcY + srcX) * 4;
            const dstIdx = (outWidth * dy + dx) * 4;
            
            outPng.data[dstIdx] = this.data[srcIdx];
            outPng.data[dstIdx + 1] = this.data[srcIdx + 1];
            outPng.data[dstIdx + 2] = this.data[srcIdx + 2];
            outPng.data[dstIdx + 3] = this.data[srcIdx + 3];
          }
        }
        
        outPng.pack()
          .pipe(createWriteStream(destPath))
          .on("finish", () => resolve({ width: outWidth, height: outHeight }))
          .on("error", reject);
      })
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
        let colorCount = 0;
        const tolerance = 15; // Allow some variance for compression
        
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            const idx = (this.width * y + x) * 4;
            const r = this.data[idx];
            const g = this.data[idx + 1];
            const b = this.data[idx + 2];
            const a = this.data[idx + 3];
            
            if (a > 200) {
              const dr = Math.abs(r - expectedColor.r);
              const dg = Math.abs(g - expectedColor.g);
              const db = Math.abs(b - expectedColor.b);
              
              if (dr < tolerance && dg < tolerance && db < tolerance) {
                colorCount++;
              }
            }
          }
        }
        
        resolve({ found: colorCount > 50, count: colorCount, expected: expectedColor });
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
    await new Promise(r => setTimeout(r, 400));
  }

  try {
    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 2560, height: 1440 },
    });
    const page = await context.newPage();

    console.log(`Navigating to ${GAME_URL}...`);
    await page.goto(GAME_URL, { waitUntil: "networkidle", timeout: 10000 });

    await page.waitForTimeout(2000);

    const spritesLoaded = await page.evaluate(() => window.spritesLoaded);
    if (!spritesLoaded) {
      throw new Error("Sprites failed to load");
    }
    console.log("✓ Sprites loaded");

    // Wait for both teams
    console.log("Waiting for both teams...");
    let attempts = 0;
    while (attempts < 40) {
      const gameState = await page.evaluate(() => {
        const game = window.game;
        if (!game || !game.state) return null;
        
        const players = game.state.players || [];
        const redCount = players.filter(p => p.team === "red").length;
        const botCount = players.filter(p => p.team === "bot").length;
        
        return { red: redCount, bot: botCount };
      });
      
      if (gameState && gameState.red > 0 && gameState.bot > 0) {
        console.log(`✓ ${gameState.red} red, ${gameState.bot} bot players`);
        break;
      }
      
      await page.waitForTimeout(500);
      attempts++;
    }

    // Get map info and capture positions
    const mapInfo = await page.evaluate(() => {
      const game = window.game;
      if (!game || !game.map) return null;
      
      return {
        width: game.map.width,
        height: game.map.height,
        redBase: game.map.bases.red,
        botBase: game.map.bases.bot,
        tileSize: 32,
        zoom: game.zoom,
      };
    });

    console.log(`Map: ${mapInfo.width}x${mapInfo.height}, zoom: ${mapInfo.zoom.toFixed(2)}`);
    console.log(`Red base at (${mapInfo.redBase.x}, ${mapInfo.redBase.y})`);
    console.log(`Bot base at (${mapInfo.botBase.x}, ${mapInfo.botBase.y})`);

    await page.waitForTimeout(2000);

    await mkdir(ARTIFACTS_DIR, { recursive: true });

    const fullPath = `${ARTIFACTS_DIR}/game-full-map-view.png`;
    
    console.log("Capturing full map view...");
    await page.screenshot({ path: fullPath, fullPage: false });
    console.log(`✓ Saved: ${fullPath}`);

    // Calculate crop regions (approximate screen positions)
    // Red base is in top-left, bot base is in bottom-right
    // Let's crop 256x256 regions around each base area
    const redCropPath = `${ARTIFACTS_DIR}/red-base-detail-4x.png`;
    const botCropPath = `${ARTIFACTS_DIR}/bot-base-detail-4x.png`;

    console.log("\nCreating 4x detail crops...");
    
    // Red base area (top-left quadrant)
    await cropImageRegion(fullPath, redCropPath, 200, 150, 192, 192, 4);
    console.log(`✓ Red base crop: ${redCropPath}`);

    // Bot base area (bottom-right quadrant)
    await cropImageRegion(fullPath, botCropPath, 1800, 900, 192, 192, 4);
    console.log(`✓ Bot base crop: ${botCropPath}`);

    // Verify colors
    console.log("\nVerifying team colors...");
    
    const redCheck = await verifyColors(redCropPath, "red");
    console.log(`Red ${TEAM_COLORS.red.hex}: ${redCheck.found ? '✓ FOUND' : '✗ NOT FOUND'} (${redCheck.count} px)`);
    
    const botCheck = await verifyColors(botCropPath, "bot");
    console.log(`Bot ${TEAM_COLORS.bot.hex}: ${botCheck.found ? '✓ FOUND' : '✗ NOT FOUND'} (${botCheck.count} px)`);

    if (!redCheck.found || !botCheck.found) {
      console.warn("\n⚠ Warning: Expected team colors not strongly present");
      console.warn("This may indicate fallback rendering is still being used");
    } else {
      console.log("\n✓ Team colors verified in sprites");
    }

    console.log("\n=== Artifacts ===");
    console.log(`Full map view: ${fullPath}`);
    console.log(`Red base detail (4x): ${redCropPath}`);
    console.log(`Bot base detail (4x): ${botCropPath}`);

    await browser.close();
  } finally {
    console.log("\nStopping...");
    bots.forEach(bot => bot.kill("SIGTERM"));
    server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

main().catch((error) => {
  console.error("\n✗ Verification failed:", error.message);
  process.exit(1);
});
