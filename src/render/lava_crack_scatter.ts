// Thin painter for the Eastbrook Scar lava ground scatter: reads plans from
// lava_crack_scatter_core.ts and builds the actual Three.js geometry. Two
// decal layers share one instancing helper: small, dense crack fissures and
// larger, sparser molten pools. Each instanced mesh is one draw call
// regardless of count; each decal also gets a glow sprite, reusing the same
// radialGlowTexture() additive-sprite pattern already shipped for the town
// dressing's lanterns and skyline landmark.

import * as THREE from 'three';
import { terrainHeight } from '../sim/world';
import { surfaceMat } from './gfx';
import {
  type ExclusionCircle,
  type LavaCrackPlan,
  planLavaCracks,
} from './lava_crack_scatter_core';
import { lavaCrackTexture, lavaPoolTexture, radialGlowTexture } from './textures';

export interface LavaCrackScatterView {
  group: THREE.Group;
}

const CRACK_CELL_SIZE = 42;
// One instanced draw call regardless of count, plus a handful of cheap
// sprites: a fixed, tier-independent density is simple and plenty cheap at
// this scale.
const CRACK_SPAWN_CHANCE = 0.32;

const POOL_CELL_SIZE = 65;
const POOL_SPAWN_CHANCE = 0.35;
const POOL_SCALE_MIN = 4.5;
const POOL_SCALE_RANGE = 3.0;

function addDecalLayer(
  group: THREE.Group,
  seed: number,
  texture: THREE.Texture,
  glowMat: THREE.SpriteMaterial,
  glowScaleMult: number,
  plan: LavaCrackPlan[],
): void {
  const ground = (x: number, z: number) => terrainHeight(x, z, seed);
  if (plan.length > 0) {
    const mat = surfaceMat({ map: texture, roughness: 0.85 });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, mat, plan.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scaleV = new THREE.Vector3();
    plan.forEach((p, i) => {
      pos.set(p.x, ground(p.x, p.z) + 0.03, p.z);
      q.setFromEuler(new THREE.Euler(0, p.rot, 0));
      scaleV.set(p.scale, 1, p.scale);
      m.compose(pos, q, scaleV);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const p of plan) {
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(p.scale * glowScaleMult);
    glow.position.set(p.x, ground(p.x, p.z) + 0.15, p.z);
    group.add(glow);
  }
}

export function buildLavaCrackScatter(
  seed: number,
  zMin: number,
  zMax: number,
  xHalfWidth: number,
  exclusions: ExclusionCircle[],
): LavaCrackScatterView {
  const group = new THREE.Group();
  group.name = 'lavaCrackScatter';

  const crackPlan = planLavaCracks({
    zMin,
    zMax,
    xHalfWidth,
    cellSize: CRACK_CELL_SIZE,
    spawnChance: CRACK_SPAWN_CHANCE,
    exclusions,
  });
  const poolPlan = planLavaCracks({
    zMin,
    zMax,
    xHalfWidth,
    cellSize: POOL_CELL_SIZE,
    spawnChance: POOL_SPAWN_CHANCE,
    exclusions,
    scaleMin: POOL_SCALE_MIN,
    scaleRange: POOL_SCALE_RANGE,
  });

  const glowMat = new THREE.SpriteMaterial({
    map: radialGlowTexture(),
    color: 0xff6a2e,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  addDecalLayer(group, seed, lavaCrackTexture(), glowMat, 1.3, crackPlan);
  addDecalLayer(group, seed, lavaPoolTexture(), glowMat, 1.6, poolPlan);

  return { group };
}
