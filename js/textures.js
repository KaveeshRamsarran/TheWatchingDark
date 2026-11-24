// THE WATCHING DARK - procedural textures
// Every surface is generated at load time from tileable noise, producing colour,
// normal and roughness maps so the flashlight picks up real surface relief.
'use strict';

const Textures = (() => {
    const cache = {};
    let maxAniso = 4;

    function setRenderer(renderer) {
        maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }

    function makeCanvas(w, h = w) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }

    function toTexture(canvas, { srgb = true, repeat = true, mipmaps = true } = {}) {
        const t = new THREE.CanvasTexture(canvas);
        if (srgb) t.encoding = THREE.sRGBEncoding;
        if (repeat) {
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
        }
        t.anisotropy = maxAniso;
        t.generateMipmaps = mipmaps;
        t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        return t;
    }

    // Run a per-pixel sampler and build colour / normal / roughness canvases.
    // sampler(u, v, out) must set out.r, out.g, out.b (0-255), out.h (height 0-1), out.ro (roughness 0-1)
    // With emissive = true the sampler may also set out.e (0-1) for an emissive mask.
    function buildMaps(size, sampler, normalStrength = 2.0, emissive = false) {
        const colorC = makeCanvas(size), normalC = makeCanvas(size), roughC = makeCanvas(size);
        const cctx = colorC.getContext('2d'), nctx = normalC.getContext('2d'), rctx = roughC.getContext('2d');
        const cimg = cctx.createImageData(size, size);
        const nimg = nctx.createImageData(size, size);
        const rimg = rctx.createImageData(size, size);
        const emissiveC = emissive ? makeCanvas(size) : null;
        const eimg = emissive ? emissiveC.getContext('2d').createImageData(size, size) : null;
        const heights = new Float32Array(size * size);
        const out = { r: 0, g: 0, b: 0, h: 0, ro: 0.8, e: 0 };
        const inv = 1 / size;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                out.ro = 0.8;
                out.e = 0;
                sampler((x + 0.5) * inv, (y + 0.5) * inv, out);
                const i = y * size + x, p = i * 4;
                if (eimg) {
                    const e = clamp(out.e, 0, 1) * 255;
                    eimg.data[p] = e;
                    eimg.data[p + 1] = e * 0.25;
                    eimg.data[p + 2] = e * 0.2;
                    eimg.data[p + 3] = 255;
                }
                cimg.data[p] = out.r;
                cimg.data[p + 1] = out.g;
                cimg.data[p + 2] = out.b;
                cimg.data[p + 3] = 255;
                const ro = clamp(out.ro, 0.04, 1) * 255;
                rimg.data[p] = ro;
                rimg.data[p + 1] = ro;
                rimg.data[p + 2] = ro;
                rimg.data[p + 3] = 255;
                heights[i] = out.h;
            }
        }

        // Tileable central-difference normals
        for (let y = 0; y < size; y++) {
            const ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, yc = y * size;
            for (let x = 0; x < size; x++) {
                const xm = (x - 1 + size) % size, xp = (x + 1) % size;
                const dx = (heights[yc + xp] - heights[yc + xm]) * normalStrength;
                const dy = (heights[yp + x] - heights[ym + x]) * normalStrength;
                let nx = -dx, ny = dy, nz = 1;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                nx /= len; ny /= len; nz /= len;
                const p = (yc + x) * 4;
                nimg.data[p] = (nx * 0.5 + 0.5) * 255;
                nimg.data[p + 1] = (ny * 0.5 + 0.5) * 255;
                nimg.data[p + 2] = (nz * 0.5 + 0.5) * 255;
                nimg.data[p + 3] = 255;
            }
        }

        cctx.putImageData(cimg, 0, 0);
        nctx.putImageData(nimg, 0, 0);
        rctx.putImageData(rimg, 0, 0);
        if (emissiveC) emissiveC.getContext('2d').putImageData(eimg, 0, 0);
        return { colorC, normalC, roughC, emissiveC };
    }

    function mapsToTextures({ colorC, normalC, roughC, emissiveC }) {
        const out = {
            map: toTexture(colorC),
            normalMap: toTexture(normalC, { srgb: false }),
            roughnessMap: toTexture(roughC, { srgb: false })
        };
        if (emissiveC) out.emissiveMap = toTexture(emissiveC);
        return out;
    }

    // -------------------------------------------------------------------------
    // Level 1: stained institutional concrete. Canvas top = ceiling, bottom = floor.
    // One tile covers 4 world units horizontally and the full wall height.
    // -------------------------------------------------------------------------
    function concreteWall() {
        if (cache.wall) return cache.wall;
        const size = 512;
        const maps = buildMaps(size, (u, d, o) => {
            const big = Noise.fbm(u, d, 3, 4);
            const mid = Noise.fbm(u, d, 14, 3);
            const fine = Noise.value2(u * 160, d * 160, 160, 160);
            const pore = Noise.value2(u * 96 + 0.5, d * 96 + 0.5, 96, 96);

            // Formwork panel seams and tie holes
            const seamH = Math.min(Math.abs(d - 0.34), Math.abs(d - 0.68)) * size;
            const seamV = Math.min(u, 1 - u, Math.abs(u - 0.5)) * size;
            const seam = 1 - smoothstep(0.5, 2.6, Math.min(seamH, seamV));
            const tieU = Math.abs(((u * 4) % 1) - 0.5) * size / 4;
            const tieD = Math.min(Math.abs(d - 0.17), Math.abs(d - 0.51), Math.abs(d - 0.85)) * size;
            const tie = 1 - smoothstep(2, 5, Math.sqrt(tieU * tieU + tieD * tieD));

            // Water streaks running down from the ceiling
            const streakCol = Noise.fbm(u, 0.3, 32, 2);
            const streak = smoothstep(0.52, 0.78, Noise.value2(u * 64, d * 2.5, 64, 3) * 0.55 + streakCol * 0.55) *
                (1 - smoothstep(0.1, 0.85, d));

            // Grime creeping up from the floor
            const grime = smoothstep(0.72, 1.0, d + (big - 0.5) * 0.3 + (mid - 0.5) * 0.08);
            const pit = pore > 0.86 ? (pore - 0.86) * 7 : 0;

            let shade = 0.5 + big * 0.5 + (mid - 0.5) * 0.3 + (fine - 0.5) * 0.14;
            let r = 124 * shade, g = 120 * shade, b = 113 * shade;
            r *= 1 - streak * 0.42; g *= 1 - streak * 0.4; b *= 1 - streak * 0.36;
            r = lerp(r, 36, grime * 0.85); g = lerp(g, 34, grime * 0.85); b = lerp(b, 26, grime * 0.85);
            const dark = 1 - seam * 0.55 - tie * 0.7 - pit * 0.5;
            o.r = clamp(r * dark, 0, 255);
            o.g = clamp(g * dark, 0, 255);
            o.b = clamp(b * dark, 0, 255);
            o.h = 0.5 + (mid - 0.5) * 0.35 + (fine - 0.5) * 0.25 - seam * 0.5 - tie * 0.7 - pit * 0.4;
            o.ro = 0.92 - streak * 0.45 - grime * 0.1 + (fine - 0.5) * 0.08;
        }, 3.0);
        cache.wall = mapsToTextures(maps);
        return cache.wall;
    }

    // Old hardwood floor: staggered planks, grain, grime and worn varnish. Tile = 4 units.
    function woodFloor() {
        if (cache.floor) return cache.floor;
        const size = 512, cols = 6;
        const maps = buildMaps(size, (u, v, o) => {
            const cx = Math.floor(u * cols);
            const lu = u * cols - cx;
            const off = Noise.hash2(cx * 7 + 3, 11);
            const vv = v + off;
            const seg = Math.floor(vv * 2);
            const lv = vv * 2 - seg;
            const pid = Noise.hash2(cx * 5 + 1, (seg % 2) * 13 + 2);

            const grain = Noise.fbm(u + pid * 0.37, v, 64, 3, 0.55, 3);
            const warp = Noise.fbm(u, v, 6, 3, 0.5, 2);
            const rings = 0.5 + 0.5 * Math.sin((lu * 5 + warp * 9 + pid * 12) * Math.PI);
            const dirt = Noise.fbm(u, v, 3, 4);
            const wear = Noise.fbm(u, v, 10, 3);

            const gapX = Math.min(lu, 1 - lu) * (size / cols);
            const gapY = Math.min(lv, 1 - lv) * (size / 2);
            const edge = Math.min(gapX, gapY);
            const gap = 1 - smoothstep(0.4, 2.2, edge);
            const bevel = smoothstep(0, 5, edge);

            const tone = 0.7 + pid * 0.55;
            let r = 86 * tone, g = 57 * tone, b = 36 * tone;
            const k = (0.62 + grain * 0.45 + rings * 0.14) * (0.62 + dirt * 0.6);
            r *= k; g *= k; b *= k;
            // Worn walkway areas are lighter and duller
            const worn = smoothstep(0.55, 0.8, wear);
            r = lerp(r, r * 1.25 + 8, worn * 0.4); g = lerp(g, g * 1.2 + 6, worn * 0.4); b = lerp(b, b * 1.15 + 4, worn * 0.4);
            const dk = 1 - gap * 0.85;
            o.r = clamp(r * dk, 0, 255);
            o.g = clamp(g * dk, 0, 255);
            o.b = clamp(b * dk, 0, 255);
            o.h = bevel * 0.6 + grain * 0.25 + rings * 0.05;
            o.ro = 0.42 + (1 - dirt) * 0.25 + worn * 0.25 + gap * 0.3;
        }, 2.2);
        cache.floor = mapsToTextures(maps);
        return cache.floor;
    }

    // Poured concrete slab: saw-cut control joints, exposed aggregate, hairline cracks and
    // damp, glossy stains that catch the flashlight. Tile = 4 units (joints every 4 units).
    function concreteFloor() {
        if (cache.concreteFloor) return cache.concreteFloor;
        const size = 512;
        const maps = buildMaps(size, (u, v, o) => {
            const big = Noise.fbm(u, v, 3, 4);
            const mid = Noise.fbm(u + 0.31, v + 0.17, 12, 3);
            const fine = Noise.value2(u * 180, v * 180, 180, 180);
            const w = Noise.worley(u, v, 42);
            const stone = (1 - smoothstep(0.12, 0.3, w.f1)) * (w.id > 0.62 ? 1 : 0);
            const stoneTone = w.id;

            // Saw-cut joints along the tile edges
            const ju = Math.min(u, 1 - u) * size, jv = Math.min(v, 1 - v) * size;
            const joint = 1 - smoothstep(0.6, 2.4, Math.min(ju, jv));
            const chip = joint > 0.01 ? smoothstep(0.75, 0.9, Noise.value2(u * 90, v * 90, 90, 90)) * 0.4 : 0;

            // Hairline cracks wandering across the slab
            const cn = Noise.fbm(u, v, 5, 4);
            const crack = (1 - smoothstep(0.0, 0.007, Math.abs(cn - 0.5))) *
                smoothstep(0.42, 0.62, Noise.fbm(u + 0.5, v + 0.5, 3, 2));

            // Oil and water stains: darker and glossier
            const stain = smoothstep(0.6, 0.74, Noise.fbm(u + 0.7, v + 0.2, 4, 4));
            const damp = smoothstep(0.52, 0.78, Noise.fbm(u + 0.2, v + 0.9, 2, 3));

            const shade = 0.58 + big * 0.38 + (mid - 0.5) * 0.25 + (fine - 0.5) * 0.12;
            let r = 112 * shade, g = 109 * shade, b = 103 * shade;
            r = lerp(r, 120 + stoneTone * 40, stone * 0.4);
            g = lerp(g, 114 + stoneTone * 34, stone * 0.4);
            b = lerp(b, 104 + stoneTone * 30, stone * 0.4);
            r *= 1 - stain * 0.5; g *= 1 - stain * 0.48; b *= 1 - stain * 0.42;
            r *= 1 - damp * 0.22; g *= 1 - damp * 0.2; b *= 1 - damp * 0.18;
            const dk = 1 - joint * 0.72 - crack * 0.6 - chip * 0.3;
            o.r = clamp(r * dk, 0, 255);
            o.g = clamp(g * dk, 0, 255);
            o.b = clamp(b * dk, 0, 255);
            o.h = 0.5 + (mid - 0.5) * 0.3 + (fine - 0.5) * 0.22 + stone * 0.18 - joint * 0.65 - crack * 0.5 - chip * 0.3;
            o.ro = 0.88 - stain * 0.42 - damp * 0.38 + (fine - 0.5) * 0.1 + joint * 0.1;
        }, 2.5);
        cache.concreteFloor = mapsToTextures(maps);
        return cache.concreteFloor;
    }

    // Living tissue for the final level: wet muscle fibre, dark veins (which glow through the
    // emissive mask when the walls pulse), yellow fat, nodules and blackened sores.
    // vRep tiles the pattern vertically (walls stretch one tile over their full height).
    function flesh(vRep = 1, wall = false) {
        const key = 'flesh_' + vRep + (wall ? 'w' : '');
        if (cache[key]) return cache[key];
        const size = 512;
        const maps = buildMaps(size, (u, v, o) => {
            const vv = (v * vRep) % 1;
            const warp = (Noise.fbm(u, vv, 4, 3) - 0.5) * 0.08;
            const base = Noise.fbm(u + warp, vv, 5, 4);
            const fiber = 0.5 + 0.5 * Math.sin((u * 46 + Noise.fbm(u, vv, 3, 3) * 9) * TAU);
            const w = Noise.worley((u + warp + 1) % 1, vv, 7);
            const vein = 1 - smoothstep(0.0, 0.05, w.f2 - w.f1);
            const w2 = Noise.worley((u + 0.31) % 1, (vv + 0.17) % 1, 19);
            const capillary = 1 - smoothstep(0.0, 0.025, w2.f2 - w2.f1);
            const fat = smoothstep(0.64, 0.8, Noise.fbm((u + 0.5) % 1, (vv + 0.3) % 1, 6, 3));
            const n = Noise.worley((u + 0.7) % 1, (vv + 0.4) % 1, 26);
            const nodule = (1 - smoothstep(0.0, 0.38, n.f1)) * (n.id > 0.78 ? 1 : 0);
            const sore = smoothstep(0.72, 0.86, Noise.fbm((u + 0.2) % 1, (vv + 0.6) % 1, 8, 3));

            const k = 0.9 + fiber * (wall ? 0.09 : 0.07);
            let r = (118 + base * 80) * k, g = (20 + base * 24) * k, b = (26 + base * 20) * k;
            r = lerp(r, 205, fat * 0.55); g = lerp(g, 156, fat * 0.55); b = lerp(b, 92, fat * 0.55);
            r = lerp(r, 214, nodule * 0.7); g = lerp(g, 172, nodule * 0.7); b = lerp(b, 120, nodule * 0.7);
            r = lerp(r, 92, capillary * 0.45); g = lerp(g, 14, capillary * 0.45); b = lerp(b, 40, capillary * 0.45);
            r = lerp(r, 48, vein * 0.85); g = lerp(g, 16, vein * 0.85); b = lerp(b, 64, vein * 0.85);
            r = lerp(r, 34, sore * 0.8); g = lerp(g, 6, sore * 0.8); b = lerp(b, 8, sore * 0.8);
            if (wall) {
                // Blood pools darker toward the floor (v = 1 is the bottom of the wall)
                const pool = smoothstep(0.7, 1.0, v + (base - 0.5) * 0.2);
                r *= 1 - pool * 0.5; g *= 1 - pool * 0.6; b *= 1 - pool * 0.55;
            }
            o.r = clamp(r, 0, 255); o.g = clamp(g, 0, 255); o.b = clamp(b, 0, 255);
            o.h = base * 0.35 + fiber * (wall ? 0.05 : 0.03) + vein * 0.4 + nodule * 0.5 + fat * 0.2 - sore * 0.35;
            o.ro = 0.3 + (1 - base) * 0.2 + fat * 0.1 - vein * 0.08 + sore * 0.35;
            o.e = vein * 0.95 + capillary * 0.3;
        }, 4.5, true);
        cache[key] = mapsToTextures(maps);
        return cache[key];
    }

    // Gentle, tileable ripples for standing water (normal map only)
    function waterNormal() {
        if (cache.waterNormal) return cache.waterNormal;
        const maps = buildMaps(256, (u, v, o) => {
            const a = Noise.fbm(u, v, 6, 3);
            const b = Noise.fbm(u + 0.37, v + 0.71, 14, 2);
            const ring = Math.sin((Noise.fbm(u, v, 3, 2) * 6 + u * 2) * TAU) * 0.08;
            o.r = o.g = o.b = 128;
            o.h = a * 0.6 + b * 0.3 + ring;
        }, 3.0);
        cache.waterNormal = { normalMap: toTexture(maps.normalC, { srgb: false }) };
        return cache.waterNormal;
    }

    // Grainy CRT static; the screens scroll its offset every frame
    function staticNoise() {
        if (cache.static) return cache.static;
        const W = 128, H = 128, c = makeCanvas(W, H), ctx = c.getContext('2d');
        const img = ctx.createImageData(W, H);
        for (let y = 0; y < H; y++) {
            const line = 0.75 + Math.random() * 0.35;
            for (let x = 0; x < W; x++) {
                const p = (y * W + x) * 4;
                const k = Math.random() * 255 * line;
                img.data[p] = k * 0.9;
                img.data[p + 1] = k * 0.95;
                img.data[p + 2] = k;
                img.data[p + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        const t = toTexture(c, { mipmaps: false });
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        cache.static = t;
        return t;
    }

    // The great eye above the final maze. Equirectangular; the iris is centred on +z (u = 0.25).
    function eyeball() {
        if (cache.eyeball) return cache.eyeball;
        const W = 1024, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d');
        const img = ctx.createImageData(W, H);
        const cx = W * 0.25, cy = H * 0.5;
        const px = W / TAU; // pixels per radian (same both ways for a 2:1 map)
        const IRIS = 0.42, PUPIL = 0.17, LIMBUS = 0.47;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const dx = (x - cx) / px, dy = (y - cy) / px;
                const d = Math.sqrt(dx * dx + dy * dy);
                const a = Math.atan2(dy, dx);
                const n = Noise.fbm(x / W, y / H, 8, 4);
                let r, g, b;
                if (d < PUPIL) {
                    r = g = b = 2;
                } else if (d < IRIS) {
                    const t = (d - PUPIL) / (IRIS - PUPIL);
                    const fib = 0.5 + 0.5 * Math.sin(a * 70 + Noise.fbm(x / W, y / H, 30, 2) * 18);
                    const k = (0.55 + fib * 0.45) * (1 - t * 0.35);
                    r = (200 + 55 * (1 - t)) * k;
                    g = (40 + 70 * (1 - t) * (1 - t)) * k;
                    b = 12 * k;
                    if (t < 0.12) { r *= 0.6 + t * 3; g *= 0.6 + t * 3; }
                } else {
                    // Yellowed sclera shot with veins that crawl toward the iris
                    const limbus = 1 - smoothstep(IRIS, LIMBUS, d);
                    const w = Noise.worley(x / W * 2, y / H, 14);
                    const vein = (1 - smoothstep(0.0, 0.03, w.f2 - w.f1)) * smoothstep(0.3, 1.6, d);
                    r = 196 + n * 40; g = 176 + n * 30; b = 140 + n * 20;
                    r = lerp(r, 150, vein); g = lerp(g, 20, vein); b = lerp(b, 18, vein);
                    const shade = 1 - smoothstep(0.9, 2.2, d) * 0.6;
                    r *= shade; g *= shade; b *= shade;
                    r = lerp(r, 30, limbus); g = lerp(g, 8, limbus); b = lerp(b, 6, limbus);
                }
                const p = (y * W + x) * 4;
                img.data[p] = clamp(r, 0, 255);
                img.data[p + 1] = clamp(g, 0, 255);
                img.data[p + 2] = clamp(b, 0, 255);
                img.data[p + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        // Wet highlight
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(cx - px * 0.14, cy - px * 0.16, px * 0.06, px * 0.04, -0.5, 0, TAU);
        ctx.fill();
        cache.eyeball = toTexture(c, { repeat: false });
        return cache.eyeball;
    }

    // Water-damaged drop-ceiling tiles in a metal grid. Tile = 8 units (4x4 tiles).
    function ceilingTiles() {
        if (cache.ceiling) return cache.ceiling;
        const size = 512, n = 4;
        const maps = buildMaps(size, (u, v, o) => {
            const tx = Math.floor(u * n), ty = Math.floor(v * n);
            const tu = u * n - tx, tv = v * n - ty;
            const tid = Noise.hash2(tx * 3 + 5, ty * 7 + 1);
            const edge = Math.min(tu, 1 - tu, tv, 1 - tv) * (size / n);
            const frame = 1 - smoothstep(2, 3.5, edge);
            const speck = Noise.value2(u * 200, v * 200, 200, 200);
            const fissure = speck > 0.8 ? 0.35 : 0;
            const stainN = Noise.fbm(u + tid * 0.5, v, 5, 4);
            const stain = smoothstep(0.56, 0.6, stainN);
            const ring = smoothstep(0.55, 0.58, stainN) - smoothstep(0.6, 0.64, stainN);
            const missing = tid > 0.92;

            let r, g, b, h, ro;
            if (frame > 0.5) {
                r = 58; g = 57; b = 54; h = 0.9; ro = 0.5;
            } else if (missing) {
                const dd = Noise.fbm(u, v, 20, 2);
                r = g = b = 10 + dd * 10; h = 0.0; ro = 1;
            } else {
                const base = 0.68 + Noise.fbm(u, v, 18, 2) * 0.25 - fissure * 0.6 - (tid > 0.75 ? 0.15 : 0);
                r = 152 * base; g = 146 * base; b = 132 * base;
                r = lerp(r, 96, stain * 0.55); g = lerp(g, 78, stain * 0.55); b = lerp(b, 52, stain * 0.55);
                r -= ring * 40; g -= ring * 46; b -= ring * 50;
                h = 0.55 - fissure * 0.4 + smoothstep(0, 6, edge) * 0.2;
                ro = 0.95;
            }
            o.r = clamp(r, 0, 255); o.g = clamp(g, 0, 255); o.b = clamp(b, 0, 255);
            o.h = h; o.ro = ro;
        }, 2.0);
        cache.ceiling = mapsToTextures(maps);
        return cache.ceiling;
    }

    // -------------------------------------------------------------------------
    // Level 2: the misty forest
    // -------------------------------------------------------------------------
    function hedge() {
        if (cache.hedge) return cache.hedge;
        const size = 512;
        const maps = buildMaps(size, (u, v, o) => {
            // Three layers of small, slightly elongated leaves with dark gaps between them
            const warpU = (Noise.fbm(u, v, 8, 2) - 0.5) * 0.04;
            const layers = [[46, 0, 0], [34, 0.31, 0.17], [58, 0.57, 0.83]];
            let leaf = 0, id = 0, depth = 0;
            for (let i = 0; i < layers.length; i++) {
                const [cells, ou, ov] = layers[i];
                const w = Noise.worley(u + ou + warpU, (v + ov) * 0.8, cells);
                const l = (1 - smoothstep(0.05, 0.55, w.f1)) * smoothstep(0.0, 0.1, w.f2 - w.f1);
                if (l > leaf * 0.85) { leaf = l; id = w.id; depth = 1 - i * 0.25; }
            }
            const tint = Noise.fbm(u, v, 4, 3);
            const dry = smoothstep(0.62, 0.8, Noise.fbm(u + 0.4, v, 6, 3));
            const k = (0.12 + leaf * 1.0) * (0.55 + depth * 0.45);
            o.r = clamp((18 + id * 22 + tint * 12 + dry * 30) * k, 0, 255);
            o.g = clamp((34 + id * 34 + tint * 18 + dry * 18) * k, 0, 255);
            o.b = clamp((14 + id * 10) * k, 0, 255);
            o.h = leaf * depth;
            o.ro = 0.55 + (1 - leaf) * 0.4;
        }, 4.0);
        cache.hedge = mapsToTextures(maps);
        return cache.hedge;
    }

    function bark() {
        if (cache.bark) return cache.bark;
        const size = 512;
        const maps = buildMaps(size, (u, v, o) => {
            const n = Noise.fbm(u, v, 14, 4, 0.5, 2);
            const ridge = 1 - smoothstep(0.0, 0.22, Math.abs(n - 0.5));
            const n2 = Noise.fbm(u + 0.4, v, 30, 3, 0.5, 4);
            const plates = smoothstep(0.35, 0.7, n2);
            const moss = smoothstep(0.58, 0.72, Noise.fbm(u, v, 4, 3));
            const k = 0.35 + plates * 0.5 + (1 - ridge) * 0.25;
            let r = 70 * k, g = 58 * k, b = 47 * k;
            r = lerp(r, 34, moss * 0.6); g = lerp(g, 52, moss * 0.6); b = lerp(b, 24, moss * 0.6);
            o.r = clamp(r, 0, 255); o.g = clamp(g, 0, 255); o.b = clamp(b, 0, 255);
            o.h = plates * 0.7 + (1 - ridge) * 0.3;
            o.ro = 0.88 - moss * 0.1;
        }, 4.0);
        cache.bark = mapsToTextures(maps);
        return cache.bark;
    }

    function forestFloor() {
        if (cache.forestFloor) return cache.forestFloor;
        const size = 512;
        const maps = buildMaps(size, (u, v, o) => {
            const dirt = Noise.fbm(u, v, 8, 4);
            // Sparse fallen leaves: only some Worley cells hold a leaf, the rest is dirt
            const litter = smoothstep(0.35, 0.6, Noise.fbm(u + 0.7, v, 4, 3));
            const w = Noise.worley(u, v, 34);
            const leaf = w.id < 0.45 * litter ? (1 - smoothstep(0.12, 0.34, w.f1)) : 0;
            const w2 = Noise.worley(u + 0.5, v + 0.25, 48);
            const leaf2 = w2.id < 0.35 * litter ? (1 - smoothstep(0.1, 0.3, w2.f1)) : 0;
            const moss = smoothstep(0.55, 0.7, Noise.fbm(u + 0.2, v, 3, 4));
            const twig = smoothstep(0.985, 1.0, 1 - Math.abs(Noise.fbm(u, v, 10, 2) - 0.5) * 2) * 0.8;

            let r = 46 * (0.55 + dirt * 0.7), g = 38 * (0.55 + dirt * 0.7), b = 28 * (0.55 + dirt * 0.7);
            const lt = Math.max(leaf, leaf2);
            const lid = leaf > leaf2 ? w.id : w2.id;
            if (lt > 0.01) {
                const lr = 70 + lid * 50, lg = 40 + lid * 22, lb = 18 + lid * 8;
                r = lerp(r, lr * 0.7, lt); g = lerp(g, lg * 0.7, lt); b = lerp(b, lb * 0.7, lt);
            }
            r = lerp(r, 30, moss * 0.7); g = lerp(g, 48, moss * 0.7); b = lerp(b, 20, moss * 0.7);
            r = lerp(r, 58, twig); g = lerp(g, 46, twig); b = lerp(b, 34, twig);
            o.r = clamp(r, 0, 255); o.g = clamp(g, 0, 255); o.b = clamp(b, 0, 255);
            o.h = dirt * 0.4 + lt * 0.5 + twig * 0.4 + moss * 0.2;
            o.ro = 0.78 + (1 - dirt) * 0.15 - lt * 0.1;
        }, 3.0);
        cache.forestFloor = mapsToTextures(maps);
        return cache.forestFloor;
    }

    function stone() {
        if (cache.stone) return cache.stone;
        const size = 256;
        const maps = buildMaps(size, (u, v, o) => {
            const n = Noise.fbm(u, v, 6, 5);
            const vein = 1 - smoothstep(0.0, 0.04, Math.abs(Math.sin((u * 3 + v + n * 3) * Math.PI) * 0.5));
            const dirt = smoothstep(0.5, 0.75, Noise.fbm(u + 0.3, v, 4, 4));
            const moss = smoothstep(0.64, 0.76, Noise.fbm(u, v + 0.5, 5, 4));
            let k = 0.62 + n * 0.38 - vein * 0.12;
            let r = 176 * k, g = 172 * k, b = 164 * k;
            r = lerp(r, 70, dirt * 0.6); g = lerp(g, 66, dirt * 0.6); b = lerp(b, 58, dirt * 0.6);
            r = lerp(r, 44, moss * 0.75); g = lerp(g, 62, moss * 0.75); b = lerp(b, 32, moss * 0.75);
            o.r = clamp(r, 0, 255); o.g = clamp(g, 0, 255); o.b = clamp(b, 0, 255);
            o.h = n * 0.6 - vein * 0.2 + moss * 0.2;
            o.ro = 0.7 + dirt * 0.2;
        }, 2.5);
        cache.stone = mapsToTextures(maps);
        return cache.stone;
    }

    // -------------------------------------------------------------------------
    // Sprites and decals
    // -------------------------------------------------------------------------
    function glow() {
        if (cache.glow) return cache.glow;
        const c = makeCanvas(128), ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.15, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        cache.glow = toTexture(c, { repeat: false });
        return cache.glow;
    }

    function lightPool() {
        if (cache.pool) return cache.pool;
        const c = makeCanvas(128), ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        cache.pool = toTexture(c, { repeat: false });
        return cache.pool;
    }

    function fogPuff() {
        if (cache.fog) return cache.fog;
        const size = 128, c = makeCanvas(size), ctx = c.getContext('2d');
        const img = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
                const r = Math.sqrt(dx * dx + dy * dy) * 2;
                const n = Noise.fbm(x / size, y / size, 4, 4);
                const a = clamp((1 - smoothstep(0.2, 1, r)) * (0.4 + n * 0.9), 0, 1);
                const p = (y * size + x) * 4;
                img.data[p] = img.data[p + 1] = img.data[p + 2] = 255;
                img.data[p + 3] = a * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        cache.fog = toTexture(c, { repeat: false });
        return cache.fog;
    }

    function flame() {
        if (cache.flame) return cache.flame;
        const c = makeCanvas(64, 128), ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(32, 92, 2, 32, 80, 52);
        g.addColorStop(0, 'rgba(255,255,240,1)');
        g.addColorStop(0.25, 'rgba(255,220,120,0.95)');
        g.addColorStop(0.55, 'rgba(255,130,30,0.55)');
        g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(32, 4);
        ctx.bezierCurveTo(58, 60, 54, 118, 32, 122);
        ctx.bezierCurveTo(10, 118, 6, 60, 32, 4);
        ctx.fill();
        cache.flame = toTexture(c, { repeat: false });
        return cache.flame;
    }

    // Scrawled warnings, tally marks and handprints for the maze walls
    function decal(kind) {
        const key = 'decal_' + kind;
        if (cache[key]) return cache[key];
        const c = makeCanvas(512, 256), ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 512, 256);
        const blood = (a) => `rgba(${70 + Math.random() * 30}, ${6 + Math.random() * 8}, ${4 + Math.random() * 6}, ${a})`;

        const drip = (x, y, len) => {
            ctx.strokeStyle = blood(0.8);
            ctx.lineWidth = 2 + Math.random() * 3;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 3, y + len);
            ctx.stroke();
            ctx.fillStyle = blood(0.85);
            ctx.beginPath();
            ctx.arc(x, y + len, ctx.lineWidth * 0.9, 0, TAU);
            ctx.fill();
        };

        if (kind.startsWith('text:')) {
            const text = kind.slice(5);
            ctx.save();
            ctx.translate(256, 120);
            ctx.rotate((Math.random() - 0.5) * 0.12);
            let fontSize = 74;
            ctx.font = `bold ${fontSize}px "Special Elite", "Courier New", monospace`;
            while (ctx.measureText(text).width > 470 && fontSize > 30) {
                fontSize -= 4;
                ctx.font = `bold ${fontSize}px "Special Elite", "Courier New", monospace`;
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Smeared, layered strokes
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = blood(0.35 + i * 0.2);
                ctx.fillText(text, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
            }
            ctx.restore();
            const w = Math.min(470, ctx.measureText(text).width);
            for (let i = 0; i < 9; i++) drip(256 - w / 2 + Math.random() * w, 140 + Math.random() * 10, 20 + Math.random() * 80);
        } else if (kind === 'tally') {
            ctx.strokeStyle = 'rgba(20,18,16,0.85)';
            ctx.lineCap = 'round';
            let x = 40;
            for (let gIdx = 0; gIdx < 6; gIdx++) {
                for (let i = 0; i < 4; i++) {
                    ctx.lineWidth = 3 + Math.random() * 2;
                    ctx.beginPath();
                    ctx.moveTo(x + i * 14 + Math.random() * 3, 70 + Math.random() * 8);
                    ctx.lineTo(x + i * 14 + Math.random() * 3, 180 + Math.random() * 8);
                    ctx.stroke();
                }
                ctx.beginPath();
                ctx.moveTo(x - 6, 160);
                ctx.lineTo(x + 52, 90);
                ctx.stroke();
                x += 76;
            }
        } else if (kind === 'hand') {
            for (let h = 0; h < 3; h++) {
                ctx.save();
                ctx.translate(120 + h * 140 + Math.random() * 20, 150 + Math.random() * 40);
                ctx.rotate((Math.random() - 0.5) * 0.6);
                ctx.fillStyle = blood(0.75);
                ctx.beginPath();
                ctx.ellipse(0, 0, 34, 40, 0, 0, TAU);
                ctx.fill();
                const fingers = [[-30, -48, 0.35], [-12, -66, 0.1], [8, -68, -0.05], [26, -58, -0.2], [42, -14, -0.9]];
                for (const [fx, fy, rot] of fingers) {
                    ctx.save();
                    ctx.translate(fx, fy);
                    ctx.rotate(rot);
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 8, 22, 0, 0, TAU);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.restore();
                for (let d = 0; d < 3; d++) drip(110 + h * 140 + Math.random() * 40, 180, 30 + Math.random() * 50);
            }
        } else if (kind === 'eye') {
            // A crude watching eye
            ctx.strokeStyle = blood(0.85);
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(130, 128);
            ctx.quadraticCurveTo(256, 30, 382, 128);
            ctx.quadraticCurveTo(256, 226, 130, 128);
            ctx.stroke();
            ctx.fillStyle = blood(0.9);
            ctx.beginPath();
            ctx.arc(256, 128, 36, 0, TAU);
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.9)';
            ctx.beginPath();
            ctx.arc(256, 128, 14, 0, TAU);
            ctx.fill();
            for (let i = 0; i < 6; i++) drip(170 + Math.random() * 170, 150, 30 + Math.random() * 70);
        }

        const t = toTexture(c, { repeat: false });
        cache[key] = t;
        return t;
    }

    // Glowing green EXIT sign
    function exitSign() {
        if (cache.exitSign) return cache.exitSign;
        const c = makeCanvas(256, 96), ctx = c.getContext('2d');
        ctx.fillStyle = '#020a04';
        ctx.fillRect(0, 0, 256, 96);
        ctx.strokeStyle = '#0c3';
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, 244, 84);
        ctx.font = 'bold 62px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#3f8';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#7fffa0';
        ctx.fillText('EXIT', 128, 52);
        cache.exitSign = toTexture(c, { repeat: false });
        return cache.exitSign;
    }

    // Aged paper with handwriting for the notes
    function paper() {
        if (cache.paper) return cache.paper;
        const c = makeCanvas(256, 340), ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 256, 340);
        g.addColorStop(0, '#d8cba6');
        g.addColorStop(1, '#b9a57a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 340);
        for (let i = 0; i < 12; i++) {
            ctx.fillStyle = `rgba(90, 60, 20, ${Math.random() * 0.12})`;
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 340, 10 + Math.random() * 50, 0, TAU);
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(30, 25, 40, 0.75)';
        ctx.lineWidth = 1.6;
        for (let y = 40; y < 310; y += 18) {
            let x = 22;
            const end = 230 - Math.random() * 40;
            ctx.beginPath();
            ctx.moveTo(x, y);
            while (x < end) {
                x += 3 + Math.random() * 5;
                ctx.lineTo(x, y + (Math.random() - 0.5) * 6);
                if (Math.random() < 0.12) { x += 6; ctx.moveTo(x, y); }
            }
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(110, 10, 8, 0.6)';
        ctx.beginPath();
        ctx.arc(200, 300, 14, 0, TAU);
        ctx.fill();
        cache.paper = toTexture(c, { repeat: false });
        return cache.paper;
    }

    // The angel's face: pale skin, huge white staring eyes and a split grin.
    // Equirectangular layout for a sphere; the face is centred at u = 0.25 (the +z side).
    function angelFace() {
        if (cache.angelFace) return cache.angelFace;
        const W = 512, H = 256;
        const col = makeCanvas(W, H), ctx = col.getContext('2d');
        const emi = makeCanvas(W, H), ectx = emi.getContext('2d');
        const img = ctx.createImageData(W, H);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const n = Noise.fbm(x / W, y / H, 8, 4);
                const k = 0.62 + n * 0.3;
                const p = (y * W + x) * 4;
                img.data[p] = 150 * k; img.data[p + 1] = 146 * k; img.data[p + 2] = 140 * k; img.data[p + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        ectx.fillStyle = '#000';
        ectx.fillRect(0, 0, W, H);

        const cx = 128, ey = 112;
        // Sunken sockets
        for (const sx of [-26, 26]) {
            const g = ctx.createRadialGradient(cx + sx, ey, 4, cx + sx, ey, 34);
            g.addColorStop(0, 'rgba(0,0,0,0.95)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(cx + sx - 40, ey - 40, 80, 80);
        }
        // Wide white eyes with pinprick pupils (also drawn into the emissive map)
        for (const target of [ctx, ectx]) {
            for (const sx of [-26, 26]) {
                target.fillStyle = '#f4f1e8';
                target.beginPath();
                target.ellipse(cx + sx, ey, 15, 19, 0, 0, TAU);
                target.fill();
                target.fillStyle = '#050505';
                target.beginPath();
                target.arc(cx + sx + (sx > 0 ? -3 : 3), ey + 2, 5, 0, TAU);
                target.fill();
            }
        }
        // Grin
        ctx.fillStyle = '#0a0606';
        ctx.beginPath();
        ctx.moveTo(cx - 40, 150);
        ctx.quadraticCurveTo(cx, 196, cx + 40, 150);
        ctx.quadraticCurveTo(cx, 172, cx - 40, 150);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,190,170,0.6)';
        ctx.lineWidth = 1.5;
        for (let i = -4; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * 8, 158 + Math.abs(i) * -1.2);
            ctx.lineTo(cx + i * 8, 170 - Math.abs(i) * 2);
            ctx.stroke();
        }
        // Nose shadow
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.ellipse(cx - 4, 138, 3, 5, 0, 0, TAU);
        ctx.ellipse(cx + 4, 138, 3, 5, 0, 0, TAU);
        ctx.fill();

        cache.angelFace = {
            map: toTexture(col, { repeat: false }),
            emissiveMap: toTexture(emi, { repeat: false })
        };
        return cache.angelFace;
    }

    function feather() {
        if (cache.feather) return cache.feather;
        const c = makeCanvas(64, 256), ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 64, 256);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(32, 0);
        ctx.quadraticCurveTo(62, 70, 46, 256);
        ctx.lineTo(18, 256);
        ctx.quadraticCurveTo(2, 70, 32, 0);
        ctx.fill();
        // Ragged notches
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 14; i++) {
            const y = 20 + Math.random() * 220;
            const side = Math.random() < 0.5 ? 0 : 64;
            ctx.beginPath();
            ctx.moveTo(side, y);
            ctx.lineTo(32, y + 6 + Math.random() * 8);
            ctx.lineTo(side, y + 14);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(32, 4);
        ctx.lineTo(32, 256);
        ctx.stroke();
        cache.feather = toTexture(c, { repeat: false });
        return cache.feather;
    }

    // Watcher hide: dark, mottled, wet-looking skin stretched over a web of veins
    function skin() {
        if (cache.skin) return cache.skin;
        const size = 512;
        const maps = buildMaps(size, (u, v, o) => {
            const base = Noise.fbm(u, v, 6, 4);
            const w = Noise.worley(u, v, 9);
            const vein = 1 - smoothstep(0.0, 0.05, w.f2 - w.f1);
            const w2 = Noise.worley(u + 0.37, v + 0.11, 23);
            const fine = 1 - smoothstep(0.0, 0.035, w2.f2 - w2.f1);
            const wrinkle = Noise.fbm(u, v, 40, 2, 0.5, 120);
            const sore = smoothstep(0.7, 0.82, Noise.fbm(u + 0.6, v, 5, 3));
            let r = 34 * (0.55 + base * 0.7), g = 31 * (0.55 + base * 0.7), b = 34 * (0.55 + base * 0.7);
            r = lerp(r, 34, vein * 0.6); g = lerp(g, 9, vein * 0.6); b = lerp(b, 15, vein * 0.6);
            r = lerp(r, 26, fine * 0.4); g = lerp(g, 12, fine * 0.4); b = lerp(b, 18, fine * 0.4);
            r = lerp(r, 42, sore * 0.5); g = lerp(g, 14, sore * 0.5); b = lerp(b, 13, sore * 0.5);
            o.r = clamp(r, 0, 255); o.g = clamp(g, 0, 255); o.b = clamp(b, 0, 255);
            o.h = base * 0.35 + wrinkle * 0.3 + vein * 0.35 + fine * 0.15 - sore * 0.2;
            o.ro = 0.38 + (1 - base) * 0.25 - sore * 0.2;
        }, 4.0);
        cache.skin = mapsToTextures(maps);
        return cache.skin;
    }

    // Leaf-card atlas: left half a broadleaf cluster, right half a pine-needle spray
    function leafAtlas() {
        if (cache.leaves) return cache.leaves;
        const W = 1024, H = 512;
        const c = makeCanvas(W, H), ctx = c.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        const leafColor = () => {
            const k = Math.random();
            if (k < 0.12) return `hsl(${30 + Math.random() * 15}, ${30 + Math.random() * 20}%, ${14 + Math.random() * 10}%)`;
            return `hsl(${85 + Math.random() * 40}, ${20 + Math.random() * 25}%, ${9 + Math.random() * 12}%)`;
        };
        // Broadleaf cluster
        ctx.save();
        ctx.strokeStyle = 'rgba(30,22,14,0.9)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 9; i++) {
            const a = Math.random() * TAU;
            ctx.beginPath();
            ctx.moveTo(256, 256);
            ctx.quadraticCurveTo(256 + Math.cos(a) * 90, 256 + Math.sin(a) * 90, 256 + Math.cos(a + 0.3) * 200, 256 + Math.sin(a + 0.3) * 200);
            ctx.stroke();
        }
        for (let i = 0; i < 230; i++) {
            const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 200;
            const x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d;
            const len = 26 + Math.random() * 30, wid = len * (0.32 + Math.random() * 0.15);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.random() * TAU);
            ctx.fillStyle = leafColor();
            ctx.beginPath();
            ctx.moveTo(0, -len / 2);
            ctx.bezierCurveTo(wid, -len / 4, wid * 0.8, len / 4, 0, len / 2);
            ctx.bezierCurveTo(-wid * 0.8, len / 4, -wid, -len / 4, 0, -len / 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -len / 2);
            ctx.lineTo(0, len / 2);
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
        // Pine spray
        ctx.save();
        ctx.translate(512, 0);
        const needle = (x, y, a, len) => {
            ctx.strokeStyle = `hsl(${140 + Math.random() * 30}, ${18 + Math.random() * 18}%, ${8 + Math.random() * 10}%)`;
            ctx.lineWidth = 1.6 + Math.random();
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
            ctx.stroke();
        };
        const branch = (x0, y0, x1, y1, depth) => {
            ctx.strokeStyle = 'rgba(40,30,20,0.95)';
            ctx.lineWidth = depth ? 4 : 2.5;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
            for (let t = 0; t < 1; t += 0.018) {
                const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
                const nl = (18 + Math.random() * 26) * (1 - t * 0.5);
                needle(x, y, ang + 0.9 + Math.random() * 0.4, nl);
                needle(x, y, ang - 0.9 - Math.random() * 0.4, nl);
            }
            if (depth) {
                for (let k = 0; k < 7; k++) {
                    const t = 0.15 + k * 0.11;
                    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
                    const side = k % 2 ? 1 : -1;
                    const a2 = ang + side * (0.75 + Math.random() * 0.2);
                    const l2 = len * (0.42 - t * 0.25);
                    branch(x, y, x + Math.cos(a2) * l2, y + Math.sin(a2) * l2, 0);
                }
            }
        };
        branch(256, 500, 256, 20, 1);
        ctx.restore();
        const t = toTexture(c, { repeat: false });
        t.flipY = false;
        cache.leaves = t;
        return t;
    }

    // Diamond knurling for the flashlight grip
    function knurl() {
        if (cache.knurl) return cache.knurl;
        const maps = buildMaps(128, (u, v, o) => {
            const tri = (x) => Math.abs((((x % 1) + 1) % 1) - 0.5) * 2;
            const h = Math.min(tri((u + v) * 8), tri((u - v) * 8));
            const k = 22 + h * 30;
            o.r = k; o.g = k; o.b = k + 3;
            o.h = h;
            o.ro = 0.55 - h * 0.2;
        }, 6.0);
        cache.knurl = mapsToTextures(maps);
        return cache.knurl;
    }

    return {
        setRenderer, makeCanvas, toTexture, skin, leafAtlas, knurl,
        concreteWall, woodFloor, concreteFloor, ceilingTiles, waterNormal, staticNoise, eyeball, flesh,
        hedge, bark, forestFloor, stone,
        glow, lightPool, fogPuff, flame, decal, exitSign, paper, angelFace, feather
    };
})();
