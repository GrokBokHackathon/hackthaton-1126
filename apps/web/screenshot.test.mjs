// Headless browser test to capture a screenshot of the game with sprites loaded
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const GAME_URL = `${SERVER_URL}/game.html`;
const SCREENSHOT_PATH = "/opt/cursor/artifacts/game-sprites-with-characters.png";

async function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn("node", ["apps/server/server.js"], {
      cwd: "/workspace",
      env: { ...process.env, PORT: SERVER_PORT.toString() },
    });

    server.stdout.on("data", (data) => {
      console.log(`[server] ${data.toString().trim()}`);
      if (data.toString().includes("listening")) {
        resolve(server);
      }
    });

    server.stderr.on("data", (data) => {
      console.error(`[server] ${data.toString().trim()}`);
    });

    server.on("error", reject);

    // Timeout after 10 seconds
    setTimeout(() => resolve(server), 10000);
  });
}

async function captureScreenshot() {
  console.log("Starting server...");
  const server = await startServer();

  try {
    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    
    // Capture all console messages for debugging
    const consoleWarnings = [];
    const consoleMessages = [];
    page.on("console", (msg) => {
      const text = msg.text();
      consoleMessages.push(text);
      if ((msg.type() === "warning" || msg.type() === "warn") && text.toLowerCase().includes("sprite")) {
        consoleWarnings.push(text);
      }
    });

    console.log(`Navigating to ${GAME_URL}...`);
    await page.goto(GAME_URL, { waitUntil: "networkidle", timeout: 10000 });

    // Wait for the game to initialize and sprites to load
    console.log("Waiting for sprites to load...");
    await page.waitForTimeout(2000);

    // Check if sprites loaded successfully
    const spritesLoaded = await page.evaluate(() => {
      return window.spritesLoaded || false;
    });

    if (!spritesLoaded) {
      throw new Error("Sprites failed to load - spriteLoader.load() returned false");
    }
    console.log("✓ Sprites loaded successfully");

    // Wait for game to have players
    console.log("Waiting for players to appear in game...");
    let attempts = 0;
    let gameState;
    while (attempts < 20) {
      gameState = await page.evaluate(() => {
        // Access the game instance through the module
        const game = window.game || (window.Game && new window.Game());
        if (!game) return null;
        
        return {
          hasPlayers: game.state && game.state.players && game.state.players.length > 0,
          playerCount: game.state?.players?.length || 0,
          hasMap: !!game.map,
          spritesLoaded: window.spritesLoaded,
        };
      });
      
      if (gameState && gameState.hasPlayers && gameState.playerCount >= 2) {
        console.log(`✓ Game has ${gameState.playerCount} players`);
        break;
      }
      
      await page.waitForTimeout(500);
      attempts++;
    }

    if (!gameState || !gameState.hasPlayers) {
      console.warn("⚠ Game may not have players yet, taking screenshot anyway...");
    }

    // Additional wait to ensure rendering is complete
    await page.waitForTimeout(2000);

    // Verify that the canvas has rendered content
    const renderCheck = await page.evaluate(() => {
      const canvas = document.getElementById("canvas");
      const ctx = canvas.getContext("2d");
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Count pixels with different characteristics
      let nonZeroPixels = 0;
      let coloredPixels = 0;
      
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const a = imageData.data[i + 3];
        
        if (a > 0) {
          nonZeroPixels++;
          if (r > 30 || g > 30 || b > 30) {
            coloredPixels++;
          }
        }
      }
      
      return {
        hasContent: nonZeroPixels > 5000,
        coloredPixels,
        canvasSize: `${canvas.width}x${canvas.height}`,
      };
    });

    if (!renderCheck.hasContent) {
      throw new Error("Canvas appears empty or not rendering properly");
    }
    
    console.log(`✓ Canvas rendered with ${renderCheck.coloredPixels} colored pixels (${renderCheck.canvasSize})`);

    // Ensure artifacts directory exists
    await mkdir("/opt/cursor/artifacts", { recursive: true });

    console.log(`Taking screenshot to ${SCREENSHOT_PATH}...`);
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });

    // Print all console messages for debugging
    if (consoleMessages.length > 0) {
      console.log("\nBrowser console output:");
      consoleMessages.forEach((msg) => console.log(`  ${msg}`));
    }

    // Check for sprite fallback warnings
    if (consoleWarnings.length > 0) {
      console.error("\n✗ Sprite fallback warnings detected:");
      consoleWarnings.forEach((warning) => console.error(`  ${warning}`));
      throw new Error("Characters or flags fell back to emoji/shape rendering");
    }

    console.log("✓ Screenshot saved successfully (no sprite fallback warnings)");

    await browser.close();
  } finally {
    console.log("Stopping server...");
    server.kill("SIGTERM");
    
    // Give server time to shut down
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

captureScreenshot().catch((error) => {
  console.error("Screenshot test failed:", error);
  process.exit(1);
});
