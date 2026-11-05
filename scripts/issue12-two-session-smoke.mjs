// Issue 12 headless probe.
// Required acceptance follows the PR 48 room contract:
//   connection A: room_create → private room_welcome (roomId + resume token)
//   connection B: room_join { roomId } with no token → seat 2
//   connection C: room_join { roomId, resumeToken } after A closes → seat 1 restored
// welcome.started is true only on the call that fills seat 2. A later resume
// returns started false so the server does not create a second Match. The
// public room phase stays "match", and the playing clock is required to move.
// The room id always comes from A's room_welcome. This file never invents one.
// Legacy `join` is an optional diagnostic. It is not a resume and is not acceptance.
//
// Exit codes when run directly:
//   0  required two-commander session and required resume both passed
//   2  a required capability is unsupported (protocol gap, not a pass)
//   1  a required check answered incorrectly, a public frame leaked a token, or the probe crashed

import { createRequire } from "node:module";
import { once } from "node:events";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/server/package.json", import.meta.url));
const { WebSocket } = require("ws");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = process.env.ISSUE12_SERVER_DIR
  ? path.resolve(process.env.ISSUE12_SERVER_DIR)
  : path.join(repoRoot, "apps", "server");
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const OPEN_MS = 3000;
const ROOM_MS = 2000;
const CLOCK_MS = 2000;
const LEGACY_MS = 3000;
const SERVER_READY_MS = 5000;
const STOP_MS = 3000;

export function redactText(text, tokens) {
  let raw = String(text);
  for (const token of tokens || []) {
    if (token) raw = raw.split(token).join("[redacted]");
  }
  return raw.replace(/"resumeToken"\s*:\s*"[^"]*"/g, '"resumeToken":"[redacted]"');
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
  session.ws.messages = messages;
  return session;
}

async function openSocket(port, bucket) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  bucket.push(ws);
  const session = track({ ws });
  await onceWithTimeout(ws, "open", OPEN_MS, "websocket open");
  const hello = await waitFor(session, (msg) => msg.type === "hello", OPEN_MS);
  if (hello.type !== "hello" || hello.service !== "flag-raid") {
    throw new Error("hello did not match the live flag-raid contract");
  }
  return session;
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
        reject(new Error(`timed out after ${timeoutMs}ms; queued types: ${types}`));
        return;
      }
      setTimeout(check, 15);
    };
    check();
  });
}

async function waitForOptional(session, predicate, timeoutMs) {
  try {
    return await waitFor(session, predicate, timeoutMs);
  } catch (error) {
    if (String(error.message || error).startsWith("timed out")) return null;
    throw error;
  }
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

function validRoomId(roomId) {
  return typeof roomId === "string" && roomId.length === 4 && [...roomId].every((char) => ROOM_ALPHABET.includes(char));
}

function takeToken(msg) {
  const token = typeof msg?.resumeToken === "string" && msg.resumeToken.length > 0 ? msg.resumeToken : null;
  if (msg && Object.prototype.hasOwnProperty.call(msg, "resumeToken")) delete msg.resumeToken;
  return token;
}

function leakedToken(msg, token) {
  if (!token || !msg || msg.type === "room_welcome") return false;
  return JSON.stringify(msg).includes(token);
}

function remember(bucket, msg) {
  if (msg) bucket.push(msg);
  return msg;
}

function unsupportedSessions(reason) {
  return {
    result: "unsupported",
    acceptance: true,
    roomId: null,
    roomIdSource: "none",
    creatorSeat: null,
    creatorTeam: null,
    creatorStarted: null,
    joinerSeat: null,
    joinerTeam: null,
    joinerStarted: null,
    roomPhase: null,
    sameRoom: false,
    mapSeedSeen: false,
    reason,
  };
}

function unsupportedResume(reason) {
  return {
    result: "unsupported",
    acceptance: true,
    protocol: "room_join-with-private-token",
    identityRestored: false,
    attempted: false,
    sameSocketAsCreator: false,
    roomIdSource: "none",
    restoredSeat: null,
    restoredTeam: null,
    restoredStarted: null,
    roomPhase: null,
    matchClockAdvanced: null,
    tokenMatched: false,
    mapSeedMatched: null,
    usedLegacyJoin: false,
    reason,
  };
}

async function watchPlayingClock(session) {
  const first = await waitForOptional(
    session,
    (msg) => msg.type === "state" && msg.phase === "playing" && typeof msg.remainingMs === "number",
    CLOCK_MS
  );
  if (!first) return { sawPlaying: false, advanced: false };
  const later = await waitForOptional(
    session,
    (msg) =>
      msg.type === "state" &&
      msg.phase === "playing" &&
      typeof msg.remainingMs === "number" &&
      msg.remainingMs < first.remainingMs,
    CLOCK_MS
  );
  return { sawPlaying: true, advanced: Boolean(later) };
}

function exitCodeFor(report) {
  if (report.tokenOnPublic) return 1;
  const two = report.required.twoCommanderSessions.result;
  const resume = report.required.sameIdentityReconnect.result;
  if (two === "fail" || resume === "fail") return 1;
  if (two === "pass" && resume === "pass") return 0;
  if (two === "unsupported" || resume === "unsupported") return 2;
  return 1;
}

async function legacyDiagnostic(port, bucket) {
  const diagnostic = {
    acceptance: false,
    countsAsReconnect: false,
    result: "diagnostic-error",
    distinctPlayerIds: null,
    teams: null,
    droppedIdRestored: null,
    note: "Legacy join allocates a new player id. It is not room_join and it is not acceptance.",
  };
  try {
    const first = await openSocket(port, bucket);
    const second = await openSocket(port, bucket);
    first.ws.send(JSON.stringify({ type: "join", name: "Ada", kind: "human" }));
    second.ws.send(JSON.stringify({ type: "join", name: "Bea", kind: "human" }));
    const welcomeA = await waitFor(first, (msg) => msg.type === "welcome", LEGACY_MS);
    const welcomeB = await waitFor(second, (msg) => msg.type === "welcome", LEGACY_MS);
    const distinct = welcomeA.playerId !== welcomeB.playerId && typeof welcomeA.playerId === "string";
    await closeSocket(first.ws);
    const fresh = await openSocket(port, bucket);
    fresh.ws.send(JSON.stringify({ type: "join", name: "Ada", kind: "human", playerId: welcomeA.playerId }));
    const welcomeFresh = await waitFor(fresh, (msg) => msg.type === "welcome", LEGACY_MS);
    diagnostic.result = "observed";
    diagnostic.distinctPlayerIds = distinct;
    diagnostic.teams = [welcomeA.team, welcomeB.team];
    diagnostic.droppedIdRestored = welcomeFresh.playerId === welcomeA.playerId;
    return diagnostic;
  } catch {
    return diagnostic;
  }
}

export async function runProbe() {
  const server = startServer();
  const sockets = [];
  const seen = [];
  let creatorToken = null;
  let joinerToken = null;
  let resumeToken = null;
  try {
    const port = await server.ready;
    const health = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
    const healthBody = await health.json();
    if (health.status !== 200 || healthBody.ok !== true || healthBody.service !== "flag-raid" || healthBody.websocket !== "/ws") {
      throw new Error("health endpoint did not match the live flag-raid contract");
    }

    const creator = await openSocket(port, sockets);
    creator.messages.length = 0;
    creator.ws.send(JSON.stringify({ type: "room_create" }));
    const createdRaw = remember(
      seen,
      await waitForOptional(creator, (msg) => msg.type === "room_welcome" || msg.type === "room_error", ROOM_MS)
    );
    const createdState = remember(
      seen,
      await waitForOptional(creator, (msg) => msg.type === "room_state" || msg.type === "room_error", 200)
    );

    let two = null;
    let resume = null;
    let roomId = null;

    if (!createdRaw) {
      const stray = creator.messages.find((msg) => msg.type === "room_state" || msg.type === "room_error" || msg.type === "room_welcome");
      const reason = stray
        ? "room_create produced a room frame that was not a private room_welcome, so no room id was taken from a welcome and room_join was not sent."
        : "UNSUPPORTED: room_create on its own connection produced no room_welcome. No live roomId was issued, so room_join was not sent and no room id was invented.";
      two = stray ? { ...unsupportedSessions(reason), result: "fail" } : unsupportedSessions(reason);
      resume = stray ? { ...unsupportedResume(reason), result: "fail" } : unsupportedResume(reason);
    } else if (createdRaw.type === "room_error") {
      const reason = `room_create returned room_error ${createdRaw.error || "unknown"}. A correct create is not an error, and no resume was attempted.`;
      two = { ...unsupportedSessions(reason), result: "fail" };
      resume = { ...unsupportedResume(reason), result: "fail" };
    } else {
      creatorToken = takeToken(createdRaw);
      roomId = createdRaw.roomId;
      const createOk =
        createdRaw.ok === true &&
        validRoomId(roomId) &&
        createdRaw.seat === 1 &&
        createdRaw.team === "red" &&
        createdRaw.started === false &&
        creatorToken !== null;
      if (!createOk) {
        const reason = "room_welcome did not match seat 1 / red / started false with a server-issued room id. Resume was not attempted.";
        two = { ...unsupportedSessions(reason), result: "fail", roomId: validRoomId(roomId) ? roomId : null, roomIdSource: "room_welcome" };
        resume = { ...unsupportedResume(reason), result: "fail", roomIdSource: "room_welcome" };
      } else if (leakedToken(createdState, creatorToken) || seen.some((msg) => leakedToken(msg, creatorToken))) {
        two = { ...unsupportedSessions("A public frame carried the private token."), result: "fail", roomId, roomIdSource: "room_welcome" };
        resume = { ...unsupportedResume("A public frame carried the private token."), result: "fail", roomIdSource: "room_welcome" };
      } else {
        const joiner = await openSocket(port, sockets);
        joiner.messages.length = 0;
        joiner.ws.send(JSON.stringify({ type: "room_join", roomId }));
        const joinedRaw = remember(
          seen,
          await waitForOptional(joiner, (msg) => msg.type === "room_welcome" || msg.type === "room_error", ROOM_MS)
        );
        const joinedState = remember(
          seen,
          await waitForOptional(
            joiner,
            (msg) => msg.type === "room_state" && msg.roomId === roomId && msg.phase === "match",
            ROOM_MS
          )
        );
        joinerToken = joinedRaw && joinedRaw.type === "room_welcome" ? takeToken(joinedRaw) : null;
        const publicLeak = [createdState, joinedRaw, joinedState, ...joiner.messages, ...creator.messages].some((msg) =>
          leakedToken(msg, creatorToken) || leakedToken(msg, joinerToken)
        );
        const joinOk =
          joinedRaw &&
          joinedRaw.type === "room_welcome" &&
          joinedRaw.ok === true &&
          joinedRaw.roomId === roomId &&
          joinedRaw.seat === 2 &&
          joinedRaw.team === "bot" &&
          joinedRaw.started === true &&
          joinerToken !== null &&
          joinerToken !== creatorToken &&
          joinedState &&
          joinedState.roomId === roomId &&
          joinedState.phase === "match";
        const mapSeed = joinedState ? joinedState.mapSeed : undefined;
        const mapSeedSeen = mapSeed !== undefined && mapSeed !== null && joinedRaw && joinedRaw.mapSeed === mapSeed;
        if (publicLeak) {
          two = {
            ...unsupportedSessions("A public frame carried the private token."),
            result: "fail",
            roomId,
            roomIdSource: "room_welcome",
          };
        } else if (!joinOk) {
          const why = !joinedRaw
            ? "room_join of the created room produced no room_welcome."
            : joinedRaw.type !== "room_welcome"
              ? `room_join of the created room answered ${joinedRaw.type}${joinedRaw.error ? " " + joinedRaw.error : ""}.`
              : !joinedState
                ? "room_join returned a private welcome but no public match board."
                : "room_join of the created room did not seat bot as seat 2 with started true.";
          two = {
            result: joinedRaw ? "fail" : "unsupported",
            acceptance: true,
            roomId,
            roomIdSource: "room_welcome",
            creatorSeat: 1,
            creatorTeam: "red",
            creatorStarted: false,
            joinerSeat: joinedRaw && joinedRaw.seat !== undefined ? joinedRaw.seat : null,
            joinerTeam: joinedRaw && joinedRaw.team !== undefined ? joinedRaw.team : null,
            joinerStarted: joinedRaw && joinedRaw.started !== undefined ? joinedRaw.started : null,
            sameRoom: Boolean(joinedRaw && joinedRaw.roomId === roomId),
            mapSeedSeen,
            reason: why,
          };
        } else if (!mapSeedSeen || (joinedRaw.mapSeed !== undefined && joinedRaw.mapSeed !== mapSeed)) {
          two = {
            result: "fail",
            acceptance: true,
            roomId,
            roomIdSource: "room_welcome",
            creatorSeat: 1,
            creatorTeam: "red",
            creatorStarted: false,
            joinerSeat: 2,
            joinerTeam: "bot",
            joinerStarted: true,
            roomPhase: joinedState ? joinedState.phase : null,
            sameRoom: true,
            mapSeedSeen,
            reason: "The second seat joined, but the match frame did not carry one shared map seed.",
          };
        } else {
          two = {
            result: "pass",
            acceptance: true,
            roomId,
            roomIdSource: "room_welcome",
            creatorSeat: 1,
            creatorTeam: "red",
            creatorStarted: false,
            joinerSeat: 2,
            joinerTeam: "bot",
            joinerStarted: true,
            roomPhase: joinedState.phase,
            sameRoom: true,
            mapSeedSeen: true,
            reason:
              "Seat 2's welcome.started is true because that call filled the room. The public room phase is match. welcome.started is not the room phase.",
          };
        }

        if (two.result === "fail" && publicLeak) {
          resume = { ...unsupportedResume("Resume was not sent after a public token leak."), result: "fail", roomIdSource: "room_welcome" };
        } else {
          await closeSocket(creator.ws);
          const resumer = await openSocket(port, sockets);
          resumer.messages.length = 0;
          resumer.ws.send(JSON.stringify({ type: "room_join", roomId, resumeToken: creatorToken }));
          const restoredRaw = remember(
            seen,
            await waitForOptional(resumer, (msg) => msg.type === "room_welcome" || msg.type === "room_error", ROOM_MS)
          );
          resumeToken = restoredRaw && restoredRaw.type === "room_welcome" ? takeToken(restoredRaw) : null;
          const resumeLeak = [restoredRaw, ...resumer.messages].some((msg) => leakedToken(msg, creatorToken) || leakedToken(msg, resumeToken));
          if (resumeLeak || publicLeak) {
            resume = {
              ...unsupportedResume("A public frame carried the private token."),
              result: "fail",
              attempted: true,
              roomIdSource: "room_welcome",
            };
          } else if (!restoredRaw) {
            resume = {
              ...unsupportedResume(
                "UNSUPPORTED: the new connection sent room_join with the room id from room_welcome and that seat's token, and the server sent no room_welcome. Legacy join was not used."
              ),
              attempted: true,
              roomIdSource: "room_welcome",
            };
          } else if (restoredRaw.type === "room_error") {
            resume = {
              result: "fail",
              acceptance: true,
              protocol: "room_join-with-private-token",
              identityRestored: false,
              attempted: true,
              sameSocketAsCreator: false,
              roomIdSource: "room_welcome",
              restoredSeat: null,
              restoredTeam: null,
              restoredStarted: null,
              tokenMatched: false,
              mapSeedMatched: null,
              usedLegacyJoin: false,
              reason: `The new connection's room_join was rejected (${restoredRaw.error || "room_error"}). The seat was not restored.`,
            };
          } else {
            const tokenMatched = resumeToken !== null && resumeToken === creatorToken;
            const mapSeedMatched = mapSeedSeen ? restoredRaw.mapSeed === mapSeed : null;
            const board = remember(
              seen,
              await waitForOptional(resumer, (msg) => msg.type === "room_state" && msg.roomId === roomId, ROOM_MS)
            );
            const roomPhase = board ? board.phase : null;
            const clock = await watchPlayingClock(resumer);
            const identityRestored =
              restoredRaw.ok === true &&
              restoredRaw.roomId === roomId &&
              restoredRaw.seat === 1 &&
              restoredRaw.team === "red" &&
              restoredRaw.started === false &&
              roomPhase === "match" &&
              tokenMatched &&
              mapSeedMatched === true;
            const matchClockAdvanced = clock.advanced === true;
            let result = "fail";
            let reason =
              "room_join on a new connection answered, but seat, team, token, map seed, or room phase did not keep the same match.";
            if (identityRestored && matchClockAdvanced) {
              result = "pass";
              reason =
                "Resume welcome.started is false because this call did not start a second match. Public room phase stayed match, seat 1 returned, and the playing clock advanced.";
            } else if (identityRestored && !matchClockAdvanced) {
              reason =
                "Seat 1 was restored and room phase stayed match, but no playing snapshot advanced remainingMs within 2000ms.";
            }
            resume = {
              result,
              acceptance: true,
              protocol: "room_join-with-private-token",
              identityRestored,
              attempted: true,
              sameSocketAsCreator: false,
              roomIdSource: "room_welcome",
              restoredSeat: restoredRaw.seat ?? null,
              restoredTeam: restoredRaw.team ?? null,
              restoredStarted: restoredRaw.started ?? null,
              roomPhase,
              matchClockAdvanced,
              sawPlayingSnapshot: clock.sawPlaying,
              tokenMatched,
              mapSeedMatched,
              usedLegacyJoin: false,
              reason,
            };
          }
        }
      }
    }

    const queued = sockets.flatMap((ws) => (ws.messages ? ws.messages : []));
    const frames = [...seen, ...queued];
    const tokenOnPublic = [creatorToken, joinerToken, resumeToken].some((token) => frames.some((msg) => leakedToken(msg, token)));
    for (const msg of frames) takeToken(msg);

    const optionalDiagnostics = {
      legacyJoin: await legacyDiagnostic(port, sockets),
    };

    const report = {
      exitCode: 0,
      serverSource: process.env.ISSUE12_SERVER_DIR ? "ISSUE12_SERVER_DIR" : "workspace",
      tokenOnPublic,
      required: {
        twoCommanderSessions: two,
        sameIdentityReconnect: resume,
      },
      optionalDiagnostics,
    };
    report.exitCode = exitCodeFor(report);
    const serialized = JSON.stringify(report);
    for (const token of [creatorToken, joinerToken, resumeToken]) {
      if (token && serialized.includes(token)) {
        throw new Error("probe report contained a private token");
      }
    }
    if (serialized.includes("resumeToken")) {
      throw new Error("probe report contained a private token field name");
    }
    return report;
  } finally {
    creatorToken = null;
    joinerToken = null;
    resumeToken = null;
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
  const heldTokens = [];
  runProbe()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exit(report.exitCode);
    })
    .catch((error) => {
      process.stderr.write(`${redactText(error && error.stack ? error.stack : error, heldTokens)}\n`);
      process.exit(1);
    });
}
