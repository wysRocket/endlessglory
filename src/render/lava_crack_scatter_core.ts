// Pure placement planner for the Eastbrook Scar lava-crack ground decal
// scatter. Three/DOM-free and deterministic (hash2, never Math.random).
// src/render/lava_crack_scatter.ts is the thin Three.js painter that reads
// the plan this module produces.

import { hash2 } from '../sim/rng';

export interface ExclusionCircle {
  x: number;
  z: number;
  radius: number;
}

export interface LavaCrackScatterInput {
  zMin: number;
  zMax: number;
  /** scatter spans world x in [-xHalfWidth, xHalfWidth] */
  xHalfWidth: number;
  cellSize: number;
  /** 0..1, per-cell probability a crack spawns in that cell */
  spawnChance: number;
  exclusions: ExclusionCircle[];
}

export interface LavaCrackPlan {
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export function planLavaCracks(input: LavaCrackScatterInput): LavaCrackPlan[] {
  const { zMin, zMax, xHalfWidth, cellSize, spawnChance, exclusions } = input;
  const plans: LavaCrackPlan[] = [];
  const cols = Math.floor((xHalfWidth * 2) / cellSize);
  const rows = Math.floor((zMax - zMin) / cellSize);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const roll = hash2(col, row, 0x4c6176);
      if (roll >= spawnChance) continue;
      const cellX = -xHalfWidth + col * cellSize;
      const cellZ = zMin + row * cellSize;
      const jitterX = (hash2(col, row, 0x1a2b3c) - 0.5) * cellSize * 0.8;
      const jitterZ = (hash2(col, row, 0x2b3c4d) - 0.5) * cellSize * 0.8;
      const x = cellX + cellSize / 2 + jitterX;
      const z = cellZ + cellSize / 2 + jitterZ;
      const blocked = exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.radius);
      if (blocked) continue;
      const rot = hash2(col, row, 0x3c4d5e) * Math.PI * 2;
      const scale = 1.4 + hash2(col, row, 0x4d5e6f) * 1.8;
      plans.push({ x, z, rot, scale });
    }
  }
  return plans;
}
