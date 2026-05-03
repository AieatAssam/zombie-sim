# README Sync Instructions (For AI Agents)

This file tells AI agents how to keep README.md accurate when making changes to the zombie-sim.

> ⚠️ **Balance is tuned to ~50/50.** Before changing any constant, verify win rate via 20+ game sample.
> Refactored to v5: constants at top of simulation.ts, entity factory pattern, extracted methods.

## When to Sync

Update README.md whenever you change:

### 🎮 Gameplay Mechanics
- Entity speeds, attack cooldowns, detection ranges
- Combat formulas (accuracy, fire rate, aim time)
- Turn timer duration
- Military deployment thresholds and scaling
- Civilian behaviour (forage cooldown, flee detection range, sprint)
- Win/loss conditions (day thresholds)

### 👁️ Visual Effects
- New particles, sprites, or entity indicators
- Alert rings, deployment effects, turn-timer visuals
- Corpses, blood, tracers

### 🧪 Tests
- Number of tests pass/fail
- Test file structure changes

### 🏗️ Structure
- New files added to src/
- Tech stack changes

## Quick Checklist

After any gameplay change, update these sections:

1. **Combat System table** — cooldowns, accuracy formula, ranges, turn timer
2. **Entity Types table** — speeds, behaviour descriptions
3. **Civilian/Zombie/Military Behaviour tables** — all mechanics
4. **💡 Observing Tips** — any new tips or outdated ones
5. **Balance note** — win rate, key tuning philosophy

## Source of Truth

Always read the actual code to verify values before updating docs. Key files:
- `src/simulation.ts` — all gameplay constants and formulas (v5 refactored)
- `src/renderer.ts` — all visual effects
- `src/main.ts` — UI, controls, notifications
