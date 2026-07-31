// Thin painter for the Eastbrook Scar lava stones: jagged obsidian boulders
// scattered across the ground, reusing the deterministic scatter core already
// shipped for the crack/pool ground decals (lava_crack_scatter_core.ts) but
// with real 3D geometry instead of a flat textured quad. Each boulder gets a
// small warm glow sprite at its base, the same radialGlowTexture() additive
// pattern already shipped for the town dressing and the crack/pool decals.

import * as THREE from 'three';
import { hash2 } from '../sim/rng';
import { terrainHeight } from '../sim/world';
import { surfaceMat } from './gfx';
import { type ExclusionCircle, planLavaCracks } from './lava_crack_scatter_core';
import { obsidianRockTexture, radialGlowTexture } from './textures';

export interface LavaStoneScatterView {
  group: THREE.Group;
}

const STONE_CELL_SIZE = 38;
const STONE_SPAWN_CHANCE = 0.5;
const STONE_SCALE_MIN = 1.6;
const STONE_SCALE_RANGE = 2.2;
const VARIANT_COUNT = 3;

// A low-poly icosahedron with each vertex nudged outward/inward by a
// deterministic hash, so it reads as a rough-hewn boulder rather than a
// perfect gem. Flat-shaded on the material side sells the faceted look.
function buildBoulderGeometry(variant: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const jitter = 0.78 + hash2(i, variant, 0x6f7a1e) * 0.44;
    v.multiplyScalar(jitter);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildLavaStoneScatter(
  seed: number,
  zMin: number,
  zMax: number,
  xHalfWidth: number,
  exclusions: ExclusionCircle[],
): LavaStoneScatterView {
  const group = new THREE.Group();
  group.name = 'lavaStoneScatter';
  const ground = (x: number, z: number) => terrainHeight(x, z, seed);

  const plan = planLavaCracks({
    zMin,
    zMax,
    xHalfWidth,
    cellSize: STONE_CELL_SIZE,
    spawnChance: STONE_SPAWN_CHANCE,
    exclusions,
    scaleMin: STONE_SCALE_MIN,
    scaleRange: STONE_SCALE_RANGE,
  });

  const buckets: { x: number; z: number; rot: number; scale: number }[][] = Array.from(
    { length: VARIANT_COUNT },
    () => [],
  );
  plan.forEach((p, i) => {
    buckets[i % VARIANT_COUNT].push(p);
  });

  // Only a faint emissive term: enough that the rock never goes fully black
  // in shadow, but low enough that the map's near-black body and its bright
  // vein pixels stay the thing you actually read. A strong emissive here
  // flattens every facet to one saturated colour and the boulder stops
  // looking like rock.
  const mat = surfaceMat({
    map: obsidianRockTexture(),
    emissive: 0x3d1405,
    emissiveIntensity: 0.3,
    roughness: 0.95,
    flatShading: true,
  });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const posV = new THREE.Vector3();
  const scaleV = new THREE.Vector3();
  for (let variant = 0; variant < VARIANT_COUNT; variant++) {
    const bucket = buckets[variant];
    if (bucket.length === 0) continue;
    const geo = buildBoulderGeometry(variant);
    const mesh = new THREE.InstancedMesh(geo, mat, bucket.length);
    bucket.forEach((p, i) => {
      const h = ground(p.x, p.z);
      posV.set(p.x, h + p.scale * 0.32, p.z);
      q.setFromEuler(new THREE.Euler(0, p.rot, 0));
      scaleV.setScalar(p.scale);
      m.compose(posV, q, scaleV);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const glowMat = new THREE.SpriteMaterial({
    map: radialGlowTexture(),
    color: 0xff6a2e,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (const p of plan) {
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(p.scale * 0.75);
    glow.position.set(p.x, ground(p.x, p.z) + p.scale * 0.25, p.z);
    group.add(glow);
  }

  return { group };
}
