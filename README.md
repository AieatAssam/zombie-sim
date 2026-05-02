# 🧟 Zombie Outbreak Simulator

**A 3D real-time zombie outbreak simulation in your browser.**

A city of 400 civilians, a zombie patient zero, and everything spiralling from there. Procedural city generation, emergent AI — just watch the collapse unfold.

![Zombie Outbreak Simulator](screenshot-v8.png)

## 🌍 Simulation Features

### Population & AI
- **400+ individuals** with layered autonomous AI — civilians seek food & shelter and flee zombies, zombies hunt in hordes, military deploys in coordinated squads
- **Day/night cycle** with dynamic sky gradient, stars, moon, building window glow, and fog that adapts to camera zoom
- **Food economy** — finite food per building. Civilians forage at shops/warehouses. Food depletes city-wide. Starvation is a real threat.
- **Ammo economy** — finite ammo per building. Military uses 100-round magazines and must resupply at police stations or warehouses.
- **Infection system** — when a zombie bites a civilian there's a 3-5 second turn timer before they become a zombie. No resist, no HP — one bite = eventual conversion. Bitten civilians flee in panic during the turn window.
- **Zombie aggro** — visual range 18 units (requires line of sight), audio aggro 25 units from gunshots (no LOS needed). Zombies alert nearby zombies when they bite someone.
- **Zombie speed** — 3.8–4.8 at day, 1.6× faster at night. Zombies sprint when close to prey.
- **Sprint system** — civilians sprint when a zombie is within 14 units, limited duration with cooldown (longer cooldown if hungry)
- **Zombie horde clustering** — zombies within 5 units of each other form hordes; all zombies drift toward horde centers
- **Military squads** — deploy in waves only after outbreak escalates (4+ infections). Squad members stay within 6 units of each other. Non-leaders follow the leader.
- **Military patrols toward hordes** — soldiers pathfind to the largest zombie cluster
- **5-phase outbreak system** — escalates from containment through extinction, each phase announced with a radio message
- **5 intro scenarios** — randomised each run (meteor crash, lab leak, infected cargo, ancient spores, space signal)
- **Periodic radio messages** — HQ broadcasts that become more panicked as the outbreak worsens
- **Slow-motion on first infection** — time slows to 30% for 3 seconds with a screen flash

### Combat System (entirely autonomous)

| Detail | How It Works |
|--------|-------------|
| **Civilian vs Zombie** | Bite at 1.3 units. 100% infection — no resist, no HP. Bitten civilian gets a 3–5 second turn timer and flees in panic, then turns into a zombie. |
| **Military vs Zombie** | Engagement up to 25 units. Aim takes 0.2–0.5 seconds. Accuracy = 82% − distance × 1.3 (min 15%). One hit = one kill (no HP). |
| **Turn timer** | Bitten civilians take 3–5 seconds to turn. During this window they flee and can be killed by military as civilians. |
| **Zombie call-out** | When a zombie bites someone, nearby zombies (within 15 units) are alerted to the target's location. |
| **Line of sight** | Buildings block shots and visual detection. Military advances if LOS is blocked. Zombies also need LOS for visual aggro. |
| **Reload & Resupply** | Military reloads (2s) when magazine is empty, returns to warehouses/police stations when total ammo drops below 30. Also collects food during resupply. |
| **Audio aggro** | Gunshots alert every zombie within 25 units for 5 seconds, regardless of line of sight. |

### Visuals
- **UnrealBloomPass** for atmospheric glow
- **Entity shapes** — cylinders (civilians blue), cones (zombies green), boxes (military red)
- **Building roof colours** by type with legend
- **Occupancy dots** — small blue dots on roofs = how many people are inside
- **Blood pools** — red circles on ground where anyone dies, fade over 20 seconds
- **Corpses** — blood pools from starved civilians and killed zombies
- **Military tracers** — solid red line = hit, dashed red line = miss, fade over 2 seconds
- **Particle effects** — 1,600 ambient particles, bursts on zombie deaths
- **Night overlay** — semi-transparent dark plane at night
- **Moon** — visible at night, rises and sets
- **Sky gradient** — smooth transition from day to dusk to night
- **Fog** — density adapts to camera distance

### UI: Observation Dashboard
- **13 stat boxes** — DAY, TIME, CIVILIANS, ZOMBIES, MILITARY, DEAD (total), CHAOS (% with colour), STARVING (count), STARVED, TURNED, KILLED
- **Chaos meter** — green (<40%), yellow (40-70%), red (>70%). Calculated from zombie-to-survivor ratio, death toll, and zombie population.
- **Population chart** — real-time canvas graph (civilians blue fill, zombies green fill, military red line)
- **Event log** — scrollable feed with type-coloured entries (zombie/green, death/red, info/white, warning/yellow, military/magenta), auto-scrolls
- **Death breakdown** — separate counters for starved, turned, and killed by military
- **Speed slider** — 0.5× to 100× simulation speed
- **Stat alerts** — zombie counter pulses red when zombies outnumber survivors

### UI: Notifications & Overlays
- **Slide-in notifications** — auto-dismiss after 3.5s. Types: zombie (green), death (red), info (blue), military (purple).
- **Milestone popups** — trigger at thresholds: first zombie, 50/100/200 zombies, 50/10 civilians remaining, survival to Day 5/10
- **Danger overlay** — red pulsing border when zombies outnumber survivors (and >5 zombies)
- **First infection slow-mo** — time slows to 30% for 3 seconds, "⚠ FIRST INFECTION ⚠" overlay
- **Game over** — overlay with outcome text. Green border = city saved, red = zombies win.
- **Entity inspection** — click any entity to see its ID, type, HP, current state, kills (military), ammo (military), hunger (civilian)
- **Legend panel** — visible by default showing entity colours, building roof types, occupancy dots, starving/out-of-ammo indicators
- **Hint bar** — fades after 8 seconds

### Controls (camera only — you are an observer)
| Key | Action |
|-----|--------|
| `Space` | Pause / Resume |
| `R` | Reset (generates new map + scenario) |
| `C` | Cycle camera mode (orbit → top → close) |
| `L` | Toggle legend |
| `←` `→` | Pan camera horizontally |
| `↑` `↓` | Pan camera vertically |
| `1`–`9` | Set speed multiplier |
| `0` | Set speed to 10× |
| Click | Inspect entity |
| Drag | Orbit camera |
| Scroll | Zoom |

## 🚀 Quick Start

```bash
npm install
npm run dev
# opens at http://localhost:5174
```

## 🎯 How It Works

### Entity Types

| Type | Shape | HP | Speed | Autonomous Behaviour |
|------|-------|----|-------|---------------------|
| **Civilian** 🟦 | Cylinder (blue) | N/A (0) | 3.2–4.0 | Wanders, seeks food when hungry (<45), sleeps in buildings at night (fatigue >60), starves when hunger <25, flees from zombies, sprints when threatened. Bitten → 3–5s turn timer then becomes zombie. |
| **Zombie** 🟩 | Cone (green) | N/A (0) | 3.8–4.8 | Hunts nearest human (visual 18u, audio 25u), 1.6× faster at night, sprints within 5u, clusters into hordes, alerts nearby zombies when biting. One shot = one kill by military. |
| **Military** 🟥 | Box (red) | N/A (0) | 3.8–4.3 | Deploys in waves after 4+ infections, patrols toward largest horde, 100-round magazines, resupplies when total ammo <30, aims 0.2–0.5s before firing. |

### Entity States

**Civilians:** `wandering` → `foraging` (hungry, near food) → `starving` (hunger <25) → `seeking_shelter` → `sleeping` (night, in buildings) / `hiding` (day, from zombies) → `fleeing` (zombie within 8u) → `dead` (hunger ≤ −10 or HP ≤ 0)

**Zombies:** `hunting` → `attacking` (within 1.3u, 1.2s cooldown) → `feeding` (2s pause after bite) → `hunting`

**Military:** `patrolling` → `engaging` (zombie in range) → `reloading` (mag empty) → `resupplying` (ammo <30) → `hiding` (>2 zombies within 8u AND ammo <5) → `sleeping` (night, fatigue >80)

### Civilian Behaviour

| Mechanic | Detail |
|----------|--------|
| **Hunger** | Drains at 0.5/s. Below 45 → seek food. Below 25 → starving. At −10 → death. |
| **Fatigue** | Builds at 0.15/s. Above 60 at night → seek shelter. Sleeping restores at 3.0/s. |
| **Foraging** | Enters a food building, consumes 8–18 of its finite food after a short timer. Food depletes city-wide. |
| **Starvation recovery** | Reaching a food building while starving immediately consumes 5 food and restores hunger to 80. |
| **Sprinting** | Triggered when zombie within 14u. Duration = 2–3.5s (halved if hungry). Cooldown = 3–5s (doubled if hungry). Speed = 3.5× normal. |
| **Fleeing** | Zombie within 8u → flee 4–6s. Bitten at <1.3u → 3–5 second turn timer, then turns into zombie. Flees toward other civilians (safety in numbers). |
| **Hiding** | Zombie within 5u → enter nearest building for 3–7s. Exit when zombie leaves 14u range, or forced out by hunger <25. |

### Zombie Behaviour

| Mechanic | Detail |
|----------|--------|
| **Visual detection** | 18u range, requires line of sight |
| **Audio detection** | 25u range, triggered by gunshots, LOS not required, lasts 5s |
| **Night speed** | 1.6× multiplier |
| **Sprint chase** | 1.6× speed multiplier within 5u of target |
| **Horde clustering** | Zombies within 5u of each other (2+) cluster. All zombies drift toward nearest horde centre. |
| **Bite** | 1.3u range, 1.2s cooldown. 90.5% resist (civilian loses 25 HP), 9.5% turn. Military: killed instantly. |
| **Feeding pause** | 0.5s pause after a bite before resuming hunt |
| **Zombie call-out** | When a zombie bites someone, all zombies within 15 units are alerted to the target's location |
| **Building avoidance** | Cannot enter buildings — pushed out along the closest wall face. Pre-emptive wall sliding. |
| **Shelter protection** | Cannot bite civilians who are inside buildings (hiding, sleeping, foraging) |

### Military Behaviour

| Mechanic | Detail |
|----------|--------|
| **Deployment** | Delayed until 4+ infections and 8+ seconds. Scales with infections. Cap zombies×0.4 + 3. Max 50 soldiers. |
| **Squads** | Same squad ID. Non-leaders follow the leader. Stay within 6u of squadmates. All engage if one fights. |
| **Combat range** | Optimal 8–14u. Backpedals when zombie <10u, full retreat when <6u, advances when >15u. |
| **Accuracy** | hit% = 82 − distance × 1.3 (min 15%). At 5u = 75%, at 15u = 62%, at 25u = 49%. |
| **Aim time** | 0.2–0.5s before firing. Movement slows while aiming. |
| **Reload** | 2s reload when magazine is empty. Draws from 100-round reserve. |
| **Resupply** | Returns to nearest warehouse/police station when total ammo <30. Consumes up to 60 ammo from building. Also grabs food. |
| **Hiding** | Hides in nearest building when >3 zombies within 8u AND ammo <10. Regenerates 0.5 ammo/s. Exits when ammo >15 or clear of zombies 15u. |
| **Civilian protection** | Engages zombies that are within 5u of nearby civilians. |
| **Line of sight** | Advances to clear a shot if a building blocks the path. Raycast sampling at 0.5u steps. |
| **Gunshot alert** | Every shot alerts all zombies within 25u for 5 seconds. |

### Building Types

| Building | Roof Colour | Food | Ammo | Function |
|----------|-----------|------|------|----------|
| **Shop** | 🟡 Yellow | 30 | 5 | Primary food source |
| **Warehouse** | ⚫ Dark Gray | 50 | 20 | Ammo + food |
| **House** | ⚪ Brown/White | 15 | 0 | Shelter |
| **Office** | 🔵 Gray | 10 | 0 | Shelter (low food) |
| **Apartment** | 🔵 Slate Blue | 10 | 0 | Shelter |
| **Police Station** | 🔵 Dark Blue | — | 200 | Primary ammo source |

Blue dots on roofs = people currently occupying that building.

### Procedural City
- 60×60 unit grid, 3-unit cells, 20×20 layout
- Road grid every 4 cells
- 75% building, 25% park per cell
- Contiguous building cells merge into larger structures
- 1–5 floors per building, random height
- Police station replaces one building near map edge
- Parks contain 2–5 trees with slight position jitter

### Outbreak Phases

| Phase | Zombie % of total | Label |
|-------|-------------------|-------|
| 0 | <10% | Containment — outbreak localized |
| 1 | 10–40% | Spread — crossing containment zones |
| 2 | 40–70% | Explosion — city in chaos |
| 3 | 70–90% | Collapse — civilization breaking down |
| 4 | >90% | Extinction-level event imminent |

### How It Ends

| Condition | Outcome |
|-----------|---------|
| All civilians dead or turned, zombies still alive | 💀 Zombies win |
| All civilians dead, zombies also eliminated | 💀 No survivors |
| All zombies eliminated, at least one civilian alive, after Day 2 | 🎉 City saved |

### Radio Broadcasts
- **Normal** — HQ status reports, evacuation routes
- **Panic** (zombie:survivor ratio >2:1 AND zombies >30) — Code Red, air support requests
- **Victory** (ratio <0.3:1 AND military present) — infection slowing, reduced activity

### Milestone Notifications
- First zombie spotted, 50/100/200 zombies, 50/10 civilians left
- Survival to Day 5/10
- City saved

### Chaos Formula
```
CH = min(100,
  (zombies / max(1, civilians + military)) × 60
  + (dead > 50 ? 20 : dead > 20 ? 10 : 0)
  + (zombies > 100 ? 20 : zombies > 50 ? 10 : 0))
```
Flat 0% when zombies ≤ 10.

## 💡 Observing Tips
- Speed up to **5–20×** during quiet periods
- Let it run to **Day 2** before military arrives
- Click any entity to inspect its current state (military ammo, civilian hunger)
- Press **L** to toggle the legend
- Zombies are **1.6× faster at night** — nights get intense fast
- **Bitten civilians** take 3–5 seconds to turn. Watch them flee in panic before the transformation
- **Gunfire attracts** zombies, but so do **zombie call-outs** — when one zombie finds prey, nearby zombies hear it
- One shop has **30 food** — enough to feed 3–4 starving civilians
- The police station holds **200 ammo** — critical for sustained military operations
- Balance tuned to ~50/50 win/loss (v4: turn timer, no resist/HP, delayed deployment)
- Zombies can't bite civilians who are inside buildings
- Gunshots alert every zombie within **25 units** — firing draws the horde
- Watch the first infection in slow-motion replay
- The chaos meter colour transitions from green → yellow → red as the outbreak escalates

## 🛠️ Tech Stack
- **[Three.js](https://threejs.org/)** — 3D rendering, OrbitControls, Raycaster
- **[Vite](https://vitejs.dev/)** — Build tool
- **[TypeScript](https://www.typescriptlang.org/)** — Type safety
- **EffectComposer + UnrealBloomPass** — Post-processing bloom
- **Canvas API** — Population chart
- **[Vitest](https://vitest.dev/)** — Testing with v8 coverage
- **[Puppeteer](https://pptr.dev/) / [Playwright](https://playwright.dev/)** — Mobile viewport testing

## 📁 Structure
```
zombie-sim/
├── src/
│   ├── simulation.ts   # AI, combat, food, infection, phases, radio
│   ├── renderer.ts     # Three.js scene, bloom, blood, tracers, particles, day/night
│   ├── main.ts         # Game loop, HUD, chart, events, notifications, milestones
│   ├── world.ts        # Procedural city generator
│   └── style.css       # All UI styles
├── index.html
├── package.json
└── vite.config.ts
```

## 🧪 Testing
```bash
npm test                  # Unit tests
npm run test:coverage     # With coverage report  
npm run test:mobile       # Mobile viewport tests
```

## 📝 License
MIT
