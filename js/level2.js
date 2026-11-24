// THE WATCHING DARK - Level 2: The Lost Forest
'use strict';

const Level2 = (() => {
    const HEDGE_H = 4.4;
    const HEDGE_T = 1.3;
    const CHUNK = 6;
    const FOG_COLOR = 0x0f1318;

    // Displace a geometry by smooth 3D noise of its world position (coincident verts move together, no cracks)
    function lumpy(geo, freq, amount, topBoost = 0, topY = Infinity) {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            const nx = Noise.value3(x * freq, y * freq, z * freq) - 0.5;
            const ny = Noise.value3(x * freq + 31.7, y * freq + 3.1, z * freq + 17.3) - 0.5;
            const nz = Noise.value3(x * freq + 11.1, y * freq + 47.9, z * freq + 5.7) - 0.5;
            const top = y > topY - 0.05 ? topBoost : 0;
            p.setXYZ(i, x + nx * amount, y > 0.05 ? y + ny * (amount + top) : y, z + nz * amount);
        }
        geo.computeVertexNormals();
        return geo;
    }

    // World-space planar UVs chosen per vertex by its dominant normal axis
    function worldUV(geo, scale) {
        const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) {
            const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
            if (ay > ax && ay > az) uv.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
            else if (ax > az) uv.setXY(i, p.getZ(i) / scale, p.getY(i) / scale);
            else uv.setXY(i, p.getX(i) / scale, p.getY(i) / scale);
        }
    }

    // Instanced meshes split into spatial chunks. three r128 can't frustum-cull an InstancedMesh
    // by its instances, so each chunk gets its own geometry copy with a bounding sphere that
    // covers just that chunk - letting the camera and shadow frustums skip what you can't see.
    const INST_CHUNK = 40;
    function instanced(geo, mat, _count, shadow = true) {
        geo.computeBoundingBox();
        const b = geo.boundingBox;
        const reach = Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.z), Math.abs(b.max.z));
        return { geo, mat, shadow, buckets: new Map(), count: 0, reach, top: b.max.y };
    }

    const dummy = new THREE.Object3D();
    function pushInstance(set, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(rx, ry, rz);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        const kx = Math.floor(x / INST_CHUNK), kz = Math.floor(z / INST_CHUNK);
        const key = kx * 1000 + kz;
        let b = set.buckets.get(key);
        if (!b) { b = { kx, kz, matrices: [], maxR: 0, maxY: 0 }; set.buckets.set(key, b); }
        b.matrices.push(dummy.matrix.clone());
        b.maxR = Math.max(b.maxR, Math.max(sx, sz, sy) * set.reach);
        b.maxY = Math.max(b.maxY, y + Math.abs(sy) * set.top + Math.max(sx, sz) * set.reach);
        set.count++;
    }

    function buildInstanced(set, parent) {
        for (const b of set.buckets.values()) {
            const g = set.geo.clone();
            const half = INST_CHUNK / 2;
            const cy = b.maxY / 2;
            g.boundingSphere = new THREE.Sphere(
                new THREE.Vector3(b.kx * INST_CHUNK + half, cy, b.kz * INST_CHUNK + half),
                Math.sqrt(2 * half * half + cy * cy) + b.maxR
            );
            const m = new THREE.InstancedMesh(g, set.mat, b.matrices.length);
            b.matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
            m.instanceMatrix.needsUpdate = true;
            m.frustumCulled = true; // r128 disables this for InstancedMesh by default
            m.castShadow = set.shadow;
            m.receiveShadow = true;
            parent.add(m);
        }
        set.geo.dispose();
    }

    async function build(scene, quality, progress) {
        const S = World.SIZE, C = World.CELL, H = World.HALF;
        progress('The fog rolls in...', 0.1);
        World.generate();
        World.clearColliders();
        const cells = World.cells;

        scene.background = new THREE.Color(FOG_COLOR);
        // Thick fog: past a few metres the world dissolves; the Angels' halos glimmer through it
        scene.fog = new THREE.Fog(FOG_COLOR, 0.5, 12.5);

        await nextFrame();
        progress('Growing the hedges...', 0.2);
        const hedgeTex = Textures.hedge();
        await nextFrame();
        progress('Peeling the bark...', 0.3);
        const barkTex = Textures.bark();
        await nextFrame();
        progress('Burying the path...', 0.4);
        const groundTex = Textures.forestFloor();
        await nextFrame();
        progress('Carving the stone...', 0.5);
        const stoneMats = Models.stoneMaterials();
        await nextFrame();

        const owned = [];
        const hedgeMat = new THREE.MeshStandardMaterial({
            map: hedgeTex.map, normalMap: hedgeTex.normalMap, roughnessMap: hedgeTex.roughnessMap,
            roughness: 1, color: 0x8a9a80, normalScale: new THREE.Vector2(1.4, 1.4)
        });
        const barkRep = repeated(barkTex, 1, owned, 3);
        const barkMat = new THREE.MeshStandardMaterial({
            map: barkRep.map, normalMap: barkRep.normalMap, roughnessMap: barkRep.roughnessMap, roughness: 1, color: 0x8a8278
        });
        const leafMat = new THREE.MeshStandardMaterial({
            map: hedgeTex.map, normalMap: hedgeTex.normalMap, roughness: 0.9, color: 0x6a7a62
        });
        const pineMat = new THREE.MeshStandardMaterial({
            map: hedgeTex.map, normalMap: hedgeTex.normalMap, roughness: 0.9, color: 0x4a5c4c
        });

        const levelRoot = new THREE.Group();
        scene.add(levelRoot);

        // ---- Hedge maze -------------------------------------------------------
        const chunks = new Map();
        const chunkOf = (x, z) => {
            const k = Math.floor(x / CHUNK) * 100 + Math.floor(z / CHUNK);
            if (!chunks.has(k)) chunks.set(k, []);
            return chunks.get(k);
        };
        const addHedge = (cx, cz, horizontal) => {
            const L = C + HEDGE_T;
            const px = cx * C, pz = cz * C;
            let geo, wx, wz;
            if (horizontal) {
                wx = px; wz = pz - H;
                geo = new THREE.BoxGeometry(L, HEDGE_H, HEDGE_T, 8, 3, 1);
                World.addBox(wx - L / 2, wx + L / 2, wz - HEDGE_T / 2 + 0.1, wz + HEDGE_T / 2 - 0.1);
            } else {
                wx = px - H; wz = pz;
                geo = new THREE.BoxGeometry(HEDGE_T, HEDGE_H, L, 1, 3, 8);
                World.addBox(wx - HEDGE_T / 2 + 0.1, wx + HEDGE_T / 2 - 0.1, wz - L / 2, wz + L / 2);
            }
            geo.translate(wx, HEDGE_H / 2, wz);
            worldUV(geo, 3);
            lumpy(geo, 0.7, 0.55, 0.9, HEDGE_H);
            chunkOf(cx, cz).push(geo);
        };
        for (let x = 0; x < S; x++) {
            for (let z = 0; z < S; z++) {
                const c = cells[x][z];
                if (c.n) addHedge(x, z, true);
                if (c.w) addHedge(x, z, false);
                if (z === S - 1 && c.s) addHedge(x, z + 1, true);
                if (x === S - 1 && c.e) addHedge(x + 1, z, false);
            }
        }
        for (const geos of chunks.values()) {
            const m = new THREE.Mesh(mergeGeometries(geos), hedgeMat);
            m.castShadow = true;
            m.receiveShadow = true;
            levelRoot.add(m);
            for (const g of geos) g.dispose();
        }

        // ---- Ground ------------------------------------------------------------
        const span = S * C + 80;
        const mid = (S - 1) * C / 2;
        const groundRep = repeated(groundTex, span / 6, owned);
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(span, span),
            new THREE.MeshStandardMaterial({
                map: groundRep.map, normalMap: groundRep.normalMap, roughnessMap: groundRep.roughnessMap,
                roughness: 1, color: 0x9a948a
            })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(mid, 0, mid);
        ground.receiveShadow = true;
        levelRoot.add(ground);

        progress('Planting the forest...', 0.6);
        await nextFrame();

        // ---- Trees (instanced) -----------------------------------------------------
        const trunkGeo = new THREE.CylinderGeometry(0.62, 1, 1, 10, 4);
        trunkGeo.translate(0, 0.5, 0);
        const clusterGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 1.6, 0.4);
        const pineGeo = new THREE.ConeGeometry(1, 1, 11, 3);
        pineGeo.translate(0, 0.5, 0);
        lumpy(pineGeo, 2.2, 0.18);
        const branchParts = [];
        for (let i = 0; i < 6; i++) {
            const b = limbGeometry(0.06, 0.012, rand(1.2, 2.4), 5);
            b.rotateX(Math.PI); // point upward from the pivot
            b.rotateZ(rand(0.5, 1.1));
            b.rotateY((i / 6) * TAU + rand(-0.3, 0.3));
            b.translate(0, rand(0.55, 0.95), 0);
            branchParts.push(b);
        }
        const branchGeo = mergeGeometries(branchParts);

        const trunks = instanced(trunkGeo, barkMat, 620);
        const clusters = instanced(clusterGeo, leafMat, 3000);
        const pines = instanced(pineGeo, pineMat, 1600);
        const branches = instanced(branchGeo, barkMat, 320);
        const placed = [];
        const farFromPlaced = (x, z, d) => placed.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > d * d);
        const nearSpawnOrExit = (x, z) => {
            const ex = World.exits[0];
            return (x < 2.2 * C && z < 2.2 * C) || ((x - ex.x * C) ** 2 + (z - ex.z * C) ** 2 < 14 * 14);
        };

        // Blender-built trees: 2 gnarled broadleaves, 2 pines, 2 dead trees, each a bark + leaf-card pair
        const modelTrees = Assets.ok && Assets.has('tree_0');
        let treeSets = null;
        if (modelTrees) {
            const leafMat = new THREE.MeshStandardMaterial({
                map: Textures.leafAtlas(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0x9aa890
            });
            const modelBark = new THREE.MeshStandardMaterial({
                map: barkTex.map, normalMap: barkTex.normalMap, roughnessMap: barkTex.roughnessMap, roughness: 1,
                color: 0x7a736a, normalScale: new THREE.Vector2(1.4, 1.4)
            });
            treeSets = [0, 1, 2, 3, 4, 5].map((i) => {
                const t = Assets.tree(i);
                return t && {
                    trunk: instanced(t.trunk.clone(), modelBark, 0),
                    leaves: t.leaves ? instanced(t.leaves.clone(), leafMat, 0) : null
                };
            });
        }

        const plantTree = (x, z, collide) => {
            const type = Math.random();
            const lean = rand(-0.05, 0.05);
            if (treeSets && treeSets.every(Boolean)) {
                const kind = type < 0.4 ? 0 : type < 0.8 ? 2 : 4;
                const set = treeSets[kind + (Math.random() < 0.5 ? 0 : 1)];
                const s = kind === 4 ? rand(0.8, 1.2) : rand(0.85, 1.3);
                const ry = rand(0, TAU), sy = s * rand(0.9, 1.15);
                pushInstance(set.trunk, x, 0, z, s, sy, s, ry, lean, lean);
                if (set.leaves) pushInstance(set.leaves, x, 0, z, s, sy, s, ry, lean, lean);
                if (collide) World.addCircle(x, z, (kind === 2 ? 0.3 : 0.38) * s, kind === 0);
                return;
            }
            if (type < 0.42) {
                // Broad-leaved tree
                const h = rand(6, 12), r = rand(0.28, 0.5);
                pushInstance(trunks, x, 0, z, r, h, r, rand(0, TAU), lean, lean);
                // A ragged, uneven crown: clusters spread out and hang down the trunk
                const n = randInt(5, 8);
                for (let i = 0; i < n; i++) {
                    const a = rand(0, TAU), d = rand(0.6, 2.6), s = rand(1.0, 2.1);
                    pushInstance(clusters, x + Math.cos(a) * d, h + rand(-2.6, 1.2) - d * 0.3, z + Math.sin(a) * d, s, s * rand(0.6, 0.95), s, rand(0, TAU));
                }
                if (collide) World.addCircle(x, z, r, r > 0.36);
            } else if (type < 0.8) {
                // Pine
                const h = rand(7, 14), r = rand(0.22, 0.4);
                pushInstance(trunks, x, 0, z, r, h * 0.55, r, rand(0, TAU));
                const layers = randInt(3, 5);
                for (let i = 0; i < layers; i++) {
                    const t = i / layers;
                    const lr = lerp(2.4, 0.8, t) * rand(0.85, 1.1);
                    pushInstance(pines, x, h * lerp(0.22, 0.72, t), z, lr, h * 0.38, lr, rand(0, TAU));
                }
                if (collide) World.addCircle(x, z, r + 0.1, false);
            } else {
                // Dead, bare tree
                const h = rand(5, 9), r = rand(0.25, 0.42);
                pushInstance(trunks, x, 0, z, r, h, r, rand(0, TAU), lean * 2, lean * 2);
                pushInstance(branches, x, h * 0.55, z, h * 0.32, h * 0.45, h * 0.32, rand(0, TAU));
                if (collide) World.addCircle(x, z, r, false);
            }
        };

        // Inside the maze
        const L = quality.lite;
        for (let tries = 0, n = 0; n < (L ? 170 : 290) && tries < 9000; tries++) {
            const cx = randInt(0, S - 1), cz = randInt(0, S - 1);
            // Bias trees toward the hedge lines so corridors stay walkable
            const edge = Math.random() < 0.6;
            const ox = edge ? (Math.random() < 0.5 ? -1 : 1) * rand(2.2, 2.9) : rand(-2.7, 2.7);
            const oz = edge ? rand(-3, 3) : rand(-2.7, 2.7);
            const flip = Math.random() < 0.5;
            const x = cx * C + (flip ? oz : ox), z = cz * C + (flip ? ox : oz);
            if (nearSpawnOrExit(x, z)) continue;
            if (World.overlaps(x, z, 0.9)) continue;
            if (!farFromPlaced(x, z, 2.8)) continue;
            placed.push({ x, z });
            plantTree(x, z, true);
            n++;
        }
        // Dense forest beyond the maze edges (silhouettes in the fog)
        const lo = -H - 2, hi = S * C - H + 2;
        for (let n = 0; n < (L ? 90 : 190); n++) {
            let x, z;
            const side = randInt(0, 3), along = rand(lo - 24, hi + 24), depth = rand(1.5, 24);
            if (side === 0) { x = along; z = lo - depth; } else if (side === 1) { x = along; z = hi + depth; } else if (side === 2) { x = lo - depth; z = along; } else { x = hi + depth; z = along; }
            plantTree(x, z, false);
        }
        for (const set of [clusters, pines, branches]) buildInstanced(set, levelRoot);
        if (treeSets) {
            for (const t of treeSets) {
                if (!t) continue;
                buildInstanced(t.trunk, levelRoot);
                if (t.leaves) buildInstanced(t.leaves, levelRoot);
            }
        }

        progress('Raising the ruins...', 0.72);
        await nextFrame();

        // ---- Rocks, logs, stumps (instanced) -------------------------------------
        const rockGeo = lumpy(new THREE.DodecahedronGeometry(1, 1), 1.3, 0.35);
        const rocks = instanced(rockGeo, stoneMats.stone, 140);
        const logGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
        logGeo.rotateZ(Math.PI / 2);
        const logs = instanced(logGeo, barkMat, 60);
        const stumps = instanced(trunkGeo, barkMat, 60);
        const freeSpot = (r, minDist = 2.4) => {
            for (let t = 0; t < 60; t++) {
                const x = randInt(0, S - 1) * C + rand(-2.8, 2.8), z = randInt(0, S - 1) * C + rand(-2.8, 2.8);
                if (nearSpawnOrExit(x, z) || World.overlaps(x, z, r + 0.4) || !farFromPlaced(x, z, minDist)) continue;
                placed.push({ x, z });
                return { x, z };
            }
            return null;
        };
        for (let i = 0; i < (L ? 60 : 110); i++) {
            const s = rand(0.25, 0.9);
            const p = freeSpot(s, 1.4);
            if (!p) continue;
            pushInstance(rocks, p.x, s * 0.35, p.z, s * rand(0.9, 1.4), s * rand(0.6, 1), s * rand(0.9, 1.4), rand(0, TAU), rand(0, 1), rand(0, 1));
            if (s > 0.5) World.addCircle(p.x, p.z, s * 0.9, false);
        }
        for (let i = 0; i < (L ? 20 : 40); i++) {
            const len = rand(2, 4.5), r = rand(0.18, 0.35);
            const p = freeSpot(len / 2, 3);
            if (!p) continue;
            const ry = rand(0, TAU);
            pushInstance(logs, p.x, r, p.z, len, r, r, ry);
            for (let k = -1; k <= 1; k++) World.addCircle(p.x + Math.cos(ry) * k * len * 0.33, p.z - Math.sin(ry) * k * len * 0.33, r + 0.1, false);
        }
        for (let i = 0; i < (L ? 20 : 40); i++) {
            const p = freeSpot(0.5, 2);
            if (!p) continue;
            const r = rand(0.3, 0.55);
            pushInstance(stumps, p.x, 0, p.z, r, rand(0.4, 1.0), r, rand(0, TAU));
            World.addCircle(p.x, p.z, r, false);
        }
        // Trunks and stumps share a geometry, so build both before it is released
        const trunkSrc = trunkGeo.clone();
        stumps.geo = trunkSrc;
        for (const set of [trunks, stumps, rocks, logs]) buildInstanced(set, levelRoot);

        // ---- Marble pillars and ruins (merged stone) -------------------------------
        const stoneGeos = [];
        for (let i = 0; i < (L ? 18 : 30); i++) {
            const p = freeSpot(1, 4);
            if (!p) continue;
            const r = rand(0.3, 0.48), h = rand(1.5, 6.5);
            const shaft = new THREE.CylinderGeometry(r, r * 1.05, h, 14, 3);
            shaft.translate(p.x, h / 2 + 0.3, p.z);
            const base = new THREE.CylinderGeometry(r * 1.45, r * 1.6, 0.35, 14);
            base.translate(p.x, 0.17, p.z);
            stoneGeos.push(shaft, base);
            if (h > 4) {
                const cap = new THREE.CylinderGeometry(r * 1.55, r * 1.2, 0.4, 14);
                cap.translate(p.x, h + 0.5, p.z);
                stoneGeos.push(cap);
            }
            World.addCircle(p.x, p.z, r * 1.2);
        }
        for (let i = 0; i < (L ? 10 : 18); i++) {
            const p = freeSpot(2, 5);
            if (!p) continue;
            const alongX = Math.random() < 0.5;
            if (Math.random() < 0.55) {
                // Broken wall with a jagged top
                const len = rand(2.4, 4.2), h = rand(1.6, 3.6), t = 0.45;
                const w = new THREE.BoxGeometry(alongX ? len : t, h, alongX ? t : len, 6, 4, 1);
                w.translate(p.x, h / 2, p.z);
                lumpy(w, 1.1, 0.12, 1.2, h);
                stoneGeos.push(w);
                if (alongX) World.addBox(p.x - len / 2, p.x + len / 2, p.z - t / 2, p.z + t / 2);
                else World.addBox(p.x - t / 2, p.x + t / 2, p.z - len / 2, p.z + len / 2);
            } else {
                // Arch
                const w = rand(2.2, 3.0), h = rand(3, 4.2);
                for (const s of [-1, 1]) {
                    const post = new THREE.BoxGeometry(0.45, h, 0.45);
                    const ox = alongX ? s * w / 2 : 0, oz = alongX ? 0 : s * w / 2;
                    post.translate(p.x + ox, h / 2, p.z + oz);
                    stoneGeos.push(post);
                    World.addCircle(p.x + ox, p.z + oz, 0.35);
                }
                const top = new THREE.BoxGeometry(alongX ? w + 0.6 : 0.5, 0.5, alongX ? 0.5 : w + 0.6);
                top.rotateZ(alongX ? rand(-0.15, 0.15) : 0);
                top.rotateX(alongX ? 0 : rand(-0.15, 0.15));
                top.translate(p.x, h + 0.2, p.z);
                stoneGeos.push(top);
            }
        }
        if (stoneGeos.length) {
            const stoneMesh = new THREE.Mesh(mergeGeometries(stoneGeos), stoneMats.stone);
            stoneMesh.castShadow = true;
            stoneMesh.receiveShadow = true;
            levelRoot.add(stoneMesh);
            for (const g of stoneGeos) g.dispose();
        }

        // ---- Angel statues: they look like the real thing. They are not. Probably.
        for (let i = 0; i < 10; i++) {
            const p = freeSpot(1, 6);
            if (!p) continue;
            const st = Models.createAngel({ statue: true });
            st.root.position.set(p.x, 0, p.z);
            st.root.rotation.y = rand(0, TAU);
            levelRoot.add(st.root);
            World.addCircle(p.x, p.z, 0.75);
        }

        progress('Hiding the relics...', 0.85);
        await nextFrame();

        // ---- Relics, matchboxes, notes -------------------------------------------------
        World.updateFlow(0, 0);
        const pickups = [];
        const relicCount = randInt(4, 5);
        for (let i = 0; i < relicCount; i++) {
            const p = freeSpot(0.6, 6);
            if (!p) continue;
            const r = Models.createRelic();
            const pos = new THREE.Vector3(p.x, 0.25, p.z);
            r.group.position.copy(pos);
            levelRoot.add(r.group);
            pickups.push({ type: 'relic', ...r, pos, cell: { x: World.cellX(p.x), z: World.cellX(p.z) }, collected: false, phase: Math.random() * 10 });
        }
        for (let i = 0; i < 2; i++) {
            const p = freeSpot(0.4, 6);
            if (!p) continue;
            const mb = Level1.createMatchbox();
            const pos = new THREE.Vector3(p.x, 0.06, p.z);
            mb.group.position.copy(pos);
            levelRoot.add(mb.group);
            pickups.push({ type: 'matches', ...mb, pos, cell: { x: World.cellX(p.x), z: World.cellX(p.z) }, collected: false, phase: Math.random() * 10 });
        }

        const notes = [];
        const addNote = (x, z, lore) => {
            const stand = Models.createNoteStand(true);
            stand.group.position.set(x, 0, z);
            stand.group.rotation.y = rand(0, TAU);
            levelRoot.add(stand.group);
            World.addCircle(x, z, 0.45, false);
            notes.push({ pos: new THREE.Vector3(x, 0.9, z), stand, cell: { x: World.cellX(x), z: World.cellX(z) }, ...lore });
        };
        addNote(2.6, 2.4, Lore.level2[0]);
        for (let i = 1; i < Lore.level2.length; i++) {
            let spot = null;
            for (let t = 0; t < 200 && !spot; t++) {
                const cx = randInt(2, S - 3), cz = randInt(2, S - 3);
                const d = World.pathDist(cx, cz);
                // Spread notes out along the journey
                const want = (i / Lore.level2.length) * 40;
                if (d < 0 || Math.abs(d - want) > 10) continue;
                const x = cx * C + rand(-2, 2), z = cz * C + rand(-2, 2);
                if (World.overlaps(x, z, 0.9) || !farFromPlaced(x, z, 2)) continue;
                spot = { x, z };
            }
            if (!spot) spot = freeSpot(0.6, 2);
            if (spot) {
                placed.push(spot);
                addNote(spot.x, spot.z, Lore.level2[i]);
            }
        }

        // ---- Exit portal -----------------------------------------------------------
        const ex = World.exits[0];
        const portal = Models.createPortal();
        portal.group.position.set(ex.x * C, 0, ex.z * C);
        levelRoot.add(portal.group);
        const portalLight = new THREE.PointLight(0xffc96a, 3.5, 26, 1.4);
        portalLight.position.set(ex.x * C, 3, ex.z * C);
        scene.add(portalLight);
        const exits = [{ cell: ex, pos: new THREE.Vector3(ex.x * C, 1.6, ex.z * C), light: portalLight }];

        // ---- Lighting: moon + sky ------------------------------------------------------
        const hemi = new THREE.HemisphereLight(0x435270, 0x0e100c, 0.6);
        scene.add(hemi);
        const moon = new THREE.DirectionalLight(0xa8bce0, 0.8);
        moon.castShadow = quality.shadows;
        moon.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
        const sc = moon.shadow.camera;
        sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 140;
        moon.shadow.bias = -0.0008;
        moon.shadow.normalBias = 0.04;
        scene.add(moon);
        scene.add(moon.target);

        // Candle light that follows the nearest note
        const candle = new THREE.PointLight(0xff9a40, 0, 7, 2);
        scene.add(candle);

        // ---- Ground fog banks ----------------------------------------------------------
        const fogSprites = [];
        const fogMatBase = { map: Textures.fogPuff(), color: 0x2a3242, transparent: true, depthWrite: false, fog: true };
        // Big translucent sprites over the whole view are costly on phones: fewer, denser ones there
        for (let i = 0; i < (L ? 18 : 46); i++) {
            const s = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ opacity: L ? rand(0.09, 0.16) : rand(0.045, 0.09) }, fogMatBase)));
            const sz = rand(9, 16);
            s.scale.set(sz, sz * 0.45, 1);
            s.userData.drift = new THREE.Vector2(rand(-0.3, 0.3), rand(-0.3, 0.3));
            s.position.set(-9999, 0, 0);
            levelRoot.add(s);
            fogSprites.push(s);
        }

        progress('They are waiting...', 0.95);
        await nextFrame();

        let lastCandle = 0;
        return {
            id: 2,
            name: 'THE LOST FOREST',
            root: levelRoot,
            ownedTextures: owned,
            spawn: new THREE.Vector3(0, 0, 0),
            spawnYaw: -Math.PI * 0.75,
            lamps: [],
            pickups, notes, exits,
            hasCeiling: false,
            flashlightAllowed: false,

            update(dt, time, cam) {
                // Moon shadow frustum follows the player, snapped to texels to avoid shimmer
                const step = 48 / quality.shadowSize;
                const tx = Math.round(cam.position.x / step) * step, tz = Math.round(cam.position.z / step) * step;
                moon.target.position.set(tx, 0, tz);
                moon.position.set(tx + 30, 70, tz + 18);
                moon.target.updateMatrixWorld();

                for (const s of fogSprites) {
                    const dx = s.position.x - cam.position.x, dz = s.position.z - cam.position.z;
                    if (dx * dx + dz * dz > 16 * 16) {
                        const a = rand(0, TAU), d = rand(2.5, 13);
                        s.position.set(cam.position.x + Math.cos(a) * d, rand(0.4, 1.6), cam.position.z + Math.sin(a) * d);
                    }
                    s.position.x += s.userData.drift.x * dt;
                    s.position.z += s.userData.drift.y * dt;
                }

                for (const p of pickups) {
                    if (p.collected) continue;
                    p.group.rotation.y += dt * 0.8;
                    p.group.position.y = p.pos.y + Math.sin(time * 1.6 + p.phase) * 0.08;
                    p.glow.material.opacity = 0.45 + Math.sin(time * 2.4 + p.phase) * 0.15;
                }

                let nearest = null, nd = Infinity;
                for (const n of notes) {
                    const f = 0.85 + Math.sin(time * 17 + n.pos.x) * 0.1 + Math.sin(time * 41 + n.pos.z) * 0.05;
                    n.stand.flame.scale.set(0.06 * f, 0.12 * f, 1);
                    n.stand.glow.material.opacity = 0.45 * f;
                    const d = n.pos.distanceToSquared(cam.position);
                    if (d < nd) { nd = d; nearest = n; }
                }
                if (nearest && time - lastCandle > 0.3) {
                    lastCandle = time;
                    candle.position.set(nearest.pos.x, nearest.pos.y + 0.4, nearest.pos.z);
                }
                candle.intensity = nearest && nd < 30 * 30 ? 1.6 + Math.sin(time * 23) * 0.2 : 0;
                portalLight.intensity = 3.4 + Math.sin(time * 1.7) * 0.6;
                portal.core.material.opacity = 0.5 + Math.sin(time * 1.3) * 0.1;
            },
            nearLight() { return false; }
        };
    }

    return { build, FOG_COLOR };
})();
