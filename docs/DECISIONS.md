# Decision log

Accepted product and architecture choices for Enemy Trainer. This repo is the source of truth. Keep new entries short.

## 1. Game concept — Enemy Trainer

Opponents run a classic behavior tree stored as JSON ("Trener wroga"). After each round an agent reads the match log (where the player stood, what killed them, when they fled) and rewrites the tree. The player sees the tree diff and a short humorous justification. Example: camping in a corner becomes a flank.

## 2. Multi-agent pipeline

Three roles, and the demo shows them debating:

- **Tactician** proposes tree changes from the match log.
- **Critic** validates the JSON schema and rejects a tree that makes the enemy too strong.
- **Narrator** writes the player-facing comment.

Proposal, safety, and voice stay separate so a bad edit can be refused before the player sees it.

## 3. Mutate data, not code, and only between rounds

The model rewrites the JSON tree. It does not emit game code. Evolution runs after the round ends.

A data edit is easier to schema-check, diff, and roll back. Doing it between rounds keeps API latency off realtime play.

## 4. Web clients, WebSockets

Clients are web apps. Gameplay traffic is WebSocket.

## 5. Humans vs Grok Bots

Human players face Grok Bots. Grok Bots are in-game agents and players, not only the between-round editors.

## 6. Tone

Funny. The Narrator line should be a joke tied to what just happened in the match.

## 7. Art

2D over 3D, so we can move faster. Pixel art or low-poly. Public assets or generated art. No custom 3D pipeline for the hackathon.

## 8. Hosting

Run the multiplayer stack locally with Docker Compose or Podman, and publish it with a Cloudflare Tunnel on a custom domain.

Vercel is not used for the game server. Its WebSocket connections are limited to about five minutes.

Tailscale was considered as a backup if the tunnel path is blocked.

Clients must heartbeat and reconnect. Cloudflare can idle-timeout a connection or restart an edge.

## 9. Cloudflare Tunnel and secrets

The tunnel fully supports WebSockets. There is no hard documented WebSocket connection limit we need to design around at this scale.

The tunnel token is supplied only as `CLOUDFLARE_TUNNEL_TOKEN` from the environment or a secret store. Never commit secrets, tokens, API keys, credentials, or env values.

## 10. Repository language

All repository content is English: docs, commits, issues, and in-repo copy. The on-screen title may still be "Trener wroga".

## 11. Collaboration

Shared work between Wiktor and Grześ. Invent features as we go. Commit frequently so the repo stays the handoff.

## 12. Small behavior-tree action set

The first tree uses only: `chase`, `flank`, `retreat`, `ambush`, `wait`.

A small set keeps the schema, the Critic, and the on-screen diff readable.

## 13. Companion AI (later)

Deferred. Voice or text commands map onto ally behavior-tree edits: the same engine, inverted. The player trains a friend instead of only watching an enemy learn. Not in the first slice.
