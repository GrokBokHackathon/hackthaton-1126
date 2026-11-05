# Enemy Trainer

**Trener wroga.** Opponents run on a classic behavior tree stored as JSON. After each round, agents read the match log and rewrite that tree. The player sees the diff and a short humorous justification.

This repository is the source of truth for the hackathon. Product and architecture choices are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Goals

- Humans play Grok Bots in a realtime web game. Grok Bots are in-game agents and players.
- The enemy adapts between rounds by mutating a JSON behavior tree, not by rewriting code.
- Show the agent debate, the tree diff, and a funny line tied to what just happened.
- Ship a small slice quickly: 2D, five actions, local containers, Cloudflare Tunnel.

## Architecture

```
Web client  --WebSocket-->  Realtime game server
                                  |
                                  +-- Behavior-tree interpreter (during the round)
                                  |
                                  +-- POST /evolve (between rounds)
                                        |
                                        +-- Tactician  proposes tree edits from the match log
                                        +-- Critic     checks JSON schema and that the enemy
                                        |              did not become too strong
                                        +-- Narrator   writes the player-facing comment
```

In a round the server only interprets the current tree, so model latency stays off the gameplay loop. After the round, `/evolve` takes the match log (where the player stood, what killed them, when they fled) and returns a new tree, a diff, and a comment. The demo shows the three agents debating.

First action set: `chase`, `flank`, `retreat`, `ambush`, `wait`.

A later bonus uses the same engine inverted: voice or text commands that edit an ally tree. Not part of the first slice.

## Decisions

See [docs/DECISIONS.md](docs/DECISIONS.md) before changing the pipeline, hosting, art direction, or the tree shape.

## Local run

The stack is not scaffolded yet. Intended shape:

- Web client and realtime server in one Docker Compose or Podman stack.
- Public multiplayer through a Cloudflare Tunnel and a custom domain. The game server does not run on Vercel; those WebSocket connections are cut at about five minutes.
- Client heartbeats and reconnect. Cloudflare can idle-timeout a socket or restart an edge connection.
- `CLOUDFLARE_TUNNEL_TOKEN` is read from the environment or a secret store. Do not commit it. Do not put tokens, API keys, credentials, or env values in this repo or in an example env file.

```bash
# Compose file is not in the repo yet.
# Set CLOUDFLARE_TUNNEL_TOKEN in your environment. Never commit the value.
# docker compose up
```

## Contributing

- English only in this repo: docs, commits, issues, and in-repo copy.
- Shared work. Invent features as we go and commit often so the other person can continue.
- Never commit secrets, tokens, API keys, tunnel tokens, credentials, or env values.

## Next steps

1. Scaffold the realtime server, a WebSocket session, and a minimal web client.
2. Define the behavior-tree JSON schema and an interpreter for the five actions.
3. Add `POST /evolve` (Tactician, Critic, Narrator) and a demo view of the debate plus the tree diff.
4. Add Docker Compose or Podman, and a Cloudflare Tunnel service that reads `CLOUDFLARE_TUNNEL_TOKEN` from the environment.
5. Later: companion AI that maps voice or text onto ally tree edits.
