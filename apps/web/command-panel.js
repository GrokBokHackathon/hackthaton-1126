// Command panel. Presentation only.
// Costs, cooldowns, and legality are displayed from an injected snapshot.
// Missing snapshot values stay unknown and are not filled in here.
//
// Flow: the whole squad is picked by default. Tap a bot to narrow it down,
// tap an order, then tap the map. Orders with needsTarget: false (Beer)
// are sent as soon as they are tapped.

export const COMMAND_PANEL_VERSION = 2;

export const COMMAND_PANEL_INTEGRATION = Object.freeze({
  wiredToServer: false,
  wiredToGameClient: false,
  payloadType: "command",
  resultTypes: Object.freeze(["command_ack", "command_rejected"]),
});

/** Order buttons. Frames and copy only — command-point costs come from the server. */
export const COMMAND_ORDERS = Object.freeze([
  Object.freeze({ id: "rally", label: "Rally", frame: "ord_rally", hint: "Regroup at a spot", needsTarget: true }),
  Object.freeze({ id: "scout", label: "Scout", frame: "ord_scout", hint: "Explore, even into fog", needsTarget: true }),
  Object.freeze({ id: "defend", label: "Defend", frame: "ord_defend", hint: "Hold a spot", needsTarget: true }),
  Object.freeze({ id: "escort", label: "Escort", frame: "ord_escort", hint: "Cover a spot or carrier", needsTarget: true }),
  Object.freeze({ id: "attack", label: "Attack", frame: "ord_attack", hint: "Push to a spot", needsTarget: true }),
  Object.freeze({ id: "tag", label: "Tag", frame: "ord_tag", hint: "Hunt where you can see", needsTarget: true }),
  Object.freeze({ id: "beer", label: "Beer", frame: "ord_beer", hint: "Squad speed boost, once a round", needsTarget: false }),
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
    "ord_beer",
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
  budget: "{ current: number, cap: number }. Omit either number and the readout stays unknown.",
  orderCount: "{ used: number, max: number }. Omit either number and the counter stays unknown.",
  capabilities: "{ orders: array or id-keyed object of { id, label?, frame?, cost?, enabled?, disabledReason?, cooldown? } }. enabled must be true to allow an order. cooldown is { remainingMs, durationMs } or omitted.",
  commandResult: "{ type: 'command_ack' | 'command_rejected', seq?: number, reason?: string }.",
  nextSeq: "positive integer. Passing it hands sequence numbers to the caller. Until then this panel assigns a local correlation seq.",
  team: "{ id: string, label?: string } for the squad this commander leads, or null.",
});

const LOCAL_REASON_TEXT = Object.freeze({
  unknown: "Waiting for the server",
  unavailable: "Waiting for the server",
  invalid_target: "Outside the map",
});

const TARGET_RULE_TEXT = Object.freeze({
  scout: "Any tile, even in the fog.",
  tag: "Only a tile you can see right now.",
});
const DEFAULT_TARGET_RULE = "Any tile you have explored.";

const SECTION_KEYS = Object.freeze(["status", "who", "prompt", "orders"]);

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

export function buildCommandPayload({ seq, order, selection, target, needsTarget = true } = {}) {
  if (!Number.isInteger(seq) || seq < 1) {
    return { ok: false, error: "seq_unavailable" };
  }
  if (typeof order !== "string" || order.length === 0) {
    return { ok: false, error: "order_unavailable" };
  }
  if (needsTarget === false) {
    return { ok: true, payload: { type: "command", seq, order, all: true } };
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

const ALL = Object.freeze({ kind: "all", unitIds: Object.freeze([]) });

export function createCommandSession({ onCommand } = {}) {
  let destroyed = false;
  let seqMode = "local";
  let nextSeq = 1;
  let selection = { kind: "all", unitIds: [] };
  let step = "order";
  let orderId = null;
  let pendingSeq = null;
  let pendingOrderId = null;
  let units = normalizeUnits(undefined);
  let budget = normalizePair(undefined, "current", "cap");
  let orderCount = normalizePair(undefined, "used", "max");
  let capabilities = normalizeCapabilities(undefined);
  let team = null;
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
    text: "Pick an order, then tap the map. Tap a bot first to order just that bot.",
  };
  let lastPayload = null;

  function dead() {
    return { ok: false, error: "destroyed" };
  }

  function findOrder(id) {
    return getViewModel().orderButtons.find((order) => order.id === id) || null;
  }

  function orderCatalog() {
    const catalog = COMMAND_ORDERS.map((entry) => {
      const capability =
        capabilities.status === "supplied"
          ? capabilities.list.find((item) => item.id === entry.id) || null
          : null;
      return {
        ...entry,
        frame: capability?.frame || entry.frame,
        catalog: true,
      };
    });
    if (capabilities.status !== "supplied") return catalog;
    const seen = new Set(catalog.map((entry) => entry.id));
    for (const capability of capabilities.list) {
      if (seen.has(capability.id)) continue;
      seen.add(capability.id);
      catalog.push({
        id: capability.id,
        label: capability.label || titleCase(capability.id),
        frame: capability.frame || "",
        hint: "",
        needsTarget: true,
        catalog: false,
      });
    }
    return catalog;
  }

  function unitName(id) {
    const unit = units.list.find((item) => item.id === id);
    return unit ? unit.shortName : id;
  }

  function selectionLabel() {
    if (selection.kind === "all") return "Whole squad";
    return selection.unitIds.map(unitName).join(" + ");
  }

  function getViewModel() {
    const orderButtons = orderCatalog().map((entry) => ({
      ...presentOrder(entry, capabilities),
      armed: orderId === entry.id && (step === "target" || step === "pending"),
    }));
    const unitList = units.list.map((unit) => ({
      ...unit,
      selected: selection.kind === "units" && selection.unitIds.includes(unit.id),
    }));
    const armedOrder = orderId ? orderButtons.find((order) => order.id === orderId) || null : null;
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
      selectionLabel: selectionLabel(),
      orderId,
      armedOrder: armedOrder ? { id: armedOrder.id, label: armedOrder.label } : null,
      targetRule: orderId ? TARGET_RULE_TEXT[orderId] || DEFAULT_TARGET_RULE : null,
      cursor,
      cursorFrame: cursor === "invalid" ? "cursor_invalid" : null,
      rulesStatus: capabilities.status === "supplied" ? "supplied" : "unknown",
      team: team ? { ...team } : null,
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

  function clearEmote() {
    emote = { active: false, frame: "emote_broke", text: "" };
  }

  function disarm() {
    orderId = null;
    targetRejection = null;
    cursor = "default";
    if (step !== "pending") step = "order";
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
    selection = next.kind === "all" ? { kind: "all", unitIds: [] } : next;
    targetRejection = null;
    if (step === "target") cursor = "target";
    clearEmote();
    const label = selectionLabel();
    if (orderId) {
      setNotice("polite", `${label} selected. Tap the map to send the order.`);
    } else {
      setNotice("polite", `${label} selected. Pick an order.`);
    }
    return { ok: true };
  }

  function checkSelectable(ids) {
    const blockedUnit = ids.find((id) => {
      const unit = units.list.find((item) => item.id === id);
      return unit && unit.selectable === false;
    });
    if (blockedUnit) {
      setNotice("assertive", "Server: that unit cannot be selected.");
      return { ok: false, error: "unit_not_selectable" };
    }
    return null;
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
      const notSelectable = checkSelectable(parsed.selection.unitIds);
      if (notSelectable) return notSelectable;
    }
    return applySelection(parsed.selection);
  }

  function toggleUnit(id) {
    const blocked = selectionBlocked();
    if (blocked) return blocked;
    if (typeof id !== "string" || id.length === 0) {
      setNotice("assertive", "Selection is not usable.");
      return { ok: false, error: "invalid_selection" };
    }
    const current = selection.kind === "units" ? selection.unitIds : [];
    if (current.includes(id)) {
      const rest = current.filter((item) => item !== id);
      return applySelection(rest.length ? { kind: "units", unitIds: rest } : ALL);
    }
    const notSelectable = checkSelectable([id]);
    if (notSelectable) return notSelectable;
    return applySelection({ kind: "units", unitIds: current.concat(id) });
  }

  function chooseOrder(id) {
    if (destroyed) return dead();
    if (step === "pending") {
      setNotice("assertive", "Command pending.");
      return { ok: false, error: "pending" };
    }
    const order = findOrder(id);
    if (!order) {
      setNotice("assertive", "That order is not on the panel.");
      return { ok: false, error: "unknown_order" };
    }
    if (step === "target" && orderId === order.id) {
      disarm();
      setNotice("polite", `${order.label} cancelled.`);
      return { ok: true, cancelled: true };
    }
    if (!order.enabled) {
      setNotice("assertive", order.reasonText || rejectionText("unknown"));
      return { ok: false, error: "order_not_enabled", reason: order.reasonCode };
    }
    clearEmote();
    targetRejection = null;
    if (!order.needsTarget) {
      orderId = order.id;
      const sent = send(order, null);
      if (!sent.ok) orderId = null;
      return sent;
    }
    orderId = order.id;
    step = "target";
    cursor = "target";
    setNotice("polite", `Tap the map to send ${order.label} to ${selectionLabel()}.`);
    return { ok: true };
  }

  function cancelOrder() {
    if (destroyed) return dead();
    if (step !== "target" || !orderId) return { ok: false, error: "nothing_armed" };
    const label = findOrder(orderId)?.label || orderId;
    disarm();
    setNotice("polite", `${label} cancelled.`);
    return { ok: true };
  }

  function setTarget(target, meta) {
    if (destroyed) return dead();
    if (step === "pending") {
      setNotice("assertive", "Command pending.");
      return { ok: false, error: "pending" };
    }
    if (step !== "target" || !orderId) {
      setNotice("polite", "Pick an order first, then tap the map.");
      return { ok: false, error: "flow_incomplete" };
    }
    const rejected = targetIsRejected(target, meta);
    if (target == null || rejected.rejected) {
      const reason =
        typeof rejected.reason === "string" && rejected.reason.trim()
          ? rejectionText(rejected.reason.trim())
          : "Invalid target";
      cursor = "invalid";
      targetRejection = reason;
      setNotice("assertive", `Invalid target. ${reason}`);
      return { ok: false, error: "target_rejected" };
    }
    const order = findOrder(orderId);
    if (!order || !order.enabled) {
      const text = order?.reasonText || rejectionText("unknown");
      disarm();
      setNotice("assertive", text);
      return { ok: false, error: "order_not_enabled" };
    }
    const armed = selectionForCommand();
    if (!armed.ok) {
      disarmInvalidSelection();
      return armed;
    }
    selection = armed.selection;
    return send(order, target);
  }

  function send(order, target) {
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
      order: order.id,
      selection,
      target,
      needsTarget: order.needsTarget,
    });
    if (!built.ok) {
      setNotice("assertive", "Command could not be built.");
      return built;
    }
    let delivery;
    try {
      delivery = onCommand(built.payload);
    } catch {
      setNotice("assertive", "Command was not delivered.");
      return { ok: false, error: "handler_threw", local: true };
    }
    if (delivery === false || (delivery && delivery.sent === false)) {
      setNotice("assertive", "Command was not delivered.");
      return { ok: false, error: "transport_failed", local: true };
    }
    lastPayload = built.payload;
    pendingSeq = seq;
    pendingOrderId = order.id;
    step = "pending";
    cursor = "default";
    targetRejection = null;
    clearEmote();
    commandStatus = {
      phase: "pending",
      seq,
      reason: null,
      text: `Sending ${order.label}…`,
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

  function sentLabel() {
    const id = pendingOrderId || orderId;
    const entry = id ? orderCatalog().find((item) => item.id === id) : null;
    return entry ? entry.label : "Order";
  }

  function applyResult(result) {
    if (!result || typeof result !== "object") return;
    const seq = Number.isInteger(result.seq) ? result.seq : null;
    const matched = pendingSeq == null || seq == null || seq === pendingSeq;
    if (result.type === "command_ack") {
      clearEmote();
      const label = sentLabel();
      const who = lastPayload && lastPayload.order === "beer" ? "Whole squad" : selectionLabel();
      commandStatus = {
        phase: "acknowledged",
        seq,
        reason: null,
        text: `${label} sent to ${who}.`,
      };
      setNotice("polite", "Command acknowledged.");
      if (matched) {
        pendingSeq = null;
        pendingOrderId = null;
        orderId = null;
        targetRejection = null;
        cursor = "default";
        step = "order";
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
        pendingSeq = null;
        const targetReason = typeof reason === "string" && reason.startsWith("target_");
        if (targetReason && orderId) {
          step = "target";
          cursor = "invalid";
          targetRejection = text;
        } else {
          pendingOrderId = null;
          orderId = null;
          targetRejection = null;
          cursor = "default";
          step = "order";
        }
      }
    }
  }

  function rosterIds(unitIds) {
    if (units.status !== "supplied") return null;
    const allowed = new Set();
    for (const unit of units.list) {
      if (unit.selectable !== false) allowed.add(unit.id);
    }
    return unitIds.filter((id) => allowed.has(id));
  }

  function disarmInvalidSelection() {
    selection = { kind: "all", unitIds: [] };
    if (step === "pending") return;
    const wasArmed = Boolean(orderId);
    orderId = null;
    cursor = "default";
    targetRejection = null;
    clearEmote();
    step = "order";
    setNotice(
      "assertive",
      wasArmed
        ? "That bot left the squad. Order cancelled, whole squad selected."
        : "That bot left the squad. Whole squad selected."
    );
  }

  function reconcileArmedSelection() {
    if (selection.kind !== "units") return;
    const kept = rosterIds(selection.unitIds);
    if (kept == null) return;
    const unchanged =
      kept.length === selection.unitIds.length &&
      kept.every((id, index) => id === selection.unitIds[index]);
    if (unchanged) return;
    if (kept.length === 0) {
      disarmInvalidSelection();
      return;
    }
    selection = { kind: "units", unitIds: kept };
    if (step !== "pending") {
      setNotice("polite", `${selectionLabel()} still selected.`);
    }
  }

  function selectionForCommand() {
    if (selection.kind === "all") return { ok: true, selection };
    if (selection.kind !== "units" || selection.unitIds.length === 0) {
      return { ok: false, error: "selection_unavailable" };
    }
    const kept = rosterIds(selection.unitIds);
    if (kept == null) return { ok: true, selection };
    if (kept.length === 0) return { ok: false, error: "selection_unavailable" };
    return { ok: true, selection: { kind: "units", unitIds: kept } };
  }

  function revalidateOrder() {
    if (destroyed || step !== "target" || !orderId) return;
    const order = findOrder(orderId);
    if (order && order.enabled) return;
    const text = order?.reasonText || rejectionText("unknown");
    disarm();
    setNotice("assertive", text);
  }

  return {
    update(patch) {
      if (destroyed) return dead();
      if (!patch || typeof patch !== "object") {
        return { ok: false, error: "invalid_patch" };
      }
      if ("team" in patch) team = normalizeTeam(patch.team);
      if ("units" in patch) {
        units = normalizeUnits(patch.units);
        reconcileArmedSelection();
      }
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
    toggleUnit,
    clearSelection() {
      return setSelection(null);
    },
    chooseOrder,
    cancelOrder,
    setTarget,
    hint(text) {
      if (destroyed) return dead();
      if (typeof text === "string" && text) setNotice("polite", text);
      return { ok: true };
    },
    destroy() {
      destroyed = true;
      setNotice("polite", "Command panel removed.");
      return { ok: true };
    },
    getViewModel,
    cancelPendingTransport() {
      if (destroyed) return dead();
      const wasPending = step === "pending" || pendingSeq != null;
      pendingSeq = null;
      pendingOrderId = null;
      commandStatus = {
        phase: "local_cancelled",
        seq: null,
        reason: null,
        text: "Command was not sent. The connection closed.",
      };
      if (wasPending) {
        const armed = orderId && findOrder(orderId)?.needsTarget !== false;
        if (!armed) orderId = null;
        step = armed ? "target" : "order";
        cursor = armed ? "target" : "default";
        setNotice("assertive", "Command was not sent. The connection closed.");
      }
      return { ok: true, cancelled: wasPending, local: true };
    },
  };
}

/** Panel markup split into sections so a mounted panel only repaints what changed. */
export function viewModelToHtml(viewModel, options = {}) {
  const sections = renderSections(viewModel, options);
  return SECTION_KEYS.map(
    (key) => `<div class="cp-section cp-section--${key}" data-section="${key}">${sections[key]}</div>`
  ).join("");
}

function renderSections(viewModel, { idPrefix = "cp" } = {}) {
  return {
    status: renderStatus(viewModel),
    who: renderWho(viewModel, idPrefix),
    prompt: renderPrompt(viewModel),
    orders: `<div class="cp-order-grid" role="group" aria-label="Orders">${viewModel.orderButtons
      .map((order, index) => renderOrderButton(order, idPrefix, index))
      .join("")}</div>`,
  };
}

function renderStatus(viewModel) {
  const team = viewModel.team
    ? `<span class="cp-team" data-team="${escapeHtml(viewModel.team.id)}"><span class="cp-team-dot" aria-hidden="true"></span>${escapeHtml(viewModel.team.label)} squad</span>`
    : "";
  return `<div class="cp-readout" data-rules="${viewModel.rulesStatus}">
      ${team}
      <div class="cp-budget" data-status="${viewModel.budget.status}" title="Command points. Orders cost CP; CP refills over time.">
        <span class="cp-frame" data-frame="cp_coin_16" data-art="placeholder" aria-hidden="true">CP</span>
        <span class="cp-visually-hidden">Command points</span>
        <span class="cp-budget-value">${escapeHtml(viewModel.budget.text)}</span>
        ${renderPips(viewModel.budget)}
      </div>
      <div class="cp-order-count" data-frame="orders_counter" data-art="placeholder" data-status="${viewModel.orderCount.status}" title="Orders used this round">
        <span class="cp-order-count-label">Orders</span>
        <span class="cp-order-count-value">${escapeHtml(viewModel.orderCount.text)}</span>
      </div>
    </div>`;
}

function renderWho(viewModel, idPrefix) {
  const locked = viewModel.step === "pending";
  const units =
    viewModel.units.status === "supplied"
      ? viewModel.units.list
          .map((unit, index) => {
            const disabled = unit.selectable === false;
            const describedId = `${idPrefix}-unit-${index}`;
            return `<button type="button" class="cp-unit" data-action="toggle-unit" data-unit-id="${escapeHtml(unit.id)}" data-key="unit:${escapeHtml(unit.id)}" title="${escapeHtml(unit.name)}" aria-pressed="${unit.selected ? "true" : "false"}" aria-disabled="${disabled || locked ? "true" : "false"}"${disabled ? ` aria-describedby="${describedId}"` : ""}>${escapeHtml(unit.shortName)}</button>${disabled ? `<span id="${describedId}" class="cp-visually-hidden">Server: that unit cannot be selected.</span>` : ""}`;
          })
          .join("")
      : `<span class="cp-units-unknown">Waiting for your squad…</span>`;
  return `<div class="cp-units" role="group" aria-label="Who gets the order">
      <span class="cp-label" aria-hidden="true">Who</span>
      <button type="button" class="cp-unit cp-unit--all" data-action="select-all" data-key="all" aria-pressed="${viewModel.allSelected ? "true" : "false"}" aria-disabled="${locked ? "true" : "false"}">All</button>
      ${units}
    </div>`;
}

function renderPrompt(viewModel) {
  const { tone, title, detail, cancel } = promptCopy(viewModel);
  const cancelButton = cancel
    ? `<button type="button" class="cp-cancel" data-action="cancel-order" data-key="cancel">Cancel</button>`
    : "";
  return `<div class="cp-prompt" data-tone="${tone}" data-step="${viewModel.step}" data-cursor="${viewModel.cursor}" data-cursor-frame="${viewModel.cursorFrame || ""}">
      <div class="cp-prompt-copy">
        <p class="cp-prompt-title">${escapeHtml(title)}</p>
        ${detail ? `<p class="cp-prompt-detail">${escapeHtml(detail)}</p>` : ""}
      </div>
      ${cancelButton}
    </div>`;
}

function promptCopy(viewModel) {
  const who = viewModel.selectionLabel;
  const status = viewModel.commandStatus;
  if (viewModel.step === "pending") {
    return { tone: "pending", title: status.text || "Command pending.", detail: "" };
  }
  if (viewModel.step === "target" && viewModel.armedOrder) {
    if (viewModel.targetRejection.active) {
      return {
        tone: "invalid",
        title: `Invalid target. ${viewModel.targetRejection.text}`,
        detail: `Tap another spot for ${viewModel.armedOrder.label}. ${viewModel.targetRule || ""}`.trim(),
        cancel: true,
      };
    }
    return {
      tone: "armed",
      title: `Tap the map: ${viewModel.armedOrder.label} → ${who}`,
      detail: viewModel.targetRule || "",
      cancel: true,
    };
  }
  if (viewModel.rulesStatus !== "supplied") {
    return { tone: "unknown", title: "Waiting for the server…", detail: "Orders unlock when your squad reports in." };
  }
  if (status.phase === "rejected") {
    return { tone: "rejected", title: `Rejected: ${status.text}`, detail: `Pick an order for ${who}.` };
  }
  if (status.phase === "acknowledged") {
    return { tone: "ok", title: status.text, detail: `Next order for ${who}?` };
  }
  if (status.phase === "local_cancelled") {
    return { tone: "rejected", title: status.text, detail: `Pick an order for ${who}.` };
  }
  return {
    tone: "idle",
    title: `Pick an order for ${who}`,
    detail: "Then tap the map. Tap a bot first to order only that bot.",
  };
}

export function paintCommandPanel(parts, viewModel, context = {}) {
  const layout = context.layout === "desktop" ? "desktop" : "phone";
  parts.root.dataset.layout = layout;
  parts.root.dataset.cursor = viewModel.cursor;
  parts.root.dataset.step = viewModel.step;
  parts.root.dataset.rules = viewModel.rulesStatus;
  parts.root.dataset.art = "placeholder";
  parts.root.dataset.wired = "false";
  if (viewModel.team) parts.root.dataset.team = viewModel.team.id;
  else delete parts.root.dataset.team;
  if (typeof parts.root.setAttribute === "function") {
    parts.root.setAttribute("data-command-panel-version", String(COMMAND_PANEL_VERSION));
  }
  let changed = false;
  if (parts.sections) {
    const html = renderSections(viewModel, context);
    for (const key of SECTION_KEYS) {
      const el = parts.sections[key];
      if (!el || el.__cpHtml === html[key]) continue;
      el.innerHTML = html[key];
      el.__cpHtml = html[key];
      changed = true;
    }
  } else {
    parts.body.innerHTML = viewModelToHtml(viewModel, context);
    changed = true;
  }
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
  const polite = viewModel.notice.channel === "polite" ? viewModel.notice.text : "";
  const assertive = viewModel.notice.channel === "assertive" ? viewModel.notice.text : "";
  if (parts.polite.textContent !== polite) parts.polite.textContent = polite;
  if (parts.assertive.textContent !== assertive) parts.assertive.textContent = assertive;
  return changed;
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
  const sections = {};
  for (const key of SECTION_KEYS) {
    const section = doc.createElement("div");
    section.className = `cp-section cp-section--${key}`;
    section.dataset.section = key;
    body.appendChild(section);
    sections[key] = section;
  }
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
  const onChange = typeof options.onChange === "function" ? options.onChange : null;

  function render() {
    const activeKey = focusedKey(doc, root);
    const viewModel = session.getViewModel();
    paintCommandPanel(
      { root, body, sections, emote, polite, assertive },
      viewModel,
      { idPrefix: prefix, layout: layoutMode }
    );
    frame.dataset.layout = layoutMode;
    frame.dataset.emote = viewModel.emote.active ? "on" : "off";
    if (activeKey && !root.contains?.(doc.activeElement)) restoreFocus(body, activeKey);
    if (onChange) onChange(viewModel);
  }

  function act(button) {
    const action = button.getAttribute("data-action");
    if (action === "select-all") session.selectAll();
    else if (action === "clear-selection") session.clearSelection();
    else if (action === "toggle-unit") session.toggleUnit(button.getAttribute("data-unit-id"));
    else if (action === "select-unit") session.selectUnit(button.getAttribute("data-unit-id"));
    else if (action === "choose-order") session.chooseOrder(button.getAttribute("data-order"));
    else if (action === "cancel-order") session.cancelOrder();
    else return;
    render();
  }

  // Server snapshots repaint sections between pointerdown and pointerup, which
  // can swallow the click. A pointerup on a button with the same data-key as
  // the pointerdown still counts.
  let downKey = null;
  let suppressClickUntil = 0;
  root.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    downKey = findActionButton(event.target, root)?.getAttribute("data-key") || null;
  });
  root.addEventListener("pointercancel", () => {
    downKey = null;
  });
  root.addEventListener("pointerup", (event) => {
    const key = downKey;
    downKey = null;
    if (!key) return;
    const button = findActionButton(event.target, root);
    if (!button || button.getAttribute("data-key") !== key) return;
    suppressClickUntil = Date.now() + 500;
    act(button);
  });
  root.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      return;
    }
    const button = findActionButton(event.target, root);
    if (button) act(button);
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

  function wrap(method) {
    return (...args) => {
      const result = session[method](...args);
      render();
      return result;
    };
  }

  return {
    update: wrap("update"),
    setSelection: wrap("setSelection"),
    toggleUnit: wrap("toggleUnit"),
    selectAll: wrap("selectAll"),
    chooseOrder: wrap("chooseOrder"),
    cancelOrder: wrap("cancelOrder"),
    setTarget: wrap("setTarget"),
    hint: wrap("hint"),
    cancelPendingTransport: wrap("cancelPendingTransport"),
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
    hint: entry.hint || "",
    needsTarget: entry.needsTarget !== false,
    catalog: entry.catalog !== false,
    cost: state.cost,
    costText: state.cost == null ? "unknown" : String(state.cost),
    enabled: state.enabled,
    reasonCode: state.reasonCode,
    reasonText,
    shortReason: state.enabled ? "" : shortReason(state.reasonCode, state.cost, state.cooldown, reasonText),
    cooldown: state.cooldown,
  };
}

function shortReason(code, cost, cooldown, fallback) {
  if (code === "cooldown") {
    return cooldown.status === "active" ? `Ready in ${formatSeconds(cooldown.remainingMs)}` : "Cooling down";
  }
  if (code === "not_enough_cp") return cost == null ? "Not enough CP" : `Need ${cost} CP`;
  if (code === "already_used") return "Used this round";
  if (code === "no_orders_left") return "No orders left";
  if (code === "unknown" || code === "unavailable") return "Waiting for server";
  return fallback;
}

function renderOrderButton(order, idPrefix, index) {
  const reasonId = `${idPrefix}-reason-${index}`;
  const sweep =
    order.cooldown.status === "active"
      ? `<span class="cp-order-sweep" aria-hidden="true" style="--cp-sweep:${order.cooldown.sweep}" data-remaining-ms="${order.cooldown.remainingMs}" data-duration-ms="${order.cooldown.durationMs}"></span>`
      : "";
  const described = order.enabled ? "" : ` aria-describedby="${reasonId}"`;
  const disabledFrame = order.enabled ? "" : ' data-disabled-frame="btn_disabled"';
  const cost = order.cost == null ? "?" : order.costText;
  const sub = order.enabled
    ? `<span class="cp-order-hint">${escapeHtml(order.hint || (order.needsTarget ? "Tap the map" : ""))}</span>`
    : `<span class="cp-order-reason" aria-hidden="true">${escapeHtml(order.shortReason)}</span><span id="${reasonId}" class="cp-visually-hidden">${escapeHtml(order.reasonText)}</span>`;
  const key = index < 9 ? `<kbd class="cp-key" aria-hidden="true">${index + 1}</kbd>` : "";
  return `<button type="button" class="cp-order" data-action="choose-order" data-order="${escapeHtml(order.id)}" data-key="order:${escapeHtml(order.id)}" data-order-frame="${escapeHtml(order.frame)}" data-art="placeholder" data-cooldown="${order.cooldown.status}" data-needs-target="${order.needsTarget ? "true" : "false"}" aria-pressed="${order.armed ? "true" : "false"}" aria-disabled="${order.enabled ? "false" : "true"}"${described}${disabledFrame}>
      ${sweep}
      <span class="cp-order-top"><span class="cp-order-label">${escapeHtml(order.label)}</span><span class="cp-order-cost" aria-label="Cost ${escapeHtml(order.costText)} command points">${escapeHtml(cost)} CP</span></span>
      ${sub}
      ${key}
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

function formatSeconds(remainingMs) {
  const seconds = remainingMs / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  return `${rounded}s`;
}

function titleCase(id) {
  const text = String(id).replaceAll(/[_-]+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : String(id);
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

function normalizeTeam(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label.trim() : titleCase(value.id);
  return { id: value.id, label };
}

/** "Red Runner" → "Runner". The chip sits under a team header already. */
function shortUnitName(name) {
  const stripped = name.replace(/^(red|bot|blue)\s+/i, "");
  return stripped || name;
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
    const name = typeof unit.name === "string" && unit.name.trim() ? unit.name : unit.id;
    list.push({
      id: unit.id,
      name,
      shortName: shortUnitName(name),
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
  if (input == null || input === "all") return { ok: true, selection: ALL };
  if (typeof input !== "object") return { ok: false, error: "invalid_selection" };
  if (input.all === true || input.unitIds === "all") {
    return { ok: true, selection: ALL };
  }
  if (Array.isArray(input.unitIds)) {
    const unitIds = [];
    for (const id of input.unitIds) {
      if (typeof id === "string" && id.length > 0 && !unitIds.includes(id)) unitIds.push(id);
    }
    if (unitIds.length === 0) {
      return { ok: true, selection: ALL };
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
    if (doc.querySelector?.('link[href$="command-panel.css"]')) return;
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
