// THE WATCHING DARK - grass
// A field of real grass blades around the camera, plus the matching ground texture under it.
// One tile of clumps is drawn instanced, cut into square blocks. Each block moves to its copy
// nearest the camera, so the field is endless while only one tile is ever drawn - and blocks
// behind you or past the fade are skipped outright.
'use strict';

const Grass = (() => {
    // One clump: a few tapered, curved blades leaning outward. Built 1 unit tall; the shader
    // scales the whole clump to the grass height at that spot.
    function clumpGeometry(blades, spread) {
        const pos = [], nor = [], uv = [], idx = [];
        const SEG = [0, 0.5];
        for (let b = 0; b < blades; b++) {
            const a = rand(0, TAU);
            const off = Math.sqrt(Math.random()) * spread;    // spread over a disc so clumps merge into a carpet
            const bx = Math.cos(a) * off, bz = Math.sin(a) * off;
            const face = rand(0, TAU);                       // the way the blade's flat side points
            const fx = Math.cos(face), fz = Math.sin(face);  // across the blade
            const la = a + rand(-0.8, 0.8);
            const lean = rand(0.1, 0.4);                     // how far the tip falls over
            const lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
            const h = rand(0.45, 1.0), w = rand(0.05, 0.085);
            // Facing normal, tilted toward the sky so a field lights evenly
            const nx = -fz * 0.45, nz = fx * 0.45, ny = 0.9;
            const base = pos.length / 3;
            for (let s = 0; s < SEG.length; s++) {
                const t = SEG[s];
                const bend = t * t;
                const half = w * (1 - t * 0.85) * 0.5;
                const cx = bx + lx * bend, cy = h * t, cz = bz + lz * bend;
                pos.push(cx - fx * half, cy, cz - fz * half, cx + fx * half, cy, cz + fz * half);
                for (let k = 0; k < 2; k++) nor.push(nx, ny, nz);
                uv.push(0, t, 1, t);
            }
            pos.push(bx + lx, h, bz + lz);
            nor.push(nx, ny, nz);
            uv.push(0.5, 1);
            for (let s = 0; s < SEG.length - 1; s++) {
                const i = base + s * 2;
                idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
            }
            const last = base + (SEG.length - 1) * 2;
            idx.push(last, last + 1, last + 2);
        }
        const g = new THREE.InstancedBufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        return g;
    }

    const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

    // opts: tile (m), density (clumps per m²), height (m), blades, spread (clump radius per unit
    // height), fade [from, to] (m from the camera, where it shrinks away), fadeIn [from, to] (where
    // it grows in - for a sparser far layer around a dense near one), wind, base / tip / dry colours
    // and up to 8 clearings
    function createField(opts) {
        const o = Object.assign({
            tile: 30, density: 4, height: 0.42, blades: 6, spread: 0.55, fade: [10, 14], fadeIn: [-2, -1], wind: 0.12,
            base: 0x1d3112, tip: 0x5f8a32, dry: 0x8c8248, dryAmount: 0.35
        }, opts);
        const clump = clumpGeometry(o.blades, o.spread);
        const per = Math.max(1, Math.round(o.tile / Math.max(5, o.tile / 10)));
        const B = o.tile / per;                       // block size
        const perBlock = Math.round(B * B * o.density);
        const hMax = o.height * 1.15 * 1.3 * 1.2;
        const reach = B * 0.7072 + hMax * (o.spread + 0.6) + hMax;

        const clear = [];
        for (let i = 0; i < 8; i++) clear.push(new THREE.Vector3(0, 0, 0));
        const uniforms = {
            uCenter: { value: new THREE.Vector2() },
            uTile: { value: o.tile },
            uTime: { value: 0 },
            uHeight: { value: o.height },
            uFade: { value: new THREE.Vector2(o.fade[0], o.fade[1]) },
            uFadeIn: { value: new THREE.Vector2(o.fadeIn[0], o.fadeIn[1]) },
            uWind: { value: o.wind },
            uClear: { value: clear },
            uBase: { value: lin(o.base) },
            uTip: { value: lin(o.tip) },
            uDry: { value: lin(o.dry) },
            uDryAmount: { value: o.dryAmount }
        };

        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
        mat.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>
                    attribute vec4 aInst;
                    uniform vec2 uCenter;
                    uniform float uTime, uHeight, uWind;
                    uniform vec2 uFade, uFadeIn;
                    uniform vec3 uClear[8];
                    varying float vT;
                    varying float vDry;
                    varying float vTint;
                    float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
                    float gNoise(vec2 p) {
                        vec2 i = floor(p), f = fract(p);
                        f = f * f * (3.0 - 2.0 * f);
                        return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
                    }`)
                .replace('#include <beginnormal_vertex>', `
                    // Where this clump stands in the world (its block is placed by the model matrix)
                    vec2 gp = modelMatrix[3].xz + aInst.xy;
                    float gr = aInst.z + gHash(gp) * 2.0;
                    float gc = cos(gr), gs = sin(gr);
                    vec3 objectNormal = vec3(gc * normal.x - gs * normal.z, normal.y, gs * normal.x + gc * normal.z);`)
                .replace('#include <begin_vertex>', `
                    float gPatch = gNoise(gp * 0.09) * 0.65 + gNoise(gp * 0.37) * 0.35;
                    float gH = uHeight * aInst.w * mix(0.45, 1.3, gPatch) * (0.8 + gHash(gp + 7.1) * 0.4);
                    float gD = length(gp - uCenter);
                    gH *= (1.0 - smoothstep(uFade.x, uFade.y, gD)) * smoothstep(uFadeIn.x, uFadeIn.y, gD);
                    for (int i = 0; i < 8; i++) {
                        if (uClear[i].z > 0.0) gH *= smoothstep(uClear[i].z * 0.55, uClear[i].z, length(gp - uClear[i].xy));
                    }
                    vec3 transformed = vec3(gc * position.x - gs * position.z, position.y, gs * position.x + gc * position.z) * gH;
                    // Wind: a slow rolling swell across the field with a quicker flutter on top
                    float gW = sin(uTime * 1.3 + gp.x * 0.21 + gp.y * 0.13) * 0.6
                             + sin(uTime * 3.1 + gp.x * 0.9 - gp.y * 0.7) * 0.25
                             + gNoise(gp * 0.05 + uTime * vec2(0.18, 0.07)) * 0.9;
                    float gBend = uv.y * uv.y * gH;
                    transformed.xz += vec2(0.93, 0.37) * gW * uWind * gBend * 2.0;
                    transformed.y -= abs(gW) * uWind * gBend * 0.6;
                    transformed.xz += aInst.xy;
                    vT = uv.y;
                    vDry = smoothstep(0.55, 0.85, gNoise(gp * 0.06 + 13.7)) * 0.8 + gHash(gp + 3.3) * 0.2;
                    vTint = 0.82 + gHash(gp + 1.9) * 0.3;`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
                    uniform vec3 uBase, uTip, uDry;
                    uniform float uDryAmount;
                    varying float vT;
                    varying float vDry;
                    varying float vTint;`)
                .replace('#include <color_fragment>', `
                    vec3 gCol = mix(uBase, uTip, smoothstep(0.0, 1.0, vT));
                    gCol = mix(gCol, uDry * mix(0.55, 1.0, vT), vDry * uDryAmount);
                    gCol *= vTint * mix(0.45, 1.0, smoothstep(0.0, 0.6, vT));
                    diffuseColor.rgb *= gCol;`)
                .replace('#include <normal_fragment_begin>', `
                    vec3 normal = normalize(vNormal);
                    vec3 geometryNormal = normal;`);
        };

        const mesh = new THREE.Group();
        const blocks = [];
        for (let bx = 0; bx < per; bx++) {
            for (let bz = 0; bz < per; bz++) {
                const g = new THREE.InstancedBufferGeometry();
                for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, clump.attributes[k]);
                g.setIndex(clump.index);
                const inst = new Float32Array(perBlock * 4);
                for (let i = 0, k = 0; i < perBlock; i++) {
                    inst[k++] = Math.random() * B;
                    inst[k++] = Math.random() * B;
                    inst[k++] = Math.random() * TAU;
                    inst[k++] = rand(0.6, 1.15);
                }
                g.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 4));
                g.instanceCount = perBlock;
                g.boundingSphere = new THREE.Sphere(new THREE.Vector3(B / 2, hMax / 2, B / 2), reach);
                const m = new THREE.Mesh(g, mat);
                m.receiveShadow = true;
                m.castShadow = false;
                m.matrixAutoUpdate = false;
                m.userData.origin = new THREE.Vector2(bx * B, bz * B);
                mesh.add(m);
                blocks.push(m);
            }
        }

        return {
            mesh,
            uniforms,
            update(time, pos) {
                uniforms.uTime.value = time;
                uniforms.uCenter.value.set(pos.x, pos.z);
                const T = o.tile, h = B / 2;
                for (const m of blocks) {
                    const ox = m.userData.origin.x, oz = m.userData.origin.y;
                    const x = ox + T * Math.floor((pos.x - ox - h) / T + 0.5);
                    const z = oz + T * Math.floor((pos.z - oz - h) / T + 0.5);
                    // Skip blocks wholly past the fade (or wholly inside a far layer's hole)
                    const dx = Math.max(0, Math.abs(pos.x - x - h) - h), dz = Math.max(0, Math.abs(pos.z - z - h) - h);
                    const near = Math.hypot(dx, dz);
                    const far = Math.hypot(Math.abs(pos.x - x - h) + h, Math.abs(pos.z - z - h) + h);
                    m.visible = near < o.fade[1] && far > o.fadeIn[0];
                    if (m.position.x !== x || m.position.z !== z) {
                        m.position.set(x, 0, z);
                        m.updateMatrix();
                    }
                }
            },
            // Keep the grass short around things that lie on the ground (pickups and the like)
            setClearings(list) {
                for (let i = 0; i < 8; i++) {
                    const c = list[i];
                    if (c) clear[i].set(c.x, c.z, c.r);
                    else clear[i].set(0, 0, 0);
                }
            },
            dispose() {
                for (const m of blocks) m.geometry.dispose();
                clump.dispose();
                mat.dispose();
            }
        };
    }

    // Large, slow colour drift across a ground plane (lusher and drier stretches), via vertex colours
    function tintGround(geo, scale, amount = 0.35) {
        const p = geo.attributes.position;
        const col = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i) * scale, y = p.getY(i) * scale;
            const n = Noise.value3(x, y, 0.5) * 0.65 + Noise.value3(x * 3.1, y * 3.1, 4.5) * 0.35;
            const k = 1 - amount + n * amount * 2;
            const dry = Math.max(0, n - 0.55) * 0.6;
            col[i * 3] = k * (1 + dry * 0.5);
            col[i * 3 + 1] = k;
            col[i * 3 + 2] = k * (1 - dry * 0.5);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return geo;
    }

    return { createField, tintGround };
})();
