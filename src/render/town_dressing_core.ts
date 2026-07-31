// Pure placement planner for the Eastbrook town-square dressing (plaza, paths,
// banners, flower boxes, market awnings, lantern ring). Three/DOM-free and
// deterministic (hash2, never Math.random) so it's driven by a plain Vitest.
// src/render/town_dressing.ts is the thin Three.js painter that reads the plan
// this module produces.

import { hash2 } from '../sim/rng';
import type { BuildingDef } from '../sim/types';

export interface TownHub {
  x: number;
  z: number;
  radius: number;
}

export interface TownWell {
  x: number;
  z: number;
  r: number;
}

export interface TownStall {
  x: number;
  z: number;
  rot: number;
  r: number;
}

export interface TownDressingInput {
  hub: TownHub;
  buildings: BuildingDef[];
  stalls: TownStall[];
  wells: TownWell[];
  campfires: [number, number][];
}

export interface Point2 {
  x: number;
  z: number;
}

export interface BuildingDressingPlan {
  x: number;
  z: number;
  rot: number;
  kind: BuildingDef['kind'];
  bannerHeight: number;
  /** local-space (pre-rotation) offset from the building's own transform */
  bannerLocal: Point2;
  flowerBoxLocal: Point2;
}

export interface StallAwningPlan {
  x: number;
  z: number;
  rot: number;
}

export interface PlazaPathPlan {
  from: Point2;
  to: Point2;
}

export interface RingPlan {
  x: number;
  z: number;
  radius: number;
}

export interface TownDressingPlan {
  plaza: RingPlan;
  paths: PlazaPathPlan[];
  buildingDressing: BuildingDressingPlan[];
  stallAwnings: StallAwningPlan[];
  wellRings: RingPlan[];
  campfireRings: RingPlan[];
  lanterns: Point2[];
}

const PLAZA_RADIUS_FRACTION = 0.55;
const LANTERN_COUNT = 8;
const LANTERN_RING_MARGIN = 1.2;
const LANTERN_MIN_CLEARANCE = 3;
const WELL_RING_MARGIN = 1.4;
const CAMPFIRE_RING_RADIUS = 2.6;

const BUILDING_ROOF_HEIGHT: Record<BuildingDef['kind'], number> = {
  house: 7.4,
  inn: 7.0,
  chapel: 9.6,
};

function near(hub: TownHub, x: number, z: number): boolean {
  return Math.hypot(x - hub.x, z - hub.z) <= hub.radius;
}

export function planTownDressing(input: TownDressingInput): TownDressingPlan {
  const { hub } = input;
  const buildings = input.buildings.filter((b) => near(hub, b.x, b.z));
  const stalls = input.stalls.filter((s) => near(hub, s.x, s.z));
  const wells = input.wells.filter((w) => near(hub, w.x, w.z));
  const campfires = input.campfires.filter(([x, z]) => near(hub, x, z));

  const plazaRadius = hub.radius * PLAZA_RADIUS_FRACTION;
  const plaza: RingPlan = { x: hub.x, z: hub.z, radius: plazaRadius };

  const anchors: Point2[] = [
    ...buildings.map((b) => ({ x: b.x, z: b.z })),
    ...stalls.map((s) => ({ x: s.x, z: s.z })),
  ];
  const paths: PlazaPathPlan[] = [];
  for (const anchor of anchors) {
    const dx = anchor.x - hub.x;
    const dz = anchor.z - hub.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= plazaRadius + 0.5) continue; // already inside the paved plaza
    const from = { x: hub.x + (dx / dist) * plazaRadius, z: hub.z + (dz / dist) * plazaRadius };
    paths.push({ from, to: anchor });
  }

  const obstacles = anchors;
  const lanterns: Point2[] = [];
  for (let i = 0; i < LANTERN_COUNT; i++) {
    const angle = (i / LANTERN_COUNT) * Math.PI * 2;
    const lx = hub.x + Math.cos(angle) * (plazaRadius + LANTERN_RING_MARGIN);
    const lz = hub.z + Math.sin(angle) * (plazaRadius + LANTERN_RING_MARGIN);
    const blocked = obstacles.some((o) => Math.hypot(o.x - lx, o.z - lz) < LANTERN_MIN_CLEARANCE);
    if (!blocked) lanterns.push({ x: lx, z: lz });
  }

  const buildingDressing: BuildingDressingPlan[] = buildings.map((b) => {
    const side = hash2(Math.round(b.x * 37), Math.round(b.z * 37), 0xb4770e) < 0.5 ? 1 : -1;
    return {
      x: b.x,
      z: b.z,
      rot: b.rot,
      kind: b.kind,
      bannerHeight: BUILDING_ROOF_HEIGHT[b.kind],
      bannerLocal: { x: 0, z: -(b.d / 2) + 0.5 },
      flowerBoxLocal: { x: side * (b.w / 2 - 0.4), z: 0.15 },
    };
  });

  const stallAwnings: StallAwningPlan[] = stalls.map((s) => ({ x: s.x, z: s.z, rot: s.rot }));
  const wellRings: RingPlan[] = wells.map((w) => ({
    x: w.x,
    z: w.z,
    radius: w.r + WELL_RING_MARGIN,
  }));
  const campfireRings: RingPlan[] = campfires.map(([x, z]) => ({
    x,
    z,
    radius: CAMPFIRE_RING_RADIUS,
  }));

  return { plaza, paths, buildingDressing, stallAwnings, wellRings, campfireRings, lanterns };
}
