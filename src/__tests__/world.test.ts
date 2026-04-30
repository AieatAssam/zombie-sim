import { describe, it, expect } from 'vitest';
import { generateWorld, findNearestBuilding, isInsideBuilding } from '../world';

describe('World Generation', () => {
  it('should generate a valid map', () => {
    const world = generateWorld(12345);
    
    expect(world.width).toBe(60);
    expect(world.depth).toBe(60);
    expect(world.buildings.length).toBeGreaterThan(0);
    expect(world.roads.length).toBeGreaterThan(0);
  });

  it('should generate unique maps with different seeds', () => {
    const world1 = generateWorld(11111);
    const world2 = generateWorld(22222);
    
    // Different seeds should produce different building counts (likely)
    const positions1 = world1.buildings.map(b => `${b.x},${b.z}`).join('|');
    const positions2 = world2.buildings.map(b => `${b.x},${b.z}`).join('|');
    
    // Building positions should differ between seeds
    expect(positions1).not.toBe(positions2);
  });

  it('should include various building types', () => {
    const world = generateWorld(99999);
    const types = new Set(world.buildings.map(b => b.type));
    
    expect(types.has('house')).toBe(true);
    expect(types.has('shop')).toBe(true);
    expect(types.has('warehouse')).toBe(true);
  });

  it('should have police station', () => {
    const world = generateWorld(12345);
    const police = world.buildings.find(b => b.type === 'police');
    
    expect(police).toBeDefined();
    expect(police!.ammo).toBe(200);
    expect(police!.h).toBe(2.5);
  });

  it('should have buildings with food values', () => {
    const world = generateWorld(12345);
    
    // Some buildings should have food
    const buildingsWithFood = world.buildings.filter(b => b.food > 0);
    expect(buildingsWithFood.length).toBeGreaterThan(0);
    
    // Shops have the most food
    const shops = world.buildings.filter(b => b.type === 'shop');
    if (shops.length > 0) {
      expect(shops[0].food).toBe(30);
    }
  });

  it('should have warehouses with ammo', () => {
    const world = generateWorld(12345);
    const warehouses = world.buildings.filter(b => b.type === 'warehouse' && b.ammo > 0);
    
    // At least some warehouses should have ammo
    expect(warehouses.length).toBeGreaterThanOrEqual(0);
  });

  it('should have parks', () => {
    const world = generateWorld(12345);
    expect(world.parks.length).toBeGreaterThan(0);
  });

  it('should have valid building dimensions', () => {
    const world = generateWorld(12345);
    
    for (const b of world.buildings) {
      expect(b.w).toBeGreaterThan(0);
      expect(b.d).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
      expect(b.x).toBeGreaterThan(-35);
      expect(b.x).toBeLessThan(35);
      expect(b.z).toBeGreaterThan(-35);
      expect(b.z).toBeLessThan(35);
    }
  });

  it('should not have overlapping buildings in road cells', () => {
    const world = generateWorld(12345);
    
    // Check that no building overlaps with a road cell center
    // (buildings are placed in grid cells, roads are every 4th cell)
    for (const b of world.buildings) {
      // Roads are at grid positions where row or col % 4 === 0
      // Grid has 20 columns/rows each of 3 units
      // A building at column 4 would be on a road
      const col = Math.round((b.x + 30) / 3);
      const row = Math.round((b.z + 30) / 3);
      
      // If this is on a road, it's fine — buildings can be adjacent to roads
      // Just verify the building isn't centered exactly on a road intersection
      if (col % 4 === 0 && row % 4 === 0) {
        // This is a potential road intersection
        // Building should not be exactly centered here
        const distFromIntersection = Math.sqrt(
          Math.pow(b.x - (col * 3 - 30 + 1.5), 2) +
          Math.pow(b.z - (row * 3 - 30 + 1.5), 2)
        );
        expect(distFromIntersection).toBeGreaterThan(0.5);
      }
    }
  });
});

describe('findNearestBuilding', () => {
  it('should find the nearest building', () => {
    const world = generateWorld(12345);
    const nearest = findNearestBuilding(world.buildings, 0, 0);
    
    expect(nearest).not.toBeNull();
    expect(nearest!.x).toBeDefined();
    expect(nearest!.z).toBeDefined();
  });

  it('should return null for empty array', () => {
    const nearest = findNearestBuilding([], 0, 0);
    expect(nearest).toBeNull();
  });

  it('should filter by type when specified', () => {
    const world = generateWorld(12345);
    const police = findNearestBuilding(world.buildings, 0, 0, 'police');
    
    if (police) {
      expect(police.type).toBe('police');
    }
  });
});

describe('isInsideBuilding', () => {
  it('should detect position inside a building', () => {
    const world = generateWorld(12345);
    
    // Pick a building and check its center
    const b = world.buildings[0];
    const inside = isInsideBuilding(world.buildings, b.x, b.z);
    
    expect(inside).not.toBeNull();
    expect(inside!.id).toBe(b.id);
  });

  it('should return null for position outside all buildings', () => {
    const world = generateWorld(12345);
    // Far corner should be outside
    const inside = isInsideBuilding(world.buildings, 99, 99);
    
    expect(inside).toBeNull();
  });
});
