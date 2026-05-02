import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '../simulation';

function advance(sim: Simulation, seconds: number, dt: number = 1): void {
  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps; i++) {
    sim.tick(dt);
  }
}

describe('Simulation v4', () => {
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

    it('should start on day 1', () => {
      expect(sim.state.day).toBe(1);
    });

    it('should not be game over at start', () => {
      expect(sim.state.gameOver).toBe(false);
    });
  });

  describe('Entity Creation', () => {
    it('should create civilians with correct properties', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      expect(civ.hunger).toBeGreaterThanOrEqual(60);
      expect(civ.hunger).toBeLessThanOrEqual(100);
      expect(civ.state).toBe('wandering');
      expect(civ.color).toBe('#4499ff');
    });

    it('should create zombies with correct properties', () => {
      const zom = sim.state.entities.find(e => e.type === 'zombie')!;
      expect(zom).toBeDefined();
      expect(zom.state).toBe('hunting');
      expect(zom.color).toBe('#33ff33');
    });
  });

  describe('Infection', () => {
    it('should turn civilians via turn timer when bitten', () => {
      const zombie = sim.state.entities.find(e => e.type === 'zombie')!;
      // Place a civilian right on the zombie
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      civ.x = zombie.x + 0.2;
      civ.z = zombie.z + 0.2;
      zombie.attackCooldown = -1;
      
      // Tick until bite lands
      for (let i = 0; i < 20; i++) {
        zombie.attackCooldown = -1;
        sim.tick(0.5);
        if (civ.turnTimer > 0) break; // bitten but turning
      }
      
      // Should have started turn timer
      expect(civ.turnTimer).toBeGreaterThan(0);
      expect(civ.type).toBe('civilian'); // still civilian during turn window
    });

    it('should eventually convert bitten civilians to zombies', () => {
      // Use a fresh sim, place civilian and zombie in clear space
      const zombie = sim.state.entities.find(e => e.type === 'zombie')!;
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      sim.state.entities = [zombie, civ];
      // Place both at (0,0) so no building blocks LOS
      zombie.x = 0.1; zombie.z = 0;
      civ.x = 0; civ.z = 0;
      zombie.attackCooldown = -1;
      zombie.alertTimer = 5; // Ensure zombie can detect target
      
      // Tick past bite + turn timer (now 6-10s)
      // Check DURING the loop before military deploys and kills zombies
      let turned = false;
      for (let i = 0; i < 50; i++) {
        sim.tick(0.5);
        if (sim.state.stats.totalInfected > 0) {
          turned = true;
          // Check immediately: civilian turned and both zombies still alive
          expect(civ.type).toBe('zombie');
          break;
        }
      }
      expect(turned).toBe(true);
      // Note: military may deploy in the same tick and kill zombies,
      // so we only verify the civilian's type changed
    });
  });

  describe('Hunger and Starvation', () => {
    it('should decrease hunger over time', () => {
      const civ = sim.state.entities.find(e => e.type === 'civilian')!;
      const initial = civ.hunger;
      advance(sim, 20, 1);
      expect(civ.hunger).toBeLessThan(initial);
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
      sim.state.entities = sim.state.entities.filter(e => e.type !== 'zombie');
      civ.hunger = -15;
      advance(sim, 2, 1);
      expect(civ.state).toBe('dead');
    });
  });

  describe('Military Deployment', () => {
    it('should deploy military after enough infections', () => {
      // Military deploys with deploymentTimer delay + zombie/infection thresholds
      sim.state.stats.civiliansTurned = 2;
      sim.state.stats.totalInfected = 2;
      
      // deploymentTimer starts at 20 in constructor
      // It decrements by dt each tick; set it near 0
      // Access via private property simulation isn't possible directly
      // Instead, just run ticks past the timer
      let deployed = false;
      for (let t = 0; t < 60; t++) {
        sim.tick(0.5);
        if (sim.state.stats.military > 0) { deployed = true; break; }
      }
      expect(deployed).toBe(true);
    });
  });

  describe('Game Over', () => {
    it('should trigger when all civilians lost', () => {
      sim.state.entities = sim.state.entities.filter(e => e.type !== 'civilian');
      sim.tick(0.1);
      expect(sim.state.gameOver).toBe(true);
      expect(sim.state.gameOverReason).toContain('LOST');
    });

    it('should trigger when all zombies eliminated after day 5', () => {
      sim.state.totalTime = 160;
      sim.state.entities = sim.state.entities.filter(e => e.type !== 'zombie');
      sim.tick(0.1);
      expect(sim.state.gameOver).toBe(true);
      expect(sim.state.gameOverReason).toContain('SAVED');
    });
  });

  describe('Reset', () => {
    it('should reset to initial conditions', () => {
      advance(sim, 20, 1);
      sim.reset();
      expect(sim.state.stats.civilians).toBe(400);
      expect(sim.state.stats.zombies).toBe(1);
      expect(sim.state.gameOver).toBe(false);
    });
  });
});
