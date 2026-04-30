// Simulation Engine — core simulation logic v3 (overhauled)

import type { Building, WorldMap } from './world';
import { findNearestBuilding, isInsideBuilding, generateWorld } from './world';

export type EntityType = 'civilian' | 'zombie' | 'military';
export type EntityState =
  | 'idle' | 'wandering' | 'fleeing' | 'foraging' | 'sleeping' | 'infected' | 'dead'
  | 'hunting' | 'attacking' | 'patrolling' | 'engaging' | 'resupplying' | 'hiding'
  | 'reloading' | 'starving' | 'feeding';

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
  magazineSize: number;
  ammoInMag: number;
  isReloading: boolean;
  reloadTimer: number;
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
  isSquadLeader: boolean;
  kills: number;
  hideTimer: number;
  biteAttempts: number;
  zombieAge: number;
  feedingTimer: number;
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
  totalAmmoRemaining: number;
  starvingCount: number;
  chaosLevel: number;
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
const DAY_LENGTH = 30;

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
  private radioTimer = 10;
  private nextSquadId = 1;

  // Horde grouping: zombie target zones
  private hordeCenters: { x: number; z: number; count: number }[] = [];

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
      totalAmmoRemaining: 0,
      starvingCount: 0,
      chaosLevel: 0,
    };
  }

  private createCivilian(x: number, z: number): Entity {
    return {
      id: this.nextId++,
      type: 'civilian', x, z, vx: 0, vz: 0,
      state: 'wandering', hp: 100, maxHp: 100,
      hunger: 60 + Math.random() * 40, fatigue: 0,
      ammo: 0, maxAmmo: 0, magazineSize: 0, ammoInMag: 0, isReloading: false, reloadTimer: 0,
      infectionTimer: 0, attackCooldown: 0,
      targetId: null, wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: Math.random() * 5, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 3.0 + Math.random() * 1.2,
      color: '#4da6ff', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: null, isSquadLeader: false, kills: 0, hideTimer: 0, biteAttempts: 0,
      zombieAge: 0, feedingTimer: 0,
    };
  }

  private createZombie(x: number, z: number): Entity {
    return {
      id: this.nextId++,
      type: 'zombie', x, z, vx: 0, vz: 0,
      state: 'hunting', hp: 40, maxHp: 40,
      hunger: 100, fatigue: 100, ammo: 0, maxAmmo: 0, magazineSize: 0, ammoInMag: 0, isReloading: false, reloadTimer: 0,
      infectionTimer: 0, attackCooldown: 0, targetId: null,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: Math.random() * 3, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 2.4 + Math.random() * 0.75,
      color: '#44ff44', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: null, isSquadLeader: false, kills: 0, hideTimer: 0, biteAttempts: 0,
      zombieAge: 0, feedingTimer: 0,
    };
  }

  private createMilitary(x: number, z: number, squadId?: number): Entity {
    return {
      id: this.nextId++,
      type: 'military', x, z, vx: 0, vz: 0,
      state: 'patrolling', hp: 100, maxHp: 100,
      hunger: 70 + Math.random() * 30, fatigue: 10,
      ammo: 150, maxAmmo: 150, magazineSize: 10, ammoInMag: 10, isReloading: false, reloadTimer: 0,
      infectionTimer: 0, attackCooldown: 0,
      targetId: null, wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 1, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 3.0 + Math.random() * 0.75,
      color: '#ff4444', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: squadId || null, isSquadLeader: false, kills: 0, hideTimer: 0, biteAttempts: 0,
      zombieAge: 0, feedingTimer: 0,
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
    this.nextSquadId = 1;
    this.radioTimer = 10;
    this.logEvent('🔄 New city generated. Outbreak unfolding...', 'warning');
    this.logEvent('🏙️ Population: 400. Good luck.', 'info');
  }

  tick(dt: number): void {
    const s = this.state;
    if (s.gameOver) return;

    s.totalTime += dt;

    const prevDay = s.day;
    s.day = Math.floor(s.totalTime / DAY_LENGTH) + 1;
    s.timeOfDay = (s.totalTime % DAY_LENGTH) / DAY_LENGTH;

    const isNight = s.timeOfDay > 0.65 || s.timeOfDay < 0.08;

    // ─── Phase tracking ───
    this.updatePhase();

    // ─── Military deployment ───
    this.deployMilitary();

    // ─── Calculate horde centers for zombie grouping ───
    this.computeHordeCenters();

    // ─── Update entities ───
    for (const e of s.entities) {
      if (e.state === 'dead') continue;
      this.updateEntity(e, dt, isNight);
      // Push out of buildings after movement
      this.pushOutOfBuilding(e);
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

    s.stats.civilians = civ;
    s.stats.zombies = zomb;
    s.stats.military = mil;
    s.stats.dead = dead;

    // Food supply
    let totalFood = 0;
    for (const b of s.buildings) totalFood += b.food;
    const humanPop = civ + mil;
    if (humanPop > 0) {
      const foodPerCapita = totalFood / Math.max(1, humanPop);
      s.stats.foodSupply = Math.min(100, Math.max(0, Math.round(foodPerCapita * 8)));
    } else {
      s.stats.foodSupply = 0;
    }

    // Total ammo remaining
    let totalAmmo = 0;
    let starvingCount = 0;
    for (const e of s.entities) {
      totalAmmo += e.ammo;
      if (e.type === 'military') totalAmmo += e.ammoInMag;
      if (e.state === 'starving') starvingCount++;
    }
    s.totalAmmoRemaining = totalAmmo;
    s.starvingCount = starvingCount;

    // Chaos level (0-100)
    s.chaosLevel = Math.min(100, Math.round(
      (zomb > 0 ? (zomb / Math.max(1, civ + mil)) * 60 : 0) +
      (dead > 50 ? 20 : dead > 20 ? 10 : 0) +
      (zomb > 100 ? 20 : zomb > 50 ? 10 : 0)
    ));

    // History
    this.historyTimer += dt;
    if (this.historyTimer > 1.5) {
      this.historyTimer = 0;
      this.history.push({ day: s.day, civilians: civ, zombies: zomb, military: mil });
      if (this.history.length > 500) this.history.shift();
    }

    // Radio messages
    this.radioTimer -= dt;
    if (this.radioTimer <= 0 && zomb > 5) {
      this.radioTimer = 8 + Math.random() * 10;
      this.broadcastRadioMessage(zomb, civ, mil);
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

  private broadcastRadioMessage(zomb: number, civ: number, mil: number): void {
    const ratio = civ > 0 ? zomb / (civ + 1) : 99;
    const messages: string[] = [
      '📻 "[HQ] Situation report requested. Stay calm and seek shelter."',
      '📻 "[HQ] Evacuation routes are being established. Await further orders."',
      '📻 "[HQ] Civilians advised to stay indoors. Military units inbound."',
      '📻 "[HQ] Reports of infected spreading through the city center."',
      '📻 "[HQ] All units: contain the outbreak at all costs."',
      '📻 "[HQ] Rescue convoys delayed. Hold your positions."',
    ];
    const panicMessages: string[] = [
      '📻 "⚠️ [HQ] OUTBREAK CRITICAL! Code Red! All personnel to defensive positions!"',
      '📻 "🚨 [HQ] Civilian casualties mounting! Requesting immediate air support!"',
      '📻 "☢️ [HQ] Contamination zone expanding! Evacuate all sectors!"',
      '📻 "💀 [HQ] We are losing control! This is not a drill!"',
    ];
    const victoryMessages: string[] = [
      '📻 "[HQ] Infection rate slowing. Good work, soldiers."',
      '📻 "[HQ] Civilians report reduced zombie activity. Maintain vigilance."',
    ];

    if (ratio > 2 && zomb > 30) {
      this.logEvent(panicMessages[Math.floor(Math.random() * panicMessages.length)], 'warning');
    } else if (ratio < 0.3 && mil > 0) {
      this.logEvent(victoryMessages[Math.floor(Math.random() * victoryMessages.length)], 'info');
    } else {
      this.logEvent(messages[Math.floor(Math.random() * messages.length)], 'info');
    }
  }

  private computeHordeCenters(): void {
    const zombies = this.state.entities.filter(e => e.type === 'zombie' && e.state !== 'dead');
    this.hordeCenters = [];

    // Simple clustering: group zombies by proximity
    const clustered = new Set<number>();
    for (const z of zombies) {
      if (clustered.has(z.id)) continue;
      const nearby = zombies.filter(o => o.id !== z.id && !clustered.has(o.id) && dist(z, o) < 5);
      if (nearby.length >= 3) {
        let cx = z.x, cz = z.z;
        let count = 1 + nearby.length;
        for (const n of nearby) {
          cx += n.x; cz += n.z;
          clustered.add(n.id);
        }
        clustered.add(z.id);
        cx /= count; cz /= count;
        this.hordeCenters.push({ x: cx, z: cz, count });
      }
    }
  }

  // ─── BUILDING COLLISION: push entities out of buildings ───
  private pushOutOfBuilding(e: Entity): void {
    for (const b of this.state.buildings) {
      const hw = b.w / 2;
      const hd = b.d / 2;
      if (Math.abs(b.x - e.x) < hw && Math.abs(b.z - e.z) < hd) {
        // Entity is inside this building — push to nearest edge
        const dx = e.x - b.x;
        const dz = e.z - b.z;
        // Distance to each edge
        const distRight = hw - dx;
        const distLeft = hw + dx;
        const distTop = hd - dz;
        const distBottom = hd + dz;
        const minDist = Math.min(distRight, distLeft, distTop, distBottom);

        if (minDist === distRight) e.x = b.x + hw + 0.3;
        else if (minDist === distLeft) e.x = b.x - hw - 0.3;
        else if (minDist === distTop) e.z = b.z + hd + 0.3;
        else e.z = b.z - hd - 0.3;
      }
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

    this.deploymentTimer += 1;
    if (this.deploymentTimer < 10) return;
    this.deploymentTimer = 0;

    // Initial deployment day 2 (guaranteed)
    if (day === 2 && s.totalTime < DAY_LENGTH * 2 + 10 && s.stats.military === 0) {
      const squadId = this.nextSquadId++;
      const count = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const x = Math.cos(angle) * (MAP_HALF - 3);
        const z = Math.sin(angle) * (MAP_HALF - 3);
        const e = this.createMilitary(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2, squadId);
        if (i === 0) e.isSquadLeader = true;
        s.entities.push(e);
        s.stats.military++;
      }
      this.logEvent(`🚁 Military deployed! Squad ${squadId} (${count} units) entering the city.`, 'military');
      return;
    }

    // Additional squad deployment on later days
    if (day >= 3 && s.stats.zombies > s.stats.military * 4 && s.stats.military < 20) {
      const squadId = this.nextSquadId++;
      const count = 2 + Math.floor(Math.random() * 2);
      const angle = Math.random() * Math.PI * 2;
      const x = Math.cos(angle) * (MAP_HALF - 3);
      const z = Math.sin(angle) * (MAP_HALF - 3);
      for (let i = 0; i < count; i++) {
        const e = this.createMilitary(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3, squadId);
        if (i === 0) e.isSquadLeader = true;
        s.entities.push(e);
        s.stats.military++;
      }
      this.logEvent(`🔫 Squad ${squadId} deployed (${count} troops).`, 'military');
    }

    // Emergency response when overwhelmed
    if (s.stats.zombies > 80 && s.stats.military < 8 && day >= 3) {
      const squadId = this.nextSquadId++;
      const count = 4 + Math.floor(Math.random() * 3);
      const angle = Math.random() * Math.PI * 2;
      const x = Math.cos(angle) * (MAP_HALF - 3);
      const z = Math.sin(angle) * (MAP_HALF - 3);
      for (let i = 0; i < count; i++) {
        const e = this.createMilitary(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3, squadId);
        if (i === 0) e.isSquadLeader = true;
        s.entities.push(e);
        s.stats.military++;
      }
      this.logEvent(`🚁 EMERGENCY RESPONSE! Squad ${squadId} deployed!`, 'military');
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
        e.speed = 2.4 + Math.random() * 0.75;
        e.color = '#44ff44';
        e.infectionTimer = 0;
        e.state = 'hunting';
        e.isAsleep = false;
        e.attackCooldown = 0;
        e.zombieAge = 0;
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

  // ─── CIVILIAN AI ───
  private updateCivilian(e: Entity, dt: number, isNight: boolean): void {
    e.hunger -= 0.35 * dt;
    e.fatigue += 0.15 * dt;

    // Check if starving
    if (e.hunger < 15 && e.state !== 'starving' && e.state !== 'dead') {
      e.state = 'starving';
    }

    // Starvation
    if (e.hunger <= -30) {
      e.hp -= 4 * dt;
      if (e.hp <= 0) {
        e.state = 'dead';
        return;
      }
    }

    // Night sleep
    if (isNight && e.fatigue > 60 && e.infectionTimer <= 0 && e.state !== 'starving') {
      e.isAsleep = true;
      e.state = 'sleeping';
      e.vx = 0; e.vz = 0;
      return;
    }
    if (e.isAsleep) {
      e.fatigue -= 3.0 * dt;
      e.hunger -= 0.1 * dt;
      if (e.fatigue <= 0) { e.fatigue = 0; e.isAsleep = false; e.state = 'wandering'; }
      return;
    }

    // ─── PANIC / FLEEING SYSTEM ───
    const fleeRange = 18;
    const nearestZombie = this.findNearest(e, fleeRange, 'zombie');
    const zombieDist = nearestZombie ? dist(e, nearestZombie) : 999;
    const nearestZombieClose = this.findNearest(e, 12, 'zombie');
    const zombieDistClose = nearestZombieClose ? dist(e, nearestZombieClose) : 999;

    // Dramatic panic: flee immediately when zombie within 8 units
    if (zombieDistClose < 8) {
      e.state = 'fleeing';
      e.isPanicking = true;
      e.panicTimer = 6 + Math.random() * 3;
      e.buildingId = null; // Cancel any foraging mission
    }

    // Hide in building if zombie very close
    if (zombieDistClose < 5 && e.state !== 'hiding') {
      const building = isInsideBuilding(this.state.buildings, e.x, e.z, 0.5);
      if (!building) {
        // Try to find a nearby building to hide in
        const targetB = findNearestBuilding(this.state.buildings, e.x, e.z);
        if (targetB && dist(e, targetB) < 4) {
          // Move toward building and hide
          e.state = 'fleeing';
          e.isPanicking = true;
          e.panicTimer = 5;
        } else {
          e.state = 'fleeing';
          e.isPanicking = true;
          e.panicTimer = 6 + Math.random() * 3;
        }
      } else {
        // Hide inside
        e.state = 'hiding';
        e.hideTimer = 3 + Math.random() * 4;
        e.vx = 0; e.vz = 0;
      }
    }

    // State machine
    switch (e.state) {
      case 'hiding': {
        e.vx = 0; e.vz = 0;
        e.hideTimer -= dt;
        // Check if zombie is still near before coming out
        const zCheck = this.findNearest(e, 14, 'zombie');
        if (e.hideTimer <= 0 || !zCheck || dist(e, zCheck) > 14) {
          e.state = 'wandering';
        }
        break;
      }

      case 'fleeing': {
        const z = this.findNearest(e, 25, 'zombie');
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
            // Flee away from zombie at 2.5x speed with random jitter
            const dx = e.x - z.x;
            const dz = e.z - z.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            const fleeAngle = Math.atan2(dz, dx);
            const jitter = (Math.random() - 0.5) * 1.2; // More jitter for panic
            const spd = e.speed * 2.5;
            e.vx += Math.cos(fleeAngle + jitter) * spd * dt * 0.5;
            e.vz += Math.sin(fleeAngle + jitter) * spd * dt * 0.5;
          }
        }
        e.panicTimer -= dt;
        if (e.panicTimer <= 0 && (!nearestZombie || dist(e, nearestZombie) > 18)) {
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

      case 'starving': {
        // Starving: desperate for food, ignores distant zombies
        // Reduced speed, more desperate behavior
        e.wanderTimer -= dt;

        // Find nearest food building
        const foodB = this.findNearestFoodBuilding(e.x, e.z);
        if (foodB && dist(e, foodB) < 1.5) {
          // Forage
          const found = Math.min(foodB.food, 12 + Math.floor(Math.random() * 15));
          if (found > 0) {
            foodB.food -= found;
            e.hunger = Math.min(80, e.hunger + found);
            if (e.hunger > 30) e.state = 'wandering'; // No longer starving
          }
          e.wanderTimer = 1;
          e.vx *= 0.8; e.vz *= 0.8;
        } else if (foodB) {
          // Move toward food, but avoid nearby zombies (within 4 units)
          const zNear = this.findNearest(e, 8, 'zombie');
          if (zNear && dist(e, zNear) < 4) {
            // Flee first!
            const dx = e.x - zNear.x;
            const dz = e.z - zNear.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            e.vx += (dx / len) * e.speed * 2.0 * dt;
            e.vz += (dz / len) * e.speed * 2.0 * dt;
          } else {
            // Move toward food
            const dx = foodB.x - e.x;
            const dz = foodB.z - e.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            // If zombie nearby but not too close, add a perpendicular detour
            if (zNear && dist(e, zNear) < 8) {
              const perpX = -dz / len;
              const perpZ = dx / len;
              e.vx += (dx / len * 0.6 + perpX * 0.5) * e.speed * 0.6 * dt;
              e.vz += (dz / len * 0.6 + perpZ * 0.5) * e.speed * 0.6 * dt;
            } else {
              e.vx += (dx / len) * e.speed * 0.5 * dt;
              e.vz += (dz / len) * e.speed * 0.5 * dt;
            }
          }
        } else {
          // No food source found — wander desperately
          if (e.wanderTimer <= 0) {
            e.wanderAngle = Math.random() * Math.PI * 2;
            e.wanderTimer = 1 + Math.random() * 2;
          }
          const spd = e.speed * 0.5; // Slower when starving
          e.vx += Math.cos(e.wanderAngle) * spd * dt * 0.3;
          e.vz += Math.sin(e.wanderAngle) * spd * dt * 0.3;
        }
        break;
      }

      case 'foraging': {
        e.forageTimer -= dt;
        e.vx *= 0.9; e.vz *= 0.9;
        // Check for nearby zombies while foraging
        const zNear = this.findNearest(e, 8, 'zombie');
        if (zNear && dist(e, zNear) < 5) {
          e.state = 'fleeing';
          e.isPanicking = true;
          e.panicTimer = 4 + Math.random() * 2;
          break;
        }
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

        // If hungry, seek food
        if (e.hunger < 35) {
          const foodB = this.findNearestFoodBuilding(e.x, e.z);
          if (foodB && foodB.food > 0) {
            const dx = foodB.x - e.x;
            const dz = foodB.z - e.z;
            const d = Math.sqrt(dx * dx + dz * dz);

            // Only forage if hungry AND zombie check is safe enough
            const nearZomb = this.findNearest(e, 12, 'zombie');
            const safeToForage = !nearZomb || dist(e, nearZomb) > 8;

            if (safeToForage) {
              e.wanderAngle = Math.atan2(dz, dx);
              e.wanderTimer = Math.max(2, d / (e.speed * 0.8));
              e.state = 'foraging';
              e.buildingId = foodB.id;
              e.forageTimer = e.wanderTimer + 2;
            } else {
              // Too dangerous — keep wandering away from zombies
              const zDx = e.x - nearZomb!.x;
              const zDz = e.z - nearZomb!.z;
              e.wanderAngle = Math.atan2(zDz, zDx) + (Math.random() - 0.5) * 0.5;
              e.wanderTimer = 1 + Math.random() * 2;
            }
          }
        }

        if (e.wanderTimer <= 0) {
          e.wanderAngle = Math.random() * Math.PI * 2;
          e.wanderTimer = 2 + Math.random() * 5;
        }
        const spd = e.speed * (e.hunger < 20 ? 0.7 : 1.0);
        e.vx += Math.cos(e.wanderAngle) * spd * dt * 0.25;
        e.vz += Math.sin(e.wanderAngle) * spd * dt * 0.25;
        break;
      }
    }
  }

  private findNearestFoodBuilding(x: number, z: number): Building | null {
    let best: Building | null = null;
    let bestDist = Infinity;
    for (const b of this.state.buildings) {
      if (b.food <= 0) continue;
      const dx = b.x - x;
      const dz = b.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  private findNearestAmmoBuilding(x: number, z: number): Building | null {
    let best: Building | null = null;
    let bestDist = Infinity;
    for (const b of this.state.buildings) {
      if (b.ammo <= 0) continue;
      if (b.type !== 'warehouse' && b.type !== 'police') continue;
      const dx = b.x - x;
      const dz = b.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  // ─── ZOMBIE AI ───
  private updateZombie(e: Entity, dt: number, isNight: boolean): void {
    e.attackCooldown -= dt;
    e.zombieAge += dt;

    // Feeding timer: after biting, stay near for 2 seconds
    if (e.state === 'feeding') {
      e.feedingTimer -= dt;
      e.vx *= 0.85;
      e.vz *= 0.85;
      if (e.feedingTimer <= 0) {
        e.state = 'hunting';
      }
      return;
    }

    // Night speed boost
    const nightSpeedMul = isNight ? 1.35 : 1.0;

    // Find the CLOSEST target — prefer civilian at same distance
    let bestTarget: Entity | null = null;
    let bestDist = 999;
    const civRange = 20;
    const milRange = 18;

    for (const other of this.state.entities) {
      if (other.id === e.id || other.state === 'dead') continue;
      if (other.type !== 'civilian' && other.type !== 'military') continue;
      const d = dist(e, other);
      const range = other.type === 'civilian' ? civRange : milRange;
      if (d < range && d < bestDist) {
        bestDist = d;
        bestTarget = other;
      } else if (d < range && d === bestDist && other.type === 'civilian') {
        // Prefer civilian at equal distance
        bestTarget = other;
      }
    }

    const target = bestTarget;

    // Horde attraction: older zombies are drawn to horde centers
    if (this.hordeCenters.length > 0 && e.zombieAge > 5 && !target) {
      const nearestHorde = this.hordeCenters.reduce((a, b) =>
        dist(e, { x: a.x, z: a.z }) < dist(e, { x: b.x, z: b.z }) ? a : b
      );
      if (nearestHorde.count >= 3) {
        const dx = nearestHorde.x - e.x;
        const dz = nearestHorde.z - e.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * nightSpeedMul * 0.2 * dt;
        e.vz += (dz / len) * e.speed * nightSpeedMul * 0.2 * dt;
      }
    }

    // Wander when no target
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
          e.state = 'feeding';
          e.feedingTimer = 2.0; // Stay near victim for 2 seconds
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

  // ─── MILITARY AI ───
  private updateMilitary(e: Entity, dt: number, isNight: boolean): void {
    e.hunger -= 0.25 * dt;
    e.fatigue += 0.1 * dt;
    const s = this.state;

    // Handle reloading
    if (e.isReloading) {
      e.reloadTimer -= dt;
      e.vx *= 0.7;
      e.vz *= 0.7;
      if (e.reloadTimer <= 0) {
        e.isReloading = false;
        e.ammoInMag = e.magazineSize;
        e.state = 'engaging';
      }
      return;
    }

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

    // ─── Ammo management: reload if magazine empty ───
    if (e.ammoInMag <= 0 && e.ammo > 0) {
      e.isReloading = true;
      e.reloadTimer = 2.0;
      e.state = 'reloading';
      // Reload: swap a magazine
      const toLoad = Math.min(e.magazineSize, e.ammo);
      e.ammoInMag = toLoad;
      e.ammo -= toLoad;
      return;
    }

    // ─── Emergency resupply: return to ammo building when low ───
    // Low = less than 3 magazines (30 shots total, or 0 in current mag and <20 in reserve)
    const totalBullets = e.ammo + e.ammoInMag;
    if (totalBullets < 30 && e.state !== 'resupplying') {
      const ammoB = this.findNearestAmmoBuilding(e.x, e.z);
      if (ammoB && ammoB.ammo > 0) {
        e.state = 'resupplying';
        e.buildingId = ammoB.id;
      }
    }

    if (e.state === 'resupplying') {
      const targetB = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
      if (!targetB || targetB.ammo <= 0) {
        // Try another ammo building
        const ammoB = this.findNearestAmmoBuilding(e.x, e.z);
        if (ammoB && ammoB.ammo > 0) {
          e.buildingId = ammoB.id;
        } else {
          e.state = 'patrolling';
          e.buildingId = null;
          return;
        }
      }
      const tb = this.state.buildings.find(b => b.id === e.buildingId)!;
      if (dist(e, tb) < 1.5) {
        const gotAmmo = Math.min(tb.ammo, 60);
        if (gotAmmo > 0) {
          tb.ammo -= gotAmmo;
          e.ammo = Math.min(e.maxAmmo, e.ammo + gotAmmo);
          // Also reload magazine
          if (e.ammoInMag < e.magazineSize && e.ammo > 0) {
            const fillMag = Math.min(e.magazineSize - e.ammoInMag, e.ammo);
            e.ammoInMag += fillMag;
            e.ammo -= fillMag;
          }
          this.logEvent(`🔫 Military #${e.id} resupplied at ${tb.type}.`, 'military');
        }
        // Grab food too
        const gotFood = Math.min(tb.food, 10);
        if (gotFood > 0) { tb.food -= gotFood; e.hunger = Math.min(100, e.hunger + gotFood); }
        e.state = 'patrolling';
        e.buildingId = null;
      } else {
        const dx = tb.x - e.x;
        const dz = tb.z - e.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * 0.45 * dt;
        e.vz += (dz / len) * e.speed * 0.45 * dt;
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

    // ─── SQUAD BEHAVIOR ───
    if (e.squadId !== null) {
      // Stay within 5 units of squad members
      const squadMates = this.state.entities.filter(o =>
        o.id !== e.id && o.squadId === e.squadId && o.state !== 'dead'
      );
      if (squadMates.length > 0) {
        // Check if too far from squad
        const avgX = squadMates.reduce((sum, m) => sum + m.x, 0) / squadMates.length;
        const avgZ = squadMates.reduce((sum, m) => sum + m.z, 0) / squadMates.length;
        const distToSquad = dist(e, { x: avgX, z: avgZ });

        if (distToSquad > 5) {
          // Move back toward squad
          const dx = avgX - e.x;
          const dz = avgZ - e.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          e.vx += (dx / len) * e.speed * 0.4 * dt;
          e.vz += (dz / len) * e.speed * 0.4 * dt;
        }

        // If squad leader and not in combat, move slowly
        if (e.isSquadLeader && e.state === 'patrolling') {
          e.wanderAngle = 0;
          e.speed = 2.5;
        }

        // Squad members follow leader
        if (!e.isSquadLeader && e.state === 'patrolling') {
          const leader = squadMates.find(m => m.isSquadLeader) || squadMates[0];
          if (leader && dist(e, leader) > 3) {
            const dx = leader.x - e.x;
            const dz = leader.z - e.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            e.vx += (dx / len) * e.speed * 0.35 * dt;
            e.vz += (dz / len) * e.speed * 0.35 * dt;
          }
        }
      }
    }

    // ─── COMBAT ───
    // Check for nearby civilians in danger — prioritize protecting them
    const nearCivInDanger = this.findNearest(e, 12, 'civilian');
    const nearZombie = this.findNearest(e, 18, 'zombie');

    // If a civilian is very close and a zombie is nearby, protect them
    if (nearCivInDanger && nearZombie && dist(nearCivInDanger, nearZombie) < 5) {
      const dx = nearZombie.x - e.x;
      const dz = nearZombie.z - e.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      e.vx += (dx / len) * e.speed * 0.5 * dt;
      e.vz += (dz / len) * e.speed * 0.5 * dt;
      e.state = 'engaging';
      return;
    }

    if (nearZombie && dist(e, nearZombie) < 15) {
      e.state = 'engaging';
      const d = dist(e, nearZombie);

      // Check line of sight — if a building blocks the shot, move to clear it
      if (!this.hasClearShot(e, nearZombie)) {
        // Move to get a clear shot
        const perpX = -(nearZombie.z - e.z) / d;
        const perpZ = (nearZombie.x - e.x) / d;
        e.vx += perpX * e.speed * 0.4 * dt;
        e.vz += perpZ * e.speed * 0.4 * dt;
        return;
      }

      // Shoot at range
      if (d < 12 && e.attackCooldown <= 0 && e.ammoInMag > 0) {
        e.attackCooldown = 1.0; // Faster fire rate
        e.ammoInMag -= 1;
        nearZombie.hp -= 15; // More damage
        if (nearZombie.hp <= 0) {
          nearZombie.state = 'dead';
          e.kills++;
          this.logEventThrottled(`Military #${e.id} killed zombie #${nearZombie.id}.`, 'military', 0.3);
        }

        // Create shot effect
        this.state.events.push({
          time: this.state.totalTime,
          day: this.state.day,
          text: `SHOT:${e.x},${e.z},${nearZombie.x},${nearZombie.z}`,
          type: 'military',
        });
      }

      // Maintain distance
      if (d < 3) {
        const dx = e.x - nearZombie.x;
        const dz = e.z - nearZombie.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * dt * 0.5;
        e.vz += (dz / len) * e.speed * dt * 0.5;
      } else if (d > 10) {
        // Close in
        const dx = nearZombie.x - e.x;
        const dz = nearZombie.z - e.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * dt * 0.35;
        e.vz += (dz / len) * e.speed * dt * 0.35;
      }

      // Squad engagement: if one squad member is engaging, others join
      if (e.squadId !== null) {
        const squadMates = this.state.entities.filter(o =>
          o.id !== e.id && o.squadId === e.squadId && o.state !== 'dead'
        );
        for (const mate of squadMates) {
          if (mate.state === 'patrolling' || mate.state === 'wandering') {
            mate.state = 'engaging';
          }
        }
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

  // ─── LINE OF SIGHT CHECK ───
  private hasClearShot(shooter: Entity, target: Entity): boolean {
    // Check if any building intersects the line from shooter to target
    const dx = target.x - shooter.x;
    const dz = target.z - shooter.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.1) return true;

    const nx = dx / d;
    const nz = dz / d;

    // Sample points along the ray
    const steps = Math.ceil(d / 0.5);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = shooter.x + nx * d * t;
      const pz = shooter.z + nz * d * t;

      for (const b of this.state.buildings) {
        // Skip the building the entity might be standing near
        if (dist(shooter, b) < 1.5 && b.h < 3) continue;
        if (dist(target, b) < 1.5 && b.h < 3) continue;

        const hw = b.w / 2 + 0.2;
        const hd = b.d / 2 + 0.2;
        if (Math.abs(b.x - px) < hw && Math.abs(b.z - pz) < hd) {
          return false; // Building blocks the shot
        }
      }
    }
    return true;
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
