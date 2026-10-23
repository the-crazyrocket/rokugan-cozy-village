# Design plan: making the village worth coming back to

This is a personal hobby game with no monetisation, built **mobile-first**: portrait, one thumb, short check-ins. Timers and pacing are tuned for fun, not for retention metrics.

## Problem

The verbs are fine: till, plant, water, fish, place. What's missing is a reason to use them.

- **Everything resolves in one sitting.** Crop stages take 1–2 minutes, so nothing waits for you between sessions.
- **No goals.** There are no unlocks, levels or projects. Everything in the shop is affordable within about 20 minutes, and after that koku is worth nothing.
- **Decor has no consequence.** Nothing reacts to what you place.
- **Nobody to care about.** Hana is a shop with one line of dialogue.

## Design rules

1. **No energy, no punishment.** Crops never wither. Nothing is lost because you were away, and nothing is missable forever. Seasonal content comes back the next year.
2. **Opening the app should reveal something.** Something happened while you were gone: a visitor came, a letter arrived, a crop ripened.
3. **The 3-minute check-in comes first.** A short session should feel complete. Long sessions (decorating, fishing) are a bonus.
4. **Every system feeds the island.** Money, offerings and friendship should end up as visible change to the village.
5. **One thumb, portrait.** Any new UI has to work there before anywhere else.

## Pillars

### 1. Spine: the quiet shrine and the Seven Fortunes

The village shrine has gone quiet. You restore it by making **offerings**: small bundles in the style of Stardew Valley's Community Center, such as "3 rice, 1 koi, 1 tea". Completing a Fortune's offerings wakes it, and that permanently changes the island. The Fortunes come from Japanese folklore (Shichifukujin).

The first chapter must be finishable on day one. Later chapters take days. The order isn't final:

| Fortune | Domain | Wakes up |
|---|---|---|
| Ebisu | fishing, luck | pier, sea fishing, bait, rarer fish |
| Daikoku | harvest, wealth | mill and processing (rice → mochi/sake, leaves → matcha), new crops |
| Benten | arts, music | music and the flute, the festival stage, the first festival |
| Hotei | contentment | more frequent visitors, villagers move in |
| Fukurokujin | wisdom | collection-book rewards, weather forecasts |
| Jurojin | longevity | orchard trees (plum, persimmon), tea garden |
| Bishamon | protection | land expansion: the old gate, the hill path, the cove |

### 2. Rhythm: layered timescales on the real clock

| Scale | Content |
|---|---|
| Seconds to minutes (in session) | fishing, "snack" crops (about 3–10 min), decorating |
| Hours (check-ins) | main crops (about 1–4 h), processing, visitors |
| Daily, seeded by date | Hana's stock rotates, 3 small requests, a letter, one story beat |
| Seasonal, real calendar | hanami, Tanabata, Obon, autumn maples, Shōgatsu; seasonal crops and fish |

- Day and night follow the player's local time.
- A **"While you were away" card** on opening sums up ripe crops, visitors and mail.
- **Swipe-harvest:** drag one finger across a field to harvest every tile it touches (Hay Day's sickle).
- **Dev time-skip** (debug only), so hour-long timers can be tested.

### 3. Visitors: decor attracts creatures

This is the Neko Atsume loop, set in Rokugan. Arrangements of props attract visitors, for example:

- a lantern and pot by the pond bring a crane
- a torii plus an offering brings a kitsune
- cucumbers by the river bring a kappa
- crates at night bring a tanuki

Visitors arrive while you're away and leave gifts. You photograph them into a **scrapbook**. Their rules are discovered through hints, not shown upfront.

New creatures are billboard sprites, so they fit the existing Codex sheet painting pipeline.

### 4. Villagers

Start with Hana and one resident. More move in as Fortunes wake.

- Each villager has a personality, likes (a crop, a spot on the island), daily requests, gifts, and friendship tiers that unlock recipes, decor and dialogue.
- Villagers notice specific changes: "Someone put lanterns by the pond; it's lovely at night."

### 5. Collection book

- Fish grow from 4 to about 30, gated by water type, time of day, weather and season, with shadow sizes and rarity.
- Later: insects, shells, crop quality.
- Fishing stays simple. The depth is in *what* you might catch, not in a harder minigame.

### 6. Sound and feel

- Music that changes by time of day (koto, shakuhachi).
- Sound effects: harvest pop, splash, bite "plink", coin.
- Haptics on Android.
- A small celebration for milestones: a Fortune wakes, a new fish is caught, a visitor appears for the first time.

### 7. Money sinks become village projects

- Clear the bamboo grove for new land.
- Build the hill path.
- Rebuild the bathhouse.
- Expand your own house, then decorate its interior.

Costs rise as you progress.

## Mobile foundations (do first)

- **Save safety.** Safari may clear site storage after about 7 days without a visit. To protect against that:
  - make the game installable (PWA manifest and service worker)
  - call `navigator.storage.persist()`
  - add an export/import save code
- **Offline play.** The service worker caches three.js and assets, which fixes the "needs internet on first load" gap.
- **Save versioning.** Migrate from `v1` to `v2` in `Game.load()`. Every new system adds fields.
- **Testable time.** `Game` already takes an injectable `now()`, so tests can fast-forward the clock.

## Roadmap

Each phase should be playable on its own.

| Phase | Scope | Why this order |
|---|---|---|
| 0. Foundations | PWA/offline, persistent storage, save export, save v2 migration, time service + dev time-skip, audio bus | everything after this depends on it |
| 1. Rhythm | local-clock day/night, daily seeded refresh, crop retune (snack + main tiers), swipe-harvest, "while you were away" card | gives the reason to come back |
| 2. Shrine, chapter 1 | shrine prop, offering UI, Ebisu wakes (pier + sea fish) | gives the long-term goal |
| 3. Visitors | arrangement rules, 4–6 creatures, gifts, scrapbook | makes decorating a game |
| 4. Villagers | Hana deepened, 1–2 residents, requests, friendship, decor comments | adds people to care about |
| 5. Collection | fish expansion, conditions, weather, collection book | reasons to try new hours and places |
| 6. Seasons and more Fortunes | festivals, seasonal crops, processing, land expansion, house interior | long tail of content |

## Open questions

- What does a typical play pattern look like (how many check-ins a day)? This sets the main crop timers.
- Should the real-time clock be optional, with a "relaxed" compressed day for long sessions?
