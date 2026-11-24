// THE WATCHING DARK - Level 3: The Flooded Basement
// Ankle-deep black water over concrete, with deeper pools that slow you down and splash
// loudly. The Drowned are blind: light means nothing to them, sound means everything.
'use strict';

const Level3 = (() => {
    const WALL_H = 4.3;
    const WATER_Y = 0.2;

    const WARNINGS = [
        'LISTEN', "DON'T SPLASH", 'QUIET', 'THEY HEAR YOU', 'STAY STILL', 'B3',
        'HOLD YOUR BREATH', 'NO RUNNING', 'CLICK CLICK CLICK'
    ];

    async function build(scene, quality, progress) {
        const S = World.SIZE, C = World.CELL;
        const shell = await Facility.build(scene, quality, progress, {
            wallH: WALL_H,
            fogColor: 0x020504,
            fogDensity: 0.074,
            wallColor: 0x6c7569,
            floorColor: 0x77756c,
            ceilingColor: 0x6a6a62,
            pipeChance: 0.6,
            columnChance: 0.55,
            lampCount: [8, 11],
            lampBroken: 0.6,
            lampIntensity: 2.8,
            decals: [...WARNINGS.map((w) => 'text:' + w), 'tally', 'hand', 'hand', 'hand'],
            decalCount: 28,
            messages: {
                carve: 'Draining nothing...',
                walls: 'Sweating concrete...',
                floor: 'Flooding the basement...',
                ceiling: 'Rusting the pipes...',
                raise: 'Raising the water...',
                lamps: 'Shorting the lamps...'
            }
        });

        progress('Finding the deep water...', 0.8);
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
        // Dark, soft-edged pits under the surface
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

        progress('Scattering supplies...', 0.88);
        await nextFrame();
        // Pickups float on the surface
        const pickups = [
            ...Facility.scatter(shell, 'battery', randInt(5, 6), 4, 0.42),
            ...Facility.scatter(shell, 'matches', randInt(2, 3), 6, WATER_Y + 0.05)
        ];
        const notes = Facility.addNotes(scene, shell, Lore.level3);
        const exits = Facility.addExitDoors(scene, shell);

        progress('Something is listening...', 0.95);
        await nextFrame();

        let dripTimer = 1, groanTimer = rand(6, 14);
        return {
            id: 3,
            name: 'THE FLOODED BASEMENT',
            root: shell.root,
            ownedTextures: shell.owned,
            spawn: new THREE.Vector3(0, 0, 0), spawnYaw: -Math.PI * 0.75,
            lamps: shell.lamps, pickups, notes: notes.list, exits: exits.list,
            wallHeight: WALL_H,
            hasCeiling: true,
            flashlightAllowed: true,
            water: true,

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
            nearLight: shell.nearLight
        };
    }

    return { build, WATER_Y };
})();
