// Issue 12 headless probe: two live /ws sessions, a fresh snapshot, and
// same-identity reconnect. Issue 19 room routing is measured, not assumed.
// This file does not import lobby.js and does not change the server.
//
// Exit codes when run directly:
//   0  supported checks passed and same-identity reconnect and room routing answered
//   2  supported checks passed, and at least one capability is unsupported
//   1  a supported check failed, a token leaked into a public message, or the probe crashed

import { createRequire } from "node:module";
import { once } from "node:events";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/server/package.json", import.meta.url));
const { WebSocket } = require("ws");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(repoRoot, "apps", "server");
const PROBE_TOKEN_PREFIX = "issue12-probe-";
const OPEN_MS = 3000;
const MESSAGE_MS = 3000;
const STATE_MS = 2000;
const DIR_MS = 1500;
const LOBBY_QUIET_MS = 500;
const PRE_JOIN_QUIET_MS = 300;
const SERVER_READY_MS = 5000;
const STOP_MS = 3000;

function probeToken() {
  return `${PROBE_TOKEN_PREFIX}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function redactText(text, token) {
  const raw = String(text);
  const withoutToken = token ? raw.split(token).join("[redacted]") : raw;
  return withoutToken
    .replace(new RegExp(`${PROBE_TOKEN_PREFIX}[a-z0-9]+`, "gi"), "[redacted]")
    .replace(/"resumeToken"\s*:\s*"[^"]*"/g, '"resumeToken":"[redacted]"');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceWithTimeout(emitter, event, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([once(emitter, event), timeout]).finally(() => clearTimeout(timer));
}

function startServer() {
  const env = { ...process.env, PORT: "0" };
  delete env.CLOUDFLARE_TUNNEL_TOKEN;
  delete env.TUNNEL_TOKEN;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: serverDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`server did not listen within ${SERVER_READY_MS}ms`));
    }, SERVER_READY_MS);
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/listening on (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      if (!output.includes("listening on")) {
        clearTimeout(timer);
        reject(new Error(`server exited ${code} before listening`));
      }
    });
  });
  return { child, ready };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, STOP_MS);
  try {
    await once(child, "exit");
  } finally {
    clearTimeout(timer);
  }
}

function track(session) {
  const messages = [];
  session.ws.on("message", (data) => {
    try {
      messages.push(JSON.parse(String(data)));
    } catch {
      messages.push({ type: "non-json" });
    }
  });
  session.ws.on("error", () => {});
  session.messages = messages;
  return session;
}

async function openSocket(port, bucket) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  bucket.push(ws);
  const session = track({ ws });
  await onceWithTimeout(ws, "open", OPEN_MS, "websocket open");
  const hello = await waitFor(session, (msg) => msg.type === "hello", MESSAGE_MS);
  return { session, hello };
}

function waitFor(session, predicate, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const index = session.messages.findIndex(predicate);
      if (index >= 0) {
        const [msg] = session.messages.splice(index, 1);
        resolve(msg);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        const types = session.messages.map((msg) => msg.type).join(",") || "(none)";
        reject(new Error(`timed out after ${timeoutMs}ms waiting for a message; queued types: ${types}`));
        return;
      }
      setTimeout(check, 15);
    };
    check();
  });
}

async function closeSocket(ws) {
  if (!ws || ws.readyState === ws.CLOSED) return;
  const closed = onceWithTimeout(ws, "close", 1000, "socket close").catch(() => {});
  try {
    ws.close();
  } catch {
    ws.terminate();
  }
  await closed;
  if (ws.readyState !== ws.CLOSED) ws.terminate();
}

function playerById(state, id) {
  return Array.isArray(state.players) ? state.players.find((player) => player.id === id) : undefined;
}

function summarizeLobby(messages) {
  const summary = {
    sawRoomWelcome: false,
    sawRoomState: false,
    sawRoomError: false,
    errorCodes: [],
    tokenOnPublic: false,
    welcomeCarriedToken: false,
  };
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if ((msg.type === "room_state" || msg.type === "room_error") && Object.prototype.hasOwnProperty.call(msg, "resumeToken")) {
      summary.tokenOnPublic = true;
    }
    if (msg.type === "room_welcome") {
      summary.sawRoomWelcome = true;
      summary.welcomeCarriedToken = typeof msg.resumeToken === "string" && msg.resumeToken.length > 0;
    } else if (msg.type === "room_state") {
      summary.sawRoomState = true;
    } else if (msg.type === "room_error") {
      summary.sawRoomError = true;
      if (typeof msg.error === "string") summary.errorCodes.push(msg.error);
    }
  }
  return summary;
}

function lobbyResult(summary) {
  if (summary.tokenOnPublic) {
    return {
      result: "fail",
      ...summary,
      reason: "A public room message included a private token field. The value was not recorded.",
    };
  }
  if (summary.sawRoomWelcome) {
    return {
      result: "pass",
      ...summary,
      reason: "Live /ws sent room_welcome. The token value was not recorded.",
    };
  }
  if (summary.sawRoomState || summary.sawRoomError) {
    return {
      result: "partial",
      ...summary,
      reason: "Live /ws answered room routing without room_welcome. The planned contract is not fully served.",
    };
  }
  return {
    result: "unsupported",
    ...summary,
    reason:
      "UNSUPPORTED: live /ws did not send room_welcome, room_state, or room_error after room_create and room_join. Issue 19 routing is not served on this main. The planned contract was not treated as live.",
  };
}

function exitCodeFor(report) {
  if (report.twoSessions.result !== "pass") return 1;
  if (report.lobbyRouting.result === "fail") return 1;
  if (report.freshConnection.result === "fail" || report.sameIdentityReconnect.result === "fail") return 1;
  const reconnectReady = report.sameIdentityReconnect.result === "pass";
  const lobbyReady = report.lobbyRouting.result === "pass";
  if (reconnectReady && lobbyReady) return 0;
  if (report.freshConnection.result === "pass" || reconnectReady) return 2;
  return 1;
}

export async function runProbe() {
  const token = probeToken();
  const server = startServer();
  const sockets = [];
  try {
    const port = await server.ready;
    const healthBefore = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
    const healthBody = await healthBefore.json();
    if (healthBefore.status !== 200 || healthBody.ok !== true || healthBody.service !== "flag-raid" || healthBody.websocket !== "/ws") {
      throw new Error("health endpoint did not match the live flag-raid contract");
    }

    const firstOpen = await openSocket(port, sockets);
    const secondOpen = await openSocket(port, sockets);
    for (const opened of [firstOpen, secondOpen]) {
      if (opened.hello.type !== "hello" || opened.hello.service !== "flag-raid" || typeof opened.hello.heartbeatMs !== "number") {
        throw new Error("hello did not match the live flag-raid contract");
      }
    }

    const first = firstOpen.session;
    const second = secondOpen.session;
    first.ws.send(JSON.stringify({ type: "join", name: "Ada", kind: "human" }));
    second.ws.send(JSON.stringify({ type: "join", name: "Bea", kind: "human" }));
    const welcomeA = await waitFor(first, (msg) => msg.type === "welcome", MESSAGE_MS);
    const welcomeB = await waitFor(second, (msg) => msg.type === "welcome", MESSAGE_MS);
    for (const welcome of [welcomeA, welcomeB]) {
      if (welcome.team !== "red" || typeof welcome.playerId !== "string" || welcome.playerId.length === 0) {
        throw new Error("welcome did not assign a red human playerId");
      }
      if (!welcome.map || welcome.map.width !== 64 || welcome.map.height !== 40 || !Array.isArray(welcome.map.tiles)) {
        throw new Error("welcome map snapshot was not the live 64x40 grid");
      }
    }
    if (welcomeA.playerId === welcomeB.playerId) {
      throw new Error("two sessions received the same playerId");
    }

    const seesBoth = (msg) =>
      msg.type === "state" && playerById(msg, welcomeA.playerId) && playerById(msg, welcomeB.playerId);
    const stateA = await waitFor(first, seesBoth, STATE_MS);
    const stateB = await waitFor(second, seesBoth, STATE_MS);
    for (const state of [stateA, stateB]) {
      if (state.phase !== "playing" || state.fog?.team !== "red" || state.fog?.encoding !== "row-major-u8") {
        throw new Error("shared state snapshot did not match the live playing snapshot");
      }
      const ada = playerById(state, welcomeA.playerId);
      const bea = playerById(state, welcomeB.playerId);
      if (ada.name !== "Ada" || bea.name !== "Bea" || ada.team !== "red" || bea.team !== "red" || ada.kind !== "human" || bea.kind !== "human") {
        throw new Error("shared snapshot did not list the two human sessions");
      }
    }

    first.ws.send(JSON.stringify({ type: "ping" }));
    const pong = await waitFor(first, (msg) => msg.type === "pong", MESSAGE_MS);
    if (pong.type !== "pong") throw new Error("ping did not return pong");

    for (let i = first.messages.length - 1; i >= 0; i -= 1) {
      if (first.messages[i].type === "state") first.messages.splice(i, 1);
    }
    first.ws.send(JSON.stringify({ type: "input", dx: 1, dy: 0 }));
    const turned = await waitFor(
      first,
      (msg) => msg.type === "state" && playerById(msg, welcomeA.playerId)?.dir === "right",
      DIR_MS
    );
    if (playerById(turned, welcomeA.playerId)?.dir !== "right") {
      throw new Error("input did not show up on a later state snapshot");
    }

    const lobbyOpen = await openSocket(port, sockets);
    const lobby = lobbyOpen.session;
    lobby.messages.length = 0;
    lobby.ws.send(JSON.stringify({ type: "room_create" }));
    lobby.ws.send(JSON.stringify({ type: "room_join", roomId: "AB2K", resumeToken: token }));
    await delay(LOBBY_QUIET_MS);
    const lobbySummary = summarizeLobby(lobby.messages);
    const lobbyRouting = lobbyResult(lobbySummary);

    first.ws.close();
    await onceWithTimeout(first.ws, "close", OPEN_MS, "first session close");
    const afterDrop = await waitFor(
      second,
      (msg) => msg.type === "state" && !playerById(msg, welcomeA.playerId) && playerById(msg, welcomeB.playerId),
      STATE_MS
    );
    if (playerById(afterDrop, welcomeA.playerId)) {
      throw new Error("dropped player was still in the other session snapshot");
    }

    const freshOpen = await openSocket(port, sockets);
    const fresh = freshOpen.session;
    if (freshOpen.hello.type !== "hello") throw new Error("fresh connection did not receive hello");
    await delay(PRE_JOIN_QUIET_MS);
    const prematureWelcome = fresh.messages.some((msg) => msg.type === "welcome" || msg.type === "state");
    if (prematureWelcome) {
      throw new Error("a new socket received a player snapshot before join");
    }
    fresh.ws.send(
      JSON.stringify({
        type: "join",
        name: "Ada",
        kind: "human",
        playerId: welcomeA.playerId,
        resumeToken: token,
      })
    );
    const welcomeFresh = await waitFor(fresh, (msg) => msg.type === "welcome", MESSAGE_MS);
    if (!welcomeFresh.map || welcomeFresh.map.width !== 64 || welcomeFresh.map.height !== 40 || !Array.isArray(welcomeFresh.map.tiles)) {
      throw new Error("fresh welcome did not include a 64x40 map snapshot");
    }
    const freshState = await waitFor(fresh, (msg) => msg.type === "state" && Array.isArray(msg.players) && msg.players.length > 0, STATE_MS);
    const previousAbsent = !playerById(freshState, welcomeA.playerId);
    const newIdentity = welcomeFresh.playerId !== welcomeA.playerId;
    const selfPresent = Boolean(playerById(freshState, welcomeFresh.playerId));
    if (!selfPresent) throw new Error("fresh snapshot did not include the welcomed player");
    const stillOnSecond = newIdentity
      ? await waitFor(
          second,
          (msg) => msg.type === "state" && playerById(msg, welcomeFresh.playerId),
          STATE_MS
        )
      : await waitFor(second, (msg) => msg.type === "state" && playerById(msg, welcomeA.playerId), STATE_MS);
    const otherDroppedOld = !playerById(stillOnSecond, welcomeA.playerId);

    const freshIsNewSession = newIdentity && previousAbsent && otherDroppedOld;
    const identityRestored = !newIdentity && !previousAbsent && playerById(stillOnSecond, welcomeA.playerId);
    const freshConnection = freshIsNewSession
      ? {
          result: "pass",
          previousPlayerId: welcomeA.playerId,
          newPlayerId: welcomeFresh.playerId,
          previousAbsentFromFreshSnapshot: true,
          previousAbsentFromOtherSession: true,
          newPlayerVisibleToOtherSession: true,
          receivedHelloBeforeJoin: true,
          noSnapshotBeforeJoin: true,
          welcomeMapWidth: welcomeFresh.map.width,
          welcomeMapHeight: welcomeFresh.map.height,
          note: "This is a new connection with a fresh welcome map and a fresh state snapshot. It is not a resume of the closed session.",
        }
      : {
          result: identityRestored ? "not-observed" : "fail",
          previousPlayerId: welcomeA.playerId,
          newPlayerId: welcomeFresh.playerId,
          previousAbsentFromFreshSnapshot: previousAbsent,
          previousAbsentFromOtherSession: otherDroppedOld,
          newPlayerVisibleToOtherSession: Boolean(playerById(stillOnSecond, welcomeFresh.playerId)),
          receivedHelloBeforeJoin: true,
          noSnapshotBeforeJoin: true,
          welcomeMapWidth: welcomeFresh.map.width,
          welcomeMapHeight: welcomeFresh.map.height,
          note: identityRestored
            ? "The new socket kept the dropped playerId, so this was not a fresh identity."
            : "Fresh join produced a mixed snapshot. Same-identity reconnect was not established, and a clean new identity was not established either.",
        };
    const sameIdentityReconnect = identityRestored
      ? {
          result: "pass",
          identityRestored: true,
          reason: "The new socket resumed the dropped playerId and the snapshot still contained that player.",
        }
      : freshIsNewSession
        ? {
            result: "unsupported",
            identityRestored: false,
            reason:
              "UNSUPPORTED: same-identity reconnect/resync is not provided. Close removes the player. A new socket receives hello only, and join allocates a new playerId plus a fresh snapshot that does not include the dropped id. Putting the previous id on join does not restore it.",
          }
        : {
            result: "fail",
            identityRestored: false,
            reason: "The reconnect probe finished in an unexpected mixed state.",
          };

    const healthAfter = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
    const healthAfterBody = await healthAfter.json();
    if (healthAfter.status !== 200 || healthAfterBody.ok !== true) {
      throw new Error("health endpoint failed after the sessions closed and rejoined");
    }

    const report = {
      exitCode: 0,
      twoSessions: {
        result: "pass",
        distinctPlayerIds: true,
        teams: [welcomeA.team, welcomeB.team],
        bothVisibleToEachOther: true,
        pingPong: true,
        inputAppliedOnSnapshot: true,
        phase: stateA.phase,
        playerCountOnHealthBeforeJoin: healthBody.players,
        playerCountOnHealthAfter: healthAfterBody.players,
      },
      freshConnection,
      sameIdentityReconnect,
      lobbyRouting,
    };
    report.exitCode = exitCodeFor(report);
    const serialized = JSON.stringify(report);
    if (serialized.includes(token) || serialized.includes(PROBE_TOKEN_PREFIX)) {
      throw new Error("probe report contained the private token material");
    }
    return report;
  } finally {
    await Promise.all(sockets.map((ws) => closeSocket(ws)));
    await stopChild(server.child);
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (invokedDirectly()) {
  runProbe()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exit(report.exitCode);
    })
    .catch((error) => {
      const token = "";
      process.stderr.write(`${redactText(error && error.stack ? error.stack : error, token)}\n`);
      process.exit(1);
    });
}
