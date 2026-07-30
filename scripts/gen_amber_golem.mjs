// Procedurally generate the Emberwood "Amber-Heart Golem", rebuilt to MATCH
// the Gemini concept reference (see /tmp/sculpt-work/concepts/golem.png):
//   * towering fused-basalt/obsidian body (organic displaced rock, not boxes)
//   * chest plates with deliberate fractures revealing a roiling magma core
//   * amber crystal spike clusters on upper arms, forearms, thighs, fingers/toes
//   * five-fingered rock claw (left, shield arm forward) with glowing palm vents
//   * right arm gripping a massive gnarled axe (volcanic rock head + amber blade)
//   * wide, grounded, defensive-aggressive stance
//   * obsidian (near-black, wet sheen) + high-key golden-orange emissive glow
// Articulated node hierarchy (no skinning) animated by node-transform clips:
// the engine's AnimationMixer drives per-node pivots (see gen_chicken_cow.mjs).
//
//   node scripts/gen_amber_golem.mjs
// Writes public/models/emberwood/creatures/amber_heart_golem.glb

import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('Scene');

// ---- real stone PBR texture (extracted from TripoClash a_stone_brick.glb) -----
// Gives the golem actual carved-stone surface detail instead of flat grey.
const STONE_TEX_PATH = '/tmp/sculpt-work/stonebrick_0.jpg';
let stoneTex = null;
if (fs.existsSync(STONE_TEX_PATH)) {
  const stoneImg = fs.readFileSync(STONE_TEX_PATH);
  stoneTex = doc.createTexture('stone').setMimeType('image/jpeg').setImage(stoneImg);
}

// ---- materials -------------------------------------------------------------
const M = (name, rgb, rough = 0.5, metal = 0.0, emissive = null, emissiveI = 1, tex = null) => {
  const m = doc
    .createMaterial(name)
    .setBaseColorFactor([...rgb, 1])
    .setRoughnessFactor(rough)
    .setMetallicFactor(metal)
    .setDoubleSided(true);
  if (emissive) m.setEmissiveFactor(emissive);
  if (tex) m.setBaseColorTexture(tex);
  return m;
};
const matObsidian = M('obsidian', [0.07, 0.07, 0.09], 0.3, 0.4, null, 1, stoneTex); // wet black sheen + stone
const matRock = M('basalt', [0.16, 0.15, 0.15], 0.9, 0.05, null, 1, stoneTex); // dark basalt w/ stone
const matRockLite = M('basaltLite', [0.24, 0.22, 0.2], 0.85, 0.05, null, 1, stoneTex);
const matMagma = M('magma', [1.0, 0.5, 0.1], 0.45, 0.0, [1.0, 0.4, 0.05], 1.6);
const matMagmaHot = M('magmaHot', [1.0, 0.7, 0.28], 0.35, 0.0, [1.0, 0.5, 0.1], 2.0);
const matAmber = M('amber', [1.0, 0.6, 0.16], 0.3, 0.0, [1.0, 0.42, 0.05], 1.6);
const matAmberBright = M('amberBright', [1.0, 0.72, 0.22], 0.25, 0.0, [1.0, 0.5, 0.08], 2.0);
const matEye = M('eye', [1.0, 0.85, 0.4], 0.2, 0.0, [1.0, 0.6, 0.1], 2.5);

// Real stone texture is applied to the rock/obsidian materials above (1x tiling
// across the procedural masses, readable carved-stone grain instead of flat grey).

// ---- geometry helpers ------------------------------------------------------
function noise3(x, y, z) {
  return (
    Math.sin(x * 1.7 + y * 0.3) * 0.5 +
    Math.sin(y * 2.3 + z * 1.1) * 0.3 +
    Math.sin(z * 1.9 + x * 0.7) * 0.2
  );
}
// Icosphere (no three dep): 12 base verts, subdivide, normalize, then displace.
function icosphere(r, detail, irreg, seed) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map((v) => {
    const L = Math.hypot(...v);
    return v.map((c) => (c / L) * r);
  });
  let faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  const midCache = new Map();
  const mid = (a, b) => {
    const key = a < b ? a + '_' + b : b + '_' + a;
    if (midCache.has(key)) return midCache.get(key);
    const m = [
      (verts[a][0] + verts[b][0]) / 2,
      (verts[a][1] + verts[b][1]) / 2,
      (verts[a][2] + verts[b][2]) / 2,
    ];
    const L = Math.hypot(...m);
    const idx = verts.push(m.map((c) => (c / L) * r)) - 1;
    midCache.set(key, idx);
    return idx;
  };
  for (let d = 0; d < detail; d++) {
    const nf = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nf;
  }
  // displace by noise along normal (radial)
  const pos = [],
    nrm = [],
    idx = [];
  verts = verts.map((v) => {
    const n =
      noise3(v[0] * 1.4 + seed, v[1] * 1.4 + seed, v[2] * 1.4 + seed) * irreg +
      noise3(v[0] * 3.1 - seed, v[1] * 3.1, v[2] * 3.1) * irreg * 0.4;
    const s = 1 + n;
    return [v[0] * s, v[1] * s, v[2] * s];
  });
  for (const v of verts) pos.push(v[0], v[1], v[2]);
  // simple per-vertex normal via face accumulation
  const vn = verts.map(() => [0, 0, 0]);
  for (const [a, b, c] of faces) {
    const [ax, ay, az] = verts[a],
      [bx, by, bz] = verts[b],
      [cx, cy, cz] = verts[c];
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az,
      wx = cx - ax,
      wy = cy - ay,
      wz = cz - az;
    const nx = uy * wz - uz * wy,
      ny = uz * wx - ux * wz,
      nz = ux * wy - uy * wx;
    for (const i of [a, b, c]) {
      vn[i][0] += nx;
      vn[i][1] += ny;
      vn[i][2] += nz;
    }
  }
  verts.forEach((v, i) => {
    const L = Math.hypot(...vn[i]) || 1;
    nrm.push(vn[i][0] / L, vn[i][1] / L, vn[i][2] / L);
  });
  for (const [a, b, c] of faces) idx.push(a, b, c);
  return geo(pos, nrm, idx);
}
// Organic fused rock mass: icosphere displaced by layered noise (lumps/ridges).
function rockMass(r, detail = 3, irreg = 0.22, seed = 0) {
  return icosphere(r, detail, irreg, seed);
}
function ellipsoid(rx, ry, rz, seg = 14, ring = 10) {
  const pos = [],
    nrm = [],
    idx = [];
  for (let i = 0; i <= ring; i++) {
    const theta = (i / ring) * Math.PI,
      st = Math.sin(theta),
      ct = Math.cos(theta);
    for (let j = 0; j <= seg; j++) {
      const phi = (j / seg) * 2 * Math.PI,
        sp = Math.sin(phi),
        cp = Math.cos(phi);
      const px = st * cp * rx,
        py = ct * ry,
        pz = st * sp * rz;
      pos.push(px, py, pz);
      const ex = px / (rx * rx),
        ey = py / (ry * ry),
        ez = pz / (rz * rz);
      const L = Math.hypot(ex, ey, ez) || 1;
      nrm.push(ex / L, ey / L, ez / L);
    }
  }
  const s = seg + 1;
  for (let i = 0; i < ring; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * s + j,
        b = a + 1,
        c = a + s,
        d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  return geo(pos, nrm, idx);
}
// Crystal spike: stretched octahedron (bipyramid), amber, emissive.
function crystal(len, rad) {
  const h = len / 2;
  const pos = [0, h, 0, 0, -h, 0, rad, 0, 0, -rad, 0, 0, 0, 0, rad, 0, 0, -rad];
  const nrm = [0, 1, 0, 0, -1, 0, 1, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1];
  const idx = [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 4, 2, 1, 3, 4, 1, 5, 3, 1, 2, 5];
  return geo(pos, nrm, idx);
}
function frustum(r0, r1, h, seg = 12) {
  const pos = [],
    nrm = [],
    idx = [];
  const slant = Math.atan2(r0 - r1, h),
    ny = Math.sin(slant),
    nr = Math.cos(slant);
  for (let j = 0; j <= seg; j++) {
    const phi = (j / seg) * 2 * Math.PI,
      cx = Math.cos(phi),
      cz = Math.sin(phi);
    pos.push(cx * r0, 0, cz * r0);
    nrm.push(cx * nr, ny, cz * nr);
    pos.push(cx * r1, h, cz * r1);
    nrm.push(cx * nr, ny, cz * nr);
  }
  for (let j = 0; j < seg; j++) {
    const a = j * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const cap = (y, r, dir) => {
    if (r <= 1e-4) return;
    const c = pos.length / 3;
    pos.push(0, y, 0);
    nrm.push(0, dir, 0);
    const rim = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const phi = (j / seg) * 2 * Math.PI;
      pos.push(Math.cos(phi) * r, y, Math.sin(phi) * r);
      nrm.push(0, dir, 0);
    }
    for (let j = 0; j < seg; j++)
      dir < 0 ? idx.push(c, rim + j, rim + j + 1) : idx.push(c, rim + j + 1, rim + j);
  };
  cap(0, r0, -1);
  cap(h, r1, 1);
  return geo(pos, nrm, idx);
}
// Gnarled/tapered limb segment using displaced rock for organic bulk.
function limbSeg(rTop, rBot, h, seed) {
  const g = rockMass(Math.max(rTop, rBot), 2, 0.18, seed);
  return g;
}
function geo(pos, nrm, idx) {
  return doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buffer),
    );
}
let n = 0;
function part(name, prim, mat, t = [0, 0, 0], r = null) {
  prim.setMaterial(mat);
  const mesh = doc.createMesh(`${name}_${n++}`).addPrimitive(prim);
  const node = doc.createNode(name).setMesh(mesh).setTranslation(t);
  if (r) node.setRotation(r);
  return node;
}
const group = (name, t = [0, 0, 0], r = null) => {
  const g = doc.createNode(name).setTranslation(t);
  if (r) g.setRotation(r);
  return g;
};
const qx = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const qy = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const Q = (x, y, z, a) => {
  const h = Math.sin(a / 2);
  return [x * h, y * h, z * h, Math.cos(a / 2)];
};

// a cluster of amber crystal spikes at local offsets around a pivot
function crystalCluster(parent, mats, specs) {
  for (const [t, rot, len, rad] of specs) {
    const g = group('xtal', t, rot);
    g.addChild(part('xtal_m', crystal(len, rad), mats, [0, 0, 0]));
    parent.addChild(g);
  }
}

// ---- assemble --------------------------------------------------------------
const root = group('AmberGolem');
scene.addChild(root);
const pose = group('pose');
root.addChild(pose);
const torso = group('torso', [0, 1.7, 0]);
pose.addChild(torso);

// fused basalt torso mass (organic)
torso.addChild(part('chestMass', rockMass(0.95, 3, 0.2, 1), matRock, [0, 0.15, 0]));
// lower abdomen / hips mass
torso.addChild(part('hipMass', rockMass(0.8, 3, 0.22, 7), matRock, [0, -0.85, 0]));
// shoulder hunches
torso.addChild(part('shL', rockMass(0.42, 2, 0.25, 3), matRockLite, [-0.95, 0.75, 0]));
torso.addChild(part('shR', rockMass(0.42, 2, 0.25, 9), matRockLite, [0.95, 0.75, 0]));

// ---- chest plates with fracture gaps + magma core -------------------------
const coreGrp = group('core', [0, 0.2, 0.55]);
torso.addChild(coreGrp);
coreGrp.addChild(part('magma', ellipsoid(0.28, 0.3, 0.2), matMagmaHot, [0, 0, 0]));
coreGrp.addChild(part('magmaHalo', ellipsoid(0.42, 0.45, 0.16), matMagma, [0, 0, -0.05]));
// angled chest plates around the core, leaving fracture gaps (diamond gap center)
const plates = [
  [[-0.55, 0.5, 0.35], qz(0.5)],
  [[0.55, 0.5, 0.35], qz(-0.5)],
  [[-0.62, -0.05, 0.32], qy(0.2)],
  [[0.62, -0.05, 0.32], qy(-0.2)],
  [[-0.3, -0.6, 0.3], qx(-0.3)],
  [[0.3, -0.6, 0.3], qx(-0.3)],
];
for (const [t, r] of plates)
  torso.addChild(part('plate', ellipsoid(0.34, 0.28, 0.12), matObsidian, t, r));
// glowing seams (thin emissive slivers between plates)
for (const [t, r] of [
  [[0, 0.2, 0.58], qz(0)],
  [[0, -0.25, 0.58], qx(0.2)],
])
  torso.addChild(part('seam', ellipsoid(0.05, 0.22, 0.04), matAmber, t, r));

// ---- head ------------------------------------------------------------------
const head = group('head', [0, 1.45, 0]);
torso.addChild(head);
head.addChild(part('skull', rockMass(0.4, 2, 0.28, 5), matRock, [0, 0, 0]));
head.addChild(part('jaw', rockMass(0.32, 2, 0.25, 11), matRockLite, [0, -0.38, 0.03]));
head.addChild(part('eyeL', ellipsoid(0.1, 0.07, 0.05), matEye, [0.17, 0.06, 0.34]));
head.addChild(part('eyeR', ellipsoid(0.1, 0.07, 0.05), matEye, [-0.17, 0.06, 0.34]));
// jagged crown spikes
crystalCluster(head, matAmber, [
  [[0, 0.42, 0], null, 0.4, 0.1],
  [[0.18, 0.36, 0], qz(0.4), 0.32, 0.08],
  [[-0.18, 0.36, 0], qz(-0.4), 0.32, 0.08],
]);

// ---- LEFT arm (shield, forward) with five-fingered claw + palm vents -------
function arm(name, side, forward, seed) {
  const sh = group(name, [side * 1.05, 0.7, 0]);
  torso.addChild(sh);
  sh.addChild(part(`${name}_up`, rockMass(0.34, 2, 0.22, seed), matRock, [0, -0.45, 0]));
  // upper-arm crystal cluster
  crystalCluster(sh, matAmber, [
    [[0, -0.35, 0.3], qz(0.3), 0.4, 0.09],
    [[0, -0.6, -0.2], qx(-0.3), 0.34, 0.08],
  ]);
  const el = group(`${name}_fore`, [0, -0.95, 0]);
  sh.addChild(el);
  el.addChild(part(`${name}_lo`, rockMass(0.28, 2, 0.22, seed + 2), matRockLite, [0, -0.4, 0]));
  crystalCluster(el, matAmber, [[[0, -0.3, 0.25], qz(0.2), 0.3, 0.07]]);
  const hand = group(`${name}_hand`, [0, -0.8, 0]);
  el.addChild(hand);
  hand.addChild(part(`${name}_palm`, ellipsoid(0.22, 0.2, 0.16), matRock, [0, 0, 0]));
  hand.addChild(part(`${name}_vent`, ellipsoid(0.1, 0.1, 0.06), matAmberBright, [0, 0, 0.14])); // glowing palm vent
  // five fingers (crystal-tooth claws): flat-shaded faceted amber crystals
  const fdirs = [
    [-0.13, 0.02],
    [-0.07, 0.05],
    [0, 0.06],
    [0.07, 0.05],
    [0.13, 0.02],
  ];
  fdirs.forEach(([fx, fy], i) => {
    const fg = group(`${name}_f${i}`, [fx, fy, 0.18]);
    hand.addChild(fg);
    fg.addChild(
      part(
        `${name}_fin`,
        frustum(0.05, 0.02, 0.22, 6),
        matObsidian,
        [0, -0.11, 0],
        qx(Math.PI / 2),
      ),
    );
    const claw = part(`${name}_claw`, crystal(0.12, 0.035), matAmberBright, [0, -0.22, 0]);
    fg.addChild(claw);
  });
  return sh;
}
const armL = arm('armL', -1, true, 13); // shield arm forward
const armR = arm('armR', 1, false, 17); // weapon arm back

// ---- RIGHT arm grips a massive gnarled axe --------------------------------
const axe = group('axe', [0, -0.8, 0.1]); // child of right forearm (hand)
armR.listChildren()[2] && armR.listChildren()[2].addChild(axe); // hand group is 3rd child
// haft
axe.addChild(part('haft', frustum(0.07, 0.085, 2.3, 10), matObsidian, [0, -1.0, 0]));
// axe head: fused volcanic rock block + amber crystal blade (emissive edge)
const headG = group('axeHead', [0, -2.0, 0.1]);
axe.addChild(headG);
headG.addChild(part('aRock', rockMass(0.45, 2, 0.3, 21), matRock, [0, 0, 0]));
headG.addChild(
  part('aBlade', frustum(0.02, 0.28, 0.7, 8), matAmberBright, [0.3, 0, 0.2], qz(-Math.PI / 2)),
);
headG.addChild(part('aBladeGlow', ellipsoid(0.08, 0.3, 0.08), matMagmaHot, [0.45, 0, 0.2]));
crystalCluster(headG, matAmber, [
  [[0.1, 0.1, 0.3], qz(-0.6), 0.45, 0.1],
  [[-0.1, -0.1, 0.3], qz(-0.4), 0.38, 0.09],
]);

// ---- LEGS (wide grounded stance) with thigh crystals + crystal toes --------
function leg(name, side, outAngle, seed) {
  const hip = group(name, [side * 0.5, -0.05, 0], qy(outAngle));
  pose.addChild(hip);
  hip.addChild(part(`${name}_up`, rockMass(0.45, 2, 0.22, seed), matRock, [0, -0.5, 0]));
  crystalCluster(hip, matAmber, [
    [[0.18, -0.45, 0.2], qz(0.3), 0.42, 0.1],
    [[-0.05, -0.7, 0.25], qx(-0.2), 0.36, 0.09],
  ]);
  const knee = group(`${name}_lo`, [0, -1.0, 0]);
  hip.addChild(knee);
  knee.addChild(part(`${name}_shin`, rockMass(0.38, 2, 0.2, seed + 4), matRockLite, [0, -0.45, 0]));
  const foot = group(`${name}_foot`, [0, -0.9, 0.12]);
  knee.addChild(foot);
  foot.addChild(part(`${name}_sole`, ellipsoid(0.3, 0.16, 0.5), matObsidian, [0, 0, 0.05]));
  // crystal-toe growths
  crystalCluster(foot, matAmber, [
    [[0.18, 0, 0.45], qx(Math.PI / 2), 0.3, 0.08],
    [[-0.18, 0, 0.45], qx(Math.PI / 2), 0.3, 0.08],
    [[0, 0, 0.5], qx(Math.PI / 2), 0.34, 0.09],
  ]);
  return hip;
}
const legL = leg('legL', -1, 0.22, 23);
const legR = leg('legR', 1, -0.22, 29);

// ---- rest pose (wide defensive-aggressive stance) -------------------------
// left arm forward (shield), right arm back (weapon cocked)
armL.setRotation(Q(1, 0, 0, -0.5)); // raise/forward
armR.setRotation(Q(1, 0, 0, 0.9)); // swing back, axe up
torso.setRotation(qy(0.08)); // slight turn

// ---- animation (node transforms) -----------------------------------------
function track(anim, node, path, times, values, interp = 'LINEAR') {
  const input = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Float32Array(times))
    .setBuffer(buffer);
  const output = doc
    .createAccessor()
    .setType(path === 'rotation' ? 'VEC4' : 'VEC3')
    .setArray(new Float32Array(values.flat()))
    .setBuffer(buffer);
  const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(interp);
  anim
    .addSampler(s)
    .addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));
}
const clip = (name) => doc.createAnimation(name);

{
  const a = clip('Idle');
  track(
    a,
    torso,
    'translation',
    [0, 1.5, 3],
    [
      [0, 1.7, 0],
      [0, 1.74, 0],
      [0, 1.7, 0],
    ],
  );
  track(
    a,
    coreGrp,
    'scale',
    [0, 1.5, 3],
    [
      [1, 1, 1],
      [1.25, 1.25, 1.25],
      [1, 1, 1],
    ],
  );
  track(a, head, 'rotation', [0, 1.5, 3], [qy(0.04), qy(-0.05), qy(0.04)]);
  track(a, armL, 'rotation', [0, 1.5, 3], [Q(1, 0, 0, -0.5), Q(1, 0, 0, -0.45), Q(1, 0, 0, -0.5)]);
  track(a, armR, 'rotation', [0, 1.5, 3], [Q(1, 0, 0, 0.9), Q(1, 0, 0, 0.8), Q(1, 0, 0, 0.9)]);
}
function gait(name, T, swing, bob) {
  const a = clip(name),
    t = [0, T * 0.25, T * 0.5, T * 0.75, T];
  track(a, legL, 'rotation', t, [qy(0.22), qy(0.22 + swing), qy(0.22), qy(0.22 - swing), qy(0.22)]);
  track(a, legR, 'rotation', t, [
    qy(-0.22),
    qy(-0.22 - swing),
    qy(-0.22),
    qy(-0.22 + swing),
    qy(-0.22),
  ]);
  track(a, torso, 'translation', t, [
    [0, 1.7, 0],
    [0, 1.7 + bob, 0],
    [0, 1.7, 0],
    [0, 1.7 + bob, 0],
    [0, 1.7, 0],
  ]);
  track(a, armL, 'rotation', t, [
    Q(1, 0, 0, -0.5),
    Q(1, 0, 0, -0.5 - swing * 0.4),
    Q(1, 0, 0, -0.5),
    Q(1, 0, 0, -0.5 + swing * 0.4),
    Q(1, 0, 0, -0.5),
  ]);
  track(a, armR, 'rotation', t, [
    Q(1, 0, 0, 0.9),
    Q(1, 0, 0, 0.9 + swing * 0.4),
    Q(1, 0, 0, 0.9),
    Q(1, 0, 0, 0.9 - swing * 0.4),
    Q(1, 0, 0, 0.9),
  ]);
  track(a, axe, 'rotation', t, [qx(0), qx(swing * 0.3), qx(0), qx(-swing * 0.3), qx(0)]);
}
gait('Walk', 0.95, 0.18, 0.05);
gait('Run', 0.6, 0.32, 0.1);
{
  const a = clip('Attack');
  // cock axe back, then chop down-forward
  track(a, armR, 'rotation', [0, 0.22, 0.42], [Q(1, 0, 0, 0.9), Q(1, 0, 0, 1.5), Q(1, 0, 0, -0.3)]);
  track(a, axe, 'rotation', [0, 0.22, 0.42], [qx(0), qx(-0.6), qx(0.5)]);
  track(a, torso, 'rotation', [0, 0.22, 0.42], [qy(0.08), qy(-0.35), qy(0.45)]);
  track(
    a,
    pose,
    'translation',
    [0, 0.22, 0.42],
    [
      [0, 0, 0],
      [0, 0, -0.1],
      [0, 0, 0.25],
    ],
  );
  track(
    a,
    coreGrp,
    'scale',
    [0, 0.42],
    [
      [1, 1, 1],
      [1.6, 1.6, 1.6],
    ],
  );
}
{
  const a = clip('Hit');
  track(a, pose, 'rotation', [0, 0.2], [qy(0), qy(0.3)]);
  track(
    a,
    torso,
    'translation',
    [0, 0.2],
    [
      [0, 1.7, 0],
      [0, 1.75, -0.12],
    ],
  );
  track(a, armL, 'rotation', [0, 0.2], [Q(1, 0, 0, -0.5), Q(1, 0, 0, -0.9)]);
}
{
  const a = clip('Death');
  track(a, pose, 'rotation', [0, 0.5, 1.0], [qx(0), qx(-1.1), qx(-1.5)]);
  track(
    a,
    pose,
    'translation',
    [0, 0.5, 1.0],
    [
      [0, 0, 0],
      [0, 0.05, -0.2],
      [0, -0.7, -0.5],
    ],
  );
  track(a, armL, 'rotation', [0, 1.0], [Q(1, 0, 0, -0.5), Q(1, 0, 0, -1.2)]);
  track(a, armR, 'rotation', [0, 1.0], [Q(1, 0, 0, 0.9), Q(1, 0, 0, 1.3)]);
  track(
    a,
    coreGrp,
    'scale',
    [0, 1.0],
    [
      [1, 1, 1],
      [0.2, 0.2, 0.2],
    ],
  );
}

const glb = await new NodeIO().writeBinary(doc);
const out = path.resolve('public/models/emberwood/creatures/amber_heart_golem.glb');
fs.writeFileSync(out, glb);
console.log(
  `wrote ${out} (${(glb.length / 1024).toFixed(1)} KB, ${doc.getRoot().listAnimations().length} clips)`,
);
