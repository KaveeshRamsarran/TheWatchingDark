// THE WATCHING DARK - audio
// Uses the original sound files. When served over http(s) the looping voices are routed
// through Web Audio so monster footsteps can be panned toward where they really are.
'use strict';

const AudioSys = (() => {
    const FILES = {
        menu: 'audio/main menu.mp3',
        ost: 'audio/OST.mp3',
        level2: 'audio/Level2.mp3',
        footsteps: 'audio/footsteps.mp3',
        grass: 'audio/grass.mp3',
        match: 'audio/Lighting a match.mp3',
        jumpscare: 'audio/jumpscare.mp3',
        chimes: 'audio/angelchimes.mp3',
        concrete: 'audio/concrete.mp3',
        ambience2: 'audio/Ambience2.mp3'
    };

    let ctx = null;
    let sfxGain = null;
    let drone = null;
    let canRoute = false;
    let music = null;
    let musicBase = 0;
    const voices = [];
    const settings = { music: 0.3, sfx: 0.75 };

    // Jumpscare must fire instantly, so keep it decoded and ready.
    const jumpscareEl = new Audio(FILES.jumpscare);
    jumpscareEl.preload = 'auto';
    const matchEl = new Audio(FILES.match);
    matchEl.preload = 'auto';

    function ensureContext() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
            sfxGain = ctx.createGain();
            sfxGain.gain.value = settings.sfx;
            sfxGain.connect(ctx.destination);
            canRoute = location.protocol === 'http:' || location.protocol === 'https:';
        }
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
    }

    function setVolumes(musicVol, sfxVol) {
        settings.music = musicVol;
        settings.sfx = sfxVol;
        if (sfxGain) sfxGain.gain.value = sfxVol;
        if (music) music.volume = clamp(musicBase * musicVol, 0, 1);
        for (const v of voices) v.apply();
    }

    // ---- Music ---------------------------------------------------------------
    // base is relative to the music slider (1.0 = slider value)
    function playMusic(key, base) {
        stopMusic();
        music = new Audio(FILES[key]);
        music.loop = true;
        musicBase = base;
        music.volume = clamp(base * settings.music, 0, 1);
        musicPaused = false;
        music.play().catch(() => { blockedMusic = true; });
        return music;
    }

    function stopMusic() {
        if (music) {
            music.pause();
            music.src = '';
            music = null;
        }
    }

    function pauseMusic(paused) {
        if (!music) return;
        musicPaused = paused;
        if (paused) music.pause();
        else music.play().catch(() => { blockedMusic = true; });
    }

    // ---- Directional (3D) audio ----------------------------------------------------
    // The listener follows the camera every frame. Any sound can be given a world position
    // ({x, y, z}) instead of a left/right pan: it is then placed with HRTF panning, so you
    // can hear what is behind you, above you, or just round the corner.
    const lis = { x: 0, y: 1.6, z: 0, fx: 0, fy: 0, fz: -1, rx: 1, rz: 0 };
    const isPos = (p) => !!p && typeof p === 'object';
    function setListener(cam) {
        if (!ctx) return;
        const e = cam.matrixWorld.elements;
        lis.x = e[12]; lis.y = e[13]; lis.z = e[14];
        lis.fx = -e[8]; lis.fy = -e[9]; lis.fz = -e[10];
        const len = Math.hypot(lis.fx, lis.fz) || 1;
        lis.rx = -lis.fz / len; lis.rz = lis.fx / len;
        const L = ctx.listener;
        if (L.positionX) {
            L.positionX.value = lis.x; L.positionY.value = lis.y; L.positionZ.value = lis.z;
            L.forwardX.value = lis.fx; L.forwardY.value = lis.fy; L.forwardZ.value = lis.fz;
            L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6];
        } else if (L.setPosition) {
            L.setPosition(lis.x, lis.y, lis.z);
            L.setOrientation(lis.fx, lis.fy, lis.fz, e[4], e[5], e[6]);
        }
    }
    // A plain left/right pan becomes a point in front of the listener
    function panToPos(pan) {
        const k = clamp(pan, -1, 1), f = Math.sqrt(1 - k * k);
        return { x: lis.x + lis.rx * k * 2 + lis.fx * f * 2, y: lis.y, z: lis.z + lis.rz * k * 2 + lis.fz * f * 2 };
    }
    function placePanner(p, at) {
        if (p.positionX) { p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; }
        else p.setPosition(at.x, at.y, at.z);
    }
    function makePanner(at) {
        const p = ctx.createPanner();
        p.panningModel = 'HRTF';
        p.distanceModel = 'linear';     // loudness is already shaped by each sound; this is direction only
        p.rolloffFactor = 0;
        p.refDistance = 1;
        p.maxDistance = 10000;
        placePanner(p, at);
        return p;
    }

    // ---- Looping voices (footsteps, chimes, ambience) ------------------------
    // rate: playback speed; pitch: false lets a slower rate drop the pitch (heavier steps)
    function createVoice(key, { loop = true, base = 1, rate = 1, pitch = true } = {}) {
        const el = new Audio(FILES[key]);
        el.loop = loop;
        el.preload = 'auto';
        el.playbackRate = rate;
        if (!pitch) { el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false; }
        const voice = {
            el, base, level: 0, pan: 0, gain: null, panner: null, playing: false,
            apply() {
                const v = clamp(this.level * this.base, 0, 1);
                if (this.gain) {
                    this.gain.gain.value = v * settings.sfx;
                    if (this.panner) placePanner(this.panner, isPos(this.pan) ? this.pan : panToPos(this.pan || 0));
                } else {
                    el.volume = clamp(v * settings.sfx, 0, 1);
                }
            },
            set(level, pan = 0) {
                this.level = level;
                this.pan = pan;
                this.apply();
                if (level > 0.001) this.play();
                else this.stop();
            },
            play() {
                if (this.playing) return;
                this.playing = true;
                el.play().catch(() => { this.playing = false; blocked.add(this); });
            },
            stop(reset = true) {
                if (!this.playing) return;
                this.playing = false;
                el.pause();
                if (reset) el.currentTime = 0;
            },
            destroy() {
                this.stop();
                if (this.gain) { try { this.gain.disconnect(); } catch (e) { /* already detached */ } }
                if (this.panner) { try { this.panner.disconnect(); } catch (e) { /* already detached */ } }
                el.removeAttribute('src');
                el.load();
                const i = voices.indexOf(this);
                if (i >= 0) voices.splice(i, 1);
            }
        };
        if (ctx && canRoute) {
            try {
                const src = ctx.createMediaElementSource(el);
                voice.gain = ctx.createGain();
                voice.panner = makePanner(panToPos(0));
                src.connect(voice.panner);
                voice.panner.connect(voice.gain);
                voice.gain.connect(ctx.destination);
                el.volume = 1;
            } catch (e) {
                voice.gain = null;
                voice.panner = null;
            }
        }
        voice.apply();
        voices.push(voice);
        return voice;
    }

    function stopAllVoices() {
        for (const v of voices) v.stop(false);
    }

    function destroyAllVoices() {
        while (voices.length) voices[voices.length - 1].destroy();
    }

    // ---- One-shots -------------------------------------------------------------
    function playMatch() {
        matchEl.volume = clamp(0.5 * settings.sfx, 0, 1);
        matchEl.currentTime = 0;
        matchEl.play().catch(() => {});
    }

    // ---- Mobile browsers (iOS Safari especially) refuse to start sounds that weren't
    // triggered by a tap. Anything refused is retried on the player's next touch.
    const blocked = new Set();
    let blockedMusic = false, musicPaused = false, unlocked = false;

    function retryBlocked() {
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        if (blockedMusic && music && !musicPaused) {
            blockedMusic = false;
            music.play().catch(() => { blockedMusic = true; });
        }
        for (const v of Array.from(blocked)) {
            blocked.delete(v);
            if (v.level > 0.001 && voices.includes(v)) v.play();
        }
    }

    // Prime the one-shot sounds during a tap so they may play later without one
    function unlock() {
        ensureContext();
        if (unlocked) return;
        unlocked = true;
        for (const el of [jumpscareEl, matchEl]) {
            el.muted = true;
            const p = el.play();
            const done = () => { el.pause(); el.currentTime = 0; el.muted = false; };
            if (p && p.then) p.then(done).catch(() => { el.muted = false; unlocked = false; });
            else done();
        }
    }

    function playJumpscare() {
        jumpscareEl.volume = clamp(0.2 * settings.sfx, 0, 1);
        jumpscareEl.currentTime = 0;
        jumpscareEl.play().catch(() => {});
    }

    // ---- Procedural sounds (same recipes as the original game) ---------------
    function startDrone() {
        if (!ensureContext() || drone) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 60;
        gain.gain.value = 0.03;
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start();
        drone = { osc, gain };
    }

    function stopDrone() {
        if (!drone) return;
        try { drone.osc.stop(); } catch (e) { /* already stopped */ }
        drone = null;
    }

    // ---- Little building blocks for the one-shots below ------------------------
    // A short burst of filtered noise: the body of every click, rattle and thud
    function burst(t, dest, { type = 'bandpass', freq = 3000, q = 1, gain = 0.3, attack = 0.001, decay = 0.02 }) {
        const src = noise();
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        src.connect(f);
        f.connect(g);
        g.connect(dest);
        src.start(t, Math.random() * 1.5, attack + decay + 0.02);
    }

    // A decaying partial: bells, pings, the ring of a plastic body
    function ping(t, dest, freq, gain, decay, attack = 0.002, type = 'sine') {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + attack + decay + 0.03);
        return o;
    }

    function bus(pan = 0, wet = 0) {
        const b = ctx.createGain();
        out(b, pan, wet);
        return b;
    }

    // Your own heartbeat, heard from the inside: a muffled lub-dub you feel in your chest
    function heartbeat(rate = 1, volume = 0.15) {
        if (!live()) return;
        const t0 = ctx.currentTime + 0.01;
        const chest = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 240;
        lp.Q.value = 0.6;
        chest.connect(lp);
        out(lp, 0, 0);
        const gap = 0.3 / Math.sqrt(rate);   // lub to dub closes up as it races
        [[0, 1, 56], [gap, 0.6, 70]].forEach(([dt, k, f]) => {
            const t = t0 + dt;
            const a = volume * k * 2.4;
            const o = ping(t, chest, f, a, 0.19, 0.012);
            o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.15);
            // A second harmonic so it still carries on small speakers
            const o2 = ping(t, chest, f * 2, a * 0.3, 0.09, 0.01, 'triangle');
            o2.frequency.exponentialRampToValueAtTime(f * 1.1, t + 0.09);
            // The valves' soft knock
            burst(t, chest, { type: 'lowpass', freq: 170, q: 0.7, gain: a * 0.9, attack: 0.004, decay: 0.07 });
        });
    }

    // A rubber-capped tail switch: the press clicks in, then the spring snaps back.
    // Off sounds duller than on; with no battery left it clicks and nothing happens.
    function flashlight(on = true, dead = false) {
        if (!ensureContext()) return;
        const t = ctx.currentTime + 0.005;
        const b = bus(0.15, 0.04);   // in your right hand
        const hi = on && !dead ? 1 : 0.8;
        burst(t, b, { type: 'lowpass', freq: 900, gain: 0.1, attack: 0.002, decay: 0.03 });
        burst(t + 0.006, b, { freq: 4200 * hi, q: 3, gain: 0.42, attack: 0.0008, decay: 0.012 });
        ping(t + 0.006, b, 2350 * hi, 0.05, 0.025);
        const r = t + rand(0.075, 0.1);
        burst(r, b, { freq: 5200 * hi, q: 4, gain: dead ? 0.12 : 0.22, attack: 0.0006, decay: 0.009 });
        ping(r, b, 3100 * hi, 0.025, 0.018);
    }
    const click = () => flashlight(true);

    // Picking something up: your hand closing on it, then what it is
    function pickup(kind = 'item') {
        if (kind === true) kind = 'relic';
        if (!ensureContext()) return;
        const t = ctx.currentTime + 0.005;
        const b = bus(0, 0.12);
        burst(t, b, { freq: 1600, q: 0.6, gain: 0.05, attack: 0.03, decay: 0.12 });   // a sleeve's swish
        if (kind === 'matches') {
            // A matchbox shaken once: the sticks rattle in the cardboard
            burst(t + 0.04, b, { type: 'lowpass', freq: 650, gain: 0.12, attack: 0.003, decay: 0.05 });
            for (let i = 0; i < 10; i++) {
                const ti = t + 0.05 + Math.random() * 0.13 + (i > 5 ? 0.13 : 0);
                burst(ti, b, { freq: rand(2200, 4400), q: 6, gain: rand(0.08, 0.2), attack: 0.0006, decay: rand(0.006, 0.014) });
            }
        } else if (kind === 'battery') {
            // A battery slid home: metal on metal, then the cap clicks shut
            [2730, 4110, 6050].forEach((f, i) => ping(t + 0.05, b, f, 0.06 / (i + 1), 0.09 - i * 0.02));
            burst(t + 0.05, b, { freq: 5000, q: 2, gain: 0.16, attack: 0.0006, decay: 0.01 });
            burst(t + 0.21, b, { freq: 3200, q: 3, gain: 0.3, attack: 0.0008, decay: 0.014 });
            burst(t + 0.21, b, { type: 'lowpass', freq: 700, gain: 0.12, attack: 0.002, decay: 0.03 });
        } else if (kind === 'relic') {
            // Something holy: a struck singing bowl, its tail shimmering away in the reverb
            const w = bus(0, 0.9);
            const f = 311;
            [[1, 0.14, 3.2], [1.004, 0.08, 3.0], [2.71, 0.06, 2.2], [5.18, 0.03, 1.4], [8.4, 0.012, 0.9]]
                .forEach(([m, a, d]) => ping(t + 0.06, w, f * m, a, d, 0.004));
            ping(t + 0.06, w, f * 2, 0.04, 1.6, 0.35);   // an octave breathing in behind it
        } else {
            burst(t + 0.05, b, { freq: 2400, q: 2, gain: 0.2, attack: 0.001, decay: 0.02 });
        }
    }

    function batteryDead() {
        if (!ensureContext()) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.3);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(t);
        osc.stop(t + 0.32);
    }

    // TV-static burst used when a Watcher is right behind you
    function staticBurst(intensity = 0.5, pan = 0) {
        if (!ctx || ctx.state !== 'running') return;
        const len = Math.floor(ctx.sampleRate * 0.35);
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 2600;
        band.Q.value = 2;
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = 500;
        const gain = ctx.createGain();
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0.14 * intensity, t);
        gain.gain.exponentialRampToValueAtTime(0.005, t + 0.35);
        src.connect(band);
        src.connect(low);
        band.connect(gain);
        low.connect(gain);
        if (isPos(pan)) {
            const p = makePanner(pan);
            gain.connect(p);
            p.connect(sfxGain);
        } else if (ctx.createStereoPanner) {
            const p = ctx.createStereoPanner();
            p.pan.value = clamp(pan, -1, 1);
            gain.connect(p);
            p.connect(sfxGain);
        } else {
            gain.connect(sfxGain);
        }
        src.start(t);
    }

    // ---- Procedural sounds for the lower levels --------------------------------
    // Everything below can send into a shared reverb, so drips, splashes and voices sit in
    // the same echoing space instead of sounding pasted on top of the level.
    const live = () => ctx && ctx.state === 'running';
    let noiseBuf = null, brownBuf = null;
    let reverbIn = null, reverbOut = null;
    const beds = [];

    function noise() {
        if (!noiseBuf) {
            const len = Math.floor(ctx.sampleRate * 2.0);
            noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        return src;
    }

    // Deep, rumbling (brown) noise for beds of water and breath
    function brown() {
        if (!brownBuf) {
            const len = Math.floor(ctx.sampleRate * 6.0);
            brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = brownBuf.getChannelData(0);
            let last = 0;
            for (let i = 0; i < len; i++) {
                last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
                d[i] = last * 3.5;
            }
            // Cross-fade the ends so the loop has no click
            const fade = Math.floor(ctx.sampleRate * 0.1);
            for (let i = 0; i < fade; i++) {
                const t = i / fade;
                d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t;
            }
        }
        const src = ctx.createBufferSource();
        src.buffer = brownBuf;
        src.loop = true;
        return src;
    }

    // A generated impulse response: a few early reflections, then a dark decaying tail
    function ensureReverb() {
        if (reverbIn) return;
        const sr = ctx.sampleRate, len = Math.floor(sr * 3.2);
        const ir = ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / sr;
                const n = Math.random() * 2 - 1;
                const damp = lerp(0.85, 0.08, Math.min(1, t / 2.2)); // highs die first
                lp += (n - lp) * damp;
                d[i] = lp * Math.exp(-t / 0.62);
            }
            for (let k = 0; k < 6; k++) {
                const i = Math.floor(sr * rand(0.008, 0.07));
                d[i] += rand(-0.7, 0.7);
            }
        }
        const conv = ctx.createConvolver();
        conv.buffer = ir;
        reverbIn = ctx.createGain();
        reverbOut = ctx.createGain();
        reverbOut.gain.value = 0.5;
        reverbIn.connect(conv);
        conv.connect(reverbOut);
        reverbOut.connect(sfxGain);
    }

    function setReverb(amount) {
        if (!ensureContext()) return;
        ensureReverb();
        reverbOut.gain.value = amount;
    }

    // Route a sound: dry through an optional panner, plus a send into the reverb
    function out(node, pan = 0, wet = 0.3) {
        ensureReverb();
        let tail = node;
        if (isPos(pan)) {
            const p = makePanner(pan);
            node.connect(p);
            tail = p;
        } else if (pan && ctx.createStereoPanner) {
            const p = ctx.createStereoPanner();
            p.pan.value = clamp(pan, -1, 1);
            node.connect(p);
            tail = p;
        }
        tail.connect(sfxGain);
        if (wet > 0) {
            const send = ctx.createGain();
            send.gain.value = wet;
            tail.connect(send);
            send.connect(reverbIn);
        }
    }

    // Distance: duller and wetter the further away a sound is (far 0..1)
    function distanceBus(pan, far, wet) {
        const bus = ctx.createGain();
        const muffle = ctx.createBiquadFilter();
        muffle.type = 'lowpass';
        muffle.frequency.value = 400 + 9000 * Math.pow(1 - clamp(far, 0, 1), 1.6);
        bus.connect(muffle);
        out(muffle, pan, wet + far * 0.6);
        return bus;
    }

    // An air bubble breaking the surface: a sine whose pitch rises sharply as it pops
    function bubble(t, f, amp, dest, dur = rand(0.025, 0.07)) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * rand(1.7, 2.6), t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(amp, 0.0002), t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + dur + 0.02);
    }

    // A step through standing water: a soft slosh, a cluster of bubbles, droplets falling back.
    // depth 0..1 (deeper = lower and longer), far 0..1 (distance from the listener)
    function splash(volume = 0.5, depth = 0, pan = 0, far = 0) {
        if (!live() || volume <= 0.002) return;
        const t = ctx.currentTime + 0.005;
        const bus = distanceBus(pan || rand(-0.12, 0.12), far, 0.22);

        const src = noise();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.7;
        bp.frequency.setValueAtTime(rand(650, 950) - depth * 260, t);
        bp.frequency.exponentialRampToValueAtTime(rand(170, 240), t + 0.24 + depth * 0.12);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5 * volume, t + 0.014);
        g.gain.exponentialRampToValueAtTime(0.1 * volume, t + 0.09);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.34 + depth * 0.2);
        src.connect(bp);
        bp.connect(lp);
        lp.connect(g);
        g.connect(bus);
        src.start(t, Math.random() * 1.2, 0.7);

        const n = randInt(3, 6) + Math.round(depth * 3);
        for (let i = 0; i < n; i++) {
            bubble(t + rand(0.01, 0.13 + depth * 0.12), rand(380, 1250) * (1 - depth * 0.35), volume * rand(0.035, 0.09), bus);
        }
        const drops = randInt(0, 2);
        for (let i = 0; i < drops; i++) bubble(t + rand(0.2, 0.38), rand(1500, 2700), volume * 0.025, bus, rand(0.015, 0.03));
    }

    // A single drop falling into still water somewhere in the dark - mostly echo
    function drip(pan = 0, volume = 0.5) {
        if (!live()) return;
        const t = ctx.currentTime + 0.005;
        const bus = distanceBus(pan, rand(0.2, 0.7), 0.6);
        const f = rand(700, 1500);
        bubble(t, f, 0.11 * Math.max(volume, 0.05), bus, rand(0.05, 0.09));
        if (Math.random() < 0.4) bubble(t + rand(0.12, 0.25), f * rand(1.1, 1.4), 0.04 * Math.max(volume, 0.05), bus, 0.04);
    }

    // Echolocation: wet tongue clicks that speed up, with a croaking rattle when they hunt
    function clicks(volume = 0.5, pan = 0, urgent = false, far = 0) {
        if (!live() || volume <= 0.01) return;
        const t0 = ctx.currentTime + 0.005;
        const bus = distanceBus(pan, far, 0.35);
        const count = urgent ? randInt(5, 8) : randInt(3, 5);
        let t = t0, gap = urgent ? 0.11 : 0.17;
        for (let i = 0; i < count; i++) {
            // Sharp transient
            const src = noise();
            const band = ctx.createBiquadFilter();
            band.type = 'bandpass';
            band.frequency.value = rand(1400, 2100);
            band.Q.value = 3;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.42 * volume, t + 0.002);
            g.gain.exponentialRampToValueAtTime(0.0005, t + 0.022);
            src.connect(band);
            band.connect(g);
            g.connect(bus);
            src.start(t, Math.random() * 1.5, 0.03);
            // Hollow "tock" of the mouth cavity
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(rand(320, 440), t);
            o.frequency.exponentialRampToValueAtTime(rand(180, 240), t + 0.03);
            const og = ctx.createGain();
            og.gain.setValueAtTime(0.0001, t);
            og.gain.exponentialRampToValueAtTime(0.22 * volume, t + 0.003);
            og.gain.exponentialRampToValueAtTime(0.0005, t + 0.045);
            o.connect(og);
            og.connect(bus);
            o.start(t);
            o.stop(t + 0.06);
            t += gap * rand(0.85, 1.15);
            gap *= 0.86;
        }
        if (urgent) rattle(t + 0.05, volume * 0.8, bus);
    }

    // Vocal-fry croak: a slow buzz pushed through throat-like formants
    function rattle(t, volume, dest) {
        const dur = rand(0.35, 0.6);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(rand(32, 46), t);
        o.frequency.linearRampToValueAtTime(rand(24, 34), t + dur);
        const f1 = ctx.createBiquadFilter();
        f1.type = 'bandpass'; f1.frequency.value = rand(480, 620); f1.Q.value = 4;
        const f2 = ctx.createBiquadFilter();
        f2.type = 'bandpass'; f2.frequency.value = rand(1250, 1600); f2.Q.value = 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0005, 0.5 * volume), t + 0.04);
        g.gain.setValueAtTime(Math.max(0.0005, 0.5 * volume), t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
        o.connect(f1);
        o.connect(f2);
        f1.connect(g);
        f2.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + dur + 0.05);
    }

    // A gargled, drowning wail when one of them hears you
    function wail(volume = 0.5, pan = 0, far = 0) {
        if (!live() || volume <= 0.01) return;
        const t = ctx.currentTime + 0.01;
        const dur = rand(1.1, 1.6);
        const bus = distanceBus(pan, far, 0.55);
        const voice = ctx.createOscillator();
        voice.type = 'sawtooth';
        const f0 = rand(120, 150);
        voice.frequency.setValueAtTime(f0, t);
        voice.frequency.exponentialRampToValueAtTime(f0 * rand(1.5, 1.8), t + dur * 0.25);
        voice.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + dur);
        const vib = ctx.createOscillator();
        const vibG = ctx.createGain();
        vib.frequency.value = rand(5, 7);
        vibG.gain.value = 7;
        vib.connect(vibG);
        vibG.connect(voice.frequency);
        const breath = noise();
        const breathG = ctx.createGain();
        breathG.gain.value = 0.25;
        breath.connect(breathG);
        // Throat formants
        const mix = ctx.createGain();
        const formants = [[rand(650, 760), 6, 1], [rand(1050, 1250), 7, 0.6], [rand(2400, 2800), 8, 0.25]];
        for (const [f, q, a] of formants) {
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(f, t);
            bp.frequency.linearRampToValueAtTime(f * 0.75, t + dur);
            bp.Q.value = q;
            const fg = ctx.createGain();
            fg.gain.value = a;
            voice.connect(bp);
            breathG.connect(bp);
            bp.connect(fg);
            fg.connect(mix);
        }
        // Gurgle: water in the throat chops the sound up
        const gurgle = ctx.createGain();
        gurgle.gain.value = 0.55;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.setValueAtTime(rand(13, 18), t);
        lfo.frequency.linearRampToValueAtTime(rand(7, 10), t + dur);
        const lfoG = ctx.createGain();
        lfoG.gain.value = 0.45;
        lfo.connect(lfoG);
        lfoG.connect(gurgle.gain);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.9 * volume, t + 0.09);
        env.gain.setValueAtTime(0.9 * volume, t + dur * 0.5);
        env.gain.exponentialRampToValueAtTime(0.0005, t + dur);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2600;
        mix.connect(gurgle);
        gurgle.connect(env);
        env.connect(lp);
        lp.connect(bus);
        for (const n of [voice, vib, lfo]) { n.start(t); n.stop(t + dur + 0.1); }
        breath.start(t, Math.random(), dur + 0.1);
        // Bubbles boiling up through it
        for (let i = 0; i < 8; i++) bubble(t + rand(0, dur * 0.8), rand(250, 700), volume * 0.05, bus, rand(0.04, 0.09));
    }

    // Distant metal pipe groaning under pressure
    function groan(pan = 0, volume = 0.5) {
        if (!live()) return;
        const t = ctx.currentTime + 0.01;
        const dur = rand(2.5, 4.5);
        const bus = distanceBus(pan, rand(0.4, 0.8), 0.8);
        const f = rand(52, 74);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(Math.max(0.0005, 0.16 * volume), t + dur * 0.3);
        env.gain.exponentialRampToValueAtTime(0.0005, t + dur);
        const res = ctx.createBiquadFilter();
        res.type = 'lowpass';
        res.Q.value = 9;
        res.frequency.setValueAtTime(140, t);
        res.frequency.exponentialRampToValueAtTime(rand(360, 520), t + dur * 0.45);
        res.frequency.exponentialRampToValueAtTime(160, t + dur);
        for (const detune of [1, 1.006, 1.5]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(f * detune, t);
            o.frequency.linearRampToValueAtTime(f * detune * rand(0.9, 1.08), t + dur);
            o.connect(res);
            o.start(t);
            o.stop(t + dur + 0.05);
        }
        res.connect(env);
        env.connect(bus);
    }

    // The walls' heartbeat: a deep lub-dub felt more than heard
    function thump(volume = 0.5) {
        if (!live() || volume <= 0.005) return;
        const t0 = ctx.currentTime + 0.005;
        for (let i = 0; i < 2; i++) {
            const t = t0 + i * 0.28;
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(i ? 52 : 62, t);
            o.frequency.exponentialRampToValueAtTime(28, t + 0.3);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime((i ? 0.32 : 0.45) * volume, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0005, t + 0.42);
            const src = noise();
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 160;
            const ng = ctx.createGain();
            ng.gain.setValueAtTime(0.0001, t);
            ng.gain.exponentialRampToValueAtTime(0.25 * volume, t + 0.01);
            ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
            o.connect(g);
            src.connect(lp);
            lp.connect(ng);
            out(g, 0, 0.4);
            out(ng, 0, 0.4);
            o.start(t);
            o.stop(t + 0.45);
            src.start(t, Math.random(), 0.14);
        }
    }

    // Unintelligible whispering: breathy noise shaped into syllables by moving formants
    function whisper(pan = 0, volume = 0.5, syllables = randInt(4, 10)) {
        if (!live() || volume <= 0.005) return;
        let t = ctx.currentTime + 0.01;
        const bus = distanceBus(pan, rand(0.1, 0.4), 0.5);
        const src = noise();
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 500;
        const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
        f1.type = 'bandpass'; f1.Q.value = 5;
        f2.type = 'bandpass'; f2.Q.value = 7;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        src.connect(hp);
        hp.connect(f1);
        hp.connect(f2);
        f1.connect(env);
        f2.connect(env);
        env.connect(bus);
        const start = t;
        for (let i = 0; i < syllables; i++) {
            const len = rand(0.08, 0.2);
            f1.frequency.setValueAtTime(rand(600, 1100), t);
            f2.frequency.setValueAtTime(rand(1700, 3200), t);
            f1.frequency.linearRampToValueAtTime(rand(600, 1100), t + len);
            f2.frequency.linearRampToValueAtTime(rand(1700, 3200), t + len);
            const peak = volume * rand(0.5, 1) * (Math.random() < 0.2 ? 1.6 : 1); // sibilants
            env.gain.exponentialRampToValueAtTime(Math.max(0.0005, 0.45 * peak), t + len * 0.3);
            env.gain.exponentialRampToValueAtTime(0.0008, t + len);
            t += len + (Math.random() < 0.25 ? rand(0.12, 0.3) : rand(0.01, 0.05));
        }
        src.start(start, Math.random() * 0.5, t - start + 0.05);
    }

    // A wet, sticky footstep on living floor
    function squelch(volume = 0.4) {
        if (!live() || volume <= 0.002) return;
        const t = ctx.currentTime + 0.005;
        const bus = distanceBus(rand(-0.1, 0.1), 0, 0.15);
        const src = noise();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1.4;
        bp.frequency.setValueAtTime(rand(420, 560), t);
        bp.frequency.exponentialRampToValueAtTime(rand(150, 210), t + 0.16);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.45 * volume, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.2);
        src.connect(bp);
        bp.connect(g);
        g.connect(bus);
        src.start(t, Math.random() * 1.5, 0.25);
        for (let i = 0; i < 2; i++) bubble(t + rand(0.04, 0.16), rand(180, 360), volume * 0.07, bus, rand(0.05, 0.09));
    }

    // A footstep on living flesh: weight sinking into soft tissue, a wet squish, then the
    // sole peeling away with a sticky crackle and a suction pop
    function fleshStep(volume = 0.5) {
        if (!live() || volume <= 0.002) return;
        const t = ctx.currentTime + 0.005;
        const bus = distanceBus(rand(-0.12, 0.12), 0, 0.18);
        // Thud: soft, heavy, no hard attack
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(rand(85, 105), t);
        o.frequency.exponentialRampToValueAtTime(rand(48, 58), t + 0.11);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.45 * volume, t + 0.018);
        og.gain.exponentialRampToValueAtTime(0.0005, t + 0.16);
        o.connect(og);
        og.connect(bus);
        o.start(t);
        o.stop(t + 0.18);
        // Squish: low noise, chopped into wet clicks by a fast gate
        const src = noise();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1.1;
        bp.frequency.setValueAtTime(rand(650, 850), t);
        bp.frequency.exponentialRampToValueAtTime(rand(200, 260), t + 0.2);
        const gate = ctx.createGain();
        gate.gain.value = 0.55;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = rand(28, 40);
        const lfoG = ctx.createGain();
        lfoG.gain.value = 0.45;
        lfo.connect(lfoG);
        lfoG.connect(gate.gain);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.exponentialRampToValueAtTime(0.5 * volume, t + 0.03);
        sg.gain.exponentialRampToValueAtTime(0.0005, t + 0.24);
        src.connect(bp);
        bp.connect(gate);
        gate.connect(sg);
        sg.connect(bus);
        src.start(t, Math.random() * 1.5, 0.28);
        lfo.start(t);
        lfo.stop(t + 0.28);
        // Peel: a sticky crackle as the foot lifts away, and a suction pop
        const tp = t + rand(0.12, 0.18);
        for (let i = 0; i < randInt(3, 6); i++) {
            const tc = tp + rand(0, 0.07);
            const c = noise();
            const hp = ctx.createBiquadFilter();
            hp.type = 'bandpass';
            hp.frequency.value = rand(1800, 3600);
            hp.Q.value = 2.5;
            const cg = ctx.createGain();
            cg.gain.setValueAtTime(0.0001, tc);
            cg.gain.exponentialRampToValueAtTime(0.12 * volume, tc + 0.002);
            cg.gain.exponentialRampToValueAtTime(0.0003, tc + 0.012);
            c.connect(hp);
            hp.connect(cg);
            cg.connect(bus);
            c.start(tc, Math.random() * 1.8, 0.02);
        }
        bubble(tp + rand(0.05, 0.09), rand(220, 320), volume * 0.14, bus, rand(0.05, 0.08));
    }

    // A dissonant stab for when something is suddenly there
    function sting(volume = 0.6) {
        if (!live()) return;
        const t = ctx.currentTime + 0.005;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(6000, t);
        lp.frequency.exponentialRampToValueAtTime(300, t + 1.8);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16 * volume, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 2.0);
        for (const f of [233, 247, 349, 370, 494]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(f * rand(0.995, 1.005), t);
            o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 2);
            o.connect(lp);
            o.start(t);
            o.stop(t + 2.05);
        }
        const src = noise();
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.3 * volume, t + 0.01);
        ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
        src.connect(ng);
        ng.connect(lp);
        lp.connect(g);
        out(g, 0, 0.7);
        src.start(t, 0, 0.55);
    }

    // Eyes snapping round to stare: a tiny, moist flick
    function flick(pan = 0, volume = 0.3) {
        if (!live()) return;
        const t = ctx.currentTime + 0.005;
        const bus = distanceBus(pan, 0.1, 0.25);
        bubble(t, rand(240, 340), volume * 0.18, bus, 0.04);
        const src = noise();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = rand(2200, 3200); bp.Q.value = 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0005, 0.12 * volume), t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0002, t + 0.035);
        src.connect(bp);
        bp.connect(g);
        g.connect(bus);
        src.start(t, Math.random(), 0.05);
    }

    // ---- Continuous beds ---------------------------------------------------------
    // 'water': slow lapping and a distant rush.  'flesh': a low, breathing organ drone.
    function startBed(kind) {
        if (!ensureContext()) return null;
        ensureReverb();
        const nodes = [];
        const master = ctx.createGain();
        master.gain.value = 0;
        master.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
        master.connect(sfxGain);
        const keep = (n) => { nodes.push(n); return n; };
        const lfo = (rate, depth, param, offset) => {
            const o = keep(ctx.createOscillator());
            o.frequency.value = rate;
            const g = ctx.createGain();
            g.gain.value = depth;
            o.connect(g);
            g.connect(param);
            if (offset !== undefined) param.value = offset;
            o.start();
            return o;
        };
        let intensity = null;
        const events = [];
        if (kind === 'water') {
            const src = keep(brown());
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 420;
            const lap = ctx.createGain();
            src.connect(lp);
            lp.connect(lap);
            lap.connect(master);
            lfo(0.13, 0.025, lap.gain, 0.05);
            const src2 = keep(noise());
            src2.loop = true;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.Q.value = 1.2;
            lfo(0.07, 250, bp.frequency, 900);
            const hiss = ctx.createGain();
            hiss.gain.value = 0.006;
            src2.connect(bp);
            bp.connect(hiss);
            hiss.connect(master);
            src.start();
            src2.start();
        } else if (kind === 'flesh') {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 170;
            lp.Q.value = 3;
            const drone = ctx.createGain();
            drone.gain.value = 0.09;
            lp.connect(drone);
            drone.connect(master);
            const send = ctx.createGain();
            send.gain.value = 0.4;
            drone.connect(send);
            send.connect(reverbIn);
            for (const [f, type] of [[41.2, 'sawtooth'], [41.6, 'sawtooth'], [61.7, 'triangle'], [87.3, 'sine']]) {
                const o = keep(ctx.createOscillator());
                o.type = type;
                o.frequency.value = f;
                o.connect(lp);
                o.start();
            }
            lfo(0.05, 60, lp.frequency, 170);
            // Breathing: filtered noise swelling in and out
            const br = keep(brown());
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 380;
            bp.Q.value = 0.8;
            const breath = ctx.createGain();
            br.connect(bp);
            bp.connect(breath);
            breath.connect(master);
            lfo(0.16, 0.05, breath.gain, 0.05);
            br.start();
            intensity = (v) => {
                drone.gain.setTargetAtTime(0.09 + v * 0.2, ctx.currentTime, 0.3);
                lp.frequency.setTargetAtTime(170 + v * 900, ctx.currentTime, 0.3);
            };
        } else if (kind === 'light') {
            // A soft, cold chord: the first sound down here that isn't alive
            const pad = ctx.createGain();
            pad.connect(master);
            const send = ctx.createGain();
            send.gain.value = 0.7;
            pad.connect(send);
            send.connect(reverbIn);
            lfo(0.09, 0.25, pad.gain, 0.75);
            for (const f of [220, 277.18, 329.63, 440, 659.25]) {
                const o = keep(ctx.createOscillator());
                o.type = 'sine';
                o.frequency.value = f;
                o.detune.value = rand(-6, 6);
                const g = ctx.createGain();
                g.gain.value = f > 500 ? 0.006 : 0.012;
                o.connect(g);
                g.connect(pad);
                o.start();
            }
            intensity = (v) => pad.gain.setTargetAtTime(0.75 + v * 1.2, ctx.currentTime, 0.5);
        } else if (kind === 'wind') {
            // Open air at dawn: slow gusts and a thin hiss through bare branches
            const src = keep(brown());
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.Q.value = 0.7;
            lfo(0.06, 220, bp.frequency, 420);
            const gust = ctx.createGain();
            lfo(0.045, 0.05, gust.gain, 0.08);
            src.connect(bp);
            bp.connect(gust);
            gust.connect(master);
            const hiss = keep(noise());
            hiss.loop = true;
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 2800;
            const hg = ctx.createGain();
            lfo(0.07, 0.002, hg.gain, 0.003);
            hiss.connect(hp);
            hp.connect(hg);
            hg.connect(master);
            src.start();
            hiss.start();
        }
        else if (kind === 'maze') {
            // Level I: deep concrete. A sub drone under the floor, the breathing of old air
            // ducts, a mains hum from lamps that are mostly dead, and metal settling far away.
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 130;
            lp.Q.value = 2.2;
            const drone = ctx.createGain();
            drone.gain.value = 0.075;
            lp.connect(drone);
            drone.connect(master);
            const send = ctx.createGain();
            send.gain.value = 0.35;
            drone.connect(send);
            send.connect(reverbIn);
            for (const [f, type] of [[36.7, 'sawtooth'], [37.0, 'sawtooth'], [55.0, 'triangle'], [73.4, 'sine']]) {
                const o = keep(ctx.createOscillator());
                o.type = type;
                o.frequency.value = f;
                o.connect(lp);
                o.start();
            }
            lfo(0.035, 45, lp.frequency, 130);
            const air = keep(brown());
            const alp = ctx.createBiquadFilter();
            alp.type = 'lowpass';
            alp.frequency.value = 320;
            const ag = ctx.createGain();
            air.connect(alp);
            alp.connect(ag);
            ag.connect(master);
            lfo(0.09, 0.03, ag.gain, 0.05);
            air.start();
            for (const [f, g] of [[50, 0.006], [100, 0.004], [150, 0.0015]]) {
                const o = keep(ctx.createOscillator());
                o.frequency.value = f;
                const og = ctx.createGain();
                og.gain.value = g;
                o.connect(og);
                og.connect(master);
                o.start();
            }
            events.push(() => creak(master, rand(260, 900), rand(0.04, 0.09)));
            intensity = (v) => drone.gain.setTargetAtTime(0.075 + v * 0.12, ctx.currentTime, 0.4);
        } else if (kind === 'forest') {
            // Level II: night wind through the trees and leaves, and very far off - or inside
            // your head - a choir holding one wrong chord.
            const src = keep(brown());
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.Q.value = 0.6;
            lfo(0.05, 260, bp.frequency, 480);
            const gust = ctx.createGain();
            lfo(0.04, 0.05, gust.gain, 0.085);
            src.connect(bp);
            bp.connect(gust);
            gust.connect(master);
            src.start();
            const leaves = keep(noise());
            leaves.loop = true;
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 2600;
            const lg = ctx.createGain();
            lfo(0.11, 0.004, lg.gain, 0.005);
            leaves.connect(hp);
            hp.connect(lg);
            lg.connect(master);
            leaves.start();
            const choir = ctx.createGain();
            const cs = ctx.createGain();
            cs.gain.value = 0.9;
            choir.connect(cs);
            cs.connect(reverbIn);
            choir.connect(master);
            lfo(0.025, 0.4, choir.gain, 0.6);
            for (const f of [196, 233.1, 277.2, 392, 466.2]) {
                const o = keep(ctx.createOscillator());
                o.type = 'triangle';
                o.frequency.value = f;
                o.detune.value = rand(-9, 9);
                const g = ctx.createGain();
                g.gain.value = f > 300 ? 0.0025 : 0.004;
                lfo(rand(0.05, 0.12), 0.0015, g.gain, g.gain.value);
                o.connect(g);
                g.connect(choir);
                o.start();
            }
            events.push(() => crack(master));
            intensity = (v) => choir.gain.setTargetAtTime(0.6 + v * 1.4, ctx.currentTime, 0.6);
        } else if (kind === 'studio') {
            // Level IV: dead air on a soundstage. Mains buzz from the rigs, tape hiss, a low
            // drone, and a projector somewhere still flickering a reel nobody is watching.
            for (const [f, g] of [[60, 0.007], [120, 0.005], [180, 0.002], [240, 0.001]]) {
                const o = keep(ctx.createOscillator());
                o.frequency.value = f;
                const og = ctx.createGain();
                og.gain.value = g;
                o.connect(og);
                og.connect(master);
                o.start();
            }
            const hiss = keep(noise());
            hiss.loop = true;
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 4200;
            const hg = ctx.createGain();
            hg.gain.value = 0.004;
            hiss.connect(hp);
            hp.connect(hg);
            hg.connect(master);
            hiss.start();
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 160;
            const drone = ctx.createGain();
            drone.gain.value = 0.05;
            lp.connect(drone);
            drone.connect(master);
            for (const [f, type] of [[49, 'sawtooth'], [49.3, 'sawtooth'], [73.4, 'sine']]) {
                const o = keep(ctx.createOscillator());
                o.type = type;
                o.frequency.value = f;
                o.connect(lp);
                o.start();
            }
            lfo(0.04, 50, lp.frequency, 160);
            // The projector: a fluttering whirr, 18 frames a second, drifting in and out
            const pj = keep(noise());
            pj.loop = true;
            const pbp = ctx.createBiquadFilter();
            pbp.type = 'bandpass';
            pbp.frequency.value = 1300;
            pbp.Q.value = 1.4;
            const flutter = ctx.createGain();
            lfo(18, 0.004, flutter.gain, 0.004);
            const swell = ctx.createGain();
            lfo(0.03, 0.8, swell.gain, 0.6);
            pj.connect(pbp);
            pbp.connect(flutter);
            flutter.connect(swell);
            swell.connect(master);
            pj.start();
            events.push(() => relay(master));
            intensity = (v) => drone.gain.setTargetAtTime(0.05 + v * 0.1, ctx.currentTime, 0.4);
        }
        // Occasional sounds out in the dark (a creak, a crack, a relay)
        let eventTimer = null;
        if (events.length) {
            const tick = () => {
                if (live()) pick(events)();
                eventTimer = setTimeout(tick, rand(6000, 15000));
            };
            eventTimer = setTimeout(tick, rand(3000, 8000));
        }
        const bed = {
            set(v) { if (intensity) intensity(v); },
            stop() {
                clearTimeout(eventTimer);
                master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
                const ns = nodes.slice();
                setTimeout(() => {
                    for (const n of ns) { try { n.stop(); } catch (e) { /* already stopped */ } }
                    try { master.disconnect(); } catch (e) { /* gone */ }
                }, 1500);
                const i = beds.indexOf(bed);
                if (i >= 0) beds.splice(i, 1);
            }
        };
        beds.push(bed);
        return bed;
    }

    // ---- One-off sounds for the ambient beds ------------------------------------
    // Metal settling somewhere far off: a ringing, resonant groan
    function creak(dest, f, vol) {
        const t = ctx.currentTime + 0.01;
        const src = noise();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 30;
        bp.frequency.setValueAtTime(f, t);
        bp.frequency.exponentialRampToValueAtTime(f * rand(0.7, 0.9), t + 1.6);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        src.connect(bp);
        bp.connect(g);
        out(g, rand(-0.9, 0.9), 0.9);
        src.start(t, Math.random(), 2);
    }
    // A branch cracking somewhere out in the trees
    function crack() {
        const t = ctx.currentTime + 0.01;
        for (let i = 0; i < randInt(1, 3); i++) {
            const src = noise();
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = rand(700, 1600);
            bp.Q.value = 1.5;
            const g = ctx.createGain();
            const ti = t + i * rand(0.05, 0.15);
            g.gain.setValueAtTime(0.0001, ti);
            g.gain.exponentialRampToValueAtTime(rand(0.02, 0.05), ti + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.09);
            src.connect(bp);
            bp.connect(g);
            out(g, rand(-1, 1), 0.7);
            src.start(ti, Math.random(), 0.12);
        }
    }
    // A studio light relay clunking, and the buzz as something comes on for a moment
    function relay() {
        const t = ctx.currentTime + 0.01;
        const src = noise();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        src.connect(lp);
        lp.connect(g);
        const pan = rand(-0.9, 0.9);
        out(g, pan, 0.6);
        src.start(t, Math.random(), 0.15);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 120;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, t + 0.05);
        og.gain.exponentialRampToValueAtTime(0.012, t + 0.1);
        og.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.6, 1.4));
        const olp = ctx.createBiquadFilter();
        olp.type = 'lowpass';
        olp.frequency.value = 600;
        o.connect(olp);
        olp.connect(og);
        out(og, pan, 0.4);
        o.start(t);
        o.stop(t + 1.6);
    }

    function stopBeds() {
        while (beds.length) beds[beds.length - 1].stop();
    }

    // Camcorder: a short servo whirr and beep when the lens comes up
    function camBeep(up = true) {
        if (!live()) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(up ? 1800 : 1200, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.035, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(gain);
        out(gain, 0, 0);
        osc.start(t);
        osc.stop(t + 0.08);
        const src = noise();
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 600;
        band.Q.value = 3;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        src.connect(band);
        band.connect(g2);
        out(g2, 0, 0);
        src.start(t, 0, 0.22);
    }

    function suspendAll(paused) {
        if (!ctx) return;
        if (paused) ctx.suspend().catch(() => {});
        else ctx.resume().catch(() => {});
    }

    return {
        FILES, ensureContext, setVolumes,
        playMusic, stopMusic, pauseMusic,
        createVoice, stopAllVoices, destroyAllVoices,
        playMatch, playJumpscare,
        startDrone, stopDrone, heartbeat, click, flashlight, pickup, batteryDead, staticBurst, suspendAll,
        splash, drip, clicks, wail, groan, thump, whisper, squelch, fleshStep, sting, flick, camBeep,
        setReverb, startBed, stopBeds, setListener,
        retryBlocked, unlock,
        get context() { return ctx; }
    };
})();
