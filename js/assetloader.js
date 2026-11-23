// THE WATCHING DARK - loads the Blender-built models embedded in js/assets.js
'use strict';

const Assets = (() => {
    const gltfs = {};
    const treeCache = {};
    let ready = null;
    let ok = false;

    function decode(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    }

    // Parse every embedded model once. Resolves to true when the models are usable.
    function load() {
        if (ready) return ready;
        ready = (async () => {
            if (!window.TWD_ASSETS || !THREE.GLTFLoader) {
                console.warn('The Watching Dark: model files unavailable, using fallback models.');
                return false;
            }
            const loader = new THREE.GLTFLoader();
            for (const [name, b64] of Object.entries(window.TWD_ASSETS)) {
                try {
                    gltfs[name] = await new Promise((resolve, reject) => loader.parse(decode(b64), '', resolve, reject));
                } catch (e) {
                    console.warn('Failed to load model', name, e);
                }
            }
            window.TWD_ASSETS = null; // release the base64 strings
            ok = !!gltfs.watcher;
            return ok;
        })();
        return ready;
    }

    const has = (name) => !!gltfs[name];

    // A fully independent copy of the rigged Watcher (shares geometry, owns its skeleton)
    function watcher() {
        if (!gltfs.watcher || !THREE.SkeletonUtils) return null;
        return THREE.SkeletonUtils.clone(gltfs.watcher.scene);
    }

    function flashlight() {
        return gltfs.flashlight ? gltfs.flashlight.scene.clone(true) : null;
    }

    // Tree variant as two baked geometries: bark and leaf cards
    function tree(index) {
        const key = 'tree_' + index;
        if (treeCache[key]) return treeCache[key];
        const g = gltfs[key];
        if (!g) return null;
        g.scene.updateMatrixWorld(true);
        const parts = { trunk: [], leaves: [] };
        g.scene.traverse((o) => {
            if (!o.isMesh) return;
            const geo = new THREE.BufferGeometry();
            const src = o.geometry;
            geo.setAttribute('position', src.attributes.position.clone());
            geo.setAttribute('normal', src.attributes.normal.clone());
            if (src.attributes.uv) geo.setAttribute('uv', src.attributes.uv.clone());
            if (src.index) geo.setIndex(src.index.clone());
            geo.applyMatrix4(o.matrixWorld);
            const isLeaf = /leaf|leaves/i.test(o.material.name);
            (isLeaf ? parts.leaves : parts.trunk).push(geo);
        });
        const out = {
            trunk: parts.trunk.length ? mergeGeometries(parts.trunk) : null,
            leaves: parts.leaves.length ? mergeGeometries(parts.leaves) : null
        };
        if (out.leaves) {
            // Point leaf normals away from the canopy centre: soft, rounded crown lighting
            const box = new THREE.Box3().setFromBufferAttribute(out.leaves.attributes.position);
            const c = box.getCenter(new THREE.Vector3());
            c.y -= (box.max.y - box.min.y) * 0.15;
            const p = out.leaves.attributes.position, n = out.leaves.attributes.normal;
            const v = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
                v.set(p.getX(i) - c.x, (p.getY(i) - c.y) * 0.7, p.getZ(i) - c.z).normalize();
                n.setXYZ(i, v.x, v.y, v.z);
            }
        }
        const box = new THREE.Box3().setFromBufferAttribute(out.trunk.attributes.position);
        out.height = box.max.y;
        treeCache[key] = out;
        return out;
    }

    return { load, has, watcher, flashlight, tree, get ok() { return ok; } };
})();
