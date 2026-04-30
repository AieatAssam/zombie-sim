// Simulation Engine — core simulation logic v2 (balanced)

import type { Building, WorldMap } from './world';
import { findNearestBuilding, isInsideBuilding, generateWorld } from './world';

export type EntityType = 'civilian' | 'zombie' | 'military';
export type EntityState =
  | 'idle' | 'wandering' | 'fleeing' | 'foraging' | 'sleeping' | 'infected' | 'dead'
  | 'hunting' | 'attacking' | 'patrolling' | 'engaging' | 'resupplying' | 'hiding';

export interface Entity {
  id: number;
  type: EntityType;
  x: number;
  z: number;
  vx: number;
  vz: number;
  state: EntityState;
  hp: number;
  maxHp: number;
  hunger: number;
  fatigue: number;
  ammo: number;
  maxAmmo: number;
  infectionTimer: number;
  attackCooldown: number;
  targetId: number | null;
  wanderAngle: number;
  wanderTimer: number;
  sleepTimer: number;
  forageTimer: number;
  buildingId: number | null;
  lastUpdateTime: number;
  speed: number;
  color: string;
  isAsleep: boolean;
  isPanicking: boolean;
  panicTimer: number;
  squadId: number | null;
  kills: number;
  hideTimer: number;
  biteAttempts: number;
}

export interface SimulationState {
  entities: Entity[];
  buildings: Building[];
  timeOfDay: number;
  day: number;
  totalTime: number;
  stats: PopulationStats;
  map: WorldMap;
  events: SimEvent[];
  gameOver: boolean;
  gameOverReason: string;
}

export interface PopulationStats {
  civilians: number;
  zombies: number;
  military: number;
  dead: number;
  totalBorn: number;
  totalInfected: number;
  totalKilled: number;
  foodSupply: number;
}

export interface SimEvent {
  time: number;
  day: number;
  text: string;
  type: 'zombie' | 'death' | 'info' | 'warning' | 'military';
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

const MAP_HALF = 30;

export class Simulation {
  state: SimulationState;
  nextId = 1;
  events: SimEvent[] = [];
  private map: WorldMap;
  private lastEventTime = 0;

  history: { day: number; civilians: number; zombies: number; military: number }[] = [];
  private historyTimer = 0;

  // For ambient storytelling
  private outbreakPhase = 0;
  private lastPhaseCheck = 0;
  private deploymentTimer = 0;

  constructor() {
    this.map = generateWorld(Date.now());
    this.state = this.createInitialState(this.map);
    this.logEvent('🧬 Outbreak detected in the city. Patient zero active.', 'warning');
    this.logEvent('🏙️ Population: 400. Military expected in 48 hours.', 'info');
  }

  private generateMap(): WorldMap {
    return generateWorld(Date.now() + Math.floor(Math.random() * 99999));
  }

  private createInitialState(map: WorldMap): SimulationState {
    const entities: Entity[] = [];
    const civilianCount = 400;
    let spawned = 0;
    let attempts = 0;
    while (spawned < civilianCount && attempts < 6000) {
      attempts++;
      const x = (Math.random() - 0.5) * (map.width - 10);
      const z = (Math.random() - 0.5) * (map.depth - 10);
      if (!isInsideBuilding(map.buildings, x, z)) {
        entities.push(this.createCivilian(x, z));
        spawned++;
      }
    }

    // Patient zero
    let zx = (Math.random() - 0.5) * 15;
    let zz = (Math.random() - 0.5) * 15;
    if (isInsideBuilding(map.buildings, zx, zz)) { zx -= 4; zz -= 4; }
    entities.push(this.createZombie(zx, zz));

    return {
      entities,
      buildings: map.buildings,
      timeOfDay: 0.08,
      day: 1,
      totalTime: 0,
      stats: { civilians: civilianCount, zombies: 1, military: 0, dead: 0, totalBorn: 0, totalInfected: 0, totalKilled: 0, foodSupply: 100 },
      map,
      events: [],
      gameOver: false,
      gameOverReason: '',
    };
  }

  private createCivilian(x: number, z: number): Entity {
    return {
      id: this.nextId++,
      type: 'civilian', x, z, vx: 0, vz: 0,
      state: 'wandering', hp: 100, maxHp: 100,
      hunger: 60 + Math.random() * 40, fatigue: 0,
      ammo: 0, maxAmmo: 0, infectionTimer: 0, attackCooldown: 0,
      targetId: null, wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: Math.random() * 5, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 2.0 + Math.random() * 0.8,
      color: '#4da6ff', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: null, kills: 0, hideTimer: 0, biteAttempts: 0,
    };
  }

  private createZombie(x: number, z: number): Entity {
    return {
      id: this.nextId++,
      type: 'zombie', x, z, vx: 0, vz: 0,
      state: 'hunting', hp: 40, maxHp: 40,
      hunger: 100, fatigue: 100, ammo: 0, maxAmmo: 0,
      infectionTimer: 0, attackCooldown: 0, targetId: null,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: Math.random() * 3, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 1.6 + Math.random() * 0.5,
      color: '#44ff44', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: null, kills: 0, hideTimer: 0, biteAttempts: 0,
    };
  }

  private createMilitary(x: number, z: number): Entity {
    return {
      id: this.nextId++,
      type: 'military', x, z, vx: 0, vz: 0,
      state: 'patrolling', hp: 100, maxHp: 100,
      hunger: 70 + Math.random() * 30, fatigue: 10,
      ammo: 150, maxAmmo: 150, infectionTimer: 0, attackCooldown: 0,
      targetId: null, wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 1, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 2.0 + Math.random() * 0.5,
      color: '#ff4444', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: null, kills: 0, hideTimer: 0, biteAttempts: 0,
    };
  }

  private logEvent(text: string, type: SimEvent['type']): void {
    this.events.push({ time: this.state.totalTime, day: this.state.day, text, type });
    if (this.events.length > 150) this.events.shift();
  }

  private logEventThrottled(text: string, type: SimEvent['type'], throttle: number = 3): void {
    if (this.state.totalTime - this.lastEventTime > throttle) {
      this.lastEventTime = this.state.totalTime;
      this.logEvent(text, type);
    }
  }

  reset(): void {
    this.nextId = 1;
    this.events = [];
    this.history = [];
    this.historyTimer = 0;
    this.lastEventTime = 0;
    this.outbreakPhase = 0;
    this.lastPhaseCheck = 0;
    this.map = this.generateMap();
    this.state = this.createInitialState(this.map);
    this.logEvent('🔄 New city generated. Outbreak unfolding...', 'warning');
    this.logEvent('🏙️ Population: 400. Good luck.', 'info');
  }

  tick(dt: number): void {
    const s = this.state;
    if (s.gameOver) return;

    s.totalTime += dt;

    const DAY_LENGTH = 60;
    const prevDay = s.day;
    s.day = Math.floor(s.totalTime / DAY_LENGTH) + 1;
    s.timeOfDay = (s.totalTime % DAY_LENGTH) / DAY_LENGTH;

    const isNight = s.timeOfDay > 0.65 || s.timeOfDay < 0.08;

    // ─── Phase tracking ───
    this.updatePhase();

    // ─── Military deployment ───
    this.deployMilitary();

    // ─── Update entities ───
    for (const e of s.entities) {
      if (e.state === 'dead') continue;
      this.updateEntity(e, dt, isNight);
    }

    // Remove dead
    s.entities = s.entities.filter(e => e.state !== 'dead');

    // ─── Stats ───
    let civ = 0, zomb = 0, mil = 0, dead = 0;
    for (const e of s.entities) {
      if (e.state === 'dead') { dead++; continue; }
      if (e.type === 'civilian') civ++;
      else if (e.type === 'zombie') zomb++;
      else if (e.type === 'military') mil++;
    }
    // Track dead entities that were removed
    dead += s.stats.dead - dead > 0 ? 0 : 0;

    s.stats.civilians = civ;
    s.stats.zombies = zomb;
    s.stats.military = mil;

    // Food supply: more reasonable formula based on food sources vs population
    let totalFood = 0;
    for (const b of s.buildings) totalFood += b.food;
    const humanPop = civ + mil;
    if (humanPop > 0) {
      // Base: each person needs ~2 food per day, buildings regenerate food naturally
      const foodPerCapita = totalFood / Math.max(1, humanPop);
      s.stats.foodSupply = Math.min(100, Math.max(0, Math.round(foodPerCapita * 8)));
    } else {
      s.stats.foodSupply = 0;
    }

    // History
    this.historyTimer += dt;
    if (this.historyTimer > 1.5) {
      this.historyTimer = 0;
      this.history.push({ day: s.day, civilians: civ, zombies: zomb, military: mil });
      if (this.history.length > 500) this.history.shift();
    }

    // ─── Game over checks ───
    if (civ <= 0 && mil <= 0 && zomb > 0) {
      s.gameOver = true;
      s.gameOverReason = '💀 HUMANS EXTINCT. ZOMBIES WIN.';
      this.logEvent('☠️ GAME OVER — All humans infected or dead.', 'death');
    } else if (zomb <= 0 && s.day > 2) {
      s.gameOver = true;
      s.gameOverReason = '🎉 CITY SAVED! ZOMBIES ELIMINATED.';
      this.logEvent('✅ GAME OVER — Zombies have been eliminated!', 'info');
    } else if (humanPop <= 0) {
      s.gameOver = true;
      s.gameOverReason = '💀 NO SURVIVORS REMAIN.';
      this.logEvent('☠️ GAME OVER — No survivors.', 'death');
    }
  }

  private updatePhase(): void {
    const s = this.state;
    const ratio = s.stats.civilians > 0 ? s.stats.zombies / (s.stats.civilians + s.stats.zombies) : 1;

    const newPhase = ratio < 0.1 ? 0 : ratio < 0.4 ? 1 : ratio < 0.7 ? 2 : ratio < 0.9 ? 3 : 4;
    const day = s.day;

    if (newPhase !== this.outbreakPhase && day > this.lastPhaseCheck) {
      this.outbreakPhase = newPhase;
      this.lastPhaseCheck = day;
      const msgs = [
        '📡 PHASE 1: Containment — outbreak localized.',
        '⚠️ PHASE 2: Spread — infection crossing containment zones.',
        '🚨 PHASE 3: Explosion — rapid transmission! City in chaos!',
        '🆘 PHASE 4: Collapse — civilization breaking down!',
        '☠️ PHASE 5: Extinction-level event imminent.',
      ];
      if (newPhase >= 0 && newPhase < msgs.length) {
        this.logEvent(msgs[newPhase], 'warning');
      }
    }
  }

  private deployMilitary(): void {
    const s = this.state;
    const day = s.day;

    // Cooldown: check every ~15 seconds of game time
    this.deploymentTimer += 1; // called once per tick
    if (this.deploymentTimer < 10) return; // ~0.5 game-seconds per tick throttle
    this.deploymentTimer = 0;

    // Initial deployment day 2 (guaranteed)
    if (day === 2 && s.totalTime < DAY_LENGTH * 2 + 10 && s.stats.military === 0) {
      const count = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const x = Math.cos(angle) * (MAP_HALF - 3);
        const z = Math.sin(angle) * (MAP_HALF - 3);
        s.entities.push(this.createMilitary(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2));
        s.stats.military++;
      }
      this.logEvent(`🚁 Military deployed! ${count} units entering the city.`, 'military');
      return;
    }

    const zombieThreat = s.stats.zombies;

    // Ongoing reinforcements — very throttled
    if (day >= 2 && day < 15 && zombieThreat > s.stats.military * 3 && zombieThreat >= 5) {
      const idealMil = Math.min(15, Math.max(3, Math.floor(zombieThreat / 10)));
      if (s.stats.military < idealMil) {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const x = Math.cos(angle) * (MAP_HALF - 3);
          const z = Math.sin(angle) * (MAP_HALF - 3);
          s.entities.push(this.createMilitary(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2));
          s.stats.military++;
        }
        this.logEvent(`🔫 ${count} reinforcement${count > 1 ? 's' : ''} deployed.`, 'military');
      }
    }

    // Emergency response when overwhelmed (very rare)
    if (zombieThreat > 80 && s.stats.military < 8 && day >= 3 && s.stats.military > 0) {
      const count = 4 + Math.floor(Math.random() * 3);
      const angle = Math.random() * Math.PI * 2;
      const x = Math.cos(angle) * (MAP_HALF - 3);
      const z = Math.sin(angle) * (MAP_HALF - 3);
      for (let i = 0; i < count; i++) {
        s.entities.push(this.createMilitary(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3));
        s.stats.military++;
      }
      this.logEvent(`🚁 EMERGENCY RESPONSE! ${count} troops deployed!`, 'military');
    }
  }

  private updateEntity(e: Entity, dt: number, isNight: boolean): void {
    const s = this.state;

    // Infection countdown
    if (e.infectionTimer > 0) {
      e.infectionTimer -= dt;
      if (e.infectionTimer <= 0) {
        this.logEvent(`Civilian #${e.id} turned into a zombie!`, 'zombie');
        e.type = 'zombie';
        e.hp = 40;
        e.maxHp = 40;
        e.speed = 1.3 + Math.random() * 0.6;
        e.color = '#44ff44';
        e.infectionTimer = 0;
        e.state = 'hunting';
        e.isAsleep = false;
        e.attackCooldown = 0;
        s.stats.totalInfected++;
      }
    }

    switch (e.type) {
      case 'civilian': this.updateCivilian(e, dt, isNight); break;
      case 'zombie': this.updateZombie(e, dt, isNight); break;
      case 'military': this.updateMilitary(e, dt, isNight); break;
    }

    // Movement
    if (!e.isAsleep) {
      e.x += e.vx * dt;
      e.z += e.vz * dt;
    }

    // Map bounds
    const halfW = s.map.width / 2 - 0.5;
    const halfD = s.map.depth / 2 - 0.5;
    e.x = Math.max(-halfW, Math.min(halfW, e.x));
    e.z = Math.max(-halfD, Math.min(halfD, e.z));

    // Friction
    if (!e.isAsleep) {
      e.vx *= 0.92;
      e.vz *= 0.92;
    } else {
      e.vx *= 0.7;
      e.vz *= 0.7;
    }

    // Clamp velocity
    const maxSpeed = e.isAsleep ? 0.1 : e.speed * (e.type === 'zombie' ? 1.3 : 1.2);
    const spd = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
    if (spd > maxSpeed) {
      e.vx = (e.vx / spd) * maxSpeed;
      e.vz = (e.vz / spd) * maxSpeed;
    }
  }

  private updateCivilian(e: Entity, dt: number, isNight: boolean): void {
    e.hunger -= 0.25 * dt;
    e.fatigue += 0.12 * dt;

    // Starvation
    if (e.hunger <= -30) {
      e.hp -= 3 * dt;
      if (e.hp <= 0) {
        e.state = 'dead';
        return;
      }
    }

    // Night sleep
    if (isNight && e.fatigue > 60 && e.infectionTimer <= 0) {
      e.isAsleep = true;
      e.state = 'sleeping';
      e.vx = 0; e.vz = 0;
      return;
    }
    if (e.isAsleep) {
      e.fatigue -= 2.5 * dt;
      e.hunger -= 0.05 * dt;
      if (e.fatigue <= 0) { e.fatigue = 0; e.isAsleep = false; e.state = 'wandering'; }
      return;
    }

    // Check for zombies
    const nearestZombie = this.findNearest(e, 12, 'zombie');
    const zombieDist = nearestZombie ? dist(e, nearestZombie) : 999;

    // Hide in building if zombie very close
    if (zombieDist < 5 && e.state !== 'hiding') {
      const building = isInsideBuilding(this.state.buildings, e.x, e.z, 0.5);
      if (!building) {
        // Try to get inside a building
        const targetB = findNearestBuilding(this.state.buildings, e.x, e.z);
        if (targetB && dist(e, targetB) < 3) {
          // Move to building and "hide"
          e.state = 'fleeing';
          e.isPanicking = true;
          e.panicTimer = 5;
        } else {
          e.state = 'fleeing';
          e.isPanicking = true;
          e.panicTimer = 4;
        }
      } else {
        // Hide inside
        e.state = 'hiding';
        e.hideTimer = 3 + Math.random() * 4;
        e.vx = 0; e.vz = 0;
      }
    }

    switch (e.state) {
      case 'hiding': {
        e.vx = 0; e.vz = 0;
        e.hideTimer -= dt;
        if (e.hideTimer <= 0 || !nearestZombie || dist(e, nearestZombie) > 12) {
          e.state = 'wandering';
        }
        break;
      }

      case 'fleeing': {
        const z = this.findNearest(e, 20, 'zombie');
        if (z) {
          const d = dist(e, z);
          if (d < 1.3) {
            // Bitten
            if (e.infectionTimer <= 0) {
              e.infectionTimer = 10 + Math.random() * 8;
              e.state = 'infected';
              e.color = '#88ff44';
              this.logEvent(`Civilian #${e.id} was bitten!`, 'zombie');
            }
          } else {
            // Flee direction (away from zombie + random)
            const dx = e.x - z.x;
            const dz = e.z - z.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            const fleeAngle = Math.atan2(dz, dx);
            const jitter = (Math.random() - 0.5) * 0.8;
            const spd = e.speed * 1.6;
            e.vx += Math.cos(fleeAngle + jitter) * spd * dt * 0.4;
            e.vz += Math.sin(fleeAngle + jitter) * spd * dt * 0.4;
          }
        }
        e.panicTimer -= dt;
        if (e.panicTimer <= 0 && (!nearestZombie || dist(e, nearestZombie) > 16)) {
          e.isPanicking = false;
          e.state = 'wandering';
        }
        break;
      }

      case 'infected': {
        // Erratic movement
        e.wanderAngle += (Math.random() - 0.5) * 0.3;
        e.vx += Math.cos(e.wanderAngle) * e.speed * 0.7 * dt;
        e.vz += Math.sin(e.wanderAngle) * e.speed * 0.7 * dt;
        break;
      }

      case 'foraging': {
        e.forageTimer -= dt;
        e.vx *= 0.9; e.vz *= 0.9; // Slow down while foraging
        if (e.forageTimer <= 0) {
          if (e.buildingId !== null) {
            const b = this.state.buildings.find(b => b.id === e.buildingId);
            if (b && b.food > 0) {
              const found = Math.min(b.food, 8 + Math.floor(Math.random() * 10));
              b.food -= found;
              e.hunger = Math.min(100, e.hunger + found);
            }
          }
          e.state = 'wandering';
          e.buildingId = null;
        }
        break;
      }

      case 'wandering':
      default: {
        e.wanderTimer -= dt;
        if (e.wanderTimer <= 0) {
          e.wanderAngle = Math.random() * Math.PI * 2;
          e.wanderTimer = 2 + Math.random() * 5;

          // If hungry, seek food
          if (e.hunger < 35) {
            const target = findNearestBuilding(this.state.buildings, e.x, e.z);
            if (target && target.food > 0) {
              const dx = target.x - e.x;
              const dz = target.z - e.z;
              e.wanderAngle = Math.atan2(dz, dx);
              e.wanderTimer = dist(e, target) / (e.speed * 0.8);
              e.state = 'foraging';
              e.buildingId = target.id;
              e.forageTimer = e.wanderTimer + 2;
            }
          }
        }
        const spd = e.speed * (e.hunger < 20 ? 0.6 : 1.0);
        e.vx += Math.cos(e.wanderAngle) * spd * dt * 0.25;
        e.vz += Math.sin(e.wanderAngle) * spd * dt * 0.25;
        break;
      }
    }
  }

  private updateZombie(e: Entity, dt: number, isNight: boolean): void {
    e.attackCooldown -= dt;

    // Night speed boost (horde mode)
    const nightSpeedMul = isNight ? 1.35 : 1.0;

    const targetCiv = this.findNearest(e, 18, 'civilian');
    const targetMil = this.findNearest(e, 16, 'military'); // increased range at night
    const target = targetCiv || targetMil;

    // Better wander at night — zombies spread more
    if (!target) {
      e.wanderTimer -= dt;
      if (e.wanderTimer <= 0) {
        e.wanderAngle = Math.random() * Math.PI * 2;
        e.wanderTimer = 2 + Math.random() * 4;
      }
      e.vx += Math.cos(e.wanderAngle) * e.speed * nightSpeedMul * 0.3 * dt;
      e.vz += Math.sin(e.wanderAngle) * e.speed * nightSpeedMul * 0.3 * dt;
      e.state = 'hunting';
      return;
    }

    const d = dist(e, target);

    if (d < 1.3) {
      // Attack
      e.state = 'attacking';
      e.vx *= 0.85;
      e.vz *= 0.85;
      if (e.attackCooldown <= 0) {
        e.attackCooldown = 2.5;
        if (target.type === 'civilian' && target.infectionTimer <= 0) {
          target.infectionTimer = 10 + Math.random() * 8;
          target.state = 'infected';
          target.color = '#88ff44';
          e.biteAttempts++;
          this.logEventThrottled(`Zombie infected civilian #${target.id}.`, 'zombie', 2);
        } else if (target.type === 'military') {
          target.hp -= 20;
          if (target.hp <= 0) {
            target.state = 'dead';
            this.logEvent(`Military unit #${target.id} killed by zombie.`, 'death');
          }
        }
      }
    } else {
      // Chase — faster at night
      const dx = target.x - e.x;
      const dz = target.z - e.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const chaseSpd = e.speed * 1.15 * nightSpeedMul;
      e.vx += (dx / len) * chaseSpd * dt * 0.35;
      e.vz += (dz / len) * chaseSpd * dt * 0.35;
      e.state = 'hunting';
    }
  }

  private updateMilitary(e: Entity, dt: number, isNight: boolean): void {
    e.hunger -= 0.2 * dt;
    e.fatigue += 0.08 * dt;
    const s = this.state;

    if (e.hunger <= -30) {
      e.hp -= 2 * dt;
      if (e.hp <= 0) {
        e.state = 'dead';
        this.logEvent(`Military unit #${e.id} died of starvation.`, 'death');
        return;
      }
    }

    // Sleep at night
    if (isNight && e.fatigue > 80) {
      e.isAsleep = true;
      e.state = 'sleeping';
      e.vx = 0; e.vz = 0;
      return;
    }
    if (e.isAsleep) {
      e.fatigue -= 3.5 * dt;
      if (e.fatigue <= 10) { e.fatigue = 10; e.isAsleep = false; e.state = 'patrolling'; }
      return;
    }

    e.attackCooldown -= dt;

    // Emergency resupply
    if (e.ammo <= 0) {
      e.state = 'resupplying';
      const targetB = findNearestBuilding(this.state.buildings, e.x, e.z);
      if (targetB) {
        if (dist(e, targetB) < 1.2) {
          const gotAmmo = Math.min(targetB.ammo, 30);
          if (gotAmmo > 0) { targetB.ammo -= gotAmmo; e.ammo = Math.min(e.maxAmmo, e.ammo + gotAmmo); }
          const gotFood = Math.min(targetB.food, 10);
          if (gotFood > 0) { targetB.food -= gotFood; e.hunger = Math.min(100, e.hunger + gotFood); }
        } else {
          const dx = targetB.x - e.x;
          const dz = targetB.z - e.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          e.vx += (dx / len) * e.speed * dt * 0.35;
          e.vz += (dz / len) * e.speed * dt * 0.35;
        }
      }
      return;
    }

    // Forage if hungry
    if (e.hunger < 25) {
      const targetB = findNearestBuilding(this.state.buildings, e.x, e.z);
      if (targetB && dist(e, targetB) < 1.5) {
        const gotFood = Math.min(targetB.food, 15);
        if (gotFood > 0) { targetB.food -= gotFood; e.hunger = Math.min(100, e.hunger + gotFood); }
        return;
      }
    }

    // Check for nearby civilians in danger — prioritize protecting them
    const nearCivInDanger = this.findNearest(e, 10, 'civilian');
    const nearZombie = this.findNearest(e, 16, 'zombie');

    // If a civilian is very close and a zombie is nearby, protect them
    if (nearCivInDanger && nearZombie && dist(nearCivInDanger, nearZombie) < 4) {
      // Intercept zombie threatening civilian
      const dx = nearZombie.x - e.x;
      const dz = nearZombie.z - e.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      e.vx += (dx / len) * e.speed * 0.5 * dt;
      e.vz += (dz / len) * e.speed * 0.5 * dt;
      e.state = 'engaging';
      return;
    }

    if (nearZombie && dist(e, nearZombie) < 12) {
      e.state = 'engaging';
      const d = dist(e, nearZombie);

      // Shoot at range
      if (d < 10 && e.attackCooldown <= 0 && e.ammo > 0) {
        e.attackCooldown = 1.3;
        nearZombie.hp -= 12;
        e.ammo -= 1;
        e.kills++;

        // Create shot effect
        this.state.events.push({
          time: this.state.totalTime,
          day: this.state.day,
          text: `SHOT:${e.x},${e.z},${nearZombie.x},${nearZombie.z}`,
          type: 'military',
        });

        if (nearZombie.hp <= 0) {
          nearZombie.state = 'dead';
          this.logEventThrottled(`Military unit #${e.id} killed zombie #${nearZombie.id}.`, 'military', 0.5);
        }
      }

      // Maintain distance
      if (d < 4) {
        const dx = e.x - nearZombie.x;
        const dz = e.z - nearZombie.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * dt * 0.5;
        e.vz += (dz / len) * e.speed * dt * 0.5;
      } else if (d > 9) {
        // Close in
        const dx = nearZombie.x - e.x;
        const dz = nearZombie.z - e.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * dt * 0.25;
        e.vz += (dz / len) * e.speed * dt * 0.25;
      }

      return;
    }

    // Patrol
    e.state = 'patrolling';
    e.wanderTimer -= dt;
    if (e.wanderTimer <= 0) {
      e.wanderAngle = Math.random() * Math.PI * 2;
      e.wanderTimer = 3 + Math.random() * 5;
    }
    e.vx += Math.cos(e.wanderAngle) * e.speed * 0.4 * dt;
    e.vz += Math.sin(e.wanderAngle) * e.speed * 0.4 * dt;
  }

  private findNearest(e: Entity, range: number, type: EntityType): Entity | null {
    let best: Entity | null = null;
    let bestDist = range;
    for (const other of this.state.entities) {
      if (other.id === e.id || other.state === 'dead') continue;
      if (other.type !== type) continue;
      const d = dist(e, other);
      if (d < bestDist) {
        bestDist = d;
        best = other;
      }
    }
    return best;
  }

  getStats(): PopulationStats {
    return { ...this.state.stats };
  }

  getRecentEvents(count: number = 20): SimEvent[] {
    return this.events.slice(-count);
  }
}

const DAY_LENGTH = 60;
