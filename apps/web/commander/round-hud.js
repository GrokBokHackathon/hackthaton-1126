/**
 * Screen-space round line. Text comes only from the latest snapshot fields.
 * This does not count down on its own and does not treat phase "ended" as results.
 * PR36 (not merged) publishes phase playing | sudden_death | results,
 * plus winner, winReason, remainingMs, and roundId.
 */

const KNOWN_PHASES = new Set(["playing", "sudden_death", "results"]);

export function formatRoundClock(remainingMs) {
  if (!Number.isFinite(remainingMs)) return null;
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function roundHudFromState(state) {
  if (!state || typeof state !== "object" || !KNOWN_PHASES.has(state.phase)) {
    return { visible: false, text: "", phase: state && state.phase ? state.phase : null };
  }
  const round = Number.isInteger(state.roundId) ? `Round ${state.roundId}` : null;
  const clock = formatRoundClock(state.remainingMs);
  if (state.phase === "playing") {
    const parts = [round, clock].filter(Boolean);
    return { visible: parts.length > 0, text: parts.join(" · "), phase: "playing" };
  }
  if (state.phase === "sudden_death") {
    const parts = [round, "Sudden death"];
    if (clock) parts.push(clock);
    return { visible: true, text: parts.filter(Boolean).join(" · "), phase: "sudden_death" };
  }
  const winner = state.winner === "red" ? "Red wins" : state.winner === "bot" ? "Bot wins" : "Round over";
  const parts = [round, winner];
  if (typeof state.winReason === "string" && state.winReason.length > 0) parts.push(state.winReason);
  if (clock) parts.push(`Next round ${clock}`);
  return { visible: true, text: parts.filter(Boolean).join(" · "), phase: "results" };
}
