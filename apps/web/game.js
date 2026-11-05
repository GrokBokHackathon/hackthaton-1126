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
  authoritativeSeat,
  clearRoomSession,
  loadRoomSession,
  openingMap,
  publicRoomBoard,
  roomErrorClearsSession,
  roomErrorHoldsSocket,
  roomErrorText,
  roomJoinMessage,
  roomQuery,
  saveRoomSession,
} from "./commander/room-session.js";
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
  constructor(canvasId, serverOrigin, options = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");

    this.serverOrigin = serverOrigin;
    this.ws = null;
    this.reconnectAttempt = 0;
    this.stopped = false;

    const search = options.search ?? (typeof location !== "undefined" ? location.search : "");
    this.room = roomQuery(search);
    this.roomMode = Boolean(this.room);
    this.roomStorage = options.storage ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    this.roomSeat = null;
    this.roomId = this.room ? this.room.roomId : null;
    this.mapSeed = null;
    this.roomBoard = null;
    this.roomHold = false;
    this.outboundTypes = [];

    this.playerId = null;
    this.team = null;
    this.map = null;
    this.state = null;
    this.score = { red: 0, bot: 0 };
    this.phase = "waiting";

    this.camera = null;
    this.bounds = null;
    this.selectedUnitId = null;
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
    if (gesture.gesture === "center-on-unit" && gesture.unitId) {
      this.selectedUnitId = gesture.unitId;
      this.selectForOrder(gesture.unitId);
    } else if (gesture.gesture === "tap") {
      if (gesture.unitId) {
        this.selectedUnitId = gesture.unitId;
        this.selectForOrder(gesture.unitId);
      } else {
        this.selectedUnitId = null;
        this.offerMapTarget(gesture.x, gesture.y);
      }
    }
  }

  selectForOrder(unitId) {
    const selection = orderSelectionForUnit(unitId, this.orderRoster);
    if (!selection || !this.commandPanel) return false;
    this.commandPanel.setSelection(selection);
    return true;
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
      layout: "auto",
    });
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

    this.ws = new WebSocket(wsUrl);

    this.ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.linkState = "open";
      this.noteFrame("open");
      this.updateStatus("Connected");
      if (this.roomMode) {
        const saved = loadRoomSession(this.roomStorage, this.room.roomId);
        const message = roomJoinMessage(this.room.roomId, saved);
        if (message) this.send(message);
        this.updateStatus("Joining room");
        return;
      }
      this.send({
        type: "join",
        name: "Player" + Math.floor(Math.random() * 1000),
        kind: "human",
      });
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.noteFrame(msg.type || "unknown");
        this.handleMessage(msg);
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    });

    this.ws.addEventListener("close", () => {
      this.linkState = "closed";
      this.noteFrame("close");
      this.commandPanel?.cancelPendingTransport?.();
      if (this.stopped || this.roomHold) return;
      this.reconnectAttempt++;
      const wait = Math.min(5000, 500 * this.reconnectAttempt);
      this.updateStatus(`Disconnected. Reconnecting in ${wait}ms`);
      setTimeout(() => this.connect(), wait);
    });

    this.ws.addEventListener("error", (err) => {
      this.linkState = "error";
      this.noteFrame("error");
      console.error("WebSocket error:", err);
    });
  }

  handleMessage(msg) {
    if (msg.type === "hello") {
      // Server ready
    } else if (msg.type === "room_welcome") {
      this.admitRoom(msg);
    } else if (msg.type === "room_state") {
      const board = publicRoomBoard(msg);
      if (!board) return;
      this.roomBoard = board;
      if (board.mapSeed != null) this.mapSeed = board.mapSeed;
    } else if (msg.type === "room_error") {
      this.holdRoom(msg.error);
    } else if (msg.type === "join_rejected" && msg.reason === "already_seated") {
      this.holdRoom("already_seated");
    } else if (msg.type === "welcome") {
      if (this.roomMode) return;
      this.playerId = msg.playerId;
      this.team = msg.team;
      this.map = msg.map;
      this.setupCanvas();
      this.updateStatus(`Joined as ${this.team} team`);
    } else if (msg.type === "state") {
      this.state = msg;
      this.score = msg.score;
      this.phase = msg.phase;
      this.updateScore();
      this.publishRound(roundHudFromState(msg));
      if (this.roomMode) this.ensureRoomMap(msg);
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
      this.updateStatus(`${msg.winner} team wins! New round starting...`);
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
    if (scoreEl) scoreEl.textContent = `Red ${this.score.red} - ${this.score.bot} Bot`;
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

  admitRoom(message) {
    if (!this.roomMode) return;
    const seat = authoritativeSeat(message);
    if (!seat) return;
    this.team = seat.team;
    this.roomSeat = seat.seat;
    this.roomId = seat.roomId;
    if (seat.mapSeed != null) this.mapSeed = seat.mapSeed;
    saveRoomSession(this.roomStorage, message);
    this.roomHold = false;
    this.updateStatus(`Commander seat ${seat.seat} · ${seat.team}`);
    if (this.state) this.ensureRoomMap(this.state);
  }

  holdRoom(error) {
    this.updateStatus(roomErrorText(error));
    if (roomErrorClearsSession(error)) clearRoomSession(this.roomStorage);
    if (roomErrorHoldsSocket(error)) this.roomHold = true;
  }

  ensureRoomMap(snapshot) {
    if (!this.roomMode || !this.team || (this.map && Array.isArray(this.map.tiles))) return;
    if (this.map) return;
    const shell = openingMap({ ...snapshot, mapSeed: snapshot.mapSeed ?? this.mapSeed }, this.team);
    if (!shell) return;
    this.map = shell;
    this.setupCanvas();
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (msg && msg.type) this.outboundTypes.push(msg.type);
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
      ctx.fillText("Waiting for game...", width / 2, height / 2);
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
    if (this.selectedUnitId != null && !roster.units.some((unit) => unit && unit.id === this.selectedUnitId)) {
      this.selectedUnitId = null;
    }
    this.drawFlags(ctx, time, proof);
    this.drawUnits(ctx, time, proof);
    const overlay = renderUnitOverlay({
      nowMs: time,
      viewerTeam: this.team,
      selectedUnitId: this.selectedUnitId,
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
    if (!Array.isArray(tiles)) {
      proof.tilesPending = true;
      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          proof.fallbackTiles += 1;
          drawTile(ctx, 0, x * CONFIG.tileSize, y * CONFIG.tileSize);
        }
      }
      return;
    }
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
    this.connect();
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
