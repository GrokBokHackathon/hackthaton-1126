import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";
import { spawnSquad } from "./autopilot.js";
import { applyCommand, commandView } from "./commands.js";
import { CONFIG, Match } from "./game.js";

function setup() {
  const match = new Match();
  spawnSquad(match, 3);
  match.phase = "playing";
  const runner = [...match.players.values()].find((player) => player.team === "red" && player.role === "runner");
  return { match, runner };
}

const open = { explored: null, visible: null };

function seen(match) {
  const cells = match.map.width * match.map.height;
  return { explored: Array(cells).fill(1), visible: Array(cells).fill(1) };
}

test("rally ack keeps the target object and spends 1 CP", () => {
  const { match, runner } = setup();
  const target = { x: 12, y: 8, ref: "bridge" };
  assert.equal(commandView(match, "red").capabilities.orders.find((order) => order.id === "rally").enabled, true);
  const result = applyCommand(match, "red", {
    type: "command",
    seq: 1,
    order: "rally",
    unitIds: [runner.id],
    target,
  }, seen(match));
  assert.equal(result.type, "command_ack");
  assert.equal(result.view.commandResult.type, "command_ack");
  assert.equal(result.view.commandResult.seq, 1);
  assert.equal(result.view.budget.current, 5);
  assert.equal(result.view.budget.cap, 10);
  assert.equal(result.view.nextSeq, 2);
  const rally = result.view.capabilities.orders.find((order) => order.id === "rally");
  assert.equal(rally.enabled, false);
  assert.equal(rally.disabledReason, "cooldown");
  assert.equal(typeof commandView(match, "red").capabilities.orders[0].enabled, "boolean");
  assert.deepEqual(runner.order.target, target);
  assert.equal(runner.order.all, false);
});

test("all:true is applied without rewriting it into unitIds", () => {
  const { match } = setup();
  const result = applyCommand(match, "red", {
    type: "command",
    seq: 4,
    order: "scout",
    all: true,
    target: { x: 6, y: 6 },
  }, seen(match));
  assert.equal(result.type, "command_ack");
  const ordered = [...match.players.values()].filter((player) => player.team === "red" && player.order.order === "scout");
  assert.equal(ordered.length, 3);
  assert.equal(ordered.every((player) => player.order.all === true), true);
  assert.equal(result.view.nextSeq, 5);
});

test("a fractional target is rejected and the order is unchanged", () => {
  const { match, runner } = setup();
  const result = applyCommand(match, "red", {
    type: "command",
    seq: 1,
    order: "scout",
    unitIds: [runner.id],
    target: { x: 12.5, y: 8 },
  }, seen(match));
  assert.equal(result.reason, "invalid_command");
  assert.equal(result.view.budget.current, 6);
  assert.equal(runner.order.source, "role-default");
  assert.equal(result.view.commandResult.reason, "invalid_command");
});

test("tag costs 4 and the next tag is not_enough_cp", () => {
  const { match, runner } = setup();
  const first = applyCommand(match, "red", {
    type: "command",
    seq: 1,
    order: "tag",
    unitIds: [runner.id],
    target: { x: 4, y: 4 },
  }, seen(match));
  assert.equal(first.view.budget.current, 2);
  match.commandMs = 2000;
  const second = applyCommand(match, "red", {
    type: "command",
    seq: 2,
    order: "tag",
    unitIds: [runner.id],
    target: { x: 5, y: 5 },
  }, seen(match));
  assert.equal(second.reason, "not_enough_cp");
  assert.equal(match.economy.red.cp, 2);
});

test("beer is a capability and a second use is already_used", () => {
  const { match } = setup();
  match.economy.red.cp = 10;
  const view = commandView(match, "red");
  const beer = view.capabilities.orders.find((order) => order.id === "beer");
  assert.equal(beer.cost, 8);
  assert.equal(beer.enabled, true);
  const first = applyCommand(match, "red", { type: "command", seq: 1, order: "beer" }, seen(match));
  assert.equal(first.type, "command_ack");
  match.commandMs = 2000;
  const second = applyCommand(match, "red", { type: "command", seq: 2, order: "beer" }, seen(match));
  assert.equal(second.reason, "already_used");
  assert.equal(second.view.capabilities.orders.find((order) => order.id === "beer").enabled, false);
});

test("an accepted order is walked by the tick and the target stays integer", () => {
  const { match, runner } = setup();
  applyCommand(match, "red", {
    type: "command",
    seq: 1,
    order: "rally",
    unitIds: [runner.id],
    target: { x: 20, y: 10 },
  }, seen(match));
  const start = { x: runner.x, y: runner.y };
  const maxStep = CONFIG.playerSpeed * 0.05 + 1e-6;
  match.tick(0.05);
  const step = Math.hypot(runner.x - start.x, runner.y - start.y);
  assert.ok(step > 0 && step <= maxStep, `step ${step}`);
  assert.deepEqual(runner.order.target, { x: 20, y: 10 });
});

test("command-panel.css is served as text/css", async () => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(output)), 5000);
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        const found = output.match(/listening on (\d+)/);
        if (found) {
          clearTimeout(timer);
          resolve(Number(found[1]));
        }
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}/command-panel.css`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/css/);
    const body = await response.text();
    assert.match(body, /cp-shell/);
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
});
