# Third-Party Notices

This static web application is 100% self-hosted with zero external runtime network requests.

## 1. Babylon.js (`v9.36.0`) & Havok Physics (`v1.3.14`)
- Packages: `@babylonjs/core@9.36.0`, `@babylonjs/loaders@9.36.0`, `@babylonjs/materials@9.36.0`
- License: Apache License 2.0 (Copyright © Babylon.js contributors / Microsoft)
- Package: `@babylonjs/havok@1.3.14` (`site/assets/havok/HavokPhysics.wasm`)
- License: MIT / Havok Physics WebAssembly runtime distributed via `@babylonjs/havok` (see `node_modules/@babylonjs/havok/LICENSE` when installed).

## 2. FlowerSong Subset Font (`flower-song.woff2`)
- Path: `site/assets/flower-song.woff2`
- License: SIL Open Font License 1.1 (see `site/assets/FONT-LICENSE.txt`)

## 3. Bundled 3D Botanical & Aquatic `.glb` Assets (`site/assets/models/`)
All 3D models below are self-hosted locally in `site/assets/models/` with texture optimization for real-time WebGL2 rendering:

1. `site/assets/models/freshwater_shrimp.glb`
   - Title: "Macrobrachium Rosenbergii" (Giant Freshwater River Prawn)
   - Author: BlueMesh (Sketchfab UID `fbeca11a9b524df0b43f341d4152cc69`)
   - License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   - Modifications: Texture downscaled to 512px for real-time WebGL delivery.

2. `site/assets/models/ryukin_goldfish.glb`
   - Title: "Ryukin goldfish"
   - Author: somitsu (Sketchfab UID `df9a7c57c2b34d5a818f360e679b576a`)
   - License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   - Modifications: Texture downscaled to 512px for real-time WebGL delivery.

3. `site/assets/models/pond_koi.glb`
   - Title: "Goldfish"
   - Author: jc.sekinger (Sketchfab UID `071e439aee854058946e537949bf665e`)
   - License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   - Modifications: Texture downscaled to 512px for real-time WebGL delivery.

4. `site/assets/models/waterlily.glb`
   - Title: "Hand Painted Lotus Plant"
   - Author: sarath.irn.kat005 (Sketchfab UID `aeceb27b863e4a9280197d601ef54fc9`)
   - License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   - Modifications: Texture downscaled to 512px for real-time WebGL delivery.

5. `site/assets/models/rose_bush.glb`
   - Title: "Rose bush"
   - Author: RosticOstafi (Sketchfab UID `3f97dc47b0fd4b1382f169d2f169d2f1` / `3f97dc47b0fd4b1382f169d2f137949b`)
   - License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   - Modifications: Texture downscaled to 512px and petal albedo luminance normalized for multi-hue botanical instancing.

6. `site/assets/models/margarita_bush.glb`
   - Title: "Margarita flower bush"
   - Author: blujay (Sketchfab UID `c88faa52930e487a866886f8015a7957`)
   - License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   - Modifications: Texture downscaled to 512px for real-time WebGL delivery.

7. `site/assets/models/wisteria_cascade.glb`
   - Title: "Wisteria Flowers"
   - Author: omiyaio (Sketchfab UID `44e25413e466466d878114d28b67a048`)
   - License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   - Modifications: Texture downscaled to 512px and petal luminance normalized for multi-hue cascade tinting.

8. `site/assets/models/hero_rose.glb`
   - Title: "Rose"
   - Author: Heliona (Sketchfab UID `6281bf3703584323bb4d8326f1f1b59d`)
   - License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   - Modifications: Texture downscaled to 512px for real-time WebGL delivery.

9. `site/assets/models/ph_fern.glb` & `site/assets/models/ph_periwinkle.glb`
   - Titles: `fern_02` and `periwinkle_plant`
   - Author: Poly Haven
   - License: CC0 1.0 Universal (Public Domain Dedication)

## 4. Bundled 3D Photogrammetry Furniture & Vintage Prop `.glb` Assets (`site/assets/models/ph_*.glb`)
All 18 real-world scanned furniture, lighting, tableware, and vintage prop models below originate from Poly Haven and are dedicated to the public domain under **CC0 1.0 Universal** (with textures downscaled & repacked locally for real-time WebGL2 & single-file offline HTML delivery):

10. `site/assets/models/ph_sofa.glb` — `Sofa_01` (Poly Haven, CC0 1.0)
11. `site/assets/models/ph_green_chair.glb` — `GreenChair_01` (Poly Haven, CC0 1.0)
12. `site/assets/models/ph_armchair.glb` — `ArmChair_01` (Poly Haven, CC0 1.0)
13. `site/assets/models/ph_chandelier.glb` — `Chandelier_03` (Poly Haven, CC0 1.0)
14. `site/assets/models/ph_ornate_mirror.glb` — `ornate_mirror_01` (Poly Haven, CC0 1.0)
15. `site/assets/models/ph_console.glb` — `ClassicConsole_01` (Poly Haven, CC0 1.0)
16. `site/assets/models/ph_nightstand.glb` — `ClassicNightstand_01` (Poly Haven, CC0 1.0)
17. `site/assets/models/ph_coffee_table.glb` — `CoffeeTable_01` (Poly Haven, CC0 1.0)
18. `site/assets/models/ph_tea_set.glb` — `tea_set_01` (Poly Haven, CC0 1.0)
19. `site/assets/models/ph_mantel_clock.glb` — `mantel_clock_01` (Poly Haven, CC0 1.0)
20. `site/assets/models/ph_picture_frame.glb` — `fancy_picture_frame_02` (Poly Haven, CC0 1.0)
21. `site/assets/models/ph_bistro_set.glb` — `outdoor_table_chair_set_01` (Poly Haven, CC0 1.0)
22. `site/assets/models/ph_brass_pan.glb` — `brass_pan_01` (Poly Haven, CC0 1.0)
23. `site/assets/models/ph_croissant.glb` — `croissant` (Poly Haven, CC0 1.0)
24. `site/assets/models/ph_wicker_basket.glb` — `wicker_basket_02` (Poly Haven, CC0 1.0)
25. `site/assets/models/ph_watering_can.glb` — `watering_can_metal_01` (Poly Haven, CC0 1.0)
26. `site/assets/models/ph_alarm_clock.glb` — `alarm_clock_01` (Poly Haven, CC0 1.0)
27. `site/assets/models/ph_oil_lamp.glb` — `vintage_oil_lamp` (Poly Haven, CC0 1.0)
28. `site/assets/models/ph_cliff_01.glb` — `coastal_cliff_01` (Poly Haven, CC0 1.0)
29. `site/assets/models/ph_cliff_02.glb` — `coastal_cliff_02` (Poly Haven, CC0 1.0)
30. `site/assets/models/ph_coast_rocks.glb` — `coast_rocks_01` (Poly Haven, CC0 1.0)
31. `site/assets/models/ph_coast_rocks_b.glb` — `coast_rocks_03` (Poly Haven, CC0 1.0)
32. `site/assets/models/ph_moss_boulder.glb` — `rock_moss_set_01` (Poly Haven, CC0 1.0)
33. `site/assets/models/ph_coastal_shrub.glb` — `shrub_02` (Poly Haven, CC0 1.0)
34. `site/assets/models/ph_lifebuoy.glb` — `lifebuoy` (Poly Haven, CC0 1.0)
35. `site/assets/models/ph_picnic_table.glb` — `wooden_picnic_table` (Poly Haven, CC0 1.0)

## 5. First-Party Blender 4.0.2 Sculpted & Rigged `.glb` Assets
The 12 architectural, landscape, flora, fleet, and skeletal character `.glb` bundles below are first-party assets generated specifically for this project via Blender 4.0.2 scripts in `tools/blender/`:

- `site/assets/models/couple_xian.glb` — Stylized anime couple character ("小贤贤"), full armature, 17 NLA animation clips, Head/Lash shape keys (`EyeBlink`, `Smile`, `Kiss`, `ShyBlush`), painted iris/skin UVs
- `site/assets/models/couple_ran.glb` — Stylized anime couple character ("小冉子"), full armature, 17 NLA animation clips, Head/Lash shape keys
- `site/assets/models/coastal_villa.glb` — Two-story Provencal stone & timber villa with walkthrough doorway, staircase, interior paneling, animated shutters/doors/gramophone/globe/coffee-lever
- `site/assets/models/garden_monet_pond.glb` — Monet cascading stone pond & waterfall tiers
- `site/assets/models/garden_swing_arches.glb` — Bougainvillea swing pergola & bench arches
- `site/assets/models/coastal_lighthouse.glb` — Harbor stone & crimson-stripe lighthouse with gallery & lantern room
- `site/assets/models/hilltop_windmill.glb` — Sail windmill tower & rotating rotor
- `site/assets/models/creek_bridge.glb` — Arched stone creek footbridge
- `site/assets/models/cliffside_gazebo.glb` — Marble headland dome gazebo & swinging bench
- `site/assets/models/provencal_cottage.glb` — Pastel Provencal hillside stone cottages
- `site/assets/models/harbor_fleet.glb` — Harbor yacht cruiser, coastal sloop & launch hulls
- `site/assets/models/stylized_trees.glb` — Cypress, olive, pine & cherry canopy variants for botanical instancing
