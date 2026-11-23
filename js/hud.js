// THE WATCHING DARK - heads-up display, minimap and overlays
'use strict';

const HUD = (() => {
    const $ = (id) => document.getElementById(id);
    const el = {
        hud: $('hud'),
        sanityFill: $('sanity-fill'), sanityVal: $('sanity-val'), sanityRow: $('v-sanity'),
        staminaFill: $('stamina-fill'), staminaVal: $('stamina-val'),
        batteryFill: $('battery-fill'), batteryVal: $('battery-val'), batteryRow: $('v-battery'),
        batteryLabel: $('battery-label'),
        matches: $('match-slots'), matchExtra: $('match-extra'),
        objectiveLevel: $('objective-level'), objectiveText: $('objective-text'),
        status: $('status-text'), prompt: $('prompt'), toast: $('toast'),
        matchMsg: $('match-counter-message'),
        look: $('look-warning'),
        god: $('godmode-indicator'),
        minimap: $('minimap'),
        noteScreen: $('note-screen'), noteTitle: $('note-title'), noteDate: $('note-date'), noteText: $('note-text'),
        levelCard: $('level-card'), levelCardTitle: $('level-card-title'), levelCardSub: $('level-card-sub'), levelCardNum: $('level-card-num'),
        loading: $('loading-screen'), loadingText: $('loading-text'), loadingFill: $('loading-fill'),
        crosshair: $('crosshair')
    };
    const last = {};
    const mctx = el.minimap.getContext('2d');
    let revealed = new Uint8Array(World.SIZE * World.SIZE);
    let toastTimer = null;

    // Build five match icons once
    for (let i = 0; i < 5; i++) {
        const m = document.createElement('div');
        m.className = 'match-icon';
        el.matches.appendChild(m);
    }
    const matchIcons = Array.from(el.matches.children);

    function setText(node, key, text) {
        if (last[key] === text) return;
        last[key] = text;
        node.textContent = text;
    }

    function setWidth(node, key, pct) {
        const v = Math.round(pct * 10) / 10;
        if (last[key] === v) return;
        last[key] = v;
        node.style.transform = `scaleX(${clamp(v / 100, 0, 1)})`;
    }

    function setClass(node, key, cls, on) {
        const k = key + cls;
        if (last[k] === on) return;
        last[k] = on;
        node.classList.toggle(cls, on);
    }

    function update(p, levelId) {
        setWidth(el.sanityFill, 'san', p.sanity);
        setText(el.sanityVal, 'sanv', Math.ceil(p.sanity));
        setClass(el.sanityRow, 'sanrow', 'critical', p.sanity < 30);
        setWidth(el.staminaFill, 'sta', p.stamina);
        setText(el.staminaVal, 'stav', Math.ceil(p.stamina));
        setClass(el.staminaFill, 'stafill', 'exhausted', p.exhausted);
        if (levelId === 1) {
            setText(el.batteryLabel, 'blabel', 'BATTERY');
            setWidth(el.batteryFill, 'bat', p.battery);
            setText(el.batteryVal, 'batv', Math.ceil(p.battery));
            setClass(el.batteryRow, 'batrow', 'critical', p.battery < 20);
            setClass(el.batteryRow, 'batrow', 'off', !p.flashlightOn);
            setClass(el.batteryRow, 'batrow', 'relic', false);
        } else {
            setText(el.batteryLabel, 'blabel', 'RELIC');
            setWidth(el.batteryFill, 'bat', (p.relicTime / 10) * 100);
            setText(el.batteryVal, 'batv', p.relicTime > 0 ? Math.ceil(p.relicTime) + 's' : '—');
            setClass(el.batteryRow, 'batrow', 'critical', false);
            setClass(el.batteryRow, 'batrow', 'off', p.relicTime <= 0);
            setClass(el.batteryRow, 'batrow', 'relic', true);
        }
        if (last.matches !== p.matches || last.matchLit !== p.matchLit) {
            last.matches = p.matches;
            last.matchLit = p.matchLit;
            matchIcons.forEach((m, i) => {
                m.classList.toggle('spent', i >= p.matches);
                m.classList.toggle('lit', p.matchLit && i === p.matches);
            });
            el.matchExtra.textContent = p.matches > 5 ? '+' + (p.matches - 5) : '';
        }
    }

    function setObjective(levelLabel, text) {
        el.objectiveLevel.textContent = levelLabel;
        el.objectiveText.textContent = text;
    }

    function setStatus(text) { setText(el.status, 'status', text); }

    function setPrompt(text) {
        if (last.prompt === text) return;
        last.prompt = text;
        el.prompt.innerHTML = text || '';
        el.prompt.classList.toggle('show', !!text);
    }

    function toast(text, kind = '') {
        el.toast.textContent = text;
        el.toast.className = 'show ' + kind;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.toast.className = ''; }, 2200);
    }

    function matchFlash(remaining) {
        el.matchMsg.textContent = remaining + ' LEFT';
        el.matchMsg.classList.remove('show');
        void el.matchMsg.offsetWidth;
        el.matchMsg.classList.add('show');
    }

    function setLookWarning(level) {
        const v = Math.round(level * 20) / 20;
        if (last.look === v) return;
        last.look = v;
        el.look.style.opacity = v;
        el.look.classList.toggle('show', v > 0);
    }

    function setGodMode(on) { el.god.style.display = on ? 'block' : 'none'; }

    function setCrosshair(mode) { setClass(el.crosshair, 'cross', 'interact', mode === 'interact'); }

    // ---- Notes ----------------------------------------------------------------
    function openNote(note) {
        el.noteTitle.textContent = note.title;
        el.noteDate.textContent = note.date;
        el.noteText.innerHTML = note.html;
        el.noteScreen.classList.add('show');
    }
    function closeNote() { el.noteScreen.classList.remove('show'); }

    // ---- Level card & loading --------------------------------------------------
    function levelCard(num, title, sub) {
        el.levelCardNum.textContent = num;
        el.levelCardTitle.textContent = title;
        el.levelCardSub.textContent = sub;
        el.levelCard.classList.remove('show');
        void el.levelCard.offsetWidth;
        el.levelCard.classList.add('show');
    }

    function showLoading(on, text = '', pct = 0) {
        el.loading.classList.toggle('show', on);
        if (on) {
            el.loadingText.textContent = text;
            el.loadingFill.style.transform = `scaleX(${pct})`;
        }
    }

    function showHud(on) { el.hud.classList.toggle('show', on); }

    // ---- Minimap: heading-up, revealed only where you have been ------------------
    function resetMap() {
        revealed = new Uint8Array(World.SIZE * World.SIZE);
    }

    function reveal(cx, cz) {
        const S = World.SIZE;
        const mark = (x, z) => { if (World.inBounds(x, z)) revealed[x * S + z] = 1; };
        mark(cx, cz);
        // See down open corridors
        for (const d of World.DIRS) {
            let x = cx, z = cz;
            for (let i = 0; i < 3; i++) {
                if (!World.canStep(x, z, d.dx, d.dz)) break;
                x += d.dx;
                z += d.dz;
                mark(x, z);
            }
        }
    }

    function isRevealed(x, z) { return World.inBounds(x, z) && revealed[x * World.SIZE + z] === 1; }

    function drawMap(cam, yaw, level, time) {
        const W = el.minimap.width, R = W / 2;
        const scale = R / (6.5 * World.CELL);
        const C = World.CELL, Hf = World.HALF;
        const px = cam.position.x, pz = cam.position.z;
        const pcx = World.cellX(px), pcz = World.cellX(pz);
        const ctx = mctx;
        ctx.clearRect(0, 0, W, W);
        ctx.save();
        ctx.beginPath();
        ctx.arc(R, R, R - 2, 0, TAU);
        ctx.clip();
        const bg = ctx.createRadialGradient(R, R, 0, R, R, R);
        bg.addColorStop(0, level.id === 1 ? 'rgba(30,14,12,0.85)' : 'rgba(14,20,24,0.85)');
        bg.addColorStop(1, 'rgba(0,0,0,0.92)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, W);

        ctx.translate(R, R);
        ctx.rotate(yaw);
        ctx.translate(-px * scale, -pz * scale);

        const range = 8;
        const cells = World.cells;
        ctx.fillStyle = level.id === 1 ? 'rgba(120,90,70,0.16)' : 'rgba(90,120,110,0.14)';
        for (let x = pcx - range; x <= pcx + range; x++) {
            for (let z = pcz - range; z <= pcz + range; z++) {
                if (!isRevealed(x, z)) continue;
                ctx.fillRect((x * C - Hf) * scale, (z * C - Hf) * scale, C * scale, C * scale);
            }
        }
        ctx.strokeStyle = level.id === 1 ? 'rgba(210,180,160,0.8)' : 'rgba(150,200,170,0.75)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let x = pcx - range; x <= pcx + range; x++) {
            for (let z = pcz - range; z <= pcz + range; z++) {
                if (!isRevealed(x, z)) continue;
                const c = cells[x][z];
                const x0 = (x * C - Hf) * scale, x1 = (x * C + Hf) * scale;
                const z0 = (z * C - Hf) * scale, z1 = (z * C + Hf) * scale;
                if (c.n) { ctx.moveTo(x0, z0); ctx.lineTo(x1, z0); }
                if (c.s) { ctx.moveTo(x0, z1); ctx.lineTo(x1, z1); }
                if (c.w) { ctx.moveTo(x0, z0); ctx.lineTo(x0, z1); }
                if (c.e) { ctx.moveTo(x1, z0); ctx.lineTo(x1, z1); }
            }
        }
        ctx.stroke();

        const dot = (x, z, r, color) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x * scale, z * scale, r, 0, TAU);
            ctx.fill();
        };
        for (const l of level.lamps) if (isRevealed(l.cell.x, l.cell.z)) dot(l.pos.x, l.pos.z, 2.5, l.level > 0.3 ? '#ffa860' : '#6a4a30');
        for (const p of level.pickups) {
            if (p.collected || !isRevealed(p.cell.x, p.cell.z)) continue;
            dot(p.pos.x, p.pos.z, 3, p.type === 'battery' ? '#46ff86' : p.type === 'relic' ? '#ffd36a' : '#ff7a40');
        }
        for (const n of level.notes) if (isRevealed(n.cell.x, n.cell.z)) dot(n.pos.x, n.pos.z, 3, n.read ? '#7a7060' : '#f0e0b0');
        ctx.restore();

        // Exits: always shown, pinned to the rim when out of range
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        for (const ex of level.exits) {
            const dx = (ex.pos.x - px) * scale, dz = (ex.pos.z - pz) * scale;
            let rx = dx * cy - dz * sy, ry = dx * sy + dz * cy;
            const d = Math.sqrt(rx * rx + ry * ry);
            const edge = d > R - 12;
            if (edge) { rx = rx / d * (R - 12); ry = ry / d * (R - 12); }
            const pulse = 0.6 + Math.sin(time * 4) * 0.4;
            ctx.fillStyle = level.id === 1 ? `rgba(70,255,130,${pulse})` : `rgba(255,210,110,${pulse})`;
            ctx.beginPath();
            if (edge) {
                const a = Math.atan2(ry, rx);
                ctx.moveTo(R + rx + Math.cos(a) * 7, R + ry + Math.sin(a) * 7);
                ctx.lineTo(R + rx + Math.cos(a + 2.4) * 6, R + ry + Math.sin(a + 2.4) * 6);
                ctx.lineTo(R + rx + Math.cos(a - 2.4) * 6, R + ry + Math.sin(a - 2.4) * 6);
            } else {
                ctx.rect(R + rx - 4, R + ry - 4, 8, 8);
            }
            ctx.fill();
        }

        // Player
        ctx.fillStyle = '#ffe6b0';
        ctx.beginPath();
        ctx.moveTo(R, R - 8);
        ctx.lineTo(R + 5.5, R + 6);
        ctx.lineTo(R, R + 3);
        ctx.lineTo(R - 5.5, R + 6);
        ctx.closePath();
        ctx.fill();
    }

    return {
        update, setObjective, setStatus, setPrompt, toast, matchFlash, setLookWarning, setGodMode, setCrosshair,
        openNote, closeNote, levelCard, showLoading, showHud,
        resetMap, reveal, drawMap
    };
})();
