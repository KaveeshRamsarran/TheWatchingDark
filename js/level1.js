// THE WATCHING DARK - Level 1: The Maze
'use strict';

const Level1 = (() => {
    const WALL_H = 5.2;

    const WARNINGS = [
        "DON'T LOOK AWAY", 'THEY MOVE WHEN YOU BLINK', 'KEEP THE LIGHT', "IT'S BEHIND YOU",
        'NO WAY OUT', 'THEY WATCH', 'FEAR THE DARK', 'LIGHT A MATCH', 'DONT TURN AROUND', 'RUN'
    ];

    async function build(scene, quality, progress) {
        const shell = await Facility.build(scene, quality, progress, {
            wallH: WALL_H,
            decals: [...WARNINGS.map((w) => 'text:' + w), 'tally', 'hand', 'hand', 'eye', 'tally']
        });

        progress('Scattering supplies...', 0.85);
        await nextFrame();
        const pickups = [
            ...Facility.scatter(shell, 'battery', randInt(5, 7), 4),
            ...Facility.scatter(shell, 'matches', 3, 6)
        ];
        const notes = Facility.addNotes(scene, shell, Lore.level1);
        const exits = Facility.addExitDoors(scene, shell);

        progress('Something stirs...', 0.95);
        await nextFrame();

        return {
            id: 1,
            name: 'THE MAZE',
            root: shell.root,
            ownedTextures: shell.owned,
            spawn: new THREE.Vector3(0, 0, 0), spawnYaw: -Math.PI * 0.75,
            lamps: shell.lamps, pickups, notes: notes.list, exits: exits.list,
            wallHeight: WALL_H,
            hasCeiling: true,
            flashlightAllowed: true,

            update(dt, time, cam) {
                shell.update(dt, time, cam);
                Facility.animatePickups(pickups, dt, time);
                notes.update(dt, time, cam);
                exits.update(time);
            },
            nearLight: shell.nearLight
        };
    }

    return { build, createMatchbox: Facility.createMatchbox, WALL_H };
})();
