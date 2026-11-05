# Command contract

Matches `docs/COMMAND_PANEL_HANDOFF.md` from PR #31 (`2ae12573`) and issue 6. The panel payload already has `type: "command"`. The server reads that object as-is and does not wrap it again.

## Request

Specific units:

```json
{ "type": "command", "seq": 1, "order": "rally", "unitIds": ["auto-red-0"], "target": { "x": 12, "y": 8 } }
```

Whole team:

```json
{ "type": "command", "seq": 2, "order": "scout", "all": true, "target": { "x": 12, "y": 8 } }
```

`unitIds` and `all` are mutually exclusive. `beer` does not need either, and does not need `target`.

`target` is stored unchanged. For a unit to walk there, `target.x` and `target.y` must be integers in tile space: the same numbers as `Math.floor` of a player's `x` and `y`. They are not pixels. Floats are `invalid_command` and are not rounded. Extra keys on the target object are kept.

`order` costs: rally 1, scout 1, defend 2, escort 3, attack 3, tag 4, beer 8.

`seq` is echoed. A seq that is not the server's `nextSeq` is still applied or rejected on its own merits. It is not a special clear.

## Response

```json
{ "type": "command_ack", "seq": 1, "view": {} }
```

```json
{ "type": "command_rejected", "seq": 1, "reason": "not_enough_cp", "view": {} }
```

`reason` is `not_enough_cp`, `no_orders_left`, `cooldown`, `target_not_explored`, `target_not_visible`, `already_used`, or `invalid_command`. Rejection does not spend CP or change a bot.

`view` is the panel `update` patch. `commandResult` inside it repeats the ack or rejection. `enabled` is boolean `true` only when that order can be sent. Beer is one entry in `capabilities.orders`, cost 8.

```json
{
  "nextSeq": 2,
  "units": [{ "id": "auto-red-0", "name": "Red Runner", "selectable": true }],
  "budget": { "current": 5, "cap": 10 },
  "orderCount": { "used": 1, "max": 15 },
  "capabilities": {
    "orders": [{
      "id": "rally",
      "label": "rally",
      "frame": "badge_rally",
      "cost": 1,
      "enabled": true
    }]
  },
  "commandResult": { "type": "command_ack", "seq": 1 }
}
```

Humans also receive `{ "type": "command_view", ...view }` without `commandResult` on the tick, so a routine view does not clear an in-flight seq.

Start 6 CP, +1 every 5 seconds, cap 10, 15 orders a round, 2 seconds between orders, 5 seconds before the same bot is ordered again. The team that loses a capture gains 3 CP, still capped. `beer` is once a round, +50% speed and no tags for 4 seconds. At 0 CP or 0 orders left, bots stay on role autopilot.

`/command-panel.css` is served as `text/css` from the same origin. The image COPY list in the Dockerfile is owned by the client change that adds the stylesheet file.
