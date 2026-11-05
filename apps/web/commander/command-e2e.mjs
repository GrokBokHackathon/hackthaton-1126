import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "../../server/node_modules/ws/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const port = 8098;
const debugPort = 9226;
const shotPath = "/opt/cursor/artifacts/command-order-e2e.png";

function waitForHttp(url) {
  return new Promise((resolve, reject) => {
    const tryOnce = (left) => {
      http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else if (left <= 0) reject(new Error(url));
        else setTimeout(() => tryOnce(left - 1), 200);
      }).on("error", () => {
        if (left <= 0) reject(new Error(url));
        else setTimeout(() => tryOnce(left - 1), 200);
      });
    };
    tryOnce(50);
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

const DRIVE = `(() => {
  const game = window.__flagRaid;
  const patch = game && game.lastCommandPatch;
  const panel = document.querySelector("#command-dock .cp-root");
  if (!game || !game.state || !game.state.fog || !patch || !patch.budget || !panel) {
    return { ready: false, frames: game && game.frameCounts, hasPanel: Boolean(panel) };
  }
  const beer = (patch.capabilities?.orders || []).find((order) => order.id === "beer");
  if (!beer || beer.cost !== 8 || patch.budget.current !== 6 || patch.commandResult) {
    return { ready: false, frames: game.frameCounts, patch };
  }
  const unit = document.querySelector('[data-unit-id="auto-red-0"]');
  if (!unit) return { ready: false, frames: game.frameCounts, missing: "unit" };
  unit.click();
  const rally = document.querySelector('[data-order="rally"]');
  if (!rally) return { ready: false, frames: game.frameCounts, missing: "rally" };
  rally.click();
  const bot = game.state.players.find((player) => player.id === "auto-red-0");
  let target = null;
  const fog = game.state.fog;
  for (let dy = -7; dy <= 7 && !target; dy++) {
    for (let dx = -7; dx <= 7 && !target; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) continue;
      const x = Math.floor(bot.x) + dx;
      const y = Math.floor(bot.y) + dy;
      if (x < 0 || y < 0 || x >= fog.width || y >= fog.height) continue;
      const index = y * fog.width + x;
      if (fog.visible[index] !== 1) continue;
      if (game.map.tiles[y][x] !== 0) continue;
      target = { x, y };
    }
  }
  if (!target) return { ready: false, reason: "no-visible-floor" };
  const screen = game.screenPoint((target.x + 0.5) * 32, (target.y + 0.5) * 32);
  const rect = game.canvas.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    pointerId: 1,
    clientX: rect.left + screen.x,
    clientY: rect.top + screen.y,
  };
  game._orderTarget = target;
  game.canvas.dispatchEvent(new PointerEvent("pointerdown", eventInit));
  game.canvas.dispatchEvent(new PointerEvent("pointerup", eventInit));
  const sent = game.sentCommands[0] || null;
  return {
    ready: true,
    issued: true,
    target,
    sent,
    integerTarget: Boolean(sent && Number.isInteger(sent.target?.x) && Number.isInteger(sent.target?.y)),
    step: game.commandPanel?.getViewModel?.().step,
    notice: game.commandPanel?.getViewModel?.().notice,
    frames: game.frameCounts,
    start: { x: bot.x, y: bot.y },
  };
})()`;

const OBSERVE = `(() => {
  const game = window.__flagRaid;
  const bot = game.state && game.state.players.find((player) => player.id === "auto-red-0");
  const goal = game._orderTarget;
  if (bot && goal) {
    const dist = Math.hypot(bot.x - (goal.x + 0.5), bot.y - (goal.y + 0.5));
    if (game._bestDist == null || dist < game._bestDist) game._bestDist = dist;
  }
  return {
    sent: game.sentCommands,
    result: game.lastCommandResult || null,
    bestDist: game._bestDist,
    bot: bot && { x: bot.x, y: bot.y },
    frames: game.frameCounts,
    status: document.getElementById("status")?.textContent,
    roundText: document.getElementById("round")?.textContent ?? null,
    panel: Boolean(document.querySelector("#command-dock .cp-root")),
    stylesheet: Boolean(document.querySelector('link[href="./command-panel.css"], link[href$="command-panel.css"]')),
  };
})()`;

try {
  await waitForHttp(`http://127.0.0.1:${port}/health`);
  const css = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/command-panel.css`, (res) => {
      res.resume();
      resolve({ status: res.statusCode, type: res.headers["content-type"] });
    }).on("error", reject);
  });
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

  let issued = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = await cdp.send("Runtime.evaluate", { expression: DRIVE, returnByValue: true });
    if (result.result.value && result.result.value.ready) {
      issued = result.result.value;
      break;
    }
    issued = result.result.value;
  }

  let observed = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = await cdp.send("Runtime.evaluate", { expression: OBSERVE, returnByValue: true });
    observed = result.result.value;
    const startDist = issued?.start && issued?.target
      ? Math.hypot(issued.start.x - (issued.target.x + 0.5), issued.start.y - (issued.target.y + 0.5))
      : null;
    const approached = startDist != null && observed?.bestDist != null && observed.bestDist < startDist - 0.5;
    if (observed?.result?.type === "command_ack" && approached) break;
  }

  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
  ws.close();

  const sent = observed?.sent?.[0];
  const startDist = issued?.start && issued?.target
    ? Math.hypot(issued.start.x - (issued.target.x + 0.5), issued.start.y - (issued.target.y + 0.5))
    : null;
  const moved = startDist != null && observed?.bestDist != null && observed.bestDist < startDist - 0.5;
  const report = {
    server: "local merged main, not the public host",
    css,
    issued,
    observed,
    moved,
    screenshot: shotPath,
    ok: Boolean(
      css.status === 200
      && String(css.type).includes("text/css")
      && issued?.integerTarget
      && sent?.type === "command"
      && sent?.order === "rally"
      && Array.isArray(sent?.unitIds)
      && sent.unitIds[0] === "auto-red-0"
      && Number.isInteger(sent.target.x)
      && Number.isInteger(sent.target.y)
      && Number.isInteger(sent.seq)
      && observed?.result?.type === "command_ack"
      && observed.result.seq === sent.seq
      && moved
      && observed.panel
      && observed.stylesheet
      && observed.roundText === ""
    ),
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  stop();
}
