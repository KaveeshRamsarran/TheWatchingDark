# THE WATCHING DARK - model builder
# Generates the Watcher (rigged + skinned), forest trees and the flashlight, then exports GLB files.
#
# Run:  blender -b --factory-startup --python tools/blender/build_models.py -- <out_dir> [preview]
# Then: node tools/pack_assets.mjs <out_dir> js/assets.js
#
# Blender is Z-up with the front facing -Y; the glTF exporter converts to three.js
# Y-up with the front facing +Z.

import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector, Matrix, noise

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "tools/build")
PREVIEW = len(argv) > 1 and argv[1] == "preview"
ONLY = argv[2] if len(argv) > 2 else "all"
os.makedirs(OUT, exist_ok=True)


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifiers(obj):
    activate(obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def material(name, color=(0.5, 0.5, 0.5, 1)):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = color
    return m


def skin_mesh(name, verts, edges, radii, roots=(0,), subsurf=1, smooth=True):
    """Build a mesh from a vertex/edge skeleton using the Skin modifier."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], edges, [])
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    activate(obj)
    bpy.ops.object.modifier_add(type="SKIN")
    obj.modifiers[-1].use_smooth_shade = smooth
    obj.modifiers[-1].branch_smoothing = 0.6
    layer = me.skin_vertices[0].data
    for i, r in enumerate(radii):
        rx, ry = (r, r) if not isinstance(r, tuple) else r
        layer[i].radius = (max(rx, 0.002), max(ry, 0.002))
        layer[i].use_root = i in roots
    if subsurf:
        sub = obj.modifiers.new("Sub", "SUBSURF")
        sub.levels = subsurf
        sub.render_levels = subsurf
    apply_modifiers(obj)
    return obj


def lathe(name, profile, segments=24, radial_noise=None, axis_offset=(0, 0, 0), cap_top=True, cap_bottom=True):
    """Revolve a (radius, z) profile around Z. radial_noise(angle, z) -> scale factor."""
    bm = bmesh.new()
    rings = []
    ox, oy, oz = axis_offset
    for (r, z) in profile:
        ring = []
        for s in range(segments):
            a = s / segments * math.tau
            k = radial_noise(a, z) if radial_noise else 1.0
            ring.append(bm.verts.new((ox + math.cos(a) * r * k, oy + math.sin(a) * r * k, oz + z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(segments):
            a, b = rings[i][s], rings[i][(s + 1) % segments]
            c, d = rings[i + 1][(s + 1) % segments], rings[i + 1][s]
            bm.faces.new((a, b, c, d))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    for p in me.polygons:
        p.use_smooth = True
    return obj


def join(objs, name):
    activate(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def smart_uv(obj, world_size):
    """Smart-project UVs, then rescale so 1 UV unit == world_size metres (uniform texel density)."""
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    me = obj.data
    uv = me.uv_layers.active.data
    area3, area_uv = 0.0, 0.0
    for p in me.polygons:
        area3 += p.area
        pts = [uv[li].uv for li in p.loop_indices]
        a = 0.0
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            a += x1 * y2 - x2 * y1
        area_uv += abs(a) / 2
    if area_uv > 0:
        k = math.sqrt(area3 / area_uv) / world_size
        for l in uv:
            l.uv = l.uv * k


def decimate(obj, target_tris):
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris <= target_tris:
        return
    m = obj.modifiers.new("Dec", "DECIMATE")
    m.ratio = target_tris / tris
    apply_modifiers(obj)


def export(objs, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=False,
        export_yup=True, export_skins=True, export_animations=False, export_morph=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=False, export_extras=False, export_draco_mesh_compression_enable=False,
        export_def_bones=True, export_leaf_bone=False,
    )
    print("EXPORTED", path, os.path.getsize(path))


def preview(name, target=(0, 0, 1.3), dist=4.2, height=1.5, lens=50, size=640):
    """Quick Cycles render for checking a model."""
    if not PREVIEW:
        return
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.device = "CPU"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    world = bpy.data.worlds.new("w") if not scene.world else scene.world
    scene.world = world
    world.color = (0.05, 0.05, 0.06)
    for o in list(bpy.data.objects):
        if o.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(o)
    for ang, energy in ((-40, 900), (130, 500)):
        ld = bpy.data.lights.new("l", "AREA")
        ld.energy = energy
        ld.size = 3
        lo = bpy.data.objects.new("l", ld)
        a = math.radians(ang)
        lo.location = (math.sin(a) * 4, -math.cos(a) * 4, 3.5)
        bpy.context.collection.objects.link(lo)
        lo.rotation_euler = (Vector(target) - lo.location).to_track_quat("-Z", "Y").to_euler()
    cd = bpy.data.cameras.new("c")
    cd.lens = lens
    co = bpy.data.objects.new("c", cd)
    bpy.context.collection.objects.link(co)
    co.location = (dist * 0.45, -dist, height)
    co.rotation_euler = (Vector(target) - co.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = co
    scene.render.filepath = os.path.join(OUT, "preview_" + name + ".png")
    bpy.ops.render.render(write_still=True)


# -----------------------------------------------------------------------------
# THE WATCHER
# Hunched, emaciated, arms long enough to drag its claws, and the wide flared
# crown from the jumpscare. A gaunt face sits in the throat of the crown with two
# deep sockets and a lipless gash of needle teeth on a jaw bone.
# -----------------------------------------------------------------------------
HO = (0.0, -0.3, 2.06)          # head origin: base of the crown
FACE_EYE_Z = 0.21               # eye height above HO
FACE_MOUTH_Z = 0.1              # mouth height above HO
HEAD_PROFILE = [                # (radius, height above HO)
    (0.05, -0.05), (0.075, 0.0), (0.1, 0.06), (0.125, 0.13), (0.15, 0.2), (0.19, 0.27),
    (0.29, 0.34), (0.5, 0.4), (0.74, 0.435), (0.84, 0.46), (0.8, 0.485), (0.5, 0.505), (0.16, 0.52)
]


def head_radius_at(h):
    for (r0, z0), (r1, z1) in zip(HEAD_PROFILE, HEAD_PROFILE[1:]):
        if z0 <= h <= z1:
            return r0 + (r1 - r0) * (h - z0) / (z1 - z0)
    return HEAD_PROFILE[-1][0]


def hv(x, y, z):
    return (HO[0] + x, HO[1] + y, HO[2] + z)


MOUTH_C = hv(0, -head_radius_at(FACE_MOUTH_Z) + 0.006, FACE_MOUTH_Z)

BONES = {
    # name: (head, tail, parent)
    "hips": ((0, 0.04, 1.0), (0, 0.04, 1.14), None),
    "spine": ((0, 0.04, 1.14), (0, 0.06, 1.48), "hips"),
    "chest": ((0, 0.06, 1.48), (0, -0.08, 1.84), "spine"),
    "neck": ((0, -0.08, 1.84), HO, "chest"),
    "head": (HO, hv(0, 0, 0.4), "neck"),
    "jaw": (MOUTH_C, (MOUTH_C[0], MOUTH_C[1] - 0.05, MOUTH_C[2]), "head"),
}
for side, sx in (("L", 1), ("R", -1)):
    BONES.update({
        f"shoulder_{side}": ((sx * 0.06, -0.04, 1.8), (sx * 0.3, -0.02, 1.8), "chest"),
        f"upperarm_{side}": ((sx * 0.3, -0.02, 1.8), (sx * 0.4, 0.02, 1.16), f"shoulder_{side}"),
        f"forearm_{side}": ((sx * 0.4, 0.02, 1.16), (sx * 0.44, -0.1, 0.58), f"upperarm_{side}"),
        f"hand_{side}": ((sx * 0.44, -0.1, 0.58), (sx * 0.47, -0.15, 0.44), f"forearm_{side}"),
        f"thigh_{side}": ((sx * 0.12, 0.04, 1.0), (sx * 0.16, -0.14, 0.56), "hips"),
        f"shin_{side}": ((sx * 0.16, -0.14, 0.56), (sx * 0.13, 0.1, 0.1), f"thigh_{side}"),
        f"foot_{side}": ((sx * 0.13, 0.1, 0.1), (sx * 0.13, -0.18, 0.02), f"shin_{side}"),
    })


def build_watcher():
    reset()
    V = Vector
    verts, edges, radii = [], [], []

    def add(p, r, parent=None):
        verts.append(V(p))
        radii.append(r)
        i = len(verts) - 1
        if parent is not None:
            edges.append((parent, i))
        return i

    # Spine curls forward: pinched waist, deep ribcage, neck jutting out from the shoulders
    pelvis = add((0, 0.04, 1.0), (0.15, 0.1))
    waist = add((0, 0.07, 1.2), (0.08, 0.065), pelvis)
    belly = add((0, 0.08, 1.36), (0.095, 0.075), waist)
    ribs = add((0, 0.06, 1.54), (0.17, 0.13), belly)
    chest = add((0, -0.02, 1.7), (0.19, 0.13), ribs)
    shoulders = add((0, -0.05, 1.8), (0.14, 0.1), chest)
    neck1 = add((0, -0.14, 1.9), (0.055, 0.05), shoulders)
    neck2 = add((0, -0.24, 1.98), (0.045, 0.045), neck1)
    add(hv(0, 0, -0.02), (0.05, 0.05), neck2)

    for sx in (1, -1):
        sh = add((sx * 0.3, -0.02, 1.8), (0.06, 0.055), shoulders)
        el = add((sx * 0.4, 0.02, 1.16), (0.034, 0.034), sh)
        wr = add((sx * 0.44, -0.1, 0.58), (0.025, 0.021), el)
        palm = add((sx * 0.46, -0.13, 0.49), (0.042, 0.018), wr)
        # Long splayed fingers ending in hooked claws
        for f in range(4):
            spread = (f - 1.5) * 0.035
            fx = sx * 0.46 + spread * sx
            k1 = add((fx + spread * 0.6 * sx, -0.16, 0.37), (0.011, 0.011), palm)
            k2 = add((fx + spread * 1.2 * sx, -0.19, 0.25), (0.009, 0.009), k1)
            k3 = add((fx + spread * 1.4 * sx, -0.18, 0.15), (0.006, 0.006), k2)
            add((fx + spread * 1.3 * sx - sx * 0.01, -0.12, 0.09), (0.0015, 0.0015), k3)
        thumb = add((sx * 0.41, -0.18, 0.47), (0.01, 0.01), palm)
        add((sx * 0.38, -0.23, 0.37), (0.0015, 0.0015), thumb)

        hip = add((sx * 0.12, 0.04, 0.98), (0.068, 0.068), pelvis)
        knee = add((sx * 0.16, -0.14, 0.56), (0.042, 0.042), hip)
        ankle = add((sx * 0.13, 0.1, 0.1), (0.03, 0.03), knee)
        toe = add((sx * 0.13, -0.12, 0.03), (0.035, 0.015), ankle)
        for t in (-1, 0, 1):
            add((sx * 0.13 + t * 0.032, -0.25, 0.012), (0.007, 0.007), toe)

    body = skin_mesh("WatcherBody", verts, edges, radii, roots=(pelvis,), subsurf=2)

    # Ribs and spine knuckles pushed out through the skin (torso only)
    for v in body.data.vertices:
        p, n = v.co, v.normal
        if abs(p.x) < 0.21 and 1.4 < p.z < 1.78 and n.y < 0.5:
            band = max(0.0, math.sin((p.z - 1.4) / 0.062 * math.pi)) ** 3
            side = min(1.0, abs(n.x) * 1.6 + max(0.0, -n.y))
            v.co += n * band * side * 0.013
        if abs(p.x) < 0.05 and 1.05 < p.z < 1.86 and n.y > 0.55:
            knob = max(0.0, math.sin((p.z - 1.05) / 0.055 * math.pi)) ** 4
            v.co += n * knob * 0.02
        if abs(p.x) < 0.12 and 1.22 < p.z < 1.42 and n.y < -0.5:
            v.co -= n * 0.012 * math.sin((p.z - 1.22) / 0.2 * math.pi)

    # Crown with a torn rim
    def rim_noise(a, z):
        if z < 0.36:
            return 1.0
        tear = noise.noise(Vector((math.cos(a) * 3.0, math.sin(a) * 3.0, z * 4.0)))
        return 1.0 + tear * 0.1 * (z - 0.36) / 0.14

    # Dense resampled profile so the face can be sculpted
    dense = []
    for (r0, z0), (r1, z1) in zip(HEAD_PROFILE, HEAD_PROFILE[1:]):
        steps = max(2, int(math.hypot(r1 - r0, z1 - z0) / 0.012))
        for k in range(steps):
            t = k / steps
            dense.append((r0 + (r1 - r0) * t, z0 + (z1 - z0) * t))
    dense.append(HEAD_PROFILE[-1])
    head = lathe("WatcherHead", dense, segments=96, radial_noise=rim_noise, axis_offset=HO, cap_bottom=False)
    ho = Vector(HO)
    eye_r = head_radius_at(FACE_EYE_Z)
    eyes = [Vector(hv(ex, -math.sqrt(max(eye_r ** 2 - ex ** 2, 0.0)), FACE_EYE_Z)) for ex in (-0.07, 0.07)]
    mouth_c = Vector(MOUTH_C)
    for v in head.data.vertices:
        p = v.co
        rel = p - ho
        r = math.hypot(rel.x, rel.y)
        if r > 0.45:
            v.co.z -= (r - 0.45) ** 2 * 0.55 * (0.6 + 0.4 * abs(rel.x) / max(r, 1e-4))
        front = max(0.0, -rel.y / max(r, 1e-4))  # 1 on the face, 0 at the sides/back
        # Deep eye sockets
        for e in eyes:
            d = (e - p).length
            if d < 0.065:
                v.co.y += 0.068 * (1 - d / 0.065) ** 1.5
        # Heavy brow ridge over the sockets
        if 0.24 < rel.z < 0.29 and abs(rel.x) < 0.14:
            v.co.y -= 0.016 * front * math.sin((rel.z - 0.24) / 0.05 * math.pi) * (1 - abs(rel.x) / 0.14)
        # Sharp cheekbones
        for cx in (-0.085, 0.085):
            d = math.hypot(rel.x - cx, rel.z - 0.155)
            if d < 0.04:
                v.co.y -= 0.01 * front * (1 - d / 0.04)
        # Nasal slits
        for nx in (-0.012, 0.012):
            d = math.hypot(rel.x - nx, (rel.z - 0.15) * 0.5)
            if d < 0.012:
                v.co.y += 0.02 * front * (1 - d / 0.012)
        # Wide lipless gash
        mz = rel.z - FACE_MOUTH_Z
        if abs(mz) < 0.03 and abs(rel.x) < 0.095:
            v.co.y += 0.04 * front * (1 - (abs(mz) / 0.03) ** 2) * (1 - (abs(rel.x) / 0.095) ** 2)

    # Black maw (split between head and jaw) and needle teeth
    maw = lathe("WatcherMaw", [(0.0005, 0), (0.075, 0.0)], segments=28, cap_bottom=False, cap_top=False)
    for v in maw.data.vertices:
        x, y = v.co.x, v.co.y
        v.co = Vector((x, 0.0, y * 0.32)) + mouth_c + Vector((0, 0.02, 0))
    maw.data.materials.append(material("Maw", (0, 0, 0, 1)))
    teeth = []
    rng = random.Random(7)
    for zoff, sign in ((0.011, -1), (-0.011, 1)):
        for i in range(15):
            t = (i / 14) * 2 - 1
            x = t * 0.08
            ln = rng.uniform(0.03, 0.05) * (1 - abs(t) * 0.45)
            bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.006, radius2=0.0, depth=ln)
            tooth = bpy.context.active_object
            tooth.rotation_euler = ((math.pi if sign > 0 else 0) + rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 0)
            curve_y = abs(t) ** 2 * 0.03
            tooth.location = mouth_c + Vector((x, 0.004 + curve_y, zoff - sign * ln * 0.35))
            teeth.append(tooth)
    for t in teeth:
        activate(t)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    teeth_obj = join(teeth, "WatcherTeeth")
    teeth_obj.data.materials.append(material("Teeth", (0.6, 0.55, 0.45, 1)))

    body.data.materials.append(material("Skin", (0.05, 0.04, 0.05, 1)))
    head.data.materials.append(material("Skin"))
    watcher = join([body, head, maw, teeth_obj], "Watcher")
    decimate(watcher, 11000)
    smart_uv(watcher, 0.5)

    # Armature
    arm_data = bpy.data.armatures.new("WatcherRig")
    rig = bpy.data.objects.new("WatcherRig", arm_data)
    bpy.context.collection.objects.link(rig)
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name, (h, t, parent) in BONES.items():
        b = arm_data.edit_bones.new(name)
        b.head = h
        b.tail = t
        b.roll = 0
        eb[name] = b
    for name, (h, t, parent) in BONES.items():
        if parent:
            eb[name].parent = eb[parent]
            eb[name].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")

    # Skin weights: nearest two bone segments, with hard rules for the crown, face and jaw
    segs = {n: (Vector(h), Vector(t)) for n, (h, t, _) in BONES.items() if n != "jaw"}

    def seg_dist(p, a, b):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        return (a + ab * t - p).length

    groups = {n: watcher.vertex_groups.new(name=n) for n in BONES}
    mat_names = [m.name for m in watcher.data.materials]
    vert_mat = {}
    for poly in watcher.data.polygons:
        for vi in poly.vertices:
            vert_mat[vi] = mat_names[poly.material_index]

    for v in watcher.data.vertices:
        p = v.co
        m = vert_mat.get(v.index, "Skin")
        rel = p - mouth_c
        if m in ("Maw", "Teeth"):
            groups["jaw" if rel.z < -0.002 else "head"].add([v.index], 1.0, "REPLACE")
            continue
        rh = p - ho
        if rh.z > -0.01 and math.hypot(rh.x, rh.y) < 0.95:
            if abs(rel.x) < 0.085 and -0.032 < rel.z < -0.003 and rh.y < -0.03:
                groups["jaw"].add([v.index], 1.0, "REPLACE")
            else:
                groups["head"].add([v.index], 1.0, "REPLACE")
            continue
        cands = []
        for n, (a, b) in segs.items():
            if n.endswith("_L") and p.x < -0.02:
                continue
            if n.endswith("_R") and p.x > 0.02:
                continue
            cands.append((seg_dist(p, a, b), n))
        cands.sort()
        best = cands[:2]
        w = [1.0 / max(d, 0.01) ** 4 for d, _ in best]
        s = sum(w)
        for (d, n), wi in zip(best, w):
            if wi / s > 0.02:
                groups[n].add([v.index], wi / s, "REPLACE")

    watcher.parent = rig
    mod = watcher.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    preview("watcher", target=(0, -0.1, 1.45), dist=3.4, height=1.6)
    # Close-up of the face
    if PREVIEW:
        bpy.context.scene.camera.location = (0.25, -1.3, 2.3)
        bpy.context.scene.camera.rotation_euler = (Vector(hv(0, 0, 0.15)) - bpy.context.scene.camera.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.render.filepath = os.path.join(OUT, "preview_watcher_face.png")
        bpy.ops.render.render(write_still=True)
    export([rig], "watcher.glb")


# -----------------------------------------------------------------------------
# TREES
# -----------------------------------------------------------------------------
def rotate_away(d, angle, rng):
    axis = d.cross(Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 0.3)))).normalized()
    if axis.length < 0.1:
        axis = Vector((1, 0, 0))
    return (Matrix.Rotation(angle, 3, axis) @ d).normalized()


def build_tree(kind, seed):
    rng = random.Random(seed)
    verts, edges, radii, tips = [], [], [], []

    def add(p, r, parent):
        verts.append(Vector(p))
        radii.append(r)
        i = len(verts) - 1
        if parent is not None:
            edges.append((parent, i))
        return i

    root = add((0, 0, -0.3), 0.0, None)
    radii[root] = 0.42 if kind != "pine" else 0.32

    if kind == "pine":
        height = rng.uniform(11, 15)
        segs = 14
        prev = root
        for s in range(1, segs + 1):
            z = -0.3 + height * s / segs
            r = 0.3 * (1 - s / segs) ** 1.1 + 0.02
            p = (rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), z)
            cur = add(p, r, prev)
            prev = cur
            # Drooping whorls of branches, longer at the bottom
            if z > 2.2:
                t = (z - 2.2) / (height - 2.2)
                n = rng.randint(4, 6)
                off = rng.uniform(0, math.tau)
                for k in range(n):
                    a = off + k / n * math.tau + rng.uniform(-0.3, 0.3)
                    length = (1 - t) * 3.0 + 0.4
                    b0 = cur
                    bp = Vector(p)
                    for j in range(3):
                        droop = -0.18 - j * 0.22
                        bp = bp + Vector((math.cos(a), math.sin(a), droop)).normalized() * (length / 3)
                        b0 = add(bp, max(0.012, r * 0.28 * (1 - j / 3)), b0)
                        tips.append((bp.copy(), Vector((math.cos(a), math.sin(a), 0)), length))
        tips.append((Vector((0, 0, height - 0.3)), Vector((0, 0, 1)), 0.8))
    else:
        dead = kind == "dead"
        trunk_h = rng.uniform(2.2, 3.0) if not dead else rng.uniform(3.0, 5.0)

        def grow(parent, pos, d, length, radius, depth):
            segs = max(2, int(length / 0.55))
            cur, p = parent, Vector(pos)
            for s in range(segs):
                gn = 0.45 if dead else 0.3
                d = (d + Vector((rng.uniform(-gn, gn), rng.uniform(-gn, gn), rng.uniform(-gn * 0.4, gn * 0.6)))).normalized()
                if not dead:
                    d = (d + Vector((0, 0, 0.12))).normalized()
                p = p + d * (length / segs)
                r = radius * (1 - 0.55 * (s + 1) / segs)
                cur = add(p, max(r, 0.012), cur)
                if depth > 0 and s < segs - 1 and rng.random() < (0.35 if dead else 0.28):
                    grow(cur, p, rotate_away(d, rng.uniform(0.6, 1.1), rng), length * 0.55, r * 0.6, depth - 1)
            if depth > 0:
                for _ in range(rng.randint(2, 3)):
                    grow(cur, p, rotate_away(d, rng.uniform(0.35, 0.8), rng), length * rng.uniform(0.6, 0.78) * (1.0 if dead else 1.25), radius * 0.5, depth - 1)
            else:
                tips.append((p.copy(), d.copy(), length))

        base = add((0, 0, 0.6), 0.34, root)
        # Buttress roots spreading over the ground
        for k in range(rng.randint(4, 6)):
            a = k / 5 * math.tau + rng.uniform(-0.4, 0.4)
            r1 = add((math.cos(a) * 0.55, math.sin(a) * 0.55, 0.05), 0.14, base)
            add((math.cos(a) * 1.2, math.sin(a) * 1.2, -0.12), 0.05, r1)
        grow(base, (0, 0, 0.6), Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 1)).normalized(),
             trunk_h, 0.36 if not dead else 0.3, 3 if not dead else 4)

    trunk = skin_mesh("Trunk", verts, edges, radii, roots=(root,), subsurf=1)
    # Gnarled bark
    tex = bpy.data.textures.new("gnarl", "CLOUDS")
    tex.noise_scale = 0.35
    disp = trunk.modifiers.new("Disp", "DISPLACE")
    disp.texture = tex
    disp.strength = 0.06
    disp.mid_level = 0.5
    apply_modifiers(trunk)
    decimate(trunk, {"broad": 1600, "dead": 2000, "pine": 900}[kind])
    smart_uv(trunk, 1.6)
    trunk.data.materials.append(material("Bark", (0.2, 0.15, 0.1, 1)))

    objs = [trunk]
    if kind != "dead":
        bm = bmesh.new()
        uv_layer = bm.loops.layers.uv.new("UVMap")
        cards = 0
        for (p, d, length) in tips:
            n = 3 if kind == "pine" else rng.randint(5, 7)
            for _ in range(n):
                if kind == "pine":
                    size = max(0.9, min(2.6, length * 0.9)) * rng.uniform(0.8, 1.1)
                    normal = (Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), 1))).normalized()
                    center = p - d * size * 0.3 + Vector((0, 0, rng.uniform(-0.05, 0.1)))
                    u0, u1 = 0.5, 1.0
                else:
                    size = rng.uniform(1.4, 2.3)
                    normal = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 1))).normalized()
                    center = p + Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), rng.uniform(-0.2, 0.35)))
                    u0, u1 = 0.0, 0.5
                tangent = normal.cross(Vector((0.3, 0.7, 0.2))).normalized()
                bit = normal.cross(tangent).normalized()
                rot = rng.uniform(0, math.tau)
                tx = tangent * math.cos(rot) + bit * math.sin(rot)
                ty = normal.cross(tx).normalized()
                h = size / 2
                corners = [center - tx * h - ty * h, center + tx * h - ty * h, center + tx * h + ty * h, center - tx * h + ty * h]
                bv = [bm.verts.new(c) for c in corners]
                f = bm.faces.new(bv)
                for loop, (u, v) in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
                    loop[uv_layer].uv = (u, v)
                cards += 1
        me = bpy.data.meshes.new("Leaves")
        bm.to_mesh(me)
        bm.free()
        leaves = bpy.data.objects.new("Leaves", me)
        bpy.context.collection.objects.link(leaves)
        leaves.data.materials.append(material("Leaves", (0.1, 0.2, 0.08, 1)))
        objs.append(leaves)
    return objs


def build_trees():
    variants = [("broad", 11), ("broad", 23), ("pine", 5), ("pine", 77), ("dead", 3), ("dead", 41)]
    for i, (kind, seed) in enumerate(variants):
        reset()
        objs = build_tree(kind, seed)
        root = bpy.data.objects.new(f"tree_{kind}_{i}", None)
        bpy.context.collection.objects.link(root)
        for o in objs:
            o.parent = root
        if i in (0, 2, 4):
            preview(f"tree_{i}", target=(0, 0, 4), dist=12, height=4, lens=40, size=480)
        export([root], f"tree_{i}.glb")


# -----------------------------------------------------------------------------
# FLASHLIGHT - built along +Y (three: -Z), lens at the front, tail at the origin
# -----------------------------------------------------------------------------
def build_flashlight():
    reset()
    body_m = material("Body", (0.05, 0.05, 0.06, 1))
    grip_m = material("Grip", (0.05, 0.05, 0.06, 1))
    rubber_m = material("Rubber", (0.01, 0.01, 0.01, 1))
    refl_m = material("Reflector", (0.9, 0.9, 0.9, 1))
    lens_m = material("Lens", (1, 1, 0.9, 1))

    def along_y(obj):
        obj.rotation_euler = (-math.pi / 2, 0, 0)
        activate(obj)
        bpy.ops.object.transform_apply(rotation=True)
        return obj

    parts = []
    tail = lathe("Tail", [(0.0, 0.0), (0.009, 0.0), (0.012, 0.003), (0.0135, 0.008)], segments=32, cap_top=False)
    tail.data.materials.append(rubber_m)
    parts.append(along_y(tail))
    # Body: tail cap -> knurled grip -> waist -> flared head
    body = lathe("Body", [
        (0.0135, 0.008), (0.0155, 0.01), (0.0155, 0.026), (0.0145, 0.03),
        (0.0145, 0.118), (0.0155, 0.122), (0.0155, 0.15), (0.0142, 0.155),
        (0.0142, 0.165), (0.017, 0.178), (0.022, 0.196), (0.0235, 0.2), (0.0235, 0.218), (0.0215, 0.222)
    ], segments=40, cap_bottom=False, cap_top=False)
    body.data.materials.append(body_m)
    parts.append(along_y(body))
    grip = lathe("Grip", [(0.0152, 0.032), (0.0152, 0.116)], segments=40, cap_bottom=False, cap_top=False)
    grip.data.materials.append(grip_m)
    parts.append(along_y(grip))
    # Strike bezel crenellations
    for k in range(6):
        a = k / 6 * math.tau
        bpy.ops.mesh.primitive_cube_add(size=1)
        c = bpy.context.active_object
        c.scale = (0.006, 0.004, 0.004)
        c.location = (math.cos(a) * 0.0215, 0.224, math.sin(a) * 0.0215)
        c.rotation_euler = (0, -a, 0)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        c.data.materials.append(body_m)
        parts.append(c)
    refl = lathe("Reflector", [(0.0035, 0.2), (0.008, 0.205), (0.019, 0.219)], segments=32, cap_bottom=True, cap_top=False)
    for p in refl.data.polygons:
        p.flip()
    refl.data.materials.append(refl_m)
    parts.append(along_y(refl))
    lens = lathe("Lens", [(0.0, 0.2195), (0.0195, 0.2195)], segments=32, cap_bottom=False, cap_top=False)
    lens.data.materials.append(lens_m)
    parts.append(along_y(lens))
    # Pocket clip and side switch
    bpy.ops.mesh.primitive_cube_add(size=1)
    clip = bpy.context.active_object
    clip.scale = (0.006, 0.07, 0.0015)
    clip.location = (0, 0.07, 0.0172)
    bpy.ops.object.transform_apply(location=True, scale=True)
    bev = clip.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.001
    bev.segments = 2
    apply_modifiers(clip)
    clip.data.materials.append(body_m)
    parts.append(clip)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.005, depth=0.006)
    sw = bpy.context.active_object
    sw.location = (0.0158, 0.14, 0)
    sw.rotation_euler = (0, math.pi / 2, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True)
    sw.data.materials.append(rubber_m)
    parts.append(sw)
    # Lanyard ring at the tail
    bpy.ops.mesh.primitive_torus_add(major_radius=0.006, minor_radius=0.0013, major_segments=16, minor_segments=6)
    ring = bpy.context.active_object
    ring.location = (0, -0.004, 0.012)
    ring.rotation_euler = (0, math.pi / 2, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True)
    ring.data.materials.append(body_m)
    parts.append(ring)
    for o in parts:
        for p in o.data.polygons:
            p.use_smooth = True
    torch = join(parts, "Flashlight")
    activate(torch)
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
    smart_uv(torch, 0.03)
    preview("flashlight", target=(0, 0.12, 0), dist=0.42, height=0.12, lens=50, size=480)
    export([torch], "flashlight.glb")


if ONLY in ("all", "watcher"):
    build_watcher()
if ONLY in ("all", "trees"):
    build_trees()
if ONLY in ("all", "flashlight"):
    build_flashlight()
print("DONE")
