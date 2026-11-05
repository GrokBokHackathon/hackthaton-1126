// Frame, fog, and connection readout. Off unless the page is opened with ?debug=1.
// The readout never accepts pointer hits, including when it is visible.

export function debugOverlayEnabled(search) {
  const raw = typeof search === "string" ? search : "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  return params.get("debug") === "1";
}

export function applyDebugOverlay(root, enabled) {
  if (!root || typeof root.setAttribute !== "function") return false;
  const on = enabled === true;
  root.setAttribute("data-debug-overlay", on ? "on" : "off");
  return on;
}
