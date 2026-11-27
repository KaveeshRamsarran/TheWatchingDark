// THE WATCHING DARK - Level 3: The Holding Tanks
// Shaw's laboratory under the reservoir, flooded to the shins. Lab halls full of tanks - the
// green glow of the liquid is almost all the light there is, and banks of it fail. Pale
// shapes float in some of them and turn to watch you pass; some tanks have been drained from
// the inside; and something you saw in a tank may not be there when you come back.
// The Drowned are blind: light means nothing to them, sound means everything.
'use strict';

const Level3 = (() => {
    const WALL_H = 4.6;
    const WATER_Y = 0.2;
    const NECK = [0, 2.1, 0.02];          // where a specimen's head turns (printed by props.py)

    const WARNINGS = [
        'DO NOT TAP THE GLASS', 'KEEP SEALED', 'THEY HEAR THE GLASS', 'TANK 7 IS EMPTY', 'WHO DRAINED IT',
        'LISTEN', "DON'T SPLASH", 'B3', 'SUBJECTS ARE NOT ASLEEP', 'CLICK CLICK CLICK'
    ];

    async function build(scene, quality, progress) {
        const S = World.SIZE, C = World.CELL;
        const shell = await Facility.build(scene, quality, progress, {
            // Big lab halls joined by short service corridors
            generate: () => World.generate({ rooms: [9, 12], roomSize: [4, 6], halls: [0, 1], corridors: [4, 7] }),
            wallH: WALL_H,
            fogColor: 0x010403,
            fogDensity: 0.06,
            wallTexture: () => Textures.labTiles(),
            wallColor: 0xb4c2b8,
            floorColor: 0x6a6c66,
            ceilingColor: 0x585c56,
            pipeChance: 0.75,
            columnChance: 0.1,
            lampCount: [5, 7],
            lampColor: 0xd0ecff,
            lightColor: 0xc0e0ff,
            poolColor: 0x8acaff,
            lampBroken: 0.8,
            lampIntensity: 2.2,
            decals: [...WARNINGS.map((w) => 'text:' + w), 'hand', 'hand', 'hand', 'tally'],
            decalCount: 26,
            messages: {
                carve: 'Partitioning the laboratory...',
                walls: 'Tiling the holding bays...',
                floor: 'Flooding the lab...',
                ceiling: 'Rusting the feed pipes...',
                raise: 'Raising the water...',
                lamps: 'Shorting the lamps...'
            }
        });
        const L = shell.lite;

        progress('Filling the tanks...', 0.78);
        await nextFrame();

        // ---- The tanks: rows of them through the lab halls -------------------------------
        const key = (x, z) => x * S + z;
        const taken = new Set();
        const banned = (x, z) => (x < 3 && z < 3) || World.exits.some((e) => Math.abs(e.x - x) + Math.abs(e.z - z) < 2);
        const tanks = [];
        World.rooms.forEach((r, ri) => {
            for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
                for (let z = r.z + 1; z < r.z + r.h - 1; z++) {
                    if (taken.has(key(x, z)) || banned(x, z) || Math.random() < 0.15) continue;
                    taken.add(key(x, z));
                    const along = Math.random() < 0.5;
                    const offs = Math.random() < 0.7 ? [-2.05, 2.05] : [0];
                    for (const o of offs) {
                        const px = x * C + (along ? o : 0) + rand(-0.15, 0.15), pz = z * C + (along ? 0 : o) + rand(-0.15, 0.15);
                        if (World.overlaps(px, pz, 1.3)) continue;
                        tanks.push({ x: px, z: pz, room: ri, ry: rand(0, TAU) });
                        World.addCircle(px, pz, 1.2, false);
                    }
                    shell.used.push({ x, z });
                }
            }
        });

        // Each hall's tanks are one bank on one circuit: they glow together and fail together
        const banks = World.rooms.map(() => ({
            mat: Props.material('Liquid'),
            level: 1, mode: 'on', timer: rand(8, 50), dead: Math.random() < 0.15, cx: 0, cz: 0, n: 0
        }));
        const glassMat = Props.material('Glass');
        const metalMat = Props.material('Metal', { color: 0x4a4e4c });
        const handMat = new THREE.MeshStandardMaterial({ map: Textures.decal('hand'), transparent: true, depthWrite: false, roughness: 0.6, side: THREE.DoubleSide, color: 0x9aa8a0 });
        const residueMat = new THREE.MeshBasicMaterial({ color: 0x050806, transparent: true, opacity: 0.8, depthWrite: false });
        const skinMat = Props.material('Skin', { color: 0xbcc4b8, roughness: 0.42 });
        const mats = { Glass: glassMat, Metal: metalMat, Hand: handMat, Residue: residueMat };
        banks.forEach((b, i) => { mats['Liquid#' + i] = b.mat; });

        // Handprints on the inside of the glass and a dark ring of residue: a tank drained from within
        const handprints = (t, into) => {
            const n = randInt(3, 6);
            for (let i = 0; i < n; i++) {
                const a = rand(0, TAU), y = rand(0.9, 2.5), s = rand(0.28, 0.42);
                const g = new THREE.PlaneGeometry(s, s);
                g.rotateZ(rand(-0.8, 0.8));
                g.rotateY(a);
                g.translate(t.x + Math.sin(a) * 0.95, y, t.z + Math.cos(a) * 0.95);
                into.addGeometry('Hand', g);
            }
            const ring = new THREE.CircleGeometry(0.95, 24);
            ring.rotateX(-Math.PI / 2);
            ring.translate(t.x, 0.56, t.z);
            into.addGeometry('Residue', ring);
        };

        const useProps = Props.has('Tank');
        const fallback = useProps ? null : {
            Metal: new THREE.CylinderGeometry(1.18, 1.18, 0.5, 24).translate(0, 0.25, 0),
            Glass: new THREE.CylinderGeometry(1, 1, 2.66, 24, 1, true).translate(0, 1.83, 0),
            Liquid: new THREE.CylinderGeometry(0.97, 0.97, 2.4, 24).translate(0, 1.72, 0)
        };
        const addTank = (batch, t, liquid) => {
            if (useProps) return batch.add('Tank', t.x, 0, t.z, t.ry, 1, { Liquid: liquid });
            for (const [k, g] of Object.entries(fallback)) {
                const kk = k === 'Liquid' ? liquid : k;
                if (kk) batch.addGeometry(kk, g.clone().translate(t.x, 0, t.z));
            }
        };

        const specimens = [];
        const maxSpecimens = L ? 6 : 14;
        const roomBatches = World.rooms.map(() => Props.batch());
        for (const t of tanks) {
            const b = banks[t.room];
            b.cx += t.x; b.cz += t.z; b.n++;
            const r = Math.random();
            if (r < 0.22) {
                // Drained
                t.drained = true;
                addTank(roomBatches[t.room], t, '');
                handprints(t, roomBatches[t.room]);
            } else if (r < 0.38 && specimens.length < maxSpecimens) {
                // Something floats in this one (its liquid is its own, so it can drain)
                addTank(roomBatches[t.room], t, '');
                specimens.push(t);
            } else {
                addTank(roomBatches[t.room], t, 'Liquid#' + t.room);
            }
        }
        for (const b of banks) if (b.n) { b.cx /= b.n; b.cz /= b.n; }
        roomBatches.forEach((rb) => rb.flush(shell.root, mats));

        // ---- The specimens --------------------------------------------------------------
        progress('Something is floating...', 0.84);
        await nextFrame();
        const liquidGeo = useProps ? (Props.parts('Tank').find((p) => p.key === 'Liquid') || {}).geo : fallback.Liquid;
        const specimenList = specimens.map((t, i) => {
            const root = new THREE.Group();
            root.position.set(t.x, 0, t.z);
            root.rotation.y = t.ry;
            shell.root.add(root);
            const liquid = new THREE.Mesh(liquidGeo, banks[t.room].mat);
            root.add(liquid);
            const body = new THREE.Group();
            root.add(body);
            const head = new THREE.Group();
            head.position.set(...NECK);
            body.add(head);
            if (Props.has('Specimen')) {
                body.add(Props.single('Specimen', { Skin: skinMat }));
                head.add(Props.single('SpecimenHead', { Skin: skinMat }));
            }
            // Its handprints, for if it ever leaves
            const hb = Props.batch();
            handprints({ x: 0, z: 0 }, hb);
            const hands = new THREE.Group();
            hb.flush(hands, mats, { shadow: false });
            hands.visible = false;
            root.add(hands);
            return {
                t, root, body, head, liquid, hands, phase: Math.random() * 10,
                leaves: Math.random() < 0.6, seen: false, gone: false, yaw: 0
            };
        });

        // ---- Light: the nearest glowing tanks light the room --------------------------------
        const tankLights = [];
        for (let i = 0; i < (L ? 2 : 4); i++) {
            const l = new THREE.PointLight(0x3cff9a, 0, 9, 1.6);
            l.userData.volWeight = 0.35;
            scene.add(l);
            tankLights.push({ light: l, tank: null });
        }
        const glowing = tanks.filter((t) => !t.drained);

        progress('Finding the deep water...', 0.88);
        await nextFrame();

        // ---- Deep pools: blobs of cells where the floor drops away ---------------
        const deep = new Uint8Array(S * S);
        const nearExit = (x, z) => World.exits.some((e) => Math.abs(e.x - x) + Math.abs(e.z - z) < 2);
        const pools = randInt(10, 14);
        for (let i = 0; i < pools; i++) {
            const cx = randInt(3, S - 2), cz = randInt(3, S - 2);
            const r = rand(1, 2.4);
            for (let x = Math.floor(cx - r); x <= cx + r; x++) {
                for (let z = Math.floor(cz - r); z <= cz + r; z++) {
                    if (!World.inBounds(x, z) || (x < 3 && z < 3) || nearExit(x, z)) continue;
                    if (Math.hypot(x - cx, z - cz) > r + rand(-0.4, 0.4)) continue;
                    deep[x * S + z] = 1;
                }
            }
        }
        const pitGeos = [];
        for (let x = 0; x < S; x++) {
            for (let z = 0; z < S; z++) {
                if (!deep[x * S + z]) continue;
                const g = new THREE.PlaneGeometry(C * 1.7, C * 1.7);
                g.rotateX(-Math.PI / 2);
                g.translate(x * C + rand(-0.6, 0.6), 0.015, z * C + rand(-0.6, 0.6));
                pitGeos.push(g);
            }
        }
        if (pitGeos.length) {
            const pits = new THREE.Mesh(mergeGeometries(pitGeos), new THREE.MeshBasicMaterial({
                map: Textures.lightPool(), color: 0x000000, transparent: true, opacity: 0.92, depthWrite: false
            }));
            pits.renderOrder = -1;
            shell.root.add(pits);
            for (const g of pitGeos) g.dispose();
        }

        // ---- The water surface ----------------------------------------------------
        const span = S * C + 8, mid = (S - 1) * C / 2;
        const water = repeated(Textures.waterNormal(), span / 7, shell.owned);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x0b1310, roughness: 0.1, metalness: 0.25,
            normalMap: water.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
            transparent: true, opacity: 0.8, depthWrite: false
        });
        const surface = new THREE.Mesh(new THREE.PlaneGeometry(span, span), waterMat);
        surface.rotation.x = -Math.PI / 2;
        surface.position.set(mid, WATER_Y, mid);
        surface.receiveShadow = true;
        shell.root.add(surface);

        progress('Scattering supplies...', 0.92);
        await nextFrame();
        const pickups = [
            ...Facility.scatter(shell, 'battery', randInt(5, 6), 4, 0.42),
            ...Facility.scatter(shell, 'matches', randInt(2, 3), 6, WATER_Y + 0.05)
        ];
        const notes = Facility.addNotes(scene, shell, Lore.level3);
        const exits = Facility.addExitDoors(scene, shell);

        progress('Something is listening...', 0.96);
        await nextFrame();

        const camDir = new THREE.Vector3();
        let dripTimer = 1, groanTimer = rand(6, 14), assignAt = 0;
        const level = {
            id: 3,
            name: 'THE HOLDING TANKS',
            root: shell.root,
            ownedTextures: shell.owned,
            spawn: new THREE.Vector3(0, 0, 0), spawnYaw: -Math.PI * 0.75,
            lamps: shell.lamps, pickups, notes: notes.list, exits: exits.list,
            wallHeight: WALL_H,
            hasCeiling: true,
            flashlightAllowed: true,
            water: true,
            debugThings: { tanks, specimens: specimenList, banks },

            // 1 in a deep pool, 0 in the shallows
            waterDepth(x, z) {
                const cx = World.cellX(x), cz = World.cellX(z);
                return World.inBounds(cx, cz) && deep[cx * S + cz] ? 1 : 0;
            },
            isDeepCell(cx, cz) { return World.inBounds(cx, cz) && deep[cx * S + cz] === 1; },

            update(dt, time, cam) {
                shell.update(dt, time, cam);
                water.normalMap.offset.set(time * 0.012, time * 0.007);
                Facility.animatePickups(pickups, dt, time);
                notes.update(dt, time, cam);
                exits.update(time);

                // Banks of tanks fail: a flicker, then the hall goes dark for a while
                for (const b of banks) {
                    if (b.dead) {
                        b.level = Noise.value2(time * 2 + b.cx, 3, 256, 256) > 0.93 ? 0.25 : 0.03;
                    } else {
                        b.timer -= dt;
                        if (b.mode === 'on') {
                            b.level = 0.92 + Math.sin(time * 1.3 + b.cx) * 0.05;
                            if (b.timer <= 0) { b.mode = 'flicker'; b.timer = rand(0.8, 2.2); b.next = Math.random() < 0.6 ? 'off' : 'on'; }
                        } else if (b.mode === 'flicker') {
                            b.level = Noise.value2(time * 14 + b.cz, b.cx, 256, 256) > 0.5 ? 1 : 0.08;
                            if (b.timer <= 0) {
                                b.mode = b.next;
                                b.timer = b.mode === 'off' ? rand(8, 22) : rand(15, 50);
                                if (b.mode === 'off' && Math.hypot(cam.position.x - b.cx, cam.position.z - b.cz) < 26) AudioSys.thump(0.25);
                            }
                        } else {
                            b.level = 0.03;
                            if (b.timer <= 0) { b.mode = 'flicker'; b.timer = rand(0.6, 1.6); b.next = 'on'; }
                        }
                    }
                    b.mat.emissiveIntensity = 0.8 * b.level;
                }

                // The nearest glowing tanks get the real lights
                if (time - assignAt > 0.25 || time < assignAt) {
                    assignAt = time;
                    const near = glowing
                        .map((t) => ({ t, d: (t.x - cam.position.x) ** 2 + (t.z - cam.position.z) ** 2 }))
                        .filter((e) => e.d < 30 * 30 && banks[e.t.room].level > 0.2 && !(e.t.gone))
                        .sort((a, b) => a.d - b.d)
                        .slice(0, tankLights.length);
                    tankLights.forEach((s, i) => {
                        s.tank = near[i] ? near[i].t : null;
                        if (s.tank) s.light.position.set(s.tank.x, 1.9, s.tank.z);
                    });
                }
                for (const s of tankLights) s.light.intensity = s.tank ? 1.8 * banks[s.tank.room].level : 0;

                // The specimens: drifting, watching - and sometimes gone
                cam.getWorldDirection(camDir);
                for (const sp of specimenList) {
                    if (sp.gone) continue;
                    const dx = cam.position.x - sp.t.x, dz = cam.position.z - sp.t.z;
                    const d = Math.hypot(dx, dz) || 1;
                    sp.body.position.y = Math.sin(time * 0.55 + sp.phase) * 0.06;
                    sp.body.rotation.y = Math.sin(time * 0.17 + sp.phase) * 0.25;
                    sp.body.rotation.z = Math.sin(time * 0.23 + sp.phase) * 0.05;
                    // It turns its head to follow you while you're near
                    const watching = d < 9 && World.lineOfSight(cam.position.x, cam.position.z, sp.t.x, sp.t.z);
                    let want = 0;
                    if (watching) {
                        const local = Math.atan2(dx, dz) - sp.root.rotation.y - sp.body.rotation.y;
                        want = clamp(Math.atan2(Math.sin(local), Math.cos(local)), -1.3, 1.3);
                    }
                    sp.yaw = damp(sp.yaw, want, watching ? 1.1 : 0.4, dt);
                    sp.head.rotation.y = sp.yaw;
                    sp.head.rotation.x = watching ? -0.15 : 0.1;
                    // Seen it? Then once you're well away and looking elsewhere, it may leave
                    const facing = (-dx * camDir.x - dz * camDir.z) / d;
                    if (d < 14 && facing > 0.55) sp.seen = true;
                    if (sp.leaves && sp.seen && d > 16 && facing < 0.1 && Math.random() < dt * 0.08) {
                        sp.gone = true;
                        sp.t.gone = true;
                        sp.body.visible = false;
                        sp.liquid.visible = false;
                        sp.hands.visible = true;
                    }
                }

                dripTimer -= dt;
                if (dripTimer <= 0) {
                    dripTimer = rand(0.6, 3);
                    AudioSys.drip(rand(-0.9, 0.9), rand(0.25, 1));
                }
                groanTimer -= dt;
                if (groanTimer <= 0) {
                    groanTimer = rand(18, 40);
                    AudioSys.groan(rand(-0.8, 0.8), rand(0.5, 1));
                }
            },
            // Standing in a lamp's light, or right beside a glowing tank, steadies you
            nearLight(pos) {
                if (shell.nearLight(pos)) return true;
                for (const s of tankLights) {
                    if (!s.tank || banks[s.tank.room].level < 0.3) continue;
                    if ((s.tank.x - pos.x) ** 2 + (s.tank.z - pos.z) ** 2 < 3.5 * 3.5) return true;
                }
                return false;
            }
        };
        return level;
    }

    return { build, WATER_Y };
})();
