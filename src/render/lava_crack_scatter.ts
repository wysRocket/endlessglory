// Thin painter for the Eastbrook Scar lava-crack ground scatter: reads the
// plan from lava_crack_scatter_core.ts and builds the actual Three.js
// geometry. One instanced mesh for every crack decal (single draw call)
// plus one small glow sprite per decal, reusing the same radialGlowTexture()
// additive-sprite pattern already shipped for the town dressing's lanterns
// and skyline landmark.

import * as THREE from 'three';
import { terrainHeight } from '../sim/world';
import { surfaceMat } from './gfx';
import { type ExclusionCircle, planLavaCracks } from './lava_crack_scatter_core';
import { lavaCrackTexture, radialGlowTexture } from './textures';

export interface LavaCrackScatterView {
  group: THREE.Group;
}

const CELL_SIZE = 42;
// One instanced draw call regardless of count, plus a handful of cheap
// sprites: a fixed, tier-independent density is simple and plenty cheap at
// this scale (roughly a dozen decals across the whole zone).
const SPAWN_CHANCE = 0.18;

export function buildLavaCrackScatter(
  seed: number,
  zMin: number,
  zMax: number,
  xHalfWidth: number,
  exclusions: ExclusionCircle[],
): LavaCrackScatterView {
  const group = new THREE.Group();
  group.name = 'lavaCrackScatter';
  const ground = (x: number, z: number) => terrainHeight(x, z, seed);

  const plan = planLavaCracks({
    zMin,
    zMax,
    xHalfWidth,
    cellSize: CELL_SIZE,
    spawnChance: SPAWN_CHANCE,
    exclusions,
  });

  if (plan.length > 0) {
    const mat = surfaceMat({ map: lavaCrackTexture(), roughness: 0.85 });
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

  const glowMat = new THREE.SpriteMaterial({
    map: radialGlowTexture(),
    color: 0xff6a2e,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (const p of plan) {
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(p.scale * 1.3);
    glow.position.set(p.x, ground(p.x, p.z) + 0.15, p.z);
    group.add(glow);
  }

  return { group };
}
