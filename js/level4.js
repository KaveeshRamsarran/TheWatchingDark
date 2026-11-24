// THE WATCHING DARK - Level 4: The Observation Wing
// Offices lit only by red emergency lamps and dead CRTs. The flashlight is gone; all you
// have is a night-vision camcorder - and the things here only exist on camera.
'use strict';

const Level4 = (() => {
    const WALL_H = 4.6;

    const WARNINGS = [
        'SMILE FOR THE CAMERA', 'KEEP RECORDING', "IT'S ONLY ON TAPE", "DON'T LOWER IT",
        'WHO IS BEHIND YOU', 'BATTERY IS LIFE', 'FILM THE CORNERS', 'STATIC MEANS CLOSE'
    ];

    async function build(scene, quality, progress) {
        const C = World.CELL;
        const shell = await Facility.build(scene, quality, progress, {
            wallH: WALL_H,
            fogColor: 0x020202,
            fogDensity: 0.07,
            wallColor: 0x7a857b,
            floorColor: 0x86847e,
            ceilingColor: 0x8a8a84,
            pipeChance: 0.1,
            columnChance: 0.25,
            lampCount: [11, 14],
            lampColor: 0xff2a14,
            lightColor: 0xff2a18,
            poolColor: 0xff2010,
            lampBroken: 0.4,
            lampIntensity: 1.9,
            decals: [...WARNINGS.map((w) => 'text:' + w), 'eye', 'eye', 'eye', 'tally', 'hand'],
            decalCount: 30,
            messages: {
                carve: 'Partitioning the offices...',
                walls: 'Painting institutional green...',
                floor: 'Polishing the floors...',
                ceiling: 'Hanging ceiling tiles...',
                raise: 'Locking the doors...',
                lamps: 'Switching to emergency power...'
            }
        });

        progress('Plugging in the monitors...', 0.8);
        await nextFrame();

        // ---- CRT monitors on desks against the walls --------------------------------
        const monitors = [];
        const monitorCount = randInt(16, 22);
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
            // Probe the floor in front of the desk (the desk's own wall is right behind it)
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

        progress('Stocking camera batteries...', 0.88);
        await nextFrame();
        const pickups = [
            ...Facility.scatter(shell, 'battery', randInt(8, 10), 3),
            ...Facility.scatter(shell, 'matches', 2, 6)
        ];
        const notes = Facility.addNotes(scene, shell, Lore.level4);
        const exits = Facility.addExitDoors(scene, shell);

        progress('Rewinding the tapes...', 0.95);
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

            update(dt, time, cam) {
                shell.update(dt, time, cam);
                staticTex.offset.set(Math.random(), Math.random());
                for (const m of monitors) {
                    if (m.dead) continue;
                    const n = Noise.value2(time * 3 + m.phase, m.phase, 256, 256);
                    m.glow.material.opacity = n < 0.2 ? 0.02 : 0.18;
                }
                Facility.animatePickups(pickups, dt, time);
                notes.update(dt, time, cam);
                exits.update(time);
            },
            nearLight: shell.nearLight
        };
    }

    return { build };
})();
