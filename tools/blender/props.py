# THE WATCHING DARK - props for the Holding Tanks (Level III) and the Studio (Level IV)
# exec'd by build_models.py (shares its helpers). Every prop is exported as one object per
# material, named "<Prop>_<Material>", built around its own origin (floor level, front -Y),
# so the game can batch them by material and colour them however it likes.

PROPS = []


def _finish(o, smooth_angle=0.6):
    activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=smooth_angle)
    except Exception:
        bpy.ops.object.shade_smooth()
    return o


def _bevel(o, w, seg=2):
    if w <= 0:
        return o
    m = o.modifiers.new("Bevel", "BEVEL")
    m.width = w
    m.segments = seg
    m.limit_method = "ANGLE"
    apply_modifiers(o)
    return o


def box(size, loc, rot=(0, 0, 0), bev=0.01, seg=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    activate(o)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(_bevel(o, bev, seg))


def cyl(r, depth, loc, rot=(0, 0, 0), verts=20, r2=None, cap=True, bev=0.0):
    fill = "NGON" if cap else "NOTHING"
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot, end_fill_type=fill)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot, end_fill_type=fill)
    return _finish(_bevel(bpy.context.active_object, bev, 1))


def ball(r, loc, scale=(1, 1, 1), segs=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o)


def ring(r, minor, loc, rot=(0, 0, 0), segs=28):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=minor, major_segments=segs, minor_segments=8, location=loc, rotation=rot)
    return _finish(bpy.context.active_object)


def rod(a, b, r, verts=8):
    """A cylinder from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return _finish(o)


def prop(name, parts):
    """parts: {material: [objects]} -> one exported object per material."""
    for mat_name, objs in parts.items():
        objs = [o for o in objs if o]
        if not objs:
            continue
        o = join(objs, f"{name}_{mat_name}") if len(objs) > 1 else objs[0]
        o.name = f"{name}_{mat_name}"
        o.data.materials.clear()
        o.data.materials.append(material(mat_name))
        activate(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        PROPS.append(o)


# -----------------------------------------------------------------------------
# LEVEL III: the holding tanks
# -----------------------------------------------------------------------------
def build_tank():
    metal = [
        cyl(1.18, 0.5, (0, 0, 0.25), verts=32, bev=0.03),
        ring(1.12, 0.045, (0, 0, 0.52), segs=40),
        cyl(1.14, 0.34, (0, 0, 3.32), verts=32, bev=0.03),
        ring(1.1, 0.04, (0, 0, 3.15), segs=40),
    ]
    dome = ball(1.08, (0, 0, 3.48), scale=(1, 1, 0.28), segs=32, rings=10)
    metal.append(dome)
    # Feed pipes up into the ceiling
    for (x, y, r) in ((0.5, 0.3, 0.07), (-0.45, 0.35, 0.055), (0.05, -0.55, 0.06)):
        metal.append(cyl(r, 1.05, (x, y, 3.95), verts=10))
        metal.append(cyl(r * 1.5, 0.08, (x, y, 3.62), verts=10))
    # Uprights holding the cap
    for k in range(4):
        a = k / 4 * math.tau + math.pi / 4
        metal.append(cyl(0.035, 2.66, (math.cos(a) * 1.07, math.sin(a) * 1.07, 1.83), verts=8))
    # Drain valve and a pressure gauge at the front
    metal.append(ring(0.13, 0.018, (0, -1.24, 0.3), rot=(math.pi / 2, 0, 0), segs=16))
    metal.append(cyl(0.03, 0.12, (0, -1.19, 0.3), rot=(math.pi / 2, 0, 0), verts=8))
    metal.append(cyl(0.09, 0.05, (0.42, -1.12, 0.36), rot=(math.pi / 2, 0, 0.35), verts=16))
    glass = [cyl(1.0, 2.66, (0, 0, 1.83), verts=36, cap=False)]
    liquid = [cyl(0.97, 2.4, (0, 0, 1.72), verts=36)]
    prop("Tank", {"Metal": metal, "Glass": glass, "Liquid": liquid})


SPECIMEN_NECK = (0.0, -0.02, 2.1)   # Blender coords: where the head turns


def build_specimen():
    """A pale woman floating in the liquid, limbs drifting, hair streaming up."""
    rng = random.Random(41)
    verts, edges, radii, add = skeleton()
    pelvis = add((0, 0.02, 1.32), (0.12, 0.085))
    belly = add((0, 0.0, 1.52), (0.1, 0.075), pelvis)
    chest = add((0, -0.02, 1.78), (0.13, 0.085), belly)
    sh = add((0, -0.01, 1.95), (0.1, 0.07), chest)
    add(SPECIMEN_NECK, (0.04, 0.04), sh)
    for sx in (1, -1):
        s = add((sx * 0.16, -0.01, 1.93), (0.042, 0.04), sh)
        el = add((sx * 0.38, 0.06, 1.78 + sx * 0.04), (0.03, 0.03), s)
        wr = add((sx * 0.5, 0.0, 1.98 + sx * 0.06), (0.022, 0.02), el)
        palm = add((sx * 0.54, -0.02, 2.04 + sx * 0.06), (0.03, 0.012), wr)
        for f in range(4):
            add((sx * (0.6 + f * 0.004), -0.04 + (f - 1.5) * 0.018, 2.1 + sx * 0.06), 0.006, palm)
        hip = add((sx * 0.1, 0.02, 1.28), (0.06, 0.058), pelvis)
        knee = add((sx * 0.13, -0.18 - (0.06 if sx > 0 else 0), 0.98), (0.04, 0.04), hip)
        ank = add((sx * 0.12, 0.02, 0.66 + (0.08 if sx > 0 else 0)), (0.026, 0.026), knee)
        add((sx * 0.12, -0.05, 0.6 + (0.08 if sx > 0 else 0)), (0.03, 0.012), ank)
    body = skin_mesh("Specimen", verts, edges, radii, roots=(pelvis,), subsurf=2)
    for v in body.data.vertices:
        v.co += v.normal * 0.004 * noise.noise(v.co * 30)
    decimate(body, 3500)
    # The head: hollow eyes, a slack open mouth (built at the neck, then moved to the origin)
    H = creature_head("SpecimenHead", (0, -0.03, 2.22), (0.082, 0.095, 0.11), rng,
                      sockets={"x": 0.031, "dz": 0.022, "r": 0.025, "depth": 0.05},
                      grin={"A": 0.45, "h0": 0.02, "dz": -0.06, "curve": -0.004, "ragged": 0.2, "corner": 0.003},
                      nose=0.006, cheek=1.2, brow=0.004, rot=(0.35, 0.0, 0.0), segs=(40, 28))
    # Hair streaming upward in the liquid
    bm = bmesh.new()
    M = H["M"]
    for i in range(70):
        theta = rng.uniform(-math.pi, math.pi)
        phi = rng.uniform(math.radians(5), math.radians(85))
        d = Vector((math.cos(phi) * math.sin(theta), math.cos(phi) * math.cos(theta), math.sin(phi)))
        if d.y < -0.3 and d.z < 0.6:
            continue
        root = M @ Vector((d.x * 0.087, d.y * 0.1, d.z * 0.115))
        out = Vector((d.x, d.y, 0)).normalized() if abs(d.x) + abs(d.y) > 0.1 else Vector((0, 1, 0))
        pts, p = [root.copy()], root.copy()
        for s in range(12):
            p = p + Vector((0, 0, 0.045)) + out * 0.025 + Vector((rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), 0))
            pts.append(p.copy())
        width = rng.uniform(0.02, 0.035)
        tan = out.cross(Vector((0, 0, 1))).normalized()
        rows = []
        for s, pt in enumerate(pts):
            w = width * (1 - 0.5 * s / len(pts))
            rows.append((bm.verts.new(pt - tan * w / 2), bm.verts.new(pt + tan * w / 2)))
        for (a0, a1), (b0, b1) in zip(rows, rows[1:]):
            bm.faces.new((a0, a1, b1, b0))
    hme = bpy.data.meshes.new("SpecimenHair")
    bm.to_mesh(hme)
    bm.free()
    hair = bpy.data.objects.new("SpecimenHair", hme)
    bpy.context.collection.objects.link(hair)
    # Everything on the head is exported relative to the neck, so the game can turn it
    for o in (H["head"], H["throat"], hair):
        o.data.transform(Matrix.Translation(-Vector(SPECIMEN_NECK)))
    print("SPECIMEN_NECK_THREE", to_three(Vector(SPECIMEN_NECK)))
    prop("Specimen", {"Skin": [body]})
    prop("SpecimenHead", {"Skin": [H["head"]], "Maw": [H["throat"]], "Hair": [hair]})


# -----------------------------------------------------------------------------
# LEVEL IV: the studio - 1950s home-life sets and the crew's gear
# -----------------------------------------------------------------------------
def tapered_legs(xs, ys, h, top_r=0.025, bot_r=0.015, splay=0.04):
    legs = []
    for x in xs:
        for y in ys:
            sx, sy = (1 if x > 0 else -1), (1 if y > 0 else -1)
            legs.append(rod((x, y, h), (x + sx * splay, y + sy * splay, 0.0), top_r, verts=8))
    return legs


def build_sofa(name="Sofa", w=2.0):
    fab = [
        box((w, 0.85, 0.2), (0, 0, 0.32), bev=0.04, seg=3),
        box((w, 0.22, 0.52), (0, 0.33, 0.68), rot=(-0.12, 0, 0), bev=0.07, seg=3),
        box((0.18, 0.85, 0.36), (w / 2 - 0.09, 0, 0.48), bev=0.06, seg=3),
        box((0.18, 0.85, 0.36), (-w / 2 + 0.09, 0, 0.48), bev=0.06, seg=3),
    ]
    n = max(1, int(round((w - 0.36) / 0.6)))
    cw = (w - 0.36) / n
    for i in range(n):
        x = -w / 2 + 0.18 + cw * (i + 0.5)
        fab.append(box((cw - 0.02, 0.7, 0.12), (x, -0.05, 0.47), bev=0.05, seg=3))
    wood = tapered_legs((-w / 2 + 0.1, w / 2 - 0.1), (-0.32, 0.32), 0.22)
    prop(name, {"Fabric": fab, "Wood": wood})


def build_living():
    build_sofa("Sofa", 2.0)
    build_sofa("Armchair", 0.95)
    prop("CoffeeTable", {"Wood": [box((1.1, 0.6, 0.05), (0, 0, 0.42), bev=0.015)] + tapered_legs((-0.48, 0.48), (-0.24, 0.24), 0.4, 0.02, 0.012)})
    prop("FloorLamp", {
        "Metal": [cyl(0.17, 0.04, (0, 0, 0.02), verts=20, bev=0.01), cyl(0.014, 1.45, (0, 0, 0.75), verts=8)],
        "Shade": [cyl(0.25, 0.32, (0, 0, 1.55), verts=24, r2=0.15, cap=False)],
    })
    # A walnut television console on splayed legs
    prop("TVSet", {
        "Wood": [box((0.82, 0.55, 0.62), (0, 0, 0.67), bev=0.05, seg=3)] + tapered_legs((-0.34, 0.34), (-0.2, 0.2), 0.36, 0.022, 0.014),
        "Screen": [box((0.52, 0.04, 0.4), (-0.08, -0.27, 0.72), bev=0.06, seg=4)],
        "Chrome": [cyl(0.035, 0.04, (0.3, -0.285, 0.8), rot=(math.pi / 2, 0, 0), verts=12),
                   cyl(0.035, 0.04, (0.3, -0.285, 0.66), rot=(math.pi / 2, 0, 0), verts=12),
                   rod((-0.1, 0.1, 0.98), (-0.3, 0.2, 1.4), 0.006), rod((-0.06, 0.1, 0.98), (0.12, 0.22, 1.42), 0.006)],
    })


def build_kitchen():
    prop("Fridge", {
        "Enamel": [box((0.76, 0.72, 1.62), (0, 0, 0.84), bev=0.12, seg=6)],
        "Chrome": [box((0.05, 0.06, 0.32), (0.3, -0.38, 1.15), bev=0.02), box((0.7, 0.02, 0.025), (0, -0.365, 1.3), bev=0.008)],
    })
    prop("Counter", {
        "Enamel": [box((1.8, 0.62, 0.86), (0, 0, 0.43), bev=0.02)],
        "Wood": [box((1.86, 0.68, 0.05), (0, -0.01, 0.885), bev=0.012)],
        "Chrome": [box((0.12, 0.02, 0.02), (x, -0.325, 0.72), bev=0.006) for x in (-0.6, 0.0, 0.6)]
                  + [box((0.004, 0.01, 0.62), (x, -0.315, 0.4), bev=0) for x in (-0.3, 0.3)],
    })
    prop("KitchenTable", {
        "Enamel": [cyl(0.55, 0.04, (0, 0, 0.76), verts=36, bev=0.012)],
        "Chrome": [ring(0.55, 0.018, (0, 0, 0.76), segs=40), cyl(0.04, 0.72, (0, 0, 0.38), verts=12), cyl(0.3, 0.03, (0, 0, 0.015), verts=24)],
    })
    prop("KitchenChair", {
        "Fabric": [box((0.44, 0.42, 0.07), (0, 0, 0.46), bev=0.03, seg=3), box((0.42, 0.06, 0.28), (0, 0.22, 0.78), bev=0.03, seg=3)],
        "Chrome": tapered_legs((-0.19, 0.19), (-0.18, 0.18), 0.43, 0.012, 0.012, 0.02)
                  + [rod((-0.19, 0.2, 0.46), (-0.19, 0.22, 0.95), 0.012), rod((0.19, 0.2, 0.46), (0.19, 0.22, 0.95), 0.012)],
    })


def build_bedroom():
    prop("Bed", {
        "Wood": [box((1.5, 2.05, 0.3), (0, 0, 0.25), bev=0.03), box((1.56, 0.08, 1.1), (0, 1.03, 0.6), bev=0.04, seg=3),
                 box((1.56, 0.06, 0.55), (0, -1.03, 0.33), bev=0.03)] + tapered_legs((-0.7, 0.7), (-0.95, 0.95), 0.12, 0.03, 0.02, 0.0),
        "Sheet": [box((1.42, 1.95, 0.2), (0, 0, 0.5), bev=0.06, seg=3), box((0.55, 0.32, 0.12), (-0.34, 0.78, 0.64), bev=0.05, seg=3),
                  box((0.55, 0.32, 0.12), (0.34, 0.78, 0.64), bev=0.05, seg=3)],
        "Fabric": [box((1.5, 1.3, 0.06), (0, -0.33, 0.62), bev=0.025, seg=2), box((1.52, 0.04, 0.32), (0, -0.98, 0.47), bev=0.015)],
    })
    prop("Nightstand", {
        "Wood": [box((0.5, 0.42, 0.55), (0, 0, 0.3), bev=0.02)] + tapered_legs((-0.21, 0.21), (-0.17, 0.17), 0.05, 0.015, 0.012, 0.0),
        "Chrome": [cyl(0.02, 0.03, (0, -0.22, 0.38), rot=(math.pi / 2, 0, 0), verts=10)],
        "Shade": [cyl(0.15, 0.2, (0, 0, 0.98), verts=20, r2=0.1, cap=False)],
        "Metal": [cyl(0.08, 0.03, (0, 0, 0.59), verts=16), cyl(0.012, 0.3, (0, 0, 0.75), verts=8)],
    })
    prop("Wardrobe", {
        "Wood": [box((1.05, 0.56, 1.9), (0, 0, 1.0), bev=0.025), box((1.12, 0.6, 0.06), (0, 0, 1.97), bev=0.02),
                 box((0.004, 0.02, 1.7), (0, -0.285, 1.0), bev=0)] + tapered_legs((-0.46, 0.46), (-0.22, 0.22), 0.06, 0.02, 0.016, 0.0),
        "Chrome": [box((0.02, 0.03, 0.14), (x, -0.3, 1.1), bev=0.006) for x in (-0.06, 0.06)],
    })


def build_crew_gear():
    # A studio camera on a pedestal
    metal = [cyl(0.36, 0.06, (0, 0, 0.14), verts=24, bev=0.01), cyl(0.07, 1.0, (0, 0, 0.65), verts=12), cyl(0.05, 0.3, (0, 0, 1.25), verts=12)]
    for k in range(3):
        a = k / 3 * math.tau
        metal.append(rod((0, 0, 0.14), (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.08), 0.03))
        metal.append(cyl(0.05, 0.04, (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.05), rot=(0, math.pi / 2, a), verts=12))
    metal += [rod((0.15, 0.3, 1.38), (0.35, 0.75, 1.2), 0.016), rod((-0.15, 0.3, 1.38), (-0.35, 0.75, 1.2), 0.016)]
    dark = [box((0.46, 0.85, 0.46), (0, 0.05, 1.6), bev=0.04, seg=3), box((0.28, 0.2, 0.2), (0, 0.48, 1.76), bev=0.03),
            box((0.3, 0.1, 0.25), (0.0, 0.52, 1.95), bev=0.02)]
    lens = [cyl(0.11, 0.32, (0, -0.52, 1.6), rot=(math.pi / 2, 0, 0), verts=20, bev=0.01)]
    prop("StudioCamera", {"Metal": metal, "Dark": dark, "Lens": lens})
    # A fresnel lamp on a tripod
    m2 = [cyl(0.022, 1.9, (0, 0, 1.15), verts=8), box((0.5, 0.06, 0.06), (0, 0, 2.1), bev=0.01)]
    for k in range(3):
        a = k / 3 * math.tau + 0.3
        m2.append(rod((0, 0, 0.75), (math.cos(a) * 0.55, math.sin(a) * 0.55, 0.0), 0.016))
    d2 = [cyl(0.2, 0.42, (0, -0.02, 2.32), rot=(math.pi / 2 - 0.35, 0, 0), verts=20, bev=0.02)]
    for (x, z, ry) in ((0.24, 2.32, 0.5), (-0.24, 2.32, -0.5)):
        m2.append(box((0.02, 0.18, 0.36), (x, -0.27, z + 0.08), rot=(-0.35, 0, ry), bev=0.004))
    l2 = [cyl(0.17, 0.02, (0, -0.22, 2.4), rot=(math.pi / 2 - 0.35, 0, 0), verts=20)]
    prop("StageLight", {"Metal": m2, "Dark": d2, "Lens": l2})
    # The director's chair
    wood = [rod((sx * 0.25, -0.2, 0.0), (sx * 0.25, 0.2, 0.62), 0.02) for sx in (-1, 1)]
    wood += [rod((sx * 0.25, 0.2, 0.0), (sx * 0.25, -0.2, 0.62), 0.02) for sx in (-1, 1)]
    wood += [rod((sx * 0.27, 0.2, 0.62), (sx * 0.27, 0.24, 1.15), 0.022) for sx in (-1, 1)]
    wood += [box((0.08, 0.5, 0.04), (sx * 0.29, 0.0, 0.85), bev=0.01) for sx in (-1, 1)]
    wood += [rod((sx * 0.29, -0.2, 0.62), (sx * 0.29, -0.2, 0.85), 0.018) for sx in (-1, 1)]
    canvas = [box((0.52, 0.42, 0.02), (0, 0, 0.62), bev=0.005), box((0.56, 0.02, 0.22), (0, 0.24, 1.0), rot=(0.08, 0, 0), bev=0.005)]
    prop("DirectorChair", {"Wood": wood, "Canvas": canvas})
    # A boom microphone on a stand
    prop("BoomMic", {
        "Metal": [cyl(0.022, 1.5, (0, 0, 0.8), verts=8), rod((0, 0, 1.55), (0, -1.6, 2.35), 0.016)]
                 + [rod((0, 0, 0.5), (math.cos(k / 3 * math.tau) * 0.4, math.sin(k / 3 * math.tau) * 0.4, 0.0), 0.014) for k in range(3)],
        "Dark": [cyl(0.05, 0.34, (0, -1.68, 2.3), rot=(math.pi / 2 - 0.45, 0, 0), verts=14, bev=0.02)],
    })


def build_locker():
    """A tall steel locker with vent slots in the door - big enough to hide in."""
    metal = [box((0.64, 0.56, 1.96), (0, 0, 0.99), bev=0.012),
             box((0.6, 0.03, 1.86), (0, -0.29, 1.0), bev=0.008)]
    dark = []
    for z in (1.72, 1.66, 1.6, 1.54, 0.34, 0.28, 0.22):
        dark.append(box((0.4, 0.02, 0.022), (0, -0.305, z), bev=0.004))
    chrome = [box((0.03, 0.04, 0.2), (0.22, -0.32, 1.08), bev=0.008), cyl(0.03, 0.02, (0.22, -0.315, 1.3), rot=(math.pi / 2, 0, 0), verts=10)]
    prop("Locker", {"Metal": metal, "Dark": dark, "Chrome": chrome})


def build_props():
    reset()
    PROPS.clear()
    build_locker()
    build_tank()
    build_specimen()
    build_living()
    build_kitchen()
    build_bedroom()
    build_crew_gear()
    if PREVIEW:
        preview_colors()
        groups = {}
        for o in PROPS:
            groups.setdefault(o.name.split("_")[0], []).append(o)
        sets = [("tanks", ["Tank", "Specimen", "SpecimenHead"]), ("living", ["Sofa", "Armchair", "CoffeeTable", "FloorLamp", "TVSet"]),
                ("kitchen", ["Fridge", "Counter", "KitchenTable", "KitchenChair"]), ("bedroom", ["Bed", "Nightstand", "Wardrobe"]),
                ("crew", ["StudioCamera", "StageLight", "DirectorChair", "BoomMic", "Locker"])]
        for label, names in sets:
            for o in PROPS:
                o.hide_render = True
            x = 0
            for n in names:
                for o in groups.get(n, []):
                    o.hide_render = False
                    o.location = (x, 0, 0)
                    if n == "SpecimenHead":
                        o.location = (x - 2.4 + SPECIMEN_NECK[0], SPECIMEN_NECK[1], SPECIMEN_NECK[2])
                if n != "Specimen":
                    x += 2.4
            preview("props_" + label, target=(max(0, x - 2.4) / 2, 0, 1.1), dist=max(3.5, x * 0.75), height=2.4, lens=40, size=900)
        for o in PROPS:
            o.location = (0, 0, 0)
            o.hide_render = False
    export(PROPS, "props.glb")
