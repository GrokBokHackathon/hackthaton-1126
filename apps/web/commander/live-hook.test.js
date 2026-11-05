import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { boundsFromMap, createCameraState, worldToScreen } from "./camera.js";
import { createCommandSession } from "../command-panel.js";
import {
  commandTargetFromScreen,
  describeFog,
  drawableFlags,
  fogLabel,
  forwardCommand,
  orderSelectionForUnit,
  panelPatchFromCommandMessage,
  presentationFromUnits,
  unitsFromState,
} from "./live-hook.js";

const BOUNDS = boundsFromMap({ width: 64, height: 40 });

test("missing fog is explicit and not described as secure", () => {
  const described = describeFog({ players: [], score: { red: 0, bot: 0 } });
  assert.equal(described.availability, "missing-data");
  assert.equal(described.secure, false);
  assert.equal(described.applied, false);
  assert.match(fogLabel(described), /not masked/);
});

test("a well formed mask is not drawn and does not drop players", () => {
  const players = [{ id: "hidden", team: "bot", x: 9, y: 9 }];
  const state = {
    players,
    fog: { width: 1, height: 1, visible: [0], explored: [0] },
  };
  const described = describeFog(state);
  assert.equal(described.availability, "data-present");
  assert.equal(described.secure, false);
  assert.equal(unitsFromState(state).units, players);
  assert.equal(unitsFromState(state).units[0].id, "hidden");
});

test("presentation is copied only from properties the unit already has", () => {
  const units = [{ id: "a", team: "red", x: 1, y: 1, state: "idle" }];
  assert.deepEqual(presentationFromUnits(units), {});
  units[0].order = "scout";
  assert.deepEqual(presentationFromUnits(units), { a: { order: "scout" } });
});

test("hidden and null flags are not drawable", () => {
  assert.deepEqual(drawableFlags(null), []);
  assert.deepEqual(drawableFlags(undefined), []);
  assert.deepEqual(drawableFlags({ red: null, bot: { hidden: true } }), []);
  assert.deepEqual(drawableFlags({ red: { hidden: true }, bot: { x: 1 } }), []);
  const visible = drawableFlags({
    red: { x: 2, y: 2, carrier: null, hidden: false },
    bot: { hidden: true },
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].team, "red");
  assert.equal(visible[0].flag.x, 2);
});

test("command_view is a top-level patch and ack uses view", () => {
  const view = panelPatchFromCommandMessage({
    type: "command_view",
    nextSeq: 1,
    units: [{ id: "auto-red-0", name: "Red Runner", selectable: true }],
    budget: { current: 6, cap: 10 },
    orderCount: { used: 0, max: 15 },
    capabilities: { orders: [{ id: "beer", cost: 8, enabled: true }] },
  });
  assert.equal(view.type, undefined);
  assert.equal(view.commandResult, undefined);
  assert.equal(view.budget.current, 6);
  assert.equal(view.capabilities.orders[0].cost, 8);
  const ack = panelPatchFromCommandMessage({
    type: "command_ack",
    seq: 1,
    view: {
      nextSeq: 2,
      budget: { current: 5, cap: 10 },
      commandResult: { type: "command_ack", seq: 1 },
    },
  });
  assert.equal(ack.commandResult.type, "command_ack");
  assert.equal(ack.nextSeq, 2);
  assert.equal(ack.type, undefined);
  const rejected = panelPatchFromCommandMessage({
    type: "command_rejected",
    seq: 2,
    reason: "not_enough_cp",
    view: { commandResult: { type: "command_rejected", seq: 2, reason: "not_enough_cp" } },
  });
  assert.equal(rejected.commandResult.reason, "not_enough_cp");
});

test("map clicks become integer tiles and the command payload is not wrapped", () => {
  const camera = createCameraState({ viewportWidth: 1280, viewportHeight: 720, bounds: BOUNDS });
  const screen = worldToScreen(camera, BOUNDS, 12.9 * 32, 8.2 * 32);
  const target = commandTargetFromScreen(camera, BOUNDS, screen.x, screen.y);
  assert.deepEqual(target, { x: 12, y: 8 });
  assert.equal(Number.isInteger(target.x) && Number.isInteger(target.y), true);
  const sent = [];
  const result = forwardCommand({
    type: "command",
    seq: 1,
    order: "rally",
    unitIds: ["auto-red-0"],
    target,
  }, (payload) => sent.push(payload));
  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], JSON.parse(result.wire));
  assert.equal(result.wire.includes('"type":"command"'), true);
  assert.equal((result.wire.match(/"type"/g) || []).length, 1);
  assert.equal(forwardCommand({ seq: 1, order: "rally" }, () => {}).sent, false);
});

test("canvas order selection keeps only the latest selectable command roster", () => {
  const roster = [{ id: "auto-red-0", selectable: true }, { id: "auto-red-1", selectable: false }];
  assert.deepEqual(orderSelectionForUnit("auto-red-0", roster), { unitIds: ["auto-red-0"] });
  assert.equal(orderSelectionForUnit("auto-red-1", roster), null);
  assert.equal(orderSelectionForUnit("human-self", roster), null);
  assert.equal(orderSelectionForUnit("auto-bot-0", roster), null);
  assert.equal(orderSelectionForUnit("auto-red-0", null), null);
  const sent = [];
  const session = createCommandSession({
    onCommand(payload) { sent.push(payload); return true; },
  });
  session.update({
    nextSeq: 1,
    units: roster,
    capabilities: { orders: [{ id: "rally", enabled: true, cost: 1 }] },
  });
  assert.equal(orderSelectionForUnit("human-self", roster), null);
  session.setSelection(orderSelectionForUnit("auto-red-0", roster));
  session.chooseOrder("rally");
  assert.equal(session.setTarget({ x: 8, y: 3 }).ok, true);
  assert.deepEqual(sent[0].unitIds, ["auto-red-0"]);
  assert.deepEqual(sent[0].target, { x: 8, y: 3 });
});

test("a closed socket is a failed send and does not look like an ack", () => {
  const result = forwardCommand({
    type: "command",
    seq: 1,
    order: "rally",
    unitIds: ["auto-red-0"],
    target: { x: 8, y: 3 },
  }, () => false);
  assert.equal(result.sent, false);
  assert.equal(result.reason, "not-open");
  assert.equal(result.wire, undefined);
});

test("the live client mounts the panel, draws fog, and does not send movement", () => {
  const game = fs.readFileSync(new URL("../game.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../game.html", import.meta.url), "utf8");
  const docker = fs.readFileSync(new URL("../../server/Dockerfile", import.meta.url), "utf8");
  assert.match(game, /from "\.\/command-panel\.js"/);
  assert.match(game, /panelPatchFromCommandMessage/);
  assert.match(game, /command_view/);
  assert.match(game, /cancelPendingTransport/);
  assert.match(game, /orderSelectionForUnit/);
  assert.match(game, /removeEventListener\("resize"/);
  assert.match(game, /removeEventListener\("orientationchange"/);
  assert.match(html, /command-panel\.css/);
  assert.match(docker, /COPY apps\/web\/command-panel\.css/);
  assert.equal(game.includes("joystick"), false);
  assert.equal(game.includes('type: "input"'), false);
  assert.equal(html.includes("joystick"), false);
});
