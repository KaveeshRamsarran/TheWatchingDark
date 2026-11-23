// THE WATCHING DARK - procedural models (monsters, props, first-person hands)
'use strict';

const Models = (() => {
    const shared = {};
    // Uniforms shared by every shader-driven particle system
    const pointUniforms = {
        time: { value: 0 },
        pixelScale: { value: 400 }
    };

    const markShared = (o) => { o.userData.shared = true; return o; };

    // ---------------------------------------------------------------------------
    // Shared materials
    // ---------------------------------------------------------------------------
    // Faint fresnel glow so dark silhouettes still read at the edge of the light
    function addRim(m, rimColor, rimPower = 2.5) {
        m.onBeforeCompile = (shader) => {
            shader.uniforms.rimColor = { value: new THREE.Color(rimColor) };
            shader.uniforms.rimPower = { value: rimPower };
            shader.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimPower;\n' + shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
                float rimF = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
                totalEmissiveRadiance += rimColor * pow(rimF, rimPower);`
            );
        };
        return m;
    }

    function rimMaterial(color, roughness, rimColor, rimPower = 2.5) {
        return markShared(addRim(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 }), rimColor, rimPower));
    }

    function smokeMaterial(color, opacity, size) {
        return markShared(new THREE.ShaderMaterial({
            uniforms: {
                time: pointUniforms.time,
                pixelScale: pointUniforms.pixelScale,
                color: { value: new THREE.Color(color) },
                opacity: { value: opacity },
                size: { value: size }
            },
            vertexShader: /* glsl */`
                uniform float time, pixelScale, size;
                attribute float seed;
                varying float vAlpha;
                void main() {
                    vec3 p = position;
                    float t = time * 0.6 + seed * 10.0;
                    float life = fract(time * 0.18 + seed);
                    p.y += life * 1.4;
                    p.x += sin(t + seed * 6.28) * 0.22;
                    p.z += cos(t * 0.8 + seed * 3.0) * 0.22;
                    vAlpha = sin(life * 3.14159);
                    vec4 mv = modelViewMatrix * vec4(p, 1.0);
                    gl_PointSize = size * pixelScale / max(-mv.z, 0.1);
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: /* glsl */`
                uniform vec3 color;
                uniform float opacity;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    if (d > 0.5) discard;
                    gl_FragColor = vec4(color, smoothstep(0.5, 0.0, d) * vAlpha * opacity);
                }`,
            transparent: true,
            depthWrite: false
        }));
    }

    function smokePoints(material, count, radius, height) {
        const g = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3), seed = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius;
            pos[i * 3] = Math.cos(a) * r;
            pos[i * 3 + 1] = Math.random() * height;
            pos[i * 3 + 2] = Math.sin(a) * r;
            seed[i] = Math.random();
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
        const p = new THREE.Points(g, material);
        p.frustumCulled = false;
        return p;
    }

    function glowSprite(color, scale, opacity = 1, fog = false) {
        const mat = new THREE.SpriteMaterial({
            map: Textures.glow(),
            color,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog
        });
        const s = new THREE.Sprite(mat);
        s.scale.set(scale, scale, 1);
        return s;
    }

    // ---------------------------------------------------------------------------
    // THE WATCHER - gaunt, long-armed figure with a wide flared head.
    // ---------------------------------------------------------------------------
    function watcherAssets() {
        if (shared.watcher) return shared.watcher;
        const V = (x, y) => new THREE.Vector2(x, y);

        const torso = new THREE.LatheGeometry([
            V(0.0, -0.02), V(0.13, 0), V(0.17, 0.1), V(0.15, 0.3), V(0.12, 0.46), V(0.17, 0.62),
            V(0.27, 0.8), V(0.31, 0.9), V(0.24, 0.98), V(0.09, 1.03), V(0.055, 1.12), V(0.06, 1.22), V(0.0, 1.23)
        ], 14);
        torso.scale(1, 1, 0.62);

        const head = new THREE.LatheGeometry([
            V(0.0, 0.0), V(0.06, 0.0), V(0.075, 0.1), V(0.11, 0.21), V(0.19, 0.31), V(0.34, 0.39),
            V(0.58, 0.445), V(0.8, 0.47), V(0.85, 0.49), V(0.79, 0.51), V(0.48, 0.525), V(0.0, 0.535)
        ], 22);

        // Hollow ring eyes with a burning core
        const eyeParts = [];
        for (const side of [-1, 1]) {
            const ring = new THREE.TorusGeometry(0.034, 0.009, 6, 14);
            ring.rotateY(side * 0.42);
            ring.translate(side * 0.082, 0.3, 0.178);
            const core = new THREE.SphereGeometry(0.02, 8, 6);
            core.translate(side * 0.08, 0.3, 0.172);
            eyeParts.push(ring, core);
        }
        const eyes = mergeGeometries(eyeParts);

        const upperArm = limbGeometry(0.05, 0.038, 0.7);
        const forearmParts = [limbGeometry(0.038, 0.028, 0.64)];
        const palm = new THREE.BoxGeometry(0.075, 0.13, 0.03);
        palm.translate(0, -0.7, 0);
        forearmParts.push(palm);
        for (let f = 0; f < 4; f++) {
            const finger = limbGeometry(0.011, 0.003, 0.3, 5);
            finger.rotateZ((f - 1.5) * 0.12);
            finger.translate((f - 1.5) * 0.02, -0.76, 0);
            forearmParts.push(finger);
        }
        const forearm = mergeGeometries(forearmParts);

        const thigh = limbGeometry(0.075, 0.052, 0.56);
        const foot = new THREE.BoxGeometry(0.075, 0.045, 0.22);
        foot.translate(0, -0.585, 0.05);
        const shin = mergeGeometries([limbGeometry(0.05, 0.034, 0.57), foot]);

        for (const g of [torso, head, eyes, upperArm, forearm, thigh, shin]) g.userData.shared = true;

        shared.watcher = {
            torso, head, eyes, upperArm, forearm, thigh, shin,
            body: rimMaterial(0x040304, 0.5, 0x1e0206, 2.4),
            smoke: smokeMaterial(0x050206, 0.55, 0.55)
        };
        return shared.watcher;
    }

    // ---------------------------------------------------------------------------
    // Rigged Watcher built in Blender (tools/blender/build_models.py)
    // ---------------------------------------------------------------------------
    function watcherRigMaterials() {
        if (shared.watcherRig) return shared.watcherRig;
        const sk = Textures.skin();
        shared.watcherRig = {
            skin: markShared(addRim(new THREE.MeshStandardMaterial({
                map: sk.map, normalMap: sk.normalMap, roughnessMap: sk.roughnessMap, roughness: 1,
                color: 0x46424a, normalScale: new THREE.Vector2(1.6, 1.6), skinning: true
            }), 0x080103, 3.2)),
            teeth: markShared(new THREE.MeshStandardMaterial({ color: 0x8c7d66, roughness: 0.4, skinning: true })),
            maw: markShared(new THREE.MeshBasicMaterial({ color: 0x000000, skinning: true })),
            eye: null
        };
        return shared.watcherRig;
    }

    const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
    const qTmp = new THREE.Quaternion();

    function createWatcher(scale = 1) {
        const model = Assets.ok ? Assets.watcher() : null;
        if (!model) return createWatcherProcedural(scale);
        const M = watcherRigMaterials();
        model.traverse((o) => {
            if (!o.isMesh) return;
            const n = o.material.name || '';
            o.material = /teeth/i.test(n) ? M.teeth : /maw/i.test(n) ? M.maw : M.skin;
            o.castShadow = true;
            // Bind-pose bounds, padded so swinging limbs and the crown are never culled early
            if (!o.geometry.userData.paddedBounds) {
                o.geometry.computeBoundingSphere();
                o.geometry.boundingSphere.radius += 0.9;
                o.geometry.userData.paddedBounds = true;
            }
        });
        const root = new THREE.Group();
        root.add(model);
        root.updateMatrixWorld(true);

        // Rest pose of every bone, plus the model's X/Y/Z axes expressed in each bone's frame,
        // so limbs can be swung about body-relative axes regardless of bone roll.
        const rig = {};
        model.traverse((o) => {
            if (!o.isBone) return;
            const inv = o.getWorldQuaternion(new THREE.Quaternion()).invert();
            rig[o.name] = {
                bone: o, rest: o.quaternion.clone(), restPos: o.position.clone(),
                ax: AX.clone().applyQuaternion(inv), ay: AY.clone().applyQuaternion(inv), az: AZ.clone().applyQuaternion(inv)
            };
        });
        if (rig.jaw) {
            const pinv = rig.jaw.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
            rig.jaw.down = new THREE.Vector3(0, -1, 0).applyQuaternion(pinv);
        }

        // Burning eyes deep in the sockets
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3, roughness: 0.4 });
        const eyeGlows = [];
        const headBone = rig.head ? rig.head.bone : root;
        if (!shared.watcherEyeGeo) {
            const ring = new THREE.TorusGeometry(0.024, 0.0055, 6, 16);
            const core = new THREE.SphereGeometry(0.013, 10, 8);
            shared.watcherEyeGeo = mergeGeometries([ring, core]);
            shared.watcherEyeGeo.userData.shared = true;
        }
        for (const side of [-1, 1]) {
            const p = new THREE.Vector3(side * 0.07, 2.27, 0.39);
            headBone.worldToLocal(p);
            const eye = new THREE.Mesh(shared.watcherEyeGeo, eyeMat);
            eye.position.copy(p);
            eye.quaternion.copy(headBone.getWorldQuaternion(new THREE.Quaternion()).invert());
            headBone.add(eye);
            const g = glowSprite(0xff2010, 0.3, 0.9);
            g.position.copy(p);
            headBone.add(g);
            eyeGlows.push(g);
        }

        const smoke = smokePoints(watcherAssets().smoke, 36, 0.55, 2.3);
        root.add(smoke);
        root.scale.setScalar(scale);

        function pose(name, x, y = 0, z = 0) {
            const r = rig[name];
            if (!r) return;
            const q = r.bone.quaternion.copy(r.rest);
            if (x) q.multiply(qTmp.setFromAxisAngle(r.ax, x));
            if (y) q.multiply(qTmp.setFromAxisAngle(r.ay, y));
            if (z) q.multiply(qTmp.setFromAxisAngle(r.az, z));
        }

        const seed = Math.random() * 100;
        const tiltSign = Math.random() < 0.5 ? -1 : 1;
        let phase = Math.random() * TAU, step = 1, twitch = rand(1, 5);

        return {
            root, eyeMat, eyeGlows, headGroup: headBone, rigged: true,
            // speed: units/sec; frozen: holds the current pose; hunt: 0..1; near: 0..1 (how close)
            animate(dt, speed, frozen, time, hunt = 0, near = 0) {
                if (frozen) {
                    // Statues don't move... almost. A sudden snap of the head, now and then.
                    twitch -= dt;
                    if (twitch <= 0) {
                        twitch = rand(2.5, 7);
                        const snap = rand(-0.6, 0.6);
                        pose('head', -0.2, snap * 0.5, snap);
                    }
                    return;
                }
                phase += dt * (1.0 + speed * 1.45);
                step += dt;
                // Stop-motion: the pose only updates ~13 times a second, which reads as wrong
                if (step < 1 / 13) return;
                step = 0;
                const amp = clamp(speed / 3, 0.2, 1.1);
                const s = Math.sin(phase), c = Math.cos(phase);
                const j = () => (Math.random() - 0.5) * 0.14 * (0.4 + hunt);
                pose('hips', 0, s * 0.12 * amp, s * 0.05 * amp);
                pose('spine', 0.12 + hunt * 0.12, -s * 0.08 * amp, 0);
                pose('chest', 0.08 + hunt * 0.16 + j() * 0.3, s * 0.06 * amp, 0);
                pose('neck', 0.05 + hunt * 0.12, 0, 0);
                pose('head', -0.12 - hunt * 0.2 + j(), Math.sin(time * 0.4 + seed) * 0.3 + j(),
                    Math.sin(time * 0.6 + seed) * 0.16 + hunt * 0.28 * tiltSign + j());
                for (const [side, sw, cw] of [['L', s, c], ['R', -s, -c]]) {
                    pose('thigh_' + side, -sw * 0.55 * amp - 0.12, 0, 0);
                    pose('shin_' + side, Math.max(0, cw) * 0.9 * amp + 0.2, 0, 0);
                    pose('foot_' + side, -0.15, 0, 0);
                    pose('upperarm_' + side, sw * 0.3 * amp - hunt * 0.6 + j() * 0.6, 0, 0);
                    pose('forearm_' + side, -0.2 - hunt * 0.7 + j() * 0.6, 0, 0);
                    pose('hand_' + side, -0.25 - hunt * 0.3, 0, 0);
                }
                if (rig.jaw && rig.jaw.down) {
                    const open = hunt * clamp(near, 0, 1) * (0.75 + Math.random() * 0.25);
                    rig.jaw.bone.position.copy(rig.jaw.restPos).addScaledVector(rig.jaw.down, open * 0.05);
                }
            },
            pose
        };
    }

    function createWatcherProcedural(scale = 1) {
        const A = watcherAssets();
        const root = new THREE.Group();
        const body = new THREE.Group();
        root.add(body);

        const mesh = (geo, mat, parent) => {
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = true;
            parent.add(m);
            return m;
        };

        const hips = new THREE.Group();
        hips.position.y = 1.12;
        body.add(hips);

        const spine = new THREE.Group();
        spine.rotation.x = 0.2;
        hips.add(spine);
        mesh(A.torso, A.body, spine);

        const neck = new THREE.Group();
        neck.position.y = 1.18;
        neck.rotation.x = -0.15;
        spine.add(neck);
        const headGroup = new THREE.Group();
        neck.add(headGroup);
        mesh(A.head, A.body, headGroup);

        const eyeMat = new THREE.MeshStandardMaterial({
            color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3, roughness: 0.4
        });
        const eyes = new THREE.Mesh(A.eyes, eyeMat);
        headGroup.add(eyes);
        const eyeGlows = [];
        for (const side of [-1, 1]) {
            const s = glowSprite(0xff2010, 0.32, 0.9);
            s.position.set(side * 0.08, 0.3, 0.2);
            headGroup.add(s);
            eyeGlows.push(s);
        }

        const limbs = {};
        for (const side of [-1, 1]) {
            const key = side < 0 ? 'L' : 'R';
            const shoulder = new THREE.Group();
            shoulder.position.set(side * 0.29, 0.88, 0);
            shoulder.rotation.z = side * 0.14;
            spine.add(shoulder);
            mesh(A.upperArm, A.body, shoulder);
            const elbow = new THREE.Group();
            elbow.position.y = -0.7;
            elbow.rotation.x = -0.25;
            shoulder.add(elbow);
            mesh(A.forearm, A.body, elbow);

            const hip = new THREE.Group();
            hip.position.set(side * 0.11, 0, 0);
            hips.add(hip);
            mesh(A.thigh, A.body, hip);
            const knee = new THREE.Group();
            knee.position.y = -0.56;
            hip.add(knee);
            mesh(A.shin, A.body, knee);

            limbs['shoulder' + key] = shoulder;
            limbs['elbow' + key] = elbow;
            limbs['hip' + key] = hip;
            limbs['knee' + key] = knee;
        }

        const smoke = smokePoints(A.smoke, 40, 0.6, 2.2);
        body.add(smoke);

        root.scale.setScalar(scale);
        const seed = Math.random() * 100;
        let phase = Math.random() * TAU;
        let twitch = 0;

        return {
            root, eyeMat, eyeGlows, headGroup,
            // speed: current movement speed in units/sec, frozen: holds the current pose
            animate(dt, speed, frozen, time) {
                if (!frozen) phase += dt * (1.2 + speed * 1.6);
                const amp = frozen ? 1 : clamp(speed / 3, 0.15, 1.1);
                const s = Math.sin(phase), c = Math.cos(phase);
                if (!frozen) {
                    limbs.hipL.rotation.x = -s * 0.55 * amp;
                    limbs.hipR.rotation.x = s * 0.55 * amp;
                    limbs.kneeL.rotation.x = Math.max(0, c) * 0.9 * amp;
                    limbs.kneeR.rotation.x = Math.max(0, -c) * 0.9 * amp;
                    limbs.shoulderL.rotation.x = s * 0.45 * amp - 0.1;
                    limbs.shoulderR.rotation.x = -s * 0.45 * amp - 0.1;
                    limbs.elbowL.rotation.x = -0.25 - Math.max(0, s) * 0.4 * amp;
                    limbs.elbowR.rotation.x = -0.25 - Math.max(0, -s) * 0.4 * amp;
                    body.position.y = Math.abs(s) * 0.05 * amp;
                    spine.rotation.z = s * 0.05 * amp;
                    headGroup.rotation.z = Math.sin(time * 0.7 + seed) * 0.12;
                    headGroup.rotation.y = Math.sin(time * 0.43 + seed) * 0.18;
                } else {
                    // Statues don't move... almost.
                    twitch -= dt;
                    if (twitch < -rand(3, 9)) {
                        twitch = 0.08;
                        headGroup.rotation.z += rand(-0.25, 0.25);
                    }
                }
            }
        };
    }

    // ---------------------------------------------------------------------------
    // THE ANGEL - towering, robed, broken halo, tattered wings and that face.
    // Also used (in stone) for the decorative statues of level 2.
    // ---------------------------------------------------------------------------
    function angelAssets() {
        if (shared.angel) return shared.angel;
        const V = (x, y) => new THREE.Vector2(x, y);

        const robe = new THREE.LatheGeometry([
            V(0.0, 0.05), V(0.8, 0.0), V(0.72, 0.5), V(0.58, 1.2), V(0.44, 2.0), V(0.31, 2.6),
            V(0.25, 3.0), V(0.28, 3.35), V(0.32, 3.6), V(0.21, 3.86), V(0.08, 3.96), V(0.0, 3.97)
        ], 28);
        // Tattered, rippling hem
        const p = robe.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            const a = Math.atan2(x, z);
            const ripple = 1 + 0.07 * Math.sin(a * 7 + y * 2.5);
            let ny = y;
            if (y < 0.7) ny = y + (Math.sin(a * 9) * 0.5 + 0.5) * Math.max(0, Math.sin(a * 23 + 1.3)) * 0.45 * (1 - y / 0.7);
            p.setXYZ(i, x * ripple, ny, z * ripple);
        }
        robe.computeVertexNormals();

        const neck = new THREE.CylinderGeometry(0.055, 0.07, 0.75, 8);
        neck.translate(0, 4.3, 0);
        const ribs = [];
        for (let r = 0; r < 5; r++) {
            const rib = new THREE.TorusGeometry(0.2 - r * 0.012, 0.016, 4, 12, Math.PI);
            rib.rotateX(Math.PI / 2);
            rib.rotateY(Math.PI);
            rib.scale(1, 1, 0.75);
            rib.translate(0, 3.05 + r * 0.14, 0.02);
            ribs.push(rib);
        }
        const torso = mergeGeometries([robe, neck, ...ribs]);

        const head = new THREE.SphereGeometry(0.27, 24, 16);
        head.scale(0.86, 1.22, 0.95);

        // Long dark hair hanging around the face
        const hairParts = [];
        for (let i = 0; i < 22; i++) {
            const a = Math.PI * 0.32 + (i / 21) * Math.PI * 1.36; // around back and sides
            const len = rand(1.1, 1.7);
            const strand = new THREE.PlaneGeometry(rand(0.06, 0.1), len, 1, 6);
            strand.translate(0, -len / 2, 0);
            const sp = strand.attributes.position;
            for (let k = 0; k < sp.count; k++) {
                const y = sp.getY(k);
                const out = 0.06 + Math.pow(clamp(-y / len, 0, 1), 1.5) * rand(0.05, 0.18);
                sp.setZ(k, out);
                sp.setX(k, sp.getX(k) + Math.sin(-y * 3 + i) * 0.03);
            }
            strand.rotateY(a + Math.PI);
            strand.translate(Math.sin(a) * 0.22, 0.22, Math.cos(a) * 0.2);
            hairParts.push(strand);
        }
        const hair = mergeGeometries(hairParts);

        const upperArm = limbGeometry(0.045, 0.034, 1.25, 7);
        const fParts = [limbGeometry(0.034, 0.024, 1.15, 7)];
        for (let f = 0; f < 4; f++) {
            const finger = limbGeometry(0.01, 0.003, 0.42, 4);
            finger.rotateZ((f - 1.5) * 0.14);
            finger.translate((f - 1.5) * 0.018, -1.15, 0);
            fParts.push(finger);
        }
        const forearm = mergeGeometries(fParts);

        // Wing: a fan of ragged feathers
        const featherParts = [];
        const count = 13;
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const len = lerp(2.5, 1.0, t) * rand(0.85, 1.1);
            const f = new THREE.PlaneGeometry(0.34, len);
            f.translate(0, len / 2, 0);
            f.rotateZ(-lerp(0.25, 1.75, t));
            f.translate(0, -t * 0.25, -t * 0.02);
            featherParts.push(f);
        }
        const wing = mergeGeometries(featherParts);

        // Broken halo: arcs with gaps
        const haloParts = [];
        for (let k = 0; k < 5; k++) {
            const arc = new THREE.TorusGeometry(0.46, 0.026, 6, 16, 0.95);
            arc.rotateZ(k * 1.26 + rand(-0.05, 0.05));
            haloParts.push(arc);
        }
        const halo = mergeGeometries(haloParts);

        for (const g of [torso, head, hair, upperArm, forearm, wing, halo]) g.userData.shared = true;

        const face = Textures.angelFace();
        shared.angel = {
            torso, head, hair, upperArm, forearm, wing, halo,
            robe: markShared(new THREE.MeshStandardMaterial({ color: 0xb7afa1, roughness: 0.85, emissive: 0x181612 })),
            skin: markShared(new THREE.MeshStandardMaterial({ color: 0xc4bdb0, roughness: 0.6, emissive: 0x141210 })),
            face: markShared(new THREE.MeshStandardMaterial({
                map: face.map, emissiveMap: face.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.55
            })),
            hairMat: markShared(new THREE.MeshStandardMaterial({ color: 0x0a0807, roughness: 0.9, side: THREE.DoubleSide })),
            wingMat: markShared(new THREE.MeshStandardMaterial({
                color: 0xcfc8ba, roughness: 0.8, map: Textures.feather(), alphaTest: 0.5,
                side: THREE.DoubleSide, emissive: 0x121110
            })),
            haloMat: markShared(new THREE.MeshStandardMaterial({
                color: 0x332200, emissive: 0xffc04a, emissiveIntensity: 4, roughness: 0.3, fog: false
            }))
        };
        return shared.angel;
    }

    function stoneMaterials() {
        if (shared.stoneMats) return shared.stoneMats;
        const st = Textures.stone();
        const mk = (extra = {}) => markShared(new THREE.MeshStandardMaterial(Object.assign({
            map: st.map, normalMap: st.normalMap, roughnessMap: st.roughnessMap, roughness: 1, color: 0xb0aca4
        }, extra)));
        shared.stoneMats = {
            stone: mk(),
            stoneDouble: mk({ side: THREE.DoubleSide, alphaTest: 0.5, map: Textures.feather(), normalMap: null, roughnessMap: null, color: 0x8d8a82 })
        };
        return shared.stoneMats;
    }

    function createAngel({ statue = false } = {}) {
        const A = angelAssets();
        const S = statue ? stoneMaterials() : null;
        const robeMat = statue ? S.stone : A.robe;
        const skinMat = statue ? S.stone : A.skin;
        const faceMat = statue ? S.stone : A.face;
        const hairMat = statue ? S.stone : A.hairMat;
        const wingMat = statue ? S.stoneDouble : A.wingMat;

        const root = new THREE.Group();
        const body = new THREE.Group();
        root.add(body);
        const mesh = (geo, mat, parent, shadow = true) => {
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = shadow;
            parent.add(m);
            return m;
        };

        mesh(A.torso, robeMat, body);

        const neckPivot = new THREE.Group();
        neckPivot.position.y = 4.62;
        body.add(neckPivot);
        const headGroup = new THREE.Group();
        headGroup.position.y = 0.28;
        neckPivot.add(headGroup);
        mesh(A.head, faceMat, headGroup);
        mesh(A.hair, hairMat, headGroup, false);

        let halo = null, haloGlow = null, eyeGlows = [];
        if (!statue) {
            halo = mesh(A.halo, A.haloMat, headGroup, false);
            halo.position.set(0, 0.55, -0.12);
            halo.rotation.x = Math.PI / 2 - 0.35;
            haloGlow = glowSprite(0xffc860, 2.2, 0.55);
            haloGlow.position.copy(halo.position);
            headGroup.add(haloGlow);
            for (const side of [-1, 1]) {
                const g = glowSprite(0xfff4dd, 0.22, 0.8, true);
                g.position.set(side * 0.105, 0.03, 0.27);
                headGroup.add(g);
                eyeGlows.push(g);
            }
        }

        const arms = {};
        for (const side of [-1, 1]) {
            const key = side < 0 ? 'L' : 'R';
            const shoulder = new THREE.Group();
            shoulder.position.set(side * 0.3, 3.62, 0);
            shoulder.rotation.z = side * 0.18;
            body.add(shoulder);
            mesh(A.upperArm, skinMat, shoulder);
            const elbow = new THREE.Group();
            elbow.position.y = -1.25;
            elbow.rotation.x = -0.15;
            shoulder.add(elbow);
            mesh(A.forearm, skinMat, elbow);
            arms['shoulder' + key] = shoulder;
            arms['elbow' + key] = elbow;
        }

        const wings = [];
        for (const side of [-1, 1]) {
            const pivot = new THREE.Group();
            pivot.position.set(side * 0.14, 3.55, -0.2);
            pivot.rotation.y = side * -0.5;
            body.add(pivot);
            const w = mesh(A.wing, wingMat, pivot);
            w.scale.x = side;
            wings.push(pivot);
        }

        if (statue) {
            // Each statue holds a different, unsettling pose
            arms.shoulderL.rotation.x = rand(-2.6, -0.2);
            arms.shoulderR.rotation.x = rand(-2.6, -0.2);
            arms.elbowL.rotation.x = rand(-1.6, -0.2);
            arms.elbowR.rotation.x = rand(-1.6, -0.2);
            headGroup.rotation.set(rand(-0.3, 0.4), rand(-0.6, 0.6), rand(-0.3, 0.3));
            body.rotation.x = rand(0, 0.15);
            root.scale.setScalar(rand(0.75, 0.95));
        }

        const seed = Math.random() * 100;
        let flap = 0;
        return {
            root, body, headGroup, halo, haloGlow, eyeGlows, wings, arms,
            // charge: 0..1 (how hard it is charging), active: currently moving
            animate(dt, charge, active, time) {
                if (!active) return; // frozen statues hold their pose
                flap += dt * (2 + charge * 9);
                // Wings spread wider and beat harder the longer it charges
                const f = Math.sin(flap) * 0.35 * (0.3 + charge);
                const spread = 0.5 - charge * 0.45;
                wings[0].rotation.y = spread - f;
                wings[1].rotation.y = -spread + f;
                const reach = 0.6 + charge * 0.9;
                arms.shoulderL.rotation.x = damp(arms.shoulderL.rotation.x, -reach, 6, dt);
                arms.shoulderR.rotation.x = damp(arms.shoulderR.rotation.x, -reach, 6, dt);
                arms.elbowL.rotation.x = damp(arms.elbowL.rotation.x, -0.5 * charge, 6, dt);
                arms.elbowR.rotation.x = damp(arms.elbowR.rotation.x, -0.5 * charge, 6, dt);
                body.rotation.x = damp(body.rotation.x, 0.08 + charge * 0.22, 4, dt);
                body.position.y = 0.15 + Math.sin(time * 2.2 + seed) * 0.08;
                headGroup.rotation.z = Math.sin(time * 9 + seed) * 0.04 * charge;
                if (halo) halo.rotation.z += dt * (0.4 + charge * 6);
            },
            setIdlePose() {
                arms.shoulderL.rotation.x = -0.2;
                arms.shoulderR.rotation.x = -0.2;
            }
        };
    }

    // ---------------------------------------------------------------------------
    // Props
    // ---------------------------------------------------------------------------
    function metalMaterial() {
        if (!shared.metal) shared.metal = markShared(new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.45, metalness: 0.8 }));
        return shared.metal;
    }

    function woodMaterial() {
        if (!shared.wood) {
            const w = Textures.woodFloor();
            shared.wood = markShared(new THREE.MeshStandardMaterial({ map: w.map, normalMap: w.normalMap, roughness: 0.8, color: 0x9a8a7a }));
        }
        return shared.wood;
    }

    // Hanging industrial lamp (static parts + bulb). Returned bulb material lets us flicker it.
    function createLamp(cordLength) {
        if (!shared.lampGeo) {
            const cord = new THREE.CylinderGeometry(0.012, 0.012, 1, 4);
            cord.translate(0, 0.5, 0);
            const shade = new THREE.ConeGeometry(0.42, 0.32, 18, 1, true);
            shade.translate(0, 0.0, 0);
            const cap = new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10);
            cap.translate(0, 0.18, 0);
            shared.lampGeo = mergeGeometries([shade, cap]);
            shared.lampGeo.userData.shared = true;
            shared.cordGeo = cord;
            cord.userData.shared = true;
            shared.bulbGeo = new THREE.SphereGeometry(0.1, 12, 8);
            shared.bulbGeo.userData.shared = true;
            shared.lampMat = markShared(new THREE.MeshStandardMaterial({ color: 0x1c1b19, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide }));
        }
        const g = new THREE.Group();
        const cord = new THREE.Mesh(shared.cordGeo, shared.lampMat);
        cord.scale.y = cordLength;
        cord.position.y = 0.16;
        g.add(cord);
        const shade = new THREE.Mesh(shared.lampGeo, shared.lampMat);
        shade.castShadow = false;
        g.add(shade);
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb060, emissiveIntensity: 6 });
        const bulb = new THREE.Mesh(shared.bulbGeo, bulbMat);
        bulb.position.y = -0.06;
        g.add(bulb);
        const glow = glowSprite(0xffa850, 2.6, 0.55, true);
        glow.position.y = -0.15;
        g.add(glow);
        return { group: g, bulbMat, glow };
    }

    function createBattery() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 16), new THREE.MeshStandardMaterial({ color: 0x1a1d1a, roughness: 0.35, metalness: 0.6 }));
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x0c2a12, emissive: 0x29ff6a, emissiveIntensity: 1.8 }));
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), metalMaterial());
        cap.position.y = 0.18;
        body.castShadow = true;
        g.add(body, band, cap);
        const glow = glowSprite(0x3dff7a, 1.4, 0.45, true);
        g.add(glow);
        return { group: g, glow };
    }

    function createRelic() {
        const g = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.9, roughness: 0.25, emissive: 0x3a2400 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.1, 8), gold);
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.18, 8), gold);
        top.position.y = 0.44;
        g.add(base, top);
        for (let i = 0; i < 4; i++) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 5), gold);
            const a = (i / 4) * TAU + Math.PI / 4;
            post.position.set(Math.cos(a) * 0.13, 0.2, Math.sin(a) * 0.13);
            g.add(post);
        }
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe08a, emissiveIntensity: 5 }));
        orb.position.y = 0.2;
        g.add(orb);
        const glow = glowSprite(0xffd780, 2.2, 0.6, false);
        glow.position.y = 0.2;
        g.add(glow);
        base.castShadow = true;
        return { group: g, glow, orb };
    }

    // A note on a crate (level 1) or a stone plinth (level 2) with a guttering candle
    function createNoteStand(stoneBase) {
        const g = new THREE.Group();
        let topY;
        if (stoneBase) {
            const m = stoneMaterials().stone;
            const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 10), m);
            plinth.position.y = 0.45;
            plinth.castShadow = true;
            plinth.receiveShadow = true;
            g.add(plinth);
            topY = 0.9;
        } else {
            const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.55), woodMaterial());
            crate.position.y = 0.3;
            crate.castShadow = true;
            crate.receiveShadow = true;
            g.add(crate);
            topY = 0.6;
        }
        const paperMat = new THREE.MeshStandardMaterial({ map: Textures.paper(), roughness: 0.9, emissive: 0x2a2418, emissiveMap: Textures.paper() });
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), paperMat);
        paper.rotation.x = -Math.PI / 2;
        paper.rotation.z = rand(-0.4, 0.4);
        paper.position.set(-0.06, topY + 0.005, 0);
        g.add(paper);

        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.6, emissive: 0x2a1a08 }));
        candle.position.set(0.2, topY + 0.08, 0.1);
        g.add(candle);
        const flameMat = new THREE.SpriteMaterial({ map: Textures.flame(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        const flameSprite = new THREE.Sprite(flameMat);
        flameSprite.scale.set(0.06, 0.12, 1);
        flameSprite.position.set(0.2, topY + 0.22, 0.1);
        g.add(flameSprite);
        const glow = glowSprite(0xffb060, 1.6, 0.5, true);
        glow.position.copy(flameSprite.position);
        g.add(glow);
        return { group: g, flame: flameSprite, glow, paperMat };
    }

    // Green emergency exit door set into a wall
    function createExitDoor() {
        const g = new THREE.Group();
        const frameMat = metalMaterial();
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x1f3a26, roughness: 0.55, metalness: 0.6, emissive: 0x03220c });
        const parts = [
            [0.2, 3.3, 0.35, -1.25, 1.65], [0.2, 3.3, 0.35, 1.25, 1.65], [2.7, 0.22, 0.35, 0, 3.32]
        ];
        for (const [w, h, d, x, y] of parts) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
            m.position.set(x, y, 0);
            m.castShadow = true;
            g.add(m);
        }
        const door = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.2, 0.12), doorMat);
        door.position.set(0, 1.6, -0.05);
        g.add(door);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.25 }));
        bar.position.set(0, 1.15, 0.08);
        g.add(bar);
        const signMat = new THREE.MeshStandardMaterial({ map: Textures.exitSign(), emissive: 0xffffff, emissiveMap: Textures.exitSign(), emissiveIntensity: 2.2 });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.38, 0.06), [frameMat, frameMat, frameMat, frameMat, signMat, frameMat]);
        sign.position.set(0, 3.75, 0.05);
        g.add(sign);
        const glow = glowSprite(0x33ff77, 4.5, 0.35, true);
        glow.position.set(0, 3.7, 0.4);
        g.add(glow);
        const doorGlow = glowSprite(0x22ff66, 6, 0.12, true);
        doorGlow.position.set(0, 1.6, 0.5);
        g.add(doorGlow);
        return { group: g, glow, doorMat };
    }

    // Level 2 exit: a pillar of golden light inside a ring of standing stones
    function createPortal() {
        const g = new THREE.Group();
        const stoneMat = stoneMaterials().stone;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            const h = rand(2.2, 3.6);
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.45), stoneMat);
            s.position.set(Math.cos(a) * 3.4, h / 2 - 0.1, Math.sin(a) * 3.4);
            s.rotation.set(rand(-0.08, 0.08), -a, rand(-0.08, 0.08));
            s.castShadow = true;
            g.add(s);
        }
        const beamMat = new THREE.ShaderMaterial({
            uniforms: { time: pointUniforms.time, color: { value: new THREE.Color(1.6, 1.15, 0.45) } },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: /* glsl */`
                uniform float time; uniform vec3 color; varying vec2 vUv;
                void main() {
                    float fade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - vUv.y);
                    float bands = 0.65 + 0.35 * sin(vUv.y * 30.0 - time * 3.0 + vUv.x * 12.566);
                    gl_FragColor = vec4(color * bands, fade * 0.55);
                }`,
            transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
        });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 22, 32, 1, true), beamMat);
        beam.position.y = 11;
        g.add(beam);
        const core = glowSprite(0xffd070, 9, 0.6, false);
        core.position.y = 2;
        g.add(core);
        const motes = smokePoints(markShared(smokeMaterial(0xffd890, 0.9, 0.06)), 120, 1.4, 4);
        motes.material.blending = THREE.AdditiveBlending;
        g.add(motes);
        return { group: g, core };
    }

    // ---------------------------------------------------------------------------
    // First-person hands: flashlight (right) and match (left)
    // ---------------------------------------------------------------------------
    function createViewModels(envMap) {
        const fl = Assets.ok ? Assets.flashlight() : null;
        if (!fl) return createViewModelsProcedural();
        const torch = new THREE.Group();
        const kn = Textures.knurl();
        const metal = (extra) => new THREE.MeshStandardMaterial(Object.assign({
            color: 0x2c2d31, metalness: 0.85, roughness: 0.3, envMap, envMapIntensity: 1.6
        }, extra));
        const lensMat = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2cc, emissiveIntensity: 4, roughness: 0.1 });
        const reflMat = metal({ color: 0xe8e8e8, metalness: 1, roughness: 0.08, emissive: 0xfff0d0, emissiveIntensity: 0 });
        const mats = {
            body: metal(),
            grip: metal({ map: kn.map, normalMap: kn.normalMap, roughnessMap: kn.roughnessMap, roughness: 1, color: 0x8a8a90, normalScale: new THREE.Vector2(1.5, 1.5) }),
            rubber: new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.92 }),
            reflector: reflMat,
            lens: lensMat
        };
        fl.traverse((o) => {
            if (!o.isMesh) return;
            const n = (o.material.name || '').toLowerCase();
            o.material = mats[n] || mats.body;
            o.castShadow = false;
            o.receiveShadow = false;
        });
        // Model runs from the tail (z = 0) to the lens (z = -0.222); hold it by the grip
        fl.position.z = 0.02;
        torch.add(fl);
        const basePos = new THREE.Vector3(0.19, -0.19, -0.3);
        torch.position.copy(basePos);
        const vm = createViewModelsProcedural();
        return { torch, basePos, baseYaw: 0.07, lensMat, reflMat, lensZ: -0.2, match: vm.match, flame: vm.flame, mglow: vm.mglow };
    }

    // Generates a dim, studio-like reflection environment for polished metal
    function createEnvMap(renderer) {
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0x050506);
        const box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x0a0a0c, side: THREE.BackSide }));
        envScene.add(box);
        const panel = (w, h, color, pos) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
            m.position.copy(pos);
            m.lookAt(0, 0, 0);
            envScene.add(m);
        };
        panel(3, 1.2, 0x8a8070, new THREE.Vector3(0, 4.5, -1));
        panel(1.5, 3, 0x40383a, new THREE.Vector3(-4.5, 0.5, 1));
        panel(1.2, 2, 0x2a2e36, new THREE.Vector3(4.5, -0.5, -2));
        const pm = new THREE.PMREMGenerator(renderer);
        const tex = pm.fromScene(envScene, 0.03).texture;
        pm.dispose();
        envScene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        return tex;
    }

    function createViewModelsProcedural() {
        const torch = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.24, 14), new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.35, metalness: 0.85 }));
        body.rotation.x = Math.PI / 2;
        torch.add(body);
        const headMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.027, 0.07, 16), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.3, metalness: 0.9 }));
        headMesh.rotation.x = Math.PI / 2;
        headMesh.position.z = -0.15;
        torch.add(headMesh);
        const lensMat = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2cc, emissiveIntensity: 4 });
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.033, 16), lensMat);
        lens.position.z = -0.186;
        lens.rotation.y = Math.PI;
        torch.add(lens);
        const grip = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 4, 12), new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.8 }));
        grip.position.z = 0.04;
        torch.add(grip);
        torch.position.set(0.17, -0.17, -0.34);
        torch.traverse((o) => { if (o.isMesh) o.castShadow = false; });

        const match = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 5), new THREE.MeshStandardMaterial({ color: 0x9c7a4a, roughness: 0.9 }));
        stick.position.y = -0.065;
        match.add(stick);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff4010, emissiveIntensity: 2 }));
        match.add(tip);
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: Textures.flame(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        flame.scale.set(0.035, 0.07, 1);
        flame.position.y = 0.03;
        match.add(flame);
        const mglow = glowSprite(0xffa040, 0.35, 0.6, false);
        mglow.position.y = 0.025;
        match.add(mglow);
        match.position.set(-0.16, -0.12, -0.3);
        match.rotation.z = 0.25;
        match.visible = false;

        return { torch, basePos: torch.position.clone(), baseYaw: 0, lensMat, reflMat: null, lensZ: -0.2, match, flame, mglow };
    }

    return {
        pointUniforms, glowSprite, smokeMaterial, smokePoints, stoneMaterials, metalMaterial,
        createWatcher, createAngel, createLamp, createBattery, createRelic, createNoteStand,
        createExitDoor, createPortal, createViewModels, createEnvMap
    };
})();
