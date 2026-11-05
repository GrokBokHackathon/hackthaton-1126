// Isolated command panel. Presentation only.
// The match server does not implement command messages yet.
// Costs, cooldowns, and legality are displayed from an injected snapshot.
// Missing snapshot values stay unknown and are not filled in here.

export const COMMAND_PANEL_VERSION = 1;

export const COMMAND_PANEL_INTEGRATION = Object.freeze({
  wiredToServer: false,
  wiredToGameClient: false,
  payloadType: "command",
  resultTypes: Object.freeze(["command_ack", "command_rejected"]),
});

/** Issue 9 order buttons. Frames only — no command-point costs. */
export const COMMAND_ORDERS = Object.freeze([
  Object.freeze({ id: "rally", label: "Rally", frame: "ord_rally" }),
  Object.freeze({ id: "scout", label: "Scout", frame: "ord_scout" }),
  Object.freeze({ id: "defend", label: "Defend", frame: "ord_defend" }),
  Object.freeze({ id: "escort", label: "Escort", frame: "ord_escort" }),
  Object.freeze({ id: "attack", label: "Attack", frame: "ord_attack" }),
  Object.freeze({ id: "tag", label: "Tag", frame: "ord_tag" }),
]);

export const COMMAND_FLOW_STEPS = Object.freeze(["select", "order", "target"]);

/** Reason codes written in issue 6. Unknown codes are shown as unrecognized. */
export const KNOWN_REJECTION_REASONS = Object.freeze({
  not_enough_cp: "Not enough command points",
  no_orders_left: "No orders left this round",
  cooldown: "Order is on cooldown",
  target_not_explored: "Target is not explored",
  target_not_visible: "Target is not visible",
  already_used: "That order was already used this round",
});

/**
 * Issue 9 layout. Phone docks the panel on the bottom (arena about 63% of
 * height, panel at least 300px). Desktop docks it on the right.
 * desktopMinWidthPx and desktopPanelWidthPx are presentation choices:
 * issue 9 does not give those pixel values.
 */
export const LAYOUT_RULES = Object.freeze({
  phoneArenaHeightRatio: 0.63,
  phonePanelMinPx: 300,
  desktopMinWidthPx: 900,
  desktopPanelWidthPx: 360,
  pipDisplayLimit: 16,
});

export const PLACEHOLDER_ASSETS = Object.freeze({
  status: "missing",
  note: "Issue 9 names these files. They are not in this repository. Frames render as labeled placeholders.",
  files: Object.freeze([
    "ui_orders_placeholder.png",
    "ui_economy_placeholder.png",
    "fx_command_placeholder.png",
  ]),
  mockups: Object.freeze(["ui_mock_portrait.png", "ui_mock_landscape.png"]),
  frames: Object.freeze([
    "ord_rally",
    "ord_scout",
    "ord_defend",
    "ord_escort",
    "ord_attack",
    "ord_tag",
    "btn_disabled",
    "pip_full",
    "pip_empty",
    "cp_coin_16",
    "orders_counter",
    "cursor_invalid",
    "emote_broke",
  ]),
});

export const SERVER_STATE_FIELDS = Object.freeze({
  units: "array of { id, name?, selectable? }. Omit when the roster is unknown. Empty array means a known empty roster.",
  budget: "{ current: number, cap: number }. Omit either number and the readout stays unknown. This panel does not compare cost with budget.",
  orderCount: "{ used: number, max: number }. Omit either number and the counter stays unknown.",
  capabilities: "{ orders: array or id-keyed object of { id, label?, frame?, cost?, enabled?, disabledReason?, cooldown? } }. enabled must be true to allow an order. cooldown is { remainingMs, durationMs } or omitted.",
  commandResult: "{ type: 'command_ack' | 'command_rejected', seq?: number, reason?: string }.",
  nextSeq: "positive integer. Passing it hands sequence numbers to the caller. Until then this panel assigns a local correlation seq.",
});

const LOCAL_REASON_TEXT = Object.freeze({
  unknown: "Waiting for the server",
  unavailable: "Waiting for the server",
});

let mountSerial = 0;

export function rejectionText(code) {
  if (code == null || code === "") return "Rejected";
  if (Object.prototype.hasOwnProperty.call(KNOWN_REJECTION_REASONS, code)) {
    return KNOWN_REJECTION_REASONS[code];
  }
  if (Object.prototype.hasOwnProperty.call(LOCAL_REASON_TEXT, code)) {
    return LOCAL_REASON_TEXT[code];
  }
  if (typeof code !== "string") return "Rejected";
  if (/\s/.test(code)) return code;
  return `Unrecognized reason: ${code}`;
}

export function layoutForViewport({ width, height } = {}) {
  const w = Number(width);
  const h = Number(height);
  const base = {
    arenaHeightRatio: LAYOUT_RULES.phoneArenaHeightRatio,
    panelMinPx: LAYOUT_RULES.phonePanelMinPx,
    panelWidthPx: null,
  };
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return {
      mode: "phone",
      dock: "bottom",
      breakpointKnown: false,
      ...base,
    };
  }
  const desktop = w >= LAYOUT_RULES.desktopMinWidthPx && w > h;
  if (desktop) {
    return {
      mode: "desktop",
      dock: "right",
      breakpointKnown: true,
      arenaHeightRatio: null,
      panelMinPx: null,
      panelWidthPx: LAYOUT_RULES.desktopPanelWidthPx,
    };
  }
  return {
    mode: "phone",
    dock: "bottom",
    breakpointKnown: true,
    ...base,
  };
}

export function buildCommandPayload({ seq, order, selection, target } = {}) {
  if (!Number.isInteger(seq) || seq < 1) {
    return { ok: false, error: "seq_unavailable" };
  }
  if (typeof order !== "string" || order.length === 0) {
    return { ok: false, error: "order_unavailable" };
  }
  const rejected = targetIsRejected(target, undefined);
  if (target == null || rejected.rejected) {
    return { ok: false, error: "target_unavailable" };
  }
  const payload = {
    type: "command",
    seq,
    order,
  };
  if (selection?.kind === "all") {
    payload.all = true;
  } else if (
    selection?.kind === "units" &&
    Array.isArray(selection.unitIds) &&
    selection.unitIds.length > 0
  ) {
    payload.unitIds = selection.unitIds.slice();
  } else {
    return { ok: false, error: "selection_unavailable" };
  }
  payload.target = cloneWire(target);
  return { ok: true, payload };
}

export function createCommandSession({ onCommand } = {}) {
  let destroyed = false;
  let seqMode = "local";
  let nextSeq = 1;
  let selection = { kind: "none", unitIds: [] };
  let step = "select";
  let orderId = null;
  let pendingSeq = null;
  let units = normalizeUnits(undefined);
  let budget = normalizePair(undefined, "current", "cap");
  let orderCount = normalizePair(undefined, "used", "max");
  let capabilities = normalizeCapabilities(undefined);
  let cursor = "default";
  let targetRejection = null;
  let emote = { active: false, frame: "emote_broke", text: "" };
  let commandStatus = {
    phase: "idle",
    seq: null,
    reason: null,
    text: "",
  };
  let notice = {
    channel: "polite",
    text: "Select a bot or All, then an order, then a target.",
  };
  let lastPayload = null;

  function dead() {
    return { ok: false, error: "destroyed" };
  }

  function viewOrder(entry) {
    return presentOrder(entry, capabilities);
  }

  function findOrder(id) {
    return getViewModel().orderButtons.find((order) => order.id === id) || null;
  }

  function getViewModel() {
    const catalog = COMMAND_ORDERS.map((entry) => {
      const capability =
        capabilities.status === "supplied"
          ? capabilities.list.find((item) => item.id === entry.id) || null
          : null;
      return {
        id: entry.id,
        label: capability?.label || entry.label,
        frame: capability?.frame || entry.frame,
        catalog: true,
      };
    });
    const seen = new Set(catalog.map((entry) => entry.id));
    const extras = [];
    if (capabilities.status === "supplied") {
      for (const capability of capabilities.list) {
        if (seen.has(capability.id)) continue;
        seen.add(capability.id);
        extras.push({
          id: capability.id,
          label: capability.label || capability.id,
          frame: capability.frame || "",
          catalog: false,
        });
      }
    }
    const orderButtons = catalog.concat(extras).map((entry) => viewOrder(entry));
    const unitList = units.list.map((unit) => ({
      ...unit,
      selected: selection.kind === "units" && selection.unitIds.includes(unit.id),
    }));
    return {
      version: COMMAND_PANEL_VERSION,
      destroyed,
      wiredToServer: false,
      art: PLACEHOLDER_ASSETS.status,
      step,
      selection: {
        kind: selection.kind,
        unitIds: selection.unitIds.slice(),
      },
      orderId,
      cursor,
      cursorFrame: cursor === "invalid" ? "cursor_invalid" : null,
      rulesStatus: capabilities.status === "supplied" ? "supplied" : "unknown",
      budget: displayPair(budget, "current", "cap"),
      orderCount: displayPair(orderCount, "used", "max"),
      units: { status: units.status, list: unitList },
      allSelected: selection.kind === "all",
      orderButtons,
      targetRejection: targetRejection
        ? { active: true, text: targetRejection }
        : { active: false, text: "" },
      commandStatus: { ...commandStatus },
      emote: { ...emote },
      notice: { ...notice },
      lastPayload: lastPayload ? cloneWire(lastPayload) : null,
      seqMode,
      pendingSeq,
    };
  }

  function setNotice(channel, text) {
    notice = { channel, text };
  }

  function selectionBlocked() {
    if (destroyed) return dead();
    if (step === "pending") {
      setNotice("assertive", "Command pending.");
      return { ok: false, error: "pending" };
    }
    return null;
  }

  function applySelection(next) {
    selection = next;
    orderId = null;
    targetRejection = null;
    cursor = "default";
    emote = { active: false, frame: "emote_broke", text: "" };
    if (next.kind === "none") {
      step = "select";
      setNotice("polite", "Selection cleared.");
      return { ok: true };
    }
    step = "order";
    const label = next.kind === "all" ? "All" : next.unitIds.join(", ");
    setNotice("polite", `${label} selected. Choose an order.`);
    return { ok: true };
  }

  function setSelection(input) {
    const blocked = selectionBlocked();
    if (blocked) return blocked;
    const parsed = parseSelection(input);
    if (!parsed.ok) {
      setNotice(
        "assertive",
        parsed.error === "coordinates"
          ? "Selection accepts unit ids only. Coordinates stay on the map bridge."
          : "Selection is not usable."
      );
      return parsed;
    }
    if (parsed.selection.kind === "units") {
      const blockedUnit = parsed.selection.unitIds.find((id) => {
        const unit = units.list.find((item) => item.id === id);
        return unit && unit.selectable === false;
      });
      if (blockedUnit) {
        setNotice("assertive", "Server: that unit cannot be selected.");
        return { ok: false, error: "unit_not_selectable" };
      }
    }
    return applySelection(parsed.selection);
  }

  function chooseOrder(id) {
    if (destroyed) return dead();
    if (step === "pending") {
      setNotice("assertive", "Command pending.");
      return { ok: false, error: "pending" };
    }
    if (selection.kind === "none") {
      setNotice("polite", "Select a bot or All first.");
      return { ok: false, error: "selection_unavailable" };
    }
    const order = findOrder(id);
    if (!order) {
      setNotice("assertive", "That order is not on the panel.");
      return { ok: false, error: "unknown_order" };
    }
    if (!order.enabled) {
      setNotice("assertive", order.reasonText || rejectionText("unknown"));
      return { ok: false, error: "order_not_enabled", reason: order.reasonCode };
    }
    orderId = order.id;
    step = "target";
    cursor = "target";
    targetRejection = null;
    emote = { active: false, frame: "emote_broke", text: "" };
    setNotice("polite", "Choose a target.");
    return { ok: true };
  }

  function setTarget(target, meta) {
    if (destroyed) return dead();
    if (step === "pending") {
      setNotice("assertive", "Command pending.");
      return { ok: false, error: "pending" };
    }
    if (step !== "target" || !orderId) {
      setNotice("polite", "Choose a bot or All, then an order, before a target.");
      return { ok: false, error: "flow_incomplete" };
    }
    const rejected = targetIsRejected(target, meta);
    if (target == null || rejected.rejected) {
      const reason =
        typeof rejected.reason === "string" && rejected.reason.trim()
          ? rejected.reason.trim()
          : "Invalid target";
      cursor = "invalid";
      targetRejection = reason;
      setNotice("assertive", `Invalid target. ${reason}`);
      return { ok: false, error: "target_rejected" };
    }
    const order = findOrder(orderId);
    if (!order || !order.enabled) {
      const text = order?.reasonText || rejectionText("unknown");
      orderId = null;
      step = "order";
      cursor = "default";
      setNotice("assertive", text);
      return { ok: false, error: "order_not_enabled" };
    }
    if (typeof onCommand !== "function") {
      setNotice("assertive", "Command handler is not attached. Nothing was sent.");
      return { ok: false, error: "handler_missing" };
    }
    const seq = takeSeq();
    if (seq == null) {
      setNotice("assertive", "Sequence number is unavailable.");
      return { ok: false, error: "seq_unavailable" };
    }
    const built = buildCommandPayload({
      seq,
      order: orderId,
      selection,
      target,
    });
    if (!built.ok) {
      setNotice("assertive", "Command could not be built.");
      return built;
    }
    try {
      onCommand(built.payload);
    } catch {
      setNotice("assertive", "Command was not delivered.");
      return { ok: false, error: "handler_threw" };
    }
    lastPayload = built.payload;
    pendingSeq = seq;
    step = "pending";
    cursor = "default";
    targetRejection = null;
    emote = { active: false, frame: "emote_broke", text: "" };
    commandStatus = {
      phase: "pending",
      seq,
      reason: null,
      text: "Command pending.",
    };
    setNotice("polite", "Command pending.");
    return { ok: true, payload: built.payload };
  }

  function takeSeq() {
    if (seqMode === "server") {
      if (!Number.isInteger(nextSeq) || nextSeq < 1) return null;
      const seq = nextSeq;
      nextSeq = null;
      return seq;
    }
    const seq = nextSeq;
    nextSeq += 1;
    return seq;
  }

  function finishPending(matched) {
    if (!matched) return;
    pendingSeq = null;
  }

  function applyResult(result) {
    if (!result || typeof result !== "object") return;
    const seq = Number.isInteger(result.seq) ? result.seq : null;
    const matched = pendingSeq == null || seq == null || seq === pendingSeq;
    if (result.type === "command_ack") {
      emote = { active: false, frame: "emote_broke", text: "" };
      commandStatus = {
        phase: "acknowledged",
        seq,
        reason: null,
        text: "Command acknowledged.",
      };
      setNotice("polite", "Command acknowledged.");
      if (matched) {
        finishPending(true);
        orderId = null;
        targetRejection = null;
        cursor = "default";
        step = selection.kind === "none" ? "select" : "order";
      }
      return;
    }
    if (result.type === "command_rejected") {
      const reason = typeof result.reason === "string" ? result.reason : null;
      const text = rejectionText(reason);
      emote = {
        active: true,
        frame: "emote_broke",
        text: "Order rejected",
      };
      commandStatus = {
        phase: "rejected",
        seq,
        reason,
        text,
      };
      setNotice("assertive", text);
      if (matched) {
        finishPending(true);
        const targetReason = typeof reason === "string" && reason.startsWith("target_");
        if (targetReason) {
          step = "target";
          cursor = "invalid";
          targetRejection = text;
        } else {
          orderId = null;
          targetRejection = null;
          cursor = "default";
          step = selection.kind === "none" ? "select" : "order";
        }
      }
    }
  }

  function revalidateOrder() {
    if (destroyed || step === "pending" || !orderId) return;
    const order = findOrder(orderId);
    if (order && order.enabled) return;
    const text = order?.reasonText || rejectionText("unknown");
    orderId = null;
    cursor = "default";
    targetRejection = null;
    step = selection.kind === "none" ? "select" : "order";
    setNotice("assertive", text);
  }

  return {
    update(patch) {
      if (destroyed) return dead();
      if (!patch || typeof patch !== "object") {
        return { ok: false, error: "invalid_patch" };
      }
      if ("units" in patch) units = normalizeUnits(patch.units);
      if ("budget" in patch) budget = normalizePair(patch.budget, "current", "cap");
      if ("orderCount" in patch) {
        orderCount = normalizePair(patch.orderCount, "used", "max");
      }
      if ("capabilities" in patch) {
        capabilities = normalizeCapabilities(patch.capabilities);
      }
      if ("nextSeq" in patch && Number.isInteger(patch.nextSeq) && patch.nextSeq >= 1) {
        seqMode = "server";
        nextSeq = patch.nextSeq;
      }
      const hadResult = "commandResult" in patch && patch.commandResult;
      if (hadResult) applyResult(patch.commandResult);
      if (!hadResult) revalidateOrder();
      return { ok: true };
    },
    setSelection,
    selectAll() {
      return setSelection("all");
    },
    selectUnit(id) {
      if (typeof id !== "string" || id.length === 0) {
        setNotice("assertive", "Selection is not usable.");
        return { ok: false, error: "invalid_selection" };
      }
      return setSelection({ unitIds: [id] });
    },
    clearSelection() {
      return setSelection(null);
    },
    chooseOrder,
    setTarget,
    destroy() {
      destroyed = true;
      setNotice("polite", "Command panel removed.");
      return { ok: true };
    },
    getViewModel,
  };
}

export function viewModelToHtml(viewModel, { idPrefix = "cp" } = {}) {
  const rules =
    viewModel.rulesStatus === "supplied"
      ? "Command rules: supplied by server"
      : "Command rules: unknown";
  const steps = COMMAND_FLOW_STEPS.map((name) => {
    const current =
      viewModel.step === name || (viewModel.step === "pending" && name === "target");
    const label = name[0].toUpperCase() + name.slice(1);
    return `<li data-step="${name}"${current ? ' aria-current="step"' : ""}>${label}</li>`;
  }).join("");

  const pips = renderPips(viewModel.budget);
  const units =
    viewModel.units.status === "supplied"
      ? viewModel.units.list
          .map((unit, index) => {
            const disabled = unit.selectable === false;
            return `<button type="button" class="cp-unit" data-action="select-unit" data-unit-id="${escapeHtml(unit.id)}" data-key="unit:${escapeHtml(unit.id)}" aria-pressed="${unit.selected ? "true" : "false"}" aria-disabled="${disabled ? "true" : "false"}"${disabled ? ' aria-describedby="' + idPrefix + "-unit-" + index + '"' : ""}>${escapeHtml(unit.name)}</button>${disabled ? `<span id="${idPrefix}-unit-${index}" class="cp-visually-hidden">Server: that unit cannot be selected.</span>` : ""}`;
          })
          .join("")
      : `<p class="cp-units-unknown">Unit roster: unknown</p>`;

  const orders = viewModel.orderButtons
    .map((order, index) => renderOrderButton(order, idPrefix, index, viewModel.orderId))
    .join("");

  const targetText = targetLine(viewModel);
  const pending =
    viewModel.step === "pending"
      ? `<p class="cp-pending" role="status">Command pending.</p>`
      : "";

  return `<header class="cp-header">
      <h2 class="cp-title">Orders</h2>
      <p class="cp-rules" data-rules="${viewModel.rulesStatus}">${escapeHtml(rules)}</p>
    </header>
    <div class="cp-readout">
      <div class="cp-budget" data-status="${viewModel.budget.status}">
        <span class="cp-frame" data-frame="cp_coin_16" data-art="placeholder"><span class="cp-visually-hidden">Command points placeholder</span><span aria-hidden="true">CP</span></span>
        <span class="cp-visually-hidden">Command points</span>
        <span class="cp-budget-value">${escapeHtml(viewModel.budget.text)}</span>
        ${pips}
      </div>
      <div class="cp-order-count" data-frame="orders_counter" data-art="placeholder" data-status="${viewModel.orderCount.status}">
        <span class="cp-order-count-label">Orders</span>
        <span class="cp-order-count-value">${escapeHtml(viewModel.orderCount.text)}</span>
      </div>
    </div>
    <ol class="cp-steps">${steps}</ol>
    <p class="cp-target" data-cursor="${viewModel.cursor}" data-cursor-frame="${viewModel.cursorFrame || ""}">${escapeHtml(targetText)}</p>
    ${pending}
    ${statusLine(viewModel)}
    <div class="cp-units" role="group" aria-label="Units">
      <button type="button" class="cp-unit" data-action="select-all" data-key="all" aria-pressed="${viewModel.allSelected ? "true" : "false"}">All</button>
      ${units}
      <button type="button" class="cp-text-button" data-action="clear-selection" data-key="clear" aria-label="Clear selection">Clear</button>
    </div>
    <div class="cp-order-grid" role="group" aria-label="Orders">${orders}</div>
    <p class="cp-art-note" title="${escapeHtml(PLACEHOLDER_ASSETS.note)}">Placeholder art. Final command images are not in this build.</p>`;
}

export function paintCommandPanel(parts, viewModel, context = {}) {
  const layout = context.layout === "desktop" ? "desktop" : "phone";
  parts.root.dataset.layout = layout;
  parts.root.dataset.cursor = viewModel.cursor;
  parts.root.dataset.step = viewModel.step;
  parts.root.dataset.rules = viewModel.rulesStatus;
  parts.root.dataset.art = "placeholder";
  parts.root.dataset.wired = "false";
  if (typeof parts.root.setAttribute === "function") {
    parts.root.setAttribute("data-command-panel-version", String(COMMAND_PANEL_VERSION));
  }
  parts.body.innerHTML = viewModelToHtml(viewModel, context);
  parts.emote.hidden = !viewModel.emote.active;
  parts.emote.textContent = viewModel.emote.active ? viewModel.emote.text : "";
  if (parts.emote.dataset) {
    parts.emote.dataset.frame = "emote_broke";
    parts.emote.dataset.art = "placeholder";
  }
  if (typeof parts.emote.setAttribute === "function") {
    parts.emote.setAttribute("role", "img");
    parts.emote.setAttribute(
      "aria-label",
      viewModel.emote.active ? "Order rejected. emote_broke placeholder." : ""
    );
  }
  parts.polite.textContent = viewModel.notice.channel === "polite" ? viewModel.notice.text : "";
  parts.assertive.textContent =
    viewModel.notice.channel === "assertive" ? viewModel.notice.text : "";
}

export function applyCommandPanelShell(shell, mode) {
  if (!shell || !shell.classList) {
    throw new TypeError("applyCommandPanelShell requires an element");
  }
  const resolved =
    mode === "phone" || mode === "desktop"
      ? mode
      : layoutForViewport({
          width: shell.clientWidth,
          height: shell.clientHeight,
        }).mode;
  shell.classList.add("cp-shell");
  shell.classList.toggle("cp-shell--phone", resolved === "phone");
  shell.classList.toggle("cp-shell--desktop", resolved === "desktop");
  return resolved;
}

export function mountCommandPanel(container, options = {}) {
  if (!container || typeof container.appendChild !== "function") {
    throw new TypeError("mountCommandPanel requires a container element");
  }
  const doc = options.document || container.ownerDocument || null;
  if (!doc || typeof doc.createElement !== "function") {
    throw new TypeError("mountCommandPanel requires a document");
  }
  if (options.injectStylesheet !== false && doc) {
    ensureStylesheet(doc, options.stylesheetHref || defaultStylesheetHref());
  }
  const session = createCommandSession({ onCommand: options.onCommand });
  const prefix = options.idPrefix || `cp${(mountSerial += 1)}`;
  const root = doc.createElement("section");
  root.className = "cp-root";
  if (typeof root.setAttribute === "function") {
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Command panel");
  }
  const emote = doc.createElement("div");
  emote.className = "cp-emote";
  emote.hidden = true;
  const body = doc.createElement("div");
  body.className = "cp-body";
  const polite = doc.createElement("div");
  polite.className = "cp-live cp-live--polite";
  if (typeof polite.setAttribute === "function") polite.setAttribute("aria-live", "polite");
  const assertive = doc.createElement("div");
  assertive.className = "cp-live cp-live--assertive";
  if (typeof assertive.setAttribute === "function") {
    assertive.setAttribute("aria-live", "assertive");
  }
  root.appendChild(body);
  root.appendChild(polite);
  root.appendChild(assertive);
  const frame = doc.createElement("div");
  frame.className = "cp-mount";
  frame.appendChild(emote);
  frame.appendChild(root);
  container.appendChild(frame);

  let layoutMode = initialLayout(options);
  let onResize = null;

  function render() {
    const activeKey = focusedKey(doc, root);
    const viewModel = session.getViewModel();
    paintCommandPanel(
      { root, body, emote, polite, assertive },
      viewModel,
      { idPrefix: prefix, layout: layoutMode }
    );
    frame.dataset.layout = layoutMode;
    frame.dataset.emote = viewModel.emote.active ? "on" : "off";
    restoreFocus(body, activeKey);
  }

  root.addEventListener("click", (event) => {
    const button = findActionButton(event.target, root);
    if (!button) return;
    const action = button.getAttribute("data-action");
    if (action === "select-all") session.selectAll();
    else if (action === "clear-selection") session.clearSelection();
    else if (action === "select-unit") session.selectUnit(button.getAttribute("data-unit-id"));
    else if (action === "choose-order") session.chooseOrder(button.getAttribute("data-order"));
    render();
  });

  const host = options.window || (typeof globalThis !== "undefined" ? globalThis : null);
  if (
    (options.layout == null || options.layout === "auto") &&
    options.listenResize !== false &&
    host &&
    typeof host.addEventListener === "function"
  ) {
    onResize = () => {
      const next = layoutForViewport({
        width: host.innerWidth,
        height: host.innerHeight,
      }).mode;
      if (next !== layoutMode) {
        layoutMode = next;
        render();
      }
    };
    host.addEventListener("resize", onResize);
  }

  render();

  return {
    update(patch) {
      const result = session.update(patch);
      render();
      return result;
    },
    setSelection(selection) {
      const result = session.setSelection(selection);
      render();
      return result;
    },
    setTarget(target, meta) {
      const result = session.setTarget(target, meta);
      render();
      return result;
    },
    destroy() {
      const result = session.destroy();
      if (onResize && host && typeof host.removeEventListener === "function") {
        host.removeEventListener("resize", onResize);
      }
      onResize = null;
      if (typeof frame.remove === "function") frame.remove();
      return result;
    },
    getViewModel() {
      return session.getViewModel();
    },
    getCursorHint() {
      const model = session.getViewModel();
      return { cursor: model.cursor, frame: model.cursorFrame };
    },
    getLayout() {
      return layoutMode;
    },
    root,
  };
}

function presentOrder(entry, capabilities) {
  const capability =
    capabilities.status === "supplied"
      ? capabilities.list.find((item) => item.id === entry.id) || null
      : null;
  if (capabilities.status !== "supplied" || !capability) {
    return baseOrder(entry, {
      cost: null,
      enabled: false,
      reasonCode: "unknown",
      cooldown: emptyCooldown(),
    });
  }
  let enabled = capability.enabled === true;
  let reasonCode = enabled ? null : capability.disabledReason || "unknown";
  const cooldown = capability.cooldown;
  if (cooldown.status === "unknown") {
    enabled = false;
    if (!reasonCode) reasonCode = "unknown";
  }
  if (cooldown.status === "active") {
    enabled = false;
    if (capability.enabled === true || !capability.disabledReason) {
      reasonCode = "cooldown";
    }
  }
  return baseOrder(entry, {
    cost: capability.cost,
    enabled,
    reasonCode: enabled ? null : reasonCode,
    cooldown,
  });
}

function baseOrder(entry, state) {
  const reasonText = state.enabled ? "" : rejectionText(state.reasonCode);
  return {
    id: entry.id,
    label: entry.label,
    frame: entry.frame,
    catalog: entry.catalog !== false,
    cost: state.cost,
    costText: state.cost == null ? "unknown" : String(state.cost),
    enabled: state.enabled,
    reasonCode: state.reasonCode,
    reasonText,
    cooldown: state.cooldown,
  };
}

function renderOrderButton(order, idPrefix, index, selectedId) {
  const reasonId = `${idPrefix}-reason-${index}`;
  const sweep =
    order.cooldown.status === "active"
      ? `<span class="cp-order-sweep" aria-hidden="true" style="--cp-sweep:${order.cooldown.sweep}" data-remaining-ms="${order.cooldown.remainingMs}" data-duration-ms="${order.cooldown.durationMs}"></span>`
      : "";
  const cooldownText =
    order.cooldown.status === "active"
      ? `<span class="cp-cooldown">Cooldown ${formatSeconds(order.cooldown.remainingMs)}</span>`
      : order.cooldown.status === "unknown"
        ? `<span class="cp-cooldown">Cooldown unknown</span>`
        : "";
  const described = order.enabled ? "" : ` aria-describedby="${reasonId}"`;
  const disabledFrame = order.enabled ? "" : ' data-disabled-frame="btn_disabled"';
  return `<button type="button" class="cp-order" data-action="choose-order" data-order="${escapeHtml(order.id)}" data-key="order:${escapeHtml(order.id)}" data-order-frame="${escapeHtml(order.frame)}" data-art="placeholder" data-cooldown="${order.cooldown.status}" aria-pressed="${selectedId === order.id ? "true" : "false"}" aria-disabled="${order.enabled ? "false" : "true"}"${described}${disabledFrame}>
      ${sweep}
      <span class="cp-order-label">${escapeHtml(order.label)}</span>
      <span class="cp-order-cost">CP ${escapeHtml(order.costText)}</span>
      ${cooldownText}
      ${order.enabled ? "" : `<span id="${reasonId}" class="cp-order-reason">${escapeHtml(order.reasonText)}</span>`}
    </button>`;
}

function renderPips(budget) {
  if (!canDrawPips(budget)) return "";
  const pips = [];
  for (let index = 0; index < budget.cap; index += 1) {
    const full = index < budget.current;
    pips.push(
      `<span class="cp-pip ${full ? "cp-pip--full" : "cp-pip--empty"}" data-frame="${full ? "pip_full" : "pip_empty"}" data-art="placeholder"></span>`
    );
  }
  return `<span class="cp-pips" aria-hidden="true">${pips.join("")}</span>`;
}

function canDrawPips(budget) {
  if (budget.status !== "supplied") return false;
  if (!Number.isInteger(budget.current) || !Number.isInteger(budget.cap)) return false;
  if (budget.cap < 0 || budget.cap > LAYOUT_RULES.pipDisplayLimit) return false;
  if (budget.current < 0 || budget.current > budget.cap) return false;
  return true;
}

function statusLine(viewModel) {
  const phase = viewModel.commandStatus.phase;
  if (phase !== "rejected" && phase !== "acknowledged") return "";
  return `<p class="cp-status" data-phase="${phase}">${escapeHtml(viewModel.commandStatus.text)}</p>`;
}

function targetLine(viewModel) {
  if (viewModel.targetRejection.active) {
    return `Invalid target. ${viewModel.targetRejection.text}`;
  }
  if (viewModel.step === "pending") {
    return "Target: command pending.";
  }
  if (viewModel.step === "target") {
    return "Target: choose one through the map bridge. This panel does not convert coordinates.";
  }
  return "Target: waiting for a selection and an order.";
}

function formatSeconds(remainingMs) {
  const seconds = remainingMs / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  return `${rounded}s`;
}

function displayPair(pair, currentKey, maxKey) {
  if (pair.status !== "supplied") {
    return { status: "unknown", [currentKey]: null, [maxKey]: null, text: "unknown" };
  }
  return {
    status: "supplied",
    [currentKey]: pair.current,
    [maxKey]: pair.max,
    text: `${pair.current}/${pair.max}`,
  };
}

function normalizePair(value, currentKey, maxKey) {
  if (!value || typeof value !== "object") {
    return { status: "unknown", current: null, max: null };
  }
  const current = finiteNumber(value[currentKey]);
  const max = finiteNumber(value[maxKey]);
  if (current == null || max == null) {
    return { status: "unknown", current: null, max: null };
  }
  return { status: "supplied", current, max };
}

function normalizeUnits(value) {
  if (value == null) return { status: "unknown", list: [] };
  if (!Array.isArray(value)) return { status: "unknown", list: [] };
  const list = [];
  const seen = new Set();
  for (const unit of value) {
    if (!unit || typeof unit.id !== "string" || unit.id.length === 0 || seen.has(unit.id)) {
      continue;
    }
    seen.add(unit.id);
    list.push({
      id: unit.id,
      name: typeof unit.name === "string" && unit.name.trim() ? unit.name : unit.id,
      selectable: unit.selectable !== false,
    });
  }
  return { status: "supplied", list };
}

function normalizeCapabilities(value) {
  if (!value || typeof value !== "object" || value.orders == null) {
    return { status: "unknown", list: [] };
  }
  const raw = Array.isArray(value.orders)
    ? value.orders
    : typeof value.orders === "object"
      ? Object.entries(value.orders).map(([id, entry]) => ({
          id,
          ...(entry && typeof entry === "object" ? entry : {}),
        }))
      : null;
  if (!raw) return { status: "unknown", list: [] };
  const list = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry.id !== "string" || entry.id.length === 0 || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    list.push({
      id: entry.id,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label : null,
      frame: typeof entry.frame === "string" && entry.frame.trim() ? entry.frame : null,
      cost: finiteNumber(entry.cost),
      enabled: entry.enabled === true,
      disabledReason:
        typeof entry.disabledReason === "string" && entry.disabledReason.trim()
          ? entry.disabledReason.trim()
          : null,
      cooldown: normalizeCooldown(entry.cooldown),
    });
  }
  return { status: "supplied", list };
}

function normalizeCooldown(value) {
  if (value == null) return emptyCooldown();
  if (typeof value !== "object") {
    return { status: "unknown", remainingMs: null, durationMs: null, sweep: null };
  }
  const remainingMs = finiteNumber(value.remainingMs);
  const durationMs = finiteNumber(value.durationMs);
  if (remainingMs == null || durationMs == null || durationMs <= 0) {
    return { status: "unknown", remainingMs, durationMs, sweep: null };
  }
  const sweep = Math.round(Math.min(1, Math.max(0, remainingMs / durationMs)) * 1000) / 1000;
  if (remainingMs > 0) {
    return { status: "active", remainingMs, durationMs, sweep };
  }
  return { status: "clear", remainingMs, durationMs, sweep: 0 };
}

function emptyCooldown() {
  return { status: "not_supplied", remainingMs: null, durationMs: null, sweep: null };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseSelection(input) {
  if (input == null) return { ok: true, selection: { kind: "none", unitIds: [] } };
  if (input === "all") return { ok: true, selection: { kind: "all", unitIds: [] } };
  if (typeof input !== "object") return { ok: false, error: "invalid_selection" };
  if (input.all === true || input.unitIds === "all") {
    return { ok: true, selection: { kind: "all", unitIds: [] } };
  }
  if (Array.isArray(input.unitIds)) {
    const unitIds = [];
    for (const id of input.unitIds) {
      if (typeof id === "string" && id.length > 0 && !unitIds.includes(id)) unitIds.push(id);
    }
    if (unitIds.length === 0) {
      return { ok: true, selection: { kind: "none", unitIds: [] } };
    }
    return { ok: true, selection: { kind: "units", unitIds } };
  }
  if ("x" in input || "y" in input) return { ok: false, error: "coordinates" };
  return { ok: false, error: "invalid_selection" };
}

function targetIsRejected(target, meta) {
  if (meta && typeof meta === "object" && meta.valid === false) {
    return { rejected: true, reason: meta.reason };
  }
  if (target && typeof target === "object" && target.valid === false) {
    return { rejected: true, reason: target.reason };
  }
  return { rejected: false, reason: null };
}

function cloneWire(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      return value;
    }
  }
  return value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function initialLayout(options) {
  if (options.layout === "phone" || options.layout === "desktop") return options.layout;
  const host = options.window || globalThis;
  return layoutForViewport({
    width: host?.innerWidth,
    height: host?.innerHeight,
  }).mode;
}

function defaultStylesheetHref() {
  return new URL("./command-panel.css", import.meta.url).href;
}

function ensureStylesheet(doc, href) {
  try {
    if (!doc || typeof doc.getElementById !== "function" || typeof doc.createElement !== "function") {
      return;
    }
    if (doc.getElementById("cp-stylesheet")) return;
    const head = doc.head || doc.querySelector?.("head");
    if (!head || typeof head.appendChild !== "function") return;
    const link = doc.createElement("link");
    link.id = "cp-stylesheet";
    link.rel = "stylesheet";
    link.href = href;
    head.appendChild(link);
  } catch {
    // The panel still renders. The integrator can link command-panel.css.
  }
}

function focusedKey(doc, root) {
  const active = doc?.activeElement;
  if (!active || !root.contains?.(active) || typeof active.getAttribute !== "function") {
    return null;
  }
  return active.getAttribute("data-key");
}

function restoreFocus(body, key) {
  if (!key || typeof body.querySelector !== "function") return;
  const escape = globalThis.CSS?.escape;
  if (typeof escape !== "function") return;
  const next = body.querySelector(`[data-key="${escape(key)}"]`);
  if (next && typeof next.focus === "function") next.focus();
}

function findActionButton(target, root) {
  const button = target?.closest?.("button[data-action]");
  if (!button || (typeof root.contains === "function" && !root.contains(button))) return null;
  return button;
}
