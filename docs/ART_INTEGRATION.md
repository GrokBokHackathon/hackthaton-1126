# Art Integration Guide

## Current State: Atlas System Fully Implemented ✅

The rendering system on `main` is fully atlas-driven with graceful fallback to emoji/shapes.

### What's Implemented

1. **Atlas Loading** (`apps/web/atlas.js`)
   - Loads `atlas.json` and all sprite sheets on startup
   - Async image loading with error handling
   - Frame lookup by name
   - Graceful failure when assets missing

2. **Rendering Pipeline** (`apps/web/assets.js`)
   - All rendering goes through atlas first
   - Falls back to emoji/colored shapes on load failure
   - Character animations: idle, run1, run2, carrying, dizzy, respawn
   - Wall autotile with 4-bit bitmask (N=1, E=2, S=4, W=8)
   - Animated flags (2 frames at 250ms)
   - Base pads rendered from atlas (64x64)
   - FX: respawn (4 frames, 80ms), hit (3 frames, 60ms)

3. **Asset Configuration** (`apps/web/atlas.js` ASSET_CONFIG)
   ```javascript
   {
     basePath: "./assets/",
     atlasFile: "atlas.json",
     sheets: {
       charRed: "char_red_sheet_placeholder.png",
       charBot: "char_bot_sheet_placeholder.png",
       charMask: "char_mask_sheet_placeholder.png",
       tiles: "tiles_placeholder.png",
       fxProps: "fx_props_placeholder.png",
       powerups: "powerups_placeholder.png",
     }
   }
   ```

### Character Sheet Layout

As specified by art director:
- **Grid**: 32×32 px per frame
- **Sheet size**: 128×192 px (4 cols × 6 rows)
- **Rows**:
  - 0: down [idle, run1, run2]
  - 1: left [idle, run1, run2]
  - 2: right [idle, run1, run2]
  - 3: up [idle, run1, run2]
  - 4: [carrying×2, taunt×2]
  - 5: [dizzy×3, spare]
- **Pivot**: Center-bottom at (16, 30)
- **Teams**: Red (#C42032), Bot (#A27BFF) - recolored from mask sheet

### Tile Atlas Layout

- **Grass**: 2 variants
- **Path, Bush, Crate**: Single tiles
- **Walls**: 16 variants (wall_0 to wall_15) for 4-bit autotile
- **Bases**: 64×64 px (2×2 tiles) per team

### FX & Props

- **Flags**: 2 frames per team (flag_red_0/1, flag_bot_0/1)
- **Respawn**: 4 frames (fx_respawn_0 to 3)
- **Hit**: 3 frames (fx_hit_0 to 2)
- **Carried flag indicator**: 16×16 sprite

### Sample Atlas Structure

A working `atlas.json` is in `apps/web/assets/atlas.json` with all frame definitions.

### How to Add Real Art

1. Place PNGs in `apps/web/assets/`:
   - `char_red_sheet_placeholder.png`
   - `char_bot_sheet_placeholder.png`
   - `char_mask_sheet_placeholder.png`
   - `tiles_placeholder.png`
   - `fx_props_placeholder.png`
   - `powerups_placeholder.png`

2. Update `atlas.json` if frame positions differ

3. For final art (no _placeholder suffix):
   ```javascript
   // In atlas.js ASSET_CONFIG.sheets:
   charRed: "char_red_sheet.png",
   charBot: "char_bot_sheet.png",
   // etc.
   ```

### Testing

The system automatically detects when atlas/images fail to load and falls back to:
- **Characters**: Emoji 🤖 with team-colored ring
- **Tiles**: Colored rectangles/circles
- **Flags**: Emoji 🚩
- **Bases**: Colored rectangles

Test current state:
```bash
# Without art (fallback mode)
cd apps/web && python3 -m http.server 3000
# Open http://127.0.0.1:3000/ - will show emoji/shapes

# With art
# Place PNGs in assets/ folder, reload page - will show sprites
```

### What Works Now

✅ Atlas loads on page load
✅ Character frame selection based on state and direction
✅ Run animation cycles at 150ms
✅ Wall autotile calculates neighbors and picks correct frame
✅ Flags animate at 250ms
✅ Respawn FX plays at 80ms per frame
✅ Tagged players show dizzy animation
✅ Graceful fallback when assets missing
✅ All paths in single config for final art swap

### Next Steps

When art pack arrives:
1. Extract PNGs to `apps/web/assets/`
2. Verify atlas.json frame definitions match
3. Reload page - sprites will automatically load
4. If any frames missing, check console warnings
5. Update paths in ASSET_CONFIG for final art

System shipped and working on `main`! 🎨
