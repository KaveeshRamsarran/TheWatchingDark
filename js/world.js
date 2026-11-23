// THE WATCHING DARK - maze data, collision, line of sight and pathfinding
'use strict';

const World = (() => {
    const SIZE = 30;      // cells per side
    const CELL = 8;       // world units per cell
    const HALF = CELL / 2;

    let cells = [];       // cells[x][z] = { n, s, e, w } (true = wall)
    let exits = [];

    // Collision primitives: axis-aligned boxes and vertical cylinders (circles)
    const boxes = [];
    const circles = [];
    const BUCKET = 8;
    const grid = new Map();

    // Pathfinding flow field toward the player
    const dist = new Int16Array(SIZE * SIZE);
    const queue = new Int16Array(SIZE * SIZE);
    let flowFrom = -1;

    const DIRS = [
        { dx: 0, dz: -1, wall: 'n', opp: 's' },
        { dx: 0, dz: 1, wall: 's', opp: 'n' },
        { dx: 1, dz: 0, wall: 'e', opp: 'w' },
        { dx: -1, dz: 0, wall: 'w', opp: 'e' }
    ];

    // -------------------------------------------------------------------------
    // Generation (recursive backtracker + rooms + circular halls + winding corridors)
    // -------------------------------------------------------------------------
    function generate() {
        cells = [];
        for (let x = 0; x < SIZE; x++) {
            cells[x] = [];
            for (let z = 0; z < SIZE; z++) cells[x][z] = { n: true, s: true, e: true, w: true, visited: false };
        }

        const open = (x, z, d) => {
            const nx = x + d.dx, nz = z + d.dz;
            if (nx < 0 || nx >= SIZE || nz < 0 || nz >= SIZE) return;
            cells[x][z][d.wall] = false;
            cells[nx][nz][d.opp] = false;
        };

        const stack = [];
        let cur = { x: 0, z: 0 };
        cells[0][0].visited = true;
        for (;;) {
            const options = [];
            for (const d of DIRS) {
                const nx = cur.x + d.dx, nz = cur.z + d.dz;
                if (nx >= 0 && nx < SIZE && nz >= 0 && nz < SIZE && !cells[nx][nz].visited) options.push(d);
            }
            if (options.length) {
                const d = pick(options);
                open(cur.x, cur.z, d);
                stack.push(cur);
                cur = { x: cur.x + d.dx, z: cur.z + d.dz };
                cells[cur.x][cur.z].visited = true;
            } else if (stack.length) {
                cur = stack.pop();
            } else break;
        }

        // Rectangular rooms
        const rooms = randInt(10, 17);
        for (let i = 0; i < rooms; i++) {
            const rx = 1 + Math.floor(Math.random() * (SIZE - 12));
            const rz = 1 + Math.floor(Math.random() * (SIZE - 12));
            const rw = randInt(3, 7), rh = randInt(3, 7);
            for (let x = rx; x < Math.min(rx + rw, SIZE - 1); x++) {
                for (let z = rz; z < Math.min(rz + rh, SIZE - 1); z++) {
                    if (x < rx + rw - 1) open(x, z, DIRS[2]);
                    if (z < rz + rh - 1) open(x, z, DIRS[1]);
                }
            }
        }

        // Circular halls
        const halls = randInt(5, 9);
        for (let i = 0; i < halls; i++) {
            const cx = randInt(3, SIZE - 4), cz = randInt(3, SIZE - 4), r = randInt(2, 4);
            for (let x = cx - r; x <= cx + r; x++) {
                for (let z = cz - r; z <= cz + r; z++) {
                    if (x < 0 || x >= SIZE || z < 0 || z >= SIZE) continue;
                    if (Math.hypot(x - cx, z - cz) > r) continue;
                    if (Math.hypot(x + 1 - cx, z - cz) <= r) open(x, z, DIRS[2]);
                    if (Math.hypot(x - cx, z + 1 - cz) <= r) open(x, z, DIRS[1]);
                }
            }
        }

        // Winding corridors that create loops
        const corridors = randInt(8, 13);
        for (let i = 0; i < corridors; i++) {
            let x = randInt(0, SIZE - 1), z = randInt(0, SIZE - 1);
            let dir = randInt(0, 3);
            const len = randInt(6, 17);
            for (let s = 0; s < len; s++) {
                if (Math.random() < 0.3) dir = Math.random() < 0.5 ? (dir + 1) % 4 : (dir + 3) % 4;
                const d = [DIRS[0], DIRS[2], DIRS[1], DIRS[3]][dir];
                const nx = x + d.dx, nz = z + d.dz;
                if (nx < 0 || nx >= SIZE || nz < 0 || nz >= SIZE) break;
                open(x, z, d);
                x = nx;
                z = nz;
            }
        }

        // Small clear area around the spawn
        open(0, 0, DIRS[2]);
        open(0, 0, DIRS[1]);
        open(1, 0, DIRS[1]);
        open(0, 1, DIRS[2]);

        exits = [{ x: SIZE - 1, z: SIZE - 1 }, { x: 0, z: SIZE - 1 }];
        for (const ex of exits) {
            computeFlow(0, 0);
            if (dist[ex.x * SIZE + ex.z] < 0) carvePath(ex);
        }
        flowFrom = -1;
    }

    function carvePath(target) {
        let x = 0, z = 0;
        while (x !== target.x || z !== target.z) {
            const stepX = x !== target.x && (z === target.z || Math.random() < 0.5);
            if (stepX) {
                const d = target.x > x ? DIRS[2] : DIRS[3];
                cells[x][z][d.wall] = false;
                x += d.dx;
                cells[x][z][d.opp] = false;
            } else {
                const d = target.z > z ? DIRS[1] : DIRS[0];
                cells[x][z][d.wall] = false;
                z += d.dz;
                cells[x][z][d.opp] = false;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Queries
    // -------------------------------------------------------------------------
    const cellX = (wx) => Math.round(wx / CELL);
    const inBounds = (x, z) => x >= 0 && x < SIZE && z >= 0 && z < SIZE;
    const center = (c) => c * CELL;

    function canStep(x, z, dx, dz) {
        if (!inBounds(x, z) || !inBounds(x + dx, z + dz)) return false;
        const c = cells[x][z];
        if (dx === 1) return !c.e;
        if (dx === -1) return !c.w;
        if (dz === 1) return !c.s;
        if (dz === -1) return !c.n;
        return true;
    }

    // -------------------------------------------------------------------------
    // Collision
    // -------------------------------------------------------------------------
    function clearColliders() {
        boxes.length = 0;
        circles.length = 0;
        grid.clear();
    }

    const bucketKey = (bx, bz) => (bx + 512) * 4096 + (bz + 512);

    function insert(item, minX, maxX, minZ, maxZ) {
        const x0 = Math.floor(minX / BUCKET), x1 = Math.floor(maxX / BUCKET);
        const z0 = Math.floor(minZ / BUCKET), z1 = Math.floor(maxZ / BUCKET);
        for (let x = x0; x <= x1; x++) {
            for (let z = z0; z <= z1; z++) {
                const k = bucketKey(x, z);
                let b = grid.get(k);
                if (!b) { b = []; grid.set(k, b); }
                b.push(item);
            }
        }
    }

    function addBox(minX, maxX, minZ, maxZ) {
        const b = { type: 0, minX, maxX, minZ, maxZ, stamp: 0 };
        boxes.push(b);
        insert(b, minX, maxX, minZ, maxZ);
        return b;
    }

    function addCircle(x, z, r, blocksSight = true) {
        const c = { type: 1, x, z, r, blocksSight, stamp: 0 };
        circles.push(c);
        insert(c, x - r, x + r, z - r, z + r);
        return c;
    }

    let stampCounter = 1;
    const nearby = [];
    function query(x, z, radius) {
        nearby.length = 0;
        const stamp = ++stampCounter;
        const x0 = Math.floor((x - radius) / BUCKET), x1 = Math.floor((x + radius) / BUCKET);
        const z0 = Math.floor((z - radius) / BUCKET), z1 = Math.floor((z + radius) / BUCKET);
        for (let bx = x0; bx <= x1; bx++) {
            for (let bz = z0; bz <= z1; bz++) {
                const b = grid.get(bucketKey(bx, bz));
                if (!b) continue;
                for (const item of b) {
                    if (item.stamp === stamp) continue;
                    item.stamp = stamp;
                    nearby.push(item);
                }
            }
        }
        return nearby;
    }

    // Push a circle out of all colliders it overlaps. Mutates pos (x/z). Returns true on contact.
    function resolve(pos, radius) {
        let hit = false;
        for (let iter = 0; iter < 2; iter++) {
            const items = query(pos.x, pos.z, radius + 0.5);
            for (const it of items) {
                if (it.type === 0) {
                    const cx = clamp(pos.x, it.minX, it.maxX);
                    const cz = clamp(pos.z, it.minZ, it.maxZ);
                    let dx = pos.x - cx, dz = pos.z - cz;
                    const d2 = dx * dx + dz * dz;
                    if (d2 >= radius * radius) continue;
                    hit = true;
                    if (d2 > 1e-8) {
                        const d = Math.sqrt(d2);
                        pos.x += (dx / d) * (radius - d);
                        pos.z += (dz / d) * (radius - d);
                    } else {
                        // Centre is inside the box: leave along the shortest axis
                        const left = pos.x - it.minX, right = it.maxX - pos.x;
                        const top = pos.z - it.minZ, bottom = it.maxZ - pos.z;
                        const m = Math.min(left, right, top, bottom);
                        if (m === left) pos.x = it.minX - radius;
                        else if (m === right) pos.x = it.maxX + radius;
                        else if (m === top) pos.z = it.minZ - radius;
                        else pos.z = it.maxZ + radius;
                    }
                } else {
                    const dx = pos.x - it.x, dz = pos.z - it.z;
                    const min = radius + it.r;
                    const d2 = dx * dx + dz * dz;
                    if (d2 >= min * min) continue;
                    hit = true;
                    const d = Math.sqrt(d2) || 0.0001;
                    pos.x = it.x + (dx / d) * min;
                    pos.z = it.z + (dz / d) * min;
                }
            }
        }
        return hit;
    }

    function overlaps(x, z, radius) {
        const items = query(x, z, radius + 0.5);
        for (const it of items) {
            if (it.type === 0) {
                const cx = clamp(x, it.minX, it.maxX), cz = clamp(z, it.minZ, it.maxZ);
                if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
            } else if ((x - it.x) ** 2 + (z - it.z) ** 2 < (radius + it.r) ** 2) return true;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Line of sight across the maze grid (walls) plus sight-blocking pillars.
    // -------------------------------------------------------------------------
    function wallBetween(ax, az, bx, bz) {
        if (!inBounds(ax, az) || !inBounds(bx, bz)) return true;
        return !canStep(ax, az, bx - ax, bz - az);
    }

    function lineOfSight(ax, az, bx, bz) {
        const dx = bx - ax, dz = bz - az;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.01) return true;
        const steps = Math.ceil(len / 0.5);
        let pcx = cellX(ax), pcz = cellX(az);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const cx = cellX(ax + dx * t), cz = cellX(az + dz * t);
            if (cx !== pcx || cz !== pcz) {
                if (cx !== pcx && cz !== pcz) {
                    // Crossed a corner: blocked only if both L-shaped routes are blocked
                    const r1 = wallBetween(pcx, pcz, cx, pcz) || wallBetween(cx, pcz, cx, cz);
                    const r2 = wallBetween(pcx, pcz, pcx, cz) || wallBetween(pcx, cz, cx, cz);
                    if (r1 && r2) return false;
                } else if (wallBetween(pcx, pcz, cx, cz)) {
                    return false;
                }
                pcx = cx;
                pcz = cz;
            }
        }
        // Pillars and other solid round things
        for (const c of circles) {
            if (!c.blocksSight) continue;
            const t = clamp(((c.x - ax) * dx + (c.z - az) * dz) / (len * len), 0, 1);
            if (t <= 0.02 || t >= 0.98) continue;
            const px = ax + dx * t - c.x, pz = az + dz * t - c.z;
            if (px * px + pz * pz < c.r * c.r * 0.8) return false;
        }
        return true;
    }

    // -------------------------------------------------------------------------
    // Flow field (BFS distance from the player's cell)
    // -------------------------------------------------------------------------
    function computeFlow(px, pz) {
        const start = px * SIZE + pz;
        dist.fill(-1);
        if (!inBounds(px, pz)) return;
        let head = 0, tail = 0;
        queue[tail++] = start;
        dist[start] = 0;
        while (head < tail) {
            const idx = queue[head++];
            const x = Math.floor(idx / SIZE), z = idx % SIZE;
            const d = dist[idx] + 1;
            for (const dir of DIRS) {
                if (!canStep(x, z, dir.dx, dir.dz)) continue;
                const n = (x + dir.dx) * SIZE + (z + dir.dz);
                if (dist[n] !== -1) continue;
                dist[n] = d;
                queue[tail++] = n;
            }
        }
    }

    function updateFlow(px, pz) {
        const k = px * SIZE + pz;
        if (k === flowFrom || !inBounds(px, pz)) return;
        flowFrom = k;
        computeFlow(px, pz);
    }

    const pathDist = (x, z) => (inBounds(x, z) ? dist[x * SIZE + z] : -1);

    // Neighbour cell that moves toward (sign = -1) or away from (sign = +1) the player
    const stepOut = { x: 0, z: 0 };
    function flowStep(x, z, away = false) {
        const here = pathDist(x, z);
        if (here < 0) return null;
        let best = null, bestD = here;
        const order = DIRS.slice().sort(() => Math.random() - 0.5);
        for (const dir of order) {
            if (!canStep(x, z, dir.dx, dir.dz)) continue;
            const d = pathDist(x + dir.dx, z + dir.dz);
            if (d < 0) continue;
            if (away ? d > bestD : d < bestD) {
                bestD = d;
                best = dir;
            }
        }
        if (!best) return null;
        stepOut.x = x + best.dx;
        stepOut.z = z + best.dz;
        return stepOut;
    }

    function openNeighbours(x, z) {
        const out = [];
        for (const dir of DIRS) if (canStep(x, z, dir.dx, dir.dz)) out.push({ x: x + dir.dx, z: z + dir.dz });
        return out;
    }

    // Grid corners where no wall meets (open hall interiors) - good spots for columns
    function isOpenCorner(x, z) {
        if (x < 0 || z < 0 || x >= SIZE - 1 || z >= SIZE - 1) return false;
        return !cells[x][z].e && !cells[x][z].s && !cells[x + 1][z + 1].n && !cells[x + 1][z + 1].w;
    }

    return {
        SIZE, CELL, HALF, DIRS,
        generate,
        get cells() { return cells; },
        get exits() { return exits; },
        cellX, inBounds, center, canStep, openNeighbours, isOpenCorner,
        clearColliders, addBox, addCircle, resolve, overlaps, query,
        lineOfSight, updateFlow, pathDist, flowStep,
        get circles() { return circles; }
    };
})();
