# Shot list (Team Red vs Team Bot; all units are bots, each side human- or AI-commanded)
## P0 (playable demo in 3 h); placeholders exist
- [ ] Floor grass_a/b
- [ ] Wall set wall_00..wall_15
- [ ] Character mask sheet (4 dirs × idle/run1/run2) + red/bot swaps
- [ ] Flags red + bot (2f)
- [ ] Base pads red + bot (64x64)
## P1
- [ ] Path, bush, beer crate
- [ ] Carrier grin frames + flag-carried indicator
- [ ] Dizzy/tagged (3f), respawn pop (4f), tag hit (3f)
- [ ] Power-ups: speed, slow, shield (+ spare slot) with 2f bob
- [ ] Score icons
## P2
- [ ] Taunt/laugh (2f), emotes (lol, !, ?, skull, beer)
- [ ] 3rd team ramp, extra grass variants, victory poses

# Command UI (bots play, humans command), added 2026-11-05. See bots-play-flow.md §3
## P0
- [x] (done-placeholder) ui_bubble order button base 32x32 (normal / pressed / disabled)
- [x] (done-placeholder) Order icons 32x32: ord_rally 📣, ord_scout 👀, ord_defend 🏰, ord_escort 🤝, ord_attack 🚩, ord_tag 🎯
- [x] (done-placeholder) Order badges 16x16 (same 6, redrawn small) for above-head current order
- [x] (done-placeholder) cp_icon ⚡ energy coin 32x32 + 16x16; budget bar pips 8x12 (full/empty)
- [x] (done-placeholder) ui_orders_counter 📜 16x16
- [x] (done-placeholder) Selection ring 32x16, 2f @200 ms (mask-recoloured)
- [x] (done-placeholder) Ping marker 32x32 ripple 3f @100 ms + 16x16 pin (mask-recoloured)
- [x] (done-placeholder) emote_thinking 💭 16x16 3f @200 ms
- [x] (done-placeholder) emote_broke 🪫 not-enough-points 16x16 2f shake @250 ms
## P1
- [x] (done-placeholder) ord_reroute ↪️ 32x32 + 16x16 badge
- [x] (done-placeholder) ord_beer 🍺 Beer Rush 32x32 + 16x16 badge; still to do: Beer Rush FX 32x32 3f @80 ms
- [x] (done-placeholder) Invalid-target cursor ❌ 16x16
- [ ] Jump buttons 🏠 🚩 🏃 16x16 in 40 px bubble
- [ ] Role chips Runner/Guard/Roamer 16x16
## P2
- [ ] Commander portraits human/AI 32x32
- [ ] Result-screen "CP spent" stamp 64x32
(Code-drawn, no asset: intent line + path dot, cooldown sweep.)
- [x] (done-placeholder) Cost digit strip 0-9 + slash 6x8, cost plate; mocks ui_mock_portrait.png / ui_mock_landscape.png

# Map rework (winding paths, busier map), done-placeholder
- [x] (done-placeholder) Path autotile 16 (path_00..15)
- [x] (done-placeholder) Water autotile 16 (water_00..15) + bridge_h / bridge_v
- [x] (done-placeholder) Tall grass, flowers, pebbles, sign, cable
- [x] (done-placeholder) Rocks small/big, tree 64x64, mud
- [x] (done-placeholder) Hackathon props: laptop desk, pizza box, beer keg, server rack
- [x] (done-placeholder) mapgen_reference.py + preview_map_full / seed1 / seed2 / preview_x2
