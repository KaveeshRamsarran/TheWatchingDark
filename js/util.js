// THE WATCHING DARK - shared helpers (math, noise, geometry utilities)
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// Frame-rate independent exponential smoothing
const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

function dampAngle(current, target, lambda, dt) {
    let diff = target - current;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    return current + diff * (1 - Math.exp(-lambda * dt));
}

// Yield to the browser so loading text can repaint between heavy steps
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

// ---------------------------------------------------------------------------
// Tileable value noise. Periodic lattice so generated textures wrap seamlessly.
// ---------------------------------------------------------------------------
const Noise = (() => {
    const perm = new Uint8Array(512);
    const values = new Float32Array(256);
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) values[i] = Math.random();

    const hash2 = (x, y) => values[perm[(perm[x & 255] + y) & 255]];
    const hash3 = (x, y, z) => values[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
    const fade = (t) => t * t * (3 - 2 * t);

    // Periodic 2D value noise, period in lattice units (<= 256)
    function value2(x, y, px = 256, py = 256) {
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const x0 = ((ix % px) + px) % px, y0 = ((iy % py) + py) % py;
        const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
        const u = fade(fx), v = fade(fy);
        const a = hash2(x0, y0), b = hash2(x1, y0), c = hash2(x0, y1), d = hash2(x1, y1);
        return lerp(lerp(a, b, u), lerp(c, d, u), v);
    }

    // Fractal sum. x,y in [0,1) texture space; freq = base lattice cells across the tile.
    function fbm(u, v, freq, octaves = 4, gain = 0.5, freqY = freq) {
        let sum = 0, amp = 0.5, norm = 0, fx = freq, fy = freqY;
        for (let o = 0; o < octaves; o++) {
            sum += value2(u * fx, v * fy, fx, fy) * amp;
            norm += amp;
            amp *= gain;
            fx *= 2;
            fy *= 2;
        }
        return sum / norm;
    }

    function value3(x, y, z) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
        const a = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx);
        const b = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx);
        const c = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx);
        const d = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx);
        return lerp(lerp(a, b, fy), lerp(c, d, fy), fz);
    }

    // Tileable Worley (cellular) noise: returns {f1, f2, id}
    const worleyOut = { f1: 0, f2: 0, id: 0 };
    function worley(u, v, cells) {
        const x = u * cells, y = v * cells;
        const ix = Math.floor(x), iy = Math.floor(y);
        let f1 = 9, f2 = 9, id = 0;
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                const cx = ix + ox, cy = iy + oy;
                const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
                const h = hash2(wx * 7 + 3, wy * 13 + 1);
                const px = cx + hash2(wx, wy), py = cy + hash2(wy + 17, wx + 31);
                const dx = px - x, dy = py - y;
                const d = dx * dx + dy * dy;
                if (d < f1) { f2 = f1; f1 = d; id = h; } else if (d < f2) { f2 = d; }
            }
        }
        worleyOut.f1 = Math.sqrt(f1);
        worleyOut.f2 = Math.sqrt(f2);
        worleyOut.id = id;
        return worleyOut;
    }

    return { value2, fbm, value3, worley, hash2 };
})();

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// Merge geometries that share position/normal/uv layouts into one indexed geometry.
function mergeGeometries(geos) {
    let vCount = 0, iCount = 0;
    for (const g of geos) {
        vCount += g.attributes.position.count;
        iCount += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const hasColor = geos.every((g) => g.attributes.color);
    const col = hasColor ? new Float32Array(vCount * 3) : null;
    const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);

    let vo = 0, io = 0;
    for (const g of geos) {
        const n = g.attributes.position.count;
        pos.set(g.attributes.position.array, vo * 3);
        if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
        if (col) col.set(g.attributes.color.array, vo * 3);
        if (g.index) {
            const src = g.index.array;
            for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
            io += src.length;
        } else {
            for (let i = 0; i < n; i++) idx[io + i] = vo + i;
            io += n;
        }
        vo += n;
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
}

// Box whose side UVs are in world units horizontally and span 0..1 vertically,
// so baked vertical gradients (grime at the floor, stains from the ceiling) line up.
// Optional segment counts subdivide the faces (used by walls that bend and breathe).
function makeWallBox(w, h, d, texWorldWidth, uOffset = 0, sw = 1, sh = 1, sd = 1) {
    const g = new THREE.BoxGeometry(w, h, d, sw, sh, sd);
    const uv = g.attributes.uv;
    // Face order in BoxGeometry: +x, -x, +y, -y, +z, -z
    const counts = [(sd + 1) * (sh + 1), (sd + 1) * (sh + 1), (sw + 1) * (sd + 1), (sw + 1) * (sd + 1), (sw + 1) * (sh + 1), (sw + 1) * (sh + 1)];
    const faceU = [d, d, w, w, w, w];
    const faceV = [1, 1, d / texWorldWidth, d / texWorldWidth, 1, 1];
    let i0 = 0;
    for (let f = 0; f < 6; f++) {
        const isSide = f !== 2 && f !== 3;
        for (let k = 0; k < counts[f]; k++) {
            const i = i0 + k;
            uv.setX(i, uv.getX(i) * (faceU[f] / texWorldWidth) + uOffset);
            uv.setY(i, isSide ? uv.getY(i) : uv.getY(i) * faceV[f]);
        }
        i0 += counts[f];
    }
    return g;
}

// Cylinder pivoting from its top (useful for limbs)
function limbGeometry(rTop, rBottom, length, radial = 8) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, radial, 3);
    g.translate(0, -length / 2, 0);
    return g;
}

// Dispose every geometry/material/texture below an object (textures flagged as shared are kept)
function disposeObject(root) {
    root.traverse((obj) => {
        if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
                if (m.userData && m.userData.shared) continue;
                m.dispose();
            }
        }
    });
}

// Clone a cached texture set with its own repeat so shared textures stay untouched
function repeated(set, rx, owned, ry = rx) {
    const out = {};
    for (const key of Object.keys(set)) {
        const t = set[key].clone();
        t.needsUpdate = true;
        t.repeat.set(rx, ry);
        out[key] = t;
        if (owned) owned.push(t);
    }
    return out;
}

function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}
