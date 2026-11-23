// THE WATCHING DARK - Level 1: The Maze
'use strict';

const Level1 = (() => {
    const WALL_H = 5.2;
    const WALL_T = 0.5;
    const TEX_W = 4;          // world units per wall texture tile
    const CHUNK = 5;          // cells per render chunk
    const LAMP_POOL = 4;      // real spotlights shared between all lamps

    const WARNINGS = [
        "DON'T LOOK AWAY", 'THEY MOVE WHEN YOU BLINK', 'KEEP THE LIGHT', "IT'S BEHIND YOU",
        'NO WAY OUT', 'THEY WATCH', 'FEAR THE DARK', 'LIGHT A MATCH', 'DONT TURN AROUND', 'RUN'
    ];

    async function build(scene, quality, progress) {
        const S = World.SIZE, C = World.CELL, H = World.HALF;
        progress('Carving the labyrinth...', 0.1);
        World.generate();
        World.clearColliders();
        const cells = World.cells;

        scene.background = new THREE.Color(0x040405);
        scene.fog = new THREE.FogExp2(0x040405, 0.058);

        progress('Pouring concrete...', 0.2);
        await nextFrame();
        const wallTex = Textures.concreteWall();
        progress('Laying floorboards...', 0.35);
        await nextFrame();
        const floorTex = Textures.woodFloor();
        progress('Staining the ceiling...', 0.5);
        await nextFrame();
        const ceilTex = Textures.ceilingTiles();
        progress('Raising the walls...', 0.65);
        await nextFrame();

        const wallMat = new THREE.MeshStandardMaterial({
            map: wallTex.map, normalMap: wallTex.normalMap, roughnessMap: wallTex.roughnessMap,
            roughness: 1, color: 0xa29c94, normalScale: new THREE.Vector2(1.2, 1.2)
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

        const addWall = (cx, cz, horizontal) => {
            const ch = chunkOf(cx, cz);
            const px = cx * C, pz = cz * C;
            const L = C + WALL_T;
            let wx, wz, geo, trim;
            if (horizontal) {
                wx = px; wz = pz - H;
                geo = makeWallBox(L, WALL_H, WALL_T, TEX_W, Math.random() * 4);
                trim = new THREE.BoxGeometry(L, 0.24, WALL_T + 0.04);
                World.addBox(wx - L / 2, wx + L / 2, wz - WALL_T / 2, wz + WALL_T / 2);
            } else {
                wx = px - H; wz = pz;
                geo = makeWallBox(WALL_T, WALL_H, L, TEX_W, Math.random() * 4);
                trim = new THREE.BoxGeometry(WALL_T + 0.04, 0.24, L);
                World.addBox(wx - WALL_T / 2, wx + WALL_T / 2, wz - L / 2, wz + L / 2);
            }
            geo.translate(wx, WALL_H / 2, wz);
            trim.translate(wx, 0.12, wz);
            ch.wall.push(geo);
            ch.trim.push(trim);
            wallSegments.push({ x: wx, z: wz, horizontal });

            // Rusted pipes running along some walls under the ceiling
            if (Math.random() < 0.22) {
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
                if (!World.isOpenCorner(x, z) || Math.random() > 0.45) continue;
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

        const levelRoot = new THREE.Group();
        scene.add(levelRoot);
        for (const ch of chunks.values()) {
            const add = (geos, mat, shadow) => {
                if (!geos.length) return;
                const m = new THREE.Mesh(mergeGeometries(geos), mat);
                m.castShadow = shadow;
                m.receiveShadow = true;
                levelRoot.add(m);
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
            new THREE.PlaneGeometry(span, span),
            new THREE.MeshStandardMaterial({
                map: floorRep.map, normalMap: floorRep.normalMap, roughnessMap: floorRep.roughnessMap,
                roughness: 1, color: 0x9a8f86, normalScale: new THREE.Vector2(0.9, 0.9)
            })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(mid, 0, mid);
        floor.receiveShadow = true;
        levelRoot.add(floor);

        const ceilRep = repeated(ceilTex, span / 8, owned);
        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(span, span),
            new THREE.MeshStandardMaterial({
                map: ceilRep.map, normalMap: ceilRep.normalMap, roughnessMap: ceilRep.roughnessMap,
                roughness: 1, color: 0x8c8882
            })
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(mid, WALL_H, mid);
        ceiling.receiveShadow = true;
        levelRoot.add(ceiling);

        progress('Hanging the lamps...', 0.75);
        await nextFrame();

        // ---- Lamps -------------------------------------------------------------
        const lamps = [];
        const lampCells = [];
        const lampCount = randInt(20, 26);
        for (let tries = 0; lamps.length < lampCount && tries < 2000; tries++) {
            const x = randInt(1, S - 2), z = randInt(1, S - 2);
            if (x < 3 && z < 3) continue;
            if (lampCells.some((l) => Math.abs(l.x - x) + Math.abs(l.z - z) < 4)) continue;
            lampCells.push({ x, z });
            const cord = rand(0.3, 1.0);
            const lamp = Models.createLamp(cord);
            const px = x * C, pz = z * C;
            const y = WALL_H - 0.2 - cord;
            lamp.group.position.set(px, y, pz);
            levelRoot.add(lamp.group);
            const pool = new THREE.Mesh(
                new THREE.PlaneGeometry(9, 9),
                new THREE.MeshBasicMaterial({
                    map: Textures.lightPool(), color: 0xff9a50, transparent: true, opacity: 0.14,
                    blending: THREE.AdditiveBlending, depthWrite: false
                })
            );
            pool.rotation.x = -Math.PI / 2;
            pool.position.set(px, 0.02, pz);
            levelRoot.add(pool);
            const broken = Math.random() < 0.3;
            lamps.push({
                pos: new THREE.Vector3(px, y, pz), cell: { x, z }, ...lamp, pool,
                broken, level: 1, phase: Math.random() * 100, swing: Math.random() * TAU
            });
        }

        const lampLights = [];
        for (let i = 0; i < LAMP_POOL; i++) {
            const l = new THREE.SpotLight(0xffa860, 0, 24, Math.PI / 2.6, 0.55, 1.6);
            l.castShadow = false;
            scene.add(l);
            scene.add(l.target);
            lampLights.push({ light: l, lamp: null });
        }

        // ---- Wall decals ------------------------------------------------------
        const decalKinds = [...WARNINGS.map((w) => 'text:' + w), 'tally', 'hand', 'hand', 'eye', 'tally'];
        const decalCount = 34;
        for (let i = 0; i < decalCount && wallSegments.length; i++) {
            const seg = pick(wallSegments);
            const kind = pick(decalKinds);
            const mat = new THREE.MeshStandardMaterial({
                map: Textures.decal(kind), transparent: true, depthWrite: false, roughness: 0.6,
                polygonOffset: true, polygonOffsetFactor: -2
            });
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), mat);
            const side = Math.random() < 0.5 ? -1 : 1;
            const off = WALL_T / 2 + 0.015;
            const along = rand(-2.2, 2.2);
            const y = kind === 'hand' ? rand(0.9, 1.6) : rand(1.5, 2.8);
            if (seg.horizontal) {
                plane.position.set(seg.x + along, y, seg.z + side * off);
                plane.rotation.y = side > 0 ? 0 : Math.PI;
            } else {
                plane.position.set(seg.x + side * off, y, seg.z + along);
                plane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
            }
            plane.receiveShadow = true;
            levelRoot.add(plane);
        }

        progress('Scattering supplies...', 0.85);
        await nextFrame();

        // ---- Spawn, note, pickups ----------------------------------------------
        const spawn = new THREE.Vector3(0, 0, 0);
        World.updateFlow(0, 0);

        const freeCell = (minPath, avoid) => {
            for (let t = 0; t < 400; t++) {
                const x = randInt(1, S - 2), z = randInt(1, S - 2);
                const d = World.pathDist(x, z);
                if (d < minPath) continue;
                if (avoid.some((a) => a.x === x && a.z === z)) continue;
                return { x, z };
            }
            return { x: randInt(2, S - 2), z: randInt(2, S - 2) };
        };

        const used = [...lampCells];
        const pickups = [];
        const batteryCount = randInt(5, 7);
        for (let i = 0; i < batteryCount; i++) {
            const c = freeCell(4, used);
            used.push(c);
            const b = Models.createBattery();
            const pos = new THREE.Vector3(c.x * C + rand(-2, 2), 0.35, c.z * C + rand(-2, 2));
            b.group.position.copy(pos);
            levelRoot.add(b.group);
            pickups.push({ type: 'battery', ...b, pos, cell: c, collected: false, phase: Math.random() * 10 });
        }
        for (let i = 0; i < 3; i++) {
            const c = freeCell(6, used);
            used.push(c);
            const mb = createMatchbox();
            const pos = new THREE.Vector3(c.x * C + rand(-2, 2), 0.06, c.z * C + rand(-2, 2));
            mb.group.position.copy(pos);
            levelRoot.add(mb.group);
            pickups.push({ type: 'matches', ...mb, pos, cell: c, collected: false, phase: Math.random() * 10 });
        }

        const noteStand = Models.createNoteStand(false);
        noteStand.group.position.set(-2.4, 0, 2.6);
        noteStand.group.rotation.y = 0.6;
        levelRoot.add(noteStand.group);
        World.addCircle(-2.4, 2.6, 0.45, false);
        const notes = [{
            pos: new THREE.Vector3(-2.4, 0.6, 2.6), stand: noteStand, cell: { x: 0, z: 0 },
            ...Lore.level1[0]
        }];

        // ---- Exits -------------------------------------------------------------
        const exits = [];
        for (const ex of World.exits) {
            const door = Models.createExitDoor();
            const wallZ = ex.z * C + H - WALL_T / 2 - 0.02;
            door.group.position.set(ex.x * C, 0, wallZ);
            door.group.rotation.y = Math.PI;
            levelRoot.add(door.group);
            const light = new THREE.PointLight(0x33ff77, 1.1, 12, 1.8);
            light.position.set(ex.x * C, 3.4, wallZ - 1.2);
            scene.add(light);
            exits.push({ cell: ex, pos: new THREE.Vector3(ex.x * C, 1.6, wallZ - 0.6), door, light });
        }

        progress('Something stirs...', 0.95);
        await nextFrame();

        return {
            id: 1,
            name: 'THE MAZE',
            root: levelRoot,
            ownedTextures: owned,
            spawn, spawnYaw: -Math.PI * 0.75,
            lamps, pickups, notes, exits,
            wallHeight: WALL_H,
            hasCeiling: true,
            flashlightAllowed: true,

            update(dt, time, cam) {
                // Lamp flicker & sway
                for (const l of lamps) {
                    let level = 1;
                    if (l.broken) {
                        const n = Noise.value2(time * 9 + l.phase, l.phase, 256, 256);
                        level = n > 0.55 ? 1 : n > 0.4 ? 0.35 : 0.05;
                    } else {
                        level = 0.92 + Math.sin(time * 13 + l.phase) * 0.04 + Math.sin(time * 37 + l.phase) * 0.03;
                    }
                    l.level = level;
                    l.bulbMat.emissiveIntensity = 7 * level;
                    l.glow.material.opacity = 0.55 * level;
                    l.pool.material.opacity = 0.14 * level;
                    l.group.rotation.z = Math.sin(time * 0.7 + l.swing) * 0.03;
                }
                // Real spotlights follow the nearest lamps
                assignLamps(cam, lamps, lampLights);
                for (const slot of lampLights) {
                    if (!slot.lamp) { slot.light.intensity = 0; continue; }
                    slot.light.intensity = 5.5 * slot.lamp.level;
                }
                for (const p of pickups) {
                    if (p.collected) continue;
                    p.group.rotation.y += dt * 1.2;
                    if (p.type === 'battery') p.group.position.y = p.pos.y + Math.sin(time * 2 + p.phase) * 0.06;
                    p.glow.material.opacity = 0.35 + Math.sin(time * 3 + p.phase) * 0.15;
                }
                const f = 0.85 + Math.sin(time * 17) * 0.1 + Math.sin(time * 41) * 0.05;
                noteStand.flame.scale.set(0.06 * f, 0.12 * f, 1);
                noteStand.glow.material.opacity = 0.45 * f;
                for (const ex of exits) {
                    ex.light.intensity = 1.0 + Math.sin(time * 2.5) * 0.2;
                }
            },

            // Is the player standing in a lamp's light?
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

    let lastAssign = 0;
    function assignLamps(cam, lamps, slots) {
        const now = performance.now();
        if (now - lastAssign < 250) return;
        lastAssign = now;
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
            free.light.position.set(l.pos.x, l.pos.y - 0.1, l.pos.z);
            free.light.target.position.set(l.pos.x, 0, l.pos.z);
            free.light.target.updateMatrixWorld();
        }
    }

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

    return { build, createMatchbox, WALL_H };
})();
