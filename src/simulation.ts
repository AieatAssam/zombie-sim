// Simulation Engine — core simulation logic v3 (overhauled)

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
    this.logEvent('🧬 Outbreak detected. Multiple infected active.', 'warning');
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

    // Patient zero — start with 2 zombies
    const initialZombies = 2;
    for (let zi = 0; zi < initialZombies; zi++) {
      let zx = (Math.random() - 0.5) * 20;
      let zz = (Math.random() - 0.5) * 20;
      if (isInsideBuilding(map.buildings, zx, zz)) { zx -= 5; zz -= 5; }
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
      state: 'wandering', hp: 100, maxHp: 100,
      hunger: 60 + Math.random() * 40, fatigue: 0,
      ammo: 0, maxAmmo: 0, magazineSize: 0, ammoInMag: 0, isReloading: false, reloadTimer: 0,
      attackCooldown: 0,
      targetId: null, wanderAngle: Math.random() * Math.PI * 2,
      aimTimer: 0,
      wanderTimer: Math.random() * 5, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 3.0 + Math.random() * 1.2,
      color: '#4499ff', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: null, isSquadLeader: false, kills: 0, hideTimer: 0, biteAttempts: 0,
      zombieAge: 0, feedingTimer: 0, isAiming: false, alertTimer: 0, alertX: 0, alertZ: 0,
      sprintTimer: 0,
      sprintCooldown: 0,
      maxSprintTime: 1.5 + Math.random() * 1.0,
    };
  }

  private createZombie(x: number, z: number): Entity {
    return {
      id: this.nextId++,
      type: 'zombie', x, z, vx: 0, vz: 0,
      state: 'hunting', hp: 30, maxHp: 30,
      hunger: 100, fatigue: 100, ammo: 0, maxAmmo: 0, magazineSize: 0, ammoInMag: 0, isReloading: false, reloadTimer: 0,
      attackCooldown: 0, targetId: null,
      wanderAngle: Math.random() * Math.PI * 2, aimTimer: 0,
      wanderTimer: Math.random() * 3, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 3.5 + Math.random() * 1.0,
      color: '#33ff33', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: null, isSquadLeader: false, kills: 0, hideTimer: 0, biteAttempts: 0,
      zombieAge: 0, feedingTimer: 0, isAiming: false, alertTimer: 0, alertX: 0, alertZ: 0,
      sprintTimer: 0,
      sprintCooldown: 0,
      maxSprintTime: 0,
    };
  }

  private createMilitary(x: number, z: number, squadId?: number): Entity {
    return {
      id: this.nextId++,
      type: 'military', x, z, vx: 0, vz: 0,
      state: 'patrolling', hp: 100, maxHp: 100,
      hunger: 70 + Math.random() * 30, fatigue: 10,
      ammo: 150, maxAmmo: 150, magazineSize: 10, ammoInMag: 10, isReloading: false, reloadTimer: 0,
      attackCooldown: 0,
      targetId: null, wanderAngle: Math.random() * Math.PI * 2, aimTimer: 0,
      wanderTimer: 1, sleepTimer: 0, forageTimer: 0,
      buildingId: null, lastUpdateTime: 0,
      speed: 3.5 + Math.random() * 0.75,
      color: '#ff3333', isAsleep: false, isPanicking: false,
      panicTimer: 0, squadId: squadId || null, isSquadLeader: false, kills: 0, hideTimer: 0, biteAttempts: 0,
      zombieAge: 0, feedingTimer: 0, isAiming: false, alertTimer: 0, alertX: 0, alertZ: 0,
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

    const prevDay = s.day;
    s.day = Math.floor(s.totalTime / DAY_LENGTH) + 1;
    s.timeOfDay = (s.totalTime % DAY_LENGTH) / DAY_LENGTH;

    const isNight = s.timeOfDay > 0.65 || s.timeOfDay < 0.08;

    // ─── Phase tracking ───
    this.updatePhase();

    // ─── Deployment timer countdown ───
    if (this.deploymentTimer > 0) this.deploymentTimer -= dt;

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
    let civ = 0, zomb = 0, mil = 0;
    for (const e of s.entities) {
      if (e.state === 'dead') continue;
      if (e.type === 'civilian') civ++;
      else if (e.type === 'zombie') zomb++;
      else if (e.type === 'military') mil++;
    }

    s.stats.civilians = civ;
    s.stats.zombies = zomb;
    s.stats.military = mil;
    s.stats.dead = s.stats.zombiesKilledByMilitary + s.stats.civiliansTurned + s.stats.civiliansStarved;

    // Food supply — percentage of "full rations" (each civilian needs ~2 food units)
    let totalFood = 0;
    for (const b of s.buildings) totalFood += b.food;
    const humanPop = civ + mil;
    if (humanPop > 0) {
      // "Full supply" = 2 food units per person (enough for refeeding)
      s.stats.foodSupply = Math.min(100, Math.max(0, Math.round((totalFood / Math.max(1, humanPop * 2)) * 100)));
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

    // Chaos level (0-100) — only meaningful when significant zombie presence
    if (zomb <= 10) {
      s.chaosLevel = 0;
    } else {
      s.chaosLevel = Math.min(100, Math.round(
        (zomb / Math.max(1, civ + mil)) * 60 +
        (s.stats.dead > 50 ? 20 : s.stats.dead > 20 ? 10 : 0) +
        (zomb > 100 ? 20 : zomb > 50 ? 10 : 0)
      ));
    }

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

  // ─── BUILDING COLLISION: only push zombies out of buildings ───
  private pushOutOfBuilding(e: Entity): void {
    for (const b of this.state.buildings) {
      const hw = b.w / 2;
      const hd = b.d / 2;
      if (Math.abs(b.x - e.x) < hw && Math.abs(b.z - e.z) < hd) {
        // Zombies always get pushed out
        if (e.type === 'zombie') {
          const dx = e.x - b.x;
          const dz = e.z - b.z;
          const distRight = hw - dx;
          const distLeft = hw + dx;
          const distTop = hd - dz;
          const distBottom = hd + dz;
          const minDist = Math.min(distRight, distLeft, distTop, distBottom);

          if (minDist === distRight) e.x = b.x + hw + 0.3;
          else if (minDist === distLeft) e.x = b.x - hw - 0.3;
          else if (minDist === distTop) e.z = b.z + hd + 0.3;
          else e.z = b.z - hd - 0.3;
        } else {
          // Civilians and military can stay inside — track which building
          e.buildingId = b.id;
        }
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
    const zombieThreat = s.stats.zombies;
    const civilianCount = s.stats.civilians;
    const totalThreat = zombieThreat + s.stats.civiliansTurned;

    // Deployment thresholds based on infection level
    // Small initial force arrives early, then scales with threat
    let targetSoldiers = 0;

    if (totalThreat >= 2) targetSoldiers = 1;
    if (totalThreat >= 10) targetSoldiers = 2;
    if (totalThreat >= 20) targetSoldiers = 3;
    if (totalThreat >= 40) targetSoldiers = 5;
    if (totalThreat >= 70) targetSoldiers = 7;
    if (totalThreat >= 110) targetSoldiers = 10;
    if (totalThreat >= 160) targetSoldiers = 13;
    if (totalThreat >= 230) targetSoldiers = 16;
    if (totalThreat >= 300) targetSoldiers = 20;

    // Cap soldiers so zombies still have a chance
    targetSoldiers = Math.min(targetSoldiers, Math.floor(zombieThreat * 0.5 + 2));

    // Deploy in waves - don't spawn all at once
    const currentMil = s.stats.military;
    if (currentMil < targetSoldiers && this.deploymentTimer <= 0) {
      const toDeploy = Math.min(1 + Math.floor(Math.random() * 2), targetSoldiers - currentMil);
      // Spawn at random edge of map
      for (let i = 0; i < toDeploy; i++) {
        const angle = Math.random() * Math.PI * 2;
        const x = Math.cos(angle) * (MAP_HALF - 3);
        const z = Math.sin(angle) * (MAP_HALF - 3);
        s.entities.push(this.createMilitary(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3));
        s.stats.military++;
      }
      this.deploymentTimer = 1.5 + Math.random() * 1.5; // Cooldown between waves
      this.logEvent(`🚁 ${toDeploy} soldier${toDeploy>1?'s':''} deployed. (${currentMil + toDeploy} total)`, 'military');
    }
  }

  private updateEntity(e: Entity, dt: number, isNight: boolean): void {
    const s = this.state;

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

    // Clamp velocity (sprinting civilians get extra speed)
    let maxSpeed = e.isAsleep ? 0.1 : e.speed * (e.type === 'zombie' ? 1.3 : 1.2);
    if (e.type === 'civilian' && e.sprintTimer > 0) {
      maxSpeed = e.speed * 3.5; // Allow sprint speed
    }
    const spd = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
    if (spd > maxSpeed) {
      e.vx = (e.vx / spd) * maxSpeed;
      e.vz = (e.vz / spd) * maxSpeed;
    }
  }

  // ─── CIVILIAN AI ───
  private updateCivilian(e: Entity, dt: number, isNight: boolean): void {
    e.hunger -= 0.7 * dt;
    e.fatigue += 0.15 * dt;

    // Check if starving
    if (e.hunger < 25 && e.state !== 'starving' && e.state !== 'dead') {
      e.state = 'starving';
    }

    // Starvation
    if (e.hunger <= -10) {
      e.state = 'dead';
      this.state.stats.civiliansStarved++;
      // Signal for renderer to create a blood pool
      this.state.events.push({
        time: this.state.totalTime,
        day: this.state.day,
        text: `CORPSE:${e.x},${e.z}`,
        type: 'death',
      });
      return;
    }



    // Night shelter: civilians seek buildings to sleep in
    if (isNight && e.fatigue > 60 && e.state !== 'starving' && e.state !== 'fleeing' && e.state !== 'hiding') {
      if (e.state !== 'seeking_shelter' && !e.isAsleep) {
        // Find nearest building to sleep in
        const targetB = findNearestBuilding(this.state.buildings, e.x, e.z);
        if (targetB) {
          e.state = 'seeking_shelter';
          e.buildingId = targetB.id;
          e.wanderTimer = 10; // 10-second timeout before fallback sleep
        } else {
          // Fallback: sleep in place if no building found
          e.isAsleep = true;
          e.state = 'sleeping';
          e.vx = 0; e.vz = 0;
          return;
        }
      }
      if (e.state === 'seeking_shelter') {
        const targetB = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
        // Use wanderTimer as a crude timeout counter (10 seconds)
        e.wanderTimer -= dt;
        if (e.wanderTimer <= 0) {
          // Timeout: just sleep in place as fallback
          e.isAsleep = true;
          e.state = 'sleeping';
          e.vx = 0; e.vz = 0;
          return;
        }
        if (targetB) {
          const d = dist(e, targetB);
          if (d < 1) {
            // Close enough — enter building and sleep
            e.buildingId = targetB.id;
            e.isAsleep = true;
            e.state = 'sleeping';
            e.vx = 0; e.vz = 0;
            return;
          } else {
            // Move toward building
            const dx = targetB.x - e.x;
            const dz = targetB.z - e.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            const spd = e.speed * 1.0;
            e.vx += (dx / len) * spd * dt * 0.4;
            e.vz += (dz / len) * spd * dt * 0.4;
            return;
          }
        } else {
          // Building reference lost, fallback
          e.isAsleep = true;
          e.state = 'sleeping';
          e.vx = 0; e.vz = 0;
          return;
        }
      }
    }
    if (e.isAsleep) {
      e.fatigue -= 3.0 * dt;
      e.hunger -= 0.1 * dt;
      if (e.fatigue <= 0) {
        e.fatigue = 0;
        e.isAsleep = false;
        e.state = 'wandering';
        e.buildingId = null; // Leave building when waking up
      }
      return;
    }

    // ─── SEEKING SHELTER (handles both night and day seeking) ───
    if (e.state === 'seeking_shelter') {
      const targetB = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
      if (targetB) {
        const d = dist(e, targetB);
        if (d < 1) {
          // Enter building
          e.buildingId = targetB.id;
          e.state = 'hiding';
          e.hideTimer = 4 + Math.random() * 6;
          e.vx = 0; e.vz = 0;
          return;
        } else {
          // Move toward building
          const dx = targetB.x - e.x;
          const dz = targetB.z - e.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          const spd = e.speed * 1.2;
          e.vx += (dx / len) * spd * dt * 0.4;
          e.vz += (dz / len) * spd * dt * 0.4;
          return;
        }
      } else {
        // No target — fall back to wandering
        e.state = 'wandering';
        e.buildingId = null;
      }
    }

    // ─── PANIC / FLEEING SYSTEM ───
    const fleeRange = 14;
    const nearestZombie = this.findNearest(e, fleeRange, 'zombie');
    const zombieDist = nearestZombie ? dist(e, nearestZombie) : 999;
    const nearestZombieClose = this.findNearest(e, 12, 'zombie');
    const zombieDistClose = nearestZombieClose ? dist(e, nearestZombieClose) : 999;

    // Dramatic panic: flee immediately when zombie within 8 units
    if (zombieDistClose < 8) {
      e.state = 'fleeing';
      e.isPanicking = true;
      e.panicTimer = 4 + Math.random() * 2;
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
          e.panicTimer = 4 + Math.random() * 2;
        }
      } else {
        // Hide inside
        e.state = 'hiding';
        e.hideTimer = 3 + Math.random() * 4;
        e.vx = 0; e.vz = 0;
      }
    }

    // ─── ENHANCED HIDING: seek building when outnumbered by zombies ───
    if (nearestZombie && zombieDist < 18 && e.hunger >= 25 && e.state !== 'hiding' && e.state !== 'fleeing' && (e.state as string) !== 'seeking_shelter') {
      let zombiesVisible = 0;
      let alliesVisible = 0;
      for (const other of this.state.entities) {
        if (other.id === e.id || other.state === 'dead') continue;
        if (dist(e, other) > 18) continue;
        if (other.type === 'zombie') zombiesVisible++;
        else if (other.type === 'civilian' || other.type === 'military') alliesVisible++;
      }
      if (zombiesVisible > alliesVisible) {
        const targetB = findNearestBuilding(this.state.buildings, e.x, e.z);
        if (targetB) {
          e.state = 'seeking_shelter';
          e.buildingId = targetB.id;
        }
      }
    }

    // ─── SPRINT SYSTEM ───
    // Manage sprint cooldown
    if (e.sprintCooldown > 0) {
      e.sprintCooldown -= dt;
    }

    // Activate sprint when zombie detected within 14 units
    if (nearestZombie && zombieDist < 14 && e.sprintCooldown <= 0 && e.sprintTimer <= 0) {
      e.sprintTimer = e.maxSprintTime * (1 - (e.hunger < 25 ? 0.5 : 0));
    }

    // Manage sprint timer
    if (e.sprintTimer > 0) {
      e.sprintTimer -= dt;
      if (e.sprintTimer <= 0) {
        e.sprintTimer = 0;
        if (e.hunger < 25) {
          e.sprintCooldown = 6 + Math.random() * 3;
        } else {
          e.sprintCooldown = 3 + Math.random() * 2;
        }
      }
    }

    // State machine
    switch (e.state) {
      case 'hiding': {
        e.vx = 0; e.vz = 0;
        e.hideTimer -= dt;
        // Only hunger < 25 can force civilians out of hiding early
        const forcedOut = e.hunger < 25;
        // Check if zombie is still near before coming out
        const zCheck = this.findNearest(e, 14, 'zombie');
        if (e.hideTimer <= 0 || forcedOut || !zCheck || dist(e, zCheck) > 14) {
          e.state = 'wandering';
          // Exit away from nearest zombie
          if (zCheck) {
            const dx = e.x - zCheck.x;
            const dz = e.z - zCheck.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            e.wanderAngle = Math.atan2(dz, dx) + (Math.random() - 0.5) * 1.0;
          } else {
            e.wanderAngle = Math.random() * Math.PI * 2;
          }
          e.wanderTimer = 1.5;
        }
        break;
      }

      case 'fleeing': {
        const z = this.findNearest(e, 25, 'zombie');
        if (z) {
          const d = dist(e, z);
          if (d < 1.3) {
            // Bitten — 50% chance to resist
            if (Math.random() < 0.5) {
              // Resist! Take damage but don't turn
              e.hp -= 35; // Less damage, 100 HP means 4 bites to kill
              if (e.hp <= 0) {
                e.state = 'dead';
                this.state.stats.civiliansStarved++;
                this.state.events.push({
                  time: this.state.totalTime,
                  day: this.state.day,
                  text: `CORPSE:${e.x},${e.z}`,
                  type: 'death',
                });
                return;
              }
              // Push away from zombie after resisting
              const dx = e.x - z.x;
              const dz = e.z - z.z;
              const len = Math.sqrt(dx * dx + dz * dz) || 1;
              e.vx += (dx / len) * 8;
              e.vz += (dz / len) * 8;
              this.logEventThrottled(`Civilian #${e.id} resisted a bite!`, 'info', 3);
            } else {
              // Turn into zombie
              e.type = 'zombie';
              e.hp = 30;
              e.maxHp = 30;
              e.speed = 2.6 + Math.random() * 0.75;
              e.color = '#33ff33';
              e.state = 'hunting';
              e.isAsleep = false;
              e.attackCooldown = 0;
              e.zombieAge = 0;
              e.buildingId = null;
              this.state.stats.totalInfected++;
              this.state.stats.civiliansTurned++;
              this.logEventThrottled(`Civilian #${e.id} was bitten and turned!`, 'zombie', 3);
            }
          } else {
            // Flee away from zombie with sprint speed when available
            const dx = e.x - z.x;
            const dz = e.z - z.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            const fleeAngle = Math.atan2(dz, dx);
            const jitter = (Math.random() - 0.5) * 1.2; // More jitter for panic
            const sprintMul = e.sprintTimer > 0 ? 3.0 : 1.8;
            const spd = e.speed * sprintMul;
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

      case 'starving': {
        // Starving: desperate for food, ignores distant zombies
        // Reduced speed, more desperate behavior
        e.wanderTimer -= dt;

        // Find nearest food building
        const foodB = this.findNearestFoodBuilding(e.x, e.z);
        if (foodB && dist(e, foodB) < 1.5) {
          // Entering food building clears starvation immediately
          foodB.food -= 5;
          e.hunger = 80;
          e.state = 'wandering'; // No longer starving
          this.logEventThrottled(`Civilian #${e.id} found food and is no longer starving.`, 'info', 5);
          e.buildingId = null;
          e.wanderAngle = Math.random() * Math.PI * 2;
          e.forageTimer = 8 + Math.random() * 4; // 8-12s cooldown
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
          const spd = e.speed * 0.5; // Starving: weak, moves slowly
          e.vx += Math.cos(e.wanderAngle) * spd * dt * 0.5;
          e.vz += Math.sin(e.wanderAngle) * spd * dt * 0.5;
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
          // Leave food building — wander away, can't re-forage immediately
          e.state = 'wandering';
          e.buildingId = null;
          e.wanderAngle = Math.random() * Math.PI * 2;
          e.forageTimer = 5 + Math.random() * 3; // 5-8s cooldown before can forage again
        }
        break;
      }

      case 'wandering':
      default: {
        e.wanderTimer -= dt;

        // If hungry, seek food
        if (e.hunger < 45) {
          const foodB = this.findNearestFoodBuilding(e.x, e.z);
          if (foodB && foodB.food > 0) {
            const dx = foodB.x - e.x;
            const dz = foodB.z - e.z;
            const d = Math.sqrt(dx * dx + dz * dz);

            // Only forage if hungry AND zombie check is safe enough
            const nearZomb = this.findNearest(e, 12, 'zombie');
            const safeToForage = !nearZomb || dist(e, nearZomb) > 5;

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

    // Alert timer: count down when alerted by gunshots
    if (e.alertTimer > 0) {
      e.alertTimer -= dt;
    }

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
    const nightSpeedMul = isNight ? 1.6 : 1.0;

    // ─── Aggro system ───
    // Visual aggro: 10 units, requires LOS check
    // Audio aggro: 25 units (alertTimer active), no LOS needed
    // Without aggro: random wandering with direction changes
    const VISUAL_RANGE = 16;
    const AUDIO_RANGE = 25;

    let bestTarget: Entity | null = null;
    let bestDist = e.alertTimer > 0 ? AUDIO_RANGE : VISUAL_RANGE;

    for (const other of this.state.entities) {
      if (other.id === e.id || other.state === 'dead') continue;
      if (other.type !== 'civilian' && other.type !== 'military') continue;
      // Skip civilians who are safely inside a building
      if (other.type === 'civilian' && other.buildingId !== null && (other.state === 'hiding' || other.state === 'sleeping' || other.state === 'seeking_shelter')) continue;
      const d = dist(e, other);
      if (d < bestDist) {
        // For visual aggro (no alert), check line of sight
        if (e.alertTimer <= 0 && !this.hasClearShot(e, other)) continue;
        bestDist = d;
        bestTarget = other;
      }
    }

    // If alerted but no target found, move toward alert source
    if (e.alertTimer > 0 && !bestTarget) {
      const dx = e.alertX - e.x;
      const dz = e.alertZ - e.z;
      const distToAlert = Math.sqrt(dx * dx + dz * dz);
      if (distToAlert > 1) {
        const len = distToAlert || 1;
        const jitter = (Math.random() - 0.5) * 0.3;
        const angle = Math.atan2(dz, dx) + jitter;
        e.vx += Math.cos(angle) * e.speed * nightSpeedMul * 0.35 * dt;
        e.vz += Math.sin(angle) * e.speed * nightSpeedMul * 0.35 * dt;
        e.state = 'hunting';
        return;
      }
    }

    const target = bestTarget;

    // Horde attraction: older zombies are drawn to horde centers (gentle pull)
    if (this.hordeCenters.length > 0 && e.zombieAge > 5 && !target) {
      const nearestHorde = this.hordeCenters.reduce((a, b) =>
        dist(e, { x: a.x, z: a.z }) < dist(e, { x: b.x, z: b.z }) ? a : b
      );
      if (nearestHorde.count >= 3) {
        const dx = nearestHorde.x - e.x;
        const dz = nearestHorde.z - e.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * nightSpeedMul * 0.15 * dt;
        e.vz += (dz / len) * e.speed * nightSpeedMul * 0.15 * dt;
      }
    }

    // ─── No target: random wandering ───
    if (!target) {
      e.wanderTimer -= dt;
      if (e.wanderTimer <= 0) {
        e.wanderAngle = Math.random() * Math.PI * 2;
        e.wanderTimer = 2 + Math.random() * 3; // 2-5 seconds random direction
      }
      const spd = e.speed * nightSpeedMul * (0.25 + Math.random() * 0.15);
      e.vx += Math.cos(e.wanderAngle) * spd * dt;
      e.vz += Math.sin(e.wanderAngle) * spd * dt;
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
        // Safeguard: don't bite civilians who are inside buildings
        if (target.type === 'civilian' && target.buildingId !== null && (target.state === 'hiding' || target.state === 'sleeping' || target.state === 'seeking_shelter')) {
          // Target is safe inside a building — move away to find another
          e.state = 'hunting';
          e.targetId = null;
          const dx = e.x - target.x;
          const dz = e.z - target.z;
          e.wanderAngle = Math.atan2(dz, dx);
          e.wanderTimer = 1.5;
          return;
        }
        if (target.type === 'civilian') {
          // 50% chance to resist infection (take damage instead)
          if (Math.random() < 0.5) {
            // Resist! Civilian takes damage but doesn't turn
            target.hp -= 35; // Less damage, 100 HP means 4 bites to kill
            if (target.hp <= 0) {
              target.state = 'dead';
              this.state.stats.civiliansStarved++;
              this.state.events.push({
                time: this.state.totalTime,
                day: this.state.day,
                text: `CORPSE:${target.x},${target.z}`,
                type: 'death',
              });
            }
          } else {
            // Turn into zombie
            target.type = 'zombie';
            target.hp = 30;
            target.maxHp = 30;
            target.speed = 2.6 + Math.random() * 0.75;
            target.color = '#33ff33';
            target.state = 'hunting';
            target.isAsleep = false;
            target.attackCooldown = 0;
            target.zombieAge = 0;
            target.buildingId = null;
            e.biteAttempts++;
            e.state = 'feeding';
            e.feedingTimer = 0.5;
            this.state.stats.totalInfected++;
            this.state.stats.civiliansTurned++;
          }
          this.logEventThrottled(`Zombie bit civilian #${target.id}!`, 'zombie', 2);
        } else if (target.type === 'military') {
          target.hp -= 35;
          if (target.hp <= 0) {
            target.state = 'dead';
            this.logEvent(`Military unit #${target.id} killed by zombie.`, 'death');
          }
        }
      }
    } else {
      // Chase — faster at night with random jitter to prevent single-file lines
      const dx = target.x - e.x;
      const dz = target.z - e.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const jitter = (Math.random() - 0.5) * 0.4; // Slight randomness in chase direction
      const chaseAngle = Math.atan2(dz, dx) + jitter;
      const chaseSpd = e.speed * 2.5 * nightSpeedMul;
      const sprintMul = len < 5 ? 1.6 : 1.0;
      e.vx += Math.cos(chaseAngle) * chaseSpd * sprintMul * dt * 0.4;
      e.vz += Math.sin(chaseAngle) * chaseSpd * sprintMul * dt * 0.4;
      e.state = 'hunting';
    }
  }

  // ─── MILITARY AI ───
  private updateMilitary(e: Entity, dt: number, isNight: boolean): void {
    e.hunger -= 0.4 * dt;
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

    if (e.hunger <= -20) {
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
    const nearZombie = this.findNearest(e, 25, 'zombie');

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

    if (nearZombie && dist(e, nearZombie) < 20) {
      e.state = 'engaging';
      const d = dist(e, nearZombie);

      // If a building blocks the shot, close in until clear
      if (!this.hasClearShot(e, nearZombie) && d > 3) {
        // Move toward the zombie to get a better angle
        const dx = nearZombie.x - e.x;
        const dz = nearZombie.z - e.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * 0.6 * dt;
        e.vz += (dz / len) * e.speed * 0.6 * dt;
        e.aimTimer = 0;
        return;
      }

      // ─── AIM TIMER + ACCURACY SYSTEM ───
      if (d < 20 && e.attackCooldown <= 0) {
        if (e.aimTimer <= 0 && e.ammoInMag > 0) {
          // Start aiming: 0.3-0.8 seconds
          e.isAiming = true;
          e.aimTimer = 0.2 + Math.random() * 0.3;
          e.vx *= 0.9;
          e.vz *= 0.9;
        }

        if (e.aimTimer > 0) {
          // Slow movement while aiming
          e.aimTimer -= dt;
          e.vx *= 0.88;
          e.vz *= 0.88;

          if (e.aimTimer <= 0 && e.ammoInMag > 0) {
            // Fire!
            e.ammoInMag -= 1;
            e.attackCooldown = 0.6;
            e.aimTimer = 0;
            e.isAiming = false;

            // Accuracy: hit chance = 95 - (distance * 2)
            // At distance 5 = 85%, at distance 15 = 65%, at distance 25 = 45%
            const hitChance = Math.max(15, Math.floor(95 - d * 2));
            const hit = Math.random() * 100 < hitChance;
            const hitStr = hit ? 'HIT' : 'MISS';

            // Always create tracer effect with hit/miss info
            this.state.events.push({
              time: this.state.totalTime,
              day: this.state.day,
              text: `SHOT:${hitStr}:${e.x},${e.z},${nearZombie.x},${nearZombie.z}`,
              type: 'military',
            });

            // Audio aggro: alert all zombies within 25 units of the shooter
            for (const zombie of this.state.entities) {
              if (zombie.type === 'zombie' && zombie.state !== 'dead') {
                if (dist(e, zombie) < 25) {
                  zombie.alertTimer = 5;
                  zombie.alertX = e.x;
                  zombie.alertZ = e.z;
                }
              }
            }

            if (hit) {
              nearZombie.hp -= 15;
              if (nearZombie.hp <= 0) {
                nearZombie.state = 'dead';
                e.kills++;
                this.state.stats.zombiesKilledByMilitary++;
                this.logEventThrottled(`Military #${e.id} killed zombie #${nearZombie.id}.`, 'military', 0.3);
              }
            }
          }
        }
      }

      // Maintain preferred engagement distance (~8-14 units)
      // Back up when zombie gets close, hold position at ideal range
      if (d < 6) {
        // Emergency: zombie right on top — full retreat
        const dx = e.x - nearZombie.x;
        const dz = e.z - nearZombie.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * 0.8 * dt;
        e.vz += (dz / len) * e.speed * 0.8 * dt;
      } else if (d < 10) {
        // Backpedal: maintain distance, proportional to closeness
        const dx = e.x - nearZombie.x;
        const dz = e.z - nearZombie.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const urgency = (10 - d) / 10; // 0 at 10u, 0.4 at 6u
        e.vx += (dx / len) * e.speed * urgency * 0.6 * dt;
        e.vz += (dz / len) * e.speed * urgency * 0.6 * dt;
      } else if (d > 15) {
        // Close in to fighting range
        const dx = nearZombie.x - e.x;
        const dz = nearZombie.z - e.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.vx += (dx / len) * e.speed * 0.3 * dt;
        e.vz += (dz / len) * e.speed * 0.3 * dt;
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

    // Patrol — move toward city center to find zombies
    e.state = 'patrolling';
    
    // If far from center (>15 units), move inward
    const distFromCenter = Math.sqrt(e.x * e.x + e.z * e.z);
    if (distFromCenter > 18) {
      // Move inward slowly
      const centerAngle = Math.atan2(-e.z, -e.x);
      e.vx += Math.cos(centerAngle) * e.speed * 0.4 * dt;
      e.vz += Math.sin(centerAngle) * e.speed * 0.4 * dt;
    } else {
      e.wanderTimer -= dt;
      if (e.wanderTimer <= 0) {
        e.wanderAngle = Math.random() * Math.PI * 2;
        e.wanderTimer = 2 + Math.random() * 3;
      }
      e.vx += Math.cos(e.wanderAngle) * e.speed * 0.4 * dt;
      e.vz += Math.sin(e.wanderAngle) * e.speed * 0.4 * dt;
    }
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
