// Per-material look overrides, keyed `${kit}:${name}` (falls back to name).
// A LEAF module on purpose: both props.ts and emberwood/materials.ts need this
// table, and having emberwood/materials.ts import it from props.ts created an
// import cycle. Vitest resolved that cycle lazily and stayed green, but Rollup
// emitted materials.ts first, so the spread read an undefined binding and
// silently produced an empty override table in the shipped bundle. Keeping the
// data in a module with no imports of its own makes that failure impossible.
//
// Kenney/Quaternius flat materials need small nudges to sit in our lighting.
export interface MatOverride {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
}

export const MAT_OVERRIDES: Record<string, MatOverride> = {
  'village:Windows': { emissive: 0x2a3c55, emissiveIntensity: 1.1, roughness: 0.4 },
  'village:Bell': { metalness: 0.6, roughness: 0.35 },
  // Emberwood village palette, applied per material so a building still reads
  // as beams + plaster + tile + stone rather than one flat wash. Warm, muted,
  // and desaturated to match the Emberwood direction (soot, oak, ember, brass).
  'village:Wood': { color: 0x6b4a32, roughness: 0.85 },
  'village:Wood_Side': { color: 0x5c4229, roughness: 0.85 },
  'village:Wood_Light': { color: 0x9a7a4e, roughness: 0.8 },
  'village:Plaster': { color: 0xcbb790, roughness: 0.95 },
  'village:RoofTiles': { color: 0x8c4a33, roughness: 0.8 },
  'village:Stone': { color: 0x8a8378, roughness: 0.9 },
  'village:Stone_Light': { color: 0x9c958a, roughness: 0.9 },
  'village:Stone_Dark': { color: 0x6e675e, roughness: 0.9 },
  'ore:Stone_Dark': { color: 0xb87333, metalness: 0.45, roughness: 0.5 },
  // bandit/cult tents: weathered canvas instead of Kenney's toy red
  'tent:colorRed': { color: 0x9c8662 },
  'tent:colorRedDark': { color: 0x6e5c42 },
  // murloc huts: a giant mushroom recolored to read as a woven thatch dome
  'shroom:colorRed': { color: 0xb29459 },
  'shroom:_defaultMat': { color: 0xc9b896 },
  // mine mound: Kenney nature rocks are beige dirt + teal grass - regrade to
  // granite with a dull moss cap so the pile reads as blasted rock
  'minerock:dirt': { color: 0x82868a },
  'minerock:grass': { color: 0x77846a },
  'minerock:_defaultMat': { color: 0x6f7376 },
  // graveyard colormap is near-white; knock it toward weathered stone
  'grave:colormap': { color: 0xd2d2c8 },
};
