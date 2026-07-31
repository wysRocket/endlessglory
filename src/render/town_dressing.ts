// Thin painter for the Eastbrook town-square dressing: reads the plan from
// town_dressing_core.ts and builds the actual Three.js geometry. Presentation
// only, never touches ZONE1_PROPS or any other sim content; every mesh here
// is purely decorative and anchored to the zone's EXISTING building/stall/well
// positions. All materials here are dedicated to this module (never reusing
// or mutating the shared `village:*` MAT_OVERRIDES in props.ts), so no other
// town is visually affected.

import * as THREE from 'three';
import type { ZonePropsDef } from '../sim/types';
import { terrainHeight } from '../sim/world';
import { GFX, sharedUniforms, surfaceMat } from './gfx';
import {
  bannerClothTexture,
  cobblestonePavingTexture,
  flowerBoxTexture,
  plazaEmblemTexture,
  radialGlowTexture,
} from './textures';
import { planTownDressing, type TownHub } from './town_dressing_core';

export interface TownDressingView {
  group: THREE.Group;
  /** point lights for the renderer's shared fireLights budget (see renderer.ts) */
  fireLights: THREE.PointLight[];
}

const LANTERN_LIGHT_COLOR = 0xffb066;
const LANTERN_LIGHT_INTENSITY = 6;
const LANTERN_LIGHT_DISTANCE = 11;
const LANTERN_POST_HEIGHT = 2.6;
const PATH_WIDTH = 1.6;

// Roofline banner flutter, same shared-clock idiom as foliage.ts's wind sway:
// no per-frame JS, the vertex shader reads sharedUniforms.uTime directly.
function addBannerSway(mat: THREE.Material): void {
  if (!GFX.windSway) return;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = sharedUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n        uniform float uTime;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float flutter = sin(uTime * 2.2 + position.x * 3.0) * 0.05 * smoothstep(-0.6, 0.6, position.y);
        transformed.z += flutter;`,
      );
  };
}

export function buildTownDressing(
  seed: number,
  hub: TownHub,
  content: ZonePropsDef,
): TownDressingView {
  const group = new THREE.Group();
  group.name = 'townDressing';
  const fireLights: THREE.PointLight[] = [];
  const ground = (x: number, z: number) => terrainHeight(x, z, seed);

  const plan = planTownDressing({
    hub,
    buildings: content.buildings,
    stalls: content.stalls,
    wells: content.wells,
    campfires: content.campfires,
  });

  const pavingMat = surfaceMat({ map: cobblestonePavingTexture(), roughness: 0.95 });
  const clothMat = surfaceMat({
    map: bannerClothTexture(),
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  addBannerSway(clothMat);
  const postMat = surfaceMat({ color: 0x5c4229, roughness: 0.85 });
  const boxMat = surfaceMat({ color: 0x6b4a32, roughness: 0.9 });
  const boxCapMat = surfaceMat({ map: flowerBoxTexture(), roughness: 0.95 });
  const lanternHeadMat = surfaceMat({
    color: 0xffe9b0,
    emissive: 0xffb066,
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });
  const emblemMat = surfaceMat({ map: plazaEmblemTexture(), roughness: 0.9 });
  const glowMat = new THREE.SpriteMaterial({
    map: radialGlowTexture(),
    color: 0xffb066,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // ---- plaza (flat paved disc, sampled at the hub's ground height) --------
  {
    const geo = new THREE.CircleGeometry(plan.plaza.radius, 40);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, emblemMat);
    mesh.position.set(plan.plaza.x, ground(plan.plaza.x, plan.plaza.z) + 0.03, plan.plaza.z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---- paved paths: plaza edge to each building/stall that sits beyond it -
  for (const path of plan.paths) {
    const dx = path.to.x - path.from.x;
    const dz = path.to.z - path.from.z;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const geo = new THREE.PlaneGeometry(PATH_WIDTH, len);
    geo.rotateX(-Math.PI / 2); // lie flat; baked "length" axis now runs along local +Z
    const mesh = new THREE.Mesh(geo, pavingMat);
    mesh.rotation.y = yaw;
    const midX = (path.from.x + path.to.x) / 2;
    const midZ = (path.from.z + path.to.z) / 2;
    mesh.position.set(midX, ground(midX, midZ) + 0.03, midZ);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---- paved rings around the well/statue plaza and the town bonfire ------
  for (const ring of [...plan.wellRings, ...plan.campfireRings]) {
    const geo = new THREE.RingGeometry(ring.radius - 0.5, ring.radius, 32);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, pavingMat);
    mesh.position.set(ring.x, ground(ring.x, ring.z) + 0.02, ring.z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---- building dressing: roofline banner + window flower box -------------
  for (const b of plan.buildingDressing) {
    const bg = new THREE.Group();
    bg.position.set(b.x, ground(b.x, b.z) - 0.12, b.z);
    bg.rotation.y = b.rot;

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), postMat);
    pole.position.set(b.bannerLocal.x, b.bannerHeight, b.bannerLocal.z);
    pole.castShadow = true;
    bg.add(pole);

    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), clothMat);
    flag.position.set(b.bannerLocal.x, b.bannerHeight - 0.15, b.bannerLocal.z + 0.05);
    flag.castShadow = true;
    bg.add(flag);

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.4), boxMat);
    box.position.set(b.flowerBoxLocal.x, 1.1, b.flowerBoxLocal.z);
    box.castShadow = true;
    bg.add(box);

    const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.35), boxCapMat);
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(b.flowerBoxLocal.x, 1.31, b.flowerBoxLocal.z);
    bg.add(cap);

    group.add(bg);
  }

  // ---- market stall awnings -------------------------------------------------
  for (const s of plan.stallAwnings) {
    const geo = new THREE.PlaneGeometry(2.4, 1.9);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, clothMat);
    mesh.rotation.y = s.rot;
    mesh.position.set(s.x, ground(s.x, s.z) + 2.9, s.z);
    mesh.castShadow = true;
    group.add(mesh);
  }

  // ---- path-side flower beds ------------------------------------------------
  for (const bed of plan.pathFlowerBeds) {
    const y = ground(bed.x, bed.z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), boxMat);
    box.position.set(bed.x, y + 0.18, bed.z);
    box.castShadow = true;
    group.add(box);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), boxCapMat);
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(bed.x, y + 0.36, bed.z);
    group.add(cap);
  }

  // ---- bunting garlands strung between surviving lantern posts -------------
  const BUNTING_FLAGS_PER_LINE = 5;
  const BUNTING_SAG = 0.35;
  for (const line of plan.buntingLines) {
    const y0 = ground(line.from.x, line.from.z) + LANTERN_POST_HEIGHT + 0.1;
    const y1 = ground(line.to.x, line.to.z) + LANTERN_POST_HEIGHT + 0.1;
    for (let i = 0; i < BUNTING_FLAGS_PER_LINE; i++) {
      const t = (i + 0.5) / BUNTING_FLAGS_PER_LINE;
      const x = line.from.x + (line.to.x - line.from.x) * t;
      const z = line.from.z + (line.to.z - line.from.z) * t;
      const y = y0 + (y1 - y0) * t - BUNTING_SAG * 4 * t * (1 - t);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.35), clothMat);
      flag.position.set(x, y, z);
      flag.rotation.y = Math.atan2(line.to.x - line.from.x, line.to.z - line.from.z);
      group.add(flag);
    }
  }

  // ---- lantern ring around the plaza ----------------------------------------
  for (const lantern of plan.lanterns) {
    const y = ground(lantern.x, lantern.z);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, LANTERN_POST_HEIGHT, 6),
      postMat,
    );
    post.position.set(lantern.x, y + LANTERN_POST_HEIGHT / 2, lantern.z);
    post.castShadow = true;
    group.add(post);

    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), lanternHeadMat);
    head.position.set(lantern.x, y + LANTERN_POST_HEIGHT + 0.1, lantern.z);
    group.add(head);

    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.6);
    glow.position.set(lantern.x, y + LANTERN_POST_HEIGHT + 0.1, lantern.z);
    group.add(glow);

    const light = new THREE.PointLight(
      LANTERN_LIGHT_COLOR,
      LANTERN_LIGHT_INTENSITY,
      LANTERN_LIGHT_DISTANCE,
    );
    light.position.set(lantern.x, y + LANTERN_POST_HEIGHT + 0.1, lantern.z);
    group.add(light);
    fireLights.push(light);
  }

  addSkylineLandmark(group, hub, seed);

  return { group, fireLights };
}

function addSkylineLandmark(group: THREE.Group, hub: TownHub, seed: number): void {
  const lx = hub.x + 10;
  const lz = hub.z + 185; // well past every named POI in ZONE1_ZONE.pois; see the 2026-07-31 escalation addendum
  const baseY = terrainHeight(lx, lz, seed);
  const rockMat = surfaceMat({ color: 0x2b2420, roughness: 1 });
  const craterMat = surfaceMat({
    color: 0xff8040,
    emissive: 0xff5a1e,
    emissiveIntensity: 2.2,
    roughness: 0.5,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(24, 70, 8), rockMat);
  cone.position.set(lx, baseY + 35, lz);
  group.add(cone);
  const crater = new THREE.Mesh(new THREE.ConeGeometry(9, 8, 8), craterMat);
  crater.position.set(lx, baseY + 70, lz);
  group.add(crater);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialGlowTexture(),
      color: 0xff6a2e,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.scale.setScalar(30);
  glow.position.set(lx, baseY + 74, lz);
  group.add(glow);
}
