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

    // A fully independent copy of a rigged creature (shares geometry, owns its skeleton):
    // 'watcher', 'unseen' or 'crawler'
    function skinned(name) {
        if (!gltfs[name] || !THREE.SkeletonUtils) return null;
        return THREE.SkeletonUtils.clone(gltfs[name].scene);
    }
    const watcher = () => skinned('watcher');

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

    // One named object from a model file, baked into a single shared geometry
    // (position, normal, uv and - when the model has them - greyscale vertex colours)
    const partCache = {};
    function part(file, name) {
        const key = file + ':' + name;
        if (key in partCache) return partCache[key];
        let out = null;
        const g = gltfs[file];
        const node = g && g.scene.getObjectByName(name);
        if (node) {
            g.scene.updateMatrixWorld(true);
            const geos = [];
            node.traverse((o) => {
                if (!o.isMesh) return;
                const src = o.geometry, geo = new THREE.BufferGeometry();
                geo.setAttribute('position', src.attributes.position.clone());
                if (src.attributes.normal) geo.setAttribute('normal', src.attributes.normal.clone());
                if (src.attributes.uv) geo.setAttribute('uv', src.attributes.uv.clone());
                const c = src.attributes.color;
                if (c) {
                    const div = !c.normalized ? 1 : c.array instanceof Uint16Array ? 65535 : c.array instanceof Uint8Array ? 255 : 1;
                    const arr = new Float32Array(c.count * 3);
                    for (let i = 0; i < c.count; i++) {
                        arr[i * 3] = c.array[i * c.itemSize] / div;
                        arr[i * 3 + 1] = c.array[i * c.itemSize + 1] / div;
                        arr[i * 3 + 2] = c.array[i * c.itemSize + 2] / div;
                    }
                    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
                }
                if (src.index) geo.setIndex(src.index.clone());
                geo.applyMatrix4(o.matrixWorld);
                geos.push(geo);
            });
            if (geos.length) {
                out = geos.length === 1 ? geos[0] : mergeGeometries(geos);
                out.computeBoundingSphere();
                out.userData.shared = true;
            }
        }
        partCache[key] = out;
        return out;
    }

    return { load, has, watcher, skinned, flashlight, tree, part, get ok() { return ok; } };
})();
