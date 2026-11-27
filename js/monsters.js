// THE WATCHING DARK - monster behaviour
// Watchers (I, V): move only while unseen, freeze when observed, flee from fire.
// Angels (II, V): the inverse - they charge while you look at them and freeze when ignored.
// Drowned (III): blind; they hunt only by sound and investigate where they last heard you.
// Unseen (IV): Watchers that only exist on camera - only the camcorder's gaze freezes them.
'use strict';

const Monsters = (() => {
    const watchers = [];
    const angels = [];
    const drowned = [];
    let footVoices = [];
    let stepSound = 'concrete';
    let chimes = null;
    let scene = null;
    let directorTimer = 0;
    let staticTimer = 0;
    let nearestHunterDist = Infinity;
    const angelLights = [];

    const tmp = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    const camDir = new THREE.Vector3();
    const camRight = new THREE.Vector3();

    // Film one of the Unseen for this long (seconds, in total) and it gets used to the lens:
    // from then on it walks at you even on camera, and it never stops
    const UNSEEN_WAKE = 3.5;

    const WATCHER_TYPES = [
        { speed: 3.7, detect: 4, hear: 7, scale: 0.86 },   // fast, less perceptive
        { speed: 2.5, detect: 6, hear: 10, scale: 1.22 },  // slow, very perceptive
        { speed: 3.1, detect: 5, hear: 8, scale: 1.0 }     // balanced
    ];

    function init(s) {
        scene = s;
        clear();
    }

    function clear() {
        watchers.length = 0;
        angels.length = 0;
        drowned.length = 0;
        for (const v of footVoices) v.destroy();
        footVoices = [];
        if (chimes) { chimes.destroy(); chimes = null; }
        angelLights.length = 0;
        directorTimer = 0;
        nearestHunterDist = Infinity;
    }

    // Their footsteps are the same as yours, only slower and heavier
    function setStepSound(key) { stepSound = key || 'concrete'; }
    function ensureFootVoices() {
        if (!footVoices.length) footVoices = [0, 1, 2].map(() => AudioSys.createVoice(stepSound, { rate: 0.82, pitch: false, base: 0.9 }));
    }
    // World position of a creature's sound (for directional audio)
    const at = (pos, y) => ({ x: pos.x, y, z: pos.z });

    // ---------------------------------------------------------------------------
    // Spawning
    // ---------------------------------------------------------------------------
    // A maze cell well away from the spawn and the exits
    function lairCell(taken, minPath) {
        const S = World.SIZE, C = World.CELL;
        for (let t = 0; t < 500; t++) {
            const x = randInt(1, S - 1), z = randInt(1, S - 1);
            const d = World.pathDist(x, z);
            if (d < minPath || taken.has(x * 100 + z)) continue;
            if (World.exits.some((e) => Math.abs(e.x - x) + Math.abs(e.z - z) < 3)) continue;
            if (World.overlaps(x * C, z * C, 0.8)) continue;
            taken.add(x * 100 + z);
            return { x, z };
        }
        return null;
    }

    function spawnWatchers(count, variant = 'watcher') {
        World.updateFlow(0, 0);
        const C = World.CELL;
        const taken = new Set();
        for (let i = 0; i < count; i++) {
            const cell = lairCell(taken, 9);
            if (!cell) continue;
            const type = WATCHER_TYPES[i % 3];
            const model = Models.createWatcher(type.scale * rand(0.95, 1.08), variant);
            model.root.position.set(cell.x * C + rand(-1, 1), 0, cell.z * C + rand(-1, 1));
            model.root.rotation.y = rand(0, TAU);
            scene.add(model.root);
            watchers.push({
                model, type, variant,
                pos: model.root.position,
                yaw: model.root.rotation.y,
                cell: { x: cell.x, z: cell.z },
                target: new THREE.Vector3(cell.x * C, 0, cell.z * C),
                prevCell: null,
                aware: 0,
                stalker: false,
                flee: 0,
                frozen: false,
                unseen: 0,
                speed: 0,
                dist: Infinity,
                stuck: 0,
                lastPos: new THREE.Vector3().copy(model.root.position),
                stuckTimer: 0,
                detour: 0,
                detourDir: new THREE.Vector3()
            });
        }
        ensureFootVoices();
    }

    // The Drowned make their own (procedural) wading sounds, so they need no footstep voices
    function spawnDrowned(count) {
        World.updateFlow(0, 0);
        const C = World.CELL, S = World.SIZE;
        const taken = new Set();
        for (let i = 0; i < count; i++) {
            const cell = lairCell(taken, 8);
            if (!cell) continue;
            const scale = rand(0.92, 1.12);
            const model = Models.createWatcher(scale, 'drowned');
            model.root.position.set(cell.x * C + rand(-1, 1), 0, cell.z * C + rand(-1, 1));
            model.root.rotation.y = rand(0, TAU);
            scene.add(model.root);
            drowned.push({
                model, scale,
                pos: model.root.position,
                yaw: model.root.rotation.y,
                cell: { x: cell.x, z: cell.z },
                target: new THREE.Vector3(cell.x * C, 0, cell.z * C),
                prevCell: null,
                mode: 'wander',          // wander | investigate | search
                goal: { x: -1, z: -1 },  // cell the last sound came from
                goalPos: new THREE.Vector3(),
                field: new Int16Array(S * S),
                heardAt: -99,
                listen: 0,
                search: 0,
                clickTimer: rand(0.5, 4),
                stepAcc: Math.random(),
                speed: 0,
                dist: Infinity,
                lastPos: new THREE.Vector3().copy(model.root.position),
                stuckTimer: 0,
                detour: 0,
                detourDir: new THREE.Vector3()
            });
        }
    }

    function spawnAngels(count, playerPos) {
        const S = World.SIZE, C = World.CELL;
        World.updateFlow(World.cellX(playerPos.x), World.cellX(playerPos.z));
        for (let i = 0; i < count; i++) {
            let p = null;
            for (let t = 0; t < 400; t++) {
                const x = randInt(3, S - 2) * C + rand(-2, 2), z = randInt(3, S - 2) * C + rand(-2, 2);
                if ((x - playerPos.x) ** 2 + (z - playerPos.z) ** 2 < 34 * 34) continue;
                if (World.pathDist(World.cellX(x), World.cellX(z)) < 0) continue; // sealed off
                if (World.overlaps(x, z, 1)) continue;
                if (angels.some((a) => (a.pos.x - x) ** 2 + (a.pos.z - z) ** 2 < 14 * 14)) continue;
                p = { x, z };
                break;
            }
            if (!p) continue;
            const model = Models.createAngel();
            model.root.position.set(p.x, 0, p.z);
            model.root.rotation.y = rand(0, TAU);
            model.setIdlePose();
            scene.add(model.root);
            angels.push({
                model, pos: model.root.position, yaw: model.root.rotation.y,
                charge: 0, looked: false, wasLooked: false, drifting: false, dist: Infinity, speed: 3.0
            });
        }
        for (let i = 0; i < 2; i++) {
            const l = new THREE.PointLight(0xffe2a0, 0, 14, 1.6);
            scene.add(l);
            angelLights.push(l);
        }
        chimes = AudioSys.createVoice('chimes');
    }

    // ---------------------------------------------------------------------------
    // Visibility
    // ---------------------------------------------------------------------------
    function inFrustum(frustum, pos, y, r) {
        tmp.set(pos.x, y, pos.z);
        sphere.set(tmp, r);
        return frustum.intersectsSphere(sphere);
    }

    // Line of sight to the body's centre or either shoulder
    function visibleFrom(cam, pos, halfWidth) {
        const cx = cam.position.x, cz = cam.position.z;
        if (World.lineOfSight(cx, cz, pos.x, pos.z)) return true;
        const dx = pos.x - cx, dz = pos.z - cz;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const px = -dz / len * halfWidth, pz = dx / len * halfWidth;
        return World.lineOfSight(cx, cz, pos.x + px, pos.z + pz) || World.lineOfSight(cx, cz, pos.x - px, pos.z - pz);
    }

    // ---------------------------------------------------------------------------
    // Watchers
    // ---------------------------------------------------------------------------
    function updateWatchers(dt, ctx) {
        const { cam, frustum, player, time } = ctx;
        const C = World.CELL;
        const pcx = World.cellX(cam.position.x), pcz = World.cellX(cam.position.z);
        World.updateFlow(pcx, pcz);
        cam.getWorldDirection(camDir);
        camRight.set(-camDir.z, 0, camDir.x).normalize();

        // Director: keep a growing number of Watchers stalking the player
        directorTimer -= dt;
        if (directorTimer <= 0) {
            directorTimer = 1;
            const desired = Math.min(ctx.maxHunters || 5, 2 + Math.floor(ctx.levelTime / 70));
            let active = watchers.filter((w) => w.aware > 0).length;
            if (active < desired) {
                const idle = watchers.filter((w) => w.aware <= 0 && w.flee <= 0)
                    .map((w) => ({ w, d: World.pathDist(w.cell.x, w.cell.z) }))
                    .filter((e) => e.d > 0)
                    .sort((a, b) => a.d - b.d);
                for (const e of idle) {
                    if (active >= desired) break;
                    e.w.aware = rand(18, 30);
                    e.w.stalker = true;
                    active++;
                }
            }
        }

        let nearestHunter = Infinity, nearestHunterAt = null;

        for (const w of watchers) {
            const dx = cam.position.x - w.pos.x, dz = cam.position.z - w.pos.z;
            w.dist = Math.sqrt(dx * dx + dz * dz);
            w.cell.x = World.cellX(w.pos.x);
            w.cell.z = World.cellX(w.pos.z);
            const pd = World.pathDist(w.cell.x, w.cell.z);

            // Observed? The Unseen only count as seen through the camcorder lens.
            const s = w.type.scale;
            const unseen = w.variant === 'unseen';
            const lensUp = (ctx.lens || 0) > 0.5;
            if (unseen) w.model.root.visible = lensUp;
            const seen = (!unseen || lensUp) && w.dist < 36 &&
                (inFrustum(frustum, w.pos, 1.5 * s, 0.75 * s) || inFrustum(frustum, w.pos, 2.4 * s, 0.6 * s)) &&
                visibleFrom(cam, w.pos, 0.35 * s);
            if (unseen) {
                // The camera holds them - but only for so long
                if (seen) w.filmed = (w.filmed || 0) + dt;
                else if (!w.woken) w.filmed = Math.max(0, (w.filmed || 0) - dt * 0.35);
                if (!w.woken && w.filmed > UNSEEN_WAKE) {
                    w.woken = true;
                    AudioSys.staticBurst(1, at(w.pos, 1.6));
                    AudioSys.sting(0.45);
                }
                // Getting used to the lens: its head starts to twitch on camera before it moves
                if (!w.woken && seen && w.filmed > UNSEEN_WAKE * 0.55 && w.model.pose && Math.random() < dt * 4) {
                    const k = rand(-0.5, 0.5);
                    w.model.pose('head', rand(-0.2, 0.2), k * 0.4, k);
                }
                if (w.woken && !ctx.hidden) {
                    w.aware = Math.max(w.aware, 60);
                    w.stalker = true;
                }
            }
            w.frozen = seen && !w.woken;

            // Fire scares Watchers off (the Unseen don't care)
            if (!unseen && player.matchLit && w.dist < 15) {
                w.flee = 5;
                w.aware = Math.max(w.aware, 6);
            }

            // Senses (nothing to sense while you're hidden)
            if (!ctx.hidden && pd >= 0 && pd <= w.type.detect) w.aware = Math.max(w.aware, 8);
            const heard = !ctx.hidden && player.noise > 30 && pd >= 0 && pd <= w.type.hear;
            if (ctx.hidden && w.woken) {
                // It comes to where you went in, stands outside the door... and gives up
                w.search = (w.search || 0) + dt;
                if (w.search > (w.giveUp || (w.giveUp = rand(7, 12)))) {
                    w.woken = false;
                    w.filmed = 0;
                    w.aware = 0;
                    w.stalker = false;
                    w.search = 0;
                    w.giveUp = 0;
                }
            } else if (!ctx.hidden) {
                w.search = 0;
            }
            if (heard) w.aware = Math.max(w.aware, 8);
            if (!seen) w.aware -= dt;
            if (w.aware <= 0) w.stalker = false;
            if (w.flee > 0) w.flee -= dt;

            if (w.frozen) {
                w.unseen = 0;
                w.speed = 0;
            } else if (seen) {
                // Awake, and on camera: it keeps walking at you - slowly, but it never stops
                w.unseen = 0;
                moveWatcher(w, dt, cam, pd, heard, clamp(0.32 + (w.filmed - UNSEEN_WAKE) * 0.025, 0.32, 0.6));
            } else {
                w.unseen += dt;
                moveWatcher(w, dt, cam, pd, heard);
            }

            // Facing: toward travel, or stare at the player while hunting
            let faceYaw = w.yaw;
            if (w.speed > 0.05) {
                const ty = w.aware > 0 && w.flee <= 0 && w.dist < 14 ? Math.atan2(dx, dz) : Math.atan2(w.target.x - w.pos.x, w.target.z - w.pos.z);
                faceYaw = ty;
            }
            if (!w.frozen) w.yaw = dampAngle(w.yaw, faceYaw, 8, dt);
            w.model.root.rotation.y = w.yaw;
            w.model.animate(dt, w.speed, w.frozen, time, w.aware > 0 && w.flee <= 0 ? 1 : 0, 1 - w.dist / 9);

            // Eyes burn brighter when hunting
            const hunting = w.aware > 0 && w.flee <= 0;
            const eye = hunting ? 4.5 + Math.sin(time * 6 + w.pos.x) * 1.2 : 1.6;
            w.model.eyeMat.emissiveIntensity = eye;
            const eyeFade = 1 - smoothstep(18, 34, w.dist);
            for (const g of w.model.eyeGlows) g.material.opacity = (hunting ? 0.95 : 0.45) * eyeFade;

            if (hunting && !w.frozen && w.dist < nearestHunter) {
                nearestHunter = w.dist;
                nearestHunterAt = at(w.pos, 1.6);
            }

            if (w.dist < 1.25 * s + 0.2 && !player.godMode && !ctx.hidden) {
                ctx.onKill(unseen ? 'unseen' : 'watcher', w);
                return;
            }
        }
        nearestHunterDist = nearestHunter;

        updateWatcherAudio(dt, cam);

        // Static crackle when something unseen is right behind you. The Unseen hiss from
        // further away - static is the only warning you get without the camera.
        const staticRange = watchers.length && watchers[0].variant === 'unseen' ? 11 : 7;
        staticTimer -= dt;
        if (nearestHunter < staticRange && staticTimer <= 0) {
            AudioSys.staticBurst(1 - nearestHunter / staticRange, nearestHunterAt);
            staticTimer = rand(0.5, 1.3) * (0.5 + nearestHunter / staticRange);
        }
    }

    const dir = new THREE.Vector3();
    function moveWatcher(w, dt, cam, pd, heard, speedScale = 1) {
        const C = World.CELL;
        const hunting = w.aware > 0;
        let speed;

        if (w.flee > 0) {
            const step = World.flowStep(w.cell.x, w.cell.z, true);
            if (step) w.target.set(step.x * C, 0, step.z * C);
            speed = w.type.speed * 2.6;
        } else if (hunting) {
            if (pd <= 1 && World.lineOfSight(w.pos.x, w.pos.z, cam.position.x, cam.position.z)) {
                w.target.set(cam.position.x, 0, cam.position.z);
            } else {
                const step = World.flowStep(w.cell.x, w.cell.z, false);
                if (step) w.target.set(step.x * C, 0, step.z * C);
                else w.target.set(cam.position.x, 0, cam.position.z);
            }
            speed = w.type.speed * Math.min(1.5, 1 + w.unseen * 0.1) * (heard ? 1.3 : 1);
        } else {
            // Wander between neighbouring cells
            const tdx = w.target.x - w.pos.x, tdz = w.target.z - w.pos.z;
            if (tdx * tdx + tdz * tdz < 1.0) {
                const options = World.openNeighbours(w.cell.x, w.cell.z)
                    .filter((n) => !w.prevCell || n.x !== w.prevCell.x || n.z !== w.prevCell.z);
                const next = options.length ? pick(options) : (w.prevCell || w.cell);
                w.prevCell = { x: w.cell.x, z: w.cell.z };
                w.target.set(next.x * C, 0, next.z * C);
            }
            speed = w.type.speed * 0.42;
        }
        speed *= speedScale;

        dir.set(w.target.x - w.pos.x, 0, w.target.z - w.pos.z);
        const len = dir.length();
        if (len > 0.001) dir.divideScalar(len);

        // Detour after getting stuck on a column
        if (w.detour > 0) {
            w.detour -= dt;
            dir.lerp(w.detourDir, 0.7).normalize();
        }

        // Keep apart from other Watchers
        for (const o of watchers) {
            if (o === w) continue;
            const ox = w.pos.x - o.pos.x, oz = w.pos.z - o.pos.z;
            const d2 = ox * ox + oz * oz;
            if (d2 < 2.2 && d2 > 0.0001) {
                const d = Math.sqrt(d2);
                dir.x += (ox / d) * 0.6;
                dir.z += (oz / d) * 0.6;
            }
        }
        dir.normalize();

        const stepLen = Math.min(speed * dt, len + 0.5);
        w.pos.x += dir.x * stepLen;
        w.pos.z += dir.z * stepLen;
        World.resolve(w.pos, 0.42 * w.type.scale);
        w.speed = speed;

        w.stuckTimer += dt;
        if (w.stuckTimer > 0.8) {
            const moved = w.pos.distanceTo(w.lastPos);
            if (moved < speed * 0.8 * 0.25) {
                w.detour = 0.9;
                w.detourDir.set(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
            }
            w.lastPos.copy(w.pos);
            w.stuckTimer = 0;
        }
    }

    function updateWatcherAudio(dt, cam) {
        // The three nearest moving Watchers get footstep voices, panned toward them
        const moving = watchers.filter((w) => !w.frozen && w.speed > 0.1 && w.dist < 40)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, footVoices.length);
        for (let i = 0; i < footVoices.length; i++) {
            const w = moving[i];
            const v = footVoices[i];
            if (!w) { v.set(0); continue; }
            const soft = w.variant === 'unseen' ? 0.45 : 1;
            const vol = Math.min(1, (1 - w.dist / 40) * 2.2) * (w.aware > 0 ? 1 : 0.6) * soft;
            v.el.playbackRate = clamp(w.speed / 3.2, 0.7, 1.6) * 0.82;
            v.set(vol, at(w.pos, 0.2));
        }
    }

    // ---------------------------------------------------------------------------
    // The Drowned: blind, hunting by sound alone
    // ---------------------------------------------------------------------------
    function updateDrowned(dt, ctx) {
        const { cam, player, time } = ctx;
        const C = World.CELL;
        const pcx = World.cellX(player.pos.x), pcz = World.cellX(player.pos.z);
        World.updateFlow(pcx, pcz);
        cam.getWorldDirection(camDir);
        camRight.set(-camDir.z, 0, camDir.x).normalize();

        // How far the player's noise carries, in world units along the maze: walking ~14,
        // sprinting ~55, crouching ~3 - only something standing right beside you notices.
        const reach = player.noise * 0.55;

        for (const d of drowned) {
            const dx = player.pos.x - d.pos.x, dz = player.pos.z - d.pos.z;
            d.dist = Math.sqrt(dx * dx + dz * dz);
            d.cell.x = World.cellX(d.pos.x);
            d.cell.z = World.cellX(d.pos.z);
            const pd = World.pathDist(d.cell.x, d.cell.z);
            const along = pd < 0 ? Infinity : pd <= 1 ? d.dist : pd * C;

            // They can't track you continuously: after hearing something they click and
            // listen again before updating their guess - stop moving and they lose you.
            d.listen = Math.max(0, d.listen - dt);
            const heard = d.listen <= 0 && player.noise > 2 &&
                along <= reach + (d.mode === 'wander' ? 0 : 1.5);
            if (heard) {
                if (d.mode === 'wander' && d.dist < 34) {
                    AudioSys.wail(Math.min(1, 1.3 - d.dist / 30), at(d.pos, 0.5), d.dist / 34);
                    d.clickTimer = rand(0.2, 0.5);
                }
                d.mode = 'investigate';
                d.heardAt = time;
                d.search = 0;
                d.listen = rand(1.2, 2.0);
                // Sound in water is hard to place: the further away, the worse their guess
                const gx = World.cellX(player.noisePos.x), gz = World.cellX(player.noisePos.z);
                const err = Math.min(3.2, 0.8 + along * 0.18);
                const a = rand(0, TAU), r = err * Math.sqrt(Math.random());
                d.goalPos.set(
                    clamp(player.noisePos.x + Math.cos(a) * r, gx * C - 3.3, gx * C + 3.3), 0,
                    clamp(player.noisePos.z + Math.sin(a) * r, gz * C - 3.3, gz * C + 3.3));
                if (gx !== d.goal.x || gz !== d.goal.z) {
                    d.goal.x = gx;
                    d.goal.z = gz;
                    World.fieldFrom(gx, gz, d.field);
                }
            }

            moveDrowned(d, dt, time, player);

            const alert = d.mode !== 'wander';
            if (d.speed > 0.05) d.yaw = dampAngle(d.yaw, Math.atan2(d.target.x - d.pos.x, d.target.z - d.pos.z), 6, dt);
            d.model.root.rotation.y = d.yaw;
            d.model.animate(dt, d.speed, false, time, alert ? 1 : 0.3, 1 - d.dist / 6);

            // Echolocation: they click to find you, faster when they think you're close
            d.clickTimer -= dt;
            if (d.clickTimer <= 0) {
                d.clickTimer = alert ? rand(0.7, 1.4) : rand(2.2, 4.5);
                if (d.dist < 32) {
                    const vol = Math.pow(1 - d.dist / 32, 1.4);
                    AudioSys.clicks(vol, at(d.pos, 0.5), alert, d.dist / 32);
                }
            }
            d.stepAcc += d.speed * dt * 0.42;

            // They only take you if they heard you a moment ago - hold still and they pass by
            if (d.dist < 0.95 * d.scale + 0.15 && time - d.heardAt < 1.5 && !player.godMode && !ctx.hidden) {
                ctx.onKill('drowned', d);
                return;
            }
        }

        // Wading: the four nearest moving ones slosh through the water, step by step
        const moving = drowned.filter((d) => d.speed > 0.1 && d.dist < 30)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 4);
        for (const d of moving) {
            if (d.stepAcc < 1) continue;
            d.stepAcc -= Math.floor(d.stepAcc);
            const far = d.dist / 30;
            const deep = ctx.waterDepth ? ctx.waterDepth(d.pos.x, d.pos.z) : 0;
            AudioSys.splash(Math.pow(1 - far, 1.4) * (d.speed > 3 ? 1 : 0.75), 0.3 + deep * 0.7, at(d.pos, 0.2), far);
        }
        for (const d of drowned) if (d.stepAcc > 2) d.stepAcc = 0;
    }

    function moveDrowned(d, dt, time, player) {
        const C = World.CELL;
        let speed;
        if (d.mode === 'investigate' && time - d.heardAt > 15) d.mode = 'wander';
        if (d.mode === 'investigate') {
            const fresh = time - d.heardAt < 2.5;
            const atGoal = d.cell.x === d.goal.x && d.cell.z === d.goal.z;
            if (atGoal) {
                // Lunge only at a sound it just heard close by; otherwise wade over slowly
                d.target.copy(d.goalPos);
                d.target.y = 0;
                const lunge = time - d.heardAt < 0.8 && d.pos.distanceTo(d.goalPos) < 6;
                speed = lunge ? 4.2 : 2.0;
                if (d.pos.distanceTo(d.target) < 0.8 || time - d.heardAt > 6) {
                    d.mode = 'search';
                    d.search = rand(3, 5);
                }
            } else {
                const step = World.descend(d.field, d.cell.x, d.cell.z);
                if (step) d.target.set(step.x * C, 0, step.z * C);
                else d.target.copy(d.goalPos);
                speed = fresh ? 3.2 : 2.5;
            }
        } else if (d.mode === 'search') {
            // Turn slowly on the spot, listening
            d.search -= dt;
            const tdx = d.target.x - d.pos.x, tdz = d.target.z - d.pos.z;
            if (tdx * tdx + tdz * tdz < 0.3) d.target.set(d.goalPos.x + rand(-2, 2), 0, d.goalPos.z + rand(-2, 2));
            speed = 0.8;
            if (d.search <= 0) d.mode = 'wander';
        } else {
            const tdx = d.target.x - d.pos.x, tdz = d.target.z - d.pos.z;
            if (tdx * tdx + tdz * tdz < 1.0) {
                const options = World.openNeighbours(d.cell.x, d.cell.z)
                    .filter((n) => !d.prevCell || n.x !== d.prevCell.x || n.z !== d.prevCell.z);
                const next = options.length ? pick(options) : (d.prevCell || d.cell);
                d.prevCell = { x: d.cell.x, z: d.cell.z };
                d.target.set(next.x * C + rand(-1.5, 1.5), 0, next.z * C + rand(-1.5, 1.5));
            }
            speed = 1.15;
        }

        dir.set(d.target.x - d.pos.x, 0, d.target.z - d.pos.z);
        const len = dir.length();
        if (len > 0.001) dir.divideScalar(len);
        if (d.detour > 0) {
            d.detour -= dt;
            dir.lerp(d.detourDir, 0.7).normalize();
        }
        for (const o of drowned) {
            if (o === d) continue;
            const ox = d.pos.x - o.pos.x, oz = d.pos.z - o.pos.z;
            const d2 = ox * ox + oz * oz;
            if (d2 < 2.2 && d2 > 0.0001) {
                const dd = Math.sqrt(d2);
                dir.x += (ox / dd) * 0.6;
                dir.z += (oz / dd) * 0.6;
            }
        }
        // A silent player is just another obstacle in the dark: it drifts around you
        if (time - d.heardAt >= 1.5) {
            const px = d.pos.x - player.pos.x, pz = d.pos.z - player.pos.z;
            const p2 = px * px + pz * pz;
            if (p2 < 7.3 && p2 > 0.0001) {
                const pd = Math.sqrt(p2);
                const push = (2.7 - pd) * 1.8;
                dir.x += (px / pd) * push;
                dir.z += (pz / pd) * push;
            }
        }
        if (dir.lengthSq() > 0.0001) dir.normalize();

        const stepLen = Math.min(speed * dt, len + 0.5);
        d.pos.x += dir.x * stepLen;
        d.pos.z += dir.z * stepLen;
        World.resolve(d.pos, 0.42 * d.scale);
        d.speed = len > 0.05 ? speed : 0;

        d.stuckTimer += dt;
        if (d.stuckTimer > 0.8) {
            const moved = d.pos.distanceTo(d.lastPos);
            if (moved < speed * 0.8 * 0.25 && speed > 1) {
                d.detour = 0.9;
                d.detourDir.set(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
            }
            d.lastPos.copy(d.pos);
            d.stuckTimer = 0;
        }
    }

    // ---------------------------------------------------------------------------
    // Angels
    // ---------------------------------------------------------------------------
    function updateAngels(dt, ctx) {
        const { cam, frustum, player, time } = ctx;
        cam.getWorldDirection(camDir);
        const coneCos = Math.cos(THREE.MathUtils.degToRad(30));
        const relic = player.relicTime > 0;
        let closest = Infinity;
        let maxCharge = 0;
        let lookedCount = 0;

        for (const a of angels) {
            const dx = cam.position.x - a.pos.x, dz = cam.position.z - a.pos.z;
            a.dist = Math.sqrt(dx * dx + dz * dz);
            closest = Math.min(closest, a.dist);

            // "Looking at" = near the centre of your view, unobstructed, within the mist
            tmp.set(a.pos.x, 3.2, a.pos.z).sub(cam.position);
            const d3 = tmp.length();
            const looked = a.dist < (ctx.angelSight || 28) && tmp.dot(camDir) / d3 > coneCos &&
                inFrustum(frustum, a.pos, 3, 1.5) && visibleFrom(cam, a.pos, 0.5);
            a.looked = looked;

            a.drifting = false;
            if (looked) {
                if (!a.wasLooked) a.charge = Math.max(a.charge, 0.05);
                a.charge += dt;
                let mult = 1 + Math.min(a.charge, 3);
                if (relic) mult *= 0.3;
                const sp = a.speed * mult;
                const len = a.dist || 1;
                a.pos.x += (dx / len) * sp * dt;
                a.pos.z += (dz / len) * sp * dt;
                if (ctx.angelCollide) World.resolve(a.pos, 0.7);
                a.yaw = dampAngle(a.yaw, Math.atan2(dx, dz), 10, dt);
                lookedCount++;
            } else {
                a.charge = Math.max(0, a.charge - 2 * dt);
                if (player.noise > 40 && player.noisePos) {
                    // Drawn to loud footsteps, even when unwatched
                    const nx = player.noisePos.x - a.pos.x, nz = player.noisePos.z - a.pos.z;
                    const nl = Math.sqrt(nx * nx + nz * nz);
                    if (nl > 0.5) {
                        a.pos.x += (nx / nl) * a.speed * 0.3 * dt;
                        a.pos.z += (nz / nl) * a.speed * 0.3 * dt;
                        if (ctx.angelCollide) World.resolve(a.pos, 0.7);
                        a.drifting = true;
                    }
                }
            }
            a.wasLooked = looked;
            maxCharge = Math.max(maxCharge, looked ? Math.min(a.charge / 3, 1) : 0);

            a.model.root.rotation.y = a.yaw;
            const chargeN = Math.min(a.charge / 3, 1);
            a.model.animate(dt, chargeN, looked || a.drifting, time);
            if (a.model.haloGlow) {
                // The halo glimmers through the mist - a warning not to look
                const far = ctx.haloFar || 37;
                const fade = 1 - smoothstep(far - 13, far, a.dist);
                a.model.haloGlow.material.opacity = (0.35 + chargeN * 0.5) * fade;
                for (const g of a.model.eyeGlows) g.material.opacity = 0.5 + chargeN * 0.5;
            }

            if (a.dist < 2.3 && !player.godMode && !ctx.hidden) {
                ctx.onKill('angel', a);
                return;
            }
        }

        // Pooled glow lights for the two nearest Angels
        const near = angels.slice().sort((a, b) => a.dist - b.dist);
        for (let i = 0; i < angelLights.length; i++) {
            const a = near[i];
            const l = angelLights[i];
            if (!a || a.dist > 30) { l.intensity = 0; continue; }
            l.position.set(a.pos.x, 3.4, a.pos.z);
            l.intensity = 1.6 + Math.min(a.charge, 3) * 0.8 + Math.sin(time * 5 + i) * 0.2;
        }

        const nearestAngel = near[0];
        if (chimes) chimes.set(closest < 15 ? Math.min(1, (1 - closest / 15) * 1.5) : 0, nearestAngel ? at(nearestAngel.pos, 3.3) : 0);
        ctx.angelState.closest = closest;
        ctx.angelState.charge = maxCharge;
        ctx.angelState.looked = lookedCount;
    }

    function silence() {
        for (const v of footVoices) v.set(0);
        if (chimes) chimes.set(0);
    }

    function nearestWatcherDistance() {
        let d = Infinity;
        for (const w of watchers) d = Math.min(d, w.dist);
        return d;
    }

    // Closest creature of any kind
    function nearestDistance() {
        let d = nearestWatcherDistance();
        for (const m of drowned) d = Math.min(d, m.dist);
        for (const a of angels) d = Math.min(d, a.dist);
        return d;
    }

    return {
        init, clear, spawnWatchers, spawnAngels, spawnDrowned, setStepSound,
        updateWatchers, updateAngels, updateDrowned, silence,
        nearestWatcherDistance, nearestDistance,
        // Distance to the nearest hunting Watcher/Unseen that isn't being observed
        get nearestHunter() { return nearestHunterDist; },
        get watchers() { return watchers; },
        get angels() { return angels; },
        get drowned() { return drowned; }
    };
})();
