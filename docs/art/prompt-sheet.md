# Prompt sheet
**Tools:** Grok Imagine (paste base block + asset prompt; ask for a flat image on a plain background), or Stable Diffusion (SDXL with a flat sticker/emoji LoRA; negative block; CFG 5–7).
**Mascot:** to match the real Grok Bot mascot/logo, ATTACH a reference image of it. These prompts describe only a generic round emoji bot with an antenna.
**Honesty:** generator output is concept/rough art, not final. Grids, palettes and frame counts will be off.

## Base style block (prepend)
> flat emoji sticker style 2D top-down game sprite, cute silly round emoji bot characters with a small antenna and big expressive eyes, Twemoji / Fall Guys / Among Us feel, thick 2px dark outline #2B1B33 at 32px scale, flat colour fills, one shadow shade and one highlight blob per shape, light from top-left, soft round drop shadow, transparent background, evenly spaced sprite grid, exact palette only: #2B1B33, #1A1020, #E89A1C, #FFCC33, #FFF0A0, #FFFFFF, #FF8FA0, #5BA84A, #7CC85A, #E8C890, #6A6A8A, #9A9AB8, #1F6E4E, #2F9A6A, #8A5230, #C07A40, #6E1020, #C42032, #FF7A6E, #4A2A90, #A27BFF, #DCC8FF

## Negative block
> realistic, photo, 3D render, gradients, soft painterly shading, text, letters, watermark, logo, gore, blood, weapons, guns, military, camouflage, isometric perspective, noise, cluttered background, cropped sprites, uneven grid

## Asset prompts
1. **Character mask sheet.** 128x192 px sheet, 32x32 cells: rows facing down, left, right, up (up = back of head); cols idle, run1, run2 with squash-and-stretch bounce. Row 5: carrier grin holding a flag stick ×2, laughing taunt ×2. Row 6: dizzy X-eyes with orbiting stars ×3. Round emoji-yellow face (#FFCC33, #E89A1C, #FFF0A0), white eyes, pink blush #FF8FA0; headband and antenna tip in neutral greys #505050 #8C8C8C #D0D0D0 for recolouring. Slight top-down view.
2. **Floor tiles.** 32x32 seamless straight top-down tiles: cartoon grass ×2 (#7CC85A, #5BA84A), sandy path #E8C890. No outlines.
3. **Walls autotile.** 512x32 strip, 16 tiles of 32x32: rounded cartoon stone wall blocks (#9A9AB8 top, #6A6A8A side), 4-bit autotile where tile n connects N=1, E=2, S=4, W=8 (0 = pillar … 15 = cross). Straight top-down.
4. **Props.** 32x32 each: a round-leaved bush (#2F9A6A, #1F6E4E) and a wooden beer crate with bottle tops (#C07A40, #8A5230, #E89A1C), outlined, with drop shadow.
5. **Flags and bases.** Flags 32x32 ×2 waving frames: Team Red (#6E1020 #C42032 #FF7A6E) with a white SQUARE badge, Team Bot purple (#4A2A90 #A27BFF #DCC8FF) with a white ROUND badge, wooden pole. Base pads 64x64: a round team-coloured platform with the badge in the middle.
6. **Power-ups.** 32x32 ×2 bob frames each: white round bubble with an emoji glyph: lightning bolt (speed), snail (slow), bubble shield (shield), plus one blank spare.
7. **FX and emotes.** 32x32: respawn pop rings ×4, tag hit star burst ×3. 16x16 speech-bubble emotes: lol, !, ?, skull, beer mug.

## How to fix the output
1. Crop to the sheet, then downscale with **nearest-neighbour** to the true size (32 px per cell).
2. Clear the background to alpha.
3. Hand it to me (the art director). I snap every opaque pixel to `palette.hex`, slice it to the `atlas.json` layout with a script, run `check_palette.py`, and hand-fix outlines, pivots and frame alignment.
