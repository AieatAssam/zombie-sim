// World / City Map Generator

export interface Building {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  type: 'house' | 'shop' | 'apt' | 'office' | 'police' | 'hospital' | 'warehouse';
  color: string;
  food: number;
  ammo: number;
}

export interface WorldMap {
  width: number;
  depth: number;
  buildings: Building[];
  roads: { x: number; z: number; w: number; d: number }[];
  parks: { x: number; z: number; r: number }[];
}

const BUILDING_TYPES = ['house', 'shop', 'apt', 'office', 'warehouse'] as const;
const SPECIAL_TYPES = ['police', 'hospital'] as const;

const COLORS: Record<string, string> = {
  house: '#8B7355',
  shop: '#CD853F',
  apt: '#6B7B8D',
  office: '#7B8D8E',
  warehouse: '#8E8E8E',
  police: '#2C3E50',
  hospital: '#8B4513',
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function generateWorld(seed: number = Date.now()): WorldMap {
  const rng = seededRandom(seed);

  const MAP_W = 60;
  const MAP_D = 60;
  const CELL = 3;
  const GRID_COLS = Math.floor(MAP_W / CELL); // 20
  const GRID_ROWS = Math.floor(MAP_D / CELL); // 20

  // 0=empty(road), 1=building, 2=park
  const grid: number[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      // Roads every 4 cells
      if (r % 4 === 0 || c % 4 === 0 || r === GRID_ROWS - 1 || c === GRID_COLS - 1) {
        grid[r][c] = 0;
      } else {
        // Buildings with parks
        const val = rng() < 0.75 ? 1 : 2;
        grid[r][c] = val;
      }
    }
  }

  const buildings: Building[] = [];
  const roads: { x: number; z: number; w: number; d: number }[] = [];
  const parks: { x: number; z: number; r: number }[] = [];

  // Collect road rects (just grid cells for now)
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] === 0) {
        const cx = (c - GRID_COLS / 2) * CELL + CELL / 2;
        const cz = (r - GRID_ROWS / 2) * CELL + CELL / 2;
        roads.push({ x: cx, z: cz, w: CELL, d: CELL });
      }
    }
  }

  // Merge building cells into larger buildings
  const visited = new Set<string>();
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      if (grid[r][c] === 2) {
        // Park - single cell
        visited.add(key);
        const cx = (c - GRID_COLS / 2) * CELL + CELL / 2;
        const cz = (r - GRID_ROWS / 2) * CELL + CELL / 2;
        parks.push({ x: cx, z: cz, r: CELL * 0.4 });
        continue;
      }
      if (grid[r][c] !== 1) {
        visited.add(key);
        continue;
      }

      // Find contiguous building cells
      let bw = 1, bd = 1;
      // Expand right
      while (c + bw < GRID_COLS && grid[r][c + bw] === 1 && !visited.has(`${r},${c + bw}`)) bw++;
      // Expand down
      while (r + bd < GRID_ROWS && grid[r + bd][c] === 1) {
        let canExpand = true;
        for (let cc = c; cc < c + bw; cc++) {
          if (grid[r + bd][cc] !== 1 || visited.has(`${r + bd},${cc}`)) { canExpand = false; break; }
        }
        if (!canExpand) break;
        bd++;
      }

      // Mark visited
      for (let dr = 0; dr < bd; dr++) {
        for (let dc = 0; dc < bw; dc++) {
          visited.add(`${r + dr},${c + dc}`);
        }
      }

      const cx = (c - GRID_COLS / 2) * CELL + (bw * CELL) / 2;
      const cz = (r - GRID_ROWS / 2) * CELL + (bd * CELL) / 2;
      const h = 1 + Math.floor(rng() * 5); // 1-5 floors
      const typeIdx = Math.floor(rng() * BUILDING_TYPES.length);
      const bType = BUILDING_TYPES[typeIdx] as Building['type'];
      const food = bType === 'shop' ? 30 : bType === 'warehouse' ? 50 : bType === 'house' ? 15 : 10;
      const ammo = bType === 'warehouse' ? 20 : bType === 'shop' ? 5 : 0;

      buildings.push({
        id: buildings.length,
        x: cx,
        z: cz,
        w: bw * CELL - 0.3,
        d: bd * CELL - 0.3,
        h: h * 1.2,
        type: bType,
        color: COLORS[bType],
        food,
        ammo,
      });
    }
  }

  // Place special buildings (police station, hospital)
  // Replace some buildings near edges
  const specialPlacements: { type: 'police' | 'hospital'; x: number; z: number }[] = [];

  // Find a building near each corner/edge for police station
  const sortedByX = [...buildings].sort((a, b) => a.x - b.x);
  if (sortedByX.length > 3) {
    const policeSpot = sortedByX[Math.floor(rng() * 3)];
    policeSpot.type = 'police';
    policeSpot.color = COLORS.police;
    policeSpot.ammo = 200;
    policeSpot.h = 2.5;

    const hospitalSpot = sortedByX[sortedByX.length - 1 - Math.floor(rng() * 3)];
    hospitalSpot.type = 'hospital';
    hospitalSpot.color = COLORS.hospital;
    hospitalSpot.food = 40;
  }

  return { width: MAP_W, depth: MAP_D, buildings, roads, parks };
}

export function findNearestBuilding(
  buildings: Building[],
  x: number,
  z: number,
  ofType?: Building['type']
): Building | null {
  let best: Building | null = null;
  let bestDist = Infinity;
  for (const b of buildings) {
    if (ofType && b.type !== ofType) continue;
    // Distance to building center
    const dx = b.x - x;
    const dz = b.z - z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      best = b;
    }
  }
  return best;
}

export function isInsideBuilding(
  buildings: Building[],
  x: number,
  z: number,
  margin: number = 0.3
): Building | null {
  for (const b of buildings) {
    const hw = b.w / 2 + margin;
    const hd = b.d / 2 + margin;
    if (Math.abs(b.x - x) < hw && Math.abs(b.z - z) < hd) return b;
  }
  return null;
}
