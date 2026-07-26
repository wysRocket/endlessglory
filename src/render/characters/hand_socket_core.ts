// Pure, Three-free transform math for a SYNTHESIZED handslot socket.
//
// The held-weapon system (VariantGrip sizing, WEAPON_GRIP_OVERRIDES, back-carry,
// stow, offhand, weapon skins) keys off the KayKit `handslot.r`/`handslot.l`
// bones: empty nodes authored in the palm at the grip orientation. The Meshy
// kawaii bodies are Mixamo-rigged and carry only the `RightHand`/`LeftHand` WRIST
// joints, so `assets.ts` synthesizes the missing socket as an empty child of the
// wrist. This module owns the transform that empty gets; `assets.ts` is the thin
// Three consumer that builds the Object3D.
//
// Both parts are DERIVED from the rig, never measured constants:
//
//  - Rotation cancels the wrist's rest-pose orientation so the socket's grip axis
//    lands where an authored handslot would sit. Measuring it once meant the right
//    wrist's value was reused on the left wrist, which rests ~85 degrees away on
//    the same skeleton.
//  - Scale normalizes the authored rig (the kawaii bodies are modelled tiny, wrist
//    scale ~0.0153) up to the in-hand size, so a weapon placed by the variant grip
//    is not millimetres tall.
//
// Everything is expressed against the RIG ROOT rather than world space, because a
// socket is synthesized on two paths: during assembly (model space, root identity)
// and later on a runtime gear swap, when the model is already in-scene under the
// normalize scale/yaw. A world-space read would bake the character's facing and
// normalize scale into the socket; the rig-root-relative read gives the same
// answer on both. Pinned by `tests/hand_socket_core.test.ts`.

export type SocketQuat = readonly [number, number, number, number];

/** Socket size in RIG-LOCAL (pre-normalize) units, i.e. what an authored handslot
 *  bakes in. Reproduces the in-hand size signed off in the char-create preview:
 *  a 1H sword reads ~0.72 units on the ~1.8-unit chibi body. */
export const HAND_SOCKET_RIG_SCALE = 0.4056;

/** Plausibility band for a kawaii wrist's rig-local scale. Outside it the read is
 *  a bind-pose leftover or a rig we cannot normalize, so we use the recorded
 *  scale of the shared skeleton rather than divide by a nonsense number. */
export const HAND_SOCKET_MIN_WRIST_SCALE = 0.005;
export const HAND_SOCKET_MAX_WRIST_SCALE = 0.05;
export const HAND_SOCKET_FALLBACK_WRIST_SCALE = 0.0152;

export interface HandSocketTransform {
  /** Local rotation of the socket on its wrist bone, as [x, y, z, w]. */
  rotation: [number, number, number, number];
  /** Local uniform scale of the socket on its wrist bone. */
  scale: number;
}

/** Hamilton product of two quaternions. */
function multiply(a: SocketQuat, b: SocketQuat): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Conjugate, i.e. the inverse of a unit quaternion. */
function conjugate(q: SocketQuat): [number, number, number, number] {
  return [-q[0], -q[1], -q[2], q[3]];
}

function normalize(q: SocketQuat): [number, number, number, number] {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(len > 0)) return [0, 0, 0, 1];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/**
 * The local transform for a handslot socket parented to a Mixamo wrist joint.
 *
 * @param wristWorldRotation  wrist orientation in world space
 * @param rigRootWorldRotation  the model root's orientation in world space
 * @param wristWorldScale  wrist uniform scale in world space
 * @param rigRootWorldScale  the model root's uniform scale in world space
 */
export function handSocketTransform(
  wristWorldRotation: SocketQuat,
  rigRootWorldRotation: SocketQuat,
  wristWorldScale: number,
  rigRootWorldScale: number,
): HandSocketTransform {
  // The wrist's rest pose relative to the rig root, with any normalize yaw and the
  // character's facing divided out. Cancelling it is exactly what an authored
  // handslot node bakes in, and the socket still swings with the wrist in
  // animation because it stays the wrist's child.
  const root = normalize(rigRootWorldRotation);
  const rigLocalWrist = multiply(conjugate(root), normalize(wristWorldRotation));

  const rootScale = rigRootWorldScale > 0 ? rigRootWorldScale : 1;
  let wrist = wristWorldScale / rootScale;
  if (!(wrist > HAND_SOCKET_MIN_WRIST_SCALE && wrist < HAND_SOCKET_MAX_WRIST_SCALE)) {
    wrist = HAND_SOCKET_FALLBACK_WRIST_SCALE;
  }

  return {
    rotation: normalize(conjugate(rigLocalWrist)),
    scale: HAND_SOCKET_RIG_SCALE / wrist,
  };
}
