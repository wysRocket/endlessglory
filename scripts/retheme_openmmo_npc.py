#!/usr/bin/env python3
"""
Retheme an OpenMMO humanoid GLB into the Emberwood palette.

Produces a 5-class set of distinct rethemed NPC GLBs:
  knight.glb    -> emberwood_knight.glb   (plate-armored infantry, brass + steel)
  paladin.glb   -> emberwood_paladin.glb  (ceremonial guard, gilded copper + white)
  mage.glb      -> emberwood_mage.glb     (robe-mage, deep ember red + gold trim)
  barbarian.glb -> emberwood_barbarian.glb(warrior smith, raw leather + iron)
  rogue.glb     -> emberwood_rogue.glb    (cloaked ranger, dark sienna + bronze)

Keeps the OpenMMO Rig_Medium skeleton + all 22 actions (idle, walk, attack, etc.)
so the game's ClipMap definitions (see src/render/characters/manifest.ts:518-660) keep
working unchanged.

Run headless from the project root:
  blender --background --python scripts/retheme_openmmo_npc.py
"""

import os
import bpy

PROJECT = "/Volumes/ExternalSSD/world-of-claudecraft-emberwood"
SRC_DIR = f"{PROJECT}/public/models/chars/players"
OUT_DIR = f"{PROJECT}/tmp/asset_src/emberwood/npcs"
os.makedirs(OUT_DIR, exist_ok=True)

# Emberwood-palette retheme. Each class gets a distinct palette so the 5 GLBs
# are visually distinct at a glance.
# (body_rgb, accent_rgb, trim_rgb, roughness, metalness)
PALETTES = {
    "knight": {
        "src": f"{SRC_DIR}/knight.glb",
        "out": f"{OUT_DIR}/emberwood_knight.glb",
        "body":  (0.30, 0.28, 0.25),   # dark steel grey-brown
        "metal": (0.55, 0.50, 0.40),   # brass trim
        "trim":  (0.70, 0.55, 0.30),   # brass highlight
        "roughness": 0.55,
        "metalness": 0.65,
    },
    "paladin": {
        "src": f"{SRC_DIR}/paladin.glb",
        "out": f"{OUT_DIR}/emberwood_paladin.glb",
        "body":  (0.32, 0.28, 0.24),   # warm bronze-brown
        "metal": (0.85, 0.70, 0.35),   # bright gilded copper
        "trim":  (0.95, 0.88, 0.65),   # ceremonial gold-white
        "roughness": 0.40,
        "metalness": 0.75,
    },
    "mage": {
        "src": f"{SRC_DIR}/mage.glb",
        "out": f"{OUT_DIR}/emberwood_mage.glb",
        "body":  (0.42, 0.15, 0.12),   # deep ember red
        "metal": (0.80, 0.55, 0.18),   # gold thread
        "trim":  (1.00, 0.75, 0.25),   # glowing gold
        "roughness": 0.70,
        "metalness": 0.30,
    },
    "barbarian": {
        "src": f"{SRC_DIR}/barbarian.glb",
        "out": f"{OUT_DIR}/emberwood_barbarian.glb",
        "body":  (0.36, 0.22, 0.16),   # raw leather
        "metal": (0.40, 0.38, 0.36),   # dark iron
        "trim":  (0.65, 0.40, 0.20),   # copper buckle
        "roughness": 0.85,
        "metalness": 0.30,
    },
    "rogue": {
        "src": f"{SRC_DIR}/rogue.glb",
        "out": f"{OUT_DIR}/emberwood_rogue.glb",
        "body":  (0.22, 0.16, 0.14),   # dark sienna cloak
        "metal": (0.50, 0.40, 0.25),   # bronze dagger
        "trim":  (0.78, 0.50, 0.20),   # warm bronze highlight
        "roughness": 0.75,
        "metalness": 0.40,
    },
    "ranger": {
        "src": f"{SRC_DIR}/ranger.glb",
        "out": f"{OUT_DIR}/emberwood_ranger.glb",
        "body":  (0.28, 0.35, 0.20),   # woodland green
        "metal": (0.50, 0.35, 0.18),   # aged bronze
        "trim":  (0.70, 0.55, 0.25),   # brass fletching
        "roughness": 0.70,
        "metalness": 0.35,
    },
    "priest": {
        "src": f"{SRC_DIR}/mage.glb",
        "out": f"{OUT_DIR}/emberwood_priest.glb",
        "body":  (0.35, 0.18, 0.15),   # burgundy vestment
        "metal": (0.75, 0.60, 0.30),   # gold trim
        "trim":  (0.90, 0.80, 0.55),   # pale gold thread
        "roughness": 0.65,
        "metalness": 0.25,
    },
    "guard": {
        "src": f"{SRC_DIR}/paladin.glb",
        "out": f"{OUT_DIR}/emberwood_guard.glb",
        "body":  (0.20, 0.22, 0.28),   # midnight blue steel
        "metal": (0.65, 0.55, 0.35),   # weathered bronze
        "trim":  (0.80, 0.70, 0.45),   # tarnished gold
        "roughness": 0.50,
        "metalness": 0.70,
    },
    "npc_woman": {
        "src": f"{SRC_DIR}/rogue_hooded.glb",
        "out": f"{OUT_DIR}/emberwood_npc_woman.glb",
        "body":  (0.40, 0.25, 0.18),   # warm russet
        "metal": (0.50, 0.40, 0.30),   # pewter
        "trim":  (0.65, 0.50, 0.30),   # brass button
        "roughness": 0.80,
        "metalness": 0.15,
    },
}


def recolor_material(mat, body, metal, trim, rough, metalness):
    """Override a Principled BSDF material with the given palette."""
    if not mat or not mat.use_nodes:
        if mat:
            mat.use_nodes = True
        else:
            return
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        return
    # 3-slot tint: assign the dominant body color to Base Color, then bias the
    # bsdf toward the metal/trim feel via Roughness/Metallic.
    bsdf.inputs["Base Color"].default_value = (*body, 1.0)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = rough
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metalness


def retheme_class(spec):
    """Open, recolor, and re-export one class."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if not os.path.exists(spec["src"]):
        print(f"  SKIP (missing): {spec['src']}")
        return False
    bpy.ops.import_scene.gltf(filepath=spec["src"])
    body_rgb = spec["body"]
    metal_rgb = spec["metal"]
    trim_rgb = spec["trim"]
    # Recolor every material across all meshes. Each mesh may have 1-3 materials
    # (body, accessory, weapon). Cycle through the 3 palette slots so different
    # sub-meshes pick up different accents, keeps the retheme visually rich.
    palette_slots = [body_rgb, metal_rgb, trim_rgb]
    roughness = spec["roughness"]
    metalness = spec["metalness"]
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for i, mat in enumerate(obj.data.materials):
            if not mat:
                continue
            slot = palette_slots[i % 3]
            recolor_material(mat, slot, metal_rgb, trim_rgb, roughness, metalness)
    # Export GLB; keep armature + all 22 actions. Rig_Medium stays intact.
    bpy.ops.export_scene.gltf(
        filepath=spec["out"],
        export_format="GLB",
        use_selection=False,
        export_animations=True,
        export_yup=True,
    )
    print(f"  EXPORTED {os.path.basename(spec['out'])}  ({os.path.getsize(spec['out'])} bytes)")
    return True


def main():
    print("=== Emberwood NPC retheme (5 classes) ===")
    for name, spec in PALETTES.items():
        print(f"-- {name}")
        retheme_class(spec)
    print("=== done ===")


if __name__ == "__main__":
    main()
