import { CONFIG, drawBase, drawFlag, drawPlayer, drawTile } from "./assets.js";
import {
  boundsFromMap,
  cameraForViewport,
  cameraTransform,
  mountCameraInput,
  paintUnitOverlay,
  renderUnitOverlay,
  updateCamera,
  worldToScreen,
} from "./commander/index.js";
import { applyCommandPanelShell, mountCommandPanel } from "./command-panel.js";
import {
  panelPatchFromCommandMessage,
  commandTargetFromScreen,
  commandTargetMeta,
  describeFog,
  drawableFlags,
  fogLabel,
  forwardCommand,
  mapPingsFromState,
  orderSelectionForUnit,
  presentationFromUnits,
  unitsFromState,
} from "./commander/live-hook.js";
import { applyDebugOverlay, debugOverlayEnabled } from "./commander/debug-overlay.js";
import {
  LAST_TEAM_KEY,
  joinMessage,
  normalizeTeamId,
  scoreText,
  teamFromSearch,
  teamLabel,
  winnerText,
} from "./commander/team-pick.js";
import { drawFog } from "./fog.js";
import { roundHudFromState } from "./commander/round-hud.js";
import {
  atlasPivotForFrame,
  characterDestRect,
  characterFrameName,
  drawLoadedFrame,
  terrainDestRect,
  terrainFrameName,
} from "./commander/supplied-art.js";
import { spriteLoader } from "./spriteLoader.js";

export class Game {
  constructor(canvasId, serverOrigin) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");

    this.serverOrigin = serverOrigin;
    this.ws = null;
    this.reconnectAttempt = 0;
    this.stopped = false;

    this.playerId = null;
    this.team = null;
    this.desiredTeam = null;
    this.playerName = "Player" + Math.floor(Math.random() * 1000);
    this.map = null;
    this.state = null;
    this.score = { red: 0, bot: 0 };
    this.phase = "waiting";

    this.camera = null;
    this.bounds = null;
    this.frameCounts = {};
    this.linkState = "idle";
    this.artProof = emptyArtProof();
    this.commandPanel = null;
    this.orderRoster = null;
    this.sentCommands = [];
    this.shellLayout = null;

    this.spritesLoaded = false;

    this.unmountCamera = mountCameraInput(this.canvas, (gesture) => this.onCameraGesture(gesture), {
      getContext: () => ({
        units: unitsFromState(this.state).units,
        cameraState: this.camera,
        bounds: this.bounds,
      }),
    });

    this.setupCanvas();
    this.loadSprites();
  }
  
  async loadSprites() {
    this.spritesLoaded = await spriteLoader.load();
    if (!this.spritesLoaded) {
      console.warn("Failed to load sprites, using fallback rendering");
    }
    // Expose for testing
    if (typeof window !== "undefined") {
      window.spritesLoaded = this.spritesLoaded;
    }
  }

  setupCanvas() {
    const resize = () => {
      const container = document.getElementById("container");
      const maxWidth = container ? container.clientWidth : 0;
      const maxHeight = container ? container.clientHeight : 0;
      if (this.map && maxWidth > 0 && maxHeight > 0) {
        this.canvas.width = maxWidth;
        this.canvas.height = maxHeight;
        this.syncCamera(maxWidth, maxHeight);
      } else if (!this.map) {
        this.canvas.width = 800;
        this.canvas.height = 600;
      }
    };

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 100));
    resize();
  }

  syncCamera(width, height) {
    if (!this.map) return;
    this.bounds = boundsFromMap(this.map, CONFIG.tileSize);
    this.camera = cameraForViewport(this.camera, {
      width,
      height,
      bounds: this.bounds,
      map: this.map,
      team: this.team,
      tileSize: CONFIG.tileSize,
    });
  }

  onCameraGesture(gesture) {
    if (gesture.cameraInput && this.camera && this.bounds) {
      this.camera = updateCamera(this.camera, gesture.cameraInput, 0, this.bounds);
    }
    if (gesture.gesture !== "tap" || !this.commandPanel) return;
    // An armed order owns every map tap, including taps on top of a unit:
    // Tag and Escort are usually aimed at someone.
    if (this.commandPanel.getViewModel().step === "target") {
      this.offerMapTarget(gesture.x, gesture.y);
      return;
    }
    if (gesture.unitId && this.selectForOrder(gesture.unitId)) return;
    this.commandPanel.hint("Pick an order first, then tap the map. Tap one of your bots to order only that bot.");
  }

  selectForOrder(unitId) {
    const selection = orderSelectionForUnit(unitId, this.orderRoster);
    if (!selection || !this.commandPanel) return false;
    this.commandPanel.toggleUnit(unitId);
    return true;
  }

  /** Ids that get a selection ring: the picked bots, or the whole squad for All. */
  selectedUnitIds() {
    const view = this.commandPanel?.getViewModel?.();
    if (!view) return [];
    if (view.selection.kind === "units") return view.selection.unitIds;
    return view.units.list.filter((unit) => unit.selectable !== false).map((unit) => unit.id);
  }

  onPanelChange(view) {
    if (this.canvas) this.canvas.dataset.armed = view.step === "target" ? "true" : "false";
  }

  onKeyDown(event) {
    if (!this.commandPanel || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.key === "Escape") {
      this.commandPanel.cancelOrder();
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      const order = this.commandPanel.getViewModel().orderButtons[Number(event.key) - 1];
      if (order) this.commandPanel.chooseOrder(order.id);
    }
  }

  offerMapTarget(screenX, screenY) {
    if (!this.commandPanel) return;
    const target = commandTargetFromScreen(this.camera, this.bounds, screenX, screenY);
    if (!target) return;
    const orderId = this.commandPanel.getViewModel?.().orderId;
    const fog = this.state && this.state.fog;
    const meta = commandTargetMeta(fog, orderId, target);
    this.commandPanel.setTarget(target, meta);
  }

  deliverCommand(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  sendCommand(payload) {
    const result = forwardCommand(payload, (message) => this.deliverCommand(message));
    if (!result.sent) return false;
    this.sentCommands.push(payload);
    return true;
  }

  bindCommandShell(shell) {
    if (this.shellLayout || !shell) return;
    const apply = () => applyCommandPanelShell(shell, "auto");
    this.shellLayout = apply;
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
  }

  mountCommandPanel() {
    if (this.commandPanel) return;
    const shell = document.getElementById("command-shell");
    const dock = document.getElementById("command-dock");
    if (!shell || !dock) return;
    this.bindCommandShell(shell);
    this.commandPanel = mountCommandPanel(dock, {
      onCommand: (payload) => this.sendCommand(payload),
      onChange: (view) => this.onPanelChange(view),
      layout: "auto",
    });
  }

  remountCommandPanel() {
    this.commandPanel?.destroy?.();
    this.commandPanel = null;
    this.orderRoster = null;
    this.lastCommandPatch = null;
    this.lastCommandResult = null;
    this.mountCommandPanel();
  }

  /** Join (or switch to) a team. Only `red` and `bot` are sent; the server rejects anything else. */
  joinTeam(team) {
    const next = normalizeTeamId(team);
    if (!next) return false;
    try {
      window.localStorage?.setItem(LAST_TEAM_KEY, next);
    } catch {
      // Private mode can refuse storage. The choice still applies to this tab.
    }
    this.hideTeamPicker();
    if (this.desiredTeam === next && this.playerId) return true;
    const switching = this.playerId != null || this.ws != null;
    this.desiredTeam = next;
    this.playerId = null;
    this.team = null;
    this.map = null;
    this.state = null;
    this.camera = null;
    this.bounds = null;
    this.sentCommands = [];
    this.publishTeam();
    if (switching) this.remountCommandPanel();
    this.reconnectNow();
    return true;
  }

  reconnectNow() {
    const old = this.ws;
    this.ws = null;
    if (old) {
      try {
        old.close();
      } catch {
        // Already closing.
      }
    }
    this.reconnectAttempt = 0;
    this.connect();
  }

  bindTeamPicker() {
    const pick = document.getElementById("team-pick");
    if (pick && !pick.dataset.bound) {
      pick.dataset.bound = "true";
      pick.addEventListener("click", (event) => {
        const button = event.target.closest?.("[data-team]");
        if (button && pick.contains(button)) this.joinTeam(button.getAttribute("data-team"));
      });
    }
    const change = document.getElementById("switch-team");
    if (change && !change.dataset.bound) {
      change.dataset.bound = "true";
      change.addEventListener("click", () => this.showTeamPicker());
    }
  }

  showTeamPicker(error = "") {
    const pick = document.getElementById("team-pick");
    if (!pick) return;
    let last = null;
    try {
      last = normalizeTeamId(window.localStorage?.getItem(LAST_TEAM_KEY));
    } catch {
      last = null;
    }
    const current = this.desiredTeam || last;
    for (const button of pick.querySelectorAll("[data-team]")) {
      button.dataset.last = button.getAttribute("data-team") === current ? "true" : "false";
    }
    const errorEl = document.getElementById("pick-error");
    if (errorEl) errorEl.textContent = error;
    pick.hidden = false;
    const focus = pick.querySelector(`[data-team="${current || "red"}"]`);
    focus?.focus?.();
  }

  hideTeamPicker() {
    const pick = document.getElementById("team-pick");
    if (pick) pick.hidden = true;
  }

  publishTeam() {
    const badge = document.getElementById("team-badge");
    const name = document.getElementById("team-name");
    const team = this.team || this.desiredTeam;
    if (badge) {
      badge.hidden = !team;
      if (team) badge.dataset.team = team;
    }
    if (name) name.textContent = team ? `${teamLabel(team)} team` : "";
    this.updateScore();
  }

  screenPoint(worldX, worldY) {
    if (!this.camera || !this.bounds) return null;
    return worldToScreen(this.camera, this.bounds, worldX, worldY);
  }

  noteFrame(type) {
    this.frameCounts[type] = (this.frameCounts[type] || 0) + 1;
    const el = document.getElementById("frames");
    if (!el) return;
    el.textContent = "Frames: " + Object.entries(this.frameCounts).map(([name, count]) => `${name}:${count}`).join(" ");
  }

  connect() {
    if (this.stopped) return;

    const wsUrl = this.serverOrigin.replace(/^http/, "ws") + "/ws";
    this.linkState = "connecting";
    this.updateStatus("Connecting to " + wsUrl);

    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    const current = () => this.ws === ws;

    ws.addEventListener("open", () => {
      if (!current()) return;
      this.reconnectAttempt = 0;
      this.linkState = "open";
      this.noteFrame("open");
      this.updateStatus("Connected");
      const join = joinMessage({ name: this.playerName, team: this.desiredTeam });
      if (join) this.send(join);
    });

    ws.addEventListener("message", (event) => {
      if (!current()) return;
      try {
        const msg = JSON.parse(event.data);
        this.noteFrame(msg.type || "unknown");
        this.handleMessage(msg);
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    });

    ws.addEventListener("close", () => {
      if (!current()) return;
      this.linkState = "closed";
      this.noteFrame("close");
      this.playerId = null;
      this.commandPanel?.cancelPendingTransport?.();
      if (this.stopped) return;
      this.reconnectAttempt++;
      const wait = Math.min(5000, 500 * this.reconnectAttempt);
      this.updateStatus(`Disconnected. Reconnecting in ${wait}ms`);
      setTimeout(() => {
        if (current()) this.connect();
      }, wait);
    });

    ws.addEventListener("error", (err) => {
      if (!current()) return;
      this.linkState = "error";
      this.noteFrame("error");
      console.error("WebSocket error:", err);
    });
  }

  handleMessage(msg) {
    if (msg.type === "hello") {
      // Server ready
    } else if (msg.type === "welcome") {
      this.playerId = msg.playerId;
      this.team = msg.team;
      this.map = msg.map;
      // Fresh join: open on this team's base, not wherever the last team was.
      this.camera = null;
      this.setupCanvas();
      this.publishTeam();
      this.commandPanel?.update({ team: { id: msg.team, label: teamLabel(msg.team) || msg.team } });
      this.updateStatus(`Joined as ${this.team} team`);
    } else if (msg.type === "join_rejected") {
      this.updateStatus(`Join rejected: ${msg.reason}`);
      if (msg.reason === "invalid_team") {
        this.desiredTeam = null;
        this.publishTeam();
        this.showTeamPicker("The server did not accept that team. Pick Red or Bot.");
      }
    } else if (msg.type === "state") {
      this.state = msg;
      this.score = msg.score;
      this.phase = msg.phase;
      this.updateScore();
      this.publishRound(roundHudFromState(msg));
    } else if (msg.type === "command_view" || msg.type === "command_ack" || msg.type === "command_rejected") {
      const patch = panelPatchFromCommandMessage(msg);
      this.lastCommandPatch = patch;
      if (patch && Array.isArray(patch.units)) this.orderRoster = patch.units;
      if (patch?.commandResult) this.lastCommandResult = patch.commandResult;
      if (patch) this.commandPanel?.update(patch);
    } else if (msg.type === "scored") {
      this.score = msg.score;
      this.updateScore();
    } else if (msg.type === "matchEnd") {
      this.updateStatus(winnerText(msg.winner, this.team));
    } else if (msg.type === "newMap") {
      this.map = msg.map;
      this.camera = null;
      this.setupCanvas();
      this.updateStatus("New round started!");
    } else if (msg.type === "heartbeat") {
      // Keep alive
    } else if (msg.type === "pong") {
      // Response to ping
    }
  }

  updateScore() {
    const scoreEl = document.getElementById("score");
    if (scoreEl) scoreEl.textContent = scoreText(this.score, this.team);
  }

  updateStatus(text) {
    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.textContent = text;
  }

  publishRound(hud) {
    const el = document.getElementById("round");
    if (!el || !hud) return;
    el.textContent = hud.text;
    el.hidden = !hud.visible;
  }

  publishFog(description) {
    const el = document.getElementById("fog");
    if (el) el.textContent = fogLabel(description);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  render() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);

    if (!this.map || !this.state || !this.camera || !this.bounds) {
      ctx.fillStyle = "#fff";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.desiredTeam ? "Waiting for game..." : "Choose a team to join", width / 2, height / 2);
      this.publishFog(describeFog(this.state));
      return;
    }

    const proof = emptyArtProof();
    const time = Date.now();
    const world = cameraTransform(this.camera, this.bounds);

    ctx.save();
    ctx.imageSmoothingEnabled = world.smoothing;
    ctx.translate(world.offsetX, world.offsetY);
    ctx.scale(world.zoom, world.zoom);

    this.drawTerrain(ctx, proof);
    this.drawBases(ctx, proof);

    let fog = describeFog(this.state);
    if (fog.availability === "data-present") {
      drawFog(ctx, this.state.fog, CONFIG.tileSize);
      fog = {
        ...fog,
        availability: "applied",
        applied: true,
        secure: false,
        reason: "Snapshot masks were painted in world pixels. Units still come only from state.players.",
      };
    }

    const roster = unitsFromState(this.state);
    this.drawFlags(ctx, time, proof);
    this.drawUnits(ctx, time, proof);
    const overlay = renderUnitOverlay({
      nowMs: time,
      viewerTeam: this.team,
      selectedUnitIds: this.selectedUnitIds(),
      units: roster.units,
      presentation: presentationFromUnits(roster.units),
      mapPings: mapPingsFromState(this.state),
      camera: this.camera,
      bounds: this.bounds,
    });
    paintUnitOverlay(ctx, overlay.markers, (context, frame, x, y, w, h) => {
      const sprite = spriteLoader.getSprite(frame);
      if (!sprite) return false;
      context.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h, x, y, w, h);
      return true;
    });

    ctx.restore();
    this.artProof = proof;
    this.publishFog(fog);
  }

  drawTerrain(ctx, proof) {
    const tiles = this.map.tiles;
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = tiles[y][x];
        const frameName = terrainFrameName(tile, x, y, tiles);
        let drawn = false;
        if (frameName && spriteLoader.loaded) {
          const sprite = spriteLoader.getSprite(frameName);
          if (sprite) {
            const dest = terrainDestRect(x, y, sprite.w, sprite.h, CONFIG.tileSize);
            const result = drawLoadedFrame(ctx, spriteLoader, frameName, dest);
            drawn = result.drawn;
            if (drawn) proof.terrainFrames[frameName] = (proof.terrainFrames[frameName] || 0) + 1;
          }
        }
        if (!drawn) {
          proof.fallbackTiles += 1;
          drawTile(ctx, tile, x * CONFIG.tileSize, y * CONFIG.tileSize, tiles);
        }
      }
    }
  }

  drawBases(ctx, proof) {
    for (const team of ["red", "bot"]) {
      const base = this.map.bases && this.map.bases[team];
      if (!base) continue;
      const frameName = `base_${team}`;
      const sprite = spriteLoader.loaded ? spriteLoader.getSprite(frameName) : null;
      if (!sprite) {
        drawBase(ctx, base, team);
        continue;
      }
      const dest = {
        x: (base.x - 1) * CONFIG.tileSize,
        y: (base.y - 1) * CONFIG.tileSize,
        w: sprite.w,
        h: sprite.h,
      };
      const result = drawLoadedFrame(ctx, spriteLoader, frameName, dest);
      if (result.drawn) proof.bases += 1;
      else drawBase(ctx, base, team);
    }
  }

  drawFlags(ctx, time, proof) {
    for (const { team, flag } of drawableFlags(this.state && this.state.flags)) {
      if (flag.carrier) continue;
      const frameName = `flag_${team}_${Math.floor(time / 250) % 2}`;
      const sprite = spriteLoader.loaded ? spriteLoader.getSprite(frameName) : null;
      if (!sprite) {
        drawFlag(ctx, flag, team, time);
        continue;
      }
      const dest = {
        x: flag.x * CONFIG.tileSize - sprite.w / 2,
        y: flag.y * CONFIG.tileSize - sprite.h / 2,
        w: sprite.w,
        h: sprite.h,
      };
      const result = drawLoadedFrame(ctx, spriteLoader, frameName, dest);
      if (result.drawn) proof.flags += 1;
      else drawFlag(ctx, flag, team, time);
    }
  }

  drawUnits(ctx, time, proof) {
    const roster = unitsFromState(this.state);
    for (const player of roster.units) {
      const frameName = characterFrameName(player, time);
      const pivot = spriteLoader.loaded ? atlasPivotForFrame(spriteLoader.atlas, frameName) : null;
      const sprite = spriteLoader.loaded ? spriteLoader.getSprite(frameName, player.team) : null;
      const dest = sprite && pivot
        ? characterDestRect(player.x, player.y, sprite.w, sprite.h, pivot, CONFIG.tileSize)
        : null;
      const result = dest
        ? drawLoadedFrame(ctx, spriteLoader, frameName, dest, player.team)
        : { drawn: false, frameName };
      if (!result.drawn) drawPlayer(ctx, player, time, false);
      if (!proof.character) {
        proof.character = {
          id: player.id,
          key: frameName,
          drawn: result.drawn,
          pivot: pivot ? { x: pivot.x, y: pivot.y } : null,
          w: sprite ? sprite.w : null,
          h: sprite ? sprite.h : null,
        };
      }
    }
  }

  start() {
    const search = typeof location !== "undefined" ? location.search : "";
    applyDebugOverlay(typeof document !== "undefined" ? document.body : null, debugOverlayEnabled(search));
    this.mountCommandPanel();
    this.bindTeamPicker();
    this.onKey = (event) => this.onKeyDown(event);
    window.addEventListener("keydown", this.onKey);
    const linked = teamFromSearch(search);
    if (linked) this.joinTeam(linked);
    else this.showTeamPicker();
    const loop = () => {
      if (this.stopped) return;
      this.render();
      requestAnimationFrame(loop);
    };
    loop();
  }

  destroy() {
    this.stopped = true;
    this.unmountCamera?.();
    this.unmountCamera = null;
    this.commandPanel?.destroy?.();
    this.commandPanel = null;
    if (this.onKey) window.removeEventListener("keydown", this.onKey);
    this.onKey = null;
    if (this.shellLayout) {
      window.removeEventListener("resize", this.shellLayout);
      window.removeEventListener("orientationchange", this.shellLayout);
      this.shellLayout = null;
    }
    if (this.ws) this.ws.close();
  }
}

function emptyArtProof() {
  return {
    character: null,
    terrainFrames: {},
    fallbackTiles: 0,
    bases: 0,
    flags: 0,
    treeDrawn: 0,
  };
}
