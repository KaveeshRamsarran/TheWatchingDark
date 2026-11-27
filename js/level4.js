// THE WATCHING DARK - Level 4: The Observation Wing
// Where they filmed them. Black-padded soundstages joined by backstage corridors, each stage
// holding a perfect 1950s home - a living room, a kitchen, a bedroom - with no fourth wall,
// under dead stage lights. The crew are mannequins: through the lens they look exactly like
// the things that only exist on camera. Lower it, and the mannequins are still there.
'use strict';

const Level4 = (() => {
    const WALL_H = 7;

    const WARNINGS = [
        'SMILE FOR THE CAMERA', 'KEEP RECORDING', 'QUIET ON SET', "IT'S ONLY ON TAPE", "DON'T LOWER IT",
        'WHO IS BEHIND YOU', 'STAGE 4', 'BATTERY IS LIFE', 'FILM THE CORNERS', 'STATIC MEANS CLOSE', 'ROLLING'
    ];
    const KINDS = ['living', 'kitchen', 'bedroom'];

    async function build(scene, quality, progress) {
        const S = World.SIZE, C = World.CELL, H = World.HALF;
        const shell = await Facility.build(scene, quality, progress, {
            // Soundstages joined by backstage corridors
            generate: () => World.generate({ rooms: [8, 11], roomSize: [4, 6], halls: [0, 1], corridors: [5, 8] }),
            wallH: WALL_H,
            fogColor: 0x020202,
            fogDensity: 0.07,
            wallTexture: () => Textures.acousticPadding(),
            wallColor: 0x8a8a92,
            floorColor: 0x5a5852,
            ceilingColor: 0x1e1e20,
            pipeChance: 0.35,
            columnChance: 0.12,
            lampCount: [9, 12],
            lampColor: 0xff2a14,
            lightColor: 0xff2a18,
            poolColor: 0xff2010,
            lampBroken: 0.4,
            lampIntensity: 1.9,
            decals: [...WARNINGS.map((w) => 'text:' + w), 'eye', 'eye', 'tally', 'hand'],
            decalCount: 30,
            messages: {
                carve: 'Building the soundstages...',
                walls: 'Padding the walls...',
                floor: 'Taping the marks...',
                ceiling: 'Rigging the lights...',
                raise: 'Locking the stage doors...',
                lamps: 'Switching to emergency power...'
            }
        });
        const L = shell.lite;

        progress('Dressing the sets...', 0.74);
        await nextFrame();

        // ---- Materials for the sets ---------------------------------------------------------
        const wallpaperMats = {}, floorMats = {};
        for (const k of KINDS) {
            const t = Textures.wallpaper(k).clone();
            t.needsUpdate = true;
            t.repeat.set(3, 1.5);
            shell.owned.push(t);
            wallpaperMats[k] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
        }
        for (const k of ['checker', 'boards', 'rug']) {
            const t = Textures.setFloor(k).clone();
            t.needsUpdate = true;
            if (k !== 'rug') t.repeat.set(4, 3);
            shell.owned.push(t);
            floorMats[k] = new THREE.MeshStandardMaterial({ map: t, roughness: k === 'checker' ? 0.35 : 0.8 });
        }
        const ply = Textures.plywood().clone();
        ply.needsUpdate = true;
        ply.repeat.set(2, 1);
        shell.owned.push(ply);
        const mats = {
            Plywood: new THREE.MeshStandardMaterial({ map: ply, roughness: 0.9, color: 0xb0a090 }),
            Trim: new THREE.MeshStandardMaterial({ color: 0xe0dccf, roughness: 0.5 }),
            Backdrop: new THREE.MeshBasicMaterial({ map: Textures.backdrop(), color: 0x8090a0 }),
            Curtain: new THREE.MeshStandardMaterial({ color: 0x7a2a28, roughness: 0.95, side: THREE.DoubleSide }),
            FrameArt: new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.7 }),
            Rig: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.7 }),
            Wood: Props.material('Wood', { color: 0x5e3822 }),
            Fabric: Props.material('Fabric', { color: 0x6a8c86 }),
            Canvas: Props.material('Canvas')
        };
        for (const k of KINDS) mats['Paper#' + k] = wallpaperMats[k];
        for (const k of ['checker', 'boards', 'rug']) mats['Floor#' + k] = floorMats[k];

        const batch = Props.batch();
        const box = (key, w, h, d, x, y, z, ry = 0) => {
            const g = new THREE.BoxGeometry(w, h, d);
            g.rotateY(ry);
            g.translate(x, y, z);
            batch.addGeometry(key, g);
        };
        const plane = (key, w, h, x, y, z, ry = 0, rx = 0) => {
            const g = new THREE.PlaneGeometry(w, h);
            if (rx) g.rotateX(rx);
            g.rotateY(ry);
            g.translate(x, y, z);
            batch.addGeometry(key, g);
        };

        // ---- Choose where the sets stand: interior cells of the soundstages, facing in --------
        const sets = [];
        const banned = (x, z) => (x < 3 && z < 3) || World.exits.some((e) => Math.abs(e.x - x) + Math.abs(e.z - z) < 3);
        World.rooms.forEach((r) => {
            const inner = [];
            for (let x = r.x + 1; x < r.x + r.w - 1; x++) for (let z = r.z + 1; z < r.z + r.h - 1; z++) inner.push({ x, z });
            inner.sort(() => Math.random() - 0.5);
            const mx = r.x + (r.w - 1) / 2, mz = r.z + (r.h - 1) / 2;
            let placed = 0;
            for (const c of inner) {
                if (placed >= 2 || banned(c.x, c.z)) continue;
                if (sets.some((s) => Math.abs(s.cx - c.x) + Math.abs(s.cz - c.z) < 3)) continue;
                // The open side faces the middle of the stage (snapped to the grid)
                const dx = mx - c.x, dz = mz - c.z;
                let face;
                if (Math.abs(dx) < 0.5 && Math.abs(dz) < 0.5) face = randInt(0, 3) * Math.PI / 2;
                else if (Math.abs(dx) > Math.abs(dz)) face = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
                else face = dz > 0 ? 0 : Math.PI;
                // The crew stands in the next cell along: it must be open floor
                const fx = c.x + Math.round(Math.sin(face)), fz = c.z + Math.round(Math.cos(face));
                if (fx < r.x || fx >= r.x + r.w || fz < r.z || fz >= r.z + r.h) continue;
                sets.push({ cx: c.x, cz: c.z, face, kind: KINDS[sets.length % 3] });
                shell.used.push({ x: c.x, z: c.z }, { x: fx, z: fz });
                placed++;
            }
        });

        // Places to hide: wardrobes on the sets, lockers backstage.
        // in: where you stand inside; out: where you step back out; yaw: looking out of the door
        const hideSpots = [];
        const addHide = (x, z, ry, kind) => {
            const fx = Math.sin(ry), fz = Math.cos(ry);
            hideSpots.push({
                kind,
                in: new THREE.Vector3(x + fx * 0.36, 0, z + fz * 0.36),   // eye to the slats of the door
                out: new THREE.Vector3(x + fx * 1.05, 0, z + fz * 1.05),
                yaw: Math.atan2(-fx, -fz)
            });
        };

        // ---- Build each set ------------------------------------------------------------------
        const mannequins = [];
        const maxMannequins = L ? 6 : 14;
        for (const s of sets) {
            const ox = s.cx * C, oz = s.cz * C, f = s.face;
            const cos = Math.cos(f), sin = Math.sin(f);
            // local (x across, z toward the open front) -> world
            const W = (lx, lz) => [ox + lx * cos + lz * sin, oz - lx * sin + lz * cos];
            const at = (lx, lz) => { const [x, z] = W(lx, lz); return { x, z }; };
            const faceTo = (lx, lz, tx, tz) => Math.atan2(tx - lx, tz - lz) + f;
            const prop = (name, lx, lz, ry, collide = 0) => {
                const p = at(lx, lz);
                batch.add(name, p.x, 0, p.z, ry, 1, { Fabric: s.kind === 'kitchen' ? 'Fabric' : 'Fabric', Wood: 'Wood' });
                if (collide) World.addCircle(p.x, p.z, collide, false);
            };
            // Floor, walls (wallpaper inside, raw plywood behind), trims
            const floorKey = s.kind === 'kitchen' ? 'Floor#checker' : 'Floor#boards';
            { const p = at(0, 0); plane(floorKey, 6.4, 4.8, p.x, 0.012, p.z, f, -Math.PI / 2); }
            if (s.kind !== 'kitchen') { const p = at(s.kind === 'bedroom' ? -0.2 : 0, -0.9); plane('Floor#rug', 3.2, 2.4, p.x, 0.02, p.z, f, -Math.PI / 2); }
            const wallH = 3.2;
            const walls = [
                { lx: 0, lz: -2.4, w: 6.4, along: 'x' },
                { lx: -3.2, lz: -0.6, w: 3.6, along: 'z' },
                { lx: 3.2, lz: -0.6, w: 3.6, along: 'z' }
            ];
            for (const wl of walls) {
                const p = at(wl.lx, wl.lz);
                const ry = wl.along === 'x' ? f : f + Math.PI / 2;
                box('Plywood', wl.w, wallH, 0.12, p.x, wallH / 2, p.z, ry);
                // Wallpaper on the inside face
                const inward = wl.along === 'x' ? at(wl.lx, wl.lz + 0.065) : at(wl.lx - Math.sign(wl.lx) * 0.065, wl.lz);
                const pry = wl.along === 'x' ? f : f + (wl.lx < 0 ? Math.PI / 2 : -Math.PI / 2);
                plane('Paper#' + s.kind, wl.w - (wl.along === 'x' ? 0 : 0.1), wallH - 0.02, inward.x, wallH / 2, inward.z, pry);
                const base = wl.along === 'x' ? at(wl.lx, wl.lz + 0.09) : at(wl.lx - Math.sign(wl.lx) * 0.09, wl.lz);
                box('Trim', wl.along === 'x' ? wl.w : 0.05, 0.14, wl.along === 'x' ? 0.05 : wl.w, base.x, 0.07, base.z, f);
                box('Trim', wl.along === 'x' ? wl.w : 0.05, 0.08, wl.along === 'x' ? 0.05 : wl.w, base.x, wallH - 0.06, base.z, f);
                // Collision for the flat
                const half = wl.w / 2;
                const a = at(wl.along === 'x' ? wl.lx - half : wl.lx, wl.along === 'x' ? wl.lz : wl.lz - half);
                const b2 = at(wl.along === 'x' ? wl.lx + half : wl.lx, wl.along === 'x' ? wl.lz : wl.lz + half);
                World.addBox(Math.min(a.x, b2.x) - 0.08, Math.max(a.x, b2.x) + 0.08, Math.min(a.z, b2.z) - 0.08, Math.max(a.z, b2.z) + 0.08);
            }
            // Braces holding the flats up, seen from behind
            for (const lx of [-2.2, 0, 2.2]) {
                const p = at(lx, -2.95);
                const g = new THREE.BoxGeometry(0.08, 3.2, 0.08);
                g.rotateX(0.55);
                g.rotateY(f);
                g.translate(p.x, 1.4, p.z);
                batch.addGeometry('Plywood', g);
            }
            // A painted window and curtains (living room, kitchen); pictures on the wall
            if (s.kind !== 'bedroom') {
                const wx = s.kind === 'kitchen' ? -1.2 : 1.5, wy = s.kind === 'kitchen' ? 2.05 : 1.75;
                const p = at(wx, -2.32);
                plane('Backdrop', 1.3, 1.1, p.x, wy, p.z, f);
                const frame = [[0, 0.58, 1.42, 0.08], [0, -0.58, 1.42, 0.08], [-0.67, 0, 0.08, 1.24], [0.67, 0, 0.08, 1.24], [0, 0, 0.05, 1.1]];
                for (const [fx, fy, fw, fh] of frame) {
                    const q = at(wx + fx, -2.3);
                    box('Trim', fw, fh, 0.05, q.x, wy + fy, q.z, f);
                }
                for (const side of [-1, 1]) {
                    const q = at(wx + side * 0.85, -2.25);
                    box('Curtain', 0.32, 1.7, 0.06, q.x, wy - 0.05, q.z, f);
                }
            }
            if (s.kind === 'living') {
                for (const [px, py] of [[-1.3, 2.1], [-0.4, 2.2]]) {
                    const q = at(px, -2.32);
                    box('Wood', 0.62, 0.5, 0.04, q.x, py, q.z, f);
                    const q2 = at(px, -2.3);
                    box('FrameArt', 0.5, 0.38, 0.02, q2.x, py, q2.z, f);
                }
                prop('Sofa', 0, -1.75, f, 0.9);
                prop('Armchair', 2.15, -0.35, faceTo(2.15, -0.35, 0, -0.6), 0.55);
                prop('CoffeeTable', 0, -0.6, f, 0.5);
                prop('FloorLamp', -2.7, -1.95, f, 0.2);
                prop('TVSet', -2.15, 0.0, faceTo(-2.15, 0.0, 0, -1.6), 0.45);
            } else if (s.kind === 'kitchen') {
                prop('Counter', 1.0, -2.0, f, 0.55);
                { const p = at(1.0, -2.0); World.addCircle(p.x + Math.cos(f) * 0.5, p.z - Math.sin(f) * 0.5, 0.5, false); }
                prop('Fridge', -2.55, -1.95, f, 0.45);
                prop('KitchenTable', 0.3, -0.2, f, 0.6);
                prop('KitchenChair', 0.3 - 0.85, -0.2, faceTo(-0.55, -0.2, 0.3, -0.2));
                prop('KitchenChair', 0.3 + 0.85, -0.2, faceTo(1.15, -0.2, 0.3, -0.2));
                prop('KitchenChair', 0.3, -1.05, faceTo(0.3, -1.05, 0.3, -0.2));
            } else {
                prop('Bed', -0.2, -1.25, f, 0.8);
                { const p = at(-0.2, -0.55); World.addCircle(p.x, p.z, 0.75, false); }
                prop('Nightstand', -1.3, -2.05, f, 0.3);
                prop('Nightstand', 0.9, -2.05, f, 0.3);
                prop('Wardrobe', 2.6, -1.0, f - Math.PI / 2, 0.55);
                { const p = at(2.6, -1.0); addHide(p.x, p.z, f - Math.PI / 2, 'wardrobe'); }
            }
            // The crew's gear, aimed at the set
            prop('StudioCamera', 0.7, 4.3, faceTo(0.7, 4.3, 0, -0.6), 0.55);
            prop('StageLight', -2.9, 2.6, faceTo(-2.9, 2.6, 0, -1), 0.4);
            if (Math.random() < 0.7) prop('StageLight', 3.0, 3.0, faceTo(3.0, 3.0, 0, -1), 0.4);
            prop('DirectorChair', -1.9, 4.9, faceTo(-1.9, 4.9, 0, -0.5), 0.35);
            if (Math.random() < 0.6) prop('BoomMic', 2.4, 1.6, faceTo(2.4, 1.6, 0, -1.2), 0.3);
            // ...and the crew: mannequins that look exactly like the Unseen through the lens
            const crew = [
                { lx: 0.75, lz: 5.55, look: [0, -0.6], arms: -1.05, fore: -0.5 },       // camera operator
                { lx: -1.15, lz: 5.4, look: [0, -0.5], arms: -0.15, fore: -0.1 },       // director
                { lx: 2.6, lz: 2.6, look: [0, -1.2], arms: -2.3, fore: -0.4 }           // boom operator
            ];
            for (const m of crew) {
                if (mannequins.length >= maxMannequins || (m !== crew[0] && Math.random() < 0.45)) continue;
                const model = Models.createWatcher(rand(0.95, 1.05), 'unseen');
                const p = at(m.lx, m.lz);
                model.root.position.set(p.x, 0, p.z);
                model.root.rotation.y = faceTo(m.lx, m.lz, m.look[0], m.look[1]);
                if (model.pose) {
                    for (const side of ['L', 'R']) {
                        model.pose('upperarm_' + side, m.arms + rand(-0.1, 0.1), 0, 0);
                        model.pose('forearm_' + side, m.fore, 0, 0);
                    }
                    model.pose('head', rand(-0.2, 0.2), rand(-0.3, 0.3), rand(-0.2, 0.2));
                }
                shell.root.add(model.root);
                World.addCircle(p.x, p.z, 0.35, false);
                mannequins.push(model);
            }
        }

        // ---- Lighting rigs across the top of every soundstage, and ON AIR signs ----------------
        const onAirMat = new THREE.MeshBasicMaterial({ map: Textures.onAir(), color: new THREE.Color(1.5, 1.2, 1.2) });
        const signs = [];
        World.rooms.forEach((r) => {
            const x0 = r.x * C - H + 0.5, x1 = (r.x + r.w - 1) * C + H - 0.5;
            for (let z = r.z; z < r.z + r.h; z += 2) {
                const g = new THREE.CylinderGeometry(0.05, 0.05, x1 - x0, 8);
                g.rotateZ(Math.PI / 2);
                g.translate((x0 + x1) / 2, WALL_H - 0.9, z * C);
                batch.addGeometry('Rig', g);
                for (let x = r.x; x < r.x + r.w; x++) {
                    if (Math.random() < 0.5) continue;
                    const head = new THREE.CylinderGeometry(0.16, 0.2, 0.42, 12);
                    head.rotateX(rand(-0.6, 0.6));
                    head.translate(x * C + rand(-2, 2), WALL_H - 1.25, z * C);
                    batch.addGeometry('Rig', head);
                }
            }
            // A sign over one of the stage's walls
            const segs = shell.wallSegments.filter((w) => w.x > x0 - 1 && w.x < x1 + 1 && w.z > r.z * C - H - 1 && w.z < (r.z + r.h - 1) * C + H + 1);
            if (!segs.length) return;
            const seg = pick(segs);
            const mx = (r.x + (r.w - 1) / 2) * C, mz = (r.z + (r.h - 1) / 2) * C;
            const side = seg.horizontal ? (mz > seg.z ? 1 : -1) : (mx > seg.x ? 1 : -1);
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), onAirMat);
            const off = Facility.WALL_T / 2 + 0.03;
            if (seg.horizontal) { sign.position.set(seg.x, WALL_H - 2.2, seg.z + side * off); sign.rotation.y = side > 0 ? 0 : Math.PI; }
            else { sign.position.set(seg.x + side * off, WALL_H - 2.2, seg.z); sign.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
            shell.root.add(sign);
            signs.push(sign);
        });

        // ---- Steel lockers along the backstage corridors ------------------------------------------
        const inRoom = (cx, cz) => World.rooms.some((r) => cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.h);
        const lockerCount = randInt(9, 13);
        let lockers = 0;
        for (let tries = 0; lockers < lockerCount && tries < 500 && Props.has('Locker'); tries++) {
            const seg = pick(shell.wallSegments);
            const side = pick(seg.sides);
            const nx = seg.horizontal ? 0 : side, nz = seg.horizontal ? side : 0;
            const along = rand(-2.3, 2.3);
            const x = seg.x + nx * (Facility.WALL_T / 2 + 0.3) + (seg.horizontal ? along : 0);
            const z = seg.z + nz * (Facility.WALL_T / 2 + 0.3) + (seg.horizontal ? 0 : along);
            const cx = World.cellX(x), cz = World.cellX(z);
            if (!World.inBounds(cx, cz) || inRoom(cx, cz) || (cx < 2 && cz < 2)) continue;
            if (World.exits.some((e) => Math.abs(e.x - cx) + Math.abs(e.z - cz) < 2)) continue;
            if (World.overlaps(x + nx * 0.1, z + nz * 0.1, 0.22) || World.overlaps(x + nx * 1.1, z + nz * 1.1, 0.5)) continue;
            if (hideSpots.some((h) => h.in.distanceToSquared(new THREE.Vector3(x, 0, z)) < 64)) continue;
            const ry = Math.atan2(nx, nz);
            batch.add('Locker', x, 0, z, ry, 1, null);
            World.addBox(x - 0.38, x + 0.38, z - 0.38, z + 0.38);
            addHide(x, z, ry, 'locker');
            lockers++;
        }
        mats.Metal = Props.material('Metal', { color: 0x5a6a62, roughness: 0.5, metalness: 0.6 });

        batch.flush(shell.root, mats);

        progress('Plugging in the monitors...', 0.84);
        await nextFrame();

        // ---- Playback monitors on carts along the backstage walls --------------------------
        const monitors = [];
        const monitorCount = randInt(9, 13);
        const T = Facility.WALL_T;
        for (let tries = 0; monitors.length < monitorCount && tries < 400; tries++) {
            const seg = pick(shell.wallSegments);
            const side = Math.random() < 0.5 ? -1 : 1;
            const along = rand(-2, 2);
            const off = T / 2 + 0.45;
            let x, z, ry;
            if (seg.horizontal) { x = seg.x + along; z = seg.z + side * off; ry = side > 0 ? 0 : Math.PI; }
            else { x = seg.x + side * off; z = seg.z + along; ry = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
            const cx = World.cellX(x), cz = World.cellX(z);
            if (!World.inBounds(cx, cz) || (cx < 2 && cz < 2)) continue;
            if (World.exits.some((e) => e.x === cx && e.z === cz)) continue;
            const nx = seg.horizontal ? 0 : side, nz = seg.horizontal ? side : 0;
            if (World.overlaps(x + nx * 0.5, z + nz * 0.5, 0.8)) continue;
            if (World.overlaps(x + nx * 0.2 + nz * 0.7, z + nz * 0.2 + nx * 0.7, 0.35)) continue;
            if (World.overlaps(x + nx * 0.2 - nz * 0.7, z + nz * 0.2 - nx * 0.7, 0.35)) continue;
            if (monitors.some((m) => m.pos.distanceToSquared(new THREE.Vector3(x, 0, z)) < 16)) continue;
            const m = Models.createMonitor();
            m.group.position.set(x, 0, z);
            m.group.rotation.y = ry;
            shell.root.add(m.group);
            if (seg.horizontal) World.addBox(x - 0.78, x + 0.78, z - 0.42, z + 0.42);
            else World.addBox(x - 0.42, x + 0.42, z - 0.78, z + 0.78);
            const dead = Math.random() < 0.3;
            if (dead) { m.screenMat.color.setHex(0x050607); m.glow.visible = false; }
            monitors.push({ ...m, pos: new THREE.Vector3(x, 0, z), dead, phase: Math.random() * 10 });
        }

        progress('Stocking camera batteries...', 0.9);
        await nextFrame();
        const pickups = [
            ...Facility.scatter(shell, 'battery', randInt(8, 10), 3),
            ...Facility.scatter(shell, 'matches', 2, 6)
        ];
        const notes = Facility.addNotes(scene, shell, Lore.level4);
        const exits = Facility.addExitDoors(scene, shell);

        progress('Quiet on set...', 0.96);
        await nextFrame();

        const staticTex = Textures.staticNoise();
        return {
            id: 4,
            name: 'THE OBSERVATION WING',
            root: shell.root,
            ownedTextures: shell.owned,
            spawn: new THREE.Vector3(0, 0, 0), spawnYaw: -Math.PI * 0.75,
            lamps: shell.lamps, pickups, notes: notes.list, exits: exits.list,
            wallHeight: WALL_H,
            hasCeiling: true,
            flashlightAllowed: false,
            camcorder: true,
            hideSpots,
            debugThings: { sets, mannequins, signs, hideSpots },

            update(dt, time, cam) {
                shell.update(dt, time, cam);
                staticTex.offset.set(Math.random(), Math.random());
                for (const m of monitors) {
                    if (m.dead) continue;
                    const n = Noise.value2(time * 3 + m.phase, m.phase, 256, 256);
                    m.glow.material.opacity = n < 0.2 ? 0.02 : 0.18;
                }
                // The ON AIR signs buzz and stutter
                const k = Noise.value2(time * 6, 11.3, 256, 256) > 0.12 ? 1 : 0.2;
                onAirMat.color.setRGB(1.5 * k, 1.2 * k, 1.2 * k);
                Facility.animatePickups(pickups, dt, time);
                notes.update(dt, time, cam);
                exits.update(time);
            },
            nearLight: shell.nearLight
        };
    }

    return { build };
})();
