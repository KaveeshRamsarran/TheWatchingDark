// THE WATCHING DARK - Level 5: The Watching Dark
// Not a maze any more: one long descent through living tissue, spiralling in toward the heart.
// The walls breathe and pulse with a heartbeat that quickens as you go deeper. Eyes grow out
// of the flesh - they stare at you, and roll away when you look back. Arms reach from the
// walls. A woman stands in the corridors with her back to you. Every so often the great eye
// above blinks, the world goes dark, and when it opens again something has changed.
// At the heart there is no door. There is only the eye, waiting for you to look back.
'use strict';

const Level5 = (() => {
    const WALL_H = 6.4;
    const EYE_SCALE = 6.5;

    const SHIFT_MESSAGES = [
        'YOU LEFT HER', 'SHE IS STILL LOOKING FOR YOU', 'ELLIE', 'WHY DID YOU COME DOWN',
        'IT KNOWS YOUR NAME', 'YOU WERE ALWAYS HERE', 'LOOK UP', "DON'T TURN AROUND",
        'WE SEE YOU', 'STAY', 'OPEN YOUR EYES', 'MUM?', 'YOU ARE INSIDE IT', 'NOBODY LEAVES'
    ];

    // Mark each wall vertex that may move (face interiors) in the color attribute, so the
    // walls can breathe without their corners tearing open.
    function addFlex(geo) {
        geo.computeBoundingBox();
        const b = geo.boundingBox, p = geo.attributes.position;
        const col = new Float32Array(p.count * 3);
        const near = (v, a) => Math.abs(v - a) < 1e-3;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            let n = 0;
            if (near(x, b.min.x) || near(x, b.max.x)) n++;
            if (near(y, b.min.y) || near(y, b.max.y)) n++;
            if (near(z, b.min.z) || near(z, b.max.z)) n++;
            col[i * 3] = n === 1 ? 1 : 0;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }

    async function build(scene, quality, progress) {
        const C = World.CELL, S = World.SIZE, T = Facility.WALL_T;
        const HC = Math.floor(S / 2);
        const uniforms = { uTime: { value: 0 }, uBeat: { value: 0 } };
        // Mirror of fleshWave() in the shader: how far the wall surface has swollen at p
        const K1 = new THREE.Vector3(0.31, 0.55, 0.27), K2 = new THREE.Vector3(0.13, 0.2, -0.17), K3 = new THREE.Vector3(0.21, 0.4, -0.33);
        const wallWave = (p) => {
            const t = uniforms.uTime.value, b = uniforms.uBeat.value;
            return 0.17 * Math.sin(t * 0.9 + p.dot(K1)) + 0.11 * Math.sin(t * 0.37 + p.dot(K2)) +
                0.36 * b * (0.6 + 0.4 * Math.sin(p.dot(K3) + 1.7));
        };
        const ride = new THREE.Vector3();

        // Flesh that breathes: surfaces swell along their normals with slow waves and heave
        // hard on every heartbeat. The wave is a function of WORLD position, so walls, floor
        // and the things pushing out of them all move together. The lighting normal is bent by
        // the wave's slope too, so the swelling catches the flashlight.
        //   flex 'attr'  - walls: color.r marks the vertices allowed to move (keeps corners sealed)
        //   flex 'const' - floor and reliefs: everything moves (their vertex colours are occlusion)
        const breathing = (mat, flex = 'attr', amp = 1, key = 'wall') => {
            mat.onBeforeCompile = (sh) => {
                sh.uniforms.uTime = uniforms.uTime;
                sh.uniforms.uBeat = uniforms.uBeat;
                const F = flex === 'attr' ? `color.r * ${amp.toFixed(3)}` : amp.toFixed(3);
                sh.vertexShader = 'uniform float uTime;\nuniform float uBeat;\n' +
                    (flex === 'attr' ? 'attribute vec3 color;\n' : '') + `
                    float fleshWave(vec3 wp, out vec3 grad) {
                        vec3 k1 = vec3(0.31, 0.55, 0.27), k2 = vec3(0.13, 0.2, -0.17), k3 = vec3(0.21, 0.4, -0.33);
                        float p1 = uTime * 0.9 + dot(wp, k1);
                        float p2 = uTime * 0.37 + dot(wp, k2);
                        float p3 = dot(wp, k3) + 1.7;
                        float shape = 0.6 + 0.4 * sin(p3);
                        grad = 0.17 * cos(p1) * k1 + 0.11 * cos(p2) * k2 + 0.36 * uBeat * 0.4 * cos(p3) * k3;
                        return 0.17 * sin(p1) + 0.11 * sin(p2) + 0.36 * uBeat * shape;
                    }\n` +
                    sh.vertexShader
                        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
                        vec3 fleshN = objectNormal;
                        vec3 fleshGrad;
                        float fleshD = fleshWave((modelMatrix * vec4(position, 1.0)).xyz, fleshGrad) * ${F};
                        fleshGrad *= ${F};
                        vec3 fleshG = vec3(dot(modelMatrix[0].xyz, fleshGrad), dot(modelMatrix[1].xyz, fleshGrad), dot(modelMatrix[2].xyz, fleshGrad));
                        objectNormal = normalize(objectNormal - (fleshG - dot(fleshG, objectNormal) * objectNormal) * 1.4);`)
                        .replace('#include <begin_vertex>', `#include <begin_vertex>
                        transformed += fleshN * fleshD;`);
            };
            mat.customProgramCacheKey = () => 'flesh-' + key;
            return mat;
        };
        let wallMat = null, floorMat = null;

        const shell = await Facility.build(scene, quality, progress, {
            generate: World.generateJourney,
            wallH: WALL_H,
            fogColor: 0x040102,
            fogDensity: 0.06,
            ceiling: false,
            trims: false,
            pipeChance: 0,
            columnChance: 0,
            lampStyle: 'none',
            wallDetail: quality.lite ? [4, 4] : [7, 6],
            floorSegments: quality.lite ? 56 : 110,
            wallHook: addFlex,
            wallTexture: () => Textures.flesh(2, true),
            floorTexture: () => Textures.flesh(1, false),
            wallMaterial: (tex) => (wallMat = breathing(new THREE.MeshStandardMaterial({
                map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap,
                emissiveMap: tex.emissiveMap, emissive: 0xff2a1a, emissiveIntensity: 0.12,
                color: 0xc49494, roughness: 1, normalScale: new THREE.Vector2(1.8, 1.8)
            }))),
            floorMaterial: (rep) => (floorMat = breathing(new THREE.MeshStandardMaterial({
                map: rep.map, normalMap: rep.normalMap, roughnessMap: rep.roughnessMap,
                emissiveMap: rep.emissiveMap, emissive: 0xff2a1a, emissiveIntensity: 0.08,
                color: 0xa88282, roughness: 1, normalScale: new THREE.Vector2(1.5, 1.5)
            }), 'const', 0.25, 'floor')),
            decals: ['hand', 'hand', 'hand', 'eye', 'tally', 'text:LOOK BACK', "text:IT'S BREATHING", 'text:INSIDE'],
            decalCount: 46,
            messages: {
                carve: 'Descending...',
                walls: 'Growing the walls...',
                floor: 'Something is breathing...',
                raise: 'Tearing away the sky...',
                lamps: 'There is no light here...'
            }
        });

        progress('Opening the eyes...', 0.8);
        await nextFrame();

        const exitField = World.fieldFrom(HC, HC);
        let maxField = 1;
        for (let i = 0; i < exitField.length; i++) maxField = Math.max(maxField, exitField[i]);
        const heart = new THREE.Vector3(HC * C, 0, HC * C);
        const fieldAt = (x, z) => {
            const cx = World.cellX(x), cz = World.cellX(z);
            return World.inBounds(cx, cz) ? exitField[cx * S + cz] : -1;
        };

        // ---- Wall faces we can grow things on ----------------------------------------------
        const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), NEG_Y = new THREE.Vector3(0, -1, 0);
        const faces = [];
        for (const seg of shell.wallSegments) {
            for (const side of seg.sides) {
                const n = seg.horizontal ? new THREE.Vector3(0, 0, side) : new THREE.Vector3(side, 0, 0);
                const t = seg.horizontal ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
                const p = new THREE.Vector3(seg.x + n.x * T / 2, 0, seg.z + n.z * T / 2);
                const inside = World.cellX(p.x + n.x), insideZ = World.cellX(p.z + n.z);
                const heartDist = Math.hypot(inside - HC, insideZ - HC);
                faces.push({ p, n, t, heart: heartDist <= 3.6 });
            }
        }
        const heartFaces = faces.filter((f) => f.heart);
        const pathFaces = faces.filter((f) => !f.heart);

        // ---- Eyes in the walls (instanced) -------------------------------------------------
        const clusters = [];
        const eyes = [];
        const makeCluster = (f, count, big) => {
            const along = rand(-3, 3), y = rand(0.7, WALL_H - (big ? 1.2 : 1.8));
            const center = f.p.clone().addScaledVector(f.t, along).setY(y);
            const c = { center, n: f.n, shy: 0, wasShy: false, eyes: [], visible: false };
            const local = [];
            for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
                const r = Math.random() < (big ? 0.25 : 0.06) ? rand(0.38, 0.65) : rand(0.1, 0.3);
                const du = rand(-1.3, 1.3), dv = rand(-0.9, 0.9);
                if (Math.abs(along + du) > 3.6 || y + dv < r + 0.2 || y + dv > WALL_H - r - 0.2) continue;
                if (local.some((o) => Math.hypot(o.du - du, o.dv - dv) < (o.r + r) * 1.15)) continue;
                local.push({ du, dv, r });
                const pos = f.p.clone().addScaledVector(f.t, along + du).setY(y + dv).addScaledVector(f.n, r * 0.45);
                const e = {
                    pos, n: f.n, r, cluster: c, q: new THREE.Quaternion().setFromUnitVectors(Z, f.n),
                    jitter: new THREE.Vector3(), jitterT: 0
                };
                c.eyes.push(e);
                eyes.push(e);
                i++;
            }
            if (c.eyes.length) clusters.push(c);
        };
        const L = quality.lite;
        for (let i = 0; i < (L ? 48 : 75) && pathFaces.length; i++) makeCluster(pick(pathFaces), randInt(1, 6), false);
        for (let i = 0; i < (L ? 22 : 36) && heartFaces.length; i++) makeCluster(pick(heartFaces), randInt(3, 8), true);

        const eyeTex = Textures.eyeball();
        const eyeMesh = new THREE.InstancedMesh(
            new THREE.SphereGeometry(1, L ? 9 : 11, L ? 6 : 8),
            new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.15, emissive: 0xffffff, emissiveMap: eyeTex, emissiveIntensity: 0.05 }),
            Math.max(1, eyes.length)
        );
        // Swollen, wet lids of flesh around each eye
        const sockets = new THREE.InstancedMesh(
            new THREE.TorusGeometry(1, 0.2, L ? 4 : 5, L ? 9 : 12),
            new THREE.MeshStandardMaterial({ color: 0x4a1012, roughness: 0.3 }),
            Math.max(1, eyes.length)
        );
        eyeMesh.frustumCulled = false;
        sockets.frustumCulled = false;
        eyeMesh.count = sockets.count = eyes.length;
        const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), qTmp = new THREE.Quaternion();
        eyes.forEach((e, i) => {
            m4.compose(e.pos, e.q, sc.setScalar(e.r));
            eyeMesh.setMatrixAt(i, m4);
            qTmp.setFromUnitVectors(Z, e.n);
            m4.compose(e.pos.clone().addScaledVector(e.n, -e.r * 0.2), qTmp, sc.set(e.r * 0.98, e.r * 0.98, e.r * 1.1));
            sockets.setMatrixAt(i, m4);
        });
        shell.root.add(eyeMesh, sockets);

        // ---- Arms reaching out of the walls, and up out of the floor (instanced) -------------------
        let armGeo = Assets.ok ? Assets.part('flesh', 'WallArm') : null;
        if (!armGeo) {
            const upper = limbGeometry(0.06, 0.045, 0.85, 7);
            const fore = limbGeometry(0.045, 0.032, 0.8, 7);
            fore.rotateX(0.35);
            fore.translate(0, -0.85, 0);
            const palm = new THREE.BoxGeometry(0.085, 0.13, 0.035);
            palm.translate(0, -1.68, 0.27);
            const armParts = [upper, fore, palm];
            for (let f = 0; f < 4; f++) {
                const finger = limbGeometry(0.012, 0.005, 0.24, 5);
                finger.rotateZ((f - 1.5) * 0.18);
                finger.rotateX(0.5);
                finger.translate((f - 1.5) * 0.022, -1.74, 0.3);
                armParts.push(finger);
            }
            armGeo = mergeGeometries(armParts);
            armParts.forEach((g) => g.dispose());
        }
        const skin = Textures.skin();
        const arms = [];
        // Things already grown on the walls, so the new ones don't pile on top of each other
        const taken = [];
        const free = (p, r) => taken.every((t) => t.p.distanceTo(p) > t.r + r);
        const claim = (p, r) => taken.push({ p: p.clone(), r });
        for (let i = 0, tries = 0; i < (L ? 36 : 60) && tries < 600 && pathFaces.length; tries++) {
            const f = pick(pathFaces);
            const base = f.p.clone().addScaledVector(f.t, rand(-3.2, 3.2)).setY(rand(0.9, 2.3)).addScaledVector(f.n, -0.05);
            if (!free(base, 0.5)) continue;
            claim(base, 0.5);
            const dir = new THREE.Vector3().copy(f.n).multiplyScalar(0.8)
                .addScaledVector(NEG_Y, rand(0.1, 0.6)).addScaledVector(f.t, rand(-0.5, 0.5)).normalize();
            arms.push({ base, n: f.n, rest: dir, dir: dir.clone(), q: new THREE.Quaternion().setFromUnitVectors(NEG_Y, dir), phase: Math.random() * 10, scale: rand(0.8, 1.1) });
            i++;
        }
        // From the floor: hands clawing up beside the path
        const openCells = [];
        for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) if (!World.isSolid(x, z) && Math.hypot(x, z) > 3) openCells.push({ x, z });
        for (let i = 0; i < (L ? 10 : 16) && openCells.length; i++) {
            const c = pick(openCells);
            const base = new THREE.Vector3(c.x * C + rand(-2.8, 2.8), -0.08, c.z * C + rand(-2.8, 2.8));
            if (World.overlaps(base.x, base.z, 0.6)) continue;
            const dir = new THREE.Vector3(rand(-0.35, 0.35), 1, rand(-0.35, 0.35)).normalize();
            arms.push({ base, n: UP.clone(), rest: dir, dir: dir.clone(), q: new THREE.Quaternion().setFromUnitVectors(NEG_Y, dir), phase: Math.random() * 10, scale: rand(0.55, 0.8) });
        }
        const armMesh = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({
            color: 0x9c8c86, roughness: 0.55, normalMap: skin.normalMap, normalScale: new THREE.Vector2(0.8, 0.8)
        }), Math.max(1, arms.length));
        armMesh.count = arms.length;
        armMesh.frustumCulled = false;
        armMesh.castShadow = true;
        arms.forEach((a, i) => {
            m4.compose(a.base, a.q, sc.setScalar(a.scale));
            armMesh.setMatrixAt(i, m4);
        });
        shell.root.add(armMesh);

        // ---- Faces and whole bodies pressing out through the flesh -------------------------------
        for (const c of clusters) claim(c.center, 0.9);
        const P = (n) => (Assets.ok ? Assets.part('flesh', n) : null);
        const faceGeo = P('WallFace'), bodyGeo = P('WallBody');
        const reliefs = [];
        const wallTex = Textures.flesh(2, true);
        // Skin stretched thin over whatever is pushing through: paler, smoother, wet
        const reliefMat = faceGeo ? breathing(new THREE.MeshStandardMaterial({
            map: wallTex.map, normalMap: wallTex.normalMap, emissiveMap: wallTex.emissiveMap,
            emissive: 0xff2a1a, emissiveIntensity: 0.03,
            color: 0xf2c6bc, roughness: 0.38, vertexColors: true, normalScale: new THREE.Vector2(0.45, 0.45)
        }), 'const', 1, 'relief') : null;
        const onWall = (f, along, y, out) => {
            const pos = f.p.clone().addScaledVector(f.t, along).setY(y).addScaledVector(f.n, out);
            return pos;
        };
        const addRelief = (geo, f, scale, halfW, y, kind) => {
            const along = rand(-(3.6 - halfW * scale), 3.6 - halfW * scale);
            const pos = onWall(f, along, y, -0.03);
            if (!free(pos, halfW * scale + 0.2)) return false;
            claim(pos, halfW * scale + 0.2);
            const m = new THREE.Mesh(geo, reliefMat);
            m.position.copy(pos);
            m.lookAt(tmpV.copy(pos).add(f.n));
            m.scale.setScalar(scale);
            m.receiveShadow = true;
            shell.root.add(m);
            reliefs.push({ mesh: m, kind, scale, n: f.n, phase: Math.random() * 10, strain: 0, cry: rand(0, 6) });
            return true;
        };
        const tmpV = new THREE.Vector3();
        if (faceGeo && bodyGeo) {
            for (let i = 0, t = 0; i < (L ? 14 : 24) && t < 300; t++) if (addRelief(faceGeo, pick(pathFaces), rand(1.0, 1.6), 0.35, rand(1.1, 2.7), 'face')) i++;
            for (let i = 0, t = 0; i < (L ? 6 : 10) && t < 300 && heartFaces.length; t++) if (addRelief(faceGeo, pick(heartFaces), rand(1.3, 2.0), 0.35, rand(1.4, 3.6), 'face')) i++;
            for (let i = 0, t = 0; i < (L ? 6 : 10) && t < 300; t++) { const s = rand(1.0, 1.25); if (addRelief(bodyGeo, pick(pathFaces), s, 0.65, 1.25 * s, 'body')) i++; }
            for (let i = 0, t = 0; i < (L ? 4 : 6) && t < 300 && heartFaces.length; t++) { const s = rand(1.1, 1.5); if (addRelief(bodyGeo, pick(heartFaces), s, 0.65, 1.25 * s, 'body')) i++; }
        }

        progress('She is waiting...', 0.86);
        await nextFrame();

        // ---- Pickups and notes -----------------------------------------------------------
        const pickups = [
            ...Facility.scatter(shell, 'battery', randInt(7, 8), 4),
            ...Facility.scatter(shell, 'matches', 3, 6),
            ...Facility.scatter(shell, 'relic', 1, 12)
        ];
        const notes = Facility.addNotes(scene, shell, Lore.level5);

        // ---- The eye above, and the eye below -------------------------------------------
        const eye = Models.createEye();
        eye.group.scale.setScalar(EYE_SCALE);
        eye.group.position.set(0, 40, 0);
        scene.add(eye.group);
        // A second great eye sunk into the floor of the heart, gazing up at the first
        const floorEye = new THREE.Mesh(
            new THREE.SphereGeometry(2.3, 32, 20),
            new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.15, emissive: 0xffffff, emissiveMap: eyeTex, emissiveIntensity: 0.035 })
        );
        floorEye.position.set(heart.x, -1.2, heart.z);
        floorEye.rotation.x = -Math.PI / 2;
        const floorLook = new THREE.Vector3(), floorQ = new THREE.Quaternion();
        shell.root.add(floorEye);
        World.addCircle(heart.x, heart.z, 1.9, false);
        const heartLight = new THREE.PointLight(0xff2a14, 0, 30, 1.5);
        heartLight.position.set(heart.x, 6, heart.z);
        scene.add(heartLight);
        const eyeLight = new THREE.DirectionalLight(0xff3020, 0.045);
        eyeLight.position.set(0, 1, 0);
        scene.add(eyeLight);

        // ---- The woman ----------------------------------------------------------------------
        const figure = Models.createFigure();
        figure.root.visible = false;
        scene.add(figure.root);
        const chorus = [];
        for (let i = 0; i < 8; i++) {
            const f = Models.createFigure();
            f.root.visible = false;
            scene.add(f.root);
            chorus.push(f);
        }

        progress('It opens...', 0.95);
        await nextFrame();

        // ---- State --------------------------------------------------------------------------
        const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camDir = new THREE.Vector3();
        const lookQ = new THREE.Quaternion(), lookM = new THREE.Matrix4();
        const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), sphere = new THREE.Sphere();
        const center = new THREE.Vector3((S - 1) * C / 2, 0, (S - 1) * C / 2);
        const shiftDecals = [];
        let smallBlink = rand(5, 10), smallBlinkT = 0;
        let shiftTimer = rand(40, 55), shift = null;  // the great blink
        let beatTimer = 1.5, whisperTimer = rand(6, 12);
        let fig = { mode: 'idle', next: rand(16, 24), t: 0, seen: 0, lit: 0, lost: 0, wasSeen: false };
        let inHeart = false, gaze = 0, bed = null;
        const climax = { started: false };

        const level = {
            id: 5,
            name: 'THE WATCHING DARK',
            root: shell.root,
            ownedTextures: shell.owned,
            spawn: new THREE.Vector3(0, 0, 0), spawnYaw: -Math.PI * 0.75,
            lamps: shell.lamps, pickups, notes: notes.list,
            exits: [{ cell: { x: HC, z: HC }, pos: heart.clone().setY(1.6) }],
            manualExit: true,
            exitStyle: 'heart',
            flesh: true,
            wallHeight: WALL_H,
            hasCeiling: false,
            flashlightAllowed: true,
            // Signals read by the main loop
            stare: 0,          // 0..1 how directly you look at the great eye
            stareDrain: 24,    // sanity per second while staring
            watched: 0,        // 0..1 how many wall eyes are staring at you
            grabbed: false,    // an arm has hold of you
            blackout: 0,       // the great blink
            flash: 0,          // request a red flash
            gaze: 0,           // final confrontation progress
            objective: null,   // replaces the HUD objective when set
            completed: false,
            // For debugging and automated tests
            debugThings: { arms, reliefs, clusters, figure },

            update(dt, time, cam, player) {
                shell.update(dt, time, cam);
                Facility.animatePickups(pickups, dt, time);
                notes.update(dt, time, cam);
                if (!bed) bed = AudioSys.startBed('flesh');
                uniforms.uTime.value = time;

                cam.getWorldDirection(camDir);
                cam.updateMatrixWorld();
                projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
                frustum.setFromProjectionMatrix(projScreen);
                const pcx = World.cellX(player.pos.x), pcz = World.cellX(player.pos.z);
                World.updateFlow(pcx, pcz);
                const myField = fieldAt(player.pos.x, player.pos.z);
                const depth = myField >= 0 ? 1 - clamp(myField / maxField, 0, 1) : 0;
                const sanity = player.sanity;

                // ---- Heartbeat: slow at the top, racing near the heart ----------------------
                const bpm = inHeart ? 100 + gaze * 70 : lerp(42, 92, depth);
                beatTimer -= dt;
                if (beatTimer <= 0) {
                    beatTimer = 60 / bpm;
                    uniforms.uBeat.value = 1;
                    AudioSys.thump(0.3 + depth * 0.45 + gaze * 0.3);
                }
                uniforms.uBeat.value = Math.max(0, uniforms.uBeat.value - dt * 2.4);
                // The veins stay dark between beats and flare red on each one
                const glow = 0.03 + uniforms.uBeat.value * (0.28 + depth * 0.36) + depth * 0.05;
                if (wallMat) wallMat.emissiveIntensity = glow;
                if (floorMat) floorMat.emissiveIntensity = glow * 0.45;
                if (reliefMat) reliefMat.emissiveIntensity = glow * 0.35;
                if (bed) bed.set(inHeart ? 0.3 + gaze * 0.7 : depth * 0.25);

                // ---- Whispers, more often as your mind goes --------------------------------
                whisperTimer -= dt;
                if (whisperTimer <= 0) {
                    whisperTimer = rand(5, 14) * (0.35 + sanity / 150) * (inHeart ? 0.4 : 1);
                    AudioSys.whisper(rand(-1, 1), 0.35 + (1 - sanity / 100) * 0.5);
                }

                // ---- The great eye ------------------------------------------------------------
                if (inHeart) tmp.set(heart.x, 24 - gaze * 6, heart.z);
                else {
                    tmp.subVectors(center, cam.position).setY(0);
                    if (tmp.lengthSq() < 1) tmp.set(1, 0, 1);
                    tmp.normalize().multiplyScalar(17).add(cam.position).setY(36);
                }
                eye.group.position.lerp(tmp, 1 - Math.exp(-(inHeart ? 0.6 : 0.35) * dt));
                lookM.lookAt(cam.position, eye.group.position, UP);
                lookQ.setFromRotationMatrix(lookM);
                eye.group.quaternion.slerp(lookQ, 1 - Math.exp(-1.5 * dt));

                // Small blinks; and every so often the great blink that shifts the world
                let open = 1;
                smallBlink -= dt;
                if (smallBlink <= 0) { smallBlinkT = 0.28; smallBlink = rand(6, 14); }
                if (smallBlinkT > 0) { smallBlinkT -= dt; open = Math.abs(smallBlinkT / 0.28 - 0.5) * 2; }
                if (!inHeart && !shift) {
                    shiftTimer -= dt;
                    if (shiftTimer <= 0) {
                        shift = { t: 0 };
                        AudioSys.thump(1);
                        AudioSys.sting(0.35);
                    }
                }
                level.blackout = 0;
                if (shift) {
                    shift.t += dt;
                    const t = shift.t;
                    // close 0.6s, dark 0.9s, open 0.7s
                    const closed = t < 0.6 ? t / 0.6 : t < 1.5 ? 1 : Math.max(0, 1 - (t - 1.5) / 0.7);
                    open = Math.min(open, 1 - closed);
                    level.blackout = t < 0.6 ? closed * 0.9 : t < 1.5 ? 1 : closed * 0.9;
                    if (t >= 0.9 && !shift.done) {
                        shift.done = true;
                        realityShift(cam, player);
                    }
                    if (t > 2.2) { shift = null; shiftTimer = rand(45, 75); }
                }
                eye.setOpen(open * (inHeart ? 1.05 : 0.92 + Math.sin(time * 0.5) * 0.08));
                eye.halo.material.opacity = 0.18 + Math.sin(time * 0.8) * 0.05 + gaze * 0.4;

                toEye(cam);
                const dot = camDir.dot(tmp2);
                level.stare = smoothstep(0.93, 0.985, dot) * open;

                // ---- Wall eyes: they stare, and look away when you look back ----------------------
                updateEyes(dt, time, cam);

                // ---- Arms, and everything else in the walls ------------------------------------
                updateArms(dt, time, player);
                updateWallThings(dt, time, cam, player);

                // The eye in the floor of the heart follows you as you come in
                if (floorEye.position.distanceTo(cam.position) < 40) {
                    floorLook.subVectors(cam.position, floorEye.position).setY(0).normalize();
                    floorLook.y = 1.3;
                    floorQ.setFromUnitVectors(Z, floorLook.normalize());
                    floorEye.quaternion.slerp(floorQ, 1 - Math.exp(-1.6 * dt));
                }

                // ---- The woman ------------------------------------------------------------------
                if (!inHeart) updateFigure(dt, cam, player, myField);

                // ---- The heart ----------------------------------------------------------------
                const hd = Math.hypot(player.pos.x - heart.x, player.pos.z - heart.z);
                if (!inHeart && hd < 3.2 * C && myField >= 0 && myField <= 4) {
                    inHeart = true;
                    hideFigure();
                    level.objective = 'Look at it.';
                    AudioSys.sting(0.6);
                    level.flash = 0.25;
                }
                if (inHeart) updateHeart(dt, time, cam, player);
            },
            nearLight: shell.nearLight
        };

        function toEye(cam) {
            tmp2.subVectors(eye.group.position, cam.position).normalize();
        }

        // Write a few new messages on the walls near you and wake every eye
        function realityShift(cam, player) {
            const near = faces.filter((f) => {
                const dx = f.p.x - player.pos.x, dz = f.p.z - player.pos.z;
                const d = Math.hypot(dx, dz);
                return d > 2 && d < 13 && (f.n.x * -dx + f.n.z * -dz) > 0 &&
                    World.lineOfSight(player.pos.x, player.pos.z, f.p.x + f.n.x * 0.3, f.p.z + f.n.z * 0.3);
            });
            for (let i = 0; i < 3 && near.length; i++) {
                const f = near.splice(randInt(0, near.length - 1), 1)[0];
                const mat = new THREE.MeshStandardMaterial({
                    map: Textures.decal('text:' + pick(SHIFT_MESSAGES)), transparent: true, depthWrite: false, roughness: 0.4,
                    polygonOffset: true, polygonOffsetFactor: -3
                });
                const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), mat);
                plane.position.copy(f.p).addScaledVector(f.t, rand(-2, 2)).setY(rand(1.6, 3.2)).addScaledVector(f.n, 0.03);
                plane.lookAt(tmp.copy(plane.position).add(f.n));
                shell.root.add(plane);
                shiftDecals.push(plane);
                if (shiftDecals.length > 15) {
                    const old = shiftDecals.shift();
                    shell.root.remove(old);
                    old.geometry.dispose();
                    old.material.dispose();
                }
            }
            for (const c of clusters) c.shy = 0;
            AudioSys.whisper(rand(-1, -0.4), 0.8);
            AudioSys.whisper(rand(0.4, 1), 0.8);
            const r = Math.random();
            if (r < 0.4) placeFigure('behind', cam, player);
            else if (r < 0.75) placeFigure('ahead', cam, player);
        }

        function inView(pos, y, radius, cam, maxDist) {
            if (pos.distanceTo(cam.position) > maxDist) return false;
            sphere.center.set(pos.x, y, pos.z);
            sphere.radius = radius;
            if (!frustum.intersectsSphere(sphere)) return false;
            return World.lineOfSight(cam.position.x, cam.position.z, pos.x, pos.z);
        }

        const dirT = new THREE.Vector3(), qT = new THREE.Quaternion();
        function updateEyes(dt, time, cam) {
            let staring = 0;
            const forced = inHeart || !!shift;
            for (const c of clusters) {
                const d = c.center.distanceTo(cam.position);
                c.visible = d < 32;
                if (!c.visible) continue;
                tmp.subVectors(c.center, cam.position);
                const facing = -(tmp.x * c.n.x + tmp.z * c.n.z) > 0.2;
                tmp.normalize();
                const looked = !forced && d < 17 && facing && camDir.dot(tmp) > 0.955 &&
                    World.lineOfSight(cam.position.x, cam.position.z, c.center.x + c.n.x * 0.3, c.center.z + c.n.z * 0.3);
                if (looked) c.shy = rand(1.3, 2.2);
                else c.shy = Math.max(0, c.shy - dt);
                const shy = c.shy > 0;
                if (c.wasShy && !shy && d < 10 && facing) {
                    tmp.subVectors(c.center, cam.position).normalize();
                    AudioSys.flick(tmp.x * -camDir.z + tmp.z * camDir.x, 1 - d / 10);
                }
                c.wasShy = shy;
                if (!shy && facing && d < 11) staring += c.eyes.length;
            }
            level.watched = Math.min(1, staring / 14);

            let dirty = false;
            for (let i = 0; i < eyes.length; i++) {
                const e = eyes[i];
                const c = e.cluster;
                if (!c.visible) continue;
                e.jitterT -= dt;
                if (e.jitterT <= 0) {
                    e.jitterT = rand(0.2, 1.4);
                    e.jitter.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.12);
                }
                if (c.shy > 0) {
                    // Rolled back: only the white shows
                    dirT.copy(UP).addScaledVector(e.n, 0.25).add(e.jitter).normalize();
                } else {
                    dirT.subVectors(cam.position, e.pos).normalize().addScaledVector(e.jitter, 0.4);
                    const fd = dirT.dot(e.n);
                    if (fd < 0.2) dirT.addScaledVector(e.n, 0.2 - fd);
                    dirT.normalize();
                }
                qT.setFromUnitVectors(Z, dirT);
                e.q.slerp(qT, 1 - Math.exp(-(c.shy > 0 ? 9 : 16) * dt));
                const lift = wallWave(e.pos);
                m4.compose(ride.copy(e.pos).addScaledVector(e.n, lift), e.q, sc.setScalar(e.r));
                eyeMesh.setMatrixAt(i, m4);
                qTmp.setFromUnitVectors(Z, e.n);
                m4.compose(ride.copy(e.pos).addScaledVector(e.n, lift - e.r * 0.2), qTmp, sc.set(e.r * 0.98, e.r * 0.98, e.r * 1.1));
                sockets.setMatrixAt(i, m4);
                dirty = true;
            }
            if (dirty) { eyeMesh.instanceMatrix.needsUpdate = true; sockets.instanceMatrix.needsUpdate = true; }
        }

        const reach = new THREE.Vector3();
        function updateArms(dt, time, player) {
            let grabbed = false, dirty = false;
            const chest = tmp.set(player.pos.x, 1.2, player.pos.z);
            for (let i = 0; i < arms.length; i++) {
                const a = arms[i];
                const d = Math.hypot(a.base.x - chest.x, a.base.z - chest.z);
                if (d > 26) continue;
                if (d < 2.8) {
                    // It reaches for you
                    reach.subVectors(chest, a.base).normalize();
                    if (reach.dot(a.n) < 0.1) reach.addScaledVector(a.n, 0.1 - reach.dot(a.n)).normalize();
                    a.dir.lerp(reach, 1 - Math.exp(-5 * dt)).normalize();
                    if (d < 2.1) grabbed = true;
                } else {
                    reach.copy(a.rest);
                    reach.x += Math.sin(time * 0.7 + a.phase) * 0.12;
                    reach.y += Math.sin(time * 0.9 + a.phase * 1.3) * 0.1;
                    reach.z += Math.cos(time * 0.6 + a.phase) * 0.12;
                    a.dir.lerp(reach.normalize(), 1 - Math.exp(-2 * dt)).normalize();
                }
                a.q.setFromUnitVectors(NEG_Y, a.dir);
                m4.compose(ride.copy(a.base).addScaledVector(a.n, wallWave(a.base) * (a.n.y > 0.5 ? 0.25 : 1)), a.q, sc.setScalar(a.scale));
                armMesh.setMatrixAt(i, m4);
                dirty = true;
            }
            if (dirty) armMesh.instanceMatrix.needsUpdate = true;
            if (grabbed && !level.grabbed) AudioSys.squelch(0.8);
            level.grabbed = grabbed;
        }

        // Faces and bodies strain out toward you as you pass, and cry out through the flesh.
        function updateWallThings(dt, time, cam, player) {
            for (const r of reliefs) {
                const p = r.mesh.position;
                const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
                if (d > 30) continue;
                const want = d < 7 ? 1 - d / 7 : 0;
                r.strain = damp(r.strain, want, want > r.strain ? 1.8 : 0.6, dt);
                const base = r.kind === 'face' ? 0.85 + 0.22 * Math.sin(time * 0.8 + r.phase) : 0.8 + 0.18 * Math.sin(time * 0.5 + r.phase);
                r.mesh.scale.z = r.scale * (base + r.strain * (r.kind === 'face' ? 0.7 : 0.55));
                r.cry -= dt;
                if (r.strain > 0.35 && r.cry <= 0) {
                    r.cry = rand(7, 14);
                    tmp.subVectors(p, cam.position).normalize();
                    const pan = tmp.x * -camDir.z + tmp.z * camDir.x;
                    // Muffled, as if from the other side of the skin
                    if (Math.random() < 0.6) AudioSys.wail(0.45 + r.strain * 0.4, pan, 0.75);
                    else AudioSys.whisper(pan, 0.7, randInt(5, 9));
                }
            }
        }

        // ---- The woman ----------------------------------------------------------------------
        function hideFigure() {
            figure.root.visible = false;
            fig = { mode: 'idle', next: rand(26, 48), t: 0, seen: 0, lit: 0, lost: 0, wasSeen: false };
        }

        function placeFigure(mode, cam, player) {
            const pcx = World.cellX(player.pos.x), pcz = World.cellX(player.pos.z);
            const myField = fieldAt(player.pos.x, player.pos.z);
            cam.getWorldDirection(camDir);
            let best = null, bestScore = -Infinity;
            for (let x = pcx - 7; x <= pcx + 7; x++) {
                for (let z = pcz - 7; z <= pcz + 7; z++) {
                    if (!World.inBounds(x, z) || World.isSolid(x, z)) continue;
                    const pd = World.pathDist(x, z);
                    const px = x * C, pz = z * C;
                    const dist = Math.hypot(px - player.pos.x, pz - player.pos.z);
                    if (!World.lineOfSight(player.pos.x, player.pos.z, px, pz)) continue;
                    if (mode === 'ahead') {
                        if (pd < 3 || pd > 6 || exitField[x * S + z] >= myField) continue;
                        if (pd > bestScore) { bestScore = pd; best = { x: px, z: pz }; }
                    } else {
                        if (pd < 1 || pd > 2 || dist < 4) continue;
                        const behind = -((px - player.pos.x) * camDir.x + (pz - player.pos.z) * camDir.z) / dist;
                        if (behind < 0.4) continue;
                        if (behind > bestScore) { bestScore = behind; best = { x: px, z: pz }; }
                    }
                }
            }
            if (!best) return false;
            const x = best.x + rand(-1, 1), z = best.z + rand(-1, 1);
            figure.root.position.set(x, 0, z);
            const away = Math.atan2(x - player.pos.x, z - player.pos.z);
            figure.root.rotation.y = mode === 'ahead' ? away : away + Math.PI;
            figure.headPivot.rotation.y = 0;
            figure.root.visible = true;
            fig = { mode, next: 0, t: 0, seen: 0, lit: 0, lost: 0, wasSeen: false };
            if (mode === 'behind') {
                tmp.set(x - cam.position.x, 0, z - cam.position.z).normalize();
                AudioSys.whisper(tmp.x * -camDir.z + tmp.z * camDir.x, 0.9, 5);
            }
            return true;
        }

        function updateFigure(dt, cam, player) {
            if (fig.mode === 'idle') {
                fig.next -= dt;
                if (fig.next <= 0 && !shift) {
                    if (!placeFigure(Math.random() < 0.7 ? 'ahead' : 'behind', cam, player)) fig.next = 5;
                }
                return;
            }
            fig.t += dt;
            const pos = figure.root.position;
            const d = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
            const seen = inView(pos, 1.0, 0.9, cam, 34);
            if (seen) { fig.seen += dt; fig.wasSeen = true; fig.lost = 0; } else if (fig.wasSeen) fig.lost += dt;
            tmp.subVectors(pos, cam.position).normalize();
            const lit = seen && player.flashlightOn && player.battery > 0 && camDir.dot(tmp) > 0.9 && d < 20;
            if (lit) fig.lit += dt;

            if (fig.mode === 'ahead') {
                // As you come closer, her head turns - just a little - toward you
                if (d < 12) figure.headPivot.rotation.y = damp(figure.headPivot.rotation.y, 0.7, 0.6, dt);
                if (d < 6.5 || fig.lit > 1.4 || fig.seen > 5 || fig.lost > 1.2 || fig.t > 30) {
                    if (d < 14) {
                        tmp.set(pos.x - cam.position.x, 0, pos.z - cam.position.z).normalize();
                        AudioSys.whisper(tmp.x * -camDir.z + tmp.z * camDir.x, 0.7, 4);
                    }
                    if (d < 6.5) AudioSys.staticBurst(0.8, 0);
                    hideFigure();
                }
            } else if (fig.seen > 0.18) {
                // You turned around
                AudioSys.sting(0.9);
                AudioSys.staticBurst(1, 0);
                level.flash = 0.35;
                hideFigure();
            } else if (fig.t > 10) {
                hideFigure();
            }
        }

        // ---- The heart: look at it --------------------------------------------------------
        function updateHeart(dt, time, cam, player) {
            level.stareDrain = 9;
            if (level.stare > 0.6) gaze = Math.min(1, gaze + dt / 6);
            else gaze = Math.max(0, gaze - dt * 0.1);
            level.gaze = gaze;
            heartLight.intensity = 0.6 + gaze * 2.5 + uniforms.uBeat.value * 1.5;
            // They gather while you stare, and stand closer every time you look down
            if (gaze > 0.04) {
                const r = lerp(20, 3.2, gaze);
                chorus.forEach((f, i) => {
                    const a = (i / chorus.length) * TAU + time * 0.02;
                    const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
                    f.root.visible = true;
                    f.root.position.set(x, 0, z);
                    f.root.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z);
                    f.headPivot.rotation.z = Math.sin(time * 0.3 + i) * 0.4 * gaze;
                });
            } else chorus.forEach((f) => { f.root.visible = false; });
            if (gaze >= 1 && !level.completed) {
                level.completed = true;
                chorus.forEach((f) => { f.root.visible = false; });
            }
        }

        return level;
    }

    return { build };
})();
