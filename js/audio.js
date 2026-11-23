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
        get context() { return ctx; }
    };
})();
