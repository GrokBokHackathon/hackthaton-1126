import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as panel from "./command-panel.js";

const {
  COMMAND_FLOW_STEPS,
  COMMAND_ORDERS,
  COMMAND_PANEL_INTEGRATION,
  KNOWN_REJECTION_REASONS,
  LAYOUT_RULES,
  PLACEHOLDER_ASSETS,
  applyCommandPanelShell,
  buildCommandPayload,
  createCommandSession,
  layoutForViewport,
  mountCommandPanel,
  paintCommandPanel,
  rejectionText,
  viewModelToHtml,
} = panel;

test("public exports stay explicit", () => {
  assert.deepEqual(Object.keys(panel).sort(), [
    "COMMAND_FLOW_STEPS",
    "COMMAND_ORDERS",
    "COMMAND_PANEL_INTEGRATION",
    "COMMAND_PANEL_VERSION",
    "KNOWN_REJECTION_REASONS",
    "LAYOUT_RULES",
    "PLACEHOLDER_ASSETS",
    "SERVER_STATE_FIELDS",
    "applyCommandPanelShell",
    "buildCommandPayload",
    "createCommandSession",
    "layoutForViewport",
    "mountCommandPanel",
    "paintCommandPanel",
    "rejectionText",
    "viewModelToHtml",
  ]);
});

test("module is not wired to the game client or the server", () => {
  assert.equal(COMMAND_PANEL_INTEGRATION.wiredToServer, false);
  assert.equal(COMMAND_PANEL_INTEGRATION.wiredToGameClient, false);
  const source = readFileSync(new URL("./command-panel.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*game\.js["']/);
  assert.doesNotMatch(source, /from\s+["'][^"']*server\.js["']/);
  for (const order of COMMAND_ORDERS) {
    assert.equal(Object.hasOwn(order, "cost"), false);
  }
});

test("issue 9 orders plus beer are named without prices, and only beer skips the target", () => {
  assert.deepEqual(
    COMMAND_ORDERS.map((order) => order.id),
    ["rally", "scout", "defend", "escort", "attack", "tag", "beer"]
  );
  assert.deepEqual(
    COMMAND_ORDERS.filter((order) => !order.needsTarget).map((order) => order.id),
    ["beer"]
  );
  for (const order of COMMAND_ORDERS) {
    assert.match(order.label, /^[A-Z]/);
    assert.ok(order.hint.length > 0);
  }
  assert.deepEqual(COMMAND_FLOW_STEPS, ["select", "order", "target"]);
  assert.equal(PLACEHOLDER_ASSETS.status, "missing");
  assert.ok(PLACEHOLDER_ASSETS.files.includes("ui_orders_placeholder.png"));
  assert.ok(PLACEHOLDER_ASSETS.files.includes("ui_economy_placeholder.png"));
  assert.ok(PLACEHOLDER_ASSETS.files.includes("fx_command_placeholder.png"));
  assert.ok(PLACEHOLDER_ASSETS.frames.includes("btn_disabled"));
  assert.ok(PLACEHOLDER_ASSETS.frames.includes("emote_broke"));
  assert.ok(PLACEHOLDER_ASSETS.frames.includes("cursor_invalid"));
});

test("layout follows issue 9 phone and desktop docks", () => {
  const phone = layoutForViewport({ width: 390, height: 844 });
  assert.equal(phone.mode, "phone");
  assert.equal(phone.dock, "bottom");
  assert.equal(phone.arenaHeightRatio, 0.63);
  assert.equal(phone.panelMinPx, 300);
  assert.equal(phone.breakpointKnown, true);

  const desktop = layoutForViewport({ width: 1280, height: 800 });
  assert.equal(desktop.mode, "desktop");
  assert.equal(desktop.dock, "right");
  assert.equal(desktop.panelWidthPx, LAYOUT_RULES.desktopPanelWidthPx);

  const tall = layoutForViewport({ width: 1000, height: 1200 });
  assert.equal(tall.mode, "phone");

  const unknown = layoutForViewport({ width: 0, height: 800 });
  assert.equal(unknown.mode, "phone");
  assert.equal(unknown.breakpointKnown, false);
});

test("payload uses seq, order, unit ids or all, and an opaque target", () => {
  const units = buildCommandPayload({
    seq: 4,
    order: "rally",
    selection: { kind: "units", unitIds: ["b1", "b2"] },
    target: { ref: "bridge", x: 3, y: 9 },
  });
  assert.equal(units.ok, true);
  assert.deepEqual(Object.keys(units.payload), ["type", "seq", "order", "unitIds", "target"]);
  assert.equal(units.payload.type, "command");
  assert.deepEqual(units.payload.unitIds, ["b1", "b2"]);
  assert.equal(units.payload.target.ref, "bridge");
  assert.equal("all" in units.payload, false);
  assert.equal("cost" in units.payload, false);

  const all = buildCommandPayload({
    seq: 5,
    order: "scout",
    selection: { kind: "all", unitIds: [] },
    target: { token: "t" },
  });
  assert.equal(all.ok, true);
  assert.equal(all.payload.all, true);
  assert.equal("unitIds" in all.payload, false);

  assert.equal(buildCommandPayload({ seq: 0, order: "rally", selection: { kind: "all" }, target: {} }).error, "seq_unavailable");
  assert.equal(
    buildCommandPayload({ seq: 1, order: "rally", selection: { kind: "none" }, target: {} }).error,
    "selection_unavailable"
  );
  assert.equal(
    buildCommandPayload({
      seq: 1,
      order: "rally",
      selection: { kind: "all" },
      target: { valid: false },
    }).error,
    "target_unavailable"
  );
});

test("missing server snapshot keeps orders, budget, and cooldowns unknown", () => {
  const session = createCommandSession({ onCommand() {} });
  const view = session.getViewModel();
  assert.equal(view.rulesStatus, "unknown");
  assert.equal(view.budget.status, "unknown");
  assert.equal(view.budget.text, "unknown");
  assert.equal(view.orderCount.text, "unknown");
  assert.equal(view.wiredToServer, false);
  assert.equal(view.orderButtons.length, 7);
  assert.equal(view.selection.kind, "all");
  assert.equal(view.step, "order");
  for (const order of view.orderButtons) {
    assert.equal(order.enabled, false);
    assert.equal(order.costText, "unknown");
    assert.equal(order.reasonText, "Waiting for the server");
    assert.equal(order.shortReason, "Waiting for server");
    assert.equal(order.cooldown.status, "not_supplied");
  }
  const html = viewModelToHtml(view, { idPrefix: "t" });
  assert.match(html, /Waiting for the server/);
  assert.doesNotMatch(html, /data-step="select"|cp-steps/);
  assert.match(html, /data-order="rally"/);
  assert.match(html, /data-order="tag"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /data-art="placeholder"/);
  assert.match(html, /data-frame="cp_coin_16"/);
  assert.match(html, /data-frame="orders_counter"/);
  assert.doesNotMatch(html, /pip_full/);
  assert.equal(session.chooseOrder("rally").error, "order_not_enabled");
  session.selectAll();
  const blocked = session.chooseOrder("scout");
  assert.equal(blocked.error, "order_not_enabled");
  assert.equal(session.getViewModel().step, "order");
  assert.equal(session.setTarget({ x: 1, y: 1 }).error, "flow_incomplete");
});

test("partial budget or order count is not completed locally", () => {
  const session = createCommandSession();
  session.update({ budget: { current: 4 }, orderCount: { max: 15 } });
  const view = session.getViewModel();
  assert.equal(view.budget.status, "unknown");
  assert.equal(view.orderCount.status, "unknown");
  assert.equal(view.budget.text, "unknown");
  assert.equal(view.orderCount.text, "unknown");
});

test("selection, enabled order, and opaque target emit one command", () => {
  const sent = [];
  const session = createCommandSession({
    onCommand(payload) {
      sent.push(payload);
    },
  });
  session.update({
    units: [
      { id: "b1", name: "Bot 1" },
      { id: "b2", name: "<Bot 2>" },
      { id: "b3", name: "Bot 3", selectable: false },
    ],
    budget: { current: 4, cap: 10 },
    orderCount: { used: 2, max: 15 },
    capabilities: {
      orders: [
        { id: "rally", cost: 1, enabled: true },
        { id: "defend", enabled: true, cost: null },
        { id: "escort", cost: 3, enabled: false, disabledReason: "No friendly bot has the flag" },
        {
          id: "attack",
          cost: 3,
          enabled: true,
          cooldown: { remainingMs: 1000, durationMs: 2000 },
        },
        { id: "tag", enabled: false, disabledReason: "not_enough_cp" },
        { id: "scout", cost: 1, enabled: true, cooldown: { remainingMs: 0, durationMs: 2000 } },
      ],
    },
  });
  const view = session.getViewModel();
  assert.equal(view.budget.text, "4/10");
  assert.equal(view.orderCount.text, "2/15");
  assert.equal(view.orderButtons.find((order) => order.id === "rally").enabled, true);
  assert.equal(view.orderButtons.find((order) => order.id === "defend").costText, "unknown");
  assert.equal(view.orderButtons.find((order) => order.id === "defend").enabled, true);
  assert.equal(view.orderButtons.find((order) => order.id === "escort").enabled, false);
  assert.match(view.orderButtons.find((order) => order.id === "escort").reasonText, /flag/);
  assert.equal(view.orderButtons.find((order) => order.id === "attack").enabled, false);
  assert.equal(view.orderButtons.find((order) => order.id === "attack").cooldown.sweep, 0.5);
  assert.equal(view.orderButtons.find((order) => order.id === "tag").reasonText, KNOWN_REJECTION_REASONS.not_enough_cp);
  assert.equal(session.setSelection({ x: 4, y: 5 }).error, "coordinates");
  assert.equal(session.selectUnit("b3").error, "unit_not_selectable");
  assert.equal(session.selectUnit("b1").ok, true);
  assert.equal(session.chooseOrder("escort").error, "order_not_enabled");
  assert.equal(session.chooseOrder("rally").ok, true);
  assert.equal(session.getViewModel().step, "target");
  assert.equal(session.getViewModel().cursor, "target");
  const rejected = session.setTarget({ ref: "nope" }, { valid: false, reason: "Outside the map" });
  assert.equal(rejected.error, "target_rejected");
  assert.equal(sent.length, 0);
  assert.equal(session.getViewModel().cursor, "invalid");
  assert.equal(session.getViewModel().cursorFrame, "cursor_invalid");
  assert.match(session.getViewModel().notice.text, /Outside the map/);
  const target = { ref: "bridge-target", x: 12, y: 3 };
  const sentResult = session.setTarget(target);
  assert.equal(sentResult.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "command");
  assert.equal(sent[0].seq, 1);
  assert.equal(sent[0].order, "rally");
  assert.deepEqual(sent[0].unitIds, ["b1"]);
  assert.deepEqual(sent[0].target, target);
  assert.notEqual(sent[0].target, target);
  assert.equal(session.getViewModel().step, "pending");
  assert.equal(session.setTarget({ ref: "again" }).error, "pending");
  assert.equal(sent.length, 1);
  assert.equal(session.chooseOrder("scout").error, "pending");

  const html = viewModelToHtml(session.getViewModel(), { idPrefix: "t" });
  assert.match(html, /&lt;Bot 2&gt;/);
  assert.match(html, /data-frame="pip_full"/);
  assert.match(html, /data-frame="pip_empty"/);
  assert.match(html, /--cp-sweep:0\.5/);
  assert.match(html, /data-disabled-frame="btn_disabled"/);
  assert.match(html, /Sending Rally/);
  assert.match(html, /data-step="pending"/);
});

test("all selection omits unitIds, and a map of capabilities is accepted", () => {
  const sent = [];
  const session = createCommandSession({ onCommand: (payload) => sent.push(payload) });
  session.update({
    capabilities: {
      orders: {
        rally: { enabled: true, cost: 1 },
      },
    },
  });
  assert.equal(session.setSelection({ unitIds: "all" }).ok, true);
  assert.equal(session.chooseOrder("rally").ok, true);
  assert.equal(session.setTarget({ id: "tile" }).ok, true);
  assert.equal(sent[0].all, true);
  assert.equal("unitIds" in sent[0], false);
  assert.equal(sent[0].order, "rally");
});

test("rejection shows emote_broke and ack clears the pending order", () => {
  const session = readySession();
  session.selectAll();
  session.chooseOrder("rally");
  session.setTarget({ id: "t" });
  session.update({
    commandResult: { type: "command_rejected", seq: 1, reason: "target_not_visible" },
  });
  let view = session.getViewModel();
  assert.equal(view.emote.active, true);
  assert.equal(view.emote.frame, "emote_broke");
  assert.equal(view.commandStatus.phase, "rejected");
  assert.equal(view.notice.channel, "assertive");
  assert.equal(view.notice.text, KNOWN_REJECTION_REASONS.target_not_visible);
  assert.equal(view.step, "target");
  assert.equal(view.cursor, "invalid");
  const html = viewModelToHtml(view, { idPrefix: "t" });
  assert.match(html, /Target is not visible/);

  session.setTarget({ id: "t2" });
  session.update({ commandResult: { type: "command_ack", seq: 2 } });
  view = session.getViewModel();
  assert.equal(view.step, "order");
  assert.equal(view.emote.active, false);
  assert.equal(view.commandStatus.phase, "acknowledged");
  assert.equal(view.orderId, null);
  assert.equal(view.selection.kind, "all");
});

test("non-target rejection returns to order selection", () => {
  const session = readySession();
  session.selectAll();
  session.chooseOrder("rally");
  session.setTarget({ id: "t" });
  session.update({
    commandResult: { type: "command_rejected", seq: 1, reason: "no_orders_left" },
  });
  const view = session.getViewModel();
  assert.equal(view.step, "order");
  assert.equal(view.orderId, null);
  assert.equal(view.notice.text, KNOWN_REJECTION_REASONS.no_orders_left);
  assert.equal(rejectionText("made_up_code"), "Unrecognized reason: made_up_code");
  assert.equal(rejectionText("already_used"), KNOWN_REJECTION_REASONS.already_used);
});

test("a mismatched rejection does not clear a different pending command", () => {
  const session = readySession();
  session.selectAll();
  session.chooseOrder("rally");
  session.setTarget({ id: "t" });
  session.update({
    commandResult: { type: "command_rejected", seq: 99, reason: "cooldown" },
  });
  const view = session.getViewModel();
  assert.equal(view.step, "pending");
  assert.equal(view.pendingSeq, 1);
  assert.equal(view.emote.active, true);
  assert.equal(view.notice.text, KNOWN_REJECTION_REASONS.cooldown);
});

test("server sequence numbers replace the local correlation counter", () => {
  const sent = [];
  const session = createCommandSession({ onCommand: (payload) => sent.push(payload) });
  session.update({
    nextSeq: 8,
    capabilities: { orders: [{ id: "rally", enabled: true }] },
  });
  session.selectAll();
  session.chooseOrder("rally");
  assert.equal(session.setTarget({ id: "t" }).ok, true);
  assert.equal(sent[0].seq, 8);
  session.update({ commandResult: { type: "command_ack", seq: 8 } });
  session.chooseOrder("rally");
  assert.equal(session.setTarget({ id: "u" }).error, "seq_unavailable");
  assert.equal(sent.length, 1);
  session.update({ nextSeq: 9 });
  assert.equal(session.setTarget({ id: "u" }).ok, true);
  assert.equal(sent[1].seq, 9);
});

test("missing handler and a throwing handler do not enter pending", () => {
  const missing = createCommandSession();
  missing.update({ capabilities: { orders: [{ id: "rally", enabled: true }] } });
  missing.selectAll();
  missing.chooseOrder("rally");
  assert.equal(missing.setTarget({ id: "t" }).error, "handler_missing");
  assert.equal(missing.getViewModel().step, "target");

  const throwing = createCommandSession({
    onCommand() {
      throw new Error("transport");
    },
  });
  throwing.update({ capabilities: { orders: [{ id: "rally", enabled: true }] } });
  throwing.selectAll();
  throwing.chooseOrder("rally");
  assert.equal(throwing.setTarget({ id: "t" }).error, "handler_threw");
  assert.equal(throwing.getViewModel().step, "target");
  assert.match(throwing.getViewModel().notice.text, /not delivered/);
});

test("an extra server order is shown and an incomplete cooldown stays disabled", () => {
  const session = createCommandSession({ onCommand() {} });
  session.update({
    capabilities: {
      orders: [
        { id: "rally", enabled: true, cooldown: { remainingMs: 10 } },
        { id: "beer", label: "Beer", enabled: true },
      ],
    },
  });
  const buttons = session.getViewModel().orderButtons;
  assert.equal(buttons.find((order) => order.id === "rally").enabled, false);
  assert.equal(buttons.find((order) => order.id === "rally").cooldown.status, "unknown");
  const beer = buttons.find((order) => order.id === "beer");
  assert.equal(beer.label, "Beer");
  assert.equal(beer.enabled, true);
  assert.equal(beer.costText, "unknown");
  assert.equal(buttons.length, 7);
});

test("negative or oversized server numbers are shown and not clamped into a bar", () => {
  const session = createCommandSession();
  session.update({
    budget: { current: -1, cap: 10 },
    orderCount: { used: 1, max: 10000 },
    capabilities: { orders: [{ id: "rally", enabled: true, cost: -3 }] },
  });
  const view = session.getViewModel();
  assert.equal(view.budget.text, "-1/10");
  assert.equal(view.orderCount.text, "1/10000");
  assert.equal(view.orderButtons[0].costText, "-3");
  const html = viewModelToHtml(view, { idPrefix: "t" });
  assert.doesNotMatch(html, /pip_full/);
  assert.match(html, /-3 CP/);
});

test("painter marks unknown rules and a shell dock without owning the arena", () => {
  const session = createCommandSession();
  const parts = {
    root: { dataset: {}, setAttribute() {} },
    body: { innerHTML: "" },
    emote: { hidden: false, textContent: "stale", dataset: {}, setAttribute() {} },
    polite: { textContent: "" },
    assertive: { textContent: "" },
  };
  paintCommandPanel(parts, session.getViewModel(), { idPrefix: "t", layout: "desktop" });
  assert.equal(parts.root.dataset.layout, "desktop");
  assert.equal(parts.root.dataset.rules, "unknown");
  assert.equal(parts.root.dataset.wired, "false");
  assert.match(parts.body.innerHTML, /data-order="tag"/);
  assert.match(parts.polite.textContent, /Pick an order, then tap the map/);
  assert.equal(parts.assertive.textContent, "");
  assert.equal(parts.emote.hidden, true);

  const classes = new Set();
  const shell = {
    clientWidth: 1280,
    clientHeight: 800,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
    },
  };
  assert.equal(applyCommandPanelShell(shell, "auto"), "desktop");
  assert.equal(classes.has("cp-shell--desktop"), true);
  assert.equal(classes.has("cp-shell--phone"), false);
  assert.throws(() => applyCommandPanelShell(null, "phone"), TypeError);
});

test("destroy stops later commands", () => {
  let calls = 0;
  const session = createCommandSession({
    onCommand() {
      calls += 1;
    },
  });
  session.update({ capabilities: { orders: [{ id: "rally", enabled: true }] } });
  session.destroy();
  assert.equal(session.selectAll().error, "destroyed");
  assert.equal(session.setTarget({ id: "t" }).error, "destroyed");
  assert.equal(calls, 0);
  assert.equal(session.getViewModel().destroyed, true);
});

test("stylesheet is linked beside the module and does not import the game", () => {
  const css = readFileSync(new URL("./command-panel.css", import.meta.url), "utf8");
  assert.match(css, /\.cp-shell--phone > \.cp-arena-slot/);
  assert.match(css, /min-height:\s*300px/);
  assert.match(css, /\.cp-shell--desktop > \.cp-dock/);
  assert.match(css, /360px/);
  assert.match(css, /--cp-sweep/);
  assert.match(css, /emote_broke|cp-emote/);
  assert.match(css, /:focus-visible/);
});

test("a false send does not enter pending and the next view still applies", () => {
  let open = false;
  const session = createCommandSession({
    onCommand() {
      return open ? true : false;
    },
  });
  session.update({
    nextSeq: 1,
    units: [{ id: "auto-red-0", selectable: true }],
    capabilities: { orders: [{ id: "rally", enabled: true, cost: 1 }] },
  });
  session.setSelection({ unitIds: ["auto-red-0"] });
  session.chooseOrder("rally");
  const failed = session.setTarget({ x: 6, y: 2 });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, "transport_failed");
  assert.equal(failed.local, true);
  assert.notEqual(session.getViewModel().step, "pending");
  assert.equal(session.getViewModel().emote.active, false);
  session.update({
    nextSeq: 1,
    budget: { current: 6, cap: 10 },
    capabilities: {
      orders: [
        { id: "rally", enabled: true, cost: 1 },
        { id: "beer", enabled: true, cost: 8 },
      ],
    },
  });
  assert.notEqual(session.getViewModel().step, "pending");
  assert.equal(session.getViewModel().budget.text.includes("6"), true);
  open = true;
  assert.equal(session.setTarget({ x: 6, y: 2 }).ok, true);
  assert.equal(session.getViewModel().step, "pending");
});

test("closing the socket cancels a pending command without a server result", () => {
  const session = createCommandSession({ onCommand() { return true; } });
  session.update({
    nextSeq: 1,
    budget: { current: 6, cap: 10 },
    capabilities: { orders: [{ id: "rally", enabled: true, cost: 1 }] },
  });
  session.selectAll();
  session.chooseOrder("rally");
  assert.equal(session.setTarget({ x: 4, y: 2 }).ok, true);
  assert.equal(session.getViewModel().step, "pending");
  const cancelled = session.cancelPendingTransport();
  assert.equal(cancelled.local, true);
  assert.equal(cancelled.cancelled, true);
  const view = session.getViewModel();
  assert.notEqual(view.step, "pending");
  assert.equal(view.pendingSeq, null);
  assert.equal(view.emote.active, false);
  assert.equal(view.commandStatus.phase, "local_cancelled");
  assert.equal(view.commandStatus.reason, null);
  session.update({
    nextSeq: 2,
    budget: { current: 6, cap: 10 },
    orderCount: { used: 0, max: 15 },
    capabilities: { orders: [{ id: "rally", enabled: true, cost: 1 }] },
  });
  const next = session.getViewModel();
  assert.notEqual(next.step, "pending");
  assert.equal(next.budget.text.includes("6"), true);
  assert.equal(next.commandStatus.phase, "local_cancelled");
});

test("shell classes follow the 900px breakpoint in both directions", () => {
  const classes = new Set();
  const shell = {
    clientWidth: 390,
    clientHeight: 844,
    classList: {
      add(name) { classes.add(name); },
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
  assert.equal(applyCommandPanelShell(shell, "auto"), "phone");
  assert.equal(classes.has("cp-shell--phone"), true);
  assert.equal(classes.has("cp-shell--desktop"), false);
  shell.clientWidth = 1280;
  shell.clientHeight = 800;
  assert.equal(applyCommandPanelShell(shell, "auto"), "desktop");
  assert.equal(classes.has("cp-shell--desktop"), true);
  assert.equal(classes.has("cp-shell--phone"), false);
  shell.clientWidth = 390;
  shell.clientHeight = 844;
  assert.equal(applyCommandPanelShell(shell, "auto"), "phone");
  assert.equal(classes.has("cp-shell--phone"), true);
  assert.equal(classes.has("cp-shell--desktop"), false);
});

test("roster refresh drops a removed id and does not send or enter pending", () => {
  const sent = [];
  const session = rallySession(sent);
  session.setSelection({ unitIds: ["auto-red-0"] });
  session.chooseOrder("rally");
  session.update({ units: [{ id: "auto-red-2", selectable: true }] });
  const result = session.setTarget({ ref: "bridge" });
  const view = session.getViewModel();
  assert.equal(result.ok, false);
  assert.equal(result.error, "flow_incomplete");
  assert.equal(sent.length, 0);
  assert.notEqual(view.step, "pending");
  assert.equal(view.pendingSeq, null);
  assert.equal(view.selection.kind, "all");
  assert.deepEqual(view.selection.unitIds, []);
  assert.equal(view.orderId, null);
});

test("roster refresh treats selectable false as no longer armed", () => {
  const sent = [];
  const session = rallySession(sent);
  session.setSelection({ unitIds: ["auto-red-0"] });
  session.chooseOrder("rally");
  session.update({ units: [{ id: "auto-red-0", selectable: false }] });
  const result = session.setTarget({ ref: "bridge" });
  const view = session.getViewModel();
  assert.equal(result.ok, false);
  assert.equal(sent.length, 0);
  assert.notEqual(view.step, "pending");
  assert.equal(view.selection.kind, "all");
});

test("roster refresh keeps selectable ids and drops the stale ones", () => {
  const sent = [];
  const session = rallySession(sent, ["auto-red-0", "auto-red-2"]);
  session.setSelection({ unitIds: ["auto-red-0", "auto-red-2"] });
  session.chooseOrder("rally");
  session.update({
    units: [
      { id: "auto-red-0", selectable: false },
      { id: "auto-red-2", selectable: true },
    ],
  });
  const view = session.getViewModel();
  assert.equal(view.step, "target");
  assert.deepEqual(view.selection.unitIds, ["auto-red-2"]);
  const result = session.setTarget({ ref: "bridge" });
  assert.equal(result.ok, true);
  assert.deepEqual(sent[0].unitIds, ["auto-red-2"]);
  assert.equal(sent[0].unitIds.includes("auto-red-0"), false);
  assert.equal(session.getViewModel().step, "pending");
});

test("a roster refresh that still contains the armed id still sends it", () => {
  const sent = [];
  const session = rallySession(sent);
  session.setSelection({ unitIds: ["auto-red-0"] });
  session.chooseOrder("rally");
  session.update({
    units: [
      { id: "auto-red-2", selectable: true },
      { id: "auto-red-0", selectable: true },
    ],
  });
  const result = session.setTarget({ ref: "bridge" });
  assert.equal(result.ok, true);
  assert.deepEqual(sent[0].unitIds, ["auto-red-0"]);
  assert.equal(session.getViewModel().step, "pending");
});

test("an update that omits the roster does not drop the armed unit", () => {
  const sent = [];
  const session = rallySession(sent);
  session.setSelection({ unitIds: ["auto-red-0"] });
  session.chooseOrder("rally");
  session.update({
    budget: { current: 6, cap: 10 },
    capabilities: { orders: [{ id: "rally", enabled: true, cost: 1 }] },
  });
  assert.deepEqual(session.getViewModel().selection.unitIds, ["auto-red-0"]);
  session.update({ units: null });
  assert.deepEqual(session.getViewModel().selection.unitIds, ["auto-red-0"]);
  const result = session.setTarget({ ref: "bridge" });
  assert.equal(result.ok, true);
  assert.deepEqual(sent[0].unitIds, ["auto-red-0"]);
  assert.equal(session.getViewModel().step, "pending");
});

test("a roster refresh does not cancel an in-flight unit command", () => {
  const sent = [];
  const session = rallySession(sent);
  session.setSelection({ unitIds: ["auto-red-0"] });
  session.chooseOrder("rally");
  assert.equal(session.setTarget({ ref: "bridge" }).ok, true);
  session.update({ units: [{ id: "auto-red-2", selectable: true }] });
  const view = session.getViewModel();
  assert.equal(view.step, "pending");
  assert.equal(view.pendingSeq, sent[0].seq);
  assert.deepEqual(view.lastPayload.unitIds, ["auto-red-0"]);
  assert.equal(view.selection.kind, "all");
  assert.equal(sent.length, 1);
});

test("all stays all across a roster refresh and a pending command is not reopened", () => {
  const sent = [];
  const session = rallySession(sent);
  session.selectAll();
  session.chooseOrder("rally");
  session.update({ units: [{ id: "auto-red-2", selectable: true }] });
  assert.equal(session.getViewModel().selection.kind, "all");
  const result = session.setTarget({ ref: "bridge" });
  assert.equal(result.ok, true);
  assert.equal(sent[0].all, true);
  assert.equal("unitIds" in sent[0], false);
  assert.equal(session.getViewModel().step, "pending");
  session.update({ units: [{ id: "auto-red-9", selectable: true }] });
  const view = session.getViewModel();
  assert.equal(view.step, "pending");
  assert.equal(view.pendingSeq, sent[0].seq);
  assert.equal(view.lastPayload.all, true);
  assert.equal(sent.length, 1);
});

function liveSession(sent) {
  const session = createCommandSession({
    onCommand(payload) {
      sent.push(payload);
      return true;
    },
  });
  session.update({
    nextSeq: 1,
    team: { id: "red", label: "Red" },
    units: [
      { id: "auto-red-0", name: "Red Runner", selectable: true },
      { id: "auto-red-1", name: "Red Guard", selectable: true },
      { id: "auto-red-2", name: "Red Roamer", selectable: true },
    ],
    budget: { current: 6, cap: 10 },
    orderCount: { used: 0, max: 15 },
    capabilities: {
      orders: [
        { id: "rally", label: "rally", cost: 1, enabled: true },
        { id: "scout", label: "scout", cost: 1, enabled: true },
        { id: "defend", label: "defend", cost: 2, enabled: true },
        { id: "escort", label: "escort", cost: 3, enabled: true },
        { id: "attack", label: "attack", cost: 3, enabled: true },
        { id: "tag", label: "tag", cost: 4, enabled: true },
        { id: "beer", label: "beer", cost: 8, enabled: false, disabledReason: "not_enough_cp" },
      ],
    },
  });
  return session;
}

test("whole squad is preselected so an order is two taps: order, then map", () => {
  const sent = [];
  const session = liveSession(sent);
  const view = session.getViewModel();
  assert.equal(view.selection.kind, "all");
  assert.equal(view.selectionLabel, "Whole squad");
  assert.equal(view.step, "order");
  assert.equal(session.chooseOrder("rally").ok, true);
  assert.equal(session.getViewModel().step, "target");
  assert.equal(session.setTarget({ x: 5, y: 4 }).ok, true);
  assert.deepEqual(sent[0], { type: "command", seq: 1, order: "rally", all: true, target: { x: 5, y: 4 } });
  session.update({ commandResult: { type: "command_ack", seq: 1 } });
  const after = session.getViewModel();
  assert.equal(after.step, "order");
  assert.equal(after.commandStatus.text, "Rally sent to Whole squad.");
  assert.match(viewModelToHtml(after), /Rally sent to Whole squad/);
});

test("server lowercase labels show as plain catalog labels and units drop the team prefix", () => {
  const session = liveSession([]);
  const view = session.getViewModel();
  assert.deepEqual(
    view.orderButtons.map((order) => order.label),
    ["Rally", "Scout", "Defend", "Escort", "Attack", "Tag", "Beer"]
  );
  assert.deepEqual(view.units.list.map((unit) => unit.shortName), ["Runner", "Guard", "Roamer"]);
  const html = viewModelToHtml(view, { idPrefix: "t" });
  assert.match(html, />Runner</);
  assert.match(html, /title="Red Runner"/);
  assert.match(html, /Red squad/);
  assert.match(html, /data-team="red"/);
  assert.match(html, /1 CP/);
  assert.match(html, /Need 8 CP/);
  assert.match(html, /Not enough command points/);
});

test("tapping bots toggles them; an empty pick falls back to the whole squad", () => {
  const sent = [];
  const session = liveSession(sent);
  assert.equal(session.toggleUnit("auto-red-0").ok, true);
  assert.equal(session.toggleUnit("auto-red-1").ok, true);
  let view = session.getViewModel();
  assert.deepEqual(view.selection.unitIds, ["auto-red-0", "auto-red-1"]);
  assert.equal(view.selectionLabel, "Runner + Guard");
  assert.equal(view.allSelected, false);
  session.toggleUnit("auto-red-0");
  assert.deepEqual(session.getViewModel().selection.unitIds, ["auto-red-1"]);
  session.toggleUnit("auto-red-1");
  view = session.getViewModel();
  assert.equal(view.selection.kind, "all");
  assert.equal(view.allSelected, true);

  session.toggleUnit("auto-red-2");
  session.chooseOrder("defend");
  session.toggleUnit("auto-red-0");
  assert.equal(session.getViewModel().step, "target");
  session.setTarget({ x: 2, y: 3 });
  assert.deepEqual(sent[0].unitIds, ["auto-red-2", "auto-red-0"]);
});

test("tapping the armed order again or Cancel disarms it without sending", () => {
  const sent = [];
  const session = liveSession(sent);
  session.chooseOrder("scout");
  assert.equal(session.getViewModel().targetRule, "Any tile, even in the fog.");
  let html = viewModelToHtml(session.getViewModel());
  assert.match(html, /Tap the map: Scout → Whole squad/);
  assert.match(html, /data-action="cancel-order"/);
  assert.match(html, /data-order="scout"[^>]*aria-pressed="true"/);
  const again = session.chooseOrder("scout");
  assert.equal(again.cancelled, true);
  assert.equal(session.getViewModel().step, "order");
  session.chooseOrder("tag");
  assert.equal(session.getViewModel().targetRule, "Only a tile you can see right now.");
  session.chooseOrder("rally");
  assert.equal(session.getViewModel().orderId, "rally");
  assert.equal(session.getViewModel().targetRule, "Any tile you have explored.");
  assert.equal(session.cancelOrder().ok, true);
  assert.equal(session.cancelOrder().error, "nothing_armed");
  html = viewModelToHtml(session.getViewModel());
  assert.doesNotMatch(html, /data-action="cancel-order"/);
  assert.equal(sent.length, 0);
});

test("beer is sent on tap with no target and no unit list", () => {
  const sent = [];
  const session = liveSession(sent);
  session.toggleUnit("auto-red-0");
  assert.equal(session.chooseOrder("beer").error, "order_not_enabled");
  session.update({
    budget: { current: 9, cap: 10 },
    capabilities: { orders: [{ id: "beer", cost: 8, enabled: true }] },
  });
  const result = session.chooseOrder("beer");
  assert.equal(result.ok, true);
  assert.deepEqual(sent[0], { type: "command", seq: 1, order: "beer", all: true });
  assert.equal(session.getViewModel().step, "pending");
  session.update({ commandResult: { type: "command_ack", seq: 1 } });
  assert.equal(session.getViewModel().commandStatus.text, "Beer sent to Whole squad.");
  assert.equal(session.getViewModel().orderId, null);

  const offline = createCommandSession({ onCommand: () => false });
  offline.update({ capabilities: { orders: [{ id: "beer", enabled: true }] } });
  assert.equal(offline.chooseOrder("beer").error, "transport_failed");
  assert.equal(offline.getViewModel().orderId, null);
  assert.equal(offline.getViewModel().step, "order");
});

test("disabled buttons say why in a few words", () => {
  const session = createCommandSession();
  session.update({
    capabilities: {
      orders: [
        { id: "rally", cost: 1, enabled: true, cooldown: { remainingMs: 1500, durationMs: 2000 } },
        { id: "scout", cost: 1, enabled: false, disabledReason: "no_orders_left" },
        { id: "beer", cost: 8, enabled: false, disabledReason: "already_used" },
        { id: "tag", cost: 4, enabled: false, disabledReason: "not_enough_cp" },
      ],
    },
  });
  const byId = Object.fromEntries(session.getViewModel().orderButtons.map((order) => [order.id, order]));
  assert.equal(byId.rally.shortReason, "Ready in 1.5s");
  assert.equal(byId.scout.shortReason, "No orders left");
  assert.equal(byId.beer.shortReason, "Used this round");
  assert.equal(byId.tag.shortReason, "Need 4 CP");
  assert.equal(byId.defend.shortReason, "Waiting for server");
});

test("a fog target code from the map bridge reads as plain text", () => {
  const session = liveSession([]);
  session.chooseOrder("tag");
  session.setTarget({ x: 1, y: 1 }, { valid: false, reason: "target_not_visible" });
  const view = session.getViewModel();
  assert.equal(view.targetRejection.text, "Target is not visible");
  assert.equal(view.step, "target");
  assert.match(viewModelToHtml(view), /Tap another spot for Tag/);
});

test("mounted panel repaints only changed sections and survives a repaint mid-tap", () => {
  const doc = fakeDocument();
  const container = doc.createElement("div");
  const sent = [];
  const panel = mountCommandPanel(container, {
    document: doc,
    injectStylesheet: false,
    layout: "desktop",
    listenResize: false,
    onCommand: (payload) => {
      sent.push(payload);
      return true;
    },
  });
  const sections = container.children[0].children[1].children[0].children;
  assert.deepEqual(sections.map((section) => section.dataset.section), ["status", "who", "prompt", "orders"]);
  panel.update({
    units: [{ id: "auto-red-0", name: "Red Runner" }],
    budget: { current: 6, cap: 10 },
    capabilities: { orders: [{ id: "rally", cost: 1, enabled: true }] },
  });
  const who = sections[1];
  const before = who.writes;
  panel.update({ budget: { current: 7, cap: 10 } });
  assert.equal(who.writes, before, "the Who row is not rewritten when only CP changes");

  const root = panel.root;
  const down = { target: button("order:rally", "choose-order", { "data-order": "rally" }), button: 0 };
  root.dispatch("pointerdown", down);
  panel.update({ budget: { current: 8, cap: 10 } });
  const up = { target: button("order:rally", "choose-order", { "data-order": "rally" }) };
  root.dispatch("pointerup", up);
  assert.equal(panel.getViewModel().step, "target");
  root.dispatch("click", { target: up.target });
  assert.equal(panel.getViewModel().step, "target", "the trailing click does not toggle the order back off");
  panel.setTarget({ x: 3, y: 3 });
  assert.equal(sent.length, 1);
  panel.destroy();

  function button(key, action, extra = {}) {
    const attrs = { "data-key": key, "data-action": action, ...extra };
    const fake = {
      getAttribute: (name) => attrs[name] ?? null,
      closest: (selector) => (selector === "button[data-action]" ? fake : null),
    };
    return fake;
  }
});

function fakeDocument() {
  function element(tag) {
    const listeners = {};
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      dataset: {},
      className: "",
      hidden: false,
      textContent: "",
      writes: 0,
      _html: "",
      get innerHTML() {
        return this._html;
      },
      set innerHTML(value) {
        this._html = value;
        this.writes += 1;
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      setAttribute() {},
      addEventListener(type, fn) {
        (listeners[type] ||= []).push(fn);
      },
      dispatch(type, event) {
        for (const fn of listeners[type] || []) fn(event);
      },
      contains: () => true,
      remove() {},
    };
    return el;
  }
  return { createElement: element, activeElement: null };
}

function rallySession(sent, unitIds = ["auto-red-0"]) {
  const session = createCommandSession({
    onCommand(payload) {
      sent.push(payload);
      return true;
    },
  });
  session.update({
    units: unitIds.map((id) => ({ id, selectable: true })),
    capabilities: { orders: [{ id: "rally", enabled: true }] },
  });
  return session;
}

function readySession() {
  const session = createCommandSession({ onCommand() {} });
  session.update({
    capabilities: {
      orders: COMMAND_ORDERS.map((order) => ({ id: order.id, enabled: true })),
    },
  });
  return session;
}
