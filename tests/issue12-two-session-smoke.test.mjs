// Required acceptance is the PR 48 room flow.
// welcome.started is true only on the call that fills seat 2. Resume returns
// started false and the public room phase stays match. The playing clock must
// still advance. Legacy join is optional and is not a resume.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runProbe } from "../scripts/issue12-two-session-smoke.mjs";

const reportPromise = runProbe();
const scriptSource = readFileSync(new URL("../scripts/issue12-two-session-smoke.mjs", import.meta.url), "utf8");

test("probe source does not hardcode a room id", () => {
  assert.equal(scriptSource.includes("AB2K"), false);
  assert.equal(scriptSource.includes("roomId: \"AB"), false);
});

test("required: two commander sockets create a room and join that room id", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  const two = report.required.twoCommanderSessions;
  assert.equal(two.acceptance, true);
  assert.equal(two.roomIdSource === "room_welcome" || two.roomIdSource === "none", true);
  assert.equal(two.result, "pass", two.reason);
  assert.equal(two.creatorSeat, 1);
  assert.equal(two.creatorTeam, "red");
  assert.equal(two.joinerSeat, 2);
  assert.equal(two.joinerTeam, "bot");
  assert.equal(two.joinerStarted, true);
  assert.equal(two.roomPhase, "match");
  assert.equal(two.sameRoom, true);
  assert.equal(two.mapSeedSeen, true);
});

test("required: a new connection room_join with the resume token restores seat 1", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  const resume = report.required.sameIdentityReconnect;
  assert.equal(resume.acceptance, true);
  assert.equal(resume.protocol, "room_join-with-private-token");
  assert.equal(resume.usedLegacyJoin, false);
  assert.equal(resume.sameSocketAsCreator, false);
  assert.notEqual(resume.roomIdSource, "hardcoded");
  assert.equal(resume.identityRestored, true, resume.reason);
  assert.equal(resume.result, "pass");
  assert.equal(resume.restoredSeat, 1);
  assert.equal(resume.restoredTeam, "red");
  assert.equal(resume.restoredStarted, false);
  assert.equal(resume.roomPhase, "match");
  assert.equal(resume.matchClockAdvanced, true);
  assert.equal(resume.tokenMatched, true);
  assert.equal(resume.mapSeedMatched, true);
});

test("public frames did not carry the private token", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  assert.equal(report.tokenOnPublic, false);
});

test("optional diagnostic: legacy join is not resume acceptance", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  const legacy = report.optionalDiagnostics.legacyJoin;
  assert.equal(legacy.acceptance, false);
  assert.equal(legacy.countsAsReconnect, false);
  assert.equal(legacy.result, "observed");
  assert.equal(legacy.distinctPlayerIds, true);
  assert.equal(legacy.droppedIdRestored, false);
  assert.deepEqual(legacy.teams, ["red", "red"]);
});

test("probe report does not contain a token field or a fixed example room id", { timeout: 25000 }, async () => {
  const report = await reportPromise;
  const blob = JSON.stringify(report);
  assert.equal(blob.includes("resumeToken"), false);
  assert.equal(blob.includes("AB2K"), false);
  assert.equal(report.tokenOnPublic, false);
});
