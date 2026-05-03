// Simulation Engine — v5: refactored for clarity, same behavior

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
  forageCooldown: number;
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
  survivalTime: number;
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
  heroId: number;
  alphaId: number;
  totalAmmoRemaining: number;
  starvingCount: number;
  chaosLevel: number;
  supplyCrates: SupplyCrate[];
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

export interface SupplyCrate {
  x: number;
  z: number;
  food: number;
  ammo: number;
  active: boolean;
  age: number;
  // Track which entities have collected from this crate
  collectedBy: number[];
}

// ============================================================
// CONSTANTS
// ============================================================

const MAP_HALF = 30;
const DAY_LENGTH = 30;
const SPAWN_ATTEMPT_LIMIT = 6000;
const INITIAL_ZOMBIE_COUNT = 2;
const INITIAL_SOLDIER_COUNT = 0; // rapid-response soldier — 0 for balance
const CIVILIAN_COUNT = 400;
const MAX_EVENTS = 150;
const MAX_HISTORY = 500;

// Speed
const CIVILIAN_SPEED_BASE = 3.2;
const CIVILIAN_SPEED_RANGE = 0.8;
const CIVILIAN_SPRINT_MULTIPLIER = 3.0;
const ZOMBIE_SPEED_BASE = 2.5;
const ZOMBIE_SPEED_RANGE = 1.0;
const ZOMBIE_SPEED_MULTIPLIER = 2.0;
const ZOMBIE_NIGHT_MULTIPLIER = 1.6;
const MILITARY_SPEED_BASE = 3.8;
const MILITARY_SPEED_RANGE = 0.5;
const ENTITY_SPEED_MAX_MULTIPLIER = 1.2;

// Sprint
const CIVILIAN_SPRINT_TIME_MIN = 2.0;
const CIVILIAN_SPRINT_TIME_RANGE = 2.0;
const CIVILIAN_SPRINT_FLEE_MULTIPLIER = 2.5;
const CIVILIAN_SPRINT_NORMAL_MULTIPLIER = 1.8;
const CIVILIAN_SPRINT_COOLDOWN_NORMAL = 3;
const CIVILIAN_SPRINT_COOLDOWN_RANGE = 2;
const CIVILIAN_SPRINT_COOLDOWN_HUNGRY = 6;
const CIVILIAN_SPRINT_COOLDOWN_HUNGRY_RANGE = 3;
const CIVILIAN_LAST_STAND_BURST = 0.5;

// Hunger / Fatigue
const CIVILIAN_HUNGER_RATE = 0.5;
const CIVILIAN_HIDE_HUNGER_BONUS = 0.08;
const CIVILIAN_FATIGUE_RATE = 0.15;
const CIVILIAN_SLEEP_FATIGUE_RECOVERY = 3.0;
const CIVILIAN_SLEEP_HUNGER_RATE = 0.1;
const STARVING_THRESHOLD = 25;
const STARVING_DEATH_THRESHOLD = -10;
const CIVILIAN_FORAGE_HUNGER_TRIGGER = 45;
const HUNGER_WANDER_SPEED_MULTIPLIER = 0.7;
const CIVILIAN_QUICK_SPRINT_MULTIPLIER = 3.0;
const CIVILIAN_CORNERED_SPRINT_MULTIPLIER = 3.0;

// Military
const MILITARY_HUNGER_RATE = 0.4;
const MILITARY_FATIGUE_RATE = 0.1;
const MILITARY_FATIGUE_RECOVERY = 1.0;
const MILITARY_RELOAD_TIME = 2.0;
const MILITARY_FULL_AMMO = 100;
const MILITARY_MAG_SIZE = 10;
const RESUPPLY_AMMO_THRESHOLD = 30;
const RESUPPLY_AMMO_AMOUNT = 60;
const RESUPPLY_FOOD_AMOUNT = 10;
const RESUPPLY_FOOD_MAX = 15;
const MILITARY_STARVE_THRESHOLD = -20;
const SOLDIER_HUNGER_FOOD_TAKE = 15;

// Combat
const ZOMBIE_ATTACK_COOLDOWN = 0.5;
const MILITARY_ATTACK_COOLDOWN = 0.3;
const MILITARY_AIM_TIME = 0.1;
const MILITARY_AIM_RANGE = 0.15;
const MILITARY_AIM_DRAG = 0.9;
const MILITARY_HIT_CHANCE_BASE = 88;
const MILITARY_HIT_CHANCE_DISTANCE_PENALTY = 1.2;
const MILITARY_HIT_CHANCE_MOVE_PENALTY = 10;
const MILITARY_HIT_CHANCE_MIN = 15;
const MILITARY_HIT_CHANCE_MAX = 92;
const MILITARY_OVERWHELM_RANGE = 3;
const MILITARY_OVERWHELM_COUNT = 4;
const MILITARY_ENGAGE_RANGE = 25;
const MILITARY_RETREAT_RANGE = 2;

// Zombie detection
const ZOMBIE_VISUAL_RANGE = 10;
const ZOMBIE_AUDIO_RANGE = 18;
const ZOMBIE_DETECT_RANGE_DAY = 14;
const ZOMBIE_DETECT_RANGE_NIGHT = 18;
const ZOMBIE_TARGET_CACHE_TICKS = 4;
const ZOMBIE_HORDE_MIN_COUNT = 3;
const ZOMBIE_HORDE_CLUSTER_RANGE = 5;
const ZOMBIE_ALERT_CASCADE_CHANCE = 0.08;
const ZOMBIE_ALERT_CASCADE_FACTOR = 0.6;

// Building
const BUILDING_BREACH_RANGE = 1.5;
const BUILDING_BREACH_FATIGUE_THRESHOLD = 60;
const BUILDING_BREACH_CHANCE = 0.3;
const HIDE_TIMER_BASE = 3;
const HIDE_TIMER_RANGE = 4;
const HIDE_TIMER_EXTRA = 6;
const SEEK_SHELTER_TIMER = 10;

// Turn timer
const TURN_TIMER_MIN = 8;
const TURN_TIMER_RANGE = 6;
const PANIC_TIMER_EXTRA = 2;

// Deployment
const DEPLOYMENT_TIMER = 6;
const DEPLOYMENT_INTERVAL = 3;
const DEPLOYMENT_INTERVAL_RANGE = 1;
const DEPLOY_WAVE_SIZE = 8; // soldiers per deployment wave
const RADIO_TIMER_INITIAL = 10;
const RADIO_TIMER_MIN = 8;
const RADIO_TIMER_RANGE = 10;

// Phase
const PHASE_RATIOS = [0.1, 0.4, 0.7, 0.9];

// Simulation
const NIGHT_TIME_START = 0.65;
const NIGHT_TIME_END = 0.08;
const INITIAL_TIME_OF_DAY = 0.08;
const INITAL_SPAWN_RADIUS = 6;
const MAP_EDGE_PADDING = 5;
const MILITARY_SPAWN_RADIUS_MIN = 24;
const MILITARY_SPAWN_RADIUS_RANGE = 4;
const HISTORY_INTERVAL = 1.5;
const RADIO_ZOMBIE_TRIGGER = 5;

// Entity physics
const IDLE_FRICTION = 0.92;
const SLEEP_FRICTION = 0.70;
const MAX_SPEED_CIV_FACTOR = 1.2;
const MAX_SPEED_ZOM_FACTOR = 2.0;
const MAP_BOUNDARY_MARGIN = 0.5;

// Chaos
const CHAOS_RATIO_WEIGHT = 60;
const CHAOS_DEAD_WEIGHT_HIGH = 20;
const CHAOS_DEAD_WEIGHT_LOW = 10;
const CHAOS_ZOMBIE_WEIGHT_HIGH = 20;
const CHAOS_ZOMBIE_WEIGHT_LOW = 10;
const CHAOS_DEAD_THRESHOLD = 50;
const CHAOS_DEAD_THRESHOLD_LOW = 20;
const CHAOS_ZOMBIE_THRESHOLD = 100;
const CHAOS_ZOMBIE_THRESHOLD_LOW = 50;
const CHAOS_ZOMBIE_CLEAR_THRESHOLD = 10;

// Military deployment thresholds
const DEPLOY_ZOMBIE_TIERS = [
  { min: 1, soldiers: 10 },
  { min: 3, soldiers: 20 },
  { min: 10, soldiers: 35 },
  { min: 25, soldiers: 50 },
  { min: 50, soldiers: 70 },
  { min: 100, soldiers: 100 },
  { min: 150, soldiers: 140 },
  { min: 250, soldiers: 180 },
  { min: 400, soldiers: 280 },
];
const DEPLOY_SOLDIER_FACTOR = 0.7;
const DEPLOY_SOLDIER_BASE = 10;

// Forage
const FORAGE_AMOUNT_MIN = 8;
const FORAGE_AMOUNT_RANGE = 10;
const FORAGE_TIMER_AFTER = 5;
const FORAGE_TIMER_RANGE_AFTER = 3;
const FOOD_REGAIN = 80;
const FOOD_PER_BITE = 5;

// ============================================================
// SCENARIO TEMPLATES
// ============================================================

const SCENARIOS: { name: string; text: string; type: SimEvent['type'] }[] = [
  { name: '☄️ Meteor Crash', text: 'A meteorite crashed in the city center, releasing a strange virus. The dead are rising.', type: 'warning' },
  { name: '🧪 Lab Leak', text: 'A pharmaceutical lab experienced a containment breach. An unknown pathogen is spreading.', type: 'warning' },
  { name: '🚢 Infected Cargo', text: 'A cargo ship docked carrying infected rats. The outbreak has begun in the port district.', type: 'warning' },
  { name: '🧬 Ancient Spores', text: 'Construction workers unearthed ancient fungal spores from permafrost. They reanimate dead tissue.', type: 'warning' },
  { name: '📡 Signal from Space', text: 'A strange signal from deep space corrupted the city\'s network. People exposed to screens turned violent.', type: 'warning' },
];

const PHASE_MESSAGES = [
  '📡 PHASE 1: Containment — outbreak localized.',
  '⚠️ PHASE 2: Spread — infection crossing containment zones.',
  '🚨 PHASE 3: Explosion — rapid transmission! City in chaos!',
  '🆘 PHASE 4: Collapse — civilization breaking down!',
  '☠️ PHASE 5: Extinction-level event imminent.',
];

// ============================================================
// HELPERS
// ============================================================

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Safe distance: returns at least 1 to avoid division by zero. */
function safeDist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return dist(a, b) || 1;
}

// ============================================================
// ENTITY FACTORY
// ============================================================

interface EntityConfig {
  type: EntityType;
  state: EntityState;
  hunger: number;
  fatigue: number;
  ammo: number;
  maxAmmo: number;
  magazineSize: number;
  ammoInMag: number;
  color: string;
  speed: number;
  maxSprintTime: number;
  squadId?: number | null;
}

const ENTITY_CONFIGS: Record<EntityType, () => EntityConfig> = {
  civilian: () => ({
    type: 'civilian',
    state: 'wandering',
    hunger: 60 + Math.random() * 40,
    fatigue: 0,
    ammo: 0,
    maxAmmo: 0,
    magazineSize: 0,
    ammoInMag: 0,
    color: '#4499ff',
    speed: CIVILIAN_SPEED_BASE + Math.random() * CIVILIAN_SPEED_RANGE,
    maxSprintTime: CIVILIAN_SPRINT_TIME_MIN + Math.random() * CIVILIAN_SPRINT_TIME_RANGE,
  }),
  zombie: () => ({
    type: 'zombie',
    state: 'hunting',
    hunger: 100,
    fatigue: 100,
    ammo: 0,
    maxAmmo: 0,
    magazineSize: 0,
    ammoInMag: 0,
    color: '#33ff33',
    speed: ZOMBIE_SPEED_BASE + Math.random() * ZOMBIE_SPEED_RANGE,
    maxSprintTime: 0,
  }),
  military: () => ({
    type: 'military',
    state: 'patrolling',
    hunger: 70 + Math.random() * 30,
    fatigue: 10,
    ammo: MILITARY_FULL_AMMO,
    maxAmmo: MILITARY_FULL_AMMO,
    magazineSize: MILITARY_MAG_SIZE,
    ammoInMag: MILITARY_MAG_SIZE,
    color: '#ff3333',
    speed: MILITARY_SPEED_BASE + Math.random() * MILITARY_SPEED_RANGE,
    maxSprintTime: 0,
  }),
};

function createEntity(
  x: number,
  z: number,
  type: EntityType,
  extra?: { squadId?: number },
): Entity {
  const config = ENTITY_CONFIGS[type]();
  return {
    id: 0, // assigned by caller
    x,
    z,
    vx: 0,
    vz: 0,
    hp: 1,
    maxHp: 1,
    isReloading: false,
    reloadTimer: 0,
    attackCooldown: 0,
    aimTimer: 0,
    targetId: null,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: type === 'civilian' ? Math.random() * 5 : 1,
    sleepTimer: 0,
    forageTimer: 0,
    forageCooldown: 0,
    buildingId: null,
    lastUpdateTime: 0,
    isAsleep: false,
    isPanicking: false,
    panicTimer: 0,
    squadId: extra?.squadId ?? null,
    isSquadLeader: false,
    kills: 0,
    hideTimer: 0,
    biteAttempts: 0,
    survivalTime: 0,
    zombieAge: 0,
    feedingTimer: 0,
    isAiming: false,
    alertTimer: 0,
    alertX: 0,
    alertZ: 0,
    turnTimer: 0,
    sprintTimer: 0,
    sprintCooldown: 0,
    ...config,
  };
}

// ============================================================
// SIMULATION CLASS
// ============================================================

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
  private deploymentTimer = DEPLOYMENT_TIMER;
  private radioTimer = RADIO_TIMER_INITIAL;
  private nextSquadId = 1;
  private hordeCenters: { x: number; z: number; count: number }[] = [];
  private lastHordeSurgeLevel = 0;
  private fireTimers: Map<number, { x: number; z: number; timeLeft: number }> = new Map();
  private helicopterTimer = 30 + Math.random() * 20;
  helicopterActive = false;
  helicopterSx = 0; helicopterSz = 0; helicopterEx = 0; helicopterEz = 0;
  helicopterX = 0; helicopterZ = 0; helicopterProgress = 0;
  private worldEventTimer = 15 + Math.random() * 15;
  private perimeterTimer = 10 + Math.random() * 5;
  private static WORLD_EVENTS = [
    '🛩️ A military cargo plane streaks overhead, contrails cutting the sky.',
    '💥 Distant explosion echoes through the city. Something big went down.',
    '📡 A shortwave broadcast crackles: "ANY SURVIVORS? ANYONE READING?"',
    '🔥 Smoke rises from a building in the eastern district.',
    '🎆 A signal flare arcs into the sky from somewhere in the city.',
    '📻 Radio intercept: "Convoy Alpha en route. ETA unknown. Stay alive."',
    '🌙 The moon breaks through the clouds, illuminating the streets below.',
  ];

  constructor() {
    this.map = generateWorld(Date.now());
    this.state = this.createInitialState(this.map);

    const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    this.logEvent(scenario.text, scenario.type);
    this.logEvent('🏙️ Population: 400. Military expected when outbreak escalates.', 'info');
  }

  // ─── INIT ───

  private generateMap(): WorldMap {
    return generateWorld(Date.now() + Math.floor(Math.random() * 99999));
  }

  private createInitialState(map: WorldMap): SimulationState {
    const entities: Entity[] = [];
    let spawned = 0;
    let attempts = 0;
    while (spawned < CIVILIAN_COUNT && attempts < SPAWN_ATTEMPT_LIMIT) {
      attempts++;
      const x = (Math.random() - 0.5) * (map.width - 10);
      const z = (Math.random() - 0.5) * (map.depth - 10);
      if (!isInsideBuilding(map.buildings, x, z)) {
        entities.push(this.makeEntity(x, z, 'civilian'));
        spawned++;
      }
    }

    for (let zi = 0; zi < INITIAL_ZOMBIE_COUNT; zi++) {
      const angle = Math.random() * Math.PI * 2;
      let zx = Math.cos(angle) * INITAL_SPAWN_RADIUS;
      let zz = Math.sin(angle) * INITAL_SPAWN_RADIUS;
      if (isInsideBuilding(map.buildings, zx, zz)) { zx -= 3; zz -= 3; }
      entities.push(this.makeEntity(zx, zz, 'zombie'));
    }

    // Rapid-response soldier(s) — disabled by default (set INITIAL_SOLDIER_COUNT > 0 to enable)
    for (let ri = 0; ri < INITIAL_SOLDIER_COUNT; ri++) {
      const sa = Math.random() * Math.PI * 2;
      const sr = 8 + Math.random() * 4;
      const sx = Math.cos(sa) * sr;
      const sz = Math.sin(sa) * sr;
      const squadId = this.nextSquadId++;
      entities.push(this.makeEntity(sx, sz, 'military', { squadId }));
    }

    return {
      entities,
      buildings: map.buildings,
      timeOfDay: INITIAL_TIME_OF_DAY,
      day: 1,
      totalTime: 0,
      stats: {
        civilians: CIVILIAN_COUNT,
        zombies: INITIAL_ZOMBIE_COUNT,
        military: INITIAL_SOLDIER_COUNT,
        zombiesKilledByMilitary: 0,
        civiliansTurned: 0,
        civiliansStarved: 0,
        dead: 0,
        totalBorn: 0,
        totalInfected: 0,
        totalKilled: 0,
        foodSupply: 100,
      },
      map,
      events: [],
      gameOver: false,
      gameOverReason: '',
      heroId: -1,
      alphaId: -1,
      totalAmmoRemaining: 0,
      starvingCount: 0,
      chaosLevel: 0,
      supplyCrates: [],
    };
  }

  private makeEntity(x: number, z: number, type: EntityType, extra?: { squadId?: number }): Entity {
    const e = createEntity(x, z, type, extra);
    e.id = this.nextId++;
    return e;
  }

  // ─── LOGGING ───

  private logEvent(text: string, type: SimEvent['type']): void {
    this.events.push({ time: this.state.totalTime, day: this.state.day, text, type });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  private logEventThrottled(text: string, type: SimEvent['type'], throttle: number = 3): void {
    if (this.state.totalTime - this.lastEventTime > throttle) {
      this.lastEventTime = this.state.totalTime;
      this.logEvent(text, type);
    }
  }

  private pushEvent(text: string, type: SimEvent['type']): void {
    this.state.events.push({ time: this.state.totalTime, day: this.state.day, text, type });
  }

  // ─── RESET ───

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
    this.radioTimer = RADIO_TIMER_INITIAL;
    this.perimeterTimer = 10 + Math.random() * 5;
    this.logEvent('🔄 New city generated. Outbreak unfolding...', 'warning');
    this.logEvent('🏙️ Population: 400. Good luck.', 'info');
  }

  // ════════════════════════════════════════════════════════════
  //  MAIN TICK
  // ════════════════════════════════════════════════════════════

  tick(dt: number): void {
    const s = this.state;
    if (s.gameOver) return;

    s.totalTime += dt;
    s.day = Math.floor(s.totalTime / DAY_LENGTH) + 1;
    s.timeOfDay = (s.totalTime % DAY_LENGTH) / DAY_LENGTH;

    const isNight = s.timeOfDay > NIGHT_TIME_START || s.timeOfDay < NIGHT_TIME_END;

    // Random world events
    this.worldEventTimer -= dt;
    if (this.worldEventTimer <= 0) {
      const eventText = Simulation.WORLD_EVENTS[Math.floor(Math.random() * Simulation.WORLD_EVENTS.length)];
      this.logEvent(eventText, 'info');
      this.worldEventTimer = 15 + Math.random() * 25;
    }

    // Supply drone drops
    this.updateSupplyCrates(dt);

    this.updatePhase();
    if (this.deploymentTimer > 0) this.deploymentTimer -= dt;
    this.deployMilitary();
    this.computeHordeCenters();
    this.updatePerimeterEvents(dt);

    // Increment survivalTime for all non-dead civilians
    for (const e of s.entities) {
      if (e.type === 'civilian' && e.state !== 'dead') {
        e.survivalTime += dt;
      }
    }

    this.processTurnTimers(dt);

    for (const e of s.entities) {
      if (e.state === 'dead') continue;
      this.updateEntity(e, dt, isNight);
      if (e.type === 'zombie') this.pushOutOfBuilding(e);
    }

    // Track hero (longest-surviving civilian) and alpha (most aggressive zombie)
    let bestCiv: Entity | null = null;
    let bestCivTime = -1;
    let bestZom: Entity | null = null;
    let bestZomBites = -1;
    for (const e of s.entities) {
      if (e.state === 'dead') continue;
      if (e.type === 'civilian' && e.survivalTime > bestCivTime) {
        bestCivTime = e.survivalTime;
        bestCiv = e;
      }
      if (e.type === 'zombie' && e.biteAttempts > bestZomBites) {
        bestZomBites = e.biteAttempts;
        bestZom = e;
      }
    }
    // Check if hero died
    const prevHero = s.heroId;
    if (prevHero !== -1 && (!bestCiv || bestCiv.id !== prevHero)) {
      // Hero died this tick — check if they went dead (still in array) or were removed
      const heroEntity = s.entities.find(e => e.id === prevHero);
      if (!heroEntity || heroEntity.state === 'dead') {
        const survivedFor = bestCivTime > 0 ? bestCivTime : (heroEntity?.survivalTime ?? 0);
        this.logEvent(`⭐ HERO CIVILIAN #${prevHero} HAS FALLEN! Their survival ends at ${survivedFor.toFixed(0)}s.`, 'death');
        this.pushEvent(`DRAMATIC:⭐ THE HERO HAS FALLEN`, 'info');
      }
    }
    // Check if alpha zombie died
    const prevAlpha = s.alphaId;
    if (prevAlpha !== -1 && (!bestZom || bestZom.id !== prevAlpha)) {
      const alphaEntity = s.entities.find(e => e.id === prevAlpha);
      if (!alphaEntity || alphaEntity.state === 'dead') {
        this.logEvent(`👑 ALPHA ZOMBIE #${prevAlpha} has been eliminated! (${bestZomBites} bites landed)`, 'military');
        this.pushEvent(`DRAMATIC:👑 ALPHA ZOMBIE ELIMINATED`, 'info');
      }
    }
    s.heroId = bestCiv ? bestCiv.id : -1;
    s.alphaId = bestZom ? bestZom.id : -1;

    s.entities = s.entities.filter(e => e.state !== 'dead');

    this.updateStats();
    this.updateHistory(dt);

    // Horde surge shockwaves
    this.checkHordeSurge();

    // Update building fires
    for (const [bId, fire] of this.fireTimers) {
      fire.timeLeft -= dt;
      if (fire.timeLeft <= 0) {
        this.fireTimers.delete(bId);
        this.pushEvent(`FIRE_STOP:${fire.x},${fire.z}`, 'info');
      } else {
        this.pushEvent(`FIRE_ACTIVE:${fire.x},${fire.z}`, 'warning');
      }
    }

    // Helicopter flyover
    this.updateHelicopter(dt, s);

    this.radioTimer -= dt;
    if (this.radioTimer <= 0 && s.stats.zombies > RADIO_ZOMBIE_TRIGGER) {
      this.radioTimer = RADIO_TIMER_MIN + Math.random() * RADIO_TIMER_RANGE;
      this.broadcastRadioMessage();
    }

    this.checkGameOver();
  }

  // ─── TURN TIMERS ───

  private processTurnTimers(dt: number): void {
    for (const e of this.state.entities) {
      if (e.type === 'civilian' && e.turnTimer > 0 && e.state !== 'dead') {
        e.turnTimer -= dt;
        if (e.turnTimer <= 0) {
          this.convertCivilianToZombie(e);
        } else {
          if (e.state !== 'fleeing') {
            e.state = 'fleeing';
            e.isPanicking = true;
            e.panicTimer = 6;
          }
        }
      }
    }
  }

  private convertCivilianToZombie(e: Entity): void {
    e.type = 'zombie';
    e.speed = ZOMBIE_SPEED_BASE + Math.random() * ZOMBIE_SPEED_RANGE;
    e.color = '#33ff33';
    e.state = 'hunting';
    e.isAsleep = false;
    e.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
    e.zombieAge = 0;
    e.buildingId = null;
    e.turnTimer = 0;
    this.state.stats.totalInfected++;
    this.state.stats.civiliansTurned++;
    this.logEventThrottled(`Civilian #${e.id} has turned into a zombie!`, 'zombie', 2);

    // Panic chain reaction: nearby civilians panic when someone dies/turns
    for (const n of this.state.entities) {
      if (n.type === 'civilian' && n.state !== 'dead' && n.id !== e.id) {
        if (dist(e, n) < 5) {
          n.isPanicking = true;
          n.panicTimer = Math.max(n.panicTimer, 3 + Math.random() * 2);
          if (n.state !== 'fleeing') n.state = 'fleeing';
        }
      }
    }
  }

  // ─── STATISTICS ───

  private updateStats(): void {
    const s = this.state;
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

    s.chaosLevel = this.computeChaosLevel(zomb, civ, mil);
  }

  private computeChaosLevel(zomb: number, civ: number, mil: number): number {
    if (zomb <= CHAOS_ZOMBIE_CLEAR_THRESHOLD) return 0;
    const ratioPart = (zomb / Math.max(1, civ + mil)) * CHAOS_RATIO_WEIGHT;
    const deadPart = this.state.stats.dead > CHAOS_DEAD_THRESHOLD ? CHAOS_DEAD_WEIGHT_HIGH
      : this.state.stats.dead > CHAOS_DEAD_THRESHOLD_LOW ? CHAOS_DEAD_WEIGHT_LOW : 0;
    const hordePart = zomb > CHAOS_ZOMBIE_THRESHOLD ? CHAOS_ZOMBIE_WEIGHT_HIGH
      : zomb > CHAOS_ZOMBIE_THRESHOLD_LOW ? CHAOS_ZOMBIE_WEIGHT_LOW : 0;
    return Math.min(100, Math.round(ratioPart + deadPart + hordePart));
  }

  private updateHistory(dt: number): void {
    this.historyTimer += dt;
    if (this.historyTimer > HISTORY_INTERVAL) {
      this.historyTimer = 0;
      const s = this.state;
      this.history.push({ day: s.day, civilians: s.stats.civilians, zombies: s.stats.zombies, military: s.stats.military });
      if (this.history.length > MAX_HISTORY) this.history.shift();
    }
  }

  // ─── GAME OVER ───

  private checkGameOver(): void {
    const s = this.state;
    const { civilians: civ, zombies: zomb } = s.stats;
    if (civ <= 0 && zomb > 0) {
      s.gameOver = true;
      s.gameOverReason = '💀 ALL CIVILIANS LOST. ZOMBIES WIN.';
      this.logEvent('☠️ GAME OVER — All civilians dead or turned. Zombies win.', 'death');
    } else if (civ <= 0 && zomb <= 0) {
      s.gameOver = true;
      s.gameOverReason = '💀 NO CIVILIANS SURVIVED.';
      this.logEvent('☠️ GAME OVER — No civilians remain.', 'death');
    } else if (zomb <= 0 && civ > 0) {
      s.gameOver = true;
      s.gameOverReason = '🎉 CITY SAVED! ZOMBIES ELIMINATED.';
      this.logEvent('✅ GAME OVER — Zombies eliminated! Civilians survive.', 'info');
    }
  }

  // ─── PHASE ───

  private updatePhase(): void {
    const s = this.state;
    const ratio = s.stats.civilians > 0 ? s.stats.zombies / (s.stats.civilians + s.stats.zombies) : 1;
    const newPhase = ratio < PHASE_RATIOS[0] ? 0
      : ratio < PHASE_RATIOS[1] ? 1
      : ratio < PHASE_RATIOS[2] ? 2
      : ratio < PHASE_RATIOS[3] ? 3
      : 4;
    if (newPhase !== this.outbreakPhase && s.day > this.lastPhaseCheck) {
      this.outbreakPhase = newPhase;
      this.lastPhaseCheck = s.day;
      if (newPhase >= 0 && newPhase < PHASE_MESSAGES.length) {
        this.logEvent(PHASE_MESSAGES[newPhase], 'warning');
        const descriptions = ['PHASE 1: Containing outbreak', 'PHASE 2: Infection spreading', 'PHASE 3: CITY IN CHAOS', 'PHASE 4: Civilisation failing', 'PHASE 5: EXTINCTION LEVEL'];
        this.pushEvent(`DRAMATIC:${descriptions[newPhase]}`, 'info');
      }
    }
  }

  // ─── RADIO ───

  private checkHordeSurge(): void {
    const s = this.state;
    const thresholds = [25, 50, 100, 200];
    for (const t of thresholds) {
      if (s.stats.zombies >= t && this.lastHordeSurgeLevel < t) {
        this.lastHordeSurgeLevel = t;
        // Find largest horde center
        let hx = 0, hz = 0, maxCount = 0;
        for (const hc of this.hordeCenters) {
          if (hc.count > maxCount) { maxCount = hc.count; hx = hc.x; hz = hc.z; }
        }
        if (maxCount === 0) {
          // Fallback: use center of map with some offset
          hx = (Math.random() - 0.5) * 10;
          hz = (Math.random() - 0.5) * 10;
        }
        const radius = Math.min(5 + t * 0.05, 15);
        this.pushEvent(`HORDE_SURGE:${hx},${hz},${radius}`, 'warning');
        // Threshold-specific messages
        const messages: Record<number, string> = {
          25: '⚠️ Zombie horde detected! 25 infected.',
          50: '🚨 HORDE GROWING! 50 zombies converging!',
          100: '💀 MEGA-HORDE! 100+ zombies sweeping through!',
          200: '☠️ APOCALYPSE HORDE! Over 200 zombies!',
        };
        this.logEvent(messages[t] || `${t} zombies detected!`, 'zombie');
        this.pushEvent(`DRAMATIC:→ ${t} ZOMBIES`, 'info');
      }
    }
    // Reset if zombies drop below threshold
    if (s.stats.zombies < 25) this.lastHordeSurgeLevel = 0;
  }

  private updateHelicopter(dt: number, s: SimulationState): void {
    this.helicopterTimer -= dt;
    if (this.helicopterTimer <= 0 && !this.helicopterActive) {
      this.helicopterTimer = 40 + Math.random() * 30;
      // Pick random flight path
      const mapSize = 35;
      const startEdge = Math.floor(Math.random() * 4);
      switch(startEdge) {
        case 0:
          this.helicopterSx = -mapSize; this.helicopterSz = -mapSize + Math.random() * mapSize * 2;
          this.helicopterEx = mapSize; this.helicopterEz = -mapSize + Math.random() * mapSize * 2;
          break;
        case 1:
          this.helicopterSx = -mapSize + Math.random() * mapSize * 2; this.helicopterSz = -mapSize;
          this.helicopterEx = -mapSize + Math.random() * mapSize * 2; this.helicopterEz = mapSize;
          break;
        case 2:
          this.helicopterSx = mapSize; this.helicopterSz = -mapSize + Math.random() * mapSize * 2;
          this.helicopterEx = -mapSize; this.helicopterEz = -mapSize + Math.random() * mapSize * 2;
          break;
        case 3:
          this.helicopterSx = -mapSize + Math.random() * mapSize * 2; this.helicopterSz = mapSize;
          this.helicopterEx = -mapSize + Math.random() * mapSize * 2; this.helicopterEz = -mapSize;
          break;
      }
      this.helicopterActive = true;
      this.helicopterProgress = 0;
      this.helicopterX = this.helicopterSx;
      this.helicopterZ = this.helicopterSz;
      this.pushEvent(`HELICOPTER:${this.helicopterSx},${this.helicopterSz},${this.helicopterEx},${this.helicopterEz}`, 'info');
      this.logEvent('🚁 Helicopter sweeping overhead. Rotor echoes through the streets.', 'info');
    }

    if (this.helicopterActive) {
      this.helicopterProgress += dt * 0.125; // complete over 8 seconds
      this.helicopterX = this.helicopterSx + (this.helicopterEx - this.helicopterSx) * this.helicopterProgress;
      this.helicopterZ = this.helicopterSz + (this.helicopterEz - this.helicopterSz) * this.helicopterProgress;

      // Alert zombies near the helicopter path
      for (const e of s.entities) {
        if (e.type === 'zombie' && e.state !== 'dead') {
          const d = Math.sqrt((e.x - this.helicopterX) ** 2 + (e.z - this.helicopterZ) ** 2);
          if (d < 8) {
            e.alertTimer = Math.max(e.alertTimer, 3);
          }
        }
      }

      if (this.helicopterProgress >= 1) {
        this.helicopterActive = false;
        this.helicopterProgress = 0;
      }
    }
  }

  private broadcastRadioMessage(): void {
    const { civilians: civ, zombies: zomb, military: mil } = this.state.stats;
    const ratio = civ > 0 ? zomb / (civ + 1) : 99;
    if (ratio > 2 && zomb > 30) {
      const panicMessages = [
        '📻 "⚠️ [HQ] OUTBREAK CRITICAL! Code Red! All personnel to defensive positions!"',
        '📻 "🚨 [HQ] Civilian casualties mounting! Requesting immediate air support!"',
        '📻 "☢️ [HQ] Contamination zone expanding! Evacuate all sectors!"',
        '📻 "💀 [HQ] We are losing control! This is not a drill!"',
      ];
      this.logEvent(panicMessages[Math.floor(Math.random() * panicMessages.length)], 'warning');
    } else if (ratio < 0.3 && mil > 0) {
      this.logEvent(
        ['📻 "[HQ] Infection rate slowing. Good work, soldiers."', '📻 "[HQ] Civilians report reduced zombie activity. Maintain vigilance."'][Math.floor(Math.random() * 2)],
        'info',
      );
    } else {
      const messages = [
        '📻 "[HQ] Situation report requested. Stay calm and seek shelter."',
        '📻 "[HQ] Evacuation routes are being established. Await further orders."',
        '📻 "[HQ] Civilians advised to stay indoors. Military units inbound."',
        '📻 "[HQ] Reports of infected spreading through the city center."',
        '📻 "[HQ] All units: contain the outbreak at all costs."',
        '📻 "[HQ] Rescue convoys delayed. Hold your positions."',
      ];
      this.logEvent(messages[Math.floor(Math.random() * messages.length)], 'info');
    }
  }

  // ════════════════════════════════════════════════════════════
  //  ENTITY UPDATE DISPATCHER
  // ════════════════════════════════════════════════════════════

  private updatePerimeterEvents(dt: number): void {
    const s = this.state;
    this.perimeterTimer -= dt;
    if (this.perimeterTimer <= 0 && s.stats.military > 5 && s.stats.zombies >= 5 && s.stats.zombies <= 60) {
      this.perimeterTimer = 10 + Math.random() * 5;

      // Find a squad to report from
      const soldiers = s.entities.filter(e => e.type === 'military' && e.state !== 'dead');
      if (soldiers.length > 0) {
        const sq = soldiers[Math.floor(Math.random() * soldiers.length)];
        const squadId = sq.squadId ?? Math.floor(Math.random() * 10) + 1;
        const messages = [
          `🎯 Squad #${squadId} holding position at grid (${sq.x.toFixed(0)}, ${sq.z.toFixed(0)}).`,          `🔫 Contact! Squad #${squadId} engaging zombie cluster at (${sq.x.toFixed(0)}, ${sq.z.toFixed(0)}).`,          `⚠️ Squad #${squadId} requesting fire support at (${sq.x.toFixed(0)}, ${sq.z.toFixed(0)}).`,        ];
        this.logEvent(messages[Math.floor(Math.random() * messages.length)], 'military');
      }
    }
  }

  private updateEntity(e: Entity, dt: number, isNight: boolean): void {
    switch (e.type) {
      case 'civilian': this.updateCivilian(e, dt, isNight); break;
      case 'zombie': this.updateZombie(e, dt, isNight); break;
      case 'military': this.updateMilitary(e, dt, isNight); break;
    }

    if (e.state !== 'dead') {
      this.applyMovement(e, dt);
    }
  }

  private applyMovement(e: Entity, dt: number): void {
    // Position integration
    e.x += e.vx * dt;
    e.z += e.vz * dt;

    // Boundary clamp
    const hw = this.state.map.width / 2 - MAP_BOUNDARY_MARGIN;
    const hd = this.state.map.depth / 2 - MAP_BOUNDARY_MARGIN;
    e.x = Math.max(-hw, Math.min(hw, e.x));
    e.z = Math.max(-hd, Math.min(hd, e.z));

    // Friction
    if (!e.isAsleep) { e.vx *= IDLE_FRICTION; e.vz *= IDLE_FRICTION; }
    else { e.vx *= SLEEP_FRICTION; e.vz *= SLEEP_FRICTION; }

    // Speed cap
    const speedMul = e.type === 'zombie' ? MAX_SPEED_ZOM_FACTOR : MAX_SPEED_CIV_FACTOR;
    let maxSpeed = e.isAsleep ? 0.1 : e.speed * speedMul;
    if (e.type === 'civilian' && e.sprintTimer > 0) maxSpeed = e.speed * CIVILIAN_QUICK_SPRINT_MULTIPLIER;
    const spd = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
    if (spd > maxSpeed) { e.vx = (e.vx / spd) * maxSpeed; e.vz = (e.vz / spd) * maxSpeed; }
  }

  // ════════════════════════════════════════════════════════════
  //  CIVILIAN AI
  // ════════════════════════════════════════════════════════════

  private updateCivilian(e: Entity, dt: number, isNight: boolean): void {
    if (this.handleCivilianStarvation(e, dt)) return;
    this.handleCivilianFatigueHunger(e, dt);
    if (this.handleCivilianNightShelter(e, dt, isNight)) return;
    if (e.isAsleep) { this.updateAsleepCivilian(e, dt); return; }
    if (this.handleCivilianDaytimeShelter(e, dt)) return;

    const nearestZ = this.handleCivilianZombieDetection(e, isNight, dt);
    if (nearestZ) {
      const zDist = dist(e, nearestZ);
      this.handleCivilianSprint(e, nearestZ, zDist, dt);
    }

    switch (e.state) {
      case 'hiding': this.updateHidingCivilian(e, dt, nearestZ); break;
      case 'fleeing': this.updateFleeingCivilian(e, dt, nearestZ); break;
      case 'starving': this.updateStarvingCivilian(e, dt); break;
      case 'foraging': this.updateForagingCivilian(e, dt); break;
      case 'seeking_shelter': this.updateSeekingShelterCivilian(e, dt); break;
      case 'wandering': default: this.updateWanderingCivilian(e, dt); break;
    }
  }

  private handleCivilianStarvation(e: Entity, dt: number): boolean {
    if (e.hunger < STARVING_THRESHOLD && e.state !== 'starving' && e.state !== 'dead') {
      e.state = 'starving';
    }
    if (e.hunger <= STARVING_DEATH_THRESHOLD) {
      e.state = 'dead';
      this.state.stats.civiliansStarved++;
      this.pushEvent(`CORPSE:${e.x},${e.z}`, 'death');

      // Panic chain reaction: nearby civilians panic when someone starves to death
      for (const n of this.state.entities) {
        if (n.type === 'civilian' && n.state !== 'dead' && n.id !== e.id) {
          if (dist(e, n) < 8) {
            n.isPanicking = true;
            n.panicTimer = Math.max(n.panicTimer, 3 + Math.random() * 2);
            if (n.state !== 'fleeing') n.state = 'fleeing';
          }
        }
      }

      return true;
    }
    return false;
  }

  private handleCivilianFatigueHunger(e: Entity, dt: number): void {
    const fearHunger = e.state === 'hiding' ? CIVILIAN_HIDE_HUNGER_BONUS : 0;
    e.hunger -= (CIVILIAN_HUNGER_RATE + fearHunger) * dt;
    e.fatigue += CIVILIAN_FATIGUE_RATE * dt;
  }

  private handleCivilianNightShelter(e: Entity, dt: number, isNight: boolean): boolean {
    if (!isNight || e.fatigue <= 60) return false;
    if (e.state === 'starving' || e.state === 'fleeing' || e.state === 'hiding') return false;

    if (e.state !== 'seeking_shelter' && !e.isAsleep) {
      const tb = findNearestBuilding(this.state.buildings, e.x, e.z);
      if (tb) {
        e.state = 'seeking_shelter';
        e.buildingId = tb.id;
        e.wanderTimer = SEEK_SHELTER_TIMER;
      } else {
        this.putToSleep(e);
      }
      return true;
    }

    if (e.state === 'seeking_shelter') {
      return this.moveToBuildingAndSleep(e, dt);
    }
    return false;
  }

  private moveToBuildingAndSleep(e: Entity, dt: number): boolean {
    const tb = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
    e.wanderTimer -= dt;
    if (e.wanderTimer <= 0) { this.putToSleep(e); return true; }
    if (tb) {
      if (dist(e, tb) < 1) { this.enterBuildingAndSleep(e, tb); return true; }
      const d = safeDist(e, tb);
      e.vx += ((tb.x - e.x) / d) * e.speed * dt * 0.4;
      e.vz += ((tb.z - e.z) / d) * e.speed * dt * 0.4;
      return true;
    }
    this.putToSleep(e);
    return true;
  }

  private enterBuildingAndSleep(e: Entity, b: Building): void {
    e.buildingId = b.id;
    e.isAsleep = true;
    e.state = 'sleeping';
    e.vx = 0;
    e.vz = 0;
  }

  private putToSleep(e: Entity): void {
    e.isAsleep = true;
    e.state = 'sleeping';
    e.vx = 0;
    e.vz = 0;
  }

  private updateAsleepCivilian(e: Entity, dt: number): void {
    e.fatigue -= CIVILIAN_SLEEP_FATIGUE_RECOVERY * dt;
    e.hunger -= CIVILIAN_SLEEP_HUNGER_RATE * dt;
    if (e.fatigue <= 0) {
      e.fatigue = 0;
      e.isAsleep = false;
      e.state = 'wandering';
      e.buildingId = null;
    }
  }

  private handleCivilianDaytimeShelter(e: Entity, dt: number): boolean {
    if (e.state !== 'seeking_shelter') return false;
    const tb = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
    if (tb) {
      if (dist(e, tb) < 1) {
        e.buildingId = tb.id;
        e.state = 'hiding';
        e.hideTimer = HIDE_TIMER_BASE + Math.random() * HIDE_TIMER_EXTRA;
        e.vx = 0;
        e.vz = 0;
        return true;
      }
      const d = safeDist(e, tb);
      e.vx += ((tb.x - e.x) / d) * e.speed * dt * 0.4;
      e.vz += ((tb.z - e.z) / d) * e.speed * dt * 0.4;
      return true;
    }
    e.state = 'wandering';
    e.buildingId = null;
    return false;
  }

  private handleCivilianZombieDetection(e: Entity, isNight: boolean, dt: number): Entity | null {
    const detectRange = isNight ? ZOMBIE_DETECT_RANGE_NIGHT : ZOMBIE_DETECT_RANGE_DAY;
    const nearestZ = this.findNearest(e, detectRange, 'zombie');
    if (!nearestZ) return null;

    const zDist = dist(e, nearestZ);

    if (zDist < 8) {
      e.state = 'fleeing';
      e.isPanicking = true;
      e.panicTimer = 4 + Math.random() * 2;
      e.buildingId = null;
    }

    if (zDist < 5 && e.state !== 'hiding') {
      const building = isInsideBuilding(this.state.buildings, e.x, e.z, 0.5);
      if (!building) {
        const tb = findNearestBuilding(this.state.buildings, e.x, e.z);
        if (tb && dist(e, tb) < 4) {
          e.state = 'fleeing';
          e.isPanicking = true;
          e.panicTimer = 5;
        }
      } else {
        e.state = 'hiding';
        e.hideTimer = HIDE_TIMER_BASE + Math.random() * HIDE_TIMER_RANGE;
        e.vx = 0;
        e.vz = 0;
      }
    }

    if (nearestZ && zDist < 18 && e.hunger >= STARVING_THRESHOLD && e.state !== 'hiding' && e.state !== 'fleeing') {
      let zN = 0, aN = 0;
      for (const o of this.state.entities) {
        if (o.id === e.id || o.state === 'dead') continue;
        if (dist(e, o) > 18) continue;
        o.type === 'zombie' ? zN++ : (o.type === 'civilian' || o.type === 'military') ? aN++ : 0;
      }
      if (zN > aN) {
        const tb = findNearestBuilding(this.state.buildings, e.x, e.z);
        if (tb) { e.state = 'seeking_shelter'; e.buildingId = tb.id; }
      }
    }

    return nearestZ;
  }

  private handleCivilianSprint(e: Entity, nearestZ: Entity, zDist: number, dt: number): void {
    if (e.sprintCooldown > 0) e.sprintCooldown -= dt;
    if (nearestZ && zDist < 14 && e.sprintCooldown <= 0 && e.sprintTimer <= 0) {
      const hungerPenalty = e.hunger < STARVING_THRESHOLD ? 0.5 : 0;
      e.sprintTimer = e.maxSprintTime * (1 - hungerPenalty);
    }
    if (e.sprintTimer > 0) {
      e.sprintTimer -= dt;
      if (e.sprintTimer <= 0) {
        e.sprintTimer = 0;
        e.sprintCooldown = e.hunger < STARVING_THRESHOLD
          ? CIVILIAN_SPRINT_COOLDOWN_HUNGRY + Math.random() * CIVILIAN_SPRINT_COOLDOWN_HUNGRY_RANGE
          : CIVILIAN_SPRINT_COOLDOWN_NORMAL + Math.random() * CIVILIAN_SPRINT_COOLDOWN_RANGE;
      }
    }
  }

  // ─── CIVILIAN STATE ACTIONS ───

  private updateHidingCivilian(e: Entity, dt: number, nearestZ: Entity | null): void {
    e.vx = 0;
    e.vz = 0;
    e.hideTimer -= dt;
    const forced = e.hunger < STARVING_THRESHOLD;
    if (e.hideTimer <= 0 || forced || !nearestZ || dist(e, nearestZ) > 14) {
      e.state = 'wandering';
      if (nearestZ) {
        const d = safeDist(e, nearestZ);
        e.wanderAngle = Math.atan2(e.z - nearestZ.z, e.x - nearestZ.x) + (Math.random() - 0.5) * 1.0;
      } else {
        e.wanderAngle = Math.random() * Math.PI * 2;
      }
      e.wanderTimer = 1.5;
    }
  }

  private updateFleeingCivilian(e: Entity, dt: number, nearestZ: Entity | null): void {
    const z = this.findNearest(e, 25, 'zombie');
    if (!z) {
      e.panicTimer -= dt;
      if (e.panicTimer <= 0) { e.isPanicking = false; e.state = 'wandering'; }
      return;
    }

    const d = dist(e, z);
    if (d < 1.3) {
      if (this.handleCorneredCivilian(e, z, dt)) return;
    }

    const len = safeDist(e, z);
    let fleeAngle = Math.atan2(e.z - z.z, e.x - z.x);

    // Herd toward allies
    fleeAngle = this.blendFleeAngleWithAllies(e, fleeAngle);

    // Blend toward military
    const mil = this.findNearest(e, 25, 'military');
    if (mil && dist(e, mil) < 20) {
      fleeAngle = fleeAngle * 0.8 + Math.atan2(mil.z - e.z, mil.x - e.x) * 0.2;
    }

    const jitter = (Math.random() - 0.5) * 1.2;
    const mul = e.sprintTimer > 0 ? CIVILIAN_SPRINT_FLEE_MULTIPLIER : CIVILIAN_SPRINT_NORMAL_MULTIPLIER;
    const spd = e.speed * mul;
    e.vx += Math.cos(fleeAngle + jitter) * spd * dt * 0.5;
    e.vz += Math.sin(fleeAngle + jitter) * spd * dt * 0.5;

    e.panicTimer -= dt;
    const zFar = this.findNearest(e, 18, 'zombie');
    if (e.panicTimer <= 0 && (!zFar || dist(e, zFar) > 18)) {
      e.isPanicking = false;
      e.state = 'wandering';
    }
  }

  private blendFleeAngleWithAllies(e: Entity, fleeAngle: number): number {
    const ally = this.findNearest(e, 15, 'civilian');
    if (ally && dist(e, ally) > 2) {
      fleeAngle = fleeAngle * 0.5 + Math.atan2(ally.z - e.z, ally.x - e.x) * 0.5;
      const ally2 = this.findNearest(ally, 12, 'civilian');
      if (ally2 && ally2.id !== e.id && dist(e, ally2) > 3) {
        const midX = (ally.x + ally2.x) / 2;
        const midZ = (ally.z + ally2.z) / 2;
        fleeAngle = fleeAngle * 0.8 + Math.atan2(midZ - e.z, midX - e.x) * 0.2;
      }
    }
    return fleeAngle;
  }

  private handleCorneredCivilian(e: Entity, z: Entity, dt: number): boolean {
    // Already turning — desperation shove to create distance
    if (e.turnTimer > 0) {
      z.vx += (e.x - z.x) * 0.5;
      z.vz += (e.z - z.z) * 0.5;
      e.state = 'fleeing';
      e.isPanicking = true;
      e.panicTimer = 3;
      const len = safeDist(e, z);
      e.vx += ((e.x - z.x) / len) * e.speed * CIVILIAN_LAST_STAND_BURST * 3.0 * dt;
      e.vz += ((e.z - z.z) / len) * e.speed * CIVILIAN_LAST_STAND_BURST * 3.0 * dt;
      return true;
    }

    // Last-stand shove for unbitten cornered civilians
    if (e.sprintTimer <= 0 && e.sprintCooldown <= 0) {
      z.vx += (e.x - z.x) * 0.3;
      z.vz += (e.z - z.z) * 0.3;
      e.sprintTimer = CIVILIAN_LAST_STAND_BURST;
      const len = safeDist(e, z);
      e.vx += ((e.x - z.x) / len) * e.speed * CIVILIAN_LAST_STAND_BURST * 3.0 * dt;
      e.vz += ((e.z - z.z) / len) * e.speed * CIVILIAN_LAST_STAND_BURST * 3.0 * dt;
      this.logEventThrottled(`Civilian #${e.id} shoved a zombie back!`, 'zombie', 5);
      return true;
    }

    // Bitten! Start turn timer
    e.turnTimer = TURN_TIMER_MIN + Math.random() * TURN_TIMER_RANGE;
    e.state = 'fleeing';
    e.isPanicking = true;
    e.panicTimer = e.turnTimer + PANIC_TIMER_EXTRA;
    this.logEventThrottled(`Civilian #${e.id} was bitten and is turning!`, 'zombie', 2);
    this.alertNearbyZombies(z, e, 12);
    return true;
  }

  private updateStarvingCivilian(e: Entity, dt: number): void {
    e.wanderTimer -= dt;
    const fb = this.findNearestFoodBuilding(e.x, e.z);
    if (fb && dist(e, fb) < 1.5) {
      fb.food -= FOOD_PER_BITE;
      e.hunger = FOOD_REGAIN;
      e.state = 'wandering';
      this.logEventThrottled(`Civilian #${e.id} found food.`, 'info', 5);
      e.buildingId = null;
      e.wanderAngle = Math.random() * Math.PI * 2;
      e.forageTimer = FORAGE_TIMER_AFTER + Math.random() * FORAGE_TIMER_RANGE_AFTER;
      e.vx *= 0.8;
      e.vz *= 0.8;
    } else if (fb) {
      const zn = this.findNearest(e, 8, 'zombie');
      if (zn && dist(e, zn) < 4) {
        const d = safeDist(e, zn);
        e.vx += ((e.x - zn.x) / d) * e.speed * 2.0 * dt;
        e.vz += ((e.z - zn.z) / d) * e.speed * 2.0 * dt;
      } else {
        const d = safeDist(e, fb);
        e.vx += ((fb.x - e.x) / d) * e.speed * 0.5 * dt;
        e.vz += ((fb.z - e.z) / d) * e.speed * 0.5 * dt;
      }
    } else {
      this.wanderRandomly(e, dt, 0.5, 1 + Math.random() * 2);
    }
  }

  private updateForagingCivilian(e: Entity, dt: number): void {
    e.forageTimer -= dt;
    e.vx *= 0.9;
    e.vz *= 0.9;
    const zn = this.findNearest(e, 8, 'zombie');
    if (zn && dist(e, zn) < 5) {
      e.state = 'fleeing';
      e.isPanicking = true;
      e.panicTimer = 4 + Math.random() * 2;
      return;
    }
    if (e.forageTimer <= 0) {
      if (e.buildingId !== null) {
        const b = this.state.buildings.find(b => b.id === e.buildingId);
        if (b && b.food > 0) {
          const f = Math.min(b.food, FORAGE_AMOUNT_MIN + Math.floor(Math.random() * FORAGE_AMOUNT_RANGE));
          b.food -= f;
          e.hunger = Math.min(100, e.hunger + f);
        }
      }
      e.state = 'wandering';
      e.buildingId = null;
      e.wanderAngle = Math.random() * Math.PI * 2;
      e.forageTimer = FORAGE_TIMER_AFTER + Math.random() * FORAGE_TIMER_RANGE_AFTER;
    }
  }

  private updateSeekingShelterCivilian(e: Entity, dt: number): void {
    const tb = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
    if (tb) {
      if (dist(e, tb) < 1) {
        e.buildingId = tb.id;
        e.state = 'hiding';
        e.hideTimer = HIDE_TIMER_BASE + Math.random() * HIDE_TIMER_EXTRA;
        e.vx = 0;
        e.vz = 0;
        return;
      }
      const d = safeDist(e, tb);
      e.vx += ((tb.x - e.x) / d) * e.speed * dt * 0.4;
      e.vz += ((tb.z - e.z) / d) * e.speed * dt * 0.4;
      return;
    }
    e.state = 'wandering';
    e.buildingId = null;
    this.wanderRandomly(e, dt, 0.25, 2 + Math.random() * 5);
  }

  private updateWanderingCivilian(e: Entity, dt: number): void {
    e.wanderTimer -= dt;

    // Gentle group cohesion
    if (e.wanderTimer < 2 && Math.random() < 0.02) {
      const nearby = this.findNearest(e, 10, 'civilian');
      if (nearby && dist(e, nearby) > 4) {
        const d = safeDist(e, nearby);
        e.vx += ((nearby.x - e.x) / d) * e.speed * 0.05 * dt;
        e.vz += ((nearby.z - e.z) / d) * e.speed * 0.05 * dt;
      }
    }

    // Forage when hungry
    if (e.hunger < CIVILIAN_FORAGE_HUNGER_TRIGGER && e.forageCooldown <= 0) {
      const fb = this.findNearestFoodBuilding(e.x, e.z);
      if (fb && fb.food > 0) {
        const nearZomb = this.findNearest(e, 12, 'zombie');
        if (!nearZomb || dist(e, nearZomb) > 6) {
          e.wanderAngle = Math.atan2(fb.z - e.z, fb.x - e.x);
          e.wanderTimer = Math.max(2, dist(e, fb) / (e.speed * 0.8));
          e.state = 'foraging';
          e.buildingId = fb.id;
          e.forageTimer = e.wanderTimer + 2;
          return;
        } else {
          const d = safeDist(e, nearZomb);
          e.wanderAngle = Math.atan2(e.z - nearZomb.z, e.x - nearZomb.x) + (Math.random() - 0.5) * 0.5;
          e.wanderTimer = 1 + Math.random() * 2;
        }
      }
    }

    this.wanderRandomly(e, dt, e.hunger < 20 ? HUNGER_WANDER_SPEED_MULTIPLIER : 1.0, 2 + Math.random() * 5);
  }

  private wanderRandomly(e: Entity, dt: number, speedMul: number, wanderInterval: number): void {
    if (e.wanderTimer <= 0) {
      e.wanderAngle = Math.random() * Math.PI * 2;
      e.wanderTimer = wanderInterval;
    }
    const spd = e.speed * speedMul;
    e.vx += Math.cos(e.wanderAngle) * spd * dt * 0.25;
    e.vz += Math.sin(e.wanderAngle) * spd * dt * 0.25;
  }

  // ════════════════════════════════════════════════════════════
  //  ZOMBIE AI
  // ════════════════════════════════════════════════════════════

  private updateZombie(e: Entity, dt: number, isNight: boolean): void {
    e.attackCooldown -= dt;
    e.zombieAge += dt;
    if (e.alertTimer > 0) e.alertTimer -= dt;

    if (e.state === 'feeding') {
      e.feedingTimer -= dt;
      e.vx *= 0.85;
      e.vz *= 0.85;
      if (e.feedingTimer <= 0) e.state = 'hunting';
      return;
    }

    const nightMul = isNight ? ZOMBIE_NIGHT_MULTIPLIER : 1.0;
    const best = this.findZombieTarget(e);

    // Last known position search
    if (this.handleAlertedSearch(e, dt, nightMul, best)) return;

    // Horde magnetism
    this.applyHordePull(e, dt, nightMul, best);

    // Horde drift: zombies in large groups move toward population centers
    this.applyHordeDrift(e, dt, nightMul);

    if (!best) {
      this.wanderZombie(e, dt, nightMul);
      return;
    }

    const d = dist(e, best);

    // Building breach check
    this.checkBuildingBreach(e, dt, d);

    // Attack or pursue
    this.attackOrPursueZombie(e, best, d, dt, nightMul);
  }

  private findZombieTarget(e: Entity): Entity | null {
    const range = e.alertTimer > 0 ? ZOMBIE_AUDIO_RANGE : ZOMBIE_VISUAL_RANGE;
    let best: Entity | null = null;
    let bestD = range;

    // Try cached target
    if (e.targetId !== null && (Math.floor(e.zombieAge) % ZOMBIE_TARGET_CACHE_TICKS !== 0 || e.alertTimer > 0)) {
      const cached = this.state.entities.find(o => o.id === e.targetId);
      if (cached && cached.state !== 'dead' && cached.type !== 'zombie' && dist(e, cached) < range) {
        const cd = dist(e, cached);
        if (cd < 4 || e.alertTimer > 0 || this.hasClearShot(e, cached)) {
          best = cached;
          bestD = cd;
        }
      }
    }

    // Full scan — original behavior: always search when no cached target
    if (!best && (Math.floor(e.zombieAge) % ZOMBIE_TARGET_CACHE_TICKS === 0 || e.alertTimer > 0 || !best)) {
      for (const o of this.state.entities) {
        if (o.id === e.id || o.state === 'dead') continue;
        if (o.type !== 'civilian' && o.type !== 'military') continue;
        if (o.type === 'civilian' && o.buildingId !== null &&
            (o.state === 'hiding' || o.state === 'sleeping' || o.state === 'seeking_shelter' || o.state === 'foraging')) continue;
        const d = dist(e, o);
        if (d < bestD) {
          if (d < 4 || e.alertTimer > 0 || this.hasClearShot(e, o)) {
            bestD = d;
            best = o;
            if (d < 1.5) break;
          }
        }
      }
    }

    if (best) {
      e.targetId = best.id;
      e.alertX = best.x;
      e.alertZ = best.z;
      if (e.alertTimer <= 0 || !this.hasClearShot(e, best)) e.alertTimer = 2;
    }

    return best;
  }

  private handleAlertedSearch(e: Entity, dt: number, nightMul: number, best: Entity | null): boolean {
    if (e.alertTimer > 0 && !best) {
      const d = Math.sqrt((e.alertX - e.x) ** 2 + (e.alertZ - e.z) ** 2);
      if (d > 1) {
        const a = Math.atan2(e.alertZ - e.z, e.alertX - e.x) + (Math.random() - 0.5) * 0.3;
        e.vx += Math.cos(a) * e.speed * nightMul * 0.35 * dt;
        e.vz += Math.sin(a) * e.speed * nightMul * 0.35 * dt;
        e.state = 'hunting';
        return true;
      }
    }
    return false;
  }

  private applyHordePull(e: Entity, dt: number, nightMul: number, best: Entity | null): void {
    if (this.hordeCenters.length > 0 && !best) {
      const nh = this.hordeCenters.reduce((a, b) => dist(e, { x: a.x, z: a.z }) < dist(e, { x: b.x, z: b.z }) ? a : b);
      if (nh.count >= ZOMBIE_HORDE_MIN_COUNT) {
        const d = Math.sqrt((nh.x - e.x) ** 2 + (nh.z - e.z) ** 2) || 1;
        e.vx += ((nh.x - e.x) / d) * e.speed * nightMul * 0.15 * dt;
        e.vz += ((nh.z - e.z) / d) * e.speed * nightMul * 0.15 * dt;
      }
    }
  }

  private applyHordeDrift(_e: Entity, _dt: number, _nightMul: number): void {
    // Drift disabled — existing applyHordePull provides sufficient clustering
  }

  private wanderZombie(e: Entity, dt: number, nightMul: number): void {
    e.wanderTimer -= dt;
    if (e.wanderTimer <= 0) {
      e.wanderAngle = Math.random() * Math.PI * 2;
      e.wanderTimer = 2 + Math.random() * 3;
    }
    const spd = e.speed * nightMul * (0.25 + Math.random() * 0.15);
    e.vx += Math.cos(e.wanderAngle) * spd * dt;
    e.vz += Math.sin(e.wanderAngle) * spd * dt;
    e.state = 'hunting';
  }

  private checkBuildingBreach(e: Entity, dt: number, d: number): void {
    if (d <= 1.3 || d >= 4) return;
    const nearBldg = isInsideBuilding(this.state.buildings, e.x, e.z, BUILDING_BREACH_RANGE);
    if (!nearBldg) return;

    const occupants = this.state.entities.filter(o =>
      o.type === 'civilian' && o.buildingId === nearBldg.id && o.state !== 'dead'
    );
    if (occupants.length > 0) {
      e.fatigue -= dt;
      if (e.fatigue <= BUILDING_BREACH_FATIGUE_THRESHOLD && Math.random() < dt * 0.3) {
        this.breachBuilding(e, nearBldg, occupants);
      }
    } else {
      e.fatigue = Math.min(100, e.fatigue + dt * 2);
    }
  }

  private breachBuilding(e: Entity, b: Building, occupants: Entity[]): void {
    for (const oc of occupants) {
      oc.buildingId = null;
      oc.state = 'fleeing';
      oc.isPanicking = true;
      oc.panicTimer = 6 + Math.random() * 4;
      if (Math.random() < BUILDING_BREACH_CHANCE) {
        oc.turnTimer = TURN_TIMER_MIN + Math.random() * TURN_TIMER_RANGE;
        this.state.stats.totalInfected++;
        this.state.stats.civiliansTurned++;
      }
    }
    e.fatigue = 100;
    this.logEvent(`💥 Zombies breached building #${b.id}!`, 'zombie');
    this.pushEvent(`BREACH_FIRE:${b.x},${b.z}`, 'warning');
    // Start persistent building fire
    if (!this.fireTimers.has(b.id)) {
      this.fireTimers.set(b.id, { x: b.x, z: b.z, timeLeft: 60 });
      this.pushEvent(`FIRE_START:${b.x},${b.z}`, 'warning');
    }
  }

  private attackOrPursueZombie(e: Entity, best: Entity, d: number, dt: number, nightMul: number): void {
    if (d < 1.3) {
      e.state = 'attacking';
      e.vx *= 0.85;
      e.vz *= 0.85;
      if (e.attackCooldown <= 0) {
        e.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
        if (best.type === 'civilian' && best.buildingId !== null &&
            (best.state === 'hiding' || best.state === 'sleeping' || best.state === 'seeking_shelter')) {
          e.state = 'hunting';
          e.targetId = null;
          const d2 = safeDist(e, best);
          e.wanderAngle = Math.atan2(e.z - best.z, e.x - best.x);
          e.wanderTimer = 1.5;
          return;
        }
        if (best.type === 'civilian') {
          if (best.turnTimer > 0) {
            // Already turning — immediately hunt next target instead of wandering
            e.state = 'hunting';
            e.targetId = null;
            e.wanderTimer = 0;
            return;
          }
          best.turnTimer = TURN_TIMER_MIN + Math.random() * TURN_TIMER_RANGE;
          best.state = 'fleeing';
          best.isPanicking = true;
          best.panicTimer = best.turnTimer + PANIC_TIMER_EXTRA;
          e.biteAttempts++;
          e.state = 'hunting';
          e.targetId = null;
          this.alertNearbyZombies(e, best, 12);
          this.logEventThrottled(`Zombie bit civilian #${best.id}!`, 'zombie', 2);
        } else if (best.type === 'military') {
          best.state = 'dead';
          this.logEvent(`Military unit #${best.id} killed by zombie.`, 'death');
        }
      }
    } else {
      const len = safeDist(e, best);
      const a = Math.atan2(best.z - e.z, best.x - e.x) + (Math.random() - 0.5) * 0.4;
      const spd = e.speed * 1.5 * nightMul * (d < 5 ? 2.0 : 1.0);
      e.vx += Math.cos(a) * spd * dt * 0.4;
      e.vz += Math.sin(a) * spd * dt * 0.4;
      e.state = 'hunting';
    }
  }

  private alertNearbyZombies(src: Entity, target: Entity, range: number): void {
    for (const z of this.state.entities) {
      if (z.id === src.id || z.type !== 'zombie' || z.state === 'dead') continue;
      if (dist(z, src) < range) {
        z.alertTimer = 4;
        z.alertX = target.x;
        z.alertZ = target.z;
        if (Math.random() < ZOMBIE_ALERT_CASCADE_CHANCE) {
          const cascadeRange = range * ZOMBIE_ALERT_CASCADE_FACTOR;
          for (const z2 of this.state.entities) {
            if (z2.id === z.id || z2.type !== 'zombie' || z2.state === 'dead') continue;
            if (dist(z2, z) < cascadeRange) {
              z2.alertTimer = 4;
              z2.alertX = target.x;
              z2.alertZ = target.z;
            }
          }
          this.pushEvent(`ALERT_RING:${z.x},${z.z},${cascadeRange}`, 'warning');
        }
      }
    }
    this.pushEvent(`ALERT_RING:${target.x},${target.z},${range}`, 'warning');
  }

  // ════════════════════════════════════════════════════════════
  //  MILITARY AI
  // ════════════════════════════════════════════════════════════

  private updateMilitary(e: Entity, dt: number, isNight: boolean): void {
    if (this.handleMilitaryStarvation(e, dt)) return;
    this.handleMilitaryFatigue(e, dt);
    if (this.handleMilitaryReload(e)) return;
    if (this.handleMilitaryResupply(e, dt)) return;
    this.handleMilitaryHunger(e, dt);

    // Overwhelm check
    if (this.checkMilitaryOverwhelm(e)) return;

    // Squad cohesion
    this.applySquadCohesion(e, dt);

    // Combat or patrol
    const nearZ = this.findNearest(e, MILITARY_ENGAGE_RANGE, 'zombie');
    if (nearZ) {
      this.handleMilitaryCombat(e, nearZ, dt);
    } else {
      this.handleMilitaryPatrol(e, dt);
    }
  }

  private handleMilitaryStarvation(e: Entity, dt: number): boolean {
    e.hunger -= MILITARY_HUNGER_RATE * dt;
    if (e.hunger <= MILITARY_STARVE_THRESHOLD) {
      e.state = 'dead';
      this.logEvent(`Military unit #${e.id} starved.`, 'death');
      return true;
    }
    return false;
  }

  private handleMilitaryFatigue(e: Entity, dt: number): void {
    e.fatigue += MILITARY_FATIGUE_RATE * dt;
    e.fatigue = Math.max(0, e.fatigue - MILITARY_FATIGUE_RECOVERY * dt);
  }

  private handleMilitaryReload(e: Entity): boolean {
    if (e.ammoInMag <= 0 && e.ammo > 0) {
      e.isReloading = true;
      e.reloadTimer = MILITARY_RELOAD_TIME;
      e.state = 'reloading';
      const l = Math.min(e.magazineSize, e.ammo);
      e.ammoInMag = l;
      e.ammo -= l;
      return true;
    }
    return false;
  }

  private handleMilitaryResupply(e: Entity, dt: number): boolean {
    if ((e.ammo + e.ammoInMag) < RESUPPLY_AMMO_THRESHOLD && e.state !== 'resupplying') {
      const ab = this.findNearestAmmoBuilding(e.x, e.z);
      if (ab && ab.ammo > 0) { e.state = 'resupplying'; e.buildingId = ab.id; }
    }

    if (e.state !== 'resupplying') return false;

    const tb = e.buildingId !== null ? this.state.buildings.find(b => b.id === e.buildingId) : null;
    if (!tb || tb.ammo <= 0) {
      const ab = this.findNearestAmmoBuilding(e.x, e.z);
      if (ab && ab.ammo > 0) { e.buildingId = ab.id; }
      else { e.state = 'patrolling'; e.buildingId = null; return true; }
    }

    const b = this.state.buildings.find(bb => bb.id === e.buildingId)!;
    if (dist(e, b) < 1.5) {
      const got = Math.min(b.ammo, RESUPPLY_AMMO_AMOUNT);
      if (got > 0) {
        b.ammo -= got;
        e.ammo = Math.min(e.maxAmmo, e.ammo + got);
        if (e.ammoInMag < e.magazineSize && e.ammo > 0) {
          const f = Math.min(e.magazineSize - e.ammoInMag, e.ammo);
          e.ammoInMag += f;
          e.ammo -= f;
        }
      }
      const gf = Math.min(b.food, RESUPPLY_FOOD_AMOUNT);
      if (gf > 0) { b.food -= gf; e.hunger = Math.min(100, e.hunger + gf); }
      e.state = 'patrolling';
      e.buildingId = null;
    } else {
      const d = safeDist(e, b);
      e.vx += ((b.x - e.x) / d) * e.speed * 0.45 * dt;
      e.vz += ((b.z - e.z) / d) * e.speed * 0.45 * dt;
    }
    return true;
  }

  private handleMilitaryHunger(e: Entity, dt: number): void {
    if (e.hunger < STARVING_THRESHOLD) {
      const tb = findNearestBuilding(this.state.buildings, e.x, e.z);
      if (tb && dist(e, tb) < 1.5) {
        const g = Math.min(tb.food, SOLDIER_HUNGER_FOOD_TAKE);
        if (g > 0) { tb.food -= g; e.hunger = Math.min(100, e.hunger + g); }
      }
    }
  }

  private checkMilitaryOverwhelm(e: Entity): boolean {
    let overwhelmCount = 0;
    for (const o of this.state.entities) {
      if (o.type === 'zombie' && o.state !== 'dead' && dist(e, o) < MILITARY_OVERWHELM_RANGE) {
        overwhelmCount++;
        if (overwhelmCount >= MILITARY_OVERWHELM_COUNT) {
          e.state = 'dead';
          this.logEvent(`💀 Soldier #${e.id} killed by zombie swarm!`, 'death');
          return true;
        }
      }
    }
    return false;
  }

  private applySquadCohesion(e: Entity, dt: number): void {
    if (e.squadId === null) return;
    const sm = this.state.entities.filter(o =>
      o.id !== e.id && o.squadId === e.squadId && o.state !== 'dead'
    );
    if (sm.length === 0) return;

    const ax = sm.reduce((s, m) => s + m.x, 0) / sm.length;
    const az = sm.reduce((s, m) => s + m.z, 0) / sm.length;
    if (dist(e, { x: ax, z: az }) > 6) {
      const d = Math.sqrt((ax - e.x) ** 2 + (az - e.z) ** 2) || 1;
      e.vx += ((ax - e.x) / d) * e.speed * 0.4 * dt;
      e.vz += ((az - e.z) / d) * e.speed * 0.4 * dt;
    }
    if (!e.isSquadLeader && e.state === 'patrolling') {
      const ldr = sm.find(m => m.isSquadLeader) || sm[0];
      if (ldr && dist(e, ldr) > 4) {
        const d = Math.sqrt((ldr.x - e.x) ** 2 + (ldr.z - e.z) ** 2) || 1;
        e.vx += ((ldr.x - e.x) / d) * e.speed * 0.35 * dt;
        e.vz += ((ldr.z - e.z) / d) * e.speed * 0.35 * dt;
      }
    }
  }

  private handleMilitaryCombat(e: Entity, nearZ: Entity, dt: number): void {
    e.state = 'engaging';
    const d = dist(e, nearZ);

    // Distance management: retreat from overwhelming zombies
    if (d < MILITARY_RETREAT_RANGE) {
      e.aimTimer = 0;
      const len = safeDist(e, nearZ);
      e.vx += ((e.x - nearZ.x) / len) * e.speed * 0.6 * dt;
      e.vz += ((e.z - nearZ.z) / len) * e.speed * 0.6 * dt;
    }

    // Line-of-sight check: advance or sidestep if LOS is blocked
    const canSee = this.hasClearShot(e, nearZ);
    if (!canSee && d > MILITARY_RETREAT_RANGE) {
      // Rush toward target at full speed to get a clear shot
      const len = safeDist(e, nearZ);
      e.vx += ((nearZ.x - e.x) / len) * e.speed * 1.2 * dt;
      e.vz += ((nearZ.z - e.z) / len) * e.speed * 1.2 * dt;
      e.aimTimer = 0;
      return;
    }

    // Shoot at range (only if LOS is clear)
    if (canSee) {
      this.militaryFire(e, nearZ, d, dt);
    }

    // Alert squadmates
    if (e.squadId !== null) {
      for (const m of this.state.entities) {
        if (m.id !== e.id && m.squadId === e.squadId && m.state !== 'dead' &&
            (m.state === 'patrolling' || m.state === 'wandering')) {
          m.state = 'engaging';
        }
      }
    }
  }

  private militaryFire(e: Entity, target: Entity, d: number, dt: number): void {
    if (d < 3 || e.attackCooldown > 0 || e.ammoInMag <= 0) return;

    if (e.aimTimer <= 0) {
      e.aimTimer = MILITARY_AIM_TIME + Math.random() * MILITARY_AIM_RANGE;
      e.vx *= MILITARY_AIM_DRAG;
      e.vz *= MILITARY_AIM_DRAG;
    }

    if (e.aimTimer > 0) {
      e.aimTimer -= dt;
      e.vx *= MILITARY_AIM_DRAG;
      e.vz *= MILITARY_AIM_DRAG;
      if (e.aimTimer <= 0 && e.ammoInMag > 0) {
        e.ammoInMag -= 1;
        e.attackCooldown = MILITARY_ATTACK_COOLDOWN;
        e.aimTimer = 0;
        const moving = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
        const movePenalty = moving > 0.3 ? MILITARY_HIT_CHANCE_MOVE_PENALTY : 0;
        const hitChance = Math.max(MILITARY_HIT_CHANCE_MIN, Math.min(MILITARY_HIT_CHANCE_MAX,
          Math.floor(MILITARY_HIT_CHANCE_BASE - d * MILITARY_HIT_CHANCE_DISTANCE_PENALTY - movePenalty)));
        const hit = Math.random() * 100 < hitChance;
        this.pushEvent(`SHOT:${hit ? 'HIT' : 'MISS'}:${e.x},${e.z},${target.x},${target.z}`, 'military');
        for (const z of this.state.entities) {
          if (z.type === 'zombie' && z.state !== 'dead' && dist(e, z) < 25) {
            z.alertTimer = 5;
            z.alertX = e.x;
            z.alertZ = e.z;
          }
        }
        if (hit) {
          target.state = 'dead';
          e.kills++;
          this.state.stats.zombiesKilledByMilitary++;
        }
      }
    }
  }

  private handleMilitaryPatrol(e: Entity, dt: number): void {
    e.state = 'patrolling';
    const dfc = Math.sqrt(e.x * e.x + e.z * e.z);

    // Patrol toward horde centers
    if (this.hordeCenters.length > 0) {
      const bh = this.hordeCenters.reduce((a, b) => a.count > b.count ? a : b);
      if (bh.count >= ZOMBIE_HORDE_MIN_COUNT) {
        const d = Math.sqrt((bh.x - e.x) ** 2 + (bh.z - e.z) ** 2) || 1;
        e.vx += ((bh.x - e.x) / d) * e.speed * 0.5 * dt;
        e.vz += ((bh.z - e.z) / d) * e.speed * 0.5 * dt;
        return;
      }
    }

    // Patrol within city bounds
    if (dfc > 18) {
      const a = Math.atan2(-e.z, -e.x);
      e.vx += Math.cos(a) * e.speed * 0.4 * dt;
      e.vz += Math.sin(a) * e.speed * 0.4 * dt;
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

  // ════════════════════════════════════════════════════════════
  //  BUILDING / DEPLOYMENT / HORDE
  // ════════════════════════════════════════════════════════════

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

  private computeHordeCenters(): void {
    const zombies = this.state.entities.filter(e => e.type === 'zombie' && e.state !== 'dead');
    this.hordeCenters = [];
    const clustered = new Set<number>();
    for (const z of zombies) {
      if (clustered.has(z.id)) continue;
      const nearby = zombies.filter(o => o.id !== z.id && !clustered.has(o.id) && dist(z, o) < ZOMBIE_HORDE_CLUSTER_RANGE);
      if (nearby.length >= 2) {
        let cx = z.x, cz = z.z, count = 1 + nearby.length;
        for (const n of nearby) { cx += n.x; cz += n.z; clustered.add(n.id); }
        clustered.add(z.id);
        this.hordeCenters.push({ x: cx / count, z: cz / count, count });
      }
    }
  }

  private deployMilitary(): void {
    const s = this.state;
    const zomb = s.stats.zombies;
    const currentMil = s.stats.military;

    let targetSoldiers = 0;
    for (const tier of DEPLOY_ZOMBIE_TIERS) {
      if (zomb >= tier.min) targetSoldiers = tier.soldiers;
    }
    targetSoldiers = Math.max(targetSoldiers, Math.floor(zomb * DEPLOY_SOLDIER_FACTOR + DEPLOY_SOLDIER_BASE));

    if (currentMil < targetSoldiers && this.deploymentTimer <= 0) {
      const toDeploy = Math.min(DEPLOY_WAVE_SIZE, targetSoldiers - currentMil);
      const angle = Math.random() * Math.PI * 2;
      const radius = MILITARY_SPAWN_RADIUS_MIN + Math.random() * MILITARY_SPAWN_RADIUS_RANGE;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const squadId = this.nextSquadId++;
      for (let j = 0; j < toDeploy; j++) {
        s.entities.push(this.makeEntity(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3, 'military', { squadId }));
        s.stats.military++;
      }
      this.deploymentTimer = DEPLOYMENT_INTERVAL + Math.random() * DEPLOYMENT_INTERVAL_RANGE;
      this.logEvent(`🚁 ${toDeploy} soldier${toDeploy > 1 ? 's' : ''} deployed. (${currentMil + toDeploy} total)`, 'military');
      const firstSoldier = s.entities[s.entities.length - toDeploy];
      if (firstSoldier) {
        this.pushEvent(`DEPLOY:${firstSoldier.x},${firstSoldier.z},${toDeploy}`, 'military');
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SUPPLY CRATES
  // ════════════════════════════════════════════════════════════

  private supplyCrateTimer = 50 + Math.random() * 30;

  private updateSupplyCrates(dt: number): void {
    const s = this.state;

    // Spawn new crate
    this.supplyCrateTimer -= dt;
    if (this.supplyCrateTimer <= 0 && s.stats.military > 0) {
      this.spawnSupplyCrate();
      this.supplyCrateTimer = 50 + Math.random() * 30;
    }

    // Update existing crates
    for (let i = s.supplyCrates.length - 1; i >= 0; i--) {
      const crate = s.supplyCrates[i];
      if (!crate.active) continue;
      crate.age += dt;

      // Fade and remove after 30-35s
      if (crate.age > 30 + Math.random() * 5) {
        crate.active = false;
        this.logEvent(`📦 Supply crate at (${crate.x.toFixed(0)}, ${crate.z.toFixed(0)}) has been depleted.`, 'info');
      }

      // Attract nearby civilians (within 15 units)
      for (const e of s.entities) {
        if (e.state === 'dead') continue;
        const d = dist(e, crate);

        if (e.type === 'civilian' && d < 15 && e.state !== 'hiding' && e.state !== 'fleeing') {
          // Move toward crate if not already collecting from it
          if (!crate.collectedBy.includes(e.id)) {
            if (d < 1.5 && (crate.food > 0 || crate.ammo > 0)) {
              // Collect from crate
              e.hunger = Math.min(100, e.hunger + Math.min(crate.food, 30));
              crate.food -= Math.min(crate.food, 30);
              e.ammo += Math.min(crate.ammo, 10);
              crate.ammo -= Math.min(crate.ammo, 10);
              crate.collectedBy.push(e.id);
              this.logEventThrottled(`Civilian #${e.id} collected supplies from a drop crate!`, 'info', 5);
            } else if (d >= 1.5) {
              // Path toward crate
              const len = safeDist(e, crate);
              e.vx += ((crate.x - e.x) / len) * e.speed * 0.4 * dt;
              e.vz += ((crate.z - e.z) / len) * e.speed * 0.4 * dt;
              if (e.state !== 'starving' && e.state !== 'foraging') {
                e.state = 'wandering';
              }
            }
          }
        }

        // Attract zombies within 15 units — they cluster near the activity
        if (e.type === 'zombie' && d < 15 && crate.active && d >= 1.5) {
          const len = safeDist(e, crate);
          e.vx += ((crate.x - e.x) / len) * e.speed * 0.3 * dt;
          e.vz += ((crate.z - e.z) / len) * e.speed * 0.3 * dt;
          e.state = 'hunting';
        }
      }

      // Deactivate crate immediately if fully depleted
      if (crate.food <= 0 && crate.ammo <= 0 && crate.active) {
        crate.active = false;
        this.logEvent(`📦 Supply crate at (${crate.x.toFixed(0)}, ${crate.z.toFixed(0)}) emptied by survivors.`, 'info');
      }
    }

    // Remove inactive crates
    s.supplyCrates = s.supplyCrates.filter(c => c.active);
  }

  private spawnSupplyCrate(): void {
    const s = this.state;
    // Place crate on a random street position (avoid buildings)
    let attempts = 0;
    let cx: number, cz: number;
    do {
      cx = (Math.random() - 0.5) * (s.map.width - 10);
      cz = (Math.random() - 0.5) * (s.map.depth - 10);
      attempts++;
    } while (isInsideBuilding(s.buildings, cx, cz) && attempts < 50);

    const crate: SupplyCrate = {
      x: cx,
      z: cz,
      food: 50 + Math.floor(Math.random() * 50),
      ammo: 20 + Math.floor(Math.random() * 30),
      active: true,
      age: 0,
      collectedBy: [],
    };
    s.supplyCrates.push(crate);
    this.logEvent(`📦 Supply crate dropped at (${cx.toFixed(0)}, ${cz.toFixed(0)})!`, 'info');
    this.pushEvent(`SUPPLY_DROP:${cx},${cz}`, 'info');
  }

  // ════════════════════════════════════════════════════════════
  //  UTILITY
  // ════════════════════════════════════════════════════════════

  private hasClearShot(shooter: Entity, target: Entity): boolean {
    const d = dist(shooter, target);
    if (d < 0.1) return true;
    const nx = (target.x - shooter.x) / d, nz = (target.z - shooter.z) / d;
    const shooterBldg = isInsideBuilding(this.state.buildings, shooter.x, shooter.z, 0.1);
    const targetBldg = isInsideBuilding(this.state.buildings, target.x, target.z, 0.1);
    for (let i = 0; i <= Math.ceil(d / 0.5); i++) {
      const frac = i / Math.ceil(d / 0.5);
      const px = shooter.x + nx * d * frac;
      const pz = shooter.z + nz * d * frac;
      for (const b of this.state.buildings) {
        // Skip buildings that both shooter AND target are inside
        if (shooterBldg?.id === b.id && targetBldg?.id === b.id) continue;
        const hw = b.w / 2 + 0.2, hd = b.d / 2 + 0.2;
        if (Math.abs(b.x - px) < hw && Math.abs(b.z - pz) < hd) return false;
      }
    }
    return true;
  }

  private findNearest(e: Entity, range: number, type: EntityType): Entity | null {
    let best: Entity | null = null;
    let bestD2 = range * range;
    const ex = e.x, ez = e.z;
    for (const o of this.state.entities) {
      if (o.id === e.id || o.state === 'dead') continue;
      if (o.type !== type) continue;
      const dx = o.x - ex, dz = o.z - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = o; if (d2 < 1) break; }
    }
    return best;
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

  getStats(): PopulationStats { return { ...this.state.stats }; }
  getRecentEvents(count: number = 20): SimEvent[] { return this.events.slice(-count); }
}
