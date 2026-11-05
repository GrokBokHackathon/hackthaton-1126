import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { applyDebugOverlay, debugOverlayEnabled } from "./commander/debug-overlay.js";

test("the debug readout is off unless debug=1", () => {
  assert.equal(debugOverlayEnabled(""), false);
  assert.equal(debugOverlayEnabled("?"), false);
  assert.equal(debugOverlayEnabled("?debug=0"), false);
  assert.equal(debugOverlayEnabled("?debug=true"), false);
  assert.equal(debugOverlayEnabled("?room=AB2K&commander=1"), false);
  assert.equal(debugOverlayEnabled("?debug=1"), true);
  assert.equal(debugOverlayEnabled("debug=1"), true);
});

test("applyDebugOverlay writes on or off and does not invent a hit target", () => {
  const attrs = new Map();
  const root = {
    setAttribute(name, value) { attrs.set(name, value); },
  };
  assert.equal(applyDebugOverlay(root, false), false);
  assert.equal(attrs.get("data-debug-overlay"), "off");
  assert.equal(applyDebugOverlay(root, true), true);
  assert.equal(attrs.get("data-debug-overlay"), "on");
  assert.equal(applyDebugOverlay(null, true), false);
});

test("production markup hides the readout and never lets it take pointer hits", () => {
  const html = fs.readFileSync(new URL("./game.html", import.meta.url), "utf8");
  const game = fs.readFileSync(new URL("./game.js", import.meta.url), "utf8");
  assert.match(html, /#ui\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(html, /#status,\s*#fog,\s*#frames\s*\{[^}]*display:\s*none/s);
  assert.match(html, /#status,\s*#fog,\s*#frames\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(html, /data-debug-overlay="on"[^}]*#frames\s*\{[^}]*pointer-events:\s*none/s);
  assert.equal(html.includes('data-debug-overlay="on"'), true);
  assert.doesNotMatch(html, /<body[^>]*data-debug-overlay="on"/);
  assert.match(game, /applyDebugOverlay/);
  assert.match(game, /debugOverlayEnabled/);
  assert.equal(game.includes('type: "input"'), false);
});
