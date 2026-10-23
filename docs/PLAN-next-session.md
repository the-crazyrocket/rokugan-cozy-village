# Plan: making everything deeper

Today the island is a pleasant toy: four verbs and one shrine chapter. The goal of this session and the ones after it is a **living island you play for a year**. Every system gets several layers of depth, and those layers feed each other.

- You **shape the land**: hills, ponds, streams, terraces.
- The land decides **what grows and what bites**: rice in paddies, tea on slopes, wasabi in streams.
- Crops and fish become **dishes and crafts**. Those feed **villagers, visitors and the Seven Fortunes**.
- Those in turn **unlock more land, recipes and seasons**.

The rules from [DESIGN.md](DESIGN.md) still hold:

- no energy and no punishment
- every return reveals something
- a 3-minute check-in should feel complete
- one thumb, portrait

Decisions already made:

- **Expansion uses two modes:** curated areas are unlocked as village projects, and you can also reclaim single tiles freely along the shore.
- **The player can raise hills:** terrain gets real height levels.

This is too much for one sitting. The ultracode session should aim at Waves 0–3. Waves 4–6 follow in later sessions, built on the same foundations.

## Progress (2026-10-23)

**Done:** Waves 0–2, and Wave 3 in a first playable form.

- **3.1** Kenji and Ume as painted 3D characters (`char_*` blockouts, cut up by bone, `render/painted-character.js`). Daily routines; talking and one gift a day for hearts; heart rewards. Ume moves in with the `ume_house` project.
- **3.2** Six visitors drawn by arrangements of props. Visits are rolled per hour, so a catch-up after time away draws the same as watching. Each visitor leaves gifts.
- **3.3** Tap a visitor to take its photo for the scrapbook. The collection book covers fish and bugs.
- **3.4** Daikoku: his offerings, then the mill (timed batches) and the kitchen (12 dishes found by trying ingredients, plus a stew fallback).
- **3.5** Nine bugs and the net.
- **2.8** in part: fly-to-bag, the koku tick and the "to do" ribbon.
- **UI theme:** `style/theme.css` (lacquered wood, washi paper, cloth banners, Zen Maru Gothic + Kaisei Decol).
- **UX pass:**
  - The hotbar holds only what a tap cannot guess: seeds in the play kit, and hoe/shovel/earth in the dig kit (G). The can, rod and net work by context.
  - The touch joystick is gone: a tap walks, a drag pans, a swipe over the field (or anywhere while digging) sweeps.
  - The ribbon's chores harvest or water the whole field in one tap; the welcome-back summary offers the same.
  - The shop has ×5 seeds and a sell total, opens on Sell with a haul, and moves on to Seeds after selling.
- **Trees:** the axe (dig kit) fells a grown tree for 3 wood and a stump that sprouts again after 36 h, or the shovel digs the stump out. Saplings (Hana, or sometimes from a felled tree) go in the seed slot and grow sapling → young → grown over a day, drawn small until grown.
- **Woodcutting, animated:** felling takes three axe strokes (swing, chips, the tree shudders), then the tree topples away from the player, lands in dust and leaves with a thud, and shrinks away. Walking off stops it and the tree stands again. View: `src/render/views/woodcut.js`, driven by the trees system's `chopHit` / `treeFell` / `chopStop` events.
- **Growing the island, by plot:** replaces filling the sea one tile at a time (which got too dear: ~2,200 stone and ~165k koku to double the island). In Dig, the earth basket on the sea beside the shore opens a plot sheet: 3×3 to 6×6, outlined on the water (also under the basket on hover). Price per tile 10 → 30 koku as plots add up, plus 0.4 stone and 0.2 wood a tile (a first 5×5: 250 koku, 10 stone, 5 wood). The village fills it in 30 min + 3 min a tile, also while away; pockets and notches of sea it leaves are filled too. Sand at first; 20 h later everything no longer by the sea (the old beach behind it too) is grass. Every second plot turns up a rock outcrop. Sea in Kenji's unbuilt project shapes (plus 2 tiles) is kept clear. `src/systems/reclaim.js`, sheet `src/ui/sheets/plot.js`, view `src/render/views/plot-view.js`.
- **Stone supply:** a rock outcrop (`src/systems/quarry.js`, painted prop `outcrop`) gives 3 blows of 2 stone a day, tapped in either kit; every island gets one east of home. Daily loose rocks scale with the island: one per 140 land tiles, at least 4.
- **Controller support:** `src/input/gamepad.js`, polled each frame (standard mapping; Steam Deck, Xbox, PlayStation). World: left stick walk, A act, B stop, X dig kit, Y bag, LB/RB tool, LT/RT zoom, right stick pan, Menu today, View build, D-pad up the ribbon's chore. Build mode gets its own tile cursor the camera follows. Sheets, help and dialogs: a gold highlight steered by D-pad/stick (kept across live redraws), A press, B close, LB/RB tabs, right stick scroll. `body.pad` swaps key labels for controller badges; `haptic` events rumble. Browser test: `npm run test:gamepad` (simulated pad).
- **Desktop cursor:** shows the icon of what a click will do there.
- **Fix:** tree trunks and branches no longer poke through the leaves (the canopy cut-outs are pushed toward the camera).

**Not done yet:**

- **3.1** letters and mail; house wishes
- **3.3** stamps; a real photo-mode camera
- **2.8** painted UI kit frames; the map
- **Wave 2 extras:** compost, crop quality in the UI, paddies, fish shadows, traps
- **Later goal: an island with no size limit.** The player should be able to grow the island as far as they like, up to a full big village. Plots now grow it within the fixed 64×64 grid (about 3,500 tiles of sea to fill, keeping 2 at the edge); so this needs a growable or chunked world (and the camera, saves, pathfinding and ground rendering to follow). Not for now.

---

## 1. Depth, pillar by pillar

### 1.1 Land: shape your island

- **Height levels 0–4** (about 0.5 units per level), with the rounded-block look at every step.
  - Cliffs appear between levels.
  - **Stairs and ramps** are needed to change level.
  - **Waterfalls** form where a stream drops a level.
- **Shovel tool:**
  - raise or lower a tile; drag to paint a level across several tiles
  - dig **ponds and streams**. Water flows downhill along dug channels, so you can make a waterfall.
  - **Earth** is a material. Lowering land gives earth and raising land costs earth, so reshaping is a loop and not a menu.
- **Shore reclaiming:** turn a water tile next to land into land. Cost: koku that rises with the total reclaimed (about 20 → 300), plus stone.
- **Paving and paths:** stepping stones, gravel, wooden boardwalks and stone plazas, each a tile type with painted textures.
- **The world grows from 40×40 to 64×64.** The extra space is open sea plus fixed regions.
- **Curated regions, unlocked as projects or by Fortunes:**
  - **The bamboo grove** (west): clearing it gives space and bamboo.
  - **The hill and the lookout** (north): a ready-made level-3 hill with a pavilion and the best view.
  - **The islet**: reached by a bridge project; has tide pools and shells.
  - **The cove**: a sheltered bay with a boathouse and cove fish.
  - **The old gate and the cedar forest**: Bishamon's chapter, a forest region with mushrooms and a hot spring.

### 1.2 Farming: the land matters

- **12 crops**, each with a terrain or season niche:
  - **Paddy:** rice (needs flooded, level tiles next to water)
  - **Fields:** daikon, nasu (eggplant), kabocha (pumpkin), edamame, satsuma-imo (sweet potato), shiso
  - **On a slope or at height:** tea
  - **In a shaded stream:** wasabi
  - **In a pond:** lotus
  - **Orchard trees** (Jurojin's chapter): ume (plum), kaki (persimmon), yuzu
- **Crop quality ★1–3.** Quality rises with:
  - watering
  - **compost** (made from scraps in a compost bin)
  - **companion planting** (certain neighbours help)
  - the **right season**

  Quality raises price and is wanted by offerings and villagers.
- **Farm helpers** to build or craft:
  - bamboo **sprinkler pipes** (kakei) that water neighbouring tiles
  - a **scarecrow**, which brings visitors and adds a quality bonus
  - **drying racks**
- **Giant crops**, rarely, in a 3×3 patch of top-quality crops. Rare and delightful.

### 1.3 Fishing: a real collection

- **About 30 fish** across water types:
  - river
  - pond
  - shore
  - deep (pier)
  - cove
  - waterfall pool
  - tide pools (by hand)

  Gated by hour, **season** and **weather**.
- **Fish shadows** of different sizes show what might bite. Fish have **sizes**, and the collection book keeps your records.
- **Rods:** bamboo → lacquered → Ebisu's rod, giving a wider bite window and more rare fish. **Bait types** each favour a fish family.
- **Fish traps:** a check-in loop. Set a trap, come back hours later and collect.
- **A koi pond display:** caught koi live in a pond you dug and visibly swim there.

### 1.4 Gathering and materials

- **Materials:**
  - bamboo (groves regrow)
  - wood (fallen branches; chop trees, which regrow from stumps)
  - stone (rocks you break; they respawn daily)
  - clay (riverbanks)
  - earth (from the shovel)
  - shells (islet)
  - herbs and mushrooms (seasonal, forest)
- **Bugs:** catch them with a net, by season and hour:
  - fireflies (summer nights)
  - cicadas
  - dragonflies
  - suzumushi (autumn crickets)
  - butterflies

  They join the collection book.

### 1.5 Crafting and cooking: turning things into other things

- **Workbench:** materials become decor, tools, sprinklers, traps and fences.
  - Recipes come from villagers, Fortunes and the book.
  - Blueprints unlock in themed sets: tea garden, harbour, festival.
- **Kitchen / tea house:** dishes made from crops and fish.
  - Dishes: onigiri, miso soup, tempura, grilled ayu, kabocha nimono, mochi, matcha, imo yōkan, and others.
  - **Recipes are discovered by experimenting:** put up to 3 ingredients in the pot and see what comes out.
  - Dishes are worth far more, are wanted by villagers, offerings and festivals, and some give small buffs (for example, a tea gives extra bite time).
- **Processing over real time,** another check-in loop:
  - Daikoku's **mill:** rice becomes flour, flour becomes mochi
  - **drying racks:** fish become dried fish, persimmons become hoshigaki
  - **tea roasting:** tea becomes matcha
  - a **sake barrel** (late game)

### 1.6 Villagers: people to care about

- **6–8 residents move in** when you build them a house plot (a project) that meets their wish. For example, Ume wants a quiet spot near tea bushes.
- **Cast ideas:**
  - Kenji the carpenter, who runs the project board
  - Ume, the tea master
  - Taro, the fisher boy
  - Sachi, the musician (Benten's chapter)
  - Ryō, the wandering rōnin (Bishamon's chapter)
  - Mei, the potter, who uses clay
  - Hana, whose story goes deeper
- **What each villager has:**
  - **Daily routines:** they walk the island, fish, sit at the lookout, and go home at night.
  - Likes and dislikes, with gift reactions.
  - **Friendship 0–10 hearts.** Each tier unlocks dialogue, a recipe, decor or a shop item.
  - Requests, which replace and deepen Hana's daily ones.
  - **Letters** in the mailbox while you're away.
- **They notice the island:** "Someone put lanterns by the pond; it's lovely at night." A rules engine reads arrangements, terrain and decor.
- **Art:** painted characters through the pipeline. Either projection-mapped low-poly bodies like the props, or billboard sprite sheets with 4 directions and walk frames. This needs prototyping.

### 1.7 Visitors: yōkai and animals

- About 12 visitors. Each arrives when its **arrangement rule** is met, usually while you're away:
  - **kitsune:** a torii with an offering of fried tofu
  - **tanuki:** crates and sake at night
  - **kappa:** cucumbers by a stream
  - **crane:** a lantern by a still pond
  - **tengu:** at the lookout
  - **bakeneko:** a warm house with fish drying
  - **sea turtle:** the cove
  - **deer:** a sakura in bloom
  - and others
- **Discovery:** visitors leave gifts and hints, and the rules are discovered rather than shown.
- **Photo mode:** a framed snapshot goes into the **scrapbook**. Mobile-native: tap the visitor, then the shutter.

### 1.8 The Seven Fortunes: the spine

Each Fortune's chapter introduces a mechanic. Offerings deepen over time: quality crops, dishes, rare fish, crafted items.

| Fortune | Chapter unlocks | New mechanic |
|---|---|---|
| Ebisu ✓ | pier, deep sea, bait | fishing depth |
| Daikoku | mill, processing, new crops, kitchen | cooking and processing |
| Benten | festival stage, flute | music (a gentle flute-melody toy) and the first festival |
| Hotei | more visitors, happiness | visitors and villager happiness |
| Fukurokujin | almanac, weather forecast, book rewards | collection rewards |
| Jurojin | orchard trees, bonsai | long-term growth (trees take real days) |
| Bishamon | the old gate, cedar forest, hot spring | the last land expansion |

### 1.9 Time: a year on the island

- **Seasons** following the real calendar, each with:
  - crops, fish, bugs and visitors
  - **seasonal looks:** sakura in spring, green summer, red maple in autumn, snow-capped roofs and white ground in winter (shader tints plus Codex variants)
- **Weather:**
  - **rain** waters crops and brings out certain fish and frogs
  - **fog** in the mornings
  - **snow**
  - a **rainbow** after rain

  The forecast comes from Fukurokujin.
- **Festivals:**
  - **hanami**
  - **Tanabata:** wishes on bamboo
  - **Obon:** floating lanterns on the river
  - **Tsukimi:** dango
  - **Shōgatsu:** kadomatsu and the first shrine visit

  Each brings decor, a dish and a visitor.
- **Mail and letters** arrive daily, plus a weekly travelling merchant with rare goods.

### 1.10 Home

- **House upgrades:** minka → larger minka → farmhouse with an engawa garden.
- **Interior decoration** in a separate small interior scene, with furniture sets. This could start with just your own house.

### 1.11 Progression and collection

- **Island prosperity:** a "Fortune" level that combines:
  - decor beauty: variety, harmony and lighting
  - residents' happiness
  - collection completion

  It drives the merchant's stock, how often visitors come, and festival scale.
- **Collection book:**
  - fish (with size records)
  - bugs
  - crops (with best quality)
  - dishes
  - visitors (with photos)
  - decor sets
  - Fortunes

  Fukurokujin gives rewards for it.
- **Stamp book:** gentle achievements with stamps like a temple goshuin book.

### 1.12 UI and feel: the game should feel lovely to touch

- **A painted UI kit** made with Codex: panel frames, ribbons, buttons, tabs, badges and stamp seals. One visual language everywhere.
- **A motion system:**
  - sheets spring in and out
  - **items fly** to the bag
  - the **koku counter ticks** up
  - progress bars fill
  - celebration cards with particles
  - a tap squish on every button
- **HUD:**
  - a "something to do" ribbon (ripe crops, an offering you can make, a finished project, a visitor here, new mail)
  - a mailbox
  - a map
  - tool radial on long-press
- **New screens** (all portrait-first bottom sheets):
  - project board
  - shovel toolbar
  - reclaim preview
  - island map
  - workbench
  - cooking pot
  - collection book
  - scrapbook and photo mode
  - villager profile and friendship
  - mailbox
  - festival screen
  - almanac
- **Audio:**
  - music per season and time of day
  - festival themes
  - villager voice blips
  - ambience per region (forest, cove, waterfall)
  - a sound for every meaningful moment

---

## 2. Foundations that make depth possible (Wave 0)

All of this only stays maintainable, and buildable by parallel agents, if the core is reshaped first:

1. **Split into modules.** `game.js` (1100 lines) and `ui.js` (900 lines) each become one module per system and one file per sheet. After that, each work package owns its own files.
2. **Event bus (`events.js`).** `harvest`, `catch`, `craft`, `cook`, `place`, `visit`, `gift`, `wake`, and so on. Requests, the collection book, stamps, villagers, visitors and sound all subscribe, instead of `game.js` calling each one.
3. **Content registries.** `src/content/` gets one data file per domain: `crops`, `fish`, `bugs`, `recipes`, `materials`, `villagers`, `visitors`, `projects`, `fortunes`, `festivals`, `blueprints`. These are append-only, so parallel agents add entries without clashing.
4. **Conditions engine.** One shared way to describe a condition: hour, season, weather, terrain, nearby props, height, water type. Fish, bugs, visitors, villager dialogue and quality all use it.
5. **Scheduler.** Persisted real-time timers: projects, processing, traps, visitor arrivals, mail and villager move-ins. It includes offline catch-up and an **"away" aggregator** that feeds the welcome-back card.
6. **Modular saves (v4).** Each system serializes its own slice, through a migration registry, with a v3 → v4 migration.
7. **Test layers:**
   - a fast **node logic suite**: content validity, economy, scheduler, conditions and migrations, in seconds
   - per-feature browser flows
   - a **screenshot gallery** per wave (portrait and landscape) for review
8. **Performance budget for phones.** Draw calls, triangles (the ground mesh at 64×64 with heights), shadow map size, atlas count, and a frame-time check in the tests.
9. **Pacing simulator** (`tools/simulate.mjs`). Simulates 60 days of a typical player (3 short check-ins a day, a long weekend session) to tune prices, timers and costs. Target pacing:
   - day 1: Ebisu
   - week 1: Daikoku, the first resident, the first project
   - month 1: 4 Fortunes, 5 residents, the hill and the islet
   - a year: everything

---

## 3. Waves and orchestration

Every wave follows the same shape:

1. **Understand:** a workflow maps the relevant code.
2. **Design:** a judge panel decides the risky choices.
3. **Implement:** parallel worktree agents, one per work package with its own files.
4. **Review:** adversarial review of the diff.
5. **Verify:** tests, portrait screenshots and a play-through.

The orchestrator merges the shared append-only files (`src/content/*`, `blockouts.js`, `sheets.js`, `style.css` sections). Commit per wave, only when the user asks.

### Wave 0: foundations (mostly serial)

| WP | Scope |
|---|---|
| 0.1 | **Bridge fix.** The river at x=25 is 2 tiles wide, but the 1×3 bridge is anchored one tile too far, so one end hangs over the water. Centre bridges on their water run, and fix it up in old saves. |
| 0.2 | Module split of `game.js` and `ui.js` (no behaviour change; the full suite must stay green). |
| 0.3 | Event bus, content registries (move the current data across), conditions engine, scheduler. |
| 0.4 | Save v4 with modular slices and migration. |
| 0.5 | Logic test suite, screenshot gallery script, performance check, pacing simulator skeleton. |

### Wave 1: terrain engine (serial core, then parallel)

| WP | Scope |
|---|---|
| 1.1 | Height levels in data, mesh (rounded steps, cliffs), shader and shadows. |
| 1.2 | Height-aware picking (raycast the ground mesh), pathfinding with stairs and ramps, and y for player, props, crops, billboards and forage. |
| 1.3 | World 64×64 with a migration that centres old islands; phone performance pass. |
| 1.4 | Water editing: dug ponds and streams, flow downhill, waterfalls (parallel once 1.1–1.2 have landed). |

### Wave 2: island-shaping and making things (parallel worktrees)

| WP | Scope | Owns |
|---|---|---|
| 2.1 | Shovel tool, earth material, stairs props | `systems/terraform.js`, `ui/terraform.js` |
| 2.2 | Shore reclaiming with escalating cost | `systems/reclaim.js` |
| 2.3 | Project board, scaffolding, real-time build, reveal cards; grove, hill and lookout, islet, cove | `systems/projects.js`, `ui/projects.js`, content |
| 2.4 | Materials and gathering: chopping, breaking rocks, clay, regrowth | `systems/gather.js` |
| 2.5 | Workbench and blueprints | `systems/craft.js`, `ui/workbench.js` |
| 2.6 | Farming depth: 9 new crops, paddies, slopes, quality ★, compost, sprinklers | `systems/farming.js`, content |
| 2.7 | Fishing depth: about 30 fish, shadows, sizes, rods, bait types, traps, koi pond | `systems/fishing.js`, content |
| 2.8 | UI kit and motion system: painted frames, fly-to-bag, tickers, springs, the "to do" ribbon, map | `ui/kit.js`, `ui/motion.js`, CSS |

### Wave 3: life (parallel)

| WP | Scope |
|---|---|
| 3.1 | Character art prototype, then the villager system: routines, friendship, gifts, letters, house wishes. Kenji and Ume first. |
| 3.2 | Visitors: arrangement rules, arrivals while away, gifts; 6 visitors first. |
| 3.3 | Photo mode, scrapbook, collection book, stamps. |
| 3.4 | Daikoku's chapter: mill, kitchen and recipe discovery, processing timers. |
| 3.5 | Bugs and the net. |

### Wave 4: time (later session)

Seasons (looks, content gating), weather, the first festivals, mail, the weekly merchant, and Benten's and Hotei's chapters.

### Wave 5: home and the long tail (later session)

House upgrades and interior, Jurojin's orchards and bonsai, Fukurokujin's almanac, Bishamon's forest and hot spring, prosperity.

### Wave 6: polish and balance (end of every session, and a final one)

Pacing simulator runs, an economy tuning pass, a full adversarial review, a performance check on a real phone, and a play-through from a fresh island.

---

## 4. Art plan (Codex, batched per wave)

The pipeline handles about 4 parallel jobs at 60–90 s each, so batches of 20–40 jobs take about 10 minutes. After every batch:

1. Make a contact sheet.
2. Visually review it.
3. Re-run any misaligned jobs with `--force`.

| Wave | Assets (2 angles each for props) |
|---|---|
| 0–1 | stairs (stone, wood), ramp, waterfall rocks; cliff tile variants for tall cliffs; paving tiles (gravel, stepping stones, boardwalk, plaza) |
| 2 | notice board, scaffolding, rocks ×3, fallen branch, stumps, compost bin, kakei pipe, scarecrow, drying rack, fish trap, workbench, lookout pavilion, boathouse, tide pool rocks; sheets: materials icons, 9 crops × 3 stages, about 26 fish icons, fish shadows; **UI kit sheet** (frames, ribbons, buttons, badges, stamp seals) |
| 3 | villager character sheets (prototype first), visitor sprite sheets (12), mill, kitchen, tea house, cooking pot; dish icons (about 20), bug icons, scrapbook frame |
| 4–5 | seasonal variants (autumn and winter canopies, snow roofs as tint plus decals), festival decor (tanabata bamboo, lanterns, kadomatsu), orchard trees, interior furniture set |

---

## 5. Risks

- **Heights touch everything.** That's why they sit in a serial wave with tests, before any content.
- **Parallel agents conflicting.** Each work package owns its files, shared files are append-only registries, and the orchestrator merges them.
- **Characters are the hardest art.** Prototype first; billboards are the fallback.
- **Phone performance on a 64×64 world with heights, villagers and visitors.** The performance budget and frame-time check are part of every gate.
- **Losing coziness under depth.** Every new system needs a "3-minute version": what you do in a short check-in. The pacing simulator and the design rules act as a gate.
- **Test runtime.** Most checks live in the node logic layer; browser flows stay focused.

## 6. Decisions

Answered by the user before the session started:

1. **Seasons** follow the real calendar.
2. **Projects** finish while you're away; you come back to them done, with a reveal card.
3. **Characters** are simple 3D low-poly bodies painted through the same projection pipeline as the props (not flat sprites).
4. **Scope of this session:** Waves 0–3.

Still open (decide when the wave that needs them starts): terraforming cost (earth loop vs free), gentle minigames or none, villagers' interiors.
