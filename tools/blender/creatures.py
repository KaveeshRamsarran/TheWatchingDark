# THE WATCHING DARK - the creatures that hunt you
# exec'd by build_models.py (shares its helpers: reset, skin_mesh, lathe, join, smart_uv, ...)
#
#   watcher.glb  - Level I:   a starved, hunched giant with a skull face and a grin torn to the ears
#   unseen.glb   - Level IV:  a patient in a hospital gown, its broken neck letting its eyeless
#                             head hang on its shoulder, mouth stretched open in a scream
#   crawler.glb  - Level III: a drowned woman on all fours - limbs bent wrong, back arched,
#                             head hanging low, her hair dragging through the water
#
# All three share the Watcher's bone names, so the game can pose any of them.


# -----------------------------------------------------------------------------
# Rigging
# -----------------------------------------------------------------------------
def make_rig(name, bones):
    arm_data = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(rig)
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for n, (h, t, parent) in bones.items():
        b = arm_data.edit_bones.new(n)
        b.head = tuple(h)
        b.tail = tuple(t)
        b.roll = 0
        eb[n] = b
    for n, (h, t, parent) in bones.items():
        if parent:
            eb[n].parent = eb[parent]
            eb[n].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def bind(obj, rig, bones, rigid, auto_exclude=("head", "jaw")):
    """Skin weights. rigid(co, material) returns {bone: weight} for parts that must not bend
    (the skull, the jaw, hair, teeth); everything else blends the two nearest bone segments."""
    segs = {n: (Vector(h), Vector(t)) for n, (h, t, _) in bones.items() if n not in auto_exclude}
    groups = {n: obj.vertex_groups.new(name=n) for n in bones}
    mats = [m.name for m in obj.data.materials]
    vmat = {}
    for poly in obj.data.polygons:
        for vi in poly.vertices:
            vmat[vi] = mats[poly.material_index] if mats else ""
    for v in obj.data.vertices:
        r = rigid(v.co, vmat.get(v.index, ""))
        if r:
            for n, w in r.items():
                if w > 0.001:
                    groups[n].add([v.index], w, "REPLACE")
            continue
        p = v.co
        cands = []
        for n, (a, b) in segs.items():
            if n.endswith("_L") and p.x < -0.02:
                continue
            if n.endswith("_R") and p.x > 0.02:
                continue
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
            cands.append(((a + ab * t - p).length, n))
        cands.sort()
        best = cands[:2]
        w = [1.0 / max(d, 0.01) ** 4 for d, _ in best]
        s = sum(w)
        for (d, n), wi in zip(best, w):
            if wi / s > 0.02:
                groups[n].add([v.index], wi / s, "REPLACE")
    obj.parent = rig
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig


def to_three(v):
    return (round(v.x, 4), round(v.z, 4), round(-v.y, 4))


# -----------------------------------------------------------------------------
# A skull-like head: sockets, cheekbones, a nasal hollow, and a mouth torn open as a
# hole in the skin with teeth along both lips and a black throat behind.
# Built around the origin facing -Y, then rotated (rot, radians XYZ) and moved to C.
# -----------------------------------------------------------------------------
def creature_head(name, C, R, rng, shape=None, sockets=None, grin=None, nose=0.012,
                  cheek=1.0, brow=0.008, rot=(0, 0, 0), teeth=None, segs=(52, 38)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs[0], ring_count=segs[1], radius=1.0)
    head = bpy.context.active_object
    head.name = name
    me = head.data
    for v in me.vertices:
        rel = Vector((v.co.x * R[0], v.co.y * R[1], v.co.z * R[2]))
        v.co = shape(rel) if shape else rel

    def front_of(p):
        r = math.hypot(p.x, p.y)
        return max(0.0, -p.y / max(r, 1e-4))

    for v in me.vertices:
        p = v.co.copy()
        f = front_of(p)
        if f < 0.05:
            continue
        dy = 0.0
        if sockets:
            sx0, sz, sr, depth = sockets["x"], sockets["dz"], sockets["r"], sockets["depth"]
            for sx in (-1, 1):
                d = math.hypot(p.x - sx * sx0, (p.z - sz) * 0.85)
                if d < sr:
                    dy += depth * f * (1 - (d / sr) ** 2) ** 0.8
            # A heavy brow overhanging the sockets
            if sz + sr * 0.6 < p.z < sz + sr * 1.7 and abs(p.x) < sx0 + sr * 1.1:
                dy -= brow * f * math.sin((p.z - sz - sr * 0.6) / (sr * 1.1) * math.pi)
        if cheek:
            # Cheekbones standing out, the cheeks below them sucked in
            cz = (sockets["dz"] if sockets else 0.03) - 0.04
            for sx in (-1, 1):
                dc = math.hypot((p.x - sx * R[0] * 0.66) * 1.2, p.z - cz)
                if dc < 0.03:
                    dy -= 0.008 * cheek * f * (1 - dc / 0.03)
                dh = math.hypot((p.x - sx * R[0] * 0.55) * 1.1, p.z - (cz - 0.045))
                if dh < 0.035:
                    dy += 0.016 * cheek * f * (1 - dh / 0.035)
        if nose:
            # No nose: a dark inverted-V hollow where it should be
            nz = (sockets["dz"] if sockets else 0.03) - 0.035
            if -0.03 < p.z - nz < 0.012:
                w = 0.012 + (nz - p.z) * 0.25
                if abs(p.x) < w:
                    dy += nose * f * (1 - abs(p.x) / w)
        v.co.y += dy

    bm = bmesh.new()
    bm.from_mesh(me)
    mouth_local = Vector((0, -R[1], 0))
    upper_lip, lower_lip = [], []
    if grin:
        A, h0, dz, curve, rag = grin["A"], grin["h0"], grin["dz"], grin.get("curve", 0.0), grin.get("ragged", 0.3)
        corner = grin.get("corner", 0.003)

        def zc(a):
            t = a / A
            return dz + curve * t * t

        def hh(a):
            t = min(1.0, abs(a) / A)
            return h0 * (1 - t * t) ** 0.6 + corner

        kill = []
        for f in bm.faces:
            c = f.calc_center_median()
            if c.y > 0:
                continue
            a = math.atan2(c.x, -c.y)
            if abs(a) > A:
                continue
            h = hh(a) * (1 + rag * (noise.noise(Vector((a * 4, c.z * 30, 0.5))) ))
            if abs(c.z - zc(a)) < h:
                kill.append(f)
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.verts.ensure_lookup_table()
        for v in bm.verts:
            if not v.link_faces:
                continue
            if any(len(e.link_faces) == 1 for e in v.link_edges):
                a = math.atan2(v.co.x, -v.co.y)
                (upper_lip if v.co.z > zc(a) else lower_lip).append(v.co.copy())
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        mouth_local = Vector((0, -R[1] * 0.92, dz))
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True

    # Eye positions: just in front of each socket's floor
    eyes = []
    if sockets:
        for sx in (1, -1):
            best, by = 9, 0
            for v in me.vertices:
                if v.co.y > 0:
                    continue
                d = math.hypot(v.co.x - sx * sockets["x"], v.co.z - sockets["dz"])
                if d < best:
                    best, by = d, v.co.y
            eyes.append(Vector((sx * sockets["x"], by - 0.006, sockets["dz"])))

    # The throat: a black hollow filling the skull, seen through the mouth and the sockets
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1.0)
    throat = bpy.context.active_object
    throat.name = name + "Throat"
    for v in throat.data.vertices:
        v.co = Vector((v.co.x * R[0] * 0.8, v.co.y * R[1] * 0.72 + R[1] * 0.18, v.co.z * R[2] * 0.78 - R[2] * 0.08))
    throat.data.materials.append(material("Maw", (0, 0, 0, 1)))

    # Teeth along both lips, pointing across the gap and a little inward
    tooth_objs, lip_teeth = [], {-1: [], 1: []}
    if teeth and (upper_lip or lower_lip):
        for lip, sign in ((upper_lip, -1), (lower_lip, 1)):
            lip.sort(key=lambda p: math.atan2(p.x, -p.y))
            last = None
            for p in lip:
                if last is not None and (p - last).length < teeth["spacing"]:
                    continue
                last = p
                a = math.atan2(p.x, -p.y)
                t = min(1.0, abs(a) / grin["A"])
                ln = rng.uniform(*teeth["len"]) * (1 - 0.55 * t)
                d = Vector((rng.uniform(-0.15, 0.15), teeth.get("inward", 0.35) + rng.uniform(-0.1, 0.2), sign)).normalized()
                inward = Vector((-p.x, -p.y, 0)).normalized() * 0.003
                bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=teeth["r"] * (1 - 0.4 * t), radius2=0.0, depth=ln)
                tooth = bpy.context.active_object
                tooth.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
                tooth.location = p + inward + d * ln * 0.4
                activate(tooth)
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
                tooth_objs.append(tooth)
                lip_teeth[sign].append(tooth)
    teeth_obj = teeth_up = teeth_low = None
    if tooth_objs and teeth.get("split"):
        # Kept apart, for heads whose jaw is a separate piece
        if lip_teeth[-1]:
            teeth_up = join(lip_teeth[-1], name + "TeethUp")
            teeth_up.data.materials.append(material("Teeth", (0.6, 0.55, 0.45, 1)))
        if lip_teeth[1]:
            teeth_low = join(lip_teeth[1], name + "TeethLow")
            teeth_low.data.materials.append(material("Teeth", (0.6, 0.55, 0.45, 1)))
    elif tooth_objs:
        teeth_obj = join(tooth_objs, name + "Teeth")
        teeth_obj.data.materials.append(material("Teeth", (0.6, 0.55, 0.45, 1)))

    M = Matrix.Translation(Vector(C)) @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X")
    for o in (head, throat, teeth_obj, teeth_up, teeth_low):
        if o:
            o.data.transform(M)
    Minv = M.inverted()

    def jaw_weight(world):
        """How much of a point belongs to the lower jaw (0..1)."""
        if not grin:
            return 0.0
        p = Minv @ world
        a = math.atan2(p.x, -p.y)
        below = smooth01(-0.006, -0.03, p.z - (grin["dz"] + grin.get("curve", 0.0) * min(1.0, (a / grin["A"]) ** 2)))
        side = smooth01(grin["A"] + 0.45, grin["A"] - 0.05, abs(a))
        return below * side * (1.0 if p.y < R[1] * 0.25 else 0.0)

    def inside(world, pad=1.0):
        p = Minv @ world
        return (p.x / (R[0] * 1.45 * pad)) ** 2 + (p.y / (R[1] * 1.55 * pad)) ** 2 + (p.z / (R[2] * 1.45 * pad)) ** 2 < 1

    rot_only = Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X")
    return {
        "head": head, "throat": throat, "teeth": teeth_obj, "teeth_up": teeth_up, "teeth_low": teeth_low,
        "eyes": [M @ e for e in eyes], "mouth": M @ mouth_local,
        "jaw_dir": (rot_only @ Vector((0, -0.25, -1))).normalized(),
        "forward": (rot_only @ Vector((0, -1, 0))).normalized(),
        "jaw_weight": jaw_weight, "inside": inside, "M": M,
    }


def head_rigid(H, keep=("Maw", "Teeth")):
    """Rigid binding for a creature_head: skull to 'head', the lower jaw (and its teeth) to 'jaw'."""
    def rigid(co, mat):
        if mat in keep or mat in ("Hair",) or H["inside"](co):
            if mat == "Hair":
                return {"head": 1.0}
            w = H["jaw_weight"](co)
            if mat == "Teeth":
                w = 1.0 if w > 0.5 else 0.0
            if mat == "Maw":
                w = 0.0
            return {"head": 1.0 - w, "jaw": w}
        return None
    return rigid


def spikes(points, rng, length, radius, name, mat_name="Skin"):
    """Cones standing out of the skin: points = [(position, direction)]."""
    objs = []
    for p, d in points:
        ln = rng.uniform(*length)
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=radius, radius2=0.0, depth=ln)
        o = bpy.context.active_object
        o.rotation_euler = d.normalized().to_track_quat("Z", "Y").to_euler()
        o.location = p + d.normalized() * ln * 0.45
        activate(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for poly in o.data.polygons:
            poly.use_smooth = True
        objs.append(o)
    out = join(objs, name)
    out.data.materials.append(material(mat_name))
    return out


def polyline(pts, t):
    """Point at t (0..1) along a polyline."""
    lens = [(Vector(b) - Vector(a)).length for a, b in zip(pts, pts[1:])]
    total = sum(lens)
    d = t * total
    for (a, b), ln in zip(zip(pts, pts[1:]), lens):
        if d <= ln:
            return Vector(a).lerp(Vector(b), d / ln)
        d -= ln
    return Vector(pts[-1])


def skeleton():
    verts, edges, radii = [], [], []

    def add(p, r, parent=None):
        verts.append(Vector(p))
        radii.append(r)
        i = len(verts) - 1
        if parent is not None:
            edges.append((parent, i))
        return i
    return verts, edges, radii, add


def hand(add, palm_idx, sx, base, forward, down, lengths, spread=0.026, claw=0.0012, thumb=True):
    """Long jointed fingers ending in hooked claws. base: palm point; forward/down: finger directions."""
    for f in range(4):
        off = Vector((sx * (f - 1.5) * spread, 0, 0))
        ln = lengths[f]
        k1 = add(base + off * 1.2 + down * 0.11 * ln + forward * 0.02, 0.0095, palm_idx)
        k2 = add(base + off * 1.6 + down * 0.25 * ln + forward * 0.05, 0.0078, k1)
        k3 = add(base + off * 1.8 + down * 0.37 * ln + forward * 0.035, 0.006, k2)
        add(base + off * 1.7 + down * 0.45 * ln - forward * 0.03, claw, k3)
    if thumb:
        t1 = add(base + Vector((-sx * 0.035, 0, 0)) + down * 0.07 + forward * 0.04, 0.008, palm_idx)
        add(base + Vector((-sx * 0.05, 0, 0)) + down * 0.15 + forward * 0.07, claw, t1)


# -----------------------------------------------------------------------------
# THE WATCHER
# -----------------------------------------------------------------------------
def build_watcher2():
    reset()
    rng = random.Random(11)
    verts, edges, radii, add = skeleton()
    spine_pts = [(0, 0.04, 1.3), (0, 0.07, 1.48), (0, 0.07, 1.63), (0, 0.03, 1.82), (0, -0.08, 1.97),
                 (0, -0.2, 2.07), (0, -0.31, 2.12), (0, -0.41, 2.14), (0, -0.49, 2.15)]
    spine_r = [(0.12, 0.085), (0.055, 0.048), (0.07, 0.058), (0.15, 0.11), (0.16, 0.105), (0.12, 0.08),
               (0.04, 0.036), (0.035, 0.033), (0.034, 0.032)]
    ids = []
    for i, (p, r) in enumerate(zip(spine_pts, spine_r)):
        ids.append(add(p, r, ids[-1] if ids else None))
    pelvis, shoulders = ids[0], ids[5]
    add((0, -0.54, 2.16), (0.04, 0.04), ids[-1])

    for sx in (1, -1):
        sh = add((sx * 0.2, -0.18, 2.04), (0.048, 0.044), shoulders)
        el = add((sx * 0.31, -0.06, 1.46), (0.03, 0.03), sh)
        mid = add((sx * 0.33, -0.1, 1.16), (0.024, 0.022), el)
        wr = add((sx * 0.35, -0.16, 0.86), (0.02, 0.017), mid)
        palm = add((sx * 0.36, -0.19, 0.77), (0.036, 0.014), wr)
        hand(add, palm, sx, Vector((sx * 0.36, -0.2, 0.77)), Vector((0, -1, 0)), Vector((0, 0, -1)),
             (1.0, 1.12, 1.18, 0.95))
        hip = add((sx * 0.11, 0.04, 1.28), (0.055, 0.055), pelvis)
        th = add((sx * 0.13, -0.03, 0.99), (0.045, 0.045), hip)
        knee = add((sx * 0.15, -0.11, 0.72), (0.037, 0.037), th)
        shin = add((sx * 0.13, -0.01, 0.4), (0.026, 0.026), knee)
        ankle = add((sx * 0.12, 0.07, 0.1), (0.022, 0.022), shin)
        toe = add((sx * 0.12, -0.12, 0.03), (0.03, 0.012), ankle)
        for t in (-1, 0, 1):
            k = add((sx * 0.12 + t * 0.028, -0.24, 0.015), (0.007, 0.007), toe)
            add((sx * 0.12 + t * 0.03, -0.3, 0.0), (0.0012, 0.0012), k)

    body = skin_mesh("WatcherBody", verts, edges, radii, roots=(pelvis,), subsurf=2)
    for v in body.data.vertices:
        p, n = v.co, v.normal.copy()
        # Ribs and a sunken belly
        if abs(p.x) < 0.2 and 1.7 < p.z < 2.02 and n.y < 0.5:
            band = max(0.0, math.sin((p.z - 1.7) / 0.05 * math.pi)) ** 3
            side = min(1.0, abs(n.x) * 1.6 + max(0.0, -n.y))
            v.co += n * band * side * 0.013
        if abs(p.x) < 0.1 and 1.5 < p.z < 1.7 and n.y < -0.4:
            v.co -= n * 0.016 * math.sin((p.z - 1.5) / 0.2 * math.pi)
        # Shoulder blades jutting out of the hunched back
        for sx in (-1, 1):
            g = math.exp(-(((p.x - sx * 0.09) / 0.05) ** 2 + ((p.z - 1.95) / 0.07) ** 2))
            if n.y > 0.2:
                v.co += n * g * 0.03
        # Hip bones
        if 0.07 < abs(p.x) < 0.14 and 1.28 < p.z < 1.42 and n.y < 0:
            v.co += n * 0.012 * math.sin((p.z - 1.28) / 0.14 * math.pi)
        # Leathery, wrinkled hide
        v.co += n * 0.003 * noise.noise(p * 40)

    # Vertebrae: a row of spines down the hunched back
    pts = []
    for i in range(16):
        t = 0.06 + i / 15 * 0.82
        c = polyline(spine_pts, t)
        k = min(int(t * (len(spine_pts) - 1)), len(spine_r) - 1)
        back = c + Vector((0, spine_r[k][1] * 0.92, 0))
        pts.append((back, Vector((0, 1, 0.55 + t * 0.4))))
    spine_obj = spikes(pts, rng, (0.035, 0.075), 0.011, "WatcherSpines")

    H = creature_head(
        "WatcherHead", (0, -0.64, 2.23), (0.088, 0.108, 0.138), rng,
        shape=lambda r: Vector((r.x * (1 - 0.35 * smooth01(-0.02, -0.14, r.z)),
                                r.y * (1 - 0.12 * smooth01(-0.02, -0.14, r.z)) * (1 + 0.35 * smooth01(0.0, 0.1, r.z) * (r.y > 0)),
                                r.z * (1 + 0.32 * smooth01(-0.02, -0.12, r.z)))),
        sockets={"x": 0.035, "dz": 0.035, "r": 0.031, "depth": 0.07},
        grin={"A": 1.35, "h0": 0.016, "dz": -0.07, "curve": 0.05, "ragged": 0.35, "corner": 0.004},
        teeth={"len": (0.022, 0.038), "r": 0.0034, "spacing": 0.0065},
        rot=(-0.12, 0, 0))
    body.data.materials.append(material("Skin", (0.05, 0.04, 0.05, 1)))
    H["head"].data.materials.append(material("Skin"))
    decimate(body, 6500)
    parts = [body, spine_obj, H["head"], H["throat"]] + ([H["teeth"]] if H["teeth"] else [])
    watcher = join(parts, "Watcher")
    smart_uv(watcher, 0.5)

    hc = (0, -0.6, 2.2)
    bones = {
        "hips": ((0, 0.04, 1.28), (0, 0.06, 1.44), None),
        "spine": ((0, 0.06, 1.44), (0, 0.03, 1.82), "hips"),
        "chest": ((0, 0.03, 1.82), (0, -0.2, 2.07), "spine"),
        "neck": ((0, -0.2, 2.07), (0, -0.5, 2.15), "chest"),
        "head": ((0, -0.5, 2.15), (0, -0.58, 2.36), "neck"),
        "jaw": (tuple(H["mouth"]), tuple(H["mouth"] + H["jaw_dir"] * 0.05), "head"),
    }
    for side, sx in (("L", 1), ("R", -1)):
        bones.update({
            f"shoulder_{side}": ((sx * 0.05, -0.18, 2.04), (sx * 0.2, -0.18, 2.04), "chest"),
            f"upperarm_{side}": ((sx * 0.2, -0.18, 2.04), (sx * 0.31, -0.06, 1.46), f"shoulder_{side}"),
            f"forearm_{side}": ((sx * 0.31, -0.06, 1.46), (sx * 0.35, -0.16, 0.86), f"upperarm_{side}"),
            f"hand_{side}": ((sx * 0.35, -0.16, 0.86), (sx * 0.37, -0.22, 0.45), f"forearm_{side}"),
            f"thigh_{side}": ((sx * 0.11, 0.04, 1.28), (sx * 0.15, -0.11, 0.72), "hips"),
            f"shin_{side}": ((sx * 0.15, -0.11, 0.72), (sx * 0.12, 0.07, 0.1), f"thigh_{side}"),
            f"foot_{side}": ((sx * 0.12, 0.07, 0.1), (sx * 0.12, -0.28, 0.01), f"shin_{side}"),
        })
    rig = make_rig("WatcherRig", bones)
    bind(watcher, rig, bones, head_rigid(H))
    print("EYES_watcher", [to_three(e) for e in H["eyes"]], "JAW_watcher", to_three(H["jaw_dir"]))
    if PREVIEW:
        preview_colors()
    preview("watcher", target=(0, -0.1, 1.45), dist=4.4, height=1.7)
    face_preview("watcher", H)
    export([rig], "watcher.glb")


PREVIEW_COLORS = {"Skin": (0.5, 0.48, 0.47, 1), "Maw": (0.0, 0.0, 0.0, 1), "Teeth": (0.75, 0.68, 0.55, 1),
                  "Hair": (0.015, 0.015, 0.015, 1), "Gown": (0.45, 0.5, 0.46, 1)}


def preview_colors():
    for m in bpy.data.materials:
        c = PREVIEW_COLORS.get(m.name)
        if not c:
            continue
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        if b:
            b.inputs["Base Color"].default_value = c
            b.inputs["Roughness"].default_value = 0.6 if m.name != "Maw" else 1.0


def face_preview(name, H, dist=0.55):
    if not PREVIEW:
        return
    target = (H["M"] @ Vector((0, 0, 0)))
    cam = bpy.context.scene.camera
    cam.location = target + H["forward"] * dist + Vector((0.12, 0, 0.05))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = os.path.join(OUT, "preview_" + name + "_face.png")
    bpy.ops.render.render(write_still=True)


# -----------------------------------------------------------------------------
# THE UNSEEN: the patient
# -----------------------------------------------------------------------------
def build_unseen():
    reset()
    rng = random.Random(23)
    verts, edges, radii, add = skeleton()
    spine_pts = [(0, 0.02, 1.08), (0, 0.04, 1.24), (0, 0.04, 1.38), (0, 0.0, 1.56), (0, -0.04, 1.68), (0, -0.05, 1.76)]
    spine_r = [(0.13, 0.09), (0.085, 0.065), (0.09, 0.07), (0.15, 0.1), (0.16, 0.1), (0.12, 0.075)]
    ids = []
    for p, r in zip(spine_pts, spine_r):
        ids.append(add(p, r, ids[-1] if ids else None))
    pelvis, shoulders = ids[0], ids[-1]
    # The neck snaps over to one side, the head lying on its shoulder
    n1 = add((0.02, -0.05, 1.83), (0.04, 0.038), shoulders)
    n2 = add((0.07, -0.05, 1.87), (0.037, 0.035), n1)
    add((0.12, -0.05, 1.86), (0.04, 0.04), n2)
    for sx in (1, -1):
        sh = add((sx * 0.2, -0.04, 1.72), (0.05, 0.046), shoulders)
        el = add((sx * 0.25, -0.02, 1.36), (0.034, 0.032), sh)
        wr = add((sx * 0.27, -0.07, 1.0), (0.024, 0.02), el)
        palm = add((sx * 0.28, -0.08, 0.92), (0.034, 0.014), wr)
        hand(add, palm, sx, Vector((sx * 0.28, -0.085, 0.92)), Vector((0, -0.6, 0)), Vector((0, 0, -1)),
             (0.85, 0.95, 1.0, 0.8), spread=0.022)
        hip = add((sx * 0.1, 0.02, 1.06), (0.065, 0.06), pelvis)
        knee = add((sx * 0.12, -0.04, 0.58), (0.04, 0.04), hip)
        ankle = add((sx * 0.12, 0.03, 0.09), (0.028, 0.028), knee)
        toe = add((sx * 0.12, -0.12, 0.03), (0.034, 0.014), ankle)
        for t in (-1, 0, 1):
            add((sx * 0.12 + t * 0.022, -0.2, 0.012), (0.008, 0.008), toe)
    body = skin_mesh("UnseenBody", verts, edges, radii, roots=(pelvis,), subsurf=2)
    for v in body.data.vertices:
        p, n = v.co, v.normal.copy()
        if abs(p.x) < 0.17 and 1.46 < p.z < 1.7 and n.y < 0.3:          # starved ribs
            band = max(0.0, math.sin((p.z - 1.46) / 0.045 * math.pi)) ** 3
            v.co += n * band * 0.009
        for sx in (-1, 1):                                                 # the collarbone, the knees
            g = math.exp(-(((p.x - sx * 0.1) / 0.06) ** 2 + ((p.z - 1.74) / 0.015) ** 2))
            v.co += n * g * 0.012 * (n.y < 0)
        v.co += n * 0.002 * noise.noise(p * 50)

    # A torn hospital gown hanging off it, open down the back
    prof = [(0.2, 0.82), (0.19, 0.95), (0.175, 1.1), (0.16, 1.25), (0.175, 1.45), (0.19, 1.6), (0.19, 1.7), (0.13, 1.77)]
    dense = []
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        steps = max(2, int((z1 - z0) / 0.03))
        for k in range(steps):
            t = k / steps
            dense.append((r0 + (r1 - r0) * t, z0 + (z1 - z0) * t))
    dense.append(prof[-1])

    def folds(a, z):
        amp = smooth01(1.4, 0.85, z)
        return 1.12 + amp * (0.05 * math.sin(a * 7 + z * 3) + 0.03 * math.sin(a * 13 - z * 5)) \
            + 0.02 * noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, z * 3)))
    gown = lathe("UnseenGown", dense, segments=56, radial_noise=folds, cap_bottom=False, cap_top=False)
    bm = bmesh.new()
    bm.from_mesh(gown.data)
    for v in bm.verts:
        v.co.y *= 0.74
        a = math.atan2(v.co.x, v.co.y)        # 0 = the back (+Y)
        if v.co.z < 1.0:                      # torn, uneven hem
            v.co.z += max(0.0, math.sin(a * 5 + 0.6)) * max(0.0, math.sin(a * 17)) * 0.16 * (1 - (v.co.z - 0.82) / 0.18)
    kill = [f for f in bm.faces if abs(math.atan2(f.calc_center_median().x, f.calc_center_median().y)) < 0.32 + 0.25 * smooth01(1.5, 0.9, f.calc_center_median().z)]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(gown.data)
    bm.free()
    sleeves = []
    for sx in (1, -1):
        sleeves.append(skin_mesh3("Sleeve", [((sx * 0.15, 1.73, 0.03), 0.07, None), ((sx * 0.22, 1.66, 0.03), 0.066, 0),
                                              ((sx * 0.235, 1.56, 0.03), 0.06, 1)], subsurf=1))
    gown = join([gown] + sleeves, "UnseenGown")
    gown.data.materials.append(material("Gown", (0.5, 0.55, 0.5, 1)))

    H = creature_head(
        "UnseenHead", (0.2, -0.05, 1.83), (0.085, 0.1, 0.122), rng,
        shape=lambda r: Vector((r.x * (1 - 0.25 * smooth01(-0.02, -0.12, r.z)), r.y, r.z * (1 + 0.15 * smooth01(-0.03, -0.12, r.z)))),
        sockets={"x": 0.034, "dz": 0.03, "r": 0.026, "depth": 0.009},     # skin grown over the eyes
        grin={"A": 0.62, "h0": 0.034, "dz": -0.06, "curve": -0.012, "ragged": 0.25, "corner": 0.006},
        teeth={"len": (0.012, 0.02), "r": 0.0032, "spacing": 0.0062},
        nose=0.006, brow=0.004, cheek=1.4, rot=(0.1, 1.78, 0))
    body.data.materials.append(material("Skin", (0.7, 0.7, 0.68, 1)))
    H["head"].data.materials.append(material("Skin"))
    decimate(body, 6000)
    decimate(gown, 3000)
    parts = [body, gown, H["head"], H["throat"]] + ([H["teeth"]] if H["teeth"] else [])
    unseen = join(parts, "Unseen")
    smart_uv(unseen, 0.5)

    bones = {
        "hips": ((0, 0.02, 1.06), (0, 0.04, 1.22), None),
        "spine": ((0, 0.04, 1.22), (0, 0.0, 1.56), "hips"),
        "chest": ((0, 0.0, 1.56), (0, -0.05, 1.76), "spine"),
        "neck": ((0, -0.05, 1.76), (0.1, -0.05, 1.87), "chest"),
        "head": ((0.1, -0.05, 1.87), (0.3, -0.05, 1.8), "neck"),
        "jaw": (tuple(H["mouth"]), tuple(H["mouth"] + H["jaw_dir"] * 0.05), "head"),
    }
    for side, sx in (("L", 1), ("R", -1)):
        bones.update({
            f"shoulder_{side}": ((sx * 0.05, -0.04, 1.72), (sx * 0.2, -0.04, 1.72), "chest"),
            f"upperarm_{side}": ((sx * 0.2, -0.04, 1.72), (sx * 0.25, -0.02, 1.36), f"shoulder_{side}"),
            f"forearm_{side}": ((sx * 0.25, -0.02, 1.36), (sx * 0.27, -0.07, 1.0), f"upperarm_{side}"),
            f"hand_{side}": ((sx * 0.27, -0.07, 1.0), (sx * 0.28, -0.1, 0.62), f"forearm_{side}"),
            f"thigh_{side}": ((sx * 0.1, 0.02, 1.06), (sx * 0.12, -0.04, 0.58), "hips"),
            f"shin_{side}": ((sx * 0.12, -0.04, 0.58), (sx * 0.12, 0.03, 0.09), f"thigh_{side}"),
            f"foot_{side}": ((sx * 0.12, 0.03, 0.09), (sx * 0.12, -0.22, 0.01), f"shin_{side}"),
        })
    rig = make_rig("UnseenRig", bones)
    base_rigid = head_rigid(H)

    def rigid(co, mat):
        # The gown follows the torso and thighs only - never the head lying on the shoulder
        if mat == "Gown":
            return None
        return base_rigid(co, mat)
    bind(unseen, rig, bones, rigid)
    print("EYES_unseen", [to_three(e) for e in H["eyes"]], "JAW_unseen", to_three(H["jaw_dir"]))
    if PREVIEW:
        preview_colors()
    preview("unseen", target=(0, -0.1, 1.2), dist=3.6, height=1.5)
    face_preview("unseen", H)
    export([rig], "unseen.glb")


# -----------------------------------------------------------------------------
# THE DROWNED: a crawler
# -----------------------------------------------------------------------------
def build_crawler():
    reset()
    rng = random.Random(31)
    verts, edges, radii, add = skeleton()
    spine_pts = [(0, 0.42, 0.74), (0, 0.2, 0.75), (0, -0.02, 0.71), (0, -0.25, 0.65), (0, -0.42, 0.6)]
    spine_r = [(0.13, 0.1), (0.085, 0.08), (0.12, 0.1), (0.15, 0.115), (0.13, 0.09)]
    ids = []
    for p, r in zip(spine_pts, spine_r):
        ids.append(add(p, r, ids[-1] if ids else None))
    pelvis, shoulders = ids[0], ids[-1]
    n1 = add((0, -0.52, 0.52), (0.042, 0.04), shoulders)
    n2 = add((0, -0.6, 0.48), (0.038, 0.036), n1)
    add((0, -0.68, 0.44), (0.04, 0.04), n2)
    for sx in (1, -1):
        sh = add((sx * 0.19, -0.42, 0.6), (0.05, 0.045), shoulders)
        el = add((sx * 0.5, -0.5, 0.85), (0.034, 0.032), sh)
        mid = add((sx * 0.46, -0.76, 0.45), (0.027, 0.025), el)
        wr = add((sx * 0.4, -1.0, 0.07), (0.022, 0.02), mid)
        palm = add((sx * 0.39, -1.06, 0.03), (0.036, 0.012), wr)
        hand(add, palm, sx, Vector((sx * 0.39, -1.07, 0.03)), Vector((0, 0, 1)), Vector((0, -1, 0)),
             (0.85, 0.95, 1.0, 0.8), spread=0.024)
        hip = add((sx * 0.14, 0.42, 0.72), (0.07, 0.065), pelvis)
        knee = add((sx * 0.44, 0.32, 0.48), (0.042, 0.042), hip)
        shin = add((sx * 0.4, 0.62, 0.3), (0.032, 0.032), knee)
        ankle = add((sx * 0.36, 0.88, 0.1), (0.026, 0.026), shin)
        heel = add((sx * 0.35, 0.98, 0.06), (0.034, 0.016), ankle)
        for t in (-1, 0, 1):
            add((sx * 0.35 + t * 0.022, 1.1, 0.02), (0.008, 0.008), heel)
    body = skin_mesh("CrawlerBody", verts, edges, radii, roots=(pelvis,), subsurf=2)
    for v in body.data.vertices:
        p, n = v.co, v.normal.copy()
        # The spine ridged along the top of the arched back
        if abs(p.x) < 0.05 and -0.45 < p.y < 0.45 and n.z > 0.6:
            knob = max(0.0, math.sin((p.y + 0.45) / 0.055 * math.pi)) ** 4
            v.co += n * knob * 0.016
        # Ribs down the flanks
        if -0.4 < p.y < -0.05 and abs(n.x) > 0.5:
            band = max(0.0, math.sin((p.y + 0.4) / 0.06 * math.pi)) ** 3
            v.co += n * band * 0.012
        # A waterlogged, sagging belly
        if -0.25 < p.y < 0.3 and n.z < -0.5 and abs(p.x) < 0.12:
            v.co.z -= 0.035 * math.sin((p.y + 0.25) / 0.55 * math.pi) * -n.z
        # Bloated, wrinkled skin
        v.co += n * (0.004 * noise.noise(p * 26) + 0.0015 * noise.noise(p * 90))

    H = creature_head(
        "CrawlerHead", (0, -0.78, 0.41), (0.082, 0.1, 0.118), rng,
        shape=lambda r: Vector((r.x * (1 - 0.2 * smooth01(-0.02, -0.12, r.z)), r.y, r.z * (1 + 0.2 * smooth01(-0.02, -0.12, r.z)))),
        sockets={"x": 0.034, "dz": 0.032, "r": 0.028, "depth": 0.05},
        grin={"A": 0.78, "h0": 0.045, "dz": -0.075, "curve": -0.01, "ragged": 0.3, "corner": 0.006},
        teeth={"len": (0.012, 0.024), "r": 0.0032, "spacing": 0.007},
        nose=0.01, brow=0.004, cheek=1.2, rot=(0.3, 0, 0))

    # Long black hair from the scalp, hanging down around the face into the water
    bm = bmesh.new()
    M, Minv = H["M"], H["M"].inverted()
    R = (0.082, 0.1, 0.118)
    for i in range(110):
        theta = rng.uniform(-math.pi, math.pi)
        phi = rng.uniform(math.radians(-10), math.radians(80))
        d = Vector((math.cos(phi) * math.sin(theta), math.cos(phi) * math.cos(theta), math.sin(phi)))
        if d.y < -0.05:
            continue                                       # back and sides only: the face shows
        local = Vector((d.x * R[0] * 1.06, d.y * R[1] * 1.06, d.z * R[2] * 1.06))
        root = M @ local
        out = (M.to_3x3() @ Vector((d.x, d.y, 0))).normalized() if abs(d.x) + abs(d.y) > 0.1 else Vector((0, 1, 0))
        pts = [root.copy()]
        p = root.copy()
        seg = 0.03
        for s in range(18):
            p = p + Vector((0, 0, -seg)) + out * (0.01 if s < 5 else 0.002) + \
                Vector((rng.uniform(-0.006, 0.006), rng.uniform(-0.006, 0.006), 0))
            if H["inside"](p, 0.7):
                p = p + out * 0.02
            if p.z < 0.03:                                 # it reaches the water and drifts
                p.z = 0.03 + rng.uniform(0, 0.01)
                p = p + Vector((rng.uniform(-0.02, 0.02), 0.02, 0))
            pts.append(p.copy())
        width = rng.uniform(0.025, 0.045)
        tan = out.cross(Vector((0, 0, 1))).normalized()
        ring = []
        for s, pt in enumerate(pts):
            w = width * (1 - 0.6 * s / len(pts))
            ring.append((bm.verts.new(pt - tan * w / 2), bm.verts.new(pt + tan * w / 2)))
        for (a0, a1), (b0, b1) in zip(ring, ring[1:]):
            bm.faces.new((a0, a1, b1, b0))
    hme = bpy.data.meshes.new("CrawlerHair")
    bm.to_mesh(hme)
    bm.free()
    hair = bpy.data.objects.new("CrawlerHair", hme)
    bpy.context.collection.objects.link(hair)
    for p in hme.polygons:
        p.use_smooth = True
    hair.data.materials.append(material("Hair", (0.01, 0.01, 0.01, 1)))

    body.data.materials.append(material("Skin", (0.55, 0.6, 0.56, 1)))
    H["head"].data.materials.append(material("Skin"))
    decimate(body, 6500)
    parts = [body, hair, H["head"], H["throat"]] + ([H["teeth"]] if H["teeth"] else [])
    crawler = join(parts, "Crawler")
    smart_uv(crawler, 0.5)

    bones = {
        "hips": ((0, 0.42, 0.74), (0, 0.2, 0.75), None),
        "spine": ((0, 0.2, 0.75), (0, -0.25, 0.65), "hips"),
        "chest": ((0, -0.25, 0.65), (0, -0.42, 0.6), "spine"),
        "neck": ((0, -0.42, 0.6), (0, -0.68, 0.44), "chest"),
        "head": ((0, -0.68, 0.44), (0, -0.86, 0.36), "neck"),
        "jaw": (tuple(H["mouth"]), tuple(H["mouth"] + H["jaw_dir"] * 0.05), "head"),
    }
    for side, sx in (("L", 1), ("R", -1)):
        bones.update({
            f"shoulder_{side}": ((sx * 0.05, -0.42, 0.6), (sx * 0.19, -0.42, 0.6), "chest"),
            f"upperarm_{side}": ((sx * 0.19, -0.42, 0.6), (sx * 0.5, -0.5, 0.85), f"shoulder_{side}"),
            f"forearm_{side}": ((sx * 0.5, -0.5, 0.85), (sx * 0.4, -1.0, 0.07), f"upperarm_{side}"),
            f"hand_{side}": ((sx * 0.4, -1.0, 0.07), (sx * 0.39, -1.2, 0.02), f"forearm_{side}"),
            f"thigh_{side}": ((sx * 0.14, 0.42, 0.72), (sx * 0.44, 0.32, 0.48), "hips"),
            f"shin_{side}": ((sx * 0.44, 0.32, 0.48), (sx * 0.36, 0.88, 0.1), f"thigh_{side}"),
            f"foot_{side}": ((sx * 0.36, 0.88, 0.1), (sx * 0.35, 1.12, 0.02), f"shin_{side}"),
        })
    rig = make_rig("CrawlerRig", bones)
    bind(crawler, rig, bones, head_rigid(H))
    print("EYES_crawler", [to_three(e) for e in H["eyes"]], "JAW_crawler", to_three(H["jaw_dir"]))
    if PREVIEW:
        preview_colors()
    preview("crawler", target=(0, -0.1, 0.45), dist=3.4, height=1.6)
    face_preview("crawler", H, dist=0.6)
    export([rig], "crawler.glb")


def split_jaw(H, name):
    """Cut a creature_head's skin in two along its jaw weights: returns the jaw object."""
    head = H["head"]
    activate(head)
    bpy.ops.object.duplicate()
    jaw = bpy.context.active_object
    jaw.name = name
    for obj, keep_jaw in ((head, False), (jaw, True)):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        kill = [f for f in bm.faces if (H["jaw_weight"](f.calc_center_median()) >= 0.5) != keep_jaw]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(obj.data)
        bm.free()
    return jaw


# -----------------------------------------------------------------------------
# The Angel's face: smooth as porcelain, eyes that burn, and a jaw that drops open
# to its chest when it comes for you. Built around the head centre (three.js headGroup
# origin), front -Y. Returns the parts plus the jaw hinge (three.js coordinates).
# -----------------------------------------------------------------------------
def angel_head(rng):
    R = (0.232, 0.257, 0.33)
    H = creature_head(
        "AngelHead", (0, 0, 0), R, rng,
        shape=lambda r: Vector((r.x * (1 - 0.3 * smooth01(-0.05, -0.3, r.z)), r.y * (1 - 0.1 * smooth01(-0.05, -0.3, r.z)),
                                r.z * (1 + 0.12 * smooth01(-0.05, -0.3, r.z)))),
        sockets={"x": 0.085, "dz": 0.07, "r": 0.06, "depth": 0.05},
        grin={"A": 1.05, "h0": 0.005, "dz": -0.15, "curve": 0.02, "ragged": 0.1, "corner": 0.002},
        teeth={"len": (0.045, 0.08), "r": 0.009, "spacing": 0.016, "split": True, "inward": 1.1},
        nose=0.0, cheek=0.0, brow=0.012, segs=(72, 54))
    jaw = split_jaw(H, "AngelJaw")
    skin = material("Skin")
    for o in (H["head"], jaw):
        o.data.materials.clear()
        o.data.materials.append(skin)
    H["throat"].name = "AngelThroat"
    hinge = Vector((0, R[1] * 0.35, -0.15))
    print("ANGEL_JAW_HINGE_THREE", to_three(hinge), "ANGEL_EYES_THREE", [to_three(e) for e in H["eyes"]])
    parts = [H["head"], jaw, H["throat"]]
    if H["teeth_up"]:
        H["teeth_up"].name = "AngelTeethUp"
        parts.append(H["teeth_up"])
    if H["teeth_low"]:
        H["teeth_low"].name = "AngelTeethLow"
        parts.append(H["teeth_low"])
    return parts


def wing_eyes(rng, along):
    """Eyes open all over the wing, among the feathers (three.js wing space, facing +Z)."""
    objs = []
    for i in range(15):
        t = rng.uniform(0.25, 2.7)
        base = along(t)
        p = Vector((base.x + rng.uniform(-0.05, 0.2), base.y - rng.uniform(0.15, 0.95) * (1.0 if t > 0.6 else 0.6), 0.05))
        r = rng.uniform(0.035, 0.07)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=r)
        e = bpy.context.active_object
        look = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.2, 0.15), 1)).normalized()

        def shade(v, look=look, r=r):
            d = v.co.normalized()
            c = d.dot(T(*look))
            return 0.02 if c > 0.86 else (0.35 if c > 0.78 else 1.0)       # pupil, iris, white
        set_colors(e, shade)
        e.location = T(*p)
        activate(e)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for poly in e.data.polygons:
            poly.use_smooth = True
        objs.append(e)
    out = join(objs, "AngelWingEyes")
    out.data.materials.append(material("WingEye", (1, 1, 1, 1)))
    return out


# -----------------------------------------------------------------------------
# The women's faces: hollow black eyes and a mouth hanging open in a silent scream.
# Relative to the neck pivot (three.js 0, 1.6, 0).
# -----------------------------------------------------------------------------
def figure_head(rng):
    H = creature_head(
        "FigureHead", T(0, 0.12, 0.01), (0.085, 0.098, 0.112), rng,
        shape=lambda r: Vector((r.x * (1 - 0.3 * smooth01(-0.03, -0.11, r.z)), r.y, r.z)),
        sockets={"x": 0.031, "dz": 0.02, "r": 0.024, "depth": 0.055},
        grin={"A": 0.5, "h0": 0.03, "dz": -0.06, "curve": -0.006, "ragged": 0.2, "corner": 0.004},
        nose=0.006, cheek=1.3, brow=0.004, segs=(48, 36))
    H["throat"].name = "FigureHollow"
    return H
