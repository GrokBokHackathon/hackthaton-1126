# Decision log

Current choices for the hackathon. This repo is the source of truth. Keep new entries short.

Legend: **decided** = team choice; **planned** = agreed direction, not built; **implemented** = exists in code on the named ref.

## 1. Game — realtime Capture the Flag

**Decided.** The match is Capture the Flag on one shared map. Humans and bots move continuously. It is not turn-based, and it is not a between-round trainer.

The core demo is that movement: positions and flag state over WebSockets while the match is live.

**Implemented:** mock connectivity scaffold on `main` (echo-only); none of the match logic yet.

## 2. Who plays

**Decided / product target:** two sides — **humans vs Grok Bot(s)** — silly Grok Bot / emoji theme. Grok Bots are players in the match, not a Compose sidecar.

**n humans vs m Grok Bots.** Both counts can be more than one. Treat flexible counts as compatible with "humans vs bots" unless the first playable slice hard-codes 1v1.

This host runs the server and the local client. Humans and bots join through the public tunnel URL. A bot is not a Compose service yet.

## 3. Map and bases

**Planned (product):** bases on **opposite diagonals**; **procedural map** each round with random obstacles; a **path between bases is guaranteed**.

**Implemented:** no map generator yet.

## 4. Tone and time

**Decided.** Funny, silly, dumb. A party game for drinking with friends. The plot can be thin or stupid.

Ship a playable slice in about three hours. Cut work that does not put people and bots on the same map.

## 5. View

**Decided.** **2D top-down.** Isometric and low-poly 3D were considered; top-down is fastest for this time box: a flat canvas, no camera rig. Colored shapes, public assets, emoji, or generated art are all fine.

## 6. Clients and transport

**Decided.** Web clients. Gameplay traffic is WebSocket at **`/ws`**. The server owns shared state. Clients heartbeat and reconnect (Cloudflare can idle-timeout a socket or restart an edge).

Each player runs their own client against the published tunnel URL.

## 7. Mystery-box powerups

**Planned — next slice after a live match exists.** Not started. Do not document wire fields for boxes until code exists.

## 8. Stretch — behavior trees

**Stretch, not core.** Between matches, or as a light tweak during a match, an LLM may rewrite a bot's JSON behavior tree (data, not game code) so a slow model call cannot stall movement.

If built: Tactician proposes edits, Critic checks schema / power, Narrator writes a silly line. Small action set is enough: `chase`, `flank`, `retreat`, `ambush`, `wait`.

Voice or text commands that edit an ally tree are later still, and outside the three-hour slice.

## 9. Hosting

**Decided.** Run the stack on the **team host** (Wiktor's laptop) with Docker Compose or Podman; publish with a **Cloudflare Tunnel** on a custom domain.

Do **not** deploy the game server onto a bot or cloud-agent machine. Greg's bots coordinate through this repository only.

Vercel is not used for the game server (short WebSocket lifetime). Tailscale was considered as a backup if the tunnel path is blocked.

## 10. Cloudflare Tunnel and secrets

**Decided.** Tunnel supports WebSockets. There is no hard documented WebSocket connection limit to design around at this scale.

Token only as `CLOUDFLARE_TUNNEL_TOKEN` from env / secret store; Compose maps it to cloudflared `TUNNEL_TOKEN`. Never commit secrets, tokens, API keys, credentials, or env values. `.env.example` leaves the variable empty.

Public hostname targets `http://server:8080` on the Compose network.

## 11. Repository language and docs placement

**Decided.** All repository content is English: docs, commits, issues, and in-repo copy. On-screen jokes can be silly. They stay in English in this repo.

Shared docs that teammates need after `git pull` land on **`main`**, not on long-lived feature branches. Code may use short-lived PR branches; docs bots push doc-only commits to `main` (or a docs PR merged immediately if branch protection blocks direct push).

## 12. Collaboration

**Decided.** Shared work between Wiktor and Grześ (Greg). Invent features as we go. Commit frequently so the repo stays the handoff.

## 13. First runnable slice — mock behind the tunnel

**Implemented on `main`:** monorepo `apps/server` (mock realtime server) + `apps/web` (client stub); `docker-compose.yml` runs mock, stub, and `cloudflared`.

The mock answers `GET /health` and echoes `WebSocket /ws`, with heartbeats. That is enough to prove the tunnel. The Capture the Flag match is the next step, not this container.

See [PROTOCOL.md](../PROTOCOL.md) and the [Verified deployment](../README.md#verified-deployment) section of the README.

## Open questions

Ask Greg / the gameplay bot when unclear:

1. First playable slice: fixed team sizes (e.g. N humans vs 1 bot) or fully dynamic n vs m?
2. One flag or one flag per side? Capture rule (return to base vs instant score)?
3. Authoritative tick rate / movement model (client prediction or server snap only)?
4. Mystery-box effects list for the slice after the live match?
