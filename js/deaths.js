// THE WATCHING DARK - death scenes
// When something catches you, you see it happen: the camera is taken out of your hands and
// the creature that caught you plays out its kill in the world, before the scream.
//   Watcher - "Turn around":     you are wrenched round to face it; it leans in and unhinges
//   Angel   - "You looked too long": it descends to you and you fall into its eye
//   Drowned - "Pulled under":    dragged down into the water, face to face, then under
//   Unseen  - "Signal lost":     the camcorder falls; still recording, you watch it lean over you
'use strict';

const Deaths = (() => {
    let S = null;
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), head = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0);
    const lookM = new THREE.Matrix4();
    const qLook = new THREE.Quaternion();
    const ease = (t) => t * t * (3 - 2 * t);
    const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

    // Turn the camera (from where it was looking) toward a point, t = 0..1
    function aim(cam, target, t, roll = 0) {
        lookM.lookAt(cam.position, target, UP);
        qLook.setFromRotationMatrix(lookM);
        cam.quaternion.copy(S.q0).slerp(qLook, ease(clamp(t, 0, 1)));
        if (roll) cam.rotateZ(roll);
    }

    function headOf(m) {
        return m.headGroup.getWorldPosition(head);
    }

    // Stand the creature `dist` metres in front of the camera (on the side it came from), facing you
    function stage(m, cam, dist, fromDir) {
        const dir = fromDir.clone().setY(0).normalize();
        m.root.position.set(cam.position.x + dir.x * dist, 0, cam.position.z + dir.z * dist);
        m.root.rotation.y = Math.atan2(cam.position.x - m.root.position.x, cam.position.z - m.root.position.z);
        m.root.visible = true;
        return dir;
    }

    function once(key) {
        if (S.flags[key]) return false;
        S.flags[key] = true;
        return true;
    }

    const SCENES = {
        // ---------------------------------------------------------------- the Watcher
        watcher: {
            setup(s) {
                const { cam } = s.env;
                s.dir = stage(s.m, cam, 1.95, v1.copy(s.k.pos).sub(cam.position));
                s.tilt = Math.random() < 0.5 ? -1 : 1;
                s.base = s.m.root.position.clone();
                AudioSys.staticBurst(1, 0);
            },
            update(s, dt, time) {
                const { cam, fx, player, rig } = s.env;
                const t = s.t, m = s.m;
                // Lunge at the end
                const lunge = ease(span(t, 1.55, 1.8));
                m.root.position.copy(s.base).addScaledVector(s.dir, -0.85 * lunge);
                // Stop-motion: it only moves in jerks
                s.acc = (s.acc || 0) + dt;
                if (s.acc > 1 / 12) {
                    s.acc = 0;
                    const lean = ease(span(t, 0.4, 1.5));
                    const j = () => (Math.random() - 0.5) * 0.08;
                    if (m.pose) {
                        m.pose('spine', 0.02, 0, 0);
                        m.pose('chest', 0.06 + lean * 0.08 + j() * 0.5, 0, 0);
                        m.pose('neck', 0.04 + lean * 0.1 + lunge * 0.25, 0, 0);
                        m.pose('head', -0.12 - lean * 0.1 + j(), j(), s.tilt * lean * 0.75 + j());
                        for (const side of ['L', 'R']) {
                            m.pose('upperarm_' + side, -0.4 - lean * 0.9 - lunge * 0.4 + j(), 0, 0);
                            m.pose('forearm_' + side, -0.5 - lean * 0.6 + j(), 0, 0);
                            m.pose('hand_' + side, -0.3, 0, 0);
                        }
                    }
                    if (m.openJaw) m.openJaw(ease(span(t, 0.5, 1.45)) * 1.7 + Math.random() * 0.15);
                }
                if (m.eyeMat) m.eyeMat.emissiveIntensity = 4 + ease(span(t, 0.4, 1.6)) * 12;
                for (const g of m.eyeGlows || []) {
                    g.material.opacity = 1;
                    g.scale.setScalar(0.22 + span(t, 0.4, 1.6) * 0.25);
                }
                // Wrenched round to face it, then held there, creeping closer
                const target = headOf(m);
                cam.position.copy(s.from.pos).addScaledVector(s.dir, 0.12 * ease(span(t, 0.5, 1.5)));
                cam.position.y = s.from.pos.y + Math.sin(t * 40) * 0.004;
                aim(cam, target, t / 0.42, Math.sin(t * 31) * 0.02 * (1 - span(t, 0, 0.6)) + (t < 0.42 ? (1 - t / 0.42) * 0.25 : 0));
                cam.fov = lerp(s.from.fov, 48, ease(span(t, 0.45, 1.55)));
                cam.updateProjectionMatrix();
                if (t > 0.42 && once('sting')) AudioSys.sting(1);
                if (t > 1.0 && once('whisper')) AudioSys.whisper(0, 0.7, 5);
                // The flashlight shakes in your hand
                player.swayX = (Math.random() - 0.5) * 0.04;
                player.swayY = (Math.random() - 0.5) * 0.04;
                if (rig) rig.vm.torch.position.x += player.swayX;
                fx.aberration = 0.3 + span(t, 0.5, 1.6) * 1.5 + lunge * 2;
                fx.warp = span(t, 1.0, 1.7) * 0.5;
                fx.pulse = span(t, 0.4, 1.6) * 0.6;
                if (t > 1.7) { fx.flash = 0.8; fx.flashColor.setRGB(0.6, 0, 0); }
                return t > 1.8;
            }
        },

        // ---------------------------------------------------------------- the Angel
        angel: {
            setup(s) {
                const { cam } = s.env;
                s.dir = stage(s.m, cam, 3.2, v1.copy(s.k.pos).sub(cam.position));
                s.base = s.m.root.position.clone();
                s.y0 = s.m.body.position.y;
            },
            update(s, dt, time) {
                const { cam, fx } = s.env;
                const t = s.t, m = s.m;
                // It comes down to you: wheels screaming round, the great eye opening
                const come = ease(span(t, 0, 1.3));
                m.root.position.copy(s.base).addScaledVector(s.dir, -1.6 * come);
                m.animate(dt, 1, true, time);
                m.body.position.y = lerp(s.y0, cam.position.y, come);
                m.headGroup.lookAt(cam.position);
                const target = headOf(m);
                aim(cam, target, t / 0.6, Math.sin(t * 2.3) * 0.05 * come);
                // ...and you fall into its pupil
                cam.fov = lerp(s.from.fov, 6, Math.pow(span(t, 1.15, 2.0), 1.6));
                cam.updateProjectionMatrix();
                if (t > 0.1 && once('sting')) AudioSys.sting(0.8);
                if (t > 0.6 && once('wail')) AudioSys.wail(0.9, 0, 0.1);
                if (t > 1.2 && once('thump')) AudioSys.thump(1);
                fx.aberration = come * 1.2 + span(t, 1.2, 2.0) * 3;
                fx.warp = span(t, 1.1, 2.0) * 0.9;
                fx.flash = Math.pow(span(t, 1.85, 2.15), 2);
                fx.flashColor.setRGB(1, 0.95, 0.85);
                return t > 2.15;
            }
        },

        // ---------------------------------------------------------------- the Drowned
        drowned: {
            setup(s) {
                const { cam, player, rig } = s.env;
                s.dir = stage(s.m, cam, 1.85, v1.copy(s.k.pos).sub(cam.position));
                s.base = s.m.root.position.clone();
                if (rig) rig.vm.torch.visible = false;
                AudioSys.splash(1, 1, 0, 0);
            },
            update(s, dt, time) {
                const { cam, fx } = s.env;
                const t = s.t, m = s.m;
                // Your legs are taken out from under you: down into the water
                const fall = ease(span(t, 0, 0.45));
                const under = ease(span(t, 1.45, 1.85));
                cam.position.copy(s.from.pos);
                cam.position.y = lerp(lerp(s.from.pos.y, 0.55, fall), 0.06, under);
                if (t > 0.35 && once('splash2')) AudioSys.splash(1, 1, 0, 0);
                // It rears up out of the water, face to face, jaw dropping open
                s.acc = (s.acc || 0) + dt;
                const rear = ease(span(t, 0.35, 1.0));
                m.root.position.copy(s.base).addScaledVector(s.dir, -0.35 * ease(span(t, 0.8, 1.5)) - 0.3 * under);
                if (s.acc > 1 / 15 && m.pose) {
                    s.acc = 0;
                    const j = () => (Math.random() - 0.5) * 0.18;
                    m.pose('chest', -0.08 * rear, 0, 0);
                    m.pose('neck', -0.3 * rear + j() * 0.3, 0, 0);
                    m.pose('head', -0.25 * rear + j(), j(), j() * 1.5);
                    for (const side of ['L', 'R']) m.pose('upperarm_' + side, -0.5 * rear, 0, 0);
                    if (m.openJaw) m.openJaw(0.3 + ease(span(t, 0.6, 1.4)) * 1.5);
                }
                const target = headOf(m);
                aim(cam, target, t / 0.5, (0.45 * fall) * (1 - under * 0.5) + Math.sin(t * 27) * 0.03);
                if (t > 0.65 && once('wail')) AudioSys.wail(1, 0, 0);
                if (t > 1.45 && once('under')) AudioSys.splash(1, 1, 0, 0);
                if (t > 1.0 && once('clicks')) AudioSys.clicks(1, 0, true, 0);
                fx.aberration = 0.4 + rear * 0.8 + under * 2;
                // Under the black water
                if (under > 0) {
                    fx.grade = fx.grade || { tint: new THREE.Color(), saturation: 0.3, exposure: 0.6 };
                    fx.grade.tint.setRGB(lerp(1, 0.35, under), lerp(1, 0.62, under), lerp(1, 0.55, under));
                    fx.grade.exposure = lerp(1, 0.45, under);
                    fx.warp = under * 0.8;
                }
                fx.blackout = span(t, 1.7, 2.05) * 0.9;
                return t > 2.05;
            }
        },

        // ---------------------------------------------------------------- the Unseen
        unseen: {
            setup(s) {
                const { cam, player, rig } = s.env;
                player.lensToggle = true;
                player.lens = 1;
                HUD.setCamcorder(true);
                s.dir = stage(s.m, cam, 1.7, v1.copy(s.k.pos).sub(cam.position));
                s.base = s.m.root.position.clone();
                if (rig) { rig.vm.torch.visible = false; rig.vm.match.visible = false; }
                AudioSys.staticBurst(1, 0);
            },
            update(s, dt, time) {
                const { cam, fx, player } = s.env;
                const t = s.t, m = s.m;
                player.lens = 1;
                m.root.visible = true;
                // The camcorder drops out of your hands and lands on its side, still recording
                const drop = Math.pow(span(t, 0, 0.5), 2);
                const bounce = t > 0.5 ? Math.max(0, Math.sin((t - 0.5) * 18)) * 0.05 * Math.exp(-(t - 0.5) * 8) : 0;
                cam.position.copy(s.from.pos);
                cam.position.y = lerp(s.from.pos.y, 0.1, drop) + bounce;
                if (t > 0.5 && once('land')) { AudioSys.thump(0.8); AudioSys.staticBurst(1, 0); }
                // It walks over and leans down into the lens
                const walk = ease(span(t, 0.7, 1.5));
                m.root.position.copy(s.base).addScaledVector(s.dir, -0.7 * walk);
                m.root.position.y = -0.62 * ease(span(t, 1.1, 1.9));
                s.acc = (s.acc || 0) + dt;
                if (s.acc > 1 / 13 && m.pose) {
                    s.acc = 0;
                    const lean = ease(span(t, 1.1, 1.9));
                    const j = () => (Math.random() - 0.5) * 0.1;
                    // It crouches down to the lens, face first
                    m.pose('hips', -0.35 * lean, 0, 0);
                    m.pose('spine', 0.3 * lean, 0, 0);
                    m.pose('chest', 0.35 * lean + j(), 0, 0);
                    m.pose('neck', 0.25 * lean, 0, 0);
                    m.pose('head', 0.2 * lean + j(), j(), j());
                    for (const side of ['L', 'R']) {
                        m.pose('thigh_' + side, -1.25 * lean, 0, 0);
                        m.pose('shin_' + side, 1.9 * lean, 0, 0);
                        m.pose('foot_' + side, -0.6 * lean, 0, 0);
                        m.pose('upperarm_' + side, -0.7 * lean + j(), 0, 0);
                        m.pose('forearm_' + side, -0.5 * lean, 0, 0);
                    }
                    if (m.openJaw) m.openJaw(0.35 + lean * 1.3);
                }
                const target = headOf(m);
                const roll = lerp(0, 1.42, ease(span(t, 0.1, 0.55)));
                aim(cam, target, t / 0.6, roll);
                if (t > 1.1 && once('breath')) AudioSys.whisper(0, 0.6, 6);
                // Static rising until the picture is gone
                s.st = (s.st || 0) - dt;
                if (s.st <= 0 && t > 0.6) {
                    s.st = lerp(0.5, 0.08, span(t, 0.8, 2.2));
                    AudioSys.staticBurst(0.5 + span(t, 0.8, 2.2) * 0.5, 0);
                }
                fx.interference = (t < 0.6 ? span(t, 0.4, 0.55) : 0.12) + span(t, 1.95, 2.35) * 1.8;
                fx.aberration = 0.4 + span(t, 1.3, 2.3) * 2;
                fx.blackout = span(t, 2.25, 2.4);
                return t > 2.4;
            }
        }
    };

    function start(cause, killer, env) {
        if (!killer || !killer.model || !SCENES[cause]) return false;
        if (cause === 'angel' && !killer.model.body) return false;
        const cam = env.camera;
        cam.updateMatrixWorld();
        S = {
            cause, k: killer, m: killer.model, t: 0, flags: {},
            env: { cam, fx: env.fx, player: env.player, rig: env.rig, onDone: env.onDone },
            from: { pos: cam.position.clone(), fov: cam.fov },
            q0: cam.quaternion.clone()
        };
        SCENES[cause].setup(S);
        return true;
    }

    function update(dt, time) {
        if (!S) return;
        S.t += dt;
        if (SCENES[S.cause].update(S, dt, time)) {
            const done = S.env.onDone;
            S = null;
            done();
        }
    }

    function cancel() { S = null; }

    return { start, update, cancel, get active() { return !!S; }, get time() { return S ? S.t : -1; } };
})();
