// THE WATCHING DARK - shared builder for the indoor maze levels (I, III, IV and V)
// Builds the concrete shell (walls, trims, pipes, columns, floor, ceiling), its lights and
// wall decals, and provides helpers for pickups, notes and exits.
'use strict';

const Facility = (() => {
    const WALL_T = 0.5;
    const TEX_W = 4;          // world units per wall texture tile
    const CHUNK = 5;          // cells per render chunk
    const LAMP_POOL = 4;      // real lights shared between all lamps (2 on phones / Low)

    const DEFAULTS = {
        wallH: 5.2,
        fogColor: 0x020203,
        fogDensity: 0.068,
        wallColor: 0x8c8780,
        floorColor: 0x8f8b85,
        ceiling: true,
        ceilingColor: 0x8c8882,
        pipeChance: 0.22,
        columnChance: 0.45,
        lampStyle: 'hanging',  // 'hanging' | 'brazier' | 'none'
        lampCount: [13, 17],
        lampColor: 0xffb060,
        lightColor: 0xffa860,
        poolColor: 0xff9a50,
        lampBroken: 0.45,
        lampIntensity: 3.2,
        decals: [],
        decalCount: 34,
        trims: true,
        generate: null,        // custom maze generator (default World.generate)
        wallTexture: null,     // () => texture set (default concrete)
        wallMaterial: null,    // (tex) => material
        floorTexture: null,    // () => texture set (default concrete slab)
        floorMaterial: null,   // (repeatedTex) => material
        wallDetail: [1, 1],    // face subdivisions [along, up]
        wallHook: null,        // (geometry) => void, after it is placed in the world
        floorSegments: 1,      // subdivide the floor (for floors that move)
        messages: {
            carve: 'Carving the labyrinth...',
            walls: 'Pouring concrete...',
            floor: 'Pouring the floor slab...',
            ceiling: 'Staining the ceiling...',
            raise: 'Raising the walls...',
            lamps: 'Hanging the lamps...'
        }
    };

    async function build(scene, quality, progress, options = {}) {
        const o = Object.assign({}, DEFAULTS, options);
        o.messages = Object.assign({}, DEFAULTS.messages, options.messages || {});
        const S = World.SIZE, C = World.CELL, H = World.HALF;
        const WALL_H = o.wallH;

        progress(o.messages.carve, 0.1);
        if (o.generate) o.generate();
        else World.generate();
        World.clearColliders();
        const cells = World.cells;

        scene.background = new THREE.Color(o.fogColor);
        scene.fog = new THREE.FogExp2(o.fogColor, o.fogDensity);

        progress(o.messages.walls, 0.2);
        await nextFrame();
        const wallTex = o.wallTexture ? o.wallTexture() : Textures.concreteWall();
        progress(o.messages.floor, 0.35);
        await nextFrame();
        const floorTex = o.floorTexture ? o.floorTexture() : Textures.concreteFloor();
        let ceilTex = null;
        if (o.ceiling) {
            progress(o.messages.ceiling, 0.5);
            await nextFrame();
            ceilTex = Textures.ceilingTiles();
        }
        progress(o.messages.raise, 0.65);
        await nextFrame();

        const wallMat = o.wallMaterial ? o.wallMaterial(wallTex) : new THREE.MeshStandardMaterial({
            map: wallTex.map, normalMap: wallTex.normalMap, roughnessMap: wallTex.roughnessMap,
            roughness: 1, color: o.wallColor, normalScale: new THREE.Vector2(1.2, 1.2)
        });
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x0d0a08, roughness: 0.85, metalness: 0.0 });
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a2e26, roughness: 0.45, metalness: 0.75 });

        // ---- Walls, trims, pipes and columns merged per chunk ----------------
        const chunks = new Map();
        const chunkOf = (x, z) => {
            const k = Math.floor(x / CHUNK) * 100 + Math.floor(z / CHUNK);
            if (!chunks.has(k)) chunks.set(k, { wall: [], trim: [], pipe: [] });
            return chunks.get(k);
        };
        const wallSegments = [];

        const [segA, segU] = o.wallDetail;
        const addWall = (cx, cz, horizontal) => {
            // Walls between two sealed (solid) cells can never be seen
            const plusX = cx, plusZ = cz;
            const minusX = horizontal ? cx : cx - 1, minusZ = horizontal ? cz - 1 : cz;
            const sides = [];
            if (!World.isSolid(plusX, plusZ)) sides.push(1);
            if (!World.isSolid(minusX, minusZ)) sides.push(-1);
            if (!sides.length) return;
            const ch = chunkOf(cx, cz);
            const px = cx * C, pz = cz * C;
            const L = C + WALL_T;
            let wx, wz, geo, trim;
            if (horizontal) {
                wx = px; wz = pz - H;
                geo = makeWallBox(L, WALL_H, WALL_T, TEX_W, Math.random() * 4, segA, segU, 1);
                trim = new THREE.BoxGeometry(L, 0.24, WALL_T + 0.04);
                World.addBox(wx - L / 2, wx + L / 2, wz - WALL_T / 2, wz + WALL_T / 2);
            } else {
                wx = px - H; wz = pz;
                geo = makeWallBox(WALL_T, WALL_H, L, TEX_W, Math.random() * 4, 1, segU, segA);
                trim = new THREE.BoxGeometry(WALL_T + 0.04, 0.24, L);
                World.addBox(wx - WALL_T / 2, wx + WALL_T / 2, wz - L / 2, wz + L / 2);
            }
            geo.translate(wx, WALL_H / 2, wz);
            if (o.wallHook) o.wallHook(geo);
            trim.translate(wx, 0.12, wz);
            ch.wall.push(geo);
            if (o.trims) ch.trim.push(trim);
            else trim.dispose();
            wallSegments.push({ x: wx, z: wz, horizontal, sides });

            // Rusted pipes running along some walls under the ceiling
            if (Math.random() < o.pipeChance) {
                const side = Math.random() < 0.5 ? -1 : 1;
                const pipe = new THREE.CylinderGeometry(0.09, 0.09, C, 8);
                const y = WALL_H - rand(0.35, 0.8);
                if (horizontal) {
                    pipe.rotateZ(Math.PI / 2);
                    pipe.translate(wx, y, wz + side * (WALL_T / 2 + 0.14));
                } else {
                    pipe.rotateX(Math.PI / 2);
                    pipe.translate(wx + side * (WALL_T / 2 + 0.14), y, wz);
                }
                ch.pipe.push(pipe);
            }
        };

        for (let x = 0; x < S; x++) {
            for (let z = 0; z < S; z++) {
                const c = cells[x][z];
                if (c.n) addWall(x, z, true);
                if (c.w) addWall(x, z, false);
                if (z === S - 1 && c.s) addWall(x, z + 1, true);
                if (x === S - 1 && c.e) addWall(x + 1, z, false);
            }
        }

        // Concrete columns inside open halls
        for (let x = 0; x < S - 1; x++) {
            for (let z = 0; z < S - 1; z++) {
                if (!World.isOpenCorner(x, z) || Math.random() > o.columnChance) continue;
                const r = rand(0.45, 0.85);
                const px = x * C + H, pz = z * C + H;
                const col = new THREE.CylinderGeometry(r, r * 1.05, WALL_H, 16);
                const uv = col.attributes.uv;
                for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (TAU * r / TEX_W));
                col.translate(px, WALL_H / 2, pz);
                const ch = chunkOf(x, z);
                ch.wall.push(col);
                const base = new THREE.CylinderGeometry(r + 0.06, r + 0.08, 0.2, 16);
                base.translate(px, 0.1, pz);
                ch.trim.push(base);
                World.addCircle(px, pz, r);
            }
        }

        const root = new THREE.Group();
        scene.add(root);
        for (const ch of chunks.values()) {
            const add = (geos, mat, shadow) => {
                if (!geos.length) return;
                const m = new THREE.Mesh(mergeGeometries(geos), mat);
                m.castShadow = shadow;
                m.receiveShadow = true;
                root.add(m);
                for (const g of geos) g.dispose();
            };
            add(ch.wall, wallMat, true);
            add(ch.trim, trimMat, false);
            add(ch.pipe, pipeMat, true);
        }

        // ---- Floor & ceiling -------------------------------------------------
        const span = S * C + 8;
        const mid = (S - 1) * C / 2;
        const owned = [];
        const floorRep = repeated(floorTex, span / 4, owned);
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(span, span, o.floorSegments, o.floorSegments),
            o.floorMaterial ? o.floorMaterial(floorRep) : new THREE.MeshStandardMaterial({
                map: floorRep.map, normalMap: floorRep.normalMap, roughnessMap: floorRep.roughnessMap,
                roughness: 1, color: o.floorColor, normalScale: new THREE.Vector2(1.0, 1.0)
            })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(mid, 0, mid);
        floor.receiveShadow = true;
        root.add(floor);

        if (o.ceiling) {
            const ceilRep = repeated(ceilTex, span / 8, owned);
            const ceiling = new THREE.Mesh(
                new THREE.PlaneGeometry(span, span),
                new THREE.MeshStandardMaterial({
                    map: ceilRep.map, normalMap: ceilRep.normalMap, roughnessMap: ceilRep.roughnessMap,
                    roughness: 1, color: o.ceilingColor
                })
            );
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.set(mid, WALL_H, mid);
            ceiling.receiveShadow = true;
            root.add(ceiling);
        }

        progress(o.messages.lamps, 0.75);
        await nextFrame();

        // ---- Lamps (hanging bulbs or floor braziers) ---------------------------
        const lamps = [];
        const lampCells = [];
        const lampCount = o.lampStyle === 'none' ? 0 : randInt(o.lampCount[0], o.lampCount[1]);
        for (let tries = 0; lamps.length < lampCount && tries < 2000; tries++) {
            const x = randInt(1, S - 2), z = randInt(1, S - 2);
            if (x < 3 && z < 3) continue;
            if (lampCells.some((l) => Math.abs(l.x - x) + Math.abs(l.z - z) < 4)) continue;
            const px = x * C, pz = z * C;
            const broken = Math.random() < o.lampBroken;
            const base = { cell: { x, z }, broken, level: 1, phase: Math.random() * 100, swing: Math.random() * TAU };
            if (o.lampStyle === 'brazier') {
                if (World.overlaps(px, pz, 0.9)) continue;
                const b = Models.createBrazier(o.lampColor);
                b.group.position.set(px, 0, pz);
                root.add(b.group);
                World.addCircle(px, pz, 0.45, false);
                lamps.push(Object.assign(base, b, {
                    pos: new THREE.Vector3(px, 1.7, pz),
                    apply(level, time) {
                        for (const f of b.flames) {
                            const k = (0.85 + Math.sin(time * 13 + f.userData.phase) * 0.12 + Math.random() * 0.1) * level;
                            f.scale.set(0.32 * k, 0.62 * k, 1);
                        }
                        b.glow.material.opacity = 0.5 * level;
                        b.coalMat.emissiveIntensity = 2.5 * level;
                    }
                }));
            } else {
                const cord = rand(0.3, 1.0);
                const lamp = Models.createLamp(cord, o.lampColor);
                const y = WALL_H - 0.2 - cord;
                lamp.group.position.set(px, y, pz);
                root.add(lamp.group);
                const pool = new THREE.Mesh(
                    new THREE.PlaneGeometry(9, 9),
                    new THREE.MeshBasicMaterial({
                        map: Textures.lightPool(), color: o.poolColor, transparent: true, opacity: 0.08,
                        blending: THREE.AdditiveBlending, depthWrite: false
                    })
                );
                pool.rotation.x = -Math.PI / 2;
                pool.position.set(px, 0.02, pz);
                root.add(pool);
                lamps.push(Object.assign(base, lamp, {
                    pos: new THREE.Vector3(px, y, pz), pool,
                    apply(level, time) {
                        lamp.bulbMat.emissiveIntensity = 5 * level;
                        lamp.glow.material.opacity = 0.4 * level;
                        pool.material.opacity = 0.08 * level;
                        lamp.group.rotation.z = Math.sin(time * 0.7 + base.swing) * 0.03;
                    }
                }));
            }
            lampCells.push({ x, z });
        }

        const lampLights = [];
        if (lamps.length) {
            for (let i = 0; i < (quality && quality.lite ? 2 : LAMP_POOL); i++) {
                let l;
                if (o.lampStyle === 'brazier') {
                    l = new THREE.PointLight(o.lightColor, 0, 16, 1.7);
                } else {
                    l = new THREE.SpotLight(o.lightColor, 0, 24, Math.PI / 2.6, 0.55, 1.6);
                    scene.add(l.target);
                }
                // On High the nearest hanging lamp throws real shadows (slot 0 always holds it)
                l.castShadow = i === 0 && !!(quality && quality.lampShadows) && o.lampStyle !== 'brazier';
                if (l.castShadow) {
                    l.shadow.mapSize.set(1024, 1024);
                    l.shadow.camera.near = 0.3;
                    l.shadow.camera.far = 24;
                    l.shadow.bias = -0.0006;
                    l.shadow.normalBias = 0.03;
                    l.shadow.radius = 2;
                }
                scene.add(l);
                lampLights.push({ light: l, lamp: null, spot: o.lampStyle !== 'brazier' });
            }
        }

        // ---- Wall decals ------------------------------------------------------
        const decalKinds = o.decals;
        for (let i = 0; i < o.decalCount && wallSegments.length && decalKinds.length; i++) {
            const seg = pick(wallSegments);
            const kind = pick(decalKinds);
            const mat = new THREE.MeshStandardMaterial({
                map: Textures.decal(kind), transparent: true, depthWrite: false, roughness: 0.6,
                polygonOffset: true, polygonOffsetFactor: -2
            });
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), mat);
            const side = pick(seg.sides);
            const off = WALL_T / 2 + 0.015;
            const along = rand(-2.2, 2.2);
            const y = kind === 'hand' ? rand(0.9, 1.6) : rand(1.5, Math.min(2.8, WALL_H - 1.2));
            if (seg.horizontal) {
                plane.position.set(seg.x + along, y, seg.z + side * off);
                plane.rotation.y = side > 0 ? 0 : Math.PI;
            } else {
                plane.position.set(seg.x + side * off, y, seg.z + along);
                plane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
            }
            plane.receiveShadow = true;
            root.add(plane);
        }

        World.updateFlow(0, 0);
        let lastAssign = 0;

        return {
            lite: !!(quality && quality.lite),
            root, owned, wallSegments, lamps, lampCells,
            used: [...lampCells],
            WALL_H, WALL_T,
            fogColor: o.fogColor,

            update(dt, time, cam) {
                for (const l of lamps) {
                    let level;
                    if (l.broken) {
                        const n = Noise.value2(time * 9 + l.phase, l.phase, 256, 256);
                        level = n > 0.55 ? 1 : n > 0.4 ? 0.35 : 0.05;
                    } else {
                        level = 0.92 + Math.sin(time * 13 + l.phase) * 0.04 + Math.sin(time * 37 + l.phase) * 0.03;
                    }
                    l.level = level;
                    l.apply(level, time);
                }
                // Real lights follow the nearest lamps
                const now = performance.now();
                if (lampLights.length && now - lastAssign > 250) {
                    lastAssign = now;
                    assignLamps(cam, lamps, lampLights);
                }
                for (const slot of lampLights) {
                    slot.light.intensity = slot.lamp ? o.lampIntensity * slot.lamp.level : 0;
                }
            },

            // Is this position standing in a working lamp's light?
            nearLight(pos) {
                for (const l of lamps) {
                    if (l.level < 0.3) continue;
                    const dx = l.pos.x - pos.x, dz = l.pos.z - pos.z;
                    if (dx * dx + dz * dz < 81 && World.lineOfSight(pos.x, pos.z, l.pos.x, l.pos.z)) return true;
                }
                return false;
            }
        };
    }

    function assignLamps(cam, lamps, slots) {
        const sorted = lamps
            .map((l) => ({ l, d: l.pos.distanceToSquared(cam.position) }))
            .filter((e) => e.d < 40 * 40)
            .sort((a, b) => a.d - b.d)
            .slice(0, slots.length)
            .map((e) => e.l);
        // Keep existing assignments stable to avoid popping
        for (const s of slots) if (s.lamp && !sorted.includes(s.lamp)) s.lamp = null;
        for (const l of sorted) {
            if (slots.some((s) => s.lamp === l)) continue;
            const free = slots.find((s) => !s.lamp);
            if (!free) break;
            free.lamp = l;
            if (free.spot) {
                free.light.position.set(l.pos.x, l.pos.y - 0.1, l.pos.z);
                free.light.target.position.set(l.pos.x, 0, l.pos.z);
                free.light.target.updateMatrixWorld();
            } else {
                free.light.position.set(l.pos.x, l.pos.y + 0.2, l.pos.z);
            }
        }
        // The shadow-casting slot follows the nearest lamp
        const lead = slots[0];
        if (lead.light.castShadow && sorted.length && lead.lamp !== sorted[0]) {
            const other = slots.find((s) => s.lamp === sorted[0]);
            if (other) {
                const tmp = other.lamp;
                other.lamp = lead.lamp;
                lead.lamp = tmp;
                for (const s of [lead, other]) {
                    if (!s.lamp) continue;
                    s.light.position.set(s.lamp.pos.x, s.lamp.pos.y - 0.1, s.lamp.pos.z);
                    s.light.target.position.set(s.lamp.pos.x, 0, s.lamp.pos.z);
                    s.light.target.updateMatrixWorld();
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Pickups
    // -------------------------------------------------------------------------
    function createMatchbox() {
        const g = new THREE.Group();
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x6e1a12, roughness: 0.8 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.14), boxMat);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.226, 0.03, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 1 }));
        box.castShadow = true;
        g.add(box, strip);
        const glow = Models.glowSprite(0xff7a30, 1.1, 0.35, true);
        glow.position.y = 0.1;
        g.add(glow);
        return { group: g, glow };
    }

    // A cell at least minPath steps from the spawn that nothing else is using
    function freeCell(shell, minPath) {
        const S = World.SIZE;
        for (let t = 0; t < 400; t++) {
            const x = randInt(1, S - 2), z = randInt(1, S - 2);
            const d = World.pathDist(x, z);
            if (d < minPath) continue;
            if (shell.used.some((a) => a.x === x && a.z === z)) continue;
            return { x, z };
        }
        return { x: randInt(2, S - 2), z: randInt(2, S - 2) };
    }

    const MAKERS = {
        battery: () => Models.createBattery(),
        matches: () => createMatchbox(),
        relic: () => Models.createRelic()
    };
    const HEIGHTS = { battery: 0.35, matches: 0.06, relic: 0.25 };

    // Scatter `count` pickups of one type around the maze (y lifts them, e.g. above water)
    function scatter(shell, type, count, minPath, y = HEIGHTS[type]) {
        const C = World.CELL;
        const out = [];
        for (let i = 0; i < count; i++) {
            const c = freeCell(shell, minPath);
            shell.used.push(c);
            const item = MAKERS[type]();
            let x = c.x * C + rand(-2, 2), z = c.z * C + rand(-2, 2);
            for (let t = 0; t < 8 && World.overlaps(x, z, 0.5); t++) { x = c.x * C + rand(-2, 2); z = c.z * C + rand(-2, 2); }
            const pos = new THREE.Vector3(x, y, z);
            item.group.position.copy(pos);
            shell.root.add(item.group);
            out.push({ type, ...item, pos, cell: c, collected: false, phase: Math.random() * 10 });
        }
        return out;
    }

    function animatePickups(pickups, dt, time) {
        for (const p of pickups) {
            if (p.collected) continue;
            p.group.rotation.y += dt * 1.2;
            if (p.type !== 'matches') p.group.position.y = p.pos.y + Math.sin(time * 2 + p.phase) * 0.06;
            p.glow.material.opacity = 0.35 + Math.sin(time * 3 + p.phase) * 0.15;
        }
    }

    // -------------------------------------------------------------------------
    // Notes: the first waits beside the spawn, the rest are spread along the journey
    // -------------------------------------------------------------------------
    function addNotes(scene, shell, lore, { lift = 0 } = {}) {
        const S = World.SIZE, C = World.CELL;
        const notes = [];
        const place = (x, z, ry, entry) => {
            const stand = Models.createNoteStand(false);
            stand.group.position.set(x, lift, z);
            stand.group.rotation.y = ry;
            shell.root.add(stand.group);
            World.addCircle(x, z, 0.45, false);
            notes.push({ pos: new THREE.Vector3(x, 0.6 + lift, z), stand, cell: { x: World.cellX(x), z: World.cellX(z) }, ...entry });
        };
        if (!lore.length) return makeNoteSet(scene, notes, shell.lite);
        place(-2.4, 2.6, 0.6, lore[0]);

        let maxD = 0;
        for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) maxD = Math.max(maxD, World.pathDist(x, z));
        const rest = lore.length - 1;
        for (let i = 1; i <= rest; i++) {
            const want = lerp(6, maxD * 0.85, rest > 1 ? (i - 1) / (rest - 1) : 0.5);
            let spot = null;
            for (let tol = 4; tol <= 40 && !spot; tol += 6) {
                for (let t = 0; t < 150 && !spot; t++) {
                    const cx = randInt(1, S - 2), cz = randInt(1, S - 2);
                    const d = World.pathDist(cx, cz);
                    if (d < 4 || Math.abs(d - want) > tol) continue;
                    if (shell.used.some((a) => a.x === cx && a.z === cz)) continue;
                    const x = cx * C + rand(-2, 2), z = cz * C + rand(-2, 2);
                    if (World.overlaps(x, z, 0.9)) continue;
                    spot = { x, z, cx, cz };
                }
            }
            if (!spot) continue;
            shell.used.push({ x: spot.cx, z: spot.cz });
            place(spot.x, spot.z, rand(0, TAU), lore[i]);
        }
        return makeNoteSet(scene, notes, shell.lite);
    }

    // Guttering candles on every note, with one real light that follows the nearest
    // (no real candle light on phones: the flame and glow sprites carry it)
    function makeNoteSet(scene, notes, lite = false) {
        const candle = lite ? null : new THREE.PointLight(0xff9a40, 0, 6, 2);
        if (candle) scene.add(candle);
        let lastCandle = -1;
        return {
            list: notes,
            update(dt, time, cam) {
                let nearest = null, nd = Infinity;
                for (const n of notes) {
                    const f = 0.85 + Math.sin(time * 17 + n.pos.x) * 0.1 + Math.sin(time * 41 + n.pos.z) * 0.05;
                    n.stand.flame.scale.set(0.06 * f, 0.12 * f, 1);
                    n.stand.glow.material.opacity = 0.45 * f;
                    const d = n.pos.distanceToSquared(cam.position);
                    if (d < nd) { nd = d; nearest = n; }
                }
                if (!candle) return;
                if (nearest && (time - lastCandle > 0.3 || time < lastCandle)) {
                    lastCandle = time;
                    candle.position.set(nearest.pos.x + 0.2, nearest.pos.y + 0.35, nearest.pos.z);
                }
                candle.intensity = nearest && nd < 24 * 24 ? 0.9 + Math.sin(time * 23) * 0.12 : 0;
            }
        };
    }

    // -------------------------------------------------------------------------
    // Exits
    // -------------------------------------------------------------------------
    // Green emergency doors set into the far walls
    function addExitDoors(scene, shell) {
        const C = World.CELL, H = World.HALF;
        const exits = [];
        for (const ex of World.exits) {
            const door = Models.createExitDoor();
            const wallZ = ex.z * C + H - WALL_T / 2 - 0.02;
            door.group.position.set(ex.x * C, 0, wallZ);
            door.group.rotation.y = Math.PI;
            shell.root.add(door.group);
            // Phones: the glowing sign and door carry it without a real light
            const light = shell.lite ? null : new THREE.PointLight(0x33ff77, 1.1, 12, 1.8);
            if (light) {
                light.position.set(ex.x * C, 3.4, wallZ - 1.2);
                scene.add(light);
            }
            exits.push({ cell: ex, pos: new THREE.Vector3(ex.x * C, 1.6, wallZ - 0.6), door, light });
        }
        return {
            list: exits,
            update(time) {
                for (const ex of exits) if (ex.light) ex.light.intensity = 1.0 + Math.sin(time * 2.5) * 0.2;
            }
        };
    }

    return { build, createMatchbox, scatter, animatePickups, addNotes, addExitDoors, freeCell, WALL_T };
})();
