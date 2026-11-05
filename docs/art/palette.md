# Flag Raid palette: emoji style (27 colours + 1 reserved)
Files: palette.gpl, palette.hex, palette.png. `shadow` is drawn only at ~35% alpha (A=89). Anti-aliased edge pixels may use partial alpha. Every OPAQUE pixel must be within RGB distance 12 of a palette colour (see `check_palette.py`).

| Hex | Name | Role |
|---|---|---|
| `#2B1B33` | outline | 2px outline, pupils, mouths |
| `#1A1020` | shadow | drop shadow ONLY, drawn at 35% alpha |
| `#E89A1C` | face_shadow | emoji face shade (bottom-right) |
| `#FFCC33` | face | emoji face base |
| `#FFF0A0` | face_hi | face highlight blob, stars, lightning |
| `#FFFFFF` | eye_white | eye whites, UI text, sparkles |
| `#FF8FA0` | blush | cheeks, tongue, snail shell |
| `#5BA84A` | grass_dark | grass shade/tufts |
| `#7CC85A` | grass | grass base |
| `#E8C890` | path | path base |
| `#6A6A8A` | wall_dark | wall side/shade |
| `#9A9AB8` | wall | wall top |
| `#1F6E4E` | bush_dark | bush shade (teal-green) |
| `#2F9A6A` | bush | bush leaves (teal-green) |
| `#8A5230` | wood_dark | crate/pole shade |
| `#C07A40` | wood | crate, flag pole |
| `#6E1020` | red_0 | Team Red dark |
| `#C42032` | red_1 | Team Red main |
| `#FF7A6E` | red_2 | Team Red light |
| `#4A2A90` | bot_0 | Team Bot dark |
| `#A27BFF` | bot_1 | Team Bot main (purple) |
| `#DCC8FF` | bot_2 | Team Bot light |
| `#505050` | mask_0 | MASK -> team _0 (source only) |
| `#8C8C8C` | mask_1 | MASK -> team _1 |
| `#D0D0D0` | mask_2 | MASK -> team _2 |
| `#4FA8E8` | water | water surface (was reserved slot 1) |
| `#2E6FB8` | water_dark | water edge (was reserved slot 2) |
| (reserved) | team3 | 1 slot left; a 3rd team needs 1 new + 2 reused, or the palette grows to 30 |

**Ramps:** face #E89A1C #FFCC33 #FFF0A0 · grass #5BA84A #7CC85A · path #E8C890 · wall #6A6A8A #9A9AB8 · bush (teal) #1F6E4E #2F9A6A · wood #8A5230 #C07A40
**Team Red** (bot units, human- or AI-commanded, top-left, SQUARE badge): #6E1020 #C42032 #FF7A6E · **Team Bot** (bot units, human- or AI-commanded, bottom-right, ROUND badge, purple): #4A2A90 #A27BFF #DCC8FF

## Mask → team mapping
| Mask | Used on | Red | Bot | Team 3 (spare) |
|---|---|---|---|---|
| mask_0 #505050 | headband underside, back knot, antenna outline accent | red_0 | bot_0 | team3_0 |
| mask_1 #8C8C8C | headband, antenna tip (main) | red_1 | bot_1 | team3_1 |
| mask_2 #D0D0D0 | headband highlight line | red_2 | bot_2 | team3_2 |
The face always stays emoji yellow. Only the antenna tip, headband and badge carry team colour; the badge shape (square/round) is added per team.

## Separation checks
- Lightness: red_1 (L≈44) vs bot_1 (L≈60), red_2 vs bot_2 differ too, and the shape cue covers the rest.
- Bot purple vs the teal bushes: different hue and lightness. Purple on an emoji-yellow face has strong contrast.
