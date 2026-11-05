import { createReadStream } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8080);
const host = "0.0.0.0";
const heartbeatMs = 20_000;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

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
      service: "ctf-mock",
      role: "realtime-game-server",
      websocket: "/ws",
    });
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    createReadStream(path.join(publicDir, "index.html")).pipe(res);
    return;
  }

  writeJson(res, 404, { ok: false, error: "not_found" });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "hello",
      service: "ctf-mock",
      heartbeatMs,
    }),
  );

  const timer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) {
      return;
    }
    ws.ping();
    ws.send(JSON.stringify({ type: "heartbeat" }));
  }, heartbeatMs);

  ws.on("message", (data, isBinary) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data, { binary: isBinary });
    }
  });

  const stop = () => clearInterval(timer);
  ws.on("close", stop);
  ws.on("error", stop);
});

server.listen(port, host, () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  console.log(`listening on ${boundPort}`);
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
