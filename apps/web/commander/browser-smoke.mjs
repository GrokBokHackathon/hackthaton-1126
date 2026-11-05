import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "../../server/node_modules/ws/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const port = 8091;
const debugPort = 9223;
const shotPath = "/opt/cursor/artifacts/commander-live-sprites.png";

function waitForHttp(url) {
  return new Promise((resolve, reject) => {
    const tryOnce = (left) => {
      http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else if (left <= 0) reject(new Error(url));
        else setTimeout(() => tryOnce(left - 1), 150);
      }).on("error", () => {
        if (left <= 0) reject(new Error(url));
        else setTimeout(() => tryOnce(left - 1), 150);
      });
    };
    tryOnce(40);
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (!msg.id || !this.pending.has(msg.id)) return;
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    });
  }
  send(method, params = {}) {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

function near(rgba, expected) {
  return rgba && Math.abs(rgba[0] - expected[0]) <= 12
    && Math.abs(rgba[1] - expected[1]) <= 12
    && Math.abs(rgba[2] - expected[2]) <= 12;
}

const server = spawn(process.execPath, ["server.js"], {
  cwd: path.join(repo, "apps/server"),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
const chrome = spawn("google-chrome", [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  `--user-data-dir=/tmp/commander-chrome-${debugPort}`,
  `--remote-debugging-port=${debugPort}`,
  "--window-size=1400,1100",
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });

function stop() {
  server.kill("SIGTERM");
  chrome.kill("SIGTERM");
}

const PROOF = `(() => {
  const game = window.__flagRaid;
  if (!game || !game.state || !game.map || !game.artProof || !game.artProof.character) {
    return { ready: false, frames: game && game.frameCounts, link: game && game.linkState, proof: game && game.artProof };
  }
  if (!game.artProof.character.drawn || game.artProof.fallbackTiles !== 0) {
    return { ready: false, frames: game.frameCounts, proof: game.artProof };
  }
  const player = game.state.players.find((unit) => unit.id === game.playerId) || game.state.players[0];
  const ctx = game.canvas.getContext("2d");
  function pixelAt(worldX, worldY) {
    const screen = game.screenPoint(worldX, worldY);
    if (!screen) return null;
    const sx = Math.round(screen.x);
    const sy = Math.round(screen.y);
    if (sx < 0 || sy < 0 || sx >= game.canvas.width || sy >= game.canvas.height) return { sx, sy, rgba: null };
    const pixel = ctx.getImageData(sx, sy, 1, 1).data;
    return { sx, sy, rgba: [pixel[0], pixel[1], pixel[2], pixel[3]] };
  }
  game.camera = { ...game.camera, focusX: player.x * 32, focusY: player.y * 32 };
  game.render();
  const body = [];
  for (let dy = -28; dy <= 4; dy += 2) {
    for (let dx = -14; dx <= 14; dx += 2) {
      body.push(pixelAt(player.x * 32 + dx, player.y * 32 + dy));
    }
  }
  return {
    ready: true,
    frames: game.frameCounts,
    link: game.linkState,
    status: document.getElementById("status").textContent,
    fog: document.getElementById("fog").textContent,
    framesText: document.getElementById("frames").textContent,
    character: game.artProof.character,
    treeDrawn: game.artProof.treeDrawn,
    fallbackTiles: game.artProof.fallbackTiles,
    terrainKeys: Object.keys(game.artProof.terrainFrames),
    nearGrass: pixelAt((player.x + 1.5) * 32, player.y * 32),
    body: body.filter(Boolean).map((sample) => sample.rgba).filter(Boolean),
    zoom: game.camera.zoom,
    smoothing: game.camera.smoothing,
    resize: (() => {
      const narrow = game.syncCamera(390, 844) || game.camera.zoom;
      game.syncCamera(390, 844);
      const phone = game.camera.zoom;
      game.syncCamera(1920, 1080);
      const desktop = game.camera.zoom;
      game.syncCamera(game.canvas.width, game.canvas.height);
      return { phone, desktop, restored: game.camera.zoom };
    })(),
  };
})()`;

try {
  await waitForHttp(`http://127.0.0.1:${port}/health`);
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const targets = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
  const page = targets.find((target) => target.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/game.html` });

  let sample = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const result = await cdp.send("Runtime.evaluate", { expression: PROOF, returnByValue: true });
    sample = result.result.value;
    if (sample && sample.ready) break;
  }

  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));

  const report = {
    localUrl: `http://127.0.0.1:${port}/game.html`,
    publicBaseline: "not probed",
    screenshot: shotPath,
    sample,
  };
  const terrain = sample?.terrainKeys || [];
  const ok = Boolean(sample?.ready)
    && sample.character?.key === "char_down_idle"
    && sample.character?.drawn === true
    && sample.character?.pivot?.x === 16
    && sample.character?.pivot?.y === 30
    && sample.treeDrawn === 0
    && sample.fallbackTiles === 0
    && sample.frames?.welcome >= 1
    && sample.frames?.state >= 1
    && terrain.some((name) => name === "grass_a" || name === "grass_b")
    && terrain.some((name) => name.startsWith("wall_"))
    && terrain.includes("bush")
    && sample.resize?.phone < 2
    && sample.resize?.desktop === 2
    && /masks/.test(sample.fog || "")
    && sample.body.some((px) => near(px, [255, 204, 51]) || near(px, [196, 32, 50]));
  report.ok = ok;
  console.log(JSON.stringify(report, null, 2));
  ws.close();
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  stop();
}
