// THE WATCHING DARK - Blender-built props (tools/blender/props.py), placed and batched
// Each prop is a set of per-material pieces; a batch collects transformed copies of every
// piece and merges them per material, so a whole level of furniture is a few draw calls.
'use strict';

const Props = (() => {
    // Default looks for each material key (levels can override any of them)
    const LOOKS = {
        Metal: { color: 0x3a3a3c, roughness: 0.45, metalness: 0.8 },
        Chrome: { color: 0xc8c8cc, roughness: 0.18, metalness: 1.0 },
        Wood: { color: 0x5a3420, roughness: 0.55 },
        Fabric: { color: 0x6f9088, roughness: 0.95 },
        Enamel: { color: 0xd8d0b8, roughness: 0.3 },
        Screen: { color: 0x0a0d0c, roughness: 0.15, metalness: 0.2 },
        Shade: { color: 0xd8c8a0, roughness: 0.9, side: THREE.DoubleSide },
        Sheet: { color: 0xd8d4c8, roughness: 0.92 },
        Dark: { color: 0x141416, roughness: 0.6, metalness: 0.3 },
        Lens: { color: 0x0c1014, roughness: 0.05, metalness: 0.6 },
        Canvas: { color: 0x7a1e18, roughness: 0.95 },
        Glass: { color: 0x9ab8b0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide },
        Liquid: { color: 0x08201a, roughness: 0.2, emissive: 0x1c6e48, emissiveIntensity: 1, transparent: true, opacity: 0.62, depthWrite: false },
        Skin: { color: 0xc0c4bc, roughness: 0.5 },
        Maw: { color: 0x000000, roughness: 1 },
        Hair: { color: 0x060606, roughness: 0.4, side: THREE.DoubleSide }
    };

    function material(key, extra = {}) {
        return new THREE.MeshStandardMaterial(Object.assign({}, LOOKS[key] || { color: 0x888888, roughness: 0.8 }, extra));
    }

    const has = (name) => Assets.ok && Assets.prefixed('props', name).length > 0;
    const parts = (name) => (Assets.ok ? Assets.prefixed('props', name) : []);

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    function matrixFor(x, y, z, ry = 0, s = 1) {
        q.setFromEuler(e.set(0, ry, 0));
        return m4.compose(pv.set(x, y, z), q, sv.set(s, s, s));
    }

    // A batch of placed props, merged per material when flushed.
    // remap: { Liquid: 'Liquid#3' } sends a piece to a differently-keyed bucket ('' drops it)
    function batch() {
        const groups = new Map();
        const push = (key, geo) => {
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(geo);
        };
        return {
            add(name, x, y, z, ry = 0, s = 1, remap = null) {
                const list = parts(name);
                const mx = matrixFor(x, y, z, ry, s);
                for (const p of list) {
                    // remap[key] = '' leaves that piece out (e.g. a drained tank has no liquid)
                    const k = remap && p.key in remap ? remap[p.key] : p.key;
                    if (k) push(k, p.geo.clone().applyMatrix4(mx));
                }
                return list.length > 0;
            },
            addGeometry(key, geo) { push(key, geo); },
            // mats: { key: material } (keys missing here get the default look for their base key)
            flush(parent, mats = {}, { shadow = true } = {}) {
                const out = {};
                for (const [key, geos] of groups) {
                    if (!geos.length) continue;
                    const merged = mergeGeometries(geos);
                    geos.forEach((g) => g.dispose());
                    const mat = mats[key] || mats[key.split('#')[0]] || material(key.split('#')[0]);
                    const mesh = new THREE.Mesh(merged, mat);
                    const clear = mat.transparent;
                    mesh.castShadow = shadow && !clear;
                    mesh.receiveShadow = !clear;
                    parent.add(mesh);
                    out[key] = mesh;
                }
                groups.clear();
                return out;
            }
        };
    }

    // One prop as its own movable group (for things that animate or change)
    function single(name, mats = {}) {
        const g = new THREE.Group();
        for (const p of parts(name)) {
            const m = new THREE.Mesh(p.geo, mats[p.key] || material(p.key));
            m.castShadow = !m.material.transparent;
            g.add(m);
        }
        return g;
    }

    return { has, parts, batch, single, material, LOOKS };
})();
