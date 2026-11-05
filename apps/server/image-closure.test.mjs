import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const dockerfilePath = path.join(repoRoot, "apps/server/Dockerfile");

function parseCopies(text) {
  const copies = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line.startsWith("COPY ")) continue;
    const parts = line.slice(5).trim().split(/\s+/);
    const dest = parts.pop();
    copies.push({ sources: parts, dest });
  }
  return copies;
}

function localImports(filePath) {
  const text = readFileSync(filePath, "utf8");
  const specs = [];
  for (const match of text.matchAll(/from\s+["'](\.\/[^"']+)["']/g)) {
    specs.push(match[1].endsWith(".js") ? match[1] : `${match[1]}.js`);
  }
  return specs;
}

function importClosure(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const filePath = path.join(repoRoot, "apps/server", name);
    for (const spec of localImports(filePath)) {
      queue.push(spec.slice(2));
    }
  }
  return seen;
}

function copiedAppFiles(copies) {
  const names = new Set();
  for (const { sources, dest } of copies) {
    if (dest !== "./" && dest !== ".") continue;
    for (const source of sources) {
      if (source.endsWith(".js")) names.add(path.basename(source));
    }
  }
  return names;
}

function applyCopies(copies, destDir) {
  for (const { sources, dest } of copies) {
    const intoDir = dest === "./" || dest === ".";
    if (sources.length === 1 && !intoDir) {
      const target = path.resolve(destDir, dest);
      cpSync(path.resolve(repoRoot, sources[0]), target, { recursive: true, dereference: true });
      continue;
    }
    for (const source of sources) {
      const target = path.join(destDir, path.basename(source));
      cpSync(path.resolve(repoRoot, source), target, { recursive: true, dereference: true });
    }
  }
}

test("Dockerfile COPY includes every relative import from server.js", () => {
  const copies = parseCopies(readFileSync(dockerfilePath, "utf8"));
  const copied = copiedAppFiles(copies);
  const needed = importClosure("server.js");
  for (const name of needed) {
    assert.ok(copied.has(name), `image COPY is missing runtime import ${name}`);
  }
  assert.ok(needed.has("match-lifecycle.js"));
  assert.ok(needed.has("lobby-router.js"));
  assert.ok(needed.has("lobby.js"));
});

test("the exact COPY layout boots and answers health plus a join", async () => {
  const copies = parseCopies(readFileSync(dockerfilePath, "utf8"));
  const destDir = mkdtempSync(path.join(tmpdir(), "flag-raid-image-"));
  const childEnv = { ...process.env, PORT: "0" };
  let child;
  try {
    applyCopies(copies, destDir);
    const install = spawnSync("npm", ["ci", "--omit=dev"], { cwd: destDir, encoding: "utf8" });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    child = spawn(process.execPath, ["server.js"], {
      cwd: destDir,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(output)), 8000);
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        const found = output.match(/listening on (\d+)/);
        if (found) {
          clearTimeout(timer);
          resolve(Number(found[1]));
        }
      });
      child.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.on("exit", (code) => {
        if (!output.includes("listening on")) reject(new Error(`exited ${code}\n${output}`));
      });
    });
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const frames = [];
    ws.addEventListener("message", (event) => frames.push(JSON.parse(String(event.data))));
    await once(ws, "open");
    const hello = await waitType(frames, "hello");
    assert.equal(hello.service, "flag-raid");
    ws.send(JSON.stringify({ type: "join", name: "Image", kind: "human" }));
    const welcome = await waitType(frames, "welcome");
    assert.equal(welcome.team, "red");
    const state = await waitType(frames, "state");
    assert.equal(state.type, "state");
    assert.ok(state.players.some((player) => player.id === welcome.playerId));
    ws.close();
    await once(ws, "close");
  } finally {
    if (child) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    rmSync(destDir, { recursive: true, force: true });
  }
});

function waitType(frames, type) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = frames.find((frame) => frame.type === type);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() - started > 4000) {
        reject(new Error(`no ${type}`));
        return;
      }
      setTimeout(check, 15);
    };
    check();
  });
}
