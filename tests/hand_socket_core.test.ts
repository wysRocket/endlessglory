// The kawaii (Meshy/Mixamo) bodies carry no authored `handslot` node, so
// `assets.ts` synthesizes one on the wrist. That socket's transform used to be a
// pair of MEASURED constants: a quaternion read off the shipped right wrist and a
// wrist world-scale band with a hand-typed fallback. This test pins the derived
// replacement, and the two properties the constants could not hold:
//
//  1. PER SIDE. The measured quaternion was the right wrist's. The left wrist rests
//     ~85 degrees away on the same rig, so the same constant on `handslot.l` left
//     the socket badly misoriented (latent today: no kawaii def lists a left slot).
//  2. NORMALIZATION-INVARIANT. Sockets are synthesized both during assembly (model
//     space, rig root identity) and later on a runtime gear swap, when the model is
//     already in-scene under the normalize scale/yaw. A world-space read would then
//     bake the character's facing into the socket; deriving against the rig ROOT
//     gives the same answer on both paths.
//
// Like `rig_merge_assets.test.ts`, the second half reads the real committed GLBs.
// A re-export that genuinely changes the rig's wrist rest pose does NOT fail here:
// that is the point of deriving. It fails only if a rig loses the wrist joint or
// arrives at a scale the socket cannot normalize.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HAND_SOCKET_FALLBACK_WRIST_SCALE,
  HAND_SOCKET_RIG_SCALE,
  handSocketTransform,
} from '../src/render/characters/hand_socket_core';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// The right-wrist quaternion that shipped in assets.ts before this derivation
// (`KAWAII_SOCKET_ROT`), recorded here so the equivalence check survives a rig
// re-export. Measured on the shared kawaii skeleton, verified visually in the
// char-create preview: the sword stands upright in the hand.
const LEGACY_RIGHT_SOCKET_ROT = [-0.6923, 0.1793, -0.1798, 0.6755] as const;
// The wrist world scale the legacy band fell back to.
const LEGACY_WRIST_SCALE = 0.0152;
// The right wrist's rest-pose orientation on the OLD shared kawaii skeleton, read
// off the body that shipped when the constant above was measured. Recorded as a
// fixture rather than read from warrior.glb: that body has since been re-rigged
// through Meshy auto-rigging (its old `RightHand` carried no skin weight at all),
// and this check is about the math being equivalent to the constant it replaced,
// not about whatever rig happens to ship today.
const LEGACY_RIGHT_WRIST_REST = [0.6929, -0.1796, 0.1796, 0.6748] as const;

const IDENTITY = [0, 0, 0, 1] as const;

// Upright tolerance for a pose read out of a shipped GLB (radians, ~0.06 degrees).
// The rest pose is recovered by decomposing a chain of quantized node matrices, so
// it carries float noise the pure math does not. Still four orders of magnitude
// tighter than the misorientation this derivation removes (see the per-side case).
const RIG_UPRIGHT_EPS = 1e-3;

function quat(q: readonly [number, number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion(q[0], q[1], q[2], q[3]);
}

/** Angle in radians between two orientations (sign-agnostic: q and -q are equal). */
function angleBetween(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  return quat(a).angleTo(quat(b));
}

/** The socket's orientation in RIG-ROOT space: rigLocalWrist * socketLocal. */
function socketRigRotation(
  wristWorld: readonly [number, number, number, number],
  rootWorld: readonly [number, number, number, number],
  socketLocal: readonly [number, number, number, number],
): [number, number, number, number] {
  const rigLocalWrist = quat(rootWorld).invert().multiply(quat(wristWorld));
  const out = rigLocalWrist.multiply(quat(socketLocal));
  return [out.x, out.y, out.z, out.w];
}

// --- GLB node hierarchy (JSON chunk only; no bin, no textures) ---------------

interface GlbNode {
  name?: string;
  children?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}

function readGlbNodes(path: string): GlbNode[] {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12; // magic, version, length
  while (off < buf.byteLength) {
    const chunkLen = dv.getUint32(off, true);
    const chunkType = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (chunkType === 0x4e4f534a) {
      const json = JSON.parse(new TextDecoder().decode(buf.subarray(start, start + chunkLen)));
      return json.nodes ?? [];
    }
    off = start + chunkLen;
  }
  throw new Error(`bad glb: ${path}`);
}

interface RestPose {
  rotation: [number, number, number, number];
  scale: number;
}

/** Rest-pose orientation and uniform scale of a named node, in RIG-ROOT space.
 *  Throws when the joint is absent: a kawaii body without it cannot carry a
 *  synthesized socket at all, and the prop would ship missing. */
function restPose(nodes: GlbNode[], name: string, source: string): RestPose {
  const index = nodes.findIndex((n) => n.name === name);
  if (index < 0) throw new Error(`${source}: no ${name} joint to synthesize a hand socket on`);
  const parent = new Map<number, number>();
  for (let i = 0; i < nodes.length; i++) {
    for (const child of nodes[i].children ?? []) parent.set(child, i);
  }
  const chain: number[] = [];
  for (let cur: number | undefined = index; cur !== undefined; cur = parent.get(cur))
    chain.unshift(cur);

  const world = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  for (const ni of chain) {
    const n = nodes[ni];
    if (n.matrix) local.fromArray(n.matrix);
    else
      local.compose(
        new THREE.Vector3(),
        new THREE.Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(n.scale ?? [1, 1, 1]),
      );
    world.multiply(local);
  }
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  world.decompose(new THREE.Vector3(), q, s);
  return { rotation: [q.x, q.y, q.z, q.w], scale: s.x };
}

// Every player class, NPC, and mob body sharing the 24-bone kawaii skeleton.
const KAWAII_BODIES = [
  'warrior',
  'paladin',
  'rogue',
  'hunter',
  'mage',
  'priest',
  'shaman',
  'warlock',
  'druid',
  'npc_armorer',
  'npc_dealer',
  'npc_foreman',
  'npc_paladin',
  'npc_smith',
  'mob_hallow',
];
const WRISTS = ['RightHand', 'LeftHand'];

/** A wrist rest pose off the shared skeleton, read from the shipped warrior body. */
function warriorWrist(name: string): RestPose {
  return restPose(readGlbNodes(`${repoRoot}public/models/kawaii/warrior.glb`), name, 'warrior');
}

describe('hand socket derivation', () => {
  it('stands the socket upright: wrist rest pose times socket local is the rig orientation', () => {
    // An arbitrary, deliberately off-axis wrist rest pose.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.4, 0.5, 0.9));
    const wrist: [number, number, number, number] = [q.x, q.y, q.z, q.w];
    const t = handSocketTransform(wrist, IDENTITY, 0.0153, 1);
    expect(angleBetween(socketRigRotation(wrist, IDENTITY, t.rotation), IDENTITY)).toBeLessThan(
      1e-6,
    );
  });

  it('reproduces the measured right-hand constant it replaces', () => {
    const t = handSocketTransform(LEGACY_RIGHT_WRIST_REST, IDENTITY, LEGACY_WRIST_SCALE, 1);
    // Within a tenth of a degree of the hand-measured quaternion: the derivation is
    // the same pose the preview was signed off on, just computed instead of typed.
    expect(angleBetween(t.rotation, LEGACY_RIGHT_SOCKET_ROT)).toBeLessThan(0.002);
    // ...and the same scale the legacy band produced.
    expect(t.scale).toBeCloseTo(HAND_SOCKET_RIG_SCALE / LEGACY_WRIST_SCALE, 0);
  });

  it('is per side: the right-hand constant does NOT stand the left socket upright', () => {
    const left = warriorWrist('LeftHand');

    // The regression this fix removes: reusing the measured right-hand quaternion
    // on the left wrist leaves the grip axis tens of degrees off.
    const legacy = socketRigRotation(left.rotation, IDENTITY, LEGACY_RIGHT_SOCKET_ROT);
    expect(angleBetween(legacy, IDENTITY)).toBeGreaterThan(Math.PI / 4);

    // The derivation gets it right from the same input.
    const t = handSocketTransform(left.rotation, IDENTITY, left.scale, 1);
    expect(
      angleBetween(socketRigRotation(left.rotation, IDENTITY, t.rotation), IDENTITY),
    ).toBeLessThan(RIG_UPRIGHT_EPS);
  });

  it('is normalization-invariant: an in-scene rig gives the assembly-time transform', () => {
    const wrist = warriorWrist('RightHand');
    const atAssembly = handSocketTransform(wrist.rotation, IDENTITY, wrist.scale, 1);

    // Same rig, now parented under the normalize transform and yawed to face west:
    // both the wrist's world rotation and its world scale change.
    const normalize = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.1);
    const normalizeScale = 117.6;
    const wristInScene = normalize.clone().multiply(quat(wrist.rotation));
    const inScene = handSocketTransform(
      [wristInScene.x, wristInScene.y, wristInScene.z, wristInScene.w],
      [normalize.x, normalize.y, normalize.z, normalize.w],
      wrist.scale * normalizeScale,
      normalizeScale,
    );

    expect(angleBetween(inScene.rotation, atAssembly.rotation)).toBeLessThan(1e-6);
    expect(inScene.scale).toBeCloseTo(atAssembly.scale, 6);
  });

  it('falls back instead of dividing by a degenerate wrist scale', () => {
    for (const bad of [0, -1, Number.NaN, 1e-9, 500]) {
      const t = handSocketTransform(IDENTITY, IDENTITY, bad, 1);
      expect(Number.isFinite(t.scale), `wrist scale ${bad} yields a finite socket scale`).toBe(
        true,
      );
      expect(t.scale).toBeCloseTo(HAND_SOCKET_RIG_SCALE / HAND_SOCKET_FALLBACK_WRIST_SCALE, 6);
    }
    // A degenerate rig-root scale must not poison the ratio either.
    const t = handSocketTransform(IDENTITY, IDENTITY, 0.0153, 0);
    expect(Number.isFinite(t.scale)).toBe(true);
  });

  it('returns a normalized quaternion for an unnormalized wrist read', () => {
    const t = handSocketTransform([0, 0.6, 0, 0.6], IDENTITY, 0.0153, 1);
    const len = Math.hypot(...t.rotation);
    expect(len).toBeCloseTo(1, 9);
  });
});

// The socket-validity gate: every shipped kawaii body, both hands.
describe('kawaii rig hand sockets', () => {
  for (const body of KAWAII_BODIES) {
    for (const wristName of WRISTS) {
      it(`${body}: ${wristName} yields an upright, sanely scaled socket`, () => {
        const nodes = readGlbNodes(`${repoRoot}public/models/kawaii/${body}.glb`);
        const wrist = restPose(nodes, wristName, body);

        const t = handSocketTransform(wrist.rotation, IDENTITY, wrist.scale, 1);
        // Grip axis lands on the rig orientation an authored handslot would have.
        const world = socketRigRotation(wrist.rotation, IDENTITY, t.rotation);
        expect(angleBetween(world, IDENTITY), 'socket is upright in rig space').toBeLessThan(
          RIG_UPRIGHT_EPS,
        );
        // And the socket normalizes the tiny authored rig to the in-hand size.
        expect(wrist.scale * t.scale, 'socket world scale').toBeCloseTo(HAND_SOCKET_RIG_SCALE, 6);
      });
    }
  }
});
