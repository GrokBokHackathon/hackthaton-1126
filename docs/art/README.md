# Flag Raid Art Pack

This directory contains the sprite sheets, atlas, documentation, and generation scripts for the Flag Raid game art. The placeholder PNGs are the current game art: flat emoji-style sprites, 32×32 tiles and frames, with a pivot at (16, 30), rendered at 2× scale with nearest-neighbor sampling.

## File Organization

### Game Assets (`apps/web/assets/`)

Served by the web client:

```
apps/web/assets/
├── atlas.json                              # Sprite atlas mapping keys to sheets and rects
├── char_red_sheet_placeholder.png          # Red team character sprites (128×192)
├── char_bot_sheet_placeholder.png          # Bot team character sprites (128×192)
├── char_mask_sheet_placeholder.png         # Neutral character mask (128×192)
├── tiles_placeholder.png                   # Tiles: grass, walls, bases (512×128)
├── tiles2_placeholder.png                  # Extended tiles: water, bridges, props (512×160)
├── fx_props_placeholder.png                # FX: flags, respawn, hit, emotes (256×96)
├── fx_command_placeholder.png              # Command FX: pings, selections, emotes (224×64)
├── powerups_placeholder.png                # Power-ups: speed, slow, shield (256×32)
├── ui_orders_placeholder.png               # UI: order buttons and badges (256×80)
└── ui_economy_placeholder.png              # UI: CP coins, pips, digits (96×40)
```

### Documentation (`docs/art/`)

Design docs, previews, and reference materials:

```
docs/art/
├── README.md                    # This file
├── sprite-spec.md               # Technical sprite specs, frame layout, atlas format
├── style-guide.md               # Visual style guide
├── palette.md                   # Color palette documentation
├── palette.gpl                  # GIMP palette
├── palette.hex                  # Hex color list
├── palette.png                  # Palette swatch reference
├── bots-play-flow.md            # Commander model gameplay flow
├── shot-list.md                 # Key visual moments to capture
├── prompt-sheet.md              # Art generation prompts
├── preview_x2.png               # Sprite preview at 2× scale
├── preview_map_*.png            # Map generation previews
├── ui_mock_landscape.png        # UI mockup (landscape)
└── ui_mock_portrait.png         # UI mockup (portrait)
```

### Generation Scripts (`tools/art/`)

Python scripts for generating and validating art:

```
tools/art/
├── gen.py                       # Generate placeholder sprite sheets
├── mapgen_reference.py          # Reference procedural map generator
├── check_palette.py             # Validate colors against palette
└── validate_atlas.js            # Validate atlas.json integrity (Node.js)
```

## Sprite Naming and Groups

The atlas organizes sprites into logical groups. Each frame name follows a consistent pattern.

### Characters (`char` group)

Character sheets are per-team: `char_red_sheet_placeholder.png`, `char_bot_sheet_placeholder.png`, `char_mask_sheet_placeholder.png`.

**Layout:** 5 rows × 4 columns (128×192 px, 32×32 frames)

- **Row 0-3:** Directional movement (down, left, right, up)
  - Column 0: `char_{dir}_idle` — Standing still
  - Column 1: `char_{dir}_run1` — Run frame 1 (150ms)
  - Column 2: `char_{dir}_run2` — Run frame 2 (150ms)

- **Row 4:** Special states
  - Columns 0-1: `char_carry_0`, `char_carry_1` — Carrying flag
  - Columns 2-3: `char_taunt_0`, `char_taunt_1` — Taunt emote

- **Row 5:** Dizzy (tagged)
  - Columns 0-2: `char_dizzy_0`, `char_dizzy_1`, `char_dizzy_2` — Dizzy animation (60ms each)

**Pivot:** (16, 30) — Bottom-center, 2px above the tile bottom for slight foot overlap

**Examples:**
- `char_down_idle` — Facing down, standing
- `char_right_run1` — Facing right, running (frame 1)
- `char_carry_0` — Carrying flag (frame 0)
- `char_dizzy_1` — Tagged/dizzy (frame 1)

### Tiles (`tiles` group)

Main terrain and obstacles from `tiles_placeholder.png` (512×128).

**Floor and decor:**
- `grass_a`, `grass_b` — Grass variants (walkable)
- `path` — Path tile (walkable)
- `bush` — Bush (walkable, blocks line-of-sight)
- `crate_beer` — Beer crate (blocks movement)

**Walls (4-bit autotile):**
- `wall_00` through `wall_15` — Autotile variants (blocks movement and sight)
- **Bitmask:** N=1, E=2, S=4, W=8 (sum neighbors)
- Example: `wall_05` = N+S connected, `wall_15` = all sides connected

**Bases:**
- `base_red` — Red team base (64×64, top-left corner)
- `base_bot` — Bot team base (64×64, bottom-right corner)

### Extended Tiles (`tiles2` group)

From `tiles2_placeholder.png` (512×160). Additional terrain and props.

**Autotiles (4-bit bitmask like walls):**
- `path_00` through `path_15` — Path autotile
- `water_00` through `water_15` — Water autotile (blocks movement)

**Bridges and terrain:**
- `bridge_h`, `bridge_v` — Horizontal/vertical bridge (walkable over water)
- `mud` — Mud tile (walkable, 50% speed)
- `tall_grass`, `flowers` — Decor (walkable)
- `pebbles` — Decor (walkable)

**Props (32×32, blocking unless noted):**
- `rock_small`, `rock_big` — Rocks (block movement)
- `laptop_desk` — Laptop on desk (blocks movement)
- `pizza_box` — Pizza box (blocks movement)
- `beer_keg` — Beer keg (blocks movement)
- `server_rack` — Server rack (blocks movement)
- `sign`, `cable` — Decor props
- `tree` — Large tree (64×64, blocks movement and sight)

### FX and Props (`fx` group)

From `fx_props_placeholder.png` (256×96).

**Flags:**
- `flag_red_0`, `flag_red_1` — Red flag animation (250ms each)
- `flag_bot_0`, `flag_bot_1` — Bot flag animation (250ms each)
- Pivot: (9, 30)

**Effects:**
- `respawn_0`, `respawn_1`, `respawn_2`, `respawn_3` — Respawn animation (80ms each)
- `tag_hit_0`, `tag_hit_1`, `tag_hit_2` — Tag hit burst (60ms each)
- Pivot: (16, 16) center

**Emotes and indicators (16×16):**
- `emote_lol`, `emote_bang`, `emote_q`, `emote_skull`, `emote_beer` — Chat emotes
- `score_red`, `score_bot` — Score icons
- `flag_carried_indicator` — Flag carrier badge (bobs 2px every 250ms)

### Command FX (`fx_command` group)

From `fx_command_placeholder.png` (224×64).

**Selection rings (32×16):**
- `sel_ring_red_0`, `sel_ring_red_1` — Red selection ring animation
- `sel_ring_bot_0`, `sel_ring_bot_1` — Bot selection ring animation

**Pings (32×32):**
- `ping_red_0`, `ping_red_1`, `ping_red_2` — Red ping animation
- `ping_bot_0`, `ping_bot_1`, `ping_bot_2` — Bot ping animation

**Pins and emotes (16×16):**
- `pin_red`, `pin_bot` — Location pins
- `emote_thinking_0`, `emote_thinking_1`, `emote_thinking_2` — Thinking emote
- `emote_broke_0`, `emote_broke_1` — Out of CP emote

### Power-ups (`powerups` group)

From `powerups_placeholder.png` (256×32).

Each power-up has 2 frames for bob animation (250ms each):
- `pu_speed_0`, `pu_speed_1` — Speed boost (lightning)
- `pu_slow_0`, `pu_slow_1` — Slow debuff (snail)
- `pu_shield_0`, `pu_shield_1` — Shield (bubble)
- `pu_spare_0`, `pu_spare_1` — Spare slot

Pivot: (16, 30)

### UI Orders (`ui_orders` group)

From `ui_orders_placeholder.png` (256×80).

**Button states (32×32):**
- `btn_normal`, `btn_pressed`, `btn_disabled`

**Order icons (32×32) and badges (16×16):**
- `ord_rally`, `badge_rally` — Rally to point
- `ord_scout`, `badge_scout` — Scout area
- `ord_defend`, `badge_defend` — Defend location
- `ord_escort`, `badge_escort` — Escort carrier
- `ord_attack`, `badge_attack` — Attack enemy
- `ord_tag`, `badge_tag` — Tag carrier
- `ord_reroute`, `badge_reroute` — Reroute pathfinding
- `ord_beer`, `badge_beer` — Beer Rush (8 CP, once/round)

**Other:**
- `cursor_invalid` — Invalid cursor/target (16×16)

### UI Economy (`ui_economy` group)

From `ui_economy_placeholder.png` (96×40).

**CP (Command Points):**
- `cp_coin_32` — CP coin icon (32×32)
- `cp_coin_16` — CP coin icon (16×16)

**Order capacity pips (8×12):**
- `pip_full`, `pip_empty` — Filled/empty order capacity pip

**Counters:**
- `orders_counter` — Order counter background (16×16)
- `cost_plate` — Cost display plate (12×10)

**Digits (6×8):**
- `digit_0` through `digit_9`, `digit_slash` — Monospace digits for counters

## Blocking and Vision

### Movement Blocking

The following tiles **block player movement**:
- All `wall_*` variants (wall autotiles)
- All `water_*` variants (water autotiles, unless on a bridge)
- `crate_beer` (beer crate)
- `rock_small`, `rock_big` (rocks)
- `laptop_desk`, `pizza_box`, `beer_keg`, `server_rack` (props)
- `tree` (large tree, 64×64)

**Passable but slow:**
- `mud` — Reduces movement speed to 50%

**Passable:**
- `grass_a`, `grass_b`, `path` (floor tiles)
- `bridge_h`, `bridge_v` (bridges over water)
- `bush`, `tall_grass`, `flowers`, `pebbles`, `sign`, `cable` (decor)

### Vision Blocking

The following tiles **block line-of-sight**:
- All `wall_*` variants
- `tree` (large tree, 64×64)
- `bush` (blocks vision but not movement)

## Game Defaults

The current game configuration:
- **Teams:** Red (humans) vs Bot (bots)
- **Bots per team:** 3
- **Flags:** 1 per base
- **Win condition:** First to 3 captures
- **Map size:** 64×40 tiles
- **Tile size:** 32×32 pixels
- **Render scale:** 2× (nearest-neighbor)
- **Pivot:** Characters and power-ups at (16, 30) for proper tile alignment
- **Beer Rush:** Kept as `ord_beer` / `badge_beer` (8 CP special order, once per round)

## Atlas Format

The `atlas.json` uses a **grouped format** where sprites are organized by category. Each group has:
- `meta.image` — The sprite sheet filename (supports `{team}` template for characters)
- `meta.pivot` — Optional pivot point `[x, y]` for the group
- `frames` — Object mapping frame names to `{x, y, w, h}` rectangles

Example:
```json
{
  "char": {
    "meta": {
      "image": "char_{team}_sheet_placeholder.png",
      "pivot": [16, 30]
    },
    "frames": {
      "char_down_idle": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "char_down_run1": { "x": 32, "y": 0, "w": 32, "h": 32 }
    }
  }
}
```

For characters, the `{team}` placeholder in the image path is replaced with `red`, `bot`, or `mask` at load time.

## Using the Sprites

### With the Sprite Loader Module

The repository includes `apps/web/spriteLoader.js`, a minimal ES6 module for loading and rendering sprites:

```javascript
import { spriteLoader } from "./spriteLoader.js";

// Load the atlas (call once at startup)
await spriteLoader.load();

// Get sprite data
const sprite = spriteLoader.getSprite("char_down_idle", "red");
// Returns: { image, x, y, w, h, pivot }

// Draw at tile coordinates
spriteLoader.drawTile(ctx, "char_down_idle", tileX, tileY, 32, 2, "red");

// Draw at pixel coordinates
spriteLoader.drawAt(ctx, "flag_red_0", screenX, screenY, 2);

// Check if sprite exists
if (spriteLoader.hasSprite("wall_15")) { /* ... */ }

// Get all keys in a group
const tileKeys = spriteLoader.getGroupKeys("tiles");
```

**Integration:** The loader is ready to use but not yet wired into the existing renderer. To integrate:
1. Import `spriteLoader` in `game.js` or the main render module
2. Call `spriteLoader.load()` before the game loop starts
3. Replace shape fallbacks with `spriteLoader.drawTile()` or `spriteLoader.drawAt()`
4. Pass `team` parameter ("red" or "bot") for character sprites

The existing `atlas.js` and `assets.js` use a different atlas format and will continue to work as a fallback.

## Regenerating Assets

### Generate Placeholder Sheets

Run `gen.py` to regenerate all placeholder sprite sheets:

```bash
cd tools/art
python3 gen.py
# Outputs: char_*_sheet_placeholder.png, tiles*.png, fx_*.png, ui_*.png, powerups_placeholder.png
# Copy to apps/web/assets/ if needed
```

The script draws flat-color placeholder sprites based on the specs in `sprite-spec.md`.

### Generate Reference Map

Run `mapgen_reference.py` to generate a reference procedural map:

```bash
cd tools/art
python3 mapgen_reference.py
# Outputs: preview map images showing terrain generation
```

This script demonstrates the map generation algorithm and validates connectivity.

### Validate Atlas

Run `validate_atlas.js` to check atlas integrity:

```bash
node tools/art/validate_atlas.js
# Or specify a custom path:
# node tools/art/validate_atlas.js path/to/assets
```

This validates:
- All referenced sprite sheets exist
- All frame rectangles fit within their images
- No out-of-bounds coordinates

### Check Palette Compliance

Run `check_palette.py` to validate colors:

```bash
cd tools/art
python3 check_palette.py image.png
```

Checks if an image uses only colors from the approved palette (`palette.hex`).

## Art Style

The placeholder art uses a flat emoji style with:
- 32×32 pixel tiles and frames
- Nearest-neighbor scaling (no smoothing)
- Integer zoom (2× recommended)
- High-contrast, readable colors
- Simple silhouettes for gameplay clarity

See `style-guide.md` for visual direction and `palette.md` for the color palette.

## See Also

- [sprite-spec.md](sprite-spec.md) — Detailed technical sprite specifications
- [style-guide.md](style-guide.md) — Visual style guidelines
- [palette.md](palette.md) — Color palette reference
- [bots-play-flow.md](bots-play-flow.md) — Commander model gameplay flow
- [shot-list.md](shot-list.md) — Key visual moments
- [Main README](../../README.md) — Project overview
