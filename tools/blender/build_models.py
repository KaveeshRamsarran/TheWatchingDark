# THE WATCHING DARK - model builder
# Generates the Watcher (rigged + skinned), the Angel parts, the woman, the things in the
# final level's walls, forest trees and the flashlight, then exports GLB files.
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


def export(objs, filename, colors=False):
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
        export_vertex_color="ACTIVE" if colors else "NONE",
    )
    print("EXPORTED", path, os.path.getsize(path))


def smooth01(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def T(x, y, z):
    """three.js coordinates (Y up, front +Z) -> Blender (Z up, front -Y)."""
    return Vector((x, -z, y))


def skin_mesh3(name, nodes, subsurf=2):
    """Skin-modifier mesh from (three.js position, radius, parent index) nodes."""
    verts, edges, radii = [], [], []
    for i, (p, r, parent) in enumerate(nodes):
        verts.append(T(*p))
        radii.append(r)
        if parent is not None:
            edges.append((parent, i))
    return skin_mesh(name, verts, edges, radii, roots=(0,), subsurf=subsurf)


def set_colors(obj, fn):
    """Per-vertex colour (greyscale) for baked occlusion: fn(vertex) -> 0..1."""
    me = obj.data
    attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for v in me.vertices:
        c = max(0.0, min(1.0, fn(v)))
        attr.data[v.index].color = (c, c, c, 1.0)
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.active_color_index


def heightfield(name, w, h, nx, ny, fn, edge=0.18):
    """A membrane in the wall plane (Blender XZ), pushed out toward -Y by fn(x, z) metres.
    It fades to nothing at the border so it melts into the wall behind it."""
    verts, faces, uvs = [], [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            x = (i / nx - 0.5) * w
            z = (j / ny - 0.5) * h
            ex = min(i, nx - i) / nx * 2
            ez = min(j, ny - j) / ny * 2
            fall = smooth01(0.0, edge, min(ex, ez))
            verts.append((x, -fn(x, z) * fall, z))
            uvs.append((x / 4 + 0.5, z / 4 + 0.5))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


def seg_dist2(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / max(dx * dx + dz * dz, 1e-9)))
    return math.hypot(ax + dx * t - px, az + dz * t - pz)


def smax(a, b, k=40.0):
    """Smooth union of two heights."""
    m = max(a, b)
    return m + math.log(math.exp((a - m) * k) + math.exp((b - m) * k)) / k


def dome(x, z, cx, cz, rx, rz, h):
    q = 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2
    return h * smooth01(0.0, 1.0, q) ** 0.55 if q > 0 else 0.0


def capsule(x, z, a, b, r, h):
    d = seg_dist2(x, z, a[0], a[1], b[0], b[1])
    return h * math.sqrt(1 - (d / r) ** 2) if d < r else 0.0


def gauss(x, z, s):
    return math.exp(-(x * x + z * z) / (s * s))


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
# Nearly three metres of starved, stretched body: legs too long, arms longer still
# (the claws hang past its knees), a craning neck and a narrow, elongated skull
# swept back into a ridge. Deep empty sockets, no nose, and a lipless slit of
# needle teeth on a jaw bone.
# -----------------------------------------------------------------------------
HO = (0.0, -0.36, 2.45)         # head origin: top of the neck
HC = Vector((0.0, -0.42, 2.6))  # centre of the skull
HR = (0.075, 0.1, 0.165)        # skull radii before shaping
EYE_X, EYE_DZ = 0.033, 0.035    # sockets relative to HC
MOUTH_DZ = -0.085               # mouth line relative to HC


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

    # Spine: a pinched waist, deep ribcage, shoulders rolled forward, the neck craning out
    pelvis = add((0, 0.03, 1.32), (0.12, 0.085))
    waist = add((0, 0.06, 1.5), (0.06, 0.05), pelvis)
    belly = add((0, 0.07, 1.66), (0.075, 0.06), waist)
    ribs = add((0, 0.05, 1.86), (0.15, 0.11), belly)
    chest = add((0, -0.04, 2.0), (0.16, 0.105), ribs)
    shoulders = add((0, -0.12, 2.1), (0.12, 0.08), chest)
    n1 = add((0, -0.2, 2.21), (0.04, 0.036), shoulders)
    n2 = add((0, -0.27, 2.31), (0.034, 0.032), n1)
    n3 = add((0, -0.33, 2.39), (0.033, 0.031), n2)
    add((0, -0.37, 2.47), (0.04, 0.04), n3)

    for sx in (1, -1):
        sh = add((sx * 0.19, -0.11, 2.08), (0.048, 0.044), shoulders)
        el = add((sx * 0.29, 0.03, 1.5), (0.03, 0.03), sh)
        mid = add((sx * 0.31, -0.01, 1.2), (0.024, 0.022), el)
        wr = add((sx * 0.33, -0.06, 0.92), (0.02, 0.017), mid)
        palm = add((sx * 0.345, -0.09, 0.83), (0.036, 0.014), wr)
        # Four very long fingers, jointed, ending in hooked claws
        for f in range(4):
            spread = (f - 1.5) * 0.026
            fx = sx * 0.345 + spread * sx
            ln = (0.9, 1.0, 1.05, 0.85)[f]
            k1 = add((fx + spread * 0.5 * sx, -0.115, 0.83 - 0.11 * ln), (0.0095, 0.0095), palm)
            k2 = add((fx + spread * 0.9 * sx, -0.15, 0.83 - 0.25 * ln), (0.008, 0.008), k1)
            k3 = add((fx + spread * 1.1 * sx, -0.13, 0.83 - 0.36 * ln), (0.0062, 0.0062), k2)
            add((fx + spread * 1.0 * sx, -0.07, 0.83 - 0.42 * ln), (0.0012, 0.0012), k3)
        th = add((sx * 0.31, -0.13, 0.8), (0.008, 0.008), palm)
        add((sx * 0.29, -0.18, 0.7), (0.0012, 0.0012), th)

        hip = add((sx * 0.11, 0.03, 1.3), (0.055, 0.055), pelvis)
        thigh = add((sx * 0.125, -0.04, 1.0), (0.045, 0.045), hip)
        knee = add((sx * 0.14, -0.1, 0.72), (0.036, 0.036), thigh)
        shin = add((sx * 0.13, 0.0, 0.4), (0.026, 0.026), knee)
        ankle = add((sx * 0.12, 0.08, 0.1), (0.022, 0.022), shin)
        toe = add((sx * 0.12, -0.12, 0.03), (0.03, 0.012), ankle)
        for t in (-1, 0, 1):
            add((sx * 0.12 + t * 0.028, -0.27, 0.01), (0.006, 0.006), toe)

    body = skin_mesh("WatcherBody", verts, edges, radii, roots=(pelvis,), subsurf=2)

    # Ribs, spine and hip bones pressing out through the skin
    for v in body.data.vertices:
        p, n = v.co, v.normal
        if abs(p.x) < 0.19 and 1.7 < p.z < 2.06 and n.y < 0.5:
            band = max(0.0, math.sin((p.z - 1.7) / 0.052 * math.pi)) ** 3
            side = min(1.0, abs(n.x) * 1.6 + max(0.0, -n.y))
            v.co += n * band * side * 0.012
        if abs(p.x) < 0.045 and 1.36 < p.z < 2.16 and n.y > 0.55:
            knob = max(0.0, math.sin((p.z - 1.36) / 0.05 * math.pi)) ** 4
            v.co += n * knob * 0.018
        if abs(p.x) < 0.1 and 1.5 < p.z < 1.7 and n.y < -0.4:
            v.co -= n * 0.014 * math.sin((p.z - 1.5) / 0.2 * math.pi)
        if 0.07 < abs(p.x) < 0.14 and 1.3 < p.z < 1.42 and n.y < 0:
            v.co += n * 0.01 * math.sin((p.z - 1.3) / 0.12 * math.pi)

    # ---- The skull ----------------------------------------------------------------
    bpy.ops.mesh.primitive_uv_sphere_add(segments=56, ring_count=40, radius=1.0)
    head = bpy.context.active_object
    head.name = "WatcherHead"
    for v in head.data.vertices:
        u = v.co.copy()
        rel = V((u.x * HR[0], u.y * HR[1], u.z * HR[2]))
        # Cranium swept far back and up into a ridge
        if rel.y > 0:
            k = smooth01(-0.04, 0.12, rel.z)
            rel.y *= 1 + 0.75 * k
            rel.z += 0.05 * k * (rel.y / HR[1])
            rel.x *= 1 - 0.25 * k * (rel.y / (HR[1] * 1.75))
        # A long, narrow jaw that ends in a pointed chin
        if rel.z < -0.02:
            t = smooth01(-0.02, -0.165, rel.z)
            rel.x *= 1 - 0.42 * t
            rel.z -= 0.06 * t
            if rel.y < 0:
                rel.y *= 1 - 0.2 * t
        # Hollow temples
        if -0.01 < rel.z < 0.09:
            rel.x *= 1 - 0.08 * math.sin((rel.z + 0.01) / 0.1 * math.pi)
        v.co = HC + rel

    eye_z, mouth_z = HC.z + EYE_DZ, HC.z + MOUTH_DZ
    for v in head.data.vertices:
        p = v.co
        rel = p - HC
        r = math.hypot(rel.x, rel.y)
        front = max(0.0, -rel.y / max(r, 1e-4))
        if front < 0.05:
            continue
        for sx in (-1, 1):
            d = math.hypot(rel.x - sx * EYE_X, p.z - eye_z)
            if d < 0.032:                                   # deep, empty sockets
                v.co.y += 0.075 * front * (1 - d / 0.032) ** 1.1
            dc = math.hypot(rel.x - sx * 0.045, p.z - (HC.z - 0.04))
            if dc < 0.036:                                  # cheeks sucked in
                v.co.y += 0.026 * front * (1 - dc / 0.036)
            dn = math.hypot(rel.x - sx * 0.007, (p.z - (HC.z - 0.012)) * 0.45)
            if dn < 0.007:                                  # two slits for a nose
                v.co.y += 0.014 * front * (1 - dn / 0.007)
        if eye_z + 0.022 < p.z < eye_z + 0.05 and abs(rel.x) < 0.07:
            v.co.y -= 0.01 * front * math.sin((p.z - eye_z - 0.022) / 0.028 * math.pi)   # brow ridge
        mz = p.z - mouth_z
        if abs(mz) < 0.015 and abs(rel.x) < 0.066:          # lipless slit, nearly ear to ear
            v.co.y += 0.042 * front * (1 - (mz / 0.015) ** 2) * (1 - (rel.x / 0.066) ** 2) ** 0.7

    def surface_y(x, z):
        best, by = 9, 0
        for v in head.data.vertices:
            if v.co.y > HC.y:
                continue
            d = math.hypot(v.co.x - x, v.co.z - z)
            if d < best:
                best, by = d, v.co.y
        return by

    eyes = [V((sx * EYE_X, surface_y(sx * EYE_X, eye_z) - 0.008, eye_z)) for sx in (1, -1)]
    mouth_c = V((0, surface_y(0, mouth_z), mouth_z))
    print("WATCHER_EYES_THREE", [(round(e.x, 4), round(e.z, 4), round(-e.y, 4)) for e in eyes])

    # Black maw and needle teeth along the slit
    maw = lathe("WatcherMaw", [(0.0005, 0), (0.062, 0.0)], segments=28, cap_bottom=False, cap_top=False)
    for v in maw.data.vertices:
        x, y = v.co.x, v.co.y
        v.co = V((x, 0.0, y * 0.3)) + mouth_c + V((0, 0.016, 0))
    maw.data.materials.append(material("Maw", (0, 0, 0, 1)))
    teeth = []
    rng = random.Random(7)
    for zoff, sign in ((0.007, -1), (-0.007, 1)):
        for i in range(19):
            t = (i / 18) * 2 - 1
            x = t * 0.058
            ln = rng.uniform(0.026, 0.042) * (1 - abs(t) * 0.45)
            bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.0032, radius2=0.0, depth=ln)
            tooth = bpy.context.active_object
            tooth.rotation_euler = ((math.pi if sign > 0 else 0) + rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0)
            tooth.location = V((x, surface_y(x, mouth_z) + 0.006, mouth_z + zoff - sign * ln * 0.35))
            teeth.append(tooth)
    for t in teeth:
        activate(t)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    teeth_obj = join(teeth, "WatcherTeeth")
    teeth_obj.data.materials.append(material("Teeth", (0.6, 0.55, 0.45, 1)))

    for p in head.data.polygons:
        p.use_smooth = True
    body.data.materials.append(material("Skin", (0.05, 0.04, 0.05, 1)))
    head.data.materials.append(material("Skin"))
    watcher = join([body, head, maw, teeth_obj], "Watcher")
    decimate(watcher, 13000)
    smart_uv(watcher, 0.5)

    # Armature (same bone names as before, so the game's animation drives it unchanged)
    bones = {
        "hips": ((0, 0.03, 1.3), (0, 0.03, 1.44), None),
        "spine": ((0, 0.03, 1.44), (0, 0.06, 1.8), "hips"),
        "chest": ((0, 0.06, 1.8), (0, -0.12, 2.1), "spine"),
        "neck": ((0, -0.12, 2.1), HO, "chest"),
        "head": (HO, tuple(HC + V((0, 0.02, 0.2))), "neck"),
        "jaw": (tuple(mouth_c), tuple(mouth_c + V((0, -0.04, 0))), "head"),
    }
    for side, sx in (("L", 1), ("R", -1)):
        bones.update({
            f"shoulder_{side}": ((sx * 0.05, -0.11, 2.07), (sx * 0.19, -0.11, 2.08), "chest"),
            f"upperarm_{side}": ((sx * 0.19, -0.11, 2.08), (sx * 0.29, 0.03, 1.5), f"shoulder_{side}"),
            f"forearm_{side}": ((sx * 0.29, 0.03, 1.5), (sx * 0.33, -0.06, 0.92), f"upperarm_{side}"),
            f"hand_{side}": ((sx * 0.33, -0.06, 0.92), (sx * 0.35, -0.13, 0.62), f"forearm_{side}"),
            f"thigh_{side}": ((sx * 0.11, 0.03, 1.3), (sx * 0.14, -0.1, 0.72), "hips"),
            f"shin_{side}": ((sx * 0.14, -0.1, 0.72), (sx * 0.12, 0.08, 0.1), f"thigh_{side}"),
            f"foot_{side}": ((sx * 0.12, 0.08, 0.1), (sx * 0.12, -0.25, 0.01), f"shin_{side}"),
        })
    arm_data = bpy.data.armatures.new("WatcherRig")
    rig = bpy.data.objects.new("WatcherRig", arm_data)
    bpy.context.collection.objects.link(rig)
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name, (h, t, parent) in bones.items():
        b = arm_data.edit_bones.new(name)
        b.head = h
        b.tail = t
        b.roll = 0
        eb[name] = b
    for name, (h, t, parent) in bones.items():
        if parent:
            eb[name].parent = eb[parent]
            eb[name].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")

    # Skin weights: the skull and jaw are rigid; everything else blends between the two nearest bones
    segs = {n: (V(h), V(t)) for n, (h, t, _) in bones.items() if n not in ("jaw", "head")}

    def seg_dist(p, a, b):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        return (a + ab * t - p).length

    groups = {n: watcher.vertex_groups.new(name=n) for n in bones}
    mat_names = [m.name for m in watcher.data.materials]
    vert_mat = {}
    for poly in watcher.data.polygons:
        for vi in poly.vertices:
            vert_mat[vi] = mat_names[poly.material_index]

    for v in watcher.data.vertices:
        p = v.co
        m = vert_mat.get(v.index, "Skin")
        rel = p - mouth_c
        rh = p - HC
        in_head = (rh.x / (HR[0] * 1.6)) ** 2 + (rh.y / (HR[1] * 2.2)) ** 2 + (rh.z / (HR[2] * 1.5)) ** 2 < 1 and p.z > HO[2] - 0.005
        if m in ("Maw", "Teeth") or in_head:
            jaw = rel.z < -0.004 and rh.y < 0.03 and p.z > HC.z - 0.3
            if m == "Maw":
                jaw = rel.z < -0.002
            groups["jaw" if jaw else "head"].add([v.index], 1.0, "REPLACE")
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
    preview("watcher", target=(0, -0.1, 1.5), dist=4.4, height=1.7)
    if PREVIEW:
        bpy.context.scene.camera.location = (0.3, -1.2, 2.7)
        bpy.context.scene.camera.rotation_euler = (HC - bpy.context.scene.camera.location).to_track_quat("-Z", "Y").to_euler()
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


# -----------------------------------------------------------------------------
# THE ANGEL (parts; the face, hair and halo stay procedural in the game)
# Every part is built in three.js space around the pivot the game hangs it from.
# -----------------------------------------------------------------------------
def build_angel():
    reset()
    rng = random.Random(21)
    skin_m = material("Skin", (0.7, 0.67, 0.6, 1))
    robe_m = material("Robe", (0.6, 0.57, 0.52, 1))
    feather_m = material("Feather", (0.8, 0.78, 0.72, 1))

    # Robe: heavy folds that deepen toward a torn hem, torn open over the chest
    prof = [(0.8, 0.0), (0.72, 0.5), (0.58, 1.2), (0.44, 2.0), (0.31, 2.6), (0.25, 3.0),
            (0.28, 3.35), (0.32, 3.6), (0.21, 3.86), (0.08, 3.96)]
    dense = []
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        steps = max(2, int((z1 - z0) / 0.07))
        for k in range(steps):
            t = k / steps
            dense.append((r0 + (r1 - r0) * t, z0 + (z1 - z0) * t))
    dense.append(prof[-1])

    def folds(a, z):
        amp = 0.25 + 0.75 * (1 - min(z, 3.4) / 3.4)
        k = 1 + amp * (0.07 * math.sin(a * 9 + z * 0.8) + 0.035 * math.sin(a * 17 - z * 1.3))
        return k + amp * 0.05 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, z * 0.8)))

    robe = lathe("AngelRobe", dense, segments=80, radial_noise=folds, cap_bottom=False, cap_top=True)
    me = robe.data
    bm = bmesh.new()
    bm.from_mesh(me)
    for v in bm.verts:
        p = v.co
        a = math.atan2(p.y, p.x)
        if p.z < 0.75:                                # ragged, uneven hem
            tear = (math.sin(a * 9) * 0.5 + 0.5) * max(0.0, math.sin(a * 23 + 1.3)) * 0.55
            v.co.z += tear * (1 - p.z / 0.75)
    # Tear the robe open over the chest (front is -Y in Blender)
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        a = math.atan2(c.y, c.x)
        front = abs(a + math.pi / 2)
        width = 0.36 + 0.12 * math.sin(c.z * 9)
        if 2.95 < c.z < 3.86 and front < width * smooth01(2.95, 3.3, c.z) + 0.02:
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(me)
    bm.free()
    robe.data.materials.append(robe_m)

    # Emaciated chest showing through the tear, and a long sinewy neck
    nodes = [
        ((0, 2.9, 0.0), (0.2, 0.17), None),
        ((0, 3.2, 0.0), (0.25, 0.2), 0),
        ((0, 3.5, 0.0), (0.27, 0.21), 1),
        ((0, 3.75, -0.01), (0.22, 0.17), 2),
        ((0, 3.92, -0.02), (0.1, 0.08), 3),
        ((0, 4.25, 0.0), (0.055, 0.055), 4),
        ((0, 4.68, 0.02), (0.06, 0.06), 5),
    ]
    chest = skin_mesh3("AngelChest", nodes, subsurf=2)
    for v in chest.data.vertices:
        p, n = v.co, v.normal
        h = p.z
        if 3.0 < h < 3.75 and n.y < 0:              # ribs
            band = max(0.0, math.sin((h - 3.0) / 0.1 * math.pi)) ** 3
            v.co += n * band * 0.02
        if 3.92 < h < 4.6 and abs(p.x) > 0.03:      # tendons in the neck
            v.co += n * 0.008 * max(0.0, math.cos(math.atan2(p.y, p.x) * 3))
    chest.data.materials.append(skin_m)

    # Bony arms with long, knuckled fingers (shoulder pivot at the origin, hanging along -Y)
    upper = skin_mesh3("AngelUpperArm", [
        ((0, 0, 0), 0.06, None), ((0, -0.5, 0.01), 0.045, 0), ((0, -1.1, 0.0), 0.036, 1), ((0, -1.25, 0.0), 0.048, 2)
    ], subsurf=2)
    upper.data.materials.append(skin_m)
    fn = [((0, 0, 0), 0.044, None), ((0, -0.55, 0.01), 0.034, 0), ((0, -1.1, 0.02), 0.024, 1),
          ((0, -1.2, 0.03), (0.05, 0.018), 2)]
    for f in range(4):
        fx = (f - 1.5) * 0.022
        b = len(fn)
        fn.append(((fx * 1.2, -1.29, 0.04), 0.011, 3))
        fn.append(((fx * 1.5, -1.42, 0.08), 0.009, b))
        fn.append(((fx * 1.7, -1.54, 0.13), 0.007, b + 1))
        fn.append(((fx * 1.75, -1.6, 0.18), 0.0015, b + 2))
    b = len(fn)
    fn.append(((0.05, -1.24, 0.06), 0.01, 3))
    fn.append(((0.07, -1.33, 0.12), 0.0015, b))
    fore = skin_mesh3("AngelForearm", fn, subsurf=2)
    fore.data.materials.append(skin_m)

    # Wing: a bony leading edge with three layers of ragged feathers hanging from it
    bone_pts = [(0, 0, 0), (0.55, 0.75, -0.05), (1.25, 1.55, -0.12), (1.75, 2.35, -0.16)]
    wbone = skin_mesh3("AngelWingBone", [
        (bone_pts[0], 0.06, None), (bone_pts[1], 0.045, 0), (bone_pts[2], 0.032, 1), (bone_pts[3], 0.008, 2)
    ], subsurf=2)
    wbone.data.materials.append(skin_m)

    def along(t):
        """Point on the leading edge, t in 0..3."""
        i = min(2, int(t))
        f = t - i
        a, b = Vector(bone_pts[i]), Vector(bone_pts[i + 1])
        return a + (b - a) * f

    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")

    def feather(root, direction, length, width, layer):
        d = direction.normalized()
        side = Vector((0, 0, 1)).cross(d).normalized() * (width / 2)
        segs = 4
        rows = []
        for s in range(segs + 1):
            t = s / segs
            c = root + d * (length * t)
            c.z += math.sin(t * math.pi) * 0.04 * length - layer * 0.03   # cupped, layered
            taper = 1 - 0.35 * t
            rows.append((bm.verts.new(T(*(c - side * taper))), bm.verts.new(T(*(c + side * taper))), t))
        for (a0, a1, t0), (b0, b1, t1) in zip(rows, rows[1:]):
            f = bm.faces.new((a0, a1, b1, b0))
            for loop, uv in zip(f.loops, ((0, t0), (1, t0), (1, t1), (0, t1))):
                loop[uvl].uv = uv

    # Primaries off the hand, fanning from the tip downward
    for i in range(11):
        t = 2.0 + i / 10 * 0.98
        ang = math.radians(lerp_f(60, -55, i / 10))
        d = Vector((math.cos(ang) * 0.6 + 0.4, math.sin(ang) - 0.2, 0)).normalized()
        feather(along(t), d, rng.uniform(1.6, 2.3) * (1 - i / 30), rng.uniform(0.26, 0.32), 0)
    # Secondaries hang straight down from the forearm
    for i in range(10):
        t = 1.0 + i / 9 * 0.98
        d = Vector((rng.uniform(0.05, 0.25), -1, 0)).normalized()
        feather(along(t), d, rng.uniform(1.5, 1.9), rng.uniform(0.27, 0.33), 0)
    # Tertials near the body, shorter
    for i in range(6):
        t = i / 5 * 0.95
        d = Vector((rng.uniform(-0.1, 0.2), -1, 0)).normalized()
        feather(along(t), d, rng.uniform(1.0, 1.4), rng.uniform(0.26, 0.3), 0)
    # Coverts: a shorter layer over the roots
    for i in range(16):
        t = i / 15 * 2.9
        d = Vector((rng.uniform(0.1, 0.4), -1, 0)).normalized()
        feather(along(t) + Vector((0, -0.05, 0)), d, rng.uniform(0.55, 0.85), rng.uniform(0.22, 0.28), 1)
    wme = bpy.data.meshes.new("AngelWing")
    bm.to_mesh(wme)
    bm.free()
    wing = bpy.data.objects.new("AngelWing", wme)
    bpy.context.collection.objects.link(wing)
    wing.data.materials.append(feather_m)

    for o, n in ((robe, 6000), (chest, 3000), (upper, 1200), (fore, 2400), (wbone, 900)):
        decimate(o, n)
        smart_uv(o, 0.6)
    staged({upper: T(0.3, 3.62, 0), fore: T(0.36, 2.37, 0), wing: T(0.14, 3.55, -0.2), wbone: T(0.14, 3.55, -0.2)},
           lambda: preview("angel", target=(0, 0, 2.6), dist=8.5, height=3.0, lens=40))
    export([robe, chest, upper, fore, wing, wbone], "angel.glb")


def lerp_f(a, b, t):
    return a + (b - a) * t


def staged(offsets, fn):
    """Spread overlapping parts out for a preview render, then put them back."""
    for o, loc in offsets.items():
        o.location = loc
    fn()
    for o in offsets:
        o.location = (0, 0, 0)


# -----------------------------------------------------------------------------
# THE WOMAN: a thin figure in a torn shift dress, arms hanging, long black hair.
# Body parts in figure space; head and hair around the neck pivot (0, 1.6, 0).
# -----------------------------------------------------------------------------
def build_figure():
    reset()
    rng = random.Random(5)
    dress_m = material("Dress", (0.4, 0.38, 0.35, 1))
    skin_m = material("Skin", (0.55, 0.5, 0.48, 1))
    hair_m = material("Hair", (0.01, 0.01, 0.01, 1))

    prof = [(0.33, 0.0), (0.31, 0.3), (0.27, 0.7), (0.21, 0.95), (0.15, 1.08), (0.16, 1.2),
            (0.17, 1.3), (0.16, 1.38), (0.19, 1.42), (0.14, 1.46), (0.06, 1.5), (0.045, 1.52)]
    dense = []
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        steps = max(2, int((z1 - z0) / 0.03))
        for k in range(steps):
            t = k / steps
            dense.append((r0 + (r1 - r0) * t, z0 + (z1 - z0) * t))
    dense.append(prof[-1])

    def folds(a, z):
        amp = smooth01(1.1, 0.2, z)
        return 1 + amp * (0.06 * math.sin(a * 11 + z * 2) + 0.03 * math.sin(a * 23 - z * 3)) \
            + 0.02 * noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, z * 2)))

    dress = lathe("FigureDress", dense, segments=56, radial_noise=folds, cap_bottom=False, cap_top=False)
    for v in dress.data.vertices:
        v.co.y *= 0.72
        a = math.atan2(v.co.y, v.co.x)
        if v.co.z < 0.35:                     # torn, uneven hem
            v.co.z += max(0.0, math.sin(a * 7 + 0.6)) * max(0.0, math.sin(a * 19)) * 0.22 * (1 - v.co.z / 0.35)
    # Short sleeves
    sleeves = []
    for sx in (1, -1):
        sleeves.append(skin_mesh3("Sleeve", [((sx * 0.13, 1.44, 0.0), 0.06, None), ((sx * 0.2, 1.36, 0.0), 0.058, 0),
                                              ((sx * 0.215, 1.27, 0.01), 0.052, 1)], subsurf=1))
    dress = join([dress] + sleeves, "FigureDress")
    dress.data.materials.append(dress_m)

    nodes = [((0, 1.45, 0.0), 0.045, None), ((0, 1.6, 0.01), 0.04, 0)]
    for sx in (1, -1):
        b = len(nodes)
        nodes.append(((sx * 0.19, 1.41, 0.0), 0.038, 0))
        nodes.append(((sx * 0.225, 1.12, 0.03), 0.03, b))
        nodes.append(((sx * 0.215, 0.85, 0.05), 0.021, b + 1))
        nodes.append(((sx * 0.215, 0.79, 0.055), (0.03, 0.012), b + 2))
        palm = b + 3
        for f in range(4):
            fx = sx * (0.205 + (f - 1.5) * 0.012)
            k = len(nodes)
            nodes.append(((fx, 0.74, 0.058), 0.007, palm))
            nodes.append(((fx, 0.68, 0.066), 0.006, k))
            nodes.append(((fx, 0.635, 0.08), 0.002, k + 1))
        nodes.append(((sx * 0.2, 0.78, 0.075), 0.0015, palm))
    skin = skin_mesh3("FigureSkin", nodes, subsurf=2)
    skin.data.materials.append(skin_m)

    # Head (relative to the neck pivot)
    C = (0.0, 0.12, 0.01)
    R = (0.085, 0.112, 0.098)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=1.0)
    head = bpy.context.active_object
    head.name = "FigureHead"
    for v in head.data.vertices:
        u = v.co.copy()
        x, y, z = u.x * R[0], u.z * R[1], -u.y * R[2]      # unit sphere -> three-space offsets
        if y < -0.03:                                       # narrow chin
            x *= 1 - 0.3 * smooth01(-0.03, -0.11, y)
        v.co = T(C[0] + x, C[1] + y, C[2] + z)
    for p in head.data.polygons:
        p.use_smooth = True
    head.data.materials.append(skin_m)

    # Hair: long ribbons hanging from the scalp, the front ones curtaining the face
    bm = bmesh.new()

    def inside(p):
        q = ((p.x - C[0]) / (R[0] + 0.016)) ** 2 + ((p.y - C[1]) / (R[1] + 0.016)) ** 2 + ((p.z - C[2]) / (R[2] + 0.016)) ** 2
        return q < 1

    for i in range(130):
        theta = rng.uniform(0, math.tau)
        front = math.cos(theta) > 0.55
        phi = rng.uniform(math.radians(28), math.radians(80)) if front else rng.uniform(math.radians(-15), math.radians(85))
        d = Vector((math.cos(phi) * math.sin(theta), math.sin(phi), math.cos(phi) * math.cos(theta)))
        root = Vector((C[0] + d.x * R[0], C[1] + d.y * R[1], C[2] + d.z * R[2]))
        out = Vector((d.x, 0, d.z))
        if out.length < 0.1:
            out = Vector((math.sin(theta), 0, math.cos(theta)))
        out.normalize()
        length = rng.uniform(0.55, 0.8)
        segs = 14
        step = length / segs
        pts = [root.copy()]
        p = root + out * 0.012 + Vector((0, 0.01, 0))
        for s in range(segs):
            p = p + Vector((0, -step, 0)) + out * (0.012 if s < 4 else 0.002) + \
                Vector((rng.uniform(-0.006, 0.006), 0, rng.uniform(-0.006, 0.006)))
            for _ in range(8):
                if not inside(p):
                    break
                p = p + out * 0.008
            pts.append(p.copy())
        width = rng.uniform(0.03, 0.05)
        tan = Vector((-out.z, 0, out.x))
        ring = []
        for s, pt in enumerate(pts):
            w = width * (1 - 0.7 * s / segs)
            ring.append((bm.verts.new(T(*(pt - tan * w / 2))), bm.verts.new(T(*(pt + tan * w / 2)))))
        for (a0, a1), (b0, b1) in zip(ring, ring[1:]):
            bm.faces.new((a0, a1, b1, b0))
    hme = bpy.data.meshes.new("FigureHair")
    bm.to_mesh(hme)
    bm.free()
    hair = bpy.data.objects.new("FigureHair", hme)
    bpy.context.collection.objects.link(hair)
    for p in hme.polygons:
        p.use_smooth = True
    hair.data.materials.append(hair_m)

    decimate(dress, 3500)
    decimate(skin, 3500)
    smart_uv(dress, 0.4)
    smart_uv(skin, 0.3)
    staged({head: T(0, 1.6, 0), hair: T(0, 1.6, 0)}, lambda: preview("figure", target=(0, 0, 0.9), dist=3.0, height=1.3))
    export([dress, skin, head, hair], "figure.glb")


# -----------------------------------------------------------------------------
# THINGS IN THE WALLS (final level)
# Each faces three.js +Z (out of the wall), with its back on the wall plane.
# -----------------------------------------------------------------------------
def build_flesh():
    reset()
    skin_m = material("Skin", (0.6, 0.5, 0.48, 1))
    flesh_m = material("Flesh", (0.5, 0.1, 0.1, 1))
    rng = random.Random(13)

    # ---- An arm reaching out of the wall, along -Y, palm toward +Z ----------------
    nodes = [((0, 0, 0), 0.085, None), ((0, -0.3, 0.04), 0.062, 0), ((0, -0.62, 0.09), 0.052, 1),
             ((0, -0.8, 0.12), 0.055, 2), ((0.01, -1.15, 0.2), 0.042, 3), ((0.02, -1.5, 0.27), (0.032, 0.025), 4),
             ((0.02, -1.62, 0.3), (0.055, 0.02), 5)]
    palm = 6
    for f in range(4):
        fx = 0.02 + (f - 1.5) * 0.024
        k = len(nodes)
        nodes.append(((fx * 1.1, -1.71, 0.31), 0.014, palm))
        nodes.append(((fx * 1.25, -1.81, 0.34), 0.012, k))
        nodes.append(((fx * 1.35, -1.9, 0.39), 0.01, k + 1))
        nodes.append(((fx * 1.4, -1.95, 0.44), 0.006, k + 2))
        nodes.append(((fx * 1.4, -1.96, 0.47), 0.002, k + 3))
    k = len(nodes)
    nodes.append(((0.075, -1.64, 0.33), 0.014, palm))
    nodes.append(((0.1, -1.72, 0.38), 0.011, k))
    nodes.append(((0.11, -1.78, 0.43), 0.002, k + 1))
    arm = skin_mesh3("WallArm", nodes, subsurf=2)
    for v in arm.data.vertices:          # tendons down the forearm
        p, n = v.co, v.normal
        if -1.5 < p.z < -0.85:
            a = math.atan2(n.x, n.y)
            v.co += n * 0.006 * max(0.0, math.cos(a * 4)) * math.sin((p.z + 1.5) / 0.65 * math.pi)
    decimate(arm, 1700)
    smart_uv(arm, 0.4)
    arm.data.materials.append(skin_m)

    # ---- A face pressing out through the flesh, mouth open -------------------------------
    def face_parts(x, z):
        base = dome(x, z, 0, 0.0, 0.2, 0.28, 0.17)
        cav = 0.0
        for sx in (-1, 1):
            cav += 0.055 * gauss(x - sx * 0.066, z - 0.05, 0.03)        # sockets
            base += 0.016 * gauss(x - sx * 0.066, z - 0.1, 0.03)        # brow
            base += 0.02 * gauss(x - sx * 0.095, z + 0.03, 0.032)       # cheekbones
        base += 0.045 * math.exp(-(x / 0.017) ** 2) * smooth01(0.06, 0.0, abs(z + 0.0))  # nose
        mouth = 0.13 * smooth01(1.0, 0.25, (x / 0.05) ** 2 + ((z + 0.15) / 0.07) ** 2)
        cav += mouth
        return base, cav

    def face_h(x, z):
        b, c = face_parts(x, z)
        return b - c

    face = heightfield("WallFace", 0.7, 0.86, 56, 70, face_h, edge=0.3)
    set_colors(face, lambda v: (1 - min(0.93, face_parts(v.co.x, v.co.z)[1] / 0.05)) * (0.7 + 0.45 * min(1, -v.co.y / 0.15)))
    decimate(face, 2600)
    face.data.materials.append(flesh_m)

    # ---- A whole body pushing through, hands pressed flat against the skin -------------
    def body_parts(x, z):
        h = dome(x, z, 0, 0.62, 0.11, 0.14, 0.2)                                  # head
        h = smax(h, capsule(x, z, (0, 0.44), (0, 0.52), 0.06, 0.1))              # neck
        h = smax(h, dome(x, z, 0, 0.1, 0.25, 0.34, 0.13))                        # torso
        h = smax(h, capsule(x, z, (-0.19, 0.36), (0.19, 0.36), 0.085, 0.12))     # shoulders
        for sx in (-1, 1):
            h = smax(h, capsule(x, z, (sx * 0.2, 0.36), (sx * 0.37, 0.56), 0.055, 0.1))   # upper arms
            h = smax(h, capsule(x, z, (sx * 0.37, 0.56), (sx * 0.31, 0.82), 0.045, 0.1))  # forearms
            h = smax(h, dome(x, z, sx * 0.31, 0.88, 0.05, 0.065, 0.11))                   # palms
            for o in (-0.03, -0.01, 0.01, 0.03):
                h = smax(h, capsule(x, z, (sx * (0.31 + o), 0.93), (sx * (0.31 + o * 1.7), 1.03), 0.014, 0.09))
            h = smax(h, capsule(x, z, (sx * 0.27, 0.87), (sx * 0.23, 0.93), 0.014, 0.08))  # thumbs
        cav = 0.0
        for sx in (-1, 1):
            cav += 0.04 * gauss(x - sx * 0.04, z - 0.65, 0.022)
        cav += 0.07 * smooth01(1.0, 0.2, (x / 0.035) ** 2 + ((z - 0.55) / 0.04) ** 2)
        return h, cav

    def body_h(x, z):
        b, c = body_parts(x, z)
        return b - c

    body = heightfield("WallBody", 1.3, 1.9, 64, 92, lambda x, z: body_h(x, z + 0.35), edge=0.16)
    set_colors(body, lambda v: (1 - min(0.9, body_parts(v.co.x, v.co.z + 0.35)[1] / 0.04)) * (0.62 + 0.5 * min(1, -v.co.y / 0.13)))
    decimate(body, 6000)
    body.data.materials.append(flesh_m)

    staged({face: T(-1.0, 1.4, 0), body: T(0.2, 1.0, 0), arm: T(1.4, 2.0, 0)},
           lambda: preview("flesh", target=(0.2, 0, 1.0), dist=4.2, height=1.4))
    export([arm, face, body], "flesh.glb", colors=True)



# -----------------------------------------------------------------------------
# JUMPSCARE: a lit close-up render of the Watcher's face, jaw gaping, for the death screen
# Writes images/watcher_jumpscare.png (pass the images folder instead of the build folder)
# -----------------------------------------------------------------------------
def render_jumpscare():
    build_watcher()
    rig = bpy.data.objects["WatcherRig"]
    body = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == rig][0]
    # Materials for Cycles
    def principled(name, color, rough, emit=None, strength=0.0):
        m = bpy.data.materials.get(name)
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = color
        b.inputs["Roughness"].default_value = rough
        if emit:
            b.inputs["Emission Color"].default_value = emit
            b.inputs["Emission Strength"].default_value = strength
    principled("Skin", (0.05, 0.04, 0.045, 1), 0.42)
    principled("Teeth", (0.55, 0.48, 0.36, 1), 0.3)
    principled("Maw", (0, 0, 0, 1), 1.0)
    # Burning eyes in the sockets
    for sx in (1, -1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0075, location=(sx * EYE_X, HC.y - 0.072, HC.z + EYE_DZ))
        e = bpy.context.active_object
        em = bpy.data.materials.new("Eye")
        em.use_nodes = True
        b = em.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (0.2, 0, 0, 1)
        b.inputs["Emission Color"].default_value = (1.0, 0.04, 0.01, 1)
        b.inputs["Emission Strength"].default_value = 14.0
        e.data.materials.append(em)
    # Gape the jaw
    activate(rig)
    bpy.ops.object.mode_set(mode="POSE")
    jaw = rig.pose.bones["jaw"]
    jaw.rotation_mode = "XYZ"
    jaw.rotation_euler = (0.32, 0, 0)
    head = rig.pose.bones["head"]
    head.rotation_mode = "XYZ"
    head.rotation_euler = (-0.15, 0, 0.12)
    bpy.ops.object.mode_set(mode="OBJECT")

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.device = "CPU"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.world = bpy.data.worlds.new("w")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0, 0, 0, 1)
    bg.inputs["Strength"].default_value = 0.0
    scene.view_settings.look = "AgX - Punchy" if "AgX - Punchy" in [l.identifier for l in bpy.types.ColorManagedViewSettings.bl_rna.properties["look"].enum_items] else "None"
    target = HC + Vector((0, -0.05, -0.02))

    def light(kind, loc, energy, color, size=0.3):
        ld = bpy.data.lights.new("l", kind)
        ld.energy = energy
        ld.color = color
        if kind == "AREA":
            ld.size = size
        lo = bpy.data.objects.new("l", ld)
        lo.location = loc
        bpy.context.collection.objects.link(lo)
        lo.rotation_euler = (target - lo.location).to_track_quat("-Z", "Y").to_euler()

    light("AREA", target + Vector((0.05, -0.35, -0.45)), 5.5, (1.0, 0.45, 0.3), 0.2)   # harsh from below
    light("AREA", target + Vector((-0.4, 0.3, 0.35)), 9, (0.5, 0.6, 1.0), 0.4)          # cold rim behind
    light("POINT", target + Vector((0.0, -0.12, -0.02)), 0.08, (1.0, 0.1, 0.05))        # eye glow spill
    cd = bpy.data.cameras.new("c")
    cd.lens = 32
    co = bpy.data.objects.new("c", cd)
    bpy.context.collection.objects.link(co)
    co.location = target + Vector((0.035, -0.42, -0.06))
    co.rotation_euler = (target - co.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = co
    scene.render.filepath = os.path.join(OUT, "watcher_jumpscare.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scene.render.filepath)

if ONLY in ("all", "watcher"):
    build_watcher()
if ONLY in ("all", "trees"):
    build_trees()
if ONLY in ("all", "flashlight"):
    build_flashlight()
if ONLY in ("all", "angel", "creatures"):
    build_angel()
if ONLY in ("all", "figure", "creatures"):
    build_figure()
if ONLY in ("all", "flesh", "creatures"):
    build_flesh()
if ONLY == "jumpscare":
    render_jumpscare()
print("DONE")
