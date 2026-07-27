// The kawaii bodies are auto-rigged, and auto-rig quality is NOT uniform: a body
// can ship with a hand bone that influences no vertices at all. That is invisible
// until something is attached to it, and then the weapon floats free of the fist
// with nothing in the code to blame.
//
// The warrior is exactly that: `RightHand` carries 0.0 total skin weight and its
// joint sits ~0.2 units PAST the end of the arm mesh, so the whole arm rides
// `RightArm` and an attached sword hangs in the air beside the body. No amount of
// socket transform math fixes it, because the bone is not in the hand.
//
// Re-rigging it is not a quick fix either: Meshy auto-rigging, which produces a
// clean skeleton for a plain chibi, fails on this body (17 of 24 joints unweighted)
// because the cape and pauldrons merge the limbs into one silhouette, and its own
// docs require "clearly defined limbs". So the warrior stays unarmed for now.
//
// So before a body is armed via `kawaiiArmed`, its hand bone has to be real. This
// reads the shipped GLBs and pins which bodies have a usable hand, so arming one
// that does not fails here instead of in someone's screenshot.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

interface Glb {
  json: Record<string, any>;
  bin: Uint8Array;
}

function readGlb(path: string): Glb {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12; // magic, version, length
  let json: Record<string, any> | null = null;
  let bin: Uint8Array | null = null;
  while (off < buf.byteLength) {
    const chunkLen = dv.getUint32(off, true);
    const chunkType = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (chunkType === 0x4e4f534a)
      json = JSON.parse(new TextDecoder().decode(buf.subarray(start, start + chunkLen)));
    else if (chunkType === 0x004e4942) bin = buf.subarray(start, start + chunkLen);
    off = start + chunkLen;
  }
  if (!json || !bin) throw new Error(`bad glb: ${path}`);
  return { json, bin };
}

/** Raw bytes of a bufferView, transparently decoding EXT_meshopt_compression. */
function bufferViewBytes(glb: Glb, index: number): Uint8Array {
  const bv = glb.json.bufferViews[index];
  const meshopt = bv.extensions?.EXT_meshopt_compression;
  if (!meshopt) {
    const start = bv.byteOffset ?? 0;
    return glb.bin.subarray(start, start + bv.byteLength);
  }
  const source = glb.bin.subarray(
    meshopt.byteOffset ?? 0,
    (meshopt.byteOffset ?? 0) + meshopt.byteLength,
  );
  const out = new Uint8Array(meshopt.count * meshopt.byteStride);
  MeshoptDecoder.decodeGltfBuffer(
    out,
    meshopt.count,
    meshopt.byteStride,
    source,
    meshopt.mode,
    meshopt.filter,
  );
  return out;
}

const CTOR: Record<number, any> = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function accessor(glb: Glb, index: number) {
  const a = glb.json.accessors[index];
  const bytes = bufferViewBytes(glb, a.bufferView);
  const TA = CTOR[a.componentType];
  const n = COMPONENTS[a.type];
  const bv = glb.json.bufferViews[a.bufferView];
  const stride = bv.byteStride || TA.BYTES_PER_ELEMENT * n;
  const start = a.byteOffset ?? 0;
  const out = new TA(a.count * n);
  for (let e = 0; e < a.count; e++) {
    const src = new TA(bytes.buffer, bytes.byteOffset + start + e * stride, n);
    for (let c = 0; c < n; c++) out[e * n + c] = src[c];
  }
  return { arr: out, count: a.count, normalized: !!a.normalized, TA };
}

/** Total skin weight each joint of a kawaii body carries, by joint name. */
function jointWeights(path: string): Record<string, number> {
  const glb = readGlb(path);
  const names: string[] = (glb.json.nodes ?? []).map((n: any) => n.name);
  const joints: string[] = (glb.json.skins?.[0]?.joints ?? []).map((i: number) => names[i]);
  const prim = glb.json.meshes[0].primitives[0];
  const J = accessor(glb, prim.attributes.JOINTS_0);
  const W = accessor(glb, prim.attributes.WEIGHTS_0);
  const denom = W.normalized ? (W.TA === Uint8Array ? 255 : 65535) : 1;
  const total: Record<string, number> = {};
  for (const name of joints) total[name] = 0;
  for (let v = 0; v < J.count; v++) {
    for (let k = 0; k < 4; k++) {
      const w = W.arr[v * 4 + k] / denom;
      if (w > 0.0001) total[joints[J.arr[v * 4 + k]]] += w;
    }
  }
  return total;
}

// A hand bone below this carries a handful of stray vertices at most, which is
// indistinguishable from unrigged: a weapon on it will not track the fist.
const USABLE_HAND_WEIGHT = 50;

const kawaiiBodies = () =>
  Object.entries(VISUALS)
    .filter(([, def]) => def.url.startsWith('models/kawaii/'))
    .map(([key, def]) => ({ key, url: def.url }));

describe('kawaii rig hands', () => {
  beforeAll(async () => {
    await MeshoptDecoder.ready;
  });

  it('every body armed via a handslot attach has a usable hand bone', () => {
    const armed = kawaiiBodies().filter(({ key }) =>
      (VISUALS[key].attach ?? []).some((a) => /^handslot/.test(a.bone)),
    );
    for (const { key, url } of armed) {
      const w = jointWeights(`${repoRoot}public/${url}`);
      expect(
        w.RightHand ?? 0,
        `${key} is armed on handslot.r but its RightHand bone carries ${w.RightHand ?? 0} skin weight; a weapon there will float free of the fist (re-rig the body first)`,
      ).toBeGreaterThan(USABLE_HAND_WEIGHT);
    }
  });

  it('pins which kawaii bodies still have an unusable hand bone', () => {
    const unusable = kawaiiBodies()
      .filter(
        ({ url }) =>
          (jointWeights(`${repoRoot}public/${url}`).RightHand ?? 0) <= USABLE_HAND_WEIGHT,
      )
      .map(({ key }) => key)
      .sort();
    // All of these carry baked weapons, so nothing floats today, but none can be
    // armed until its body is re-rigged with a hand bone that owns the fist.
    expect(unusable).toEqual([
      'mob_hallow',
      'npc_armorer',
      'npc_dealer',
      'player_mage',
      'player_paladin',
      'player_shaman',
    ]);
  });

  // The warrior is why this suite exists: `RightHand` carried 0.0 skin weight, so an
  // attached sword floated free of the fist and the class shipped unarmed. Rather than
  // patch weights, the body was re-generated already holding its sword, in an A-pose
  // with the limbs separated (auto-rigging needs that; the old hero pose merged arms,
  // cape and pauldrons into one silhouette and left 17 of 24 joints unweighted). Both
  // hands now carry real weight, which is what keeps the baked sword on the fist.
  it('the re-generated warrior owns both fists, which is what carries its baked sword', () => {
    const w = jointWeights(`${repoRoot}public/models/kawaii/warrior.glb`);
    expect(w.RightHand).toBeGreaterThan(USABLE_HAND_WEIGHT);
    expect(w.LeftHand).toBeGreaterThan(USABLE_HAND_WEIGHT);
  });
});
