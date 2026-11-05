import http from "node:http";
import { WebSocketServer } from "ws";
import { Match } from "./game.js";

const port = Number(process.env.PORT || 8080);
const host = "0.0.0.0";
const heartbeatMs = 20_000;
const TICK_MS = 50; // 20 Hz

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
    });
    res.end();
    return;
  }

  if (req.method !== "GET") {
    writeJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  if (url.pathname === "/health") {
    writeJson(res, 200, {
      ok: true,
      service: "flag-raid",
      role: "realtime-game-server",
      websocket: "/ws",
      players: match.players.size,
      phase: match.phase,
    });
    return;
  }

  writeJson(res, 404, { ok: false, error: "not_found" });
});

// Game state
const match = new Match();
const clients = new Map(); // playerId -> ws

const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(message, exclude = null) {
  const payload = JSON.stringify(message);
  for (const [id, ws] of clients.entries()) {
    if (ws !== exclude && ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

function sendTo(playerId, message) {
  const ws = clients.get(playerId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

wss.on("connection", (ws) => {
  let playerId = null;
  let heartbeatTimer = null;

  ws.send(
    JSON.stringify({
      type: "hello",
      service: "flag-raid",
      heartbeatMs,
    })
  );

  function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
      if (ws.readyState !== ws.OPEN) {
        return;
      }
      ws.ping();
      ws.send(JSON.stringify({ type: "heartbeat" }));
    }, heartbeatMs);
  }

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      if (playerId) return; // Already joined

      const name = String(msg.name || "Player").slice(0, 20);
      const kind = msg.kind === "bot" ? "bot" : "human";
      playerId = match.addPlayer(playerId || Date.now().toString(36) + Math.random().toString(36).slice(2), name, kind).id;
      clients.set(playerId, ws);

      sendTo(playerId, {
        type: "welcome",
        playerId,
        team: match.players.get(playerId).team,
        map: match.getMapData(),
      });

      startHeartbeat();
    } else if (msg.type === "input" && playerId) {
      const dx = Number(msg.dx) || 0;
      const dy = Number(msg.dy) || 0;
      match.setInput(playerId, dx, dy);
    } else if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    }
  });

  const cleanup = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (playerId) {
      clients.delete(playerId);
      match.removePlayer(playerId);
    }
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

// Game loop
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  const events = match.tick(dt);

  // Broadcast events
  for (const event of events) {
    broadcast(event);
  }

  // Broadcast state
  if (match.phase === "playing" || match.phase === "waiting") {
    broadcast(match.getState());
  }
}, TICK_MS);

server.listen(port, host, () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  console.log(`flag-raid listening on ${boundPort}`);
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
