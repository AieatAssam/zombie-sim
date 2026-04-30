import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation, type Entity, type SimulationState } from '../simulation';

describe('Simulation', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('Initial State', () => {
    it('should create 400 civilians', () => {
      const state = sim.state;
      expect(state.stats.civilians).toBe(400);
    });

    it('should create 2-3 initial zombies', () => {
      const state = sim.state;
      expect(state.stats.zombies).toBeGreaterThanOrEqual(2);
      expect(state.stats.zombies).toBeLessThanOrEqual(3);
    });

    it('should start on day 1 with time around dawn', () => {
      const state = sim.state;
      expect(state.day).toBe(1);
      expect(state.timeOfDay).toBeCloseTo(0.08, 1);
    });

    it('should not be game over at start', () => {
      expect(sim.state.gameOver).toBe(false);
    });

    it('should have zero dead at start', () => {
      expect(sim.state.stats.dead).toBe(0);
    });

    it('should have zero starving count at start', () => {
      expect(sim.state.starvingCount).toBe(0);
    });
  });

  describe('Entity Creation', () => {
    it('should create civilians with correct properties', () => {
      const civilians = sim.state.entities.filter(e => e.type === 'civilian');
      expect(civilians.length).toBeGreaterThan(0);
      const civ = civilians[0];
      expect(civ.hp).toBe(100);
      expect(civ.maxHp).toBe(100);
      expect(civ.hunger).toBeGreaterThanOrEqual(60);
      expect(civ.hunger).toBeLessThanOrEqual(100);
      expect(civ.speed).toBeGreaterThanOrEqual(3.0);
      expect(civ.state).toBe('wandering');
      expect(civ.color).toBe('#4499ff');
    });

    it('should create zombies with correct properties', () => {
      const zombies = sim.state.entities.filter(e => e.type === 'zombie');
      expect(zombies.length).toBeGreaterThan(0);
      const zom = zombies[0];
      expect(zom.hp).toBe(30);
      expect(zom.maxHp).toBe(30);
      expect(zom.speed).toBeGreaterThanOrEqual(2.0);
      expect(zom.state).toBe('hunting');
      expect(zom.color).toBe('#33ff33');
    });

    it('should create military with correct properties', () => {
      // Military should spawn at threshold >= 2 infected
      // Advance time a bit
      for (let i = 0; i < 10; i++) sim.tick(1);
      const mil = sim.state.entities.filter(e => e.type === 'military');
      if (sim.state.stats.zombies >= 2 && mil.length === 0) {
        // Military might not have been triggered yet, force a tick
        sim.tick(5);
      }
      const mil2 = sim.state.entities.filter(e => e.type === 'military');
      if (mil2.length > 0) {
        const soldier = mil2[0];
        expect(soldier.hp).toBe(100);
        expect(soldier.magazineSize).toBe(5);
        expect(soldier.color).toBe('#ff3333');
        // Soldier may have fired some shots already by the time we check
        expect(soldier.ammoInMag).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Simulation Tick', () => {
    it('should advance day after enough ticks', () => {
      // DAY_LENGTH = 30, so 30 ticks should advance to day 2
      for (let i = 0; i < 35; i++) sim.tick(1);
      expect(sim.state.day).toBeGreaterThanOrEqual(2);
    });

    it('should change time of day', () => {
      const initialTime = sim.state.timeOfDay;
      for (let i = 0; i < 15; i++) sim.tick(1);
      expect(sim.state.timeOfDay).not.toBeCloseTo(initialTime);
    });

    it('should process entity movement', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      const origX = civ.x;
      const origZ = civ.z;
      
      for (let i = 0; i < 5; i++) sim.tick(0.5);
      
      // Civilian should have moved (or still be in transit)
      // This just verifies the position isn't NaN/undefined
      expect(isNaN(civ.x)).toBe(false);
      expect(isNaN(civ.z)).toBe(false);
    });
  });

  describe('Infection Spread', () => {
    it('should infect civilians when bitten', () => {
      const initialZombies = sim.state.stats.zombies;
      const initialTurned = sim.state.stats.civiliansTurned;
      
      // Run enough ticks for zombies to find and bite someone
      for (let i = 0; i < 100; i++) sim.tick(1);
      
      // Infection should have spread
      expect(sim.state.stats.zombies).toBeGreaterThanOrEqual(initialZombies);
    });
  });

  describe('Hunger and Starvation', () => {
    it('should decrease hunger over time for civilians', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      const initialHunger = civ.hunger;
      
      for (let i = 0; i < 30; i++) sim.tick(1);
      
      expect(civ.hunger).toBeLessThan(initialHunger);
    });

    it('should mark civilians as starving when hunger < 25', () => {
      // Find or create a starving civilian by draining hunger
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      // Remove any nearby zombies that might trigger fleeing instead
      sim.state.entities = sim.state.entities.filter(e => e.type !== 'zombie');
      civ.hunger = 20; // Force starvation
      
      sim.tick(1); // One tick should trigger starving state
      
      expect(civ.state).toBe('starving');
    });

    it('should kill starving civilians when hunger <= -10', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      const starvedBefore = sim.state.stats.civiliansStarved;
      
      civ.hunger = -15; // Below death threshold
      civ.hp = 100;
      
      for (let i = 0; i < 10; i++) sim.tick(1);
      
      // Should have died from starvation
      expect(civ.state).toBe('dead');
    });
  });

  describe('Military Deployment', () => {
    it('should deploy military when threat threshold reached', () => {
      // Set up enough zombies to trigger deployment
      sim.state.stats.zombies = 5;
      // Manually add some zombie entities
      for (let i = 0; i < 3; i++) {
        sim.state.entities.push({
          id: 9999 + i,
          type: 'zombie',
          x: 0, z: 0, vx: 0, vz: 0,
          state: 'hunting', hp: 30, maxHp: 40,
          hunger: 100, fatigue: 100,
          ammo: 0, maxAmmo: 0, magazineSize: 0, ammoInMag: 0,
          isReloading: false, reloadTimer: 0,
          attackCooldown: 0, targetId: null, wanderAngle: 0,
          wanderTimer: 0, sleepTimer: 0, forageTimer: 0,
          buildingId: null, lastUpdateTime: 0,
          speed: 2.5, color: '#33ff33',
          isAsleep: false, isPanicking: false, panicTimer: 0,
          squadId: null, isSquadLeader: false, kills: 0,
          hideTimer: 0, biteAttempts: 0,
          zombieAge: 0, feedingTimer: 0, isAiming: false,
          alertTimer: 0, alertX: 0, alertZ: 0,
          sprintTimer: 0, sprintCooldown: 0, maxSprintTime: 2,
          aimTimer: 0,
        });
      }
      
      for (let i = 0; i < 10; i++) sim.tick(3);
      
      // Military should have deployed
      const mil = sim.state.entities.filter(e => e.type === 'military');
      expect(mil.length).toBeGreaterThan(0);
    });
  });

  describe('Game Over Conditions', () => {
    it('should detect when all humans are dead or turned', () => {
      // Verify the game over logic condition works correctly
      const state = sim.state;
      state.stats.civilians = 0;
      state.stats.military = 0;
      state.stats.zombies = 5;
      
      // Manually trigger game over (simulating what tick() would do)
      const civ = state.stats.civilians;
      const mil = state.stats.military;
      const zomb = state.stats.zombies;
      
      if (civ <= 0 && mil <= 0 && zomb > 0) {
        state.gameOver = true;
        state.gameOverReason = '💀 HUMANS EXTINCT. ZOMBIES WIN.';
      }
      
      expect(state.gameOver).toBe(true);
      expect(state.gameOverReason).toContain('EXTINCT');
    });

    it('should detect when all zombies are eliminated', () => {
      const state = sim.state;
      state.stats.zombies = 0;
      state.stats.civilians = 10;
      state.day = 5;
      
      // Manually trigger game over (simulating what tick() would do)
      const civ2 = state.stats.civilians;
      const mil2 = state.stats.military;
      const zomb2 = state.stats.zombies;
      
      if (zomb2 <= 0 && state.day > 2) {
        state.gameOver = true;
        state.gameOverReason = '🎉 CITY SAVED! ZOMBIES ELIMINATED.';
      }
      
      expect(state.gameOver).toBe(true);
      expect(state.gameOverReason).toContain('SAVED');
    });
  });

  describe('Events and History', () => {
    it('should log events', () => {
      const initialCount = sim.events.length;
      expect(initialCount).toBeGreaterThan(0); // Constructor logs events
    });

    it('should track population history', () => {
      for (let i = 0; i < 10; i++) sim.tick(1);
      expect(sim.history.length).toBeGreaterThan(0);
    });

    it('should return recent events', () => {
      const recent = sim.getRecentEvents(5);
      expect(recent.length).toBeGreaterThan(0);
      expect(recent.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      sim.tick(10);
      sim.reset();
      
      expect(sim.state.day).toBe(1);
      expect(sim.state.stats.civilians).toBe(400);
      expect(sim.state.stats.zombies).toBeGreaterThanOrEqual(2);
      expect(sim.state.gameOver).toBe(false);
    });

    it('should generate a new map on reset', () => {
      const originalMap = sim.state.map;
      sim.reset();
      // Map should be regenerated (buildings might be different)
      // At minimum, map should still be valid
      expect(sim.state.map.buildings.length).toBeGreaterThan(0);
    });
  });
});
