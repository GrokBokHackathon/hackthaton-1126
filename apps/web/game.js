import { CONFIG, drawTile, drawPlayer, drawFlag, drawBase } from "./assets.js";

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
    this.map = null;
    this.state = null;
    this.score = { red: 0, bot: 0 };
    this.phase = "waiting";

    this.keys = new Set();
    this.lastInputDx = 0;
    this.lastInputDy = 0;
    
    // Touch controls
    this.touchDx = 0;
    this.touchDy = 0;
    this.touchActive = false;

    this.zoom = 2;
    this.useSmoothing = false;

    this.setupInput();
    this.setupTouch();
    this.setupCanvas();
  }

  setupCanvas() {
    const resize = () => {
      const container = document.getElementById("container");
      const maxWidth = container.clientWidth;
      const maxHeight = container.clientHeight;
      
      if (this.map) {
        // Calculate zoom: shortSidePx / (16 * 32)
        const shortSide = Math.min(maxWidth, maxHeight);
        const targetZoom = shortSide / (16 * CONFIG.tileSize);
        
        if (targetZoom >= 2) {
          // Use whole-number zoom with nearest-neighbour
          this.zoom = Math.floor(targetZoom);
          this.useSmoothing = false;
        } else {
          // Use fractional zoom with smoothing
          this.zoom = targetZoom;
          this.useSmoothing = true;
        }
        
        this.ctx.imageSmoothingEnabled = this.useSmoothing;
        
        // Canvas shows viewport
        this.canvas.width = maxWidth;
        this.canvas.height = maxHeight;
      } else {
        this.canvas.width = 800;
        this.canvas.height = 600;
      }
    };

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 100));
    resize();
  }
  
  setupTouch() {
    const joystick = document.getElementById("joystick");
    const stick = document.getElementById("joystick-stick");
    
    if (!joystick) return;
    
    let touchId = null;
    const maxRadius = 50;
    
    const handleTouch = (e) => {
      e.preventDefault();
      const rect = joystick.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const touch = e.touches[0] || e.changedTouches[0];
      
      const dx = touch.clientX - rect.left - centerX;
      const dy = touch.clientY - rect.top - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 0) {
        const clampedDist = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);
        const stickX = Math.cos(angle) * clampedDist;
        const stickY = Math.sin(angle) * clampedDist;
        
        stick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
        
        this.touchDx = dx / maxRadius;
        this.touchDy = dy / maxRadius;
        this.touchActive = true;
      }
    };
    
    const resetTouch = () => {
      stick.style.transform = 'translate(-50%, -50%)';
      this.touchDx = 0;
      this.touchDy = 0;
      this.touchActive = false;
      touchId = null;
    };
    
    joystick.addEventListener("touchstart", (e) => {
      if (touchId === null) {
        touchId = e.touches[0].identifier;
        handleTouch(e);
      }
    });
    
    joystick.addEventListener("touchmove", (e) => {
      if (touchId !== null) {
        handleTouch(e);
      }
    });
    
    joystick.addEventListener("touchend", (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === touchId) {
          resetTouch();
          break;
        }
      }
    });
    
    joystick.addEventListener("touchcancel", resetTouch);
  }

  setupInput() {
    window.addEventListener("keydown", (e) => {
      if (["w", "a", "s", "d", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        this.keys.add(e.key.toLowerCase());
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }

  getInput() {
    let dx = 0;
    let dy = 0;

    // Keyboard input
    if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
    
    // Touch input (override keyboard if active)
    if (this.touchActive) {
      dx = this.touchDx;
      dy = this.touchDy;
    }

    return { dx, dy };
  }

  sendInput() {
    const { dx, dy } = this.getInput();
    if (dx !== this.lastInputDx || dy !== this.lastInputDy) {
      this.lastInputDx = dx;
      this.lastInputDy = dy;
      this.send({ type: "input", dx, dy });
    }
  }

  connect() {
    if (this.stopped) return;

    const wsUrl = this.serverOrigin.replace(/^http/, "ws") + "/ws";
    this.updateStatus("Connecting to " + wsUrl);

    this.ws = new WebSocket(wsUrl);

    this.ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.updateStatus("Connected");
      
      // Join as human
      this.send({
        type: "join",
        name: "Player" + Math.floor(Math.random() * 1000),
        kind: "human",
      });
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    });

    this.ws.addEventListener("close", () => {
      if (this.stopped) return;
      this.reconnectAttempt++;
      const wait = Math.min(5000, 500 * this.reconnectAttempt);
      this.updateStatus(`Disconnected. Reconnecting in ${wait}ms`);
      setTimeout(() => this.connect(), wait);
    });

    this.ws.addEventListener("error", (err) => {
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
      this.setupCanvas();
      this.updateStatus(`Joined as ${this.team} team`);
    } else if (msg.type === "state") {
      this.state = msg;
      this.score = msg.score;
      this.phase = msg.phase;
      this.updateScore();
    } else if (msg.type === "scored") {
      this.score = msg.score;
      this.updateScore();
    } else if (msg.type === "matchEnd") {
      this.updateStatus(`${msg.winner} team wins! New round starting...`);
    } else if (msg.type === "newMap") {
      this.map = msg.map;
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
    scoreEl.textContent = `Red ${this.score.red} - ${this.score.bot} Bot`;
  }

  updateStatus(text) {
    const statusEl = document.getElementById("status");
    statusEl.textContent = text;
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

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);

    if (!this.map || !this.state) {
      ctx.fillStyle = "#fff";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for game...", width / 2, height / 2);
      return;
    }

    ctx.save();

    // Camera follows player
    const ownPlayer = this.state.players.find((p) => p.id === this.playerId);
    if (ownPlayer) {
      // Player position in world pixels
      const camX = ownPlayer.x * CONFIG.tileSize * this.zoom;
      const camY = ownPlayer.y * CONFIG.tileSize * this.zoom;
      
      // Center on player
      let offsetX = width / 2 - camX;
      let offsetY = height / 2 - camY;

      // Clamp camera to map bounds
      const mapWidth = this.map.width * CONFIG.tileSize * this.zoom;
      const mapHeight = this.map.height * CONFIG.tileSize * this.zoom;
      
      if (mapWidth > width) {
        offsetX = Math.min(0, Math.max(width - mapWidth, offsetX));
      } else {
        offsetX = (width - mapWidth) / 2;
      }
      
      if (mapHeight > height) {
        offsetY = Math.min(0, Math.max(height - mapHeight, offsetY));
      } else {
        offsetY = (height - mapHeight) / 2;
      }

      ctx.translate(offsetX, offsetY);
    }

    ctx.scale(this.zoom, this.zoom);

    // Draw map
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = this.map.tiles[y][x];
        drawTile(ctx, tile, x * CONFIG.tileSize, y * CONFIG.tileSize);
      }
    }

    // Draw bases
    drawBase(ctx, this.map.bases.red, "red");
    drawBase(ctx, this.map.bases.bot, "bot");

    // Draw flags
    drawFlag(ctx, this.state.flags.red, "red");
    drawFlag(ctx, this.state.flags.bot, "bot");

    // Draw players (own player last for highlight visibility)
    const time = Date.now();
    const otherPlayers = this.state.players.filter((p) => p.id !== this.playerId);
    const ownPlayerObj = this.state.players.find((p) => p.id === this.playerId);

    for (const player of otherPlayers) {
      drawPlayer(ctx, player, time, false);
    }

    if (ownPlayerObj) {
      drawPlayer(ctx, ownPlayerObj, time, true);
    }

    ctx.restore();
  }

  start() {
    this.connect();

    // Input loop
    setInterval(() => {
      if (this.playerId && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendInput();
      }
    }, 50);

    // Render loop
    const loop = () => {
      this.render();
      requestAnimationFrame(loop);
    };
    loop();
  }
}
