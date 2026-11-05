// Issue 12 checks against an isolated server process.
// Same-identity reconnect and issue 19 room routing are asserted as required
// capabilities. On current main those assertions fail on purpose. A new socket
// that receives a fresh snapshot is not counted as a resume.

import assert from "node:assert/strict";
import test from "node:test";
import { runProbe } from "../scripts/issue12-two-session-smoke.mjs";

const PROBE_TOKEN_PREFIX = "issue12-probe-";
const reportPromise = runProbe();

test("two distinct websocket sessions share a live snapshot", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  assert.equal(report.twoSessions.result, "pass");
  assert.equal(report.twoSessions.distinctPlayerIds, true);
  assert.deepEqual(report.twoSessions.teams, ["red", "red"]);
  assert.equal(report.twoSessions.bothVisibleToEachOther, true);
  assert.equal(report.twoSessions.pingPong, true);
  assert.equal(report.twoSessions.inputAppliedOnSnapshot, true);
  assert.equal(report.twoSessions.phase, "playing");
  assert.equal(report.freshConnection.previousPlayerId === report.freshConnection.newPlayerId, false);
});

test("a new connection after close is a fresh snapshot, not a resume", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  assert.equal(report.freshConnection.result, "pass");
  assert.equal(report.freshConnection.receivedHelloBeforeJoin, true);
  assert.equal(report.freshConnection.noSnapshotBeforeJoin, true);
  assert.equal(report.freshConnection.previousAbsentFromFreshSnapshot, true);
  assert.equal(report.freshConnection.previousAbsentFromOtherSession, true);
  assert.equal(report.freshConnection.newPlayerVisibleToOtherSession, true);
  assert.equal(report.freshConnection.welcomeMapWidth, 64);
  assert.equal(report.freshConnection.welcomeMapHeight, 40);
  assert.notEqual(report.freshConnection.previousPlayerId, report.freshConnection.newPlayerId);
});

test("same-identity reconnect restores the dropped player", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  assert.equal(
    report.sameIdentityReconnect.identityRestored,
    true,
    report.sameIdentityReconnect.reason
  );
  assert.equal(report.sameIdentityReconnect.result, "pass");
});

test("live /ws answers room_create with room_welcome", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  assert.equal(report.lobbyRouting.tokenOnPublic, false);
  assert.equal(
    report.lobbyRouting.sawRoomWelcome,
    true,
    report.lobbyRouting.reason
  );
  assert.equal(report.lobbyRouting.result, "pass");
});

test("probe report redacts the private token", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  const blob = JSON.stringify(report);
  assert.equal(blob.includes(PROBE_TOKEN_PREFIX), false);
  assert.equal(blob.includes("[redacted]"), false);
  assert.equal(report.lobbyRouting.tokenOnPublic, false);
});
