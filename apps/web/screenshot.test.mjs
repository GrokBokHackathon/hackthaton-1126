// Headless browser test to capture a screenshot of the game with sprites loaded
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const GAME_URL = `${SERVER_URL}/game.html`;
const SCREENSHOT_PATH = "/opt/cursor/artifacts/game-sprites-screenshot.png";

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

    console.log(`Navigating to ${GAME_URL}...`);
    await page.goto(GAME_URL, { waitUntil: "networkidle", timeout: 10000 });

    // Wait for the game to initialize and sprites to load
    console.log("Waiting for sprites to load...");
    await page.waitForTimeout(2000);

    // Check if sprites loaded successfully
    const spritesLoaded = await page.evaluate(() => {
      return window.spritesLoaded || false;
    });

    if (spritesLoaded) {
      console.log("✓ Sprites loaded successfully");
    } else {
      console.warn("⚠ Could not verify sprite loading, continuing anyway...");
    }

    // Wait for a game state with players
    await page.waitForTimeout(3000);

    // Ensure artifacts directory exists
    await mkdir("/opt/cursor/artifacts", { recursive: true });

    console.log(`Taking screenshot to ${SCREENSHOT_PATH}...`);
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });

    console.log("✓ Screenshot saved successfully");

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
