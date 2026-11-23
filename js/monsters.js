// THE WATCHING DARK - monster behaviour
// Watchers (level 1): move only while unseen, freeze when observed, flee from fire.
// Angels (level 2): the inverse - they charge while you look at them and freeze when ignored.
'use strict';

const Monsters = (() => {
    const watchers = [];
    const angels = [];
    let footVoices = [];
    let chimes = null;
    let scene = null;
    let directorTimer = 0;
    let staticTimer = 0;
    const angelLights = [];

    const tmp = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    const camDir = new THREE.Vector3();
    const camRight = new THREE.Vector3();

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
        for (const v of footVoices) v.destroy();
        footVoices = [];
        if (chimes) { chimes.destroy(); chimes = null; }
        angelLights.length = 0;
        directorTimer = 0;
    }

    // ---------------------------------------------------------------------------
    // Spawning
    // ---------------------------------------------------------------------------
    function spawnWatchers(count) {
        World.updateFlow(0, 0);
        const S = World.SIZE, C = World.CELL;
        const taken = new Set();
        for (let i = 0; i < count; i++) {
            let cell = null;
            for (let t = 0; t < 500; t++) {
                const x = randInt(1, S - 1), z = randInt(1, S - 1);
                const d = World.pathDist(x, z);
                if (d < 9 || taken.has(x * 100 + z)) continue;
                if (World.exits.some((e) => Math.abs(e.x - x) + Math.abs(e.z - z) < 3)) continue;
                if (World.overlaps(x * C, z * C, 0.8)) continue;
                cell = { x, z };
                break;
            }
            if (!cell) continue;
            taken.add(cell.x * 100 + cell.z);
            const type = WATCHER_TYPES[i % 3];
            const model = Models.createWatcher(type.scale * rand(0.95, 1.08));
            model.root.position.set(cell.x * C + rand(-1, 1), 0, cell.z * C + rand(-1, 1));
            model.root.rotation.y = rand(0, TAU);
            scene.add(model.root);
            watchers.push({
                model, type,
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
        footVoices = [0, 1, 2].map(() => AudioSys.createVoice('footsteps'));
    }

    function spawnAngels(count, playerPos) {
        const S = World.SIZE, C = World.CELL;
        for (let i = 0; i < count; i++) {
            let p = null;
            for (let t = 0; t < 200; t++) {
                const x = randInt(3, S - 2) * C + rand(-2, 2), z = randInt(3, S - 2) * C + rand(-2, 2);
                if ((x - playerPos.x) ** 2 + (z - playerPos.z) ** 2 < 34 * 34) continue;
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
            const desired = Math.min(5, 2 + Math.floor(ctx.levelTime / 70));
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

        let nearestHunter = Infinity, nearestHunterPan = 0;

        for (const w of watchers) {
            const dx = cam.position.x - w.pos.x, dz = cam.position.z - w.pos.z;
            w.dist = Math.sqrt(dx * dx + dz * dz);
            w.cell.x = World.cellX(w.pos.x);
            w.cell.z = World.cellX(w.pos.z);
            const pd = World.pathDist(w.cell.x, w.cell.z);

            // Observed?
            const s = w.type.scale;
            const seen = w.dist < 36 &&
                (inFrustum(frustum, w.pos, 1.5 * s, 0.75 * s) || inFrustum(frustum, w.pos, 2.4 * s, 0.6 * s)) &&
                visibleFrom(cam, w.pos, 0.35 * s);
            w.frozen = seen;

            // Fire scares them off
            if (player.matchLit && w.dist < 15) {
                w.flee = 5;
                w.aware = Math.max(w.aware, 6);
            }

            // Senses
            if (pd >= 0 && pd <= w.type.detect) w.aware = Math.max(w.aware, 8);
            const heard = player.noise > 30 && pd >= 0 && pd <= w.type.hear;
            if (heard) w.aware = Math.max(w.aware, 8);
            if (!seen) w.aware -= dt;
            if (w.aware <= 0) w.stalker = false;
            if (w.flee > 0) w.flee -= dt;

            if (seen) {
                w.unseen = 0;
                w.speed = 0;
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
            if (!seen) w.yaw = dampAngle(w.yaw, faceYaw, 8, dt);
            w.model.root.rotation.y = w.yaw;
            w.model.animate(dt, w.speed, seen, time, w.aware > 0 && w.flee <= 0 ? 1 : 0, 1 - w.dist / 9);

            // Eyes burn brighter when hunting
            const hunting = w.aware > 0 && w.flee <= 0;
            const eye = hunting ? 4.5 + Math.sin(time * 6 + w.pos.x) * 1.2 : 1.6;
            w.model.eyeMat.emissiveIntensity = eye;
            const eyeFade = 1 - smoothstep(18, 34, w.dist);
            for (const g of w.model.eyeGlows) g.material.opacity = (hunting ? 0.95 : 0.45) * eyeFade;

            if (hunting && !seen && w.dist < nearestHunter) {
                nearestHunter = w.dist;
                tmp.set(w.pos.x - cam.position.x, 0, w.pos.z - cam.position.z).normalize();
                nearestHunterPan = tmp.dot(camRight);
            }

            if (w.dist < 1.25 * s + 0.2 && !player.godMode) {
                ctx.onKill('watcher');
                return;
            }
        }

        updateWatcherAudio(dt, cam);

        // Static crackle when something unseen is right behind you
        staticTimer -= dt;
        if (nearestHunter < 7 && staticTimer <= 0) {
            AudioSys.staticBurst(1 - nearestHunter / 7, nearestHunterPan);
            staticTimer = rand(0.7, 1.6);
        }
    }

    const dir = new THREE.Vector3();
    function moveWatcher(w, dt, cam, pd, heard) {
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
            tmp.set(w.pos.x - cam.position.x, 0, w.pos.z - cam.position.z).normalize();
            const pan = tmp.dot(camRight) * 0.85;
            const vol = Math.min(1, (1 - w.dist / 40) * 2.2) * (w.aware > 0 ? 1 : 0.6);
            v.el.playbackRate = clamp(w.speed / 3.2, 0.7, 1.6);
            v.set(vol, pan);
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
            const looked = a.dist < 28 && tmp.dot(camDir) / d3 > coneCos &&
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
                const fade = 1 - smoothstep(24, 37, a.dist);
                a.model.haloGlow.material.opacity = (0.35 + chargeN * 0.5) * fade;
                for (const g of a.model.eyeGlows) g.material.opacity = 0.5 + chargeN * 0.5;
            }

            if (a.dist < 2.3 && !player.godMode) {
                ctx.onKill('angel');
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

        if (chimes) chimes.set(closest < 15 ? Math.min(1, (1 - closest / 15) * 1.5) : 0);
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

    return {
        init, clear, spawnWatchers, spawnAngels, updateWatchers, updateAngels, silence,
        nearestWatcherDistance,
        get watchers() { return watchers; },
        get angels() { return angels; }
    };
})();
