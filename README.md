# 🧟 Zombie Outbreak Simulator

**A 3D real-time zombie outbreak simulation in your browser.**

A city of 400 civilians, one zombie patient zero, and everything spiralling from there. Procedural city generation, emergent AI, and a surprisingly tense simulation of societal collapse.

![Zombie Outbreak Simulator](screenshot-v7.png)

## 🎮 Features

### Live Simulation
- **400+ individuals** with AI — civilians seek food & shelter, zombies hunt, military deploys in squads
- **Day/night cycle** with dynamic sky, stars, moon, building window glow, and fog
- **Starvation & food economy** — civilians must enter shops/warehouses to eat, starve and die if they can't
- **Binary combat** — no HP, no healing. One bite = turned or dead. One bullet = dead zombie.
- **Military squads** — deploy Day 2, 2 rounds per magazine, must enter ammo buildings to resupply
- **Zombie aggro** — visual range 16u, audio aggro 25u from gunshots. Faster at night (1.6x), sprint when close
- **Phase system** — 5 escalating outbreak phases with radio messages from "HQ"
- **Instant turning** — bitten civilians turn to zombies on contact, no timer

### Visuals
- **UnrealBloomPass** for atmosphere
- **Distinct entity shapes** — cylinders (civilians blue), cones (zombies green), boxes (military red)
- **Building roof colors** by type (syncs with legend)
- **Occupancy dots** — blue dots on roofs show how many people are inside
- **Blood pools** — red circles on ground where zombies die, fade over 20s
- **Military tracers** — solid red for hits, dashed red for misses, fade over 2s
- **Corpses** — blood pools left by starved civilians and killed zombies
- **Fog** density adapts to camera zoom
- **GridHelper** reference on ground

### UI
- **13 stat boxes** — DAY, TIME, CIVILIANS, ZOMBIES, MILITARY, DEAD, FOOD, AMMO, CHAOS, STARVING, STARVED, TURNED, KILLED
- **Population chart** — real-time line graph (civilians blue, zombies green, military red)
- **Event log** — scrollable feed of bites, deaths, deployments, milestones
- **Legend** — visible by default (L to toggle), shows entity colors, building types, chart lines, occupancy
- **Notifications** — slide-in popups for milestones (50/100/200 zombies, Day 5/10 survival)
- **Danger overlay** — red pulse when zombies outnumber survivors
- **Entity popup** — click any entity to see type, state, ammo, kills
- **Speed slider** — 0.5x to 100x simulation speed

### Controls
| Key | Action |
|-----|--------|
| `Space` | Pause / Resume |
| `R` | Reset simulation |
| `C` | Cycle camera mode (orbit / top / close) |
| `L` | Toggle legend |
| `←` `→` `↑` `↓` | Pan camera |
| `1`-`9` | Set speed multiplier |
| `0` | Set speed to 10x |
| Click | Inspect entity |

## 🚀 Quick Start

```bash
npm install
npm run dev
# opens at http://localhost:5173
```

## 🎯 How It Works

### Entity Types
| Type | Color | Shape | Behavior |
|------|-------|-------|----------|
| **Civilian** | 🔵 Blue | Cylinder | Wanders, seeks food when hungry, sleeps in buildings at night, flees from zombies, starves if can't find food |
| **Zombie** | 🟢 Green | Cone | Hunts nearest human, faster at night, sprints when close, alerted by gunshots from 25u |
| **Military** | 🔴 Red | Box | Deploys Day 2 in squads, 2 rounds/mag, must resupply at ammo buildings, aims 0.3-0.8s before shooting, accuracy drops with distance |

### Building Types (roof colors)
| Building | Roof Color | Function |
|----------|-----------|----------|
| **Shop** | 🟡 Yellow | Food source |
| **Office** | 🟠 Orange | Food (low) |
| **House** | ⚪ White | Shelter (sleep) |
| **Warehouse** | ⚫ Dark Gray | Ammo + Food |
| **Police** | 🔵 Blue/Red | Ammo (high) |
| **Hospital** | 🟤 Brown | *(no function)* |

Blue dots on roof = people currently inside that building.

### Phases
| Phase | Zombie % | Event |
|-------|----------|-------|
| 1 | <10% | Outbreak localized |
| 2 | 10-40% | Spreading |
| 3 | 40-70% | City in chaos |
| 4 | 70-90% | Civilization collapsing |
| 5 | >90% | Extinction-level |

### Game Over
- **Zombies win** — all humans dead or turned
- **City saved** — all zombies eliminated (after Day 2)
- **Extinction** — no survivors remain

## 💡 Tips
- Speed up to **5-20x** during quiet periods
- Let it run to **Day 2** for military deployment
- Click entities to see their ammo/hunger state
- Press **L** to see the full legend
- Zombies are **1.6x faster at night** — Day 3+ nights get intense
- Military has only **2 shots** before needing to reload + resupply
- Starving civilians move **50% slower** — get them to food fast

## 🛠️ Tech Stack
- **[Three.js](https://threejs.org/)** — 3D rendering
- **[Vite](https://vitejs.dev/)** — Build tool
- **[TypeScript](https://www.typescriptlang.org/)** — Type safety
- **EffectComposer + UnrealBloomPass** — Post-processing bloom

## 📁 Structure
```
zombie-sim/
├── src/
│   ├── simulation.ts   # Core AI, combat, food, infection
│   ├── renderer.ts     # Three.js scene, entities, effects, UI sprites
│   ├── main.ts         # Game loop, HUD, chart, legend, controls
│   ├── world.ts        # Procedural city generator
│   └── style.css       # All UI styles
├── index.html
├── package.json
└── vite.config.ts
```

## 📝 License
MIT
