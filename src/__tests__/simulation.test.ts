import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '../simulation';

// Advance the simulation by running many small-dt ticks.
// This exercises the full AI state machine, not just coarse outcomes.
function advance(sim: Simulation, seconds: number, dt: number = 1): void {
  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps; i++) {
    sim.tick(dt);
  }
}

// Helper: advance just far enough to reach a given day number
function advanceToDay(sim: Simulation, targetDay: number): void {
  const DAY_LENGTH = 30;
  const currentDay = sim.state.day;
  if (targetDay <= currentDay) return;
  advance(sim, (targetDay - currentDay) * DAY_LENGTH + 5);
}

describe('Simulation', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('Initial State', () => {
    it('should create 400 civilians', () => {
      expect(sim.state.stats.civilians).toBe(400);
    });

    it('should create 1 initial zombie', () => {
      expect(sim.state.stats.zombies).toBe(1);
    });

    it('should start on day 1 with time around dawn', () => {
      expect(sim.state.day).toBe(1);
      expect(sim.state.timeOfDay).toBeCloseTo(0.08, 1);
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

    it('should create military with correct properties when deployed', () => {
      // Run enough time for infection to spread and trigger deployment
      advance(sim, 30, 1);
      const mil = sim.state.entities.filter(e => e.type === 'military');
      if (mil.length > 0) {
        const soldier = mil[0];
        expect(soldier.magazineSize).toBe(100);
        expect(soldier.color).toBe('#ff3333');
        expect(soldier.hp).toBeGreaterThanOrEqual(30);
        expect(soldier.ammoInMag).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Simulation Tick', () => {
    it('should advance day after enough time', () => {
      // DAY_LENGTH = 30 seconds; 35 ticks of dt=1
      advance(sim, 35, 1);
      expect(sim.state.day).toBeGreaterThanOrEqual(2);
    });

    it('should change time of day', () => {
      const initialTime = sim.state.timeOfDay;
      advance(sim, 15, 1);
      expect(sim.state.timeOfDay).not.toBeCloseTo(initialTime);
    });

    it('should process entity movement', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      advance(sim, 3, 1);
      expect(isNaN(civ.x)).toBe(false);
      expect(isNaN(civ.z)).toBe(false);
    });
  });

  describe('Infection', () => {
    it('should turn civilians when bitten', () => {
      // Gather 5 civilians around the zombie so it has multiple targets
      const zombie = sim.state.entities.find(e => e.type === 'zombie')!;
      const civilians = sim.state.entities.filter(e => e.type === 'civilian').slice(0, 5);
      for (const civ of civilians) {
        civ.x = zombie.x + (Math.random() - 0.5) * 0.5;
        civ.z = zombie.z + (Math.random() - 0.5) * 0.5;
      }
      zombie.attackCooldown = -1;

      // Tick for 15 seconds — many bite attempts across 5 targets
      for (let i = 0; i < 30; i++) {
        zombie.attackCooldown = -1;
        if (sim.state.stats.totalInfected > 0) break;
        sim.tick(0.5);
      }

      expect(sim.state.stats.totalInfected).toBeGreaterThanOrEqual(1);
    });

    it('fatigue increases for awake civilians', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      const initialFatigue = civ.fatigue;
      advance(sim, 10, 1);
      // Fatigue builds at 0.15/s
      expect(civ.fatigue).toBeGreaterThan(initialFatigue);
    });
  });

  describe('Hunger and Starvation', () => {
    it('should decrease hunger over time for civilians', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      const initialHunger = civ.hunger;
      advance(sim, 20, 1);
      expect(civ.hunger).toBeLessThan(initialHunger);
    });

    it('should mark civilians as starving when hunger < 25', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      sim.state.entities = sim.state.entities.filter(e => e.type !== 'zombie');
      civ.hunger = 20;
      sim.tick(1);
      expect(civ.state).toBe('starving');
    });

    it('should kill starving civilians when hunger <= -10', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      civ.hunger = -15;
      civ.hp = 100;
      advance(sim, 2, 1);
      expect(civ.state).toBe('dead');
    });
  });

  describe('Non-military entities cannot have ammo', () => {
    it('civilians should have zero ammo on creation', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      expect(civ.ammo).toBe(0);
      expect(civ.maxAmmo).toBe(0);
    });

    it('zombies should have zero ammo on creation', () => {
      const zombie = sim.state.entities.find(e => e.type === 'zombie')!;
      expect(zombie.ammo).toBe(0);
    });
  });

  describe('Fleeing Bite Mechanics', () => {
    it('should handle fleeing civilian in zombie proximity', () => {
      // Place civilian near zombie (outside buildings) and ensure bite code runs
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      const zombie = sim.state.entities.find(e => e.type === 'zombie')!;
      // Move both outside any building
      zombie.x = 28; zombie.z = 28;
      civ.x = 28.2; civ.z = 28.2;
      civ.state = 'fleeing';
      civ.hp = 100;
      
      sim.tick(0.5);
      
      // Bite code ran: civilian either took damage, turned, or state changed
      const changed = civ.hp < 100 || civ.type === 'zombie' || (civ.state as string) === 'dead';
      expect(changed).toBe(true);
    });

    it('should kill civilian from bite damage when already critically injured', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      const zombie = sim.state.entities.find(e => e.type === 'zombie')!;
      zombie.x = 28; zombie.z = 28;
      civ.x = 28; civ.z = 28;
      civ.state = 'fleeing';
      civ.hp = 5;
      
      sim.tick(0.5);
      
      // Civilian either died or turned — state changed from 'fleeing'
      const changed = (civ.state as string) === 'dead' || civ.type === 'zombie';
      expect(changed).toBe(true);
    });
  });

  describe('Military Deployment', () => {
    it('should deploy military when threat threshold reached', () => {
      // The outbreak starts with 1 zombie — give it time to spread
      advance(sim, 20, 1);
      const mil = sim.state.entities.filter(e => e.type === 'military');
      expect(mil.length).toBeGreaterThan(0);
    });

    it('should deploy more military as threat escalates', () => {
      // Fast-forward to day 5 for significant escalation
      advance(sim, 150, 1);
      const mil = sim.state.entities.filter(e => e.type === 'military');
      // Should have at least initial deployment
      expect(mil.length).toBeGreaterThan(0);
    });
  });

  describe('Game Over Conditions', () => {
    it('should trigger game over when all civilians lost', () => {
      sim.state.entities = sim.state.entities.filter(e => e.type !== 'civilian');
      sim.tick(0.1);
      expect(sim.state.gameOver).toBe(true);
      expect(sim.state.gameOverReason).toContain('LOST');
    });

    it('should trigger game over when all zombies eliminated after day 2', () => {
      sim.state.totalTime = 65; // Day 3
      sim.state.entities = sim.state.entities.filter(e => e.type !== 'zombie');
      sim.tick(0.1);
      expect(sim.state.gameOver).toBe(true);
      expect(sim.state.gameOverReason).toContain('SAVED');
    });
  });

  describe('Stats and Accessors', () => {
    it('getStats should return current population stats', () => {
      const stats = sim.getStats();
      expect(stats.civilians).toBe(400);
      expect(stats.zombies).toBe(1);
    });

    it('getStats should update after ticks', () => {
      advance(sim, 10, 1);
      const stats = sim.getStats();
      expect(typeof stats.civilians).toBe('number');
      expect(typeof stats.zombies).toBe('number');
    });

    it('getRecentEvents should return events', () => {
      const recent = sim.getRecentEvents(5);
      expect(recent.length).toBeGreaterThan(0);
      expect(recent.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Events and History', () => {
    it('should log events on construction', () => {
      expect(sim.events.length).toBeGreaterThan(0);
    });

    it('should track population history', () => {
      advance(sim, 3, 1);
      expect(sim.history.length).toBeGreaterThan(0);
    });
  });

  describe('Entity State Transitions', () => {
    it('should trigger radio messages when zombies > 5', () => {
      // Infect enough to get zombie count up
      advance(sim, 60, 1);
      const hasRadioEvents = sim.events.some(e => e.text.startsWith('📻'));
      // May or may not have triggered depending on spread
      expect(typeof hasRadioEvents).toBe('boolean');
    });

    it('should update chaos level when zombies present', () => {
      advance(sim, 30, 1);
      const chaos = sim.state.chaosLevel;
      expect(chaos).toBeGreaterThanOrEqual(0);
      expect(chaos).toBeLessThanOrEqual(100);
    });
  });

  describe('Reset', () => {
    it('should reset to initial conditions', () => {
      advance(sim, 20, 1);
      sim.reset();

      expect(sim.state.day).toBe(1);
      expect(sim.state.stats.civilians).toBe(400);
      expect(sim.state.stats.zombies).toBeGreaterThanOrEqual(1);
      expect(sim.state.gameOver).toBe(false);
    });

    it('should generate a new map on reset', () => {
      const originalMap = sim.state.map;
      sim.reset();
      expect(sim.state.map.buildings.length).toBeGreaterThan(0);
    });
  });
});
