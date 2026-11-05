// Team choice for the legacy `join`. The server accepts exactly these ids
// (apps/server/game.js TEAMS). There is no `blue`; the opponent side is `bot`.

export const JOIN_TEAMS = Object.freeze(["red", "bot"]);

export const TEAM_LABELS = Object.freeze({ red: "Red", bot: "Bot" });

export const LAST_TEAM_KEY = "flagRaid.lastTeam";

export function normalizeTeamId(value) {
  return typeof value === "string" && JOIN_TEAMS.includes(value) ? value : null;
}

export function teamLabel(team) {
  return TEAM_LABELS[team] || null;
}

/** `?team=red` or `?team=bot` skips the picker. Anything else shows it. */
export function teamFromSearch(search) {
  const raw = typeof search === "string" ? search : "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  return normalizeTeamId(params.get("team"));
}

export function joinMessage({ name, team } = {}) {
  const id = normalizeTeamId(team);
  if (!id) return null;
  return {
    type: "join",
    name: typeof name === "string" && name ? name : "Player",
    kind: "human",
    team: id,
  };
}

export function scoreText(score, team) {
  const red = Number.isFinite(score?.red) ? score.red : 0;
  const bot = Number.isFinite(score?.bot) ? score.bot : 0;
  const mark = (id) => (team === id ? " (you)" : "");
  return `Red${mark("red")} ${red} - ${bot} Bot${mark("bot")}`;
}

export function winnerText(winner, team) {
  const label = teamLabel(winner);
  if (!label) return "Round over. New round starting...";
  if (team && winner === team) return "Your team wins! New round starting...";
  return `${label} team wins! New round starting...`;
}
