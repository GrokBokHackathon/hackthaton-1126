import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";
import { WebSocket } from "ws";

function nextMessage(incoming, timeoutMs = 3000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (incoming.length > 0) {
        resolve(incoming.shift());
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("timed out waiting for a websocket message"));
        return;
      }
      setTimeout(check, 10);
    };
    check();
  });
}

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`server did not listen\n${output}`));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/listening on (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("exit", (code) => {
      if (!output.includes("listening on")) {
        reject(new Error(`server exited ${code}\n${output}`));
      }
    });
  });
  return { child, ready };
}

test("health endpoint and websocket game", async () => {
  const { child, ready } = startServer();
  try {
    const port = await ready;
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("access-control-allow-origin"), "*");
    const body = await health.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, "flag-raid");
    assert.equal(body.websocket, "/ws");

    const missing = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.equal(missing.status, 404);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const incoming = [];
    ws.on("message", (data) => incoming.push(String(data)));
    await once(ws, "open");
    
    const hello = JSON.parse(await nextMessage(incoming));
    assert.equal(hello.type, "hello");
    assert.equal(hello.service, "flag-raid");
    
    ws.send(JSON.stringify({ type: "join", name: "Test", kind: "human" }));
    const welcome = JSON.parse(await nextMessage(incoming));
    assert.equal(welcome.type, "welcome");
    assert.ok(welcome.playerId);
    assert.equal(welcome.team, "red");
    assert.ok(welcome.map);
    assert.ok(welcome.map.tiles);
    
    ws.close();
    await once(ws, "close");
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
});
