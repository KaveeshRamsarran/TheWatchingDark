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
        music.play().catch(() => {});
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
        if (paused) music.pause();
        else music.play().catch(() => {});
    }

    // ---- Looping voices (footsteps, chimes, ambience) ------------------------
    function createVoice(key, { loop = true, base = 1 } = {}) {
        const el = new Audio(FILES[key]);
        el.loop = loop;
        el.preload = 'auto';
        const voice = {
            el, base, level: 0, pan: 0, gain: null, panner: null, playing: false,
            apply() {
                const v = clamp(this.level * this.base, 0, 1);
                if (this.gain) {
                    this.gain.gain.value = v * settings.sfx;
                    if (this.panner) this.panner.pan.value = clamp(this.pan, -1, 1);
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
                el.play().catch(() => { this.playing = false; });
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
                if (ctx.createStereoPanner) {
                    voice.panner = ctx.createStereoPanner();
                    src.connect(voice.panner);
                    voice.panner.connect(voice.gain);
                } else {
                    src.connect(voice.gain);
                }
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

    function heartbeat(rate = 1, volume = 0.15) {
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        for (let i = 0; i < 2; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = t + i * 0.16 / rate;
            const dur = 0.1 / rate;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(i === 0 ? 100 : 82, start);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.setValueAtTime(volume * (i === 0 ? 1 : 0.7), start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
            osc.connect(gain);
            gain.connect(sfxGain);
            osc.start(start);
            osc.stop(start + dur + 0.02);
        }
    }

    function click() {
        if (!ensureContext()) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.02);
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(sfxGain);
        osc.start(t);
        osc.stop(t + 0.05);
    }

    function pickup(relic = false) {
        if (!ensureContext()) return;
        const t = ctx.currentTime;
        const notes = relic ? [523, 659, 784] : [400];
        notes.forEach((f, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            const st = t + i * 0.08;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, st);
            osc.frequency.exponentialRampToValueAtTime(f * 2, st + 0.1);
            gain.gain.setValueAtTime(0.3, st);
            gain.gain.exponentialRampToValueAtTime(0.01, st + 0.3);
            osc.connect(gain);
            gain.connect(sfxGain);
            osc.start(st);
            osc.stop(st + 0.32);
        });
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
        if (ctx.createStereoPanner) {
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
        if (pan && ctx.createStereoPanner) {
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
        }
        const bed = {
            set(v) { if (intensity) intensity(v); },
            stop() {
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
        startDrone, stopDrone, heartbeat, click, pickup, batteryDead, staticBurst, suspendAll,
        splash, drip, clicks, wail, groan, thump, whisper, squelch, fleshStep, sting, flick, camBeep,
        setReverb, startBed, stopBeds,
        get context() { return ctx; }
    };
})();
