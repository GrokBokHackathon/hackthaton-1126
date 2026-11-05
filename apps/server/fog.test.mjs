import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";
import { WebSocket } from "ws";
import { CONFIG, Match } from "./game.js";
import { fogPixel } from "../web/fog.js";
import { assessOrderTarget, clientSnapshot, resetFog, seesTile, visibleMask } from "./fog.js";

const BLOCK = CONFIG.visionBlockers;

function openTiles(width, height) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : 0))
  );
}

test("fog overlay colors are unexplored, 60% explored, and clear when visible", () => {
  assert.deepEqual(fogPixel(0, 0), [0x1a, 0x10, 0x20, 255]);
  assert.deepEqual(fogPixel(1, 0), [0x1a, 0x10, 0x20, 153]);
  assert.deepEqual(fogPixel(1, 1), [0, 0, 0, 0]);
});

test("walls and bushes block sight; crates do not; radius is 7 tile-centers", () => {
  const tiles = openTiles(20, 20);
  tiles[5][8] = 1;
  tiles[8][5] = 3;
  tiles[8][12] = 2;
  assert.equal(seesTile(tiles, 5, 5, 12, 5, BLOCK), false);
  assert.equal(seesTile(tiles, 5, 5, 8, 5, BLOCK), true);
  assert.equal(seesTile(tiles, 5, 2, 5, 10, BLOCK), false);
  assert.equal(seesTile(tiles, 5, 2, 5, 8, BLOCK), true);
  assert.equal(seesTile(tiles, 8, 8, 14, 8, BLOCK), true);

  const mask = visibleMask(tiles, [{ x: 3.5, y: 3.5 }], CONFIG.visionRadius, BLOCK);
  assert.equal(mask[3 * 20 + 3], 1);
  const far = 3 + 8;
  assert.equal(mask[3 * 20 + far], 0);
  const edge = 3 + 7;
  assert.equal(mask[3 * 20 + edge], 1);
});

test("client snapshot hides enemies and unseen flags, and remembers explored tiles", () => {
  const match = new Match();
  const red = match.addPlayer("red", "Ada", "human");
  const bot = match.addPlayer("bot", "Bee", "bot");
  red.x = 3.5;
  red.y = 3.5;
  bot.x = 50.5;
  bot.y = 30.5;
  match.flags.bot.x = 50;
  match.flags.bot.y = 30;

  const first = clientSnapshot(match, "red", CONFIG.visionRadius, BLOCK);
  assert.equal(first.fog.encoding, "row-major-u8");
  assert.equal(first.fog.explored.length, match.map.width * match.map.height);
  assert.equal(first.fog.visible.length, first.fog.explored.length);
  assert.ok(first.players.some((player) => player.id === "red"));
  assert.equal(first.players.some((player) => player.id === "bot"), false);
  assert.equal(JSON.stringify(first).includes("Bee"), false);
  assert.equal(first.flags.bot.hidden, true);
  assert.equal(first.flags.bot.x, undefined);
  assert.equal(first.flags.red.hidden, false);
  assert.equal(first.players[0].x, red.x);

  const seen = first.fog.visible.findIndex((cell) => cell === 1);
  red.x = 40.5;
  red.y = 20.5;
  const later = clientSnapshot(match, "red", CONFIG.visionRadius, BLOCK);
  assert.equal(later.fog.explored[seen], 1);
  assert.equal(later.fog.visible[seen], 0);

  resetFog(match);
  const cleared = clientSnapshot(match, "red", CONFIG.visionRadius, BLOCK);
  assert.equal(cleared.fog.explored[seen], 0);
});

test("order targets: scout may be unexplored, tag must be visible now", () => {
  const fog = {
    width: 4,
    height: 1,
    explored: [1, 1, 0, 0],
    visible: [1, 0, 0, 0],
  };
  assert.equal(assessOrderTarget(fog, "attack", { x: 1, y: 0 }).ok, true);
  assert.equal(assessOrderTarget(fog, "attack", { x: 2, y: 0 }).reason, "target_not_explored");
  assert.equal(assessOrderTarget(fog, "scout", { x: 2, y: 0 }).ok, true);
  assert.equal(assessOrderTarget(fog, "tag", { x: 1, y: 0 }).reason, "target_not_visible");
  assert.equal(assessOrderTarget(fog, "tag", { x: 0, y: 0 }).ok, true);
  assert.deepEqual(fog.explored, [1, 1, 0, 0]);
});

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output)), 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const found = output.match(/listening on (\d+)/);
      if (found) {
        clearTimeout(timer);
        resolve(Number(found[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
  });
  return { child, ready };
}

function nextOf(incoming, type, timeoutMs = 3000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const index = incoming.findIndex((message) => message.type === type);
      if (index >= 0) {
        resolve(incoming.splice(index, 1)[0]);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`no ${type}`));
        return;
      }
      setTimeout(check, 10);
    };
    check();
  });
}

test("websocket state is the filtered snapshot for that team", async () => {
  const { child, ready } = startServer();
  try {
    const port = await ready;
    async function join(kind, name) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const incoming = [];
      ws.on("message", (data) => incoming.push(JSON.parse(String(data))));
      await once(ws, "open");
      await nextOf(incoming, "hello");
      ws.send(JSON.stringify({ type: "join", name, kind }));
      const welcome = await nextOf(incoming, "welcome");
      return { ws, incoming, welcome };
    }
    const red = await join("human", "Ada");
    const bot = await join("bot", "Bee");
    red.incoming.length = 0;
    bot.incoming.length = 0;
    const redState = await nextOf(red.incoming, "state");
    const botState = await nextOf(bot.incoming, "state");
    assert.ok(redState.players.every((player) => player.team === "red"));
    assert.ok(botState.players.every((player) => player.team === "bot"));
    assert.equal(JSON.stringify(redState.players).includes(bot.welcome.playerId), false);
    assert.equal(JSON.stringify(botState.players).includes(red.welcome.playerId), false);
    assert.equal(redState.fog.team, "red");
    assert.equal(redState.fog.encoding, "row-major-u8");
    assert.equal(redState.flags.bot.hidden, true);
    assert.equal(redState.flags.red.hidden, false);
    red.ws.close();
    bot.ws.close();
    await once(red.ws, "close");
    await once(bot.ws, "close");
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
});
