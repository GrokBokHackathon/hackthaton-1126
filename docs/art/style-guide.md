# Flag Raid: style guide (emoji bots)
**Pillars**
1. **Silly and readable.** Big emoji faces, meme energy, Among Us-level clarity at 64 px.
2. **Flat sticker art.** Thick outline, flat fills, one shade and one highlight blob per shape.
3. **Party, not war.** Beer-crate cover, round base platforms, no guns, no gore, no military.

**References (mood):** Twemoji / Apple / Google emoji, Fall Guys, Among Us, Bomberman, Pac-Man.
**Teams:** every unit is a bot. Team Red (top-left) vs Team Bot/purple (bottom-right). Each side is commanded by a human or an AI commander (see bots-play-flow.md).
**Mascot:** generic round emoji bot with an antenna. To match the official Grok Bot mascot/logo, attach a real reference image; do not invent it.

**Rules**
- 32x32 tiles and character canvas, pivot (16,30). Integer scale x2 (64 px), nearest-neighbour.
- 2 px outline `#2B1B33` on characters, props and bubbles. Floors have no outline. Light comes from the top-left: highlight blob top-left, shade bottom-right.
- Soft round drop shadow under every character/prop: `shadow` at 35% alpha. Clean AA edges are allowed in source art; no gradients.
- Facing is shown by eye position and antenna lean. The up frame shows the back of the head (headband knot, no face).

**Readability**
- The team shows on the antenna tip, headband and badge (Red square, Bot round). The face is always yellow.
- Flag carrier: grin, a flag stick in the enemy colour, and a white indicator arrow above the head. The carrier must be the loudest thing on screen.
- Dizzy/tagged: X eyes, orbiting stars, wobble mouth.
- Floors are soft, mid-saturation greens and sand. Teams own the saturated reds and purples.
