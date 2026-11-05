# Collision and Terrain System

This document describes the authoritative movement, collision detection, and terrain mechanics implemented in the Flag Raid game server. Addresses [issue #23](https://github.com/GrokBokHackathon/hackthaton-1126/issues/23).

## Overview

The collision system uses **character footprints** rather than center-point checking to provide realistic collision with walls, crates, and map boundaries. The system prevents tunneling through thin obstacles and supports terrain-based movement modifiers like tree slowdown.

## Coordinate System

- **Coordinate units**: All game coordinates (player positions, tile indices) are in **tiles**, not pixels
- **Tile size**: 32 pixels (rendering constant, `CONFIG.tileSize`)
- **Position coordinates**: Floating-point tile coordinates where (1.5, 2.3) means 1.5 tiles right and 2.3 tiles down
- **Tile indices**: Integer coordinates used for tile array lookups via `Math.floor(x)` and `Math.floor(y)`

## Terrain Tile Types

| ID | Name  | Walkable | Blocks Vision | Movement Speed | Description |
|----|-------|----------|---------------|----------------|-------------|
| 0  | FLOOR | ✓        | ✗             | 100%           | Normal walkable terrain |
| 1  | WALL  | ✗        | ✓             | N/A            | Hard obstacle blocking movement and sight |
| 2  | CRATE | ✗        | ✗             | N/A            | Hard obstacle blocking movement only |
| 3  | BUSH  | ✓        | ✓             | 100%           | Walkable but blocks line of sight |
| 4  | TREE  | ✓        | ✓             | 50%            | Walkable but slows movement, blocks sight |

### Tree Terrain

Trees (tile type 4) are **walkable but slow movement** by a configurable factor:
- **Slowdown factor**: `CONFIG.treeSlowdown = 0.5` (50% speed)
- **Movement cost for A***: 2.0 (reflecting the 2x time to traverse)
- **Vision blocking**: Trees block line of sight (added to `CONFIG.visionBlockers`)
- Trees are never hard-blocking obstacles

**Tuning parameter**: `CONFIG.treeSlowdown` can be adjusted. Current value of 0.5 matches the documented mud behavior from sprite-spec.md. If a different value is desired, update this constant and document the rationale.

## Character Footprint Collision

### Sprite Pivot and Footprint

From `apps/web/assets/atlas.json`:
- **Sprite pivot**: (16, 30) pixels = (0.5, 0.9375) tiles
- **Pivot position**: Center-bottom of the 32×32 sprite, 2px above the tile bottom
- **Footprint radius**: `CONFIG.footprintRadius = 0.3` tiles (circular collision area)

The footprint is a circle centered at the character's position (which matches the sprite pivot in game coordinates). This means collision checking happens around the character's feet, not their head or center of mass.

### Collision Detection Algorithm

The `checkFootprintCollision()` function checks if a circular footprint at position (x, y) collides with blocking terrain:

1. Check the center point: `isBlocking(tiles, x, y)`
2. Check 8 perimeter points (cardinal + diagonal directions) at `footprintRadius` distance
3. Return `true` if **any** point is inside a blocking tile (WALL or CRATE)

**Checked points** (relative to center):
- Cardinal: E, W, S, N at radius distance
- Diagonal: SE, SW, NE, NW at `radius * 0.707` distance (√2/2)

This ensures:
- Characters cannot clip through corners
- Wall sliding works (diagonal movement slides along walls)
- Map bounds are respected (footprint cannot exceed tile boundaries)

### Movement Implementation

Movement is applied in **bounded substeps** to prevent tunneling:

1. Calculate desired movement: `delta = direction * speed * dt`
2. Determine number of substeps: `max(1, ceil(|delta| / maxMovementStep))`
3. For each substep:
   - Check if both axes movement is valid → apply both
   - Else try X-only movement (wall sliding)
   - Else try Y-only movement (wall sliding)

**Constants**:
- `CONFIG.maxMovementStep = 0.5` tiles (prevents tunneling at high speeds)
- Substeps ensure no single movement exceeds this distance

### Terrain Speed Modifiers

Speed multipliers are applied **at the current position** before movement calculation:

```javascript
terrainMultiplier = isTileTree(player.x, player.y) ? CONFIG.treeSlowdown : 1.0
speed = baseSpeed * terrainMultiplier
```

This means:
- Entering trees gradually slows movement as the character center crosses the tree boundary
- No discrete speed "jump" when crossing tile boundaries
- Speed updates every tick based on current tile

## A* Pathfinding Agreement

The A* pathfinding in `apps/server/path.js` **agrees with authoritative movement**:

### Walkability
- `isWalkable()` returns `true` for FLOOR (0), BUSH (3), and TREE (4)
- Returns `false` for WALL (1) and CRATE (2)
- Matches the collision system's blocking rules

### Movement Costs
- **Normal tiles**: cost = 1.0 (base movement)
- **Tree tiles**: cost = 2.0 (reflecting 0.5x speed = 2x time to traverse)
- Cost is added to A*'s `gScore` during path expansion
- Higher cost causes A* to prefer routes that avoid trees when alternatives exist

### Cost Calculation
```javascript
tileCost = (tile === TREE) ? 2.0 : 1.0
tentative = gScore[current] + tileCost + avoidancePenalty
```

This ensures:
- Bots pathfind through trees if necessary
- But prefer faster routes around trees when available
- Path cost correctly reflects real-world traversal time

### Clearance and Footprint
A*'s tile-based walkability inherently assumes a character can stand at the tile center. The footprint radius (0.3 tiles) is smaller than the clearance to a wall (minimum 1.0 - 0.3 = 0.7 tiles from a blocking edge), so walkable tiles always have sufficient clearance for the footprint.

## Tunneling Prevention

**Problem**: At high movement speeds (e.g., speed powerups), a character might move more than one tile per tick, potentially passing through thin walls.

**Solution**: Bounded substeps
- Maximum substep size: `CONFIG.maxMovementStep = 0.5` tiles
- Large movements are broken into multiple smaller steps
- Each substep performs full footprint collision checking
- Ensures no movement exceeds 0.5 tiles without collision validation

**Example**: A 2.0 tile movement is broken into 4 substeps of 0.5 tiles each.

## Testing

Comprehensive tests in `apps/server/collision.test.mjs` cover:

1. **Footprint collision**:
   - Corner blocking (diagonal movement into corners)
   - Wall sliding (movement along walls when blocked)
   - Crate blocking (footprint respects crate boundaries)

2. **Tree slowdown**:
   - Speed reduction when in trees vs normal terrain
   - Entering/leaving tree areas (gradual speed change)
   - Ratio verification against `CONFIG.treeSlowdown`

3. **Tunneling prevention**:
   - High-speed movement through thin walls (prevented)
   - Substep validation

4. **A* pathfinding**:
   - Trees are walkable
   - Trees have higher cost (prefer routes around)
   - Clearance agreement with footprint

5. **Map bounds**:
   - Footprint respects boundary walls
   - Corner boundaries enforced

All tests pass as of this implementation.

## Implementation Files

- `apps/server/game.js`: Core collision logic, movement, terrain speed
- `apps/server/path.js`: A* pathfinding with tree costs
- `apps/server/collision.test.mjs`: Comprehensive collision tests
- `apps/server/game.test.mjs`: Movement integration tests

## Configuration Reference

From `apps/server/game.js CONFIG`:

```javascript
{
  tileSize: 32,              // pixels per tile (rendering only)
  playerSpeed: 3.0,          // tiles per second (base speed)
  footprintRadius: 0.3,      // tiles (collision circle)
  treeSlowdown: 0.5,         // multiplier (50% speed in trees)
  maxMovementStep: 0.5,      // tiles (tunneling prevention)
  visionBlockers: [1, 3, 4]  // WALL, BUSH, TREE
}
```

## Future Considerations

### Tuning Parameters Requiring Confirmation

1. **`CONFIG.treeSlowdown = 0.5`**: Currently matches mud behavior from sprite-spec.md. May need adjustment based on playtesting. Values closer to 1.0 make trees less impactful; values closer to 0.0 make trees nearly impassable.

2. **`CONFIG.footprintRadius = 0.3`**: Chosen to fit well within tile centers while providing realistic collision. Could be adjusted for gameplay feel (smaller = easier to slip through gaps, larger = more restrictive).

3. **`CONFIG.maxMovementStep = 0.5`**: Prevents tunneling at current max speeds. If speed powerups exceed ~6 tiles/second, this value may need reduction.

### Map Generation

The current map generator (`generateMap()` in `game.js`) does not yet place TREE tiles. Trees can be added to procedural maps by:
1. Adding tree placement logic to `generateMap()`
2. Ensuring trees don't spawn in base areas
3. Maintaining connectivity (trees are walkable, so won't break paths)

### Art Integration

Tree sprites exist in `tiles2_placeholder.png` as 64×64 (2x2 tile) frames. The renderer will need to:
1. Recognize tile type 4 as tree
2. Render the 64×64 tree sprite anchored at top-left of its tile position
3. Respect the sprite layering (trees behind/in front of characters)

See `docs/art/sprite-spec.md` and `docs/art/README.md` for sprite specifications.

## Related Issues and PRs

- [Issue #23](https://github.com/GrokBokHackathon/hackthaton-1126/issues/23): Use character footprints for collision and slow movement in trees (this implementation)
