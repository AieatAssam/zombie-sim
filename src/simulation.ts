// Simulation Engine — v4: no resist, no HP, delayed military, smarter AI

import type { Building, WorldMap } from './world';
import { findNearestBuilding, isInsideBuilding, generateWorld } from './world';

export type EntityType = 'civilian' | 'zombie' | 'military';
export type EntityState =
  | 'idle' | 'wandering' | 'fleeing' | 'foraging' | 'sleeping' | 'dead'
  | 'hunting' | 'attacking' | 'patrolling' | 'engaging' | 'resupplying' | 'hiding'
  | 'reloading' | 'starving' | 'feeding' | 'aiming'
  | 'seeking_shelter';

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
  attackCooldown: number;
  aimTimer: number;
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
  isAiming: boolean;
  alertTimer: number;
  alertX: number;
  alertZ: number;
  turnTimer: number;
  sprintTimer: number;
  sprintCooldown: number;
  maxSprintTime: number;
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
  zombiesKilledByMilitary: number;
  civiliansTurned: number;
  civiliansStarved: number;
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

  private outbreakPhase = 0;
  private lastPhaseCheck = 0;
  private deploymentTimer = 0;
  private radioTimer = 10;
  private nextSquadId = 1;
  private hordeCenters: { x: number; z: number; count: number }[] = [];

  constructor() {
    this.map = generateWorld(Date.now());
    this.state = this.createInitialState(this.map);

    const scenarios = [
      { name: '☄️ Meteor Crash', text: 'A meteorite crashed in the city center, releasing a strange virus. The dead are rising.', type: 'warning' as SimEvent['type'] },
      { name: '🧪 Lab Leak', text: 'A pharmaceutical lab experienced a containment breach. An unknown pathogen is spreading.', type: 'warning' as SimEvent['type'] },
      { name: '🚢 Infected Cargo', text: 'A cargo ship docked carrying infected rats. The outbreak has begun in the port district.', type: 'warning' as SimEvent['type'] },
      { name: '🧬 Ancient Spores', text: 'Construction workers unearthed ancient fungal spores from permafrost. They reanimate dead tissue.', type: 'warning' as SimEvent['type'] },
      { name: '📡 Signal from Space', text: 'A strange signal from deep space corrupted the city\'s network. People exposed to screens turned violent.', type: 'warning' as SimEvent['type'] },
    ];

    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    this.logEvent(scenario.text, scenario.type);
    this.logEvent('🏙️ Population: 400. Military expected when outbreak escalates.', 'info');
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

    // Start with 2 initial zombies
    const initialZombies = 2;
    for (let zi = 0; zi < initialZombies; zi++) {
      const angle = Math.random() * Math.PI * 2;
      let zx = Math.cos(angle) * 8;
      let zz = Math.sin(angle) * 8;
      if (isInsideBuilding(map.buildings, zx, zz)) { zx -= 3; zz -= 3; }
      entities.push(this.createZombie(zx, zz));
    }

    return {
      entities,
      buildings: map.buildings,
      timeOfDay: 0.08,
      day: 1,
      totalTime: 0,
      stats: { civilians: civilianCount, zombies: initialZombies, military: 0, zombiesKilledByMilitary: 0, civiliansTurned: 0, civiliansStarved: 0, dead: 0, totalBorn: 0, totalInfected: 0, totalKilled: 0, foodSupply: 100 },
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
      state: 'wandering', hp: 1, maxHp: 1,
      hunger: 60 + Math.random() * 40, fatigue: 0,
      ammo: 0, maxAmmo: 0, magazineSize: 0, ammoInMag: 0, isReloading: false, reloadTimer: 0,
      attackCooldown: 0,
      targetId: null, wanderAngle: Math.random() * Math.PI * 2,
      aimTimer: 0,
      wanderTimer: Math.random() * 5, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 3.2 + Math.random() * 0.8,
      color: '#4499ff', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: null, isSquadLeader: false, kills: 0, hideTimer: 0, biteAttempts: 0,
      zombieAge: 0, feedingTimer: 0, isAiming: false, alertTimer: 0, alertX: 0, alertZ: 0,
      turnTimer: 0,
      sprintTimer: 0,
      sprintCooldown: 0,
      maxSprintTime: 1.5 + Math.random() * 1.5,
    };
  }

  private createZombie(x: number, z: number): Entity {
    return {
      id: this.nextId++,
      type: 'zombie', x, z, vx: 0, vz: 0,
      state: 'hunting', hp: 1, maxHp: 1,
      hunger: 100, fatigue: 100, ammo: 0, maxAmmo: 0, magazineSize: 0, ammoInMag: 0, isReloading: false, reloadTimer: 0,
      attackCooldown: 0, targetId: null,
      wanderAngle: Math.random() * Math.PI * 2, aimTimer: 0,
      wanderTimer: Math.random() * 3, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 3.8 + Math.random() * 1.0,
      color: '#33ff33', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: null, isSquadLeader: false, kills: 0, hideTimer: 0, biteAttempts: 0,
      zombieAge: 0, feedingTimer: 0, isAiming: false, alertTimer: 0, alertX: 0, alertZ: 0,
      turnTimer: 0,
      sprintTimer: 0,
      sprintCooldown: 0,
      maxSprintTime: 0,
    };
  }

  private createMilitary(x: number, z: number, squadId?: number): Entity {
    return {
      id: this.nextId++,
      type: 'military', x, z, vx: 0, vz: 0,
      state: 'patrolling', hp: 1, maxHp: 1,
      hunger: 70 + Math.random() * 30, fatigue: 10,
      ammo: 9999, maxAmmo: 9999, magazineSize: 100, ammoInMag: 100, isReloading: false, reloadTimer: 0,
      attackCooldown: 0,
      targetId: null, wanderAngle: Math.random() * Math.PI * 2, aimTimer: 0,
      wanderTimer: 1, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 3.8 + Math.random() * 0.5,
      color: '#ff3333', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: squadId || null, isSquadLeader: false, kills: 0, hideTimer: 0, biteAttempts: 0,
      zombieAge: 0, feedingTimer: 0, isAiming: false, alertTimer: 0, alertX: 0, alertZ: 0,
      turnTimer: 0,
      sprintTimer: 0,
      sprintCooldown: 0,
      maxSprintTime: 0,
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
    s.day = Math.floor(s.totalTime / DAY_LENGTH) + 1;
    s.timeOfDay = (s.totalTime % DAY_LENGTH) / DAY_LENGTH;

    const isNight = s.timeOfDay > 0.65 || s.timeOfDay < 0.08;

    this.updatePhase();
    if (this.deploymentTimer > 0) this.deploymentTimer -= dt;
    this.deployMilitary();
    this.computeHordeCenters();

    // Process turn timers first (convert pending civilians to zombies)
    for (const e of s.entities) {
      if (e.type === 'civilian' && e.turnTimer > 0 && e.state !== 'dead') {
        e.turnTimer -= dt;
        if (e.turnTimer <= 0) {
          // Turn into zombie!
          e.type = 'zombie';
          e.speed = 3.5 + Math.random() * 0.8;
          e.color = '#33ff33';
          e.state = 'hunting';
          e.isAsleep = false;
          e.attackCooldown = 6.0;
          e.zombieAge = 0;
          e.buildingId = null;
          e.turnTimer = 0;
          this.state.stats.totalInfected++;
          this.state.stats.civiliansTurned++;
          this.logEventThrottled(`Civilian #${e.id} has turned into a zombie!`, 'zombie', 2);
        } else {
          // Still turning — civilian keeps fleeing in panic
          if (e.state !== 'fleeing') {
            e.state = 'fleeing';
            e.isPanicking = true;
            e.panicTimer = 6;
          }
        }
      }
    }

    for (const e of s.entities) {
      if (e.state === 'dead') continue;
      this.updateEntity(e, dt, isNight);
      if (e.type === 'zombie') this.pushOutOfBuilding(e);
    }

    s.entities = s.entities.filter(e => e.state !== 'dead');

    let civ = 0, zomb = 0, mil = 0;
    for (const e of s.entities) {
      if (e.state === 'dead') continue;
      e.type === 'civilian' ? civ++ : e.type === 'zombie' ? zomb++ : mil++;
    }

    s.stats.civilians = civ;
    s.stats.zombies = zomb;
    s.stats.military = mil;
    s.stats.dead = s.stats.zombiesKilledByMilitary + s.stats.civiliansTurned + s.stats.civiliansStarved;

    let totalFood = 0;
    for (const b of s.buildings) totalFood += b.food;
    const humanPop = civ + mil;
    s.stats.foodSupply = humanPop > 0
      ? Math.min(100, Math.max(0, Math.round((totalFood / Math.max(1, humanPop * 2)) * 100)))
      : 0;

    let totalAmmo = 0;
    let starvingCount = 0;
    for (const e of s.entities) {
      totalAmmo += e.ammo;
      if (e.type === 'military') totalAmmo += e.ammoInMag;
      if (e.state === 'starving') starvingCount++;
    }
    s.totalAmmoRemaining = totalAmmo;
    s.starvingCount = starvingCount;

    if (zomb <= 10) {
      s.chaosLevel = 0;
    } else {
      s.chaosLevel = Math.min(100, Math.round(
        (zomb / Math.max(1, civ + mil)) * 60 +
        (s.stats.dead > 50 ? 20 : s.stats.dead > 20 ? 10 : 0) +
        (zomb > 100 ? 20 : zomb > 50 ? 10 : 0)
      ));
    }

    this.historyTimer += dt;
    if (this.historyTimer > 1.5) {
      this.historyTimer = 0;
      this.history.push({ day: s.day, civilians: civ, zombies: zomb, military: mil });
      if (this.history.length > 500) this.history.shift();
    }

    this.radioTimer -= dt;
    if (this.radioTimer <= 0 && zomb > 5) {
      this.radioTimer = 8 + Math.random() * 10;
      this.broadcastRadioMessage(zomb, civ, mil);
    }

    if (civ <= 0 && zomb > 0) {
      s.gameOver = true;
      s.gameOverReason = '💀 ALL CIVILIANS LOST. ZOMBIES WIN.';
      this.logEvent('☠️ GAME OVER — All civilians dead or turned. Zombies win.', 'death');
    } else if (civ <= 0 && zomb <= 0) {
      s.gameOver = true;
      s.gameOverReason = '💀 NO CIVILIANS SURVIVED.';
      this.logEvent('☠️ GAME OVER — No civilians remain.', 'death');
    } else if (zomb <= 0 && civ > 0 && s.day > 5) {
      s.gameOver = true;
      s.gameOverReason = '🎉 CITY SAVED! ZOMBIES ELIMINATED.';
      this.logEvent('✅ GAME OVER — Zombies eliminated! Civilians survive.', 'info');
    }
  }

  private broadcastRadioMessage(zomb: number, civ: number, mil: number): void {
    const ratio = civ > 0 ? zomb / (civ + 1) : 99;
    const messages = [
      '📻 "[HQ] Situation report requested. Stay calm and seek shelter."',
      '📻 "[HQ] Evacuation routes are being established. Await further orders."',
      '📻 "[HQ] Civilians advised to stay indoors. Military units inbound."',
      '📻 "[HQ] Reports of infected spreading through the city center."',
      '📻 "[HQ] All units: contain the outbreak at all costs."',
      '📻 "[HQ] Rescue convoys delayed. Hold your positions."',
    ];
    if (ratio > 2 && zomb > 30) {
      const panicMessages = [
        '📻 "⚠️ [HQ] OUTBREAK CRITICAL! Code Red! All personnel to defensive positions!"',
        '📻 "🚨 [HQ] Civilian casualties mounting! Requesting immediate air support!"',
        '📻 "☢️ [HQ] Contamination zone expanding! Evacuate all sectors!"',
        '📻 "💀 [HQ] We are losing control! This is not a drill!"',
      ];
      this.logEvent(panicMessages[Math.floor(Math.random() * panicMessages.length)], 'warning');
    } else if (ratio < 0.3 && mil > 0) {
      this.logEvent(['📻 "[HQ] Infection rate slowing. Good work, soldiers."','📻 "[HQ] Civilians report reduced zombie activity. Maintain vigilance."'][Math.floor(Math.random()*2)], 'info');
    } else {
      this.logEvent(messages[Math.floor(Math.random() * messages.length)], 'info');
    }
  }

  private computeHordeCenters(): void {
    const zombies = this.state.entities.filter(e => e.type === 'zombie' && e.state !== 'dead');
    this.hordeCenters = [];
    const clustered = new Set<number>();
    for (const z of zombies) {
      if (clustered.has(z.id)) continue;
      const nearby = zombies.filter(o => o.id !== z.id && !clustered.has(o.id) && dist(z, o) < 5);
      if (nearby.length >= 2) {
        let cx = z.x, cz = z.z, count = 1 + nearby.length;
        for (const n of nearby) { cx += n.x; cz += n.z; clustered.add(n.id); }
        clustered.add(z.id);
        this.hordeCenters.push({ x: cx / count, z: cz / count, count });
      }
    }
  }

  private pushOutOfBuilding(e: Entity): void {
    for (const b of this.state.buildings) {
      const hw = b.w / 2 + 0.2, hd = b.d / 2 + 0.2;
      const dx = e.x - b.x, dz = e.z - b.z;
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
        if (e.type === 'zombie') {
          const ox = hw - Math.abs(dx), oz = hd - Math.abs(dz);
          if (ox < oz) {
            if (dx > 0) { e.x = b.x + hw; e.vx = Math.max(e.vx, 0.1); }
            else { e.x = b.x - hw; e.vx = Math.min(e.vx, -0.1); }
          } else {
            if (dz > 0) { e.z = b.z + hd; e.vz = Math.max(e.vz, 0.1); }
            else { e.z = b.z - hd; e.vz = Math.min(e.vz, -0.1); }
          }
        } else {
          e.buildingId = b.id;
        }
      } else if (e.type === 'zombie') {
        const m = 0.5;
        const nearX = Math.abs(dx) < hw + m && Math.abs(dx) > hw - m;
        const nearZ = Math.abs(dz) < hd + m && Math.abs(dz) > hd - m;
        if (nearX && Math.abs(dz) < hd && Math.abs(e.vz) < 0.1 && Math.abs(e.vx) > 0.1) {
          e.vz += (dz > 0 ? 0.3 : -0.3) * 0.3;
        } else if (nearZ && Math.abs(dx) < hw && Math.abs(e.vx) < 0.1 && Math.abs(e.vz) > 0.1) {
          e.vx += (dx > 0 ? 0.3 : -0.3) * 0.3;
        }
      }
    }
  }

  private updatePhase(): void {
    const s = this.state;
    const ratio = s.stats.civilians > 0 ? s.stats.zombies / (s.stats.civilians + s.stats.zombies) : 1;
    const newPhase = ratio < 0.1 ? 0 : ratio < 0.4 ? 1 : ratio < 0.7 ? 2 : ratio < 0.9 ? 3 : 4;
    if (newPhase !== this.outbreakPhase && s.day > this.lastPhaseCheck) {
      this.outbreakPhase = newPhase;
      this.lastPhaseCheck = s.day;
      const msgs = [
        '📡 PHASE 1: Containment — outbreak localized.',
        '⚠️ PHASE 2: Spread — infection crossing containment zones.',
        '🚨 PHASE 3: Explosion — rapid transmission! City in chaos!',
        '🆘 PHASE 4: Collapse — civilization breaking down!',
        '☠️ PHASE 5: Extinction-level event imminent.',
      ];
      if (newPhase >= 0 && newPhase < msgs.length) this.logEvent(msgs[newPhase], 'warning');
    }
  }

  private deployMilitary(): void {
    const s = this.state;
    const infections = s.stats.civiliansTurned;
    const currentMil = s.stats.military;
    const zomb = s.stats.zombies;

    const MIN_INFECTIONS = 2;
    let targetSoldiers = 0;

    if (infections >= MIN_INFECTIONS && s.totalTime > 8) {
      if (infections >= 3) targetSoldiers = 4;
      if (infections >= 10) targetSoldiers = 6;
      if (infections >= 20) targetSoldiers = 10;
      if (infections >= 35) targetSoldiers = 16;
      if (infections >= 60) targetSoldiers = 24;
      if (infections >= 100) targetSoldiers = 35;
      if (infections >= 160) targetSoldiers = 50;
    }

    targetSoldiers = Math.min(targetSoldiers, Math.floor(zomb * 0.4 + 3));

    if (currentMil < targetSoldiers && this.deploymentTimer <= 0) {
      const toDeploy = Math.min(2, targetSoldiers - currentMil);
      for (let i = 0; i < toDeploy; i++) {
        const angle = Math.random() * Math.PI * 2;
        const x = Math.cos(angle) * (MAP_HALF - 3);
        const z = Math.sin(angle) * (MAP_HALF - 3);
        s.entities.push(this.createMilitary(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3));
        s.stats.military++;
      }
      this.deploymentTimer = 2 + Math.random() * 2;
      this.logEvent(`🚁 ${toDeploy} soldier${toDeploy > 1 ? 's' : ''} deployed. (${currentMil + toDeploy} total)`, 'military');
    }
  }

  private updateEntity(e: Entity, dt: number, isNight: boolean): void {
    switch (e.type) {
      case 'civilian': this.updateCivilian(e, dt, isNight); break;
      case 'zombie': this.updateZombie(e, dt, isNight); break;
      case 'military': this.updateMilitary(e, dt, isNight); break;
    }

    if (!e.isAsleep && e.type !== 'zombie') {
      e.x += e.vx * dt;
      e.z += e.vz * dt;
    } else if (!e.isAsleep) {
      e.x += e.vx * dt;
      e.z += e.vz * dt;
    }

    const hw = this.state.map.width / 2 - 0.5, hd = this.state.map.depth / 2 - 0.5;
    e.x = Math.max(-hw, Math.min(hw, e.x));
    e.z = Math.max(-hd, Math.min(hd, e.z));

    if (!e.isAsleep) { e.vx *= 0.92; e.vz *= 0.92; } else { e.vx *= 0.7; e.vz *= 0.7; }

    let maxSpeed = e.isAsleep ? 0.1 : e.speed * (e.type === 'zombie' ? 1.3 : 1.2);
    if (e.type === 'civilian' && e.sprintTimer > 0) maxSpeed = e.speed * 3.0;
    const spd = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
    if (spd > maxSpeed) { e.vx = (e.vx / spd) * maxSpeed; e.vz = (e.vz / spd) * maxSpeed; }
  }

  // ─── CIVILIAN AI ───
  private updateCivilian(e: Entity, dt: number, isNight: boolean): void {
    // Hunger drains faster when hiding (fear/stress metabolism)
    const fearHunger = e.state === 'hiding' ? 0.08 : 0;
    e.hunger -= (0.5 + fearHunger) * dt;
    e.fatigue += 0.15 * dt;

    if (e.hunger < 25 && e.state !== 'starving' && e.state !== 'dead') e.state = 'starving';
    if (e.hunger <= -10) {
      e.state = 'dead';
      this.state.stats.civiliansStarved++;
      this.state.events.push({ time: this.state.totalTime, day: this.state.day, text: `CORPSE:${e.x},${e.z}`, type: 'death' });
      return;
    }

    // Night shelter
    if (isNight && e.fatigue > 60 && e.state !== 'starving' && e.state !== 'fleeing' && e.state !== 'hiding') {
      if (e.state !== 'seeking_shelter' && !e.isAsleep) {
        const tb = findNearestBuilding(this.state.buildings, e.x, e.z);
        if (tb) { e.state = 'seeking_shelter'; e.buildingId = tb.id; e.wanderTimer = 10; }
        else { e.isAsleep = true; e.state = 'sleeping'; e.vx = 0; e.vz = 0; return; }
      }
      if (e.state === 'seeking_shelter') {
        const tb = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
        e.wanderTimer -= dt;
        if (e.wanderTimer <= 0) { e.isAsleep = true; e.state = 'sleeping'; e.vx = 0; e.vz = 0; return; }
        if (tb) {
          if (dist(e, tb) < 1) { e.buildingId = tb.id; e.isAsleep = true; e.state = 'sleeping'; e.vx = 0; e.vz = 0; return; }
          else { const d = dist(e, tb) || 1; e.vx += ((tb.x - e.x) / d) * e.speed * dt * 0.4; e.vz += ((tb.z - e.z) / d) * e.speed * dt * 0.4; return; }
        } else { e.isAsleep = true; e.state = 'sleeping'; e.vx = 0; e.vz = 0; return; }
      }
    }
    if (e.isAsleep) {
      e.fatigue -= 3.0 * dt; e.hunger -= 0.1 * dt;
      if (e.fatigue <= 0) { e.fatigue = 0; e.isAsleep = false; e.state = 'wandering'; e.buildingId = null; }
      return;
    }

    // Daytime seeking_shelter
    if (e.state === 'seeking_shelter') {
      const tb = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
      if (tb) {
        if (dist(e, tb) < 1) { e.buildingId = tb.id; e.state = 'hiding'; e.hideTimer = 4 + Math.random() * 6; e.vx = 0; e.vz = 0; return; }
        else { const d = dist(e, tb) || 1; e.vx += ((tb.x - e.x) / d) * e.speed * dt * 0.4; e.vz += ((tb.z - e.z) / d) * e.speed * dt * 0.4; return; }
      } else { e.state = 'wandering'; e.buildingId = null; }
    }

    // Zombie detection
    const detectRange = isNight ? 18 : 14;
    const nearestZ = this.findNearest(e, detectRange, 'zombie');
    const zDist = nearestZ ? dist(e, nearestZ) : 999;

    if (zDist < 8) {
      e.state = 'fleeing'; e.isPanicking = true; e.panicTimer = 4 + Math.random() * 2; e.buildingId = null;
    }
    if (zDist < 5 && e.state !== 'hiding') {
      const building = isInsideBuilding(this.state.buildings, e.x, e.z, 0.5);
      if (!building) {
        const tb = findNearestBuilding(this.state.buildings, e.x, e.z);
        if (tb && dist(e, tb) < 4) { e.state = 'fleeing'; e.isPanicking = true; e.panicTimer = 5; }
      } else {
        e.state = 'hiding'; e.hideTimer = 3 + Math.random() * 4; e.vx = 0; e.vz = 0;
      }
    }
    if (nearestZ && zDist < 18 && e.hunger >= 25 && e.state !== 'hiding' && e.state !== 'fleeing') {
      let zN = 0, aN = 0;
      for (const o of this.state.entities) {
        if (o.id === e.id || o.state === 'dead') continue;
        if (dist(e, o) > 18) continue;
        o.type === 'zombie' ? zN++ : (o.type === 'civilian' || o.type === 'military') ? aN++ : 0;
      }
      if (zN > aN) { const tb = findNearestBuilding(this.state.buildings, e.x, e.z); if (tb) { e.state = 'seeking_shelter'; e.buildingId = tb.id; } }
    }

    if (e.sprintCooldown > 0) e.sprintCooldown -= dt;
    if (nearestZ && zDist < 14 && e.sprintCooldown <= 0 && e.sprintTimer <= 0)
      e.sprintTimer = e.maxSprintTime * (1 - (e.hunger < 25 ? 0.5 : 0));
    if (e.sprintTimer > 0) {
      e.sprintTimer -= dt;
      if (e.sprintTimer <= 0) { e.sprintTimer = 0; e.sprintCooldown = e.hunger < 25 ? 6 + Math.random() * 3 : 3 + Math.random() * 2; }
    }

    switch (e.state) {
      case 'hiding': {
        e.vx = 0; e.vz = 0; e.hideTimer -= dt;
        const forced = e.hunger < 25;
        const zc = this.findNearest(e, 14, 'zombie');
        if (e.hideTimer <= 0 || forced || !zc || dist(e, zc) > 14) {
          e.state = 'wandering';
          if (zc) { const d = dist(e, zc) || 1; e.wanderAngle = Math.atan2(e.z - zc.z, e.x - zc.x) + (Math.random() - 0.5) * 1.0; }
          else e.wanderAngle = Math.random() * Math.PI * 2;
          e.wanderTimer = 1.5;
        }
        break;
      }
      case 'fleeing': {
        const z = this.findNearest(e, 25, 'zombie');
        if (z) {
          const d = dist(e, z);
          if (d < 1.3) {
            // Already turning — desperation shove to create distance!
            if (e.turnTimer > 0) { 
              z.vx += (e.x - z.x) * 0.5; z.vz += (e.z - z.z) * 0.5; // shove zombie back
              e.state = 'fleeing'; e.isPanicking = true; e.panicTimer = 3; 
              const len2 = dist(e, z) || 1; e.vx += ((e.x - z.x) / len2) * e.speed * 3.0 * dt; e.vz += ((e.z - z.z) / len2) * e.speed * 3.0 * dt; 
              break; 
            }
            // Last-stand shove for unbitten cornered civilians!
            if (e.sprintTimer <= 0 && e.sprintCooldown <= 0) {
              // Push the zombie back and make a break for it
              z.vx += (e.x - z.x) * 0.3; z.vz += (e.z - z.z) * 0.3;
              e.sprintTimer = 0.5; // quick burst
              const len2 = dist(e, z) || 1; e.vx += ((e.x - z.x) / len2) * e.speed * 3.0 * dt; e.vz += ((e.z - z.z) / len2) * e.speed * 3.0 * dt;
              this.logEventThrottled(`Civilian #${e.id} shoved a zombie back!`, 'zombie', 5);
              break;
            }
            // Bitten! Start turn timer instead of instant conversion
            e.turnTimer = 2 + Math.random() * 2;
            e.state = 'fleeing';
            e.isPanicking = true;
            e.panicTimer = e.turnTimer + 1;
            this.logEventThrottled(`Civilian #${e.id} was bitten and is turning!`, 'zombie', 2);
            // Alert nearby zombies
            this.alertNearbyZombies(z, e, 12);
            return;
          } else {
            const len = dist(e, z) || 1;
            let fleeAngle = Math.atan2(e.z - z.z, e.x - z.x);
            const ally = this.findNearest(e, 15, 'civilian');
            if (ally && dist(e, ally) > 3) fleeAngle = fleeAngle * 0.7 + Math.atan2(ally.z - e.z, ally.x - e.x) * 0.3;
            const jitter = (Math.random() - 0.5) * 1.2;
            const mul = e.sprintTimer > 0 ? 2.5 : 1.8;
            const spd = e.speed * mul;
            e.vx += Math.cos(fleeAngle + jitter) * spd * dt * 0.5;
            e.vz += Math.sin(fleeAngle + jitter) * spd * dt * 0.5;
          }
        }
        e.panicTimer -= dt;
        if (e.panicTimer <= 0 && (!nearestZ || dist(e, nearestZ) > 18)) { e.isPanicking = false; e.state = 'wandering'; }
        break;
      }
      case 'starving': {
        e.wanderTimer -= dt;
        const fb = this.findNearestFoodBuilding(e.x, e.z);
        if (fb && dist(e, fb) < 1.5) {
          fb.food -= 5; e.hunger = 80; e.state = 'wandering';
          this.logEventThrottled(`Civilian #${e.id} found food.`, 'info', 5);
          e.buildingId = null; e.wanderAngle = Math.random() * Math.PI * 2; e.forageTimer = 8 + Math.random() * 4; e.vx *= 0.8; e.vz *= 0.8;
        } else if (fb) {
          const zn = this.findNearest(e, 8, 'zombie');
          if (zn && dist(e, zn) < 4) { const d = dist(e, zn) || 1; e.vx += ((e.x - zn.x) / d) * e.speed * 2.0 * dt; e.vz += ((e.z - zn.z) / d) * e.speed * 2.0 * dt; }
          else { const d = dist(e, fb) || 1; e.vx += ((fb.x - e.x) / d) * e.speed * 0.5 * dt; e.vz += ((fb.z - e.z) / d) * e.speed * 0.5 * dt; }
        } else {
          if (e.wanderTimer <= 0) { e.wanderAngle = Math.random() * Math.PI * 2; e.wanderTimer = 1 + Math.random() * 2; }
          e.vx += Math.cos(e.wanderAngle) * e.speed * 0.5 * dt * 0.5;
          e.vz += Math.sin(e.wanderAngle) * e.speed * 0.5 * dt * 0.5;
        }
        break;
      }
      case 'foraging': {
        e.forageTimer -= dt; e.vx *= 0.9; e.vz *= 0.9;
        const zn = this.findNearest(e, 8, 'zombie');
        if (zn && dist(e, zn) < 5) { e.state = 'fleeing'; e.isPanicking = true; e.panicTimer = 4 + Math.random() * 2; break; }
        if (e.forageTimer <= 0) {
          if (e.buildingId !== null) { const b = this.state.buildings.find(b => b.id === e.buildingId); if (b && b.food > 0) { const f = Math.min(b.food, 8 + Math.floor(Math.random() * 10)); b.food -= f; e.hunger = Math.min(100, e.hunger + f); } }
          e.state = 'wandering'; e.buildingId = null; e.wanderAngle = Math.random() * Math.PI * 2; e.forageTimer = 5 + Math.random() * 3;
        }
        break;
      }
      case 'wandering':
      default: {
        e.wanderTimer -= dt;
        if (e.hunger < 45) {
          const fb = this.findNearestFoodBuilding(e.x, e.z);
          if (fb && fb.food > 0) {
            const nearZomb = this.findNearest(e, 12, 'zombie');
            if (!nearZomb || dist(e, nearZomb) > 5) {
              const d = dist(e, fb); e.wanderAngle = Math.atan2(fb.z - e.z, fb.x - e.x); e.wanderTimer = Math.max(2, d / (e.speed * 0.8)); e.state = 'foraging'; e.buildingId = fb.id; e.forageTimer = e.wanderTimer + 2;
            } else { const d = dist(e, nearZomb) || 1; e.wanderAngle = Math.atan2(e.z - nearZomb.z, e.x - nearZomb.x) + (Math.random() - 0.5) * 0.5; e.wanderTimer = 1 + Math.random() * 2; }
          }
        }
        if (e.wanderTimer <= 0) { e.wanderAngle = Math.random() * Math.PI * 2; e.wanderTimer = 2 + Math.random() * 5; }
        const spd = e.speed * (e.hunger < 20 ? 0.7 : 1.0);
        e.vx += Math.cos(e.wanderAngle) * spd * dt * 0.25;
        e.vz += Math.sin(e.wanderAngle) * spd * dt * 0.25;
        break;
      }
    }
  }

  private findNearestFoodBuilding(x: number, z: number): Building | null {
    let best: Building | null = null, bestDist = Infinity;
    for (const b of this.state.buildings) {
      if (b.food <= 0) continue;
      const d = Math.sqrt((b.x - x) ** 2 + (b.z - z) ** 2);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  private findNearestAmmoBuilding(x: number, z: number): Building | null {
    let best: Building | null = null, bestDist = Infinity;
    for (const b of this.state.buildings) {
      if (b.ammo <= 0) continue;
      if (b.type !== 'warehouse' && b.type !== 'police') continue;
      const d = Math.sqrt((b.x - x) ** 2 + (b.z - z) ** 2);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  // ─── ZOMBIE AI ───
  private updateZombie(e: Entity, dt: number, isNight: boolean): void {
    e.attackCooldown -= dt;
    e.zombieAge += dt;
    if (e.alertTimer > 0) e.alertTimer -= dt;

    if (e.state === 'feeding') {
      e.feedingTimer -= dt; e.vx *= 0.85; e.vz *= 0.85;
      if (e.feedingTimer <= 0) e.state = 'hunting';
      return;
    }

    const nightMul = isNight ? 1.6 : 1.0;
    const VISUAL = 14, AUDIO = 22;

    // Throttled target search: full scan every 4 ticks, reuse cache otherwise
    let best: Entity | null = null;
    let bestD = e.alertTimer > 0 ? AUDIO : VISUAL;
    
    // Try cached target first (valid for 4 ticks)
    if (e.targetId !== null && (Math.floor(e.zombieAge) % 4 !== 0 || e.alertTimer > 0)) {
      const cached = this.state.entities.find(o => o.id === e.targetId);
      if (cached && cached.state !== 'dead' && cached.type !== 'zombie' && dist(e, cached) < bestD) {
        const cd = dist(e, cached);
        if (cd < 4 || e.alertTimer > 0 || this.hasClearShot(e, cached)) {
          best = cached; bestD = cd;
        }
      }
    }
    
    // Full scan only when needed (every 4 ticks, or no cached target, or alerted)
    if (!best && (Math.floor(e.zombieAge) % 4 === 0 || e.alertTimer > 0 || !best)) {
      for (const o of this.state.entities) {
        if (o.id === e.id || o.state === 'dead') continue;
        if (o.type !== 'civilian' && o.type !== 'military') continue;
        if (o.type === 'civilian' && o.buildingId !== null && (o.state === 'hiding' || o.state === 'sleeping' || o.state === 'seeking_shelter' || o.state === 'foraging')) continue;
        const d = dist(e, o);
        if (d < bestD) {
          if (d < 4 || e.alertTimer > 0 || this.hasClearShot(e, o)) {
            bestD = d; best = o;
            if (d < 1.5) break;
          }
        }
      }
    }
    
    // Cache the target
    if (best) e.targetId = best.id;

    if (e.alertTimer > 0 && !best) {
      const d = Math.sqrt((e.alertX - e.x) ** 2 + (e.alertZ - e.z) ** 2);
      if (d > 1) {
        const a = Math.atan2(e.alertZ - e.z, e.alertX - e.x) + (Math.random() - 0.5) * 0.3;
        e.vx += Math.cos(a) * e.speed * nightMul * 0.35 * dt;
        e.vz += Math.sin(a) * e.speed * nightMul * 0.35 * dt;
        e.state = 'hunting'; return;
      }
    }

    if (this.hordeCenters.length > 0 && !best) {
      const nh = this.hordeCenters.reduce((a, b) => dist(e, { x: a.x, z: a.z }) < dist(e, { x: b.x, z: b.z }) ? a : b);
      if (nh.count >= 3) {
        const d = Math.sqrt((nh.x - e.x) ** 2 + (nh.z - e.z) ** 2) || 1;
        e.vx += ((nh.x - e.x) / d) * e.speed * nightMul * 0.15 * dt;
        e.vz += ((nh.z - e.z) / d) * e.speed * nightMul * 0.15 * dt;
      }
    }

    if (!best) {
      e.wanderTimer -= dt;
      if (e.wanderTimer <= 0) { e.wanderAngle = Math.random() * Math.PI * 2; e.wanderTimer = 2 + Math.random() * 3; }
      const spd = e.speed * nightMul * (0.25 + Math.random() * 0.15);
      e.vx += Math.cos(e.wanderAngle) * spd * dt;
      e.vz += Math.sin(e.wanderAngle) * spd * dt;
      e.state = 'hunting'; return;
    }

    const d = dist(e, best);
    
    // Check building breach: zombie near a building with occupants
    if (d > 1.3 && d < 4) {
      const nearBldg = isInsideBuilding(this.state.buildings, e.x, e.z, 1.5);
      if (nearBldg) {
        const occupants = this.state.entities.filter(o => 
          o.type === 'civilian' && o.buildingId === nearBldg.id && o.state !== 'dead'
        );
        if (occupants.length > 0) {
          e.fatigue -= dt; // count seconds near this building
          if (e.fatigue <= 60 && Math.random() < dt * 0.3) {
            // BREACH! Kick everyone out
            for (const oc of occupants) {
              oc.buildingId = null;
              oc.state = 'fleeing';
              oc.isPanicking = true;
              oc.panicTimer = 6 + Math.random() * 4;
              if (Math.random() < 0.3) {
                // Bitten during breach
                oc.turnTimer = 2 + Math.random() * 2;
                this.state.stats.totalInfected++;
                this.state.stats.civiliansTurned++;
              }
            }
            e.fatigue = 100; // reset
            this.logEvent(`💥 Zombies breached building #${nearBldg.id}!`, 'zombie');
          }
        } else {
          e.fatigue = Math.min(100, e.fatigue + dt * 2); // recover
        }
      }
    }

    if (d < 1.3) {
      e.state = 'attacking'; e.vx *= 0.85; e.vz *= 0.85;
      if (e.attackCooldown <= 0) {
        e.attackCooldown = 6.0;
        if (best.type === 'civilian' && best.buildingId !== null && (best.state === 'hiding' || best.state === 'sleeping' || best.state === 'seeking_shelter')) {
          e.state = 'hunting'; e.targetId = null;
          const d2 = dist(e, best) || 1; e.wanderAngle = Math.atan2(e.z - best.z, e.x - best.x); e.wanderTimer = 1.5; return;
        }
        if (best.type === 'civilian') {
          // Already turning — don't re-bite
          if (best.turnTimer > 0) { e.state = 'hunting'; e.targetId = null; e.wanderAngle = Math.atan2(e.z - best.z, e.x - best.x); e.wanderTimer = 1.5; return; }
          // Bitten — start turn timer
          best.turnTimer = 2 + Math.random() * 2;
          best.state = 'fleeing';
          best.isPanicking = true;
          best.panicTimer = best.turnTimer + 1;
          e.biteAttempts++;
          e.state = 'feeding';
          e.feedingTimer = 0.5;
          this.alertNearbyZombies(e, best, 12);
          this.logEventThrottled(`Zombie bit civilian #${best.id}!`, 'zombie', 2);
        } else if (best.type === 'military') {
          best.state = 'dead';
          this.logEvent(`Military unit #${best.id} killed by zombie.`, 'death');
        }
      }
    } else {
      const len = dist(e, best) || 1;
      const a = Math.atan2(best.z - e.z, best.x - e.x) + (Math.random() - 0.5) * 0.4;
      const spd = e.speed * 2.5 * nightMul * (len < 5 ? 1.6 : 1.0);
      e.vx += Math.cos(a) * spd * dt * 0.4;
      e.vz += Math.sin(a) * spd * dt * 0.4;
      e.state = 'hunting';
    }
  }

  private alertNearbyZombies(src: Entity, target: Entity, range: number): void {
    for (const z of this.state.entities) {
      if (z.id === src.id || z.type !== 'zombie' || z.state === 'dead') continue;
      if (dist(z, src) < range) { z.alertTimer = 4; z.alertX = target.x; z.alertZ = target.z; }
    }
  }

  // ─── MILITARY AI ───
  private updateMilitary(e: Entity, dt: number, isNight: boolean): void {
    e.hunger -= 0.4 * dt; e.fatigue += 0.1 * dt;
    if (e.hunger <= -20) { e.state = 'dead'; this.logEvent(`Military unit #${e.id} starved.`, 'death'); return; }
    if (isNight && e.fatigue > 80) { e.isAsleep = true; e.state = 'sleeping'; e.vx = 0; e.vz = 0; return; }
    if (e.isAsleep) { e.fatigue -= 3.5 * dt; if (e.fatigue <= 10) { e.fatigue = 10; e.isAsleep = false; e.state = 'patrolling'; } return; }

    e.attackCooldown -= dt;
    if (e.ammoInMag <= 0 && e.ammo > 0) {
      e.isReloading = true; e.reloadTimer = 2.0; e.state = 'reloading';
      const l = Math.min(e.magazineSize, e.ammo); e.ammoInMag = l; e.ammo -= l; return;
    }

    if ((e.ammo + e.ammoInMag) < 30 && e.state !== 'resupplying') {
      const ab = this.findNearestAmmoBuilding(e.x, e.z);
      if (ab && ab.ammo > 0) { e.state = 'resupplying'; e.buildingId = ab.id; }
    }

    if (e.state === 'resupplying') {
      const tb = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
      if (!tb || tb.ammo <= 0) {
        const ab = this.findNearestAmmoBuilding(e.x, e.z);
        if (ab && ab.ammo > 0) { e.buildingId = ab.id; } else { e.state = 'patrolling'; e.buildingId = null; return; }
      }
      const b = this.state.buildings.find(bb => bb.id === e.buildingId)!;
      if (dist(e, b) < 1.5) {
        const got = Math.min(b.ammo, 60);
        if (got > 0) { b.ammo -= got; e.ammo = Math.min(e.maxAmmo, e.ammo + got); if (e.ammoInMag < e.magazineSize && e.ammo > 0) { const f = Math.min(e.magazineSize - e.ammoInMag, e.ammo); e.ammoInMag += f; e.ammo -= f; } }
        const gf = Math.min(b.food, 10); if (gf > 0) { b.food -= gf; e.hunger = Math.min(100, e.hunger + gf); }
        e.state = 'patrolling'; e.buildingId = null;
      } else {
        const d = dist(e, b) || 1; e.vx += ((b.x - e.x) / d) * e.speed * 0.45 * dt; e.vz += ((b.z - e.z) / d) * e.speed * 0.45 * dt;
      }
      return;
    }

    if (e.hunger < 25) {
      const tb = findNearestBuilding(this.state.buildings, e.x, e.z);
      if (tb && dist(e, tb) < 1.5) { const g = Math.min(tb.food, 15); if (g > 0) { tb.food -= g; e.hunger = Math.min(100, e.hunger + g); } return; }
    }

    if (e.state !== 'hiding') {
      let nz = 0;
      for (const o of this.state.entities) { if (o.type === 'zombie' && o.state !== 'dead' && dist(e, o) < 8) nz++; }
      if (nz >= 3 && e.ammo < 10) {
        const tb = findNearestBuilding(this.state.buildings, e.x, e.z);
        if (tb) { e.state = 'hiding'; e.buildingId = tb.id; }
      }
    }
    if (e.state === 'hiding') {
      e.vx = 0; e.vz = 0; e.ammo = Math.min(e.maxAmmo, e.ammo + 0.5 * dt);
      const zc = this.findNearest(e, 15, 'zombie');
      if ((!zc || dist(e, zc) > 15) || (e.ammo + e.ammoInMag) > 15) {
        e.state = 'patrolling'; e.buildingId = null;
        if (e.ammoInMag < e.magazineSize && e.ammo > 0) { const f = Math.min(e.magazineSize - e.ammoInMag, e.ammo); e.ammoInMag += f; e.ammo -= f; }
      }
      return;
    }

    // Squad
    if (e.squadId !== null) {
      const sm = this.state.entities.filter(o => o.id !== e.id && o.squadId === e.squadId && o.state !== 'dead');
      if (sm.length > 0) {
        const ax = sm.reduce((s, m) => s + m.x, 0) / sm.length;
        const az = sm.reduce((s, m) => s + m.z, 0) / sm.length;
        if (dist(e, { x: ax, z: az }) > 6) { const d = Math.sqrt((ax - e.x) ** 2 + (az - e.z) ** 2) || 1; e.vx += ((ax - e.x) / d) * e.speed * 0.4 * dt; e.vz += ((az - e.z) / d) * e.speed * 0.4 * dt; }
        if (!e.isSquadLeader && e.state === 'patrolling') {
          const ldr = sm.find(m => m.isSquadLeader) || sm[0];
          if (ldr && dist(e, ldr) > 4) { const d = Math.sqrt((ldr.x - e.x) ** 2 + (ldr.z - e.z) ** 2) || 1; e.vx += ((ldr.x - e.x) / d) * e.speed * 0.35 * dt; e.vz += ((ldr.z - e.z) / d) * e.speed * 0.35 * dt; }
        }
      }
    }

    // Combat
    const nearZ = this.findNearest(e, 25, 'zombie');
    const nearCiv = this.findNearest(e, 12, 'civilian');
    if (nearCiv && nearZ && dist(nearCiv, nearZ) < 5) {
      const d = dist(e, nearZ) || 1; e.vx += ((nearZ.x - e.x) / d) * e.speed * 0.5 * dt; e.vz += ((nearZ.z - e.z) / d) * e.speed * 0.5 * dt; e.state = 'engaging'; return;
    }

    if (nearZ && dist(e, nearZ) < 25) {
      e.state = 'engaging';
      const d = dist(e, nearZ);
      if (!this.hasClearShot(e, nearZ) && d > 3) {
        const len = dist(e, nearZ) || 1; e.vx += ((nearZ.x - e.x) / len) * e.speed * 0.6 * dt; e.vz += ((nearZ.z - e.z) / len) * e.speed * 0.6 * dt; e.aimTimer = 0; return;
      }
      if (d < 25 && e.attackCooldown <= 0) {
        if (e.aimTimer <= 0 && e.ammoInMag > 0) { e.aimTimer = 0.3 + Math.random() * 0.3; e.vx *= 0.9; e.vz *= 0.9; }
        if (e.aimTimer > 0) {
          e.aimTimer -= dt; e.vx *= 0.88; e.vz *= 0.88;
          if (e.aimTimer <= 0 && e.ammoInMag > 0) {
            e.ammoInMag -= 1; e.attackCooldown = 1.0; e.aimTimer = 0;
            const hitChance = Math.max(25, Math.min(95, Math.floor(85 - d * 1.0)));
            const hit = Math.random() * 100 < hitChance;
            this.state.events.push({ time: this.state.totalTime, day: this.state.day, text: `SHOT:${hit?'HIT':'MISS'}:${e.x},${e.z},${nearZ.x},${nearZ.z}`, type: 'military' });
            for (const z of this.state.entities) { if (z.type === 'zombie' && z.state !== 'dead' && dist(e, z) < 25) { z.alertTimer = 5; z.alertX = e.x; z.alertZ = e.z; } }
            if (hit) { nearZ.state = 'dead'; e.kills++; this.state.stats.zombiesKilledByMilitary++; }
          }
        }
      }
      if (d < 6) { const len = dist(e, nearZ) || 1; e.vx += ((e.x - nearZ.x) / len) * e.speed * 0.8 * dt; e.vz += ((e.z - nearZ.z) / len) * e.speed * 0.8 * dt; }
      else if (d < 10) { const len = dist(e, nearZ) || 1; const u = (12 - d) / 12; e.vx += ((e.x - nearZ.x) / len) * e.speed * u * 1.0 * dt; e.vz += ((e.z - nearZ.z) / len) * e.speed * u * 0.6 * dt; }
      else if (d > 15) { const len = dist(e, nearZ) || 1; e.vx += ((nearZ.x - e.x) / len) * e.speed * 0.3 * dt; e.vz += ((nearZ.z - e.z) / len) * e.speed * 0.3 * dt; }
      if (e.squadId !== null) { for (const m of this.state.entities) { if (m.id !== e.id && m.squadId === e.squadId && m.state !== 'dead' && (m.state === 'patrolling' || m.state === 'wandering')) m.state = 'engaging'; } }
      return;
    }

    e.state = 'patrolling';
    const dfc = Math.sqrt(e.x * e.x + e.z * e.z);
    if (this.hordeCenters.length > 0) {
      const bh = this.hordeCenters.reduce((a, b) => a.count > b.count ? a : b);
      if (bh.count >= 3) { const d = Math.sqrt((bh.x - e.x) ** 2 + (bh.z - e.z) ** 2) || 1; e.vx += ((bh.x - e.x) / d) * e.speed * 0.5 * dt; e.vz += ((bh.z - e.z) / d) * e.speed * 0.5 * dt; return; }
    }
    if (dfc > 18) { const a = Math.atan2(-e.z, -e.x); e.vx += Math.cos(a) * e.speed * 0.4 * dt; e.vz += Math.sin(a) * e.speed * 0.4 * dt; }
    else { e.wanderTimer -= dt; if (e.wanderTimer <= 0) { e.wanderAngle = Math.random() * Math.PI * 2; e.wanderTimer = 2 + Math.random() * 3; } e.vx += Math.cos(e.wanderAngle) * e.speed * 0.4 * dt; e.vz += Math.sin(e.wanderAngle) * e.speed * 0.4 * dt; }
  }

  private hasClearShot(shooter: Entity, target: Entity): boolean {
    const d = dist(shooter, target); if (d < 0.1) return true;
    const nx = (target.x - shooter.x) / d, nz = (target.z - shooter.z) / d;
    for (let i = 0; i <= Math.ceil(d / 0.5); i++) {
      const px = shooter.x + nx * d * (i / Math.ceil(d / 0.5));
      const pz = shooter.z + nz * d * (i / Math.ceil(d / 0.5));
      for (const b of this.state.buildings) {
        if (dist(shooter, b) < 1.5 && b.h < 3) continue;
        if (dist(target, b) < 1.5 && b.h < 3) continue;
        const hw = b.w / 2 + 0.2, hd = b.d / 2 + 0.2;
        if (Math.abs(b.x - px) < hw && Math.abs(b.z - pz) < hd) return false;
      }
    }
    return true;
  }

  private findNearest(e: Entity, range: number, type: EntityType): Entity | null {
    let best: Entity | null = null;
    let bestD2 = range * range; // use squared distance to avoid sqrt
    const ex = e.x, ez = e.z;
    for (const o of this.state.entities) {
      if (o.id === e.id || o.state === 'dead') continue;
      if (o.type !== type) continue;
      const dx = o.x - ex, dz = o.z - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = o; if (d2 < 1) break; } // early exit at bite range
    }
    return best;
  }

  getStats(): PopulationStats { return { ...this.state.stats }; }
  getRecentEvents(count: number = 20): SimEvent[] { return this.events.slice(-count); }
}
