# Eastbrook Town Square Visual Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Eastbrook's town square a dressed, lived-in Three.js presentation (paved plaza, paths, banners, market awnings, flower boxes, a lantern ring) without touching any zone1 sim content or the shared village GLB kit used by other towns.

**Architecture:** A pure placement planner (`town_dressing_core.ts`, deterministic, Vitest-tested, registered in `RENDER_PURE_CORES`) feeds a thin Three.js painter (`town_dressing.ts`) that builds real geometry from the existing `ZONE1_PROPS` data. `renderer.ts` wires it in exactly like `buildTerrain`/`buildProps`, scoped to the `eastbrook_vale` zone's hub only.

**Tech Stack:** TypeScript (strict), Three.js, Vitest. No new dependencies, no new GLB assets, no new `IWorld` surface.

**Working directly on `main`** (per explicit instruction — no worktree, no branch). Commit after each task.

---

## Reference

Spec: [`docs/superpowers/specs/2026-07-31-eastbrook-town-dressing-design.md`](../specs/2026-07-31-eastbrook-town-dressing-design.md)

Key facts this plan relies on (already verified against the current code):
- `ZONE1_ZONE.hub` = `{ x: 0, z: 0, radius: 26, name: 'Eastbrook' }` (`src/sim/content/zone1.ts`).
- `ZONE1_PROPS.buildings` = 4 entries (2 house, 1 inn, 1 chapel), `stalls` = 3, `wells` = 1 (at `(0,2)`), `campfires` includes `(3,-4)` (in-town) plus several far-away camp fires elsewhere in the zone.
- `getActiveWorldContent().props` (from `../sim/data`) returns the merged `ZonePropsDef` (`buildings`/`stalls`/`wells`/`campfires`/...) across every zone — my code filters by distance to the Eastbrook hub, so it only ever touches Eastbrook's own entries even though the source array is global.
- `renderer.ts` already has a point-light budget system: pushing new lights into `this.fireLights` (the same array `buildProps`/`stations.ts` already populate) makes them participate in the existing ranked/culled budget automatically — never create a raw always-on light outside that array.
- `surfaceMat()` (`src/render/gfx.ts`) is the material factory (dedupes by content, tier-aware). `sharedUniforms.uTime` is the one shared clock every wind/water shader already reads, ticked once per frame by `sync()` — a `onBeforeCompile` shader hook needs no extra per-frame JS.
- `RENDER_PURE_CORES` lives in `tests/architecture.test.ts` (~line 234); a new `*_core.ts` file MUST be added there or the completeness sweep fails CI.

---

### Task 1: Pure placement planner (`town_dressing_core.ts`)

**Files:**
- Create: `src/render/town_dressing_core.ts`
- Test: `tests/town_dressing_core.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/town_dressing_core.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ZONE1_PROPS, ZONE1_ZONE } from '../src/sim/content/zone1';
import { planTownDressing } from '../src/render/town_dressing_core';

const HUB = ZONE1_ZONE.hub;

function plan() {
  return planTownDressing({
    hub: HUB,
    buildings: ZONE1_PROPS.buildings,
    stalls: ZONE1_PROPS.stalls,
    wells: ZONE1_PROPS.wells,
    campfires: ZONE1_PROPS.campfires,
  });
}

describe('planTownDressing', () => {
  it('is deterministic for the same input', () => {
    expect(plan()).toEqual(plan());
  });

  it('builds a plaza smaller than the town hub radius', () => {
    const p = plan();
    expect(p.plaza.radius).toBeGreaterThan(0);
    expect(p.plaza.radius).toBeLessThan(HUB.radius);
  });

  it('only paths anchors outside the plaza, each ending at a real building or stall', () => {
    const p = plan();
    const anchors = [
      ...ZONE1_PROPS.buildings.map((b) => ({ x: b.x, z: b.z })),
      ...ZONE1_PROPS.stalls.map((s) => ({ x: s.x, z: s.z })),
    ];
    expect(p.paths.length).toBeGreaterThan(0);
    for (const path of p.paths) {
      const distFromHub = Math.hypot(path.to.x - HUB.x, path.to.z - HUB.z);
      expect(distFromHub).toBeGreaterThan(p.plaza.radius);
      expect(anchors.some((a) => a.x === path.to.x && a.z === path.to.z)).toBe(true);
    }
  });

  it('keeps every lantern at least 3 units from every building and stall', () => {
    const p = plan();
    const obstacles = [
      ...ZONE1_PROPS.buildings.map((b) => ({ x: b.x, z: b.z })),
      ...ZONE1_PROPS.stalls.map((s) => ({ x: s.x, z: s.z })),
    ];
    expect(p.lanterns.length).toBeGreaterThan(0);
    for (const lantern of p.lanterns) {
      for (const o of obstacles) {
        expect(Math.hypot(o.x - lantern.x, o.z - lantern.z)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('produces one dressing entry per in-hub building, at that building\'s own position', () => {
    const p = plan();
    expect(p.buildingDressing).toHaveLength(ZONE1_PROPS.buildings.length);
    for (const dressing of p.buildingDressing) {
      const source = ZONE1_PROPS.buildings.find((b) => b.x === dressing.x && b.z === dressing.z);
      expect(source).toBeDefined();
      expect(dressing.kind).toBe(source!.kind);
    }
  });

  it("keeps every building's banner/flower-box offset clear of every OTHER building's footprint", () => {
    const p = plan();
    for (const d of p.buildingDressing) {
      const cos = Math.cos(d.rot);
      const sin = Math.sin(d.rot);
      const toWorld = (local: { x: number; z: number }) => ({
        x: d.x + local.x * cos + local.z * sin,
        z: d.z - local.x * sin + local.z * cos,
      });
      const bannerWorld = toWorld(d.bannerLocal);
      const flowerWorld = toWorld(d.flowerBoxLocal);
      for (const other of ZONE1_PROPS.buildings) {
        if (other.x === d.x && other.z === d.z) continue;
        const otherHalfDiag = Math.hypot(other.w, other.d) / 2;
        expect(Math.hypot(bannerWorld.x - other.x, bannerWorld.z - other.z)).toBeGreaterThan(
          otherHalfDiag,
        );
        expect(Math.hypot(flowerWorld.x - other.x, flowerWorld.z - other.z)).toBeGreaterThan(
          otherHalfDiag,
        );
      }
    }
  });

  it('only rings the one in-town campfire, not the far-away camp/mine fires', () => {
    const p = plan();
    expect(p.campfireRings).toHaveLength(1);
    expect(p.campfireRings[0].x).toBe(3);
    expect(p.campfireRings[0].z).toBe(-4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/town_dressing_core.test.ts`
Expected: FAIL — `Cannot find module '../src/render/town_dressing_core'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/render/town_dressing_core.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/town_dressing_core.test.ts`
Expected: PASS (7 tests, 0 failures).

- [ ] **Step 5: Commit**

```bash
git add src/render/town_dressing_core.ts tests/town_dressing_core.test.ts
git commit -m "$(cat <<'EOF'
feat(render): add the Eastbrook town-dressing placement planner

Pure, deterministic core that plans the plaza/paths/banner/lantern
layout from the existing ZONE1_PROPS data (no sim content changes);
the painter that consumes it lands in a follow-up commit.
EOF
)"
```

---

### Task 2: Register the core in `RENDER_PURE_CORES`

**Files:**
- Modify: `tests/architecture.test.ts:234-245`

- [ ] **Step 1: Add the new core to the allowlist**

In `tests/architecture.test.ts`, find the `RENDER_PURE_CORES` array (around line 234) and add the new entry (keep alphabetical-ish grouping consistent with the existing list; append at the end is fine):

```ts
const RENDER_PURE_CORES = [
  'src/render/cast_bar.ts',
  'src/render/stations_core.ts',
  'src/render/delve_interactable_visibility_core.ts',
  'src/render/nameplate_view.ts',
  'src/render/net_interp_core.ts',
  'src/render/prewarm_policy.ts',
  'src/render/terrain_region_core.ts',
  'src/render/town_dressing_core.ts',
  'src/render/water_core.ts',
  'src/render/warrior_cast_fx_core.ts',
  'src/render/characters/weapon_attack_style_core.ts',
].map((rel) => join(repoRoot, rel));
```

- [ ] **Step 2: Run the architecture test**

Run: `npx vitest run tests/architecture.test.ts`
Expected: PASS. This confirms `town_dressing_core.ts` is registered, imports nothing from `three`/`game`/`net`/a painter/i18n, touches no DOM global, and uses no `Math.random`/`Date.now`/`performance.now`.

- [ ] **Step 3: Commit**

```bash
git add tests/architecture.test.ts
git commit -m "$(cat <<'EOF'
test(architecture): register town_dressing_core in RENDER_PURE_CORES

Keeps the completeness sweep green now that the Eastbrook dressing
planner exists as a *_core.ts module.
EOF
)"
```

---

### Task 3: New procedural textures (cobblestone, banner cloth, flower box)

**Files:**
- Modify: `src/render/textures.ts`

- [ ] **Step 1: Add the three new texture functions**

Append to `src/render/textures.ts` (after `stoneTexture()`, using the same `makeCanvas`/`rnd` helpers already in the file):

```ts
// Eastbrook plaza/path paving: irregular flagstones with dark mortar gaps,
// distinct from stoneTexture()'s rough-boulder look (used for rock props).
export function cobblestonePavingTexture(): THREE.CanvasTexture {
  return makeCanvas(128, (ctx, s) => {
    ctx.fillStyle = '#3c3630';
    ctx.fillRect(0, 0, s, s);
    const cell = s / 8;
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const jx = (rnd() - 0.5) * cell * 0.25;
        const jy = (rnd() - 0.5) * cell * 0.25;
        const w = cell - 3 + rnd() * 2;
        const h = cell - 3 + rnd() * 2;
        const v = 120 + Math.floor(rnd() * 45);
        ctx.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        ctx.fillRect(gx * cell + jx, gy * cell + jy, w, h);
      }
    }
  });
}

// Blue-and-gold banner/awning cloth. Eastbrook town-square dressing only —
// never used to recolor the shared village kit, so no other town is affected.
export function bannerClothTexture(): THREE.CanvasTexture {
  return makeCanvas(64, (ctx, s) => {
    ctx.fillStyle = '#1f3f66';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#cf9d33';
    const trim = s * 0.12;
    ctx.fillRect(0, 0, s, trim);
    ctx.fillRect(0, s - trim, s, trim);
  });
}

// Small soil-and-blossom cap for a window flower box.
export function flowerBoxTexture(): THREE.CanvasTexture {
  return makeCanvas(64, (ctx, s) => {
    ctx.fillStyle = '#4a3626';
    ctx.fillRect(0, 0, s, s);
    const colors = ['#d9556b', '#e8c34d', '#f2f2f2'];
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = colors[i % colors.length];
      const x = rnd() * s;
      const y = rnd() * s * 0.7;
      const r = 2 + rnd() * 2.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/render/textures.ts
git commit -m "$(cat <<'EOF'
feat(render): add cobblestone/banner-cloth/flower-box textures

Runtime canvas textures for the Eastbrook town-dressing painter
(follow-up commit); no image assets added.
EOF
)"
```

---

### Task 4: The painter (`town_dressing.ts`)

**Files:**
- Create: `src/render/town_dressing.ts`

Note on performance (deviates slightly from the spec's "instanced/merged" phrasing,
worth calling out explicitly): the spec's Section 6 anticipated reusing
`props.ts`'s `instanceBatches` pattern. Once the plan's actual counts were worked out
(4 buildings, 3 stalls, 8 lanterns — at most ~30 new meshes total for one town), that
pattern is unnecessary: `InstancedMesh` earns its complexity for hundreds/thousands of
repeats (grass, fences across a whole zone), not a handful of one-off fixtures for a
single town square. Plain individual `THREE.Mesh` objects sharing a small set of
deduped materials (built once, per Step 1 below) already satisfy "reuse, don't
allocate" at this scale.

- [ ] **Step 1: Write the painter**

Create `src/render/town_dressing.ts`:

```ts
// Thin painter for the Eastbrook town-square dressing: reads the plan from
// town_dressing_core.ts and builds the actual Three.js geometry. Presentation
// only — never touches ZONE1_PROPS or any other sim content; every mesh here
// is purely decorative and anchored to the zone's EXISTING building/stall/well
// positions. All materials here are dedicated to this module (never reusing
// or mutating the shared `village:*` MAT_OVERRIDES in props.ts), so no other
// town is visually affected.

import * as THREE from 'three';
import type { ZonePropsDef } from '../sim/types';
import { terrainHeight } from '../sim/world';
import { GFX, sharedUniforms, surfaceMat } from './gfx';
import { bannerClothTexture, cobblestonePavingTexture, flowerBoxTexture } from './textures';
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

export function buildTownDressing(seed: number, hub: TownHub, content: ZonePropsDef): TownDressingView {
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
  const clothMat = surfaceMat({ map: bannerClothTexture(), roughness: 0.8, side: THREE.DoubleSide });
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

  // ---- plaza (flat paved disc, sampled at the hub's ground height) --------
  {
    const geo = new THREE.CircleGeometry(plan.plaza.radius, 40);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, pavingMat);
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

  // ---- lantern ring around the plaza ----------------------------------------
  for (const lantern of plan.lanterns) {
    const y = ground(lantern.x, lantern.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, LANTERN_POST_HEIGHT, 6), postMat);
    post.position.set(lantern.x, y + LANTERN_POST_HEIGHT / 2, lantern.z);
    post.castShadow = true;
    group.add(post);

    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), lanternHeadMat);
    head.position.set(lantern.x, y + LANTERN_POST_HEIGHT + 0.1, lantern.z);
    group.add(head);

    const light = new THREE.PointLight(LANTERN_LIGHT_COLOR, LANTERN_LIGHT_INTENSITY, LANTERN_LIGHT_DISTANCE);
    light.position.set(lantern.x, y + LANTERN_POST_HEIGHT + 0.1, lantern.z);
    group.add(light);
    fireLights.push(light);
  }

  return { group, fireLights };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (This file is intentionally NOT added to `RENDER_PURE_CORES` — it imports `three` and is the painter half of the pair, not the pure core.)

- [ ] **Step 3: Commit**

```bash
git add src/render/town_dressing.ts
git commit -m "$(cat <<'EOF'
feat(render): add the Eastbrook town-dressing painter

Thin Three.js layer over town_dressing_core's plan: paved plaza and
paths, roofline banners, window flower boxes, market awnings, and a
lantern ring feeding the renderer's shared point-light budget. Not
yet wired into renderer.ts (next commit).
EOF
)"
```

---

### Task 5: Wire into `renderer.ts`

**Files:**
- Modify: `src/render/renderer.ts` (import list ~line 2-32, and the world-build section ~line 1487-1502)

- [ ] **Step 1: Add the imports**

In `src/render/renderer.ts`, add `getActiveWorldContent` to the existing `from '../sim/data'` import block (it already imports `ZONES`; insert alphabetically next to `dungeonAt`):

```ts
  dungeonAt,
  getActiveWorldContent,
  INSTANCE_SLOT_COUNT,
```

Add a new import for the town-dressing painter near the other `build*` imports (next to the `buildProps` import around line 144):

```ts
import { buildTownDressing, type TownDressingView } from './town_dressing';
```

- [ ] **Step 2: Add the private field**

Find the other `*View`-typed private fields (near `private terrainView: TerrainView;` around line 1014) and add:

```ts
  private townDressing: TownDressingView | null = null;
```

- [ ] **Step 3: Build and wire it in**

In the constructor's world-build section, right after the existing `buildProps` block (after `this.fireLights = props.fireLights;` and its immediate follow-up lines, around line 1493-1502), add:

```ts
    // Eastbrook town-square dressing: presentation-only, scoped to this one
    // zone's hub so no other town is affected. See
    // docs/superpowers/specs/2026-07-31-eastbrook-town-dressing-design.md.
    const eastbrookZone = ZONES.find((z) => z.id === 'eastbrook_vale');
    if (eastbrookZone) {
      this.townDressing = buildTownDressing(
        this.sim.cfg.seed,
        eastbrookZone.hub,
        getActiveWorldContent().props,
      );
      setRenderCategory(this.townDressing.group, 'townDressing');
      this.scene.add(this.townDressing.group);
      freezeStaticMatrices(this.townDressing.group);
      this.fireLights.push(...this.townDressing.fireLights);
    }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the full architecture + town-dressing suites**

Run: `npx vitest run tests/architecture.test.ts tests/town_dressing_core.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/render/renderer.ts
git commit -m "$(cat <<'EOF'
feat(render): wire the Eastbrook town dressing into the renderer

Built once alongside terrain/props/foliage, scoped to the
eastbrook_vale zone's hub only; its lantern lights join the existing
shared fireLights point-light budget instead of running unbudgeted.
EOF
)"
```

---

### Task 6: Escalation — core extensions (bunting lines, path flower beds, more lanterns)

Per the spec's Section 12 escalation addendum (2026-07-31, post-Task-5): the user asked to push
the visual treatment further within the same agreed constraints. This task extends the pure
planner only; Task 7 extends the painter to draw the new plan fields plus two painter-only
additions (a plaza centerpiece texture swap, and a purely decorative skyline landmark).

**Files:**
- Modify: `src/render/town_dressing_core.ts`
- Modify: `tests/town_dressing_core.test.ts`

- [ ] **Step 1: Extend the core**

In `src/render/town_dressing_core.ts`:

1. Change `const LANTERN_COUNT = 8;` to `const LANTERN_COUNT = 12;` (more light, per the addendum).
2. Add a new constant next to the other margin constants: `const FLOWERBED_OFFSET = 1.1;`
3. Add two new exported interfaces, placed after `RingPlan`:

```ts
export interface BuntingLine {
  from: Point2;
  to: Point2;
}

export interface FlowerBedPlan {
  x: number;
  z: number;
}
```

4. Add two new fields to `TownDressingPlan`:

```ts
export interface TownDressingPlan {
  plaza: RingPlan;
  paths: PlazaPathPlan[];
  buildingDressing: BuildingDressingPlan[];
  stallAwnings: StallAwningPlan[];
  wellRings: RingPlan[];
  campfireRings: RingPlan[];
  lanterns: Point2[];
  buntingLines: BuntingLine[];
  pathFlowerBeds: FlowerBedPlan[];
}
```

5. Right after the existing `paths` computation loop (after the `for (const anchor of anchors) { ... }` block that builds `paths`, before the `obstacles`/`lanterns` block), add the flower-bed computation — one pair per path, straddling its midpoint:

```ts
  const pathFlowerBeds: FlowerBedPlan[] = paths.map((path) => {
    const dx = path.to.x - path.from.x;
    const dz = path.to.z - path.from.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const px = -uz;
    const pz = ux;
    const mx = (path.from.x + path.to.x) / 2;
    const mz = (path.from.z + path.to.z) / 2;
    return { x: mx + px * FLOWERBED_OFFSET, z: mz + pz * FLOWERBED_OFFSET };
  });
```

Note this produces ONE flower bed per path (on one side); to get a pair per path (both sides,
matching the addendum's "planter flower beds along each path"), use `flatMap` instead of `map`
so each path yields two beds:

```ts
  const pathFlowerBeds: FlowerBedPlan[] = paths.flatMap((path) => {
    const dx = path.to.x - path.from.x;
    const dz = path.to.z - path.from.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const px = -uz;
    const pz = ux;
    const mx = (path.from.x + path.to.x) / 2;
    const mz = (path.from.z + path.to.z) / 2;
    return [
      { x: mx + px * FLOWERBED_OFFSET, z: mz + pz * FLOWERBED_OFFSET },
      { x: mx - px * FLOWERBED_OFFSET, z: mz - pz * FLOWERBED_OFFSET },
    ];
  });
```

Use the `flatMap` version (two beds per path).

6. Right after the existing `lanterns` computation loop (after the `for (let i = 0; i < LANTERN_COUNT; i++) { ... }` block), add the bunting computation — chain consecutive surviving lanterns, and close the loop only if the closing gap isn't obviously spanning a skipped obstacle:

```ts
  const buntingLines: BuntingLine[] = [];
  for (let i = 0; i < lanterns.length - 1; i++) {
    buntingLines.push({ from: lanterns[i], to: lanterns[i + 1] });
  }
  if (lanterns.length > 2) {
    const first = lanterns[0];
    const last = lanterns[lanterns.length - 1];
    const closingGap = Math.hypot(last.x - first.x, last.z - first.z);
    const ringSpacing = (2 * Math.PI * (plazaRadius + LANTERN_RING_MARGIN)) / LANTERN_COUNT;
    if (closingGap <= ringSpacing * 1.5) {
      buntingLines.push({ from: last, to: first });
    }
  }
```

7. Update the final `return` statement to include both new fields:

```ts
  return {
    plaza,
    paths,
    buildingDressing,
    stallAwnings,
    wellRings,
    campfireRings,
    lanterns,
    buntingLines,
    pathFlowerBeds,
  };
```

- [ ] **Step 2: Extend the test file**

Add these three new `it(...)` cases to the existing `describe('planTownDressing', ...)` block in
`tests/town_dressing_core.test.ts` (keep all 10 existing tests unchanged):

```ts
  it('produces a pair of flower beds straddling each path, not overlapping the path itself', () => {
    const p = plan();
    expect(p.pathFlowerBeds).toHaveLength(p.paths.length * 2);
    for (const bed of p.pathFlowerBeds) {
      expect(Number.isFinite(bed.x)).toBe(true);
      expect(Number.isFinite(bed.z)).toBe(true);
    }
  });

  it('only strings bunting between positions that are real lanterns in the plan', () => {
    const p = plan();
    const isLantern = (pt: { x: number; z: number }) =>
      p.lanterns.some((l) => l.x === pt.x && l.z === pt.z);
    for (const line of p.buntingLines) {
      expect(isLantern(line.from)).toBe(true);
      expect(isLantern(line.to)).toBe(true);
    }
  });

  it('raises the lantern count while still respecting the 3-unit clearance', () => {
    const p = plan();
    expect(p.lanterns.length).toBeGreaterThan(8);
    const obstacles = [
      ...ZONE1_PROPS.buildings.map((b) => ({ x: b.x, z: b.z })),
      ...ZONE1_PROPS.stalls.map((s) => ({ x: s.x, z: s.z })),
    ];
    for (const lantern of p.lanterns) {
      for (const o of obstacles) {
        expect(Math.hypot(o.x - lantern.x, o.z - lantern.z)).toBeGreaterThanOrEqual(3);
      }
    }
  });
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/town_dressing_core.test.ts`
Expected: PASS, 13 tests (10 existing + 3 new).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (`town_dressing.ts` will now fail to compile because it destructures a
plan that's missing the two new fields it doesn't yet use — no wait, TypeScript structural typing
means EXTRA fields on `TownDressingPlan` don't break `town_dressing.ts`, which only reads the
fields it already knows about. Confirm this is actually the case by running `tsc` — it should
still be clean, since `town_dressing.ts` never destructures `plan` positionally.)

- [ ] **Step 5: Commit**

```bash
git add src/render/town_dressing_core.ts tests/town_dressing_core.test.ts
git commit -m "$(cat <<'EOF'
feat(render): extend the town-dressing plan for bunting/flowerbeds/more light

Adds buntingLines (chained around the surviving lantern ring) and
pathFlowerBeds (a pair per path) to the plan, and raises the lantern
count from 8 to 12. Per the 2026-07-31 escalation addendum to the
Eastbrook town-dressing spec; the painter that draws these new fields
lands in the next commit.
EOF
)"
```

---

### Task 7: Escalation — painter additions (plaza centerpiece, bunting, warmth, skyline landmark)

**Files:**
- Modify: `src/render/textures.ts`
- Modify: `src/render/town_dressing.ts`

- [ ] **Step 1: Add the plaza centerpiece texture**

Append to `src/render/textures.ts`, after the three functions added in Task 3 (`flowerBoxTexture`)
and before `waterNormalish()`:

```ts
// Eastbrook plaza centerpiece: an inlaid compass-star pattern in lighter
// stone over the same dark base as cobblestonePavingTexture(), for a bolder
// plaza focal point instead of a single flat paving color. Purely geometric
// (no rnd() calls), so it can't perturb any other texture function's shared
// deterministic RNG stream.
export function plazaEmblemTexture(): THREE.CanvasTexture {
  return makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = '#3c3630';
    ctx.fillRect(0, 0, s, s);
    const cx = s / 2;
    const cy = s / 2;
    const outerR = s * 0.46;
    const innerR = s * 0.18;
    ctx.strokeStyle = '#cf9d33';
    ctx.lineWidth = s * 0.012;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#cf9d33';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tipR = i % 2 === 0 ? outerR : outerR * 0.7;
      const baseHalf = s * 0.02;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const px = -ny;
      const py = nx;
      const tipX = cx + nx * tipR;
      const tipY = cy + ny * tipR;
      const baseX1 = cx + nx * innerR + px * baseHalf;
      const baseY1 = cy + ny * innerR + py * baseHalf;
      const baseX2 = cx + nx * innerR - px * baseHalf;
      const baseY2 = cy + ny * innerR - py * baseHalf;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(baseX1, baseY1);
      ctx.lineTo(baseX2, baseY2);
      ctx.closePath();
      ctx.fill();
    }
  });
}
```

Run `npx tsc --noEmit` and `npx @biomejs/biome check --write src/render/textures.ts`, then commit
this piece on its own first:

```bash
git add src/render/textures.ts
git commit -m "$(cat <<'EOF'
feat(render): add the plaza centerpiece emblem texture

An inlaid compass-star pattern for the Eastbrook plaza disc, replacing
plain cobblestone at the town's focal point. Not yet wired into the
painter (next commit).
EOF
)"
```

- [ ] **Step 2: Wire the escalation into the painter**

In `src/render/town_dressing.ts`, make these changes:

1. Add `plazaEmblemTexture` to the existing `textures` import:

```ts
import {
  bannerClothTexture,
  cobblestonePavingTexture,
  flowerBoxTexture,
  plazaEmblemTexture,
} from './textures';
```

2. Add one new material, built alongside the existing ones (near `const pavingMat = ...`):

```ts
  const emblemMat = surfaceMat({ map: plazaEmblemTexture(), roughness: 0.9 });
  const glowMat = new THREE.SpriteMaterial({
    map: radialGlowTexture(),
    color: 0xffb066,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
```

   This needs a new import too — add `radialGlowTexture` to the same `textures` import block from
   step 1 above (final import list: `bannerClothTexture, cobblestonePavingTexture,
   flowerBoxTexture, plazaEmblemTexture, radialGlowTexture`).

3. In the existing plaza-disc block, change the material from `pavingMat` to `emblemMat` (the
   plaza disc is the ONLY mesh that switches material — paths and rings keep `pavingMat`):

```ts
  // ---- plaza (flat paved disc, sampled at the hub's ground height) --------
  {
    const geo = new THREE.CircleGeometry(plan.plaza.radius, 40);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, emblemMat);
    mesh.position.set(plan.plaza.x, ground(plan.plaza.x, plan.plaza.z) + 0.03, plan.plaza.z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
```

4. Add a warm glow sprite at each lantern — extend the existing lantern loop (find the `for (const
   lantern of plan.lanterns) { ... }` block, which currently adds `post`, `head`, and pushes a
   `light`) by adding one more child right after the `head` mesh is added, before the `light` is
   created:

```ts
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.6);
    glow.position.set(lantern.x, y + LANTERN_POST_HEIGHT + 0.1, lantern.z);
    group.add(glow);
```

5. Add flower beds along the paths — new block, placed after the existing "market stall awnings"
   loop and before the "lantern ring" loop:

```ts
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
```

6. Add the bunting garlands — new block, placed after the flower-bed block and before the lantern
   ring loop:

```ts
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
```

7. Add the skyline landmark — a new standalone function, added after `buildTownDressing` (same
   file), then called once from inside `buildTownDressing` right before the `return { group,
   fireLights };` line:

```ts
function addSkylineLandmark(group: THREE.Group, hub: TownHub, seed: number): void {
  const lx = hub.x + 10;
  const lz = hub.z + 185; // well past every named POI in ZONE1_ZONE.pois; see the 2026-07-31 escalation addendum
  const baseY = terrainHeight(lx, lz, seed);
  const rockMat = surfaceMat({ color: 0x2b2420, roughness: 1 });
  const craterMat = surfaceMat({ color: 0xff8040, emissive: 0xff5a1e, emissiveIntensity: 2.2, roughness: 0.5 });
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
```

Call it right before the final return:

```ts
  addSkylineLandmark(group, hub, seed);

  return { group, fireLights };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Format**

Run: `npx @biomejs/biome check --write src/render/town_dressing.ts`

- [ ] **Step 5: Run the test suites**

Run: `npx vitest run tests/architecture.test.ts tests/town_dressing_core.test.ts`
Expected: PASS (the painter isn't Vitest-covered directly, same as Task 4 — this just confirms
nothing in the core/architecture suites regressed).

- [ ] **Step 6: Commit**

```bash
git add src/render/town_dressing.ts
git commit -m "$(cat <<'EOF'
feat(render): paint the escalated Eastbrook dressing

Plaza centerpiece emblem, warm lantern glow sprites, path-side flower
beds, bunting garlands strung around the lantern ring, and a
standalone volcanic skyline landmark well beyond the zone's gameplay
area. Per the 2026-07-31 escalation addendum; no fireLights budget
growth (glow sprites are not PointLights), no shared terrain/material
edits, no other town affected.
EOF
)"
```

---

### Task 8: Manual visual verification + screenshots

**Files:**
- Create: `docs/screenshots/eastbrook-town-dressing/before-desktop.png`
- Create: `docs/screenshots/eastbrook-town-dressing/after-desktop.png`
- Create: `docs/screenshots/eastbrook-town-dressing/after-mobile.png`

- [ ] **Step 1: Capture the BEFORE shot**

```bash
git stash
```

Start the dev server (`npm run dev`), open the offline client at `http://localhost:5173`, let a fresh character spawn (Eastbrook IS the spawn point — no teleport needed), and screenshot the town square at desktop size (1280x800). Save it to `docs/screenshots/eastbrook-town-dressing/before-desktop.png`.

```bash
git stash pop
```

- [ ] **Step 2: Capture the AFTER shots**

With the stash restored (all commits from Tasks 1-7 back in place), reload the same dev server tab (Vite HMR picks up the change; if the renderer doesn't hot-swap cleanly, do a hard refresh) and screenshot:
- Desktop (1280x800): `docs/screenshots/eastbrook-town-dressing/after-desktop.png`
- Mobile landscape (812x375, since the in-game HUD is landscape-only on mobile): `docs/screenshots/eastbrook-town-dressing/after-mobile.png`

- [ ] **Step 3: Visually confirm, walking around the plaza**

Check for:
- The plaza/paths read as a coherent paved town square, not floating above or sunk into the terrain.
- The plaza centerpiece emblem is visible and centered under the statue, distinct from the plain path/ring paving.
- No banner, flower box, planter, awning, bunting flag, or lantern clips through a building, stall, or the statue/bonfire.
- Bunting garlands sag believably between lantern posts and don't clip through the ground or a building.
- The skyline landmark reads as a distant background feature north of town, not overlapping any nearby building/NPC and not floating obviously disconnected from the terrain.
- No stutter walking around the hub compared to the BEFORE build (informal check; the perf-budget test in Task 9 is the real gate).
- Fenbridge and Highwatch (the other two towns) look completely unchanged — spot-check one of them in the same session.

If anything clips or looks wrong, adjust the constants in `town_dressing_core.ts` (offsets, `PLAZA_RADIUS_FRACTION`, `LANTERN_MIN_CLEARANCE`) or `town_dressing.ts` (mesh sizes/heights), re-run `npx vitest run tests/town_dressing_core.test.ts`, and re-screenshot.

- [ ] **Step 4: Commit the screenshots**

```bash
git add docs/screenshots/eastbrook-town-dressing/
git commit -m "$(cat <<'EOF'
docs(screenshots): add before/after shots for the Eastbrook dressing

Desktop before/after plus a mobile-landscape after, per the repo's
visual-change screenshot rule.
EOF
)"
```

---

### Task 9: Full gate + final check

- [ ] **Step 1: Run the full pre-merge gate**

Run: `npm run gate`
Expected: PASS (i18n gen/freshness, malware scan, changed-files biome, SFX conformance, full tests, `tsc`, all builds).

- [ ] **Step 2: Format the changed files**

```bash
npx @biomejs/biome check --write src/render/town_dressing_core.ts src/render/town_dressing.ts src/render/textures.ts src/render/renderer.ts tests/town_dressing_core.test.ts tests/architecture.test.ts
```

- [ ] **Step 3: Re-run the gate if formatting changed anything**

Run: `npm run gate`
Expected: PASS.

- [ ] **Step 4: Final status check**

```bash
git status --short
git log --oneline -12
```

Expected: clean working tree, all commits from Tasks 1-8 present on `main` (planner, architecture registration, textures, painter, renderer wiring, escalation core/painter additions, screenshots), each with the Conventional Commits body the repo requires.

---

## Notes for the executor

- No `IWorld`/`world_api` change: this feature reads already-resolved `getActiveWorldContent().props` and existing `ZONES` data, and emits no new `SimEvent`.
- No i18n change: no new player-visible strings.
- No GLB/asset-manifest change: everything here is procedural geometry + canvas textures.
- If a future request asks to also dress Fenbridge or Highwatch, that is a NEW spec (generalizing `buildTownDressing`'s zone lookup from a single hardcoded `'eastbrook_vale'` id to a list, plus its own before/after screenshots) — don't fold it into this change.
