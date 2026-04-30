# 🧟 Zombie Outbreak Simulator

**A 3D real-time zombie outbreak simulation built with Three.js.**

Watch a city of 400 civilians get overrun by zombies — or rally with military reinforcements and save humanity. Every run is unique thanks to procedural city generation and emergent AI behavior.

![Zombie Outbreak Simulator](screenshot-v3-final.png)

## 🎮 Features

### 3D City Simulation
- **Procedural city generation** — buildings, roads, parks, and special landmarks (police station, hospital) generated differently every run
- **400+ individual entities** with AI behaviors — civilians flee, hide, sleep; zombies hunt, swarm, and spread infection; military patrol, engage, and protect
- **Day/night cycle** with dynamic sky, stars, moon, building lights, and fog
- **Particle systems** — zombie glow, blood decals, muzzle tracers, ambient dust
- **Post-processing bloom** — zombies literally glow green with UnrealBloomPass

### Gameplay
- **Delta time simulation** — speed up to 100x or slow to 0.5x
- **Infection spread** — bitten civilians turn into zombies after a countdown
- **Military AI** — arrives Day 2, protects nearby civilians, reinforcements scale with threat
- **Phase system** — outbreak progresses through 5 escalating phases with warnings
- **Population history chart** — real-time line graph tracking civilians vs zombies vs military
- **Event log** — detailed feed of every bite, death, deployment, and milestone
- **Multiple camera modes** — orbit, top-down, close-up

### Interactive
- **Click to inspect** any entity — see type, HP, state, kills, ammo
- **Keyboard shortcuts** — Space=pause, R=reset, C=camera, 1-9=speed
- **Auto-focus** — camera swings toward outbreaks
- **Slow-motion** — first infection triggers dramatic 0.3x time
- **Screen shake** — on major events
- **Danger overlay** — pulsing red radial gradient when zombies outnumber survivors

### Visual Effects
- UnrealBloomPass glow on zombies
- Window emissive lights at night
- Police station blue flashing lights
- Hospital red cross on roof
- Moon with glow ring
- 3000 visible stars
- Ambient dust particles
- Blood splatter decals
- Bullet tracer lines
- Dramatic game-over animation (zombie win / human win variants)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🎯 How to Play

1. Open `http://localhost:5173` in your browser
2. Watch the simulation unfold automatically
3. Use the **speed slider** to fast-forward through quiet periods
4. **Pause** to inspect the city at key moments
5. **Click** on any glowing entity for details
6. Cycle **camera modes** for different perspectives
7. **Reset** to generate a brand new city and outbreak

### Controls

| Key | Action |
|-----|--------|
| `Space` | Pause / Resume |
| `R` | Reset simulation |
| `C` | Cycle camera mode |
| `1`-`9` | Set speed multiplier |
| `0` | Set speed to 10x |
| Click | Inspect entity |

### Tips
- Run at **5-10x speed** during early days when civilians outnumber zombies
- **Pause** during outbreaks to watch individual zombie vs civilian chases
- The **chart** in the bottom-right tracks population over time — watch for sudden drops
- Military arrives **Day 2** — survivors must hold out until then
- Zombies are **faster at night** — Day 4-5 nights are the most dangerous

## 🧬 Simulation Details

### Entities
- **Civilians** (🔵 blue) — wander, sleep at night, flee from zombies, hide in buildings. Each has hunger, fatigue, and infection timer
- **Zombies** (🟢 green, glowing) — hunt nearest humans, faster at night, infect with bites
- **Military** (🔴 red) — arrive Day 2, patrol city, engage zombies, protect nearby civilians, resupply ammo

### Phases
| Phase | Zombie % | Events |
|-------|----------|--------|
| 1 | <10% | Containment — outbreak localized |
| 2 | 10-40% | Spread — crossing containment |
| 3 | 40-70% | Explosion — city in chaos! |
| 4 | 70-90% | Collapse — civilization breaking |
| 5 | >90% | Extinction-level event |

### Game Over Conditions
- **Humans extinct** — zombies win (screen fills with green skull)
- **All zombies eliminated** — city saved! (gold glow with fireworks particles)
- **No survivors remain** — everyone is either dead or infected

## 🛠️ Tech Stack

- **[Three.js](https://threejs.org/)** — 3D rendering engine
- **[Vite](https://vitejs.dev/)** — Build tool and dev server
- **[TypeScript](https://www.typescriptlang.org/)** — Type safety
- **EffectComposer + UnrealBloomPass** — Post-processing bloom effects

## 📁 Project Structure

```
zombie-sim/
├── src/
│   ├── main.ts         # Game loop, UI, controls, chart
│   ├── renderer.ts     # Three.js scene, effects, entity rendering
│   ├── simulation.ts   # Core simulation engine (AI, combat, infection)
│   └── world.ts        # Procedural city map generator
│   └── style.css       # HUD, overlays, animations
├── index.html          # Entry point
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 📝 License

MIT
