// THE WATCHING DARK - a first-person psychological horror maze
// Navigate dark corridors while creatures hunt you. Sanity drains in darkness,
// matches and light keep you alive. Main game flow, player and rendering.
'use strict';

(() => {
    const $ = (id) => document.getElementById(id);

    // =========================================================================
    // Settings
    // =========================================================================
    const DEFAULTS = { musicVolume: 0.3, sfxVolume: 0.75, cameraSensitivity: 0.002, brightness: 1.0, quality: 'medium' };
    const FOV = 60; // fixed field of view (degrees)
    const settings = Object.assign({}, DEFAULTS);
    // Phones and tablets: touch controls, no pointer lock, and lighter graphics by default
    const touchMode = TouchControls.enabled;
    if (touchMode) settings.quality = 'low';
    try {
        const saved = JSON.parse(localStorage.getItem('gameSettings') || 'null');
        if (saved) {
            for (const k of Object.keys(DEFAULTS)) {
                if (saved[k] !== undefined && saved[k] !== null && typeof saved[k] === typeof DEFAULTS[k]) settings[k] = saved[k];
            }
        }
    } catch (e) { /* storage unavailable */ }
    const saveSettings = () => { try { localStorage.setItem('gameSettings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

    const dpr = window.devicePixelRatio || 1;
    const QUALITY = {
        low: { pixelRatio: 1, scale: 0.6, minScale: 0.4, bloom: false, shadows: false, shadowSize: 512 },
        medium: { pixelRatio: Math.min(dpr, 1.25), scale: 0.8, minScale: 0.45, bloom: true, shadows: true, shadowSize: 1024 },
        high: { pixelRatio: Math.min(dpr, 1.5), scale: 1.0, minScale: 0.5, bloom: true, shadows: true, shadowSize: 2048 }
    };
    const quality = () => QUALITY[settings.quality] || QUALITY.medium;

    // =========================================================================
    // Renderer & core objects
    // =========================================================================
    const container = $('game-canvas');
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    } catch (e) {
        $('webgl-error').classList.add('show');
        return;
    }
    renderer.outputEncoding = THREE.LinearEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
    container.appendChild(renderer.domElement);
    Textures.setRenderer(renderer);
    PostFX.init(renderer);

    const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.05, 90);
    camera.rotation.order = 'YXZ';
    const clock = new THREE.Clock();
    const frustum = new THREE.Frustum();
    const projScreen = new THREE.Matrix4();

    let scene = null;
    let level = null;
    let rig = null;       // per-level lights, view models and particles
    let renderScale = quality().scale;

    const state = {
        mode: 'menu',          // menu | loading | playing | paused | dying | dead | transition | victory
        levelId: 1,
        levelTime: 0,
        time: 0,
        fade: 0,               // 0..1 blackout used for transitions
        fadeTarget: 0,
        flash: 0,
        flashColor: new THREE.Color(1, 1, 1),
        note: null,
        mapTimer: 0,
        revealTimer: 0,
        hudTimer: 0,
        heartbeatTimer: 0,
        beat: 0,
        ambienceTimer: 20,
        hallucination: null,
        angelState: { closest: Infinity, charge: 0, looked: 0 },
        stats: { runStart: 0, deaths: 0, matchesUsed: 0, notes: new Set() },
        debug: /[?&]debug\b/.test(location.search)
    };

    const player = {
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        yaw: 0, pitch: 0, roll: 0,
        height: 1.65,
        sanity: 100, stamina: 100, battery: 100,
        matches: 5, matchLit: false, matchTime: 0,
        flashlightOn: true,
        exhausted: false, sprinting: false,
        noise: 0, noisePos: new THREE.Vector3(),
        relicTime: 0,
        godMode: false,
        bobPhase: 0,
        aim: new THREE.Vector3(0, 0, -1),
        swayX: 0, swayY: 0,
        lowBatteryFlicker: 1,
        crouch: false, crouchAmt: 0,          // C toggles a slow, near-silent crouch
        lens: 0, lensHeld: false, lensToggle: false, // camcorder (level IV): 0 = lowered, 1 = raised
        wade: 0,                              // 0 = shallows, 1 = deep water (level III)
        stepPhase: 0
    };

    const keys = {};

    // =========================================================================
    // Sizing & adaptive resolution
    // =========================================================================
    function applySize() {
        const q = quality();
        renderer.setPixelRatio(q.pixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        const cw = Math.floor(window.innerWidth * q.pixelRatio), ch = Math.floor(window.innerHeight * q.pixelRatio);
        PostFX.setSize(cw, ch, renderScale);
        Models.pointUniforms.pixelScale.value = (ch * renderScale) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
        PostFX.setBloom(q.bloom);
    }
    window.addEventListener('resize', applySize);

    const perf = { frames: 0, time: 0 };
    function adaptQuality(rawDt) {
        perf.frames++;
        perf.time += rawDt;
        if (perf.time < 1.5) return;
        const fps = perf.frames / perf.time;
        perf.frames = 0;
        perf.time = 0;
        const q = quality();
        let next = renderScale;
        if (fps < 48 && renderScale > q.minScale) next = Math.max(q.minScale, renderScale - 0.08);
        else if (fps > 58 && renderScale < q.scale) next = Math.min(q.scale, renderScale + 0.04);
        if (Math.abs(next - renderScale) > 0.001) {
            renderScale = next;
            applySize();
        }
    }

    // =========================================================================
    // Level loading
    // =========================================================================
    const HINT_DEFAULT = '<kbd>F</kbd> flashlight &nbsp; <kbd>C</kbd> crouch &nbsp; <kbd>E</kbd> read &nbsp; <kbd>SHIFT</kbd> sprint';
    const HINT_FOREST = '<kbd>C</kbd> crouch &nbsp; <kbd>E</kbd> read &nbsp; <kbd>SHIFT</kbd> sprint';
    const HINT_CAMERA = '<kbd>RMB</kbd>/<kbd>Q</kbd> camera &nbsp; <kbd>C</kbd> crouch &nbsp; <kbd>E</kbd> read &nbsp; <kbd>SHIFT</kbd> sprint';

    // Per-level presentation and rules.
    //  dark:  sanity drains in darkness (lamps, matches and light restore it)
    //  meter: what the third HUD bar shows
    const LEVEL_INFO = {
        1: {
            num: 'I', title: 'THE MAZE', sub: 'They move when you look away.', objective: 'Find an exit. Follow the green light.',
            builder: () => Level1, spawn: () => Monsters.spawnWatchers(randInt(14, 17)),
            music: ['ost', 0.05 / 0.3], steps: 'concrete', far: 55, dark: true, meter: 'battery', hint: HINT_DEFAULT,
            ambient: [0x23252e, 0x080605, 0.13], tint: new THREE.Color(1.03, 0.97, 0.9), exitFlash: [0.6, 1, 0.7],
            reverb: 0.45, deathTitle: 'CONSUMED BY DARKNESS'
        },
        2: {
            num: 'II', title: 'THE LOST FOREST', sub: 'They move when you look at them.', objective: "Reach the golden light. Don't stare.",
            builder: () => Level2, spawn: () => Monsters.spawnAngels(randInt(14, 17), player.pos),
            music: ['level2', 0.9 / 0.3], steps: 'grass', far: 34, dark: false, meter: 'relic', hint: HINT_FOREST,
            ambient: null, tint: new THREE.Color(0.9, 0.97, 1.06), exitFlash: [1, 0.85, 0.5], exposure: 1.05, saturation: 0.62,
            // The fog is thick: Angels only notice your gaze once you could actually see them
            angelSight: 15, haloFar: 32, reverb: 0.25, deathTitle: 'CONSUMED BY LIGHT'
        },
        3: {
            num: 'III', title: 'THE FLOODED BASEMENT', sub: 'They cannot see you. They can hear you.', objective: 'Find the stairs up. Move quietly.',
            builder: () => Level3, spawn: () => Monsters.spawnDrowned(randInt(16, 18)),
            music: null, bed: 'water', steps: null, far: 52, dark: true, meter: 'battery', hint: HINT_DEFAULT,
            ambient: [0x1a2624, 0x050807, 0.12], tint: new THREE.Color(0.92, 1.0, 0.98), exitFlash: [0.6, 1, 0.7],
            matchNoise: true, reverb: 1.0, deathTitle: 'DRAGGED UNDER'
        },
        4: {
            num: 'IV', title: 'THE OBSERVATION WING', sub: 'They only exist on camera.', objective: 'Find an exit. Keep recording.',
            builder: () => Level4, spawn: () => Monsters.spawnWatchers(randInt(11, 13), 'unseen'),
            music: ['ost', 0.035 / 0.3], steps: 'concrete', far: 50, dark: true, meter: 'camera', hint: HINT_CAMERA,
            ambient: [0x7a4a4a, 0x1a1010, 0.6], tint: new THREE.Color(1.02, 0.95, 0.95), exitFlash: [0.6, 1, 0.7],
            batteryAmount: 35, maxHunters: 5, reverb: 0.4, deathTitle: 'LOST IN THE STATIC'
        },
        5: {
            num: 'V', title: 'THE WATCHING DARK', sub: 'You are inside it now.', objective: 'Go deeper. Find the heart.',
            builder: () => Level5,
            // Almost everything that lived down here has already climbed out
            spawn: () => { Monsters.spawnWatchers(2); Monsters.spawnAngels(2, player.pos); },
            music: null, steps: null, far: 55, dark: true, meter: 'battery', hint: HINT_DEFAULT,
            ambient: [0x3a1012, 0x080203, 0.06], tint: new THREE.Color(1.08, 0.9, 0.88), exitFlash: [1, 0.2, 0.15],
            maxHunters: 1, angelCollide: true, reverb: 0.9, subliminal: true, deathTitle: 'THE DARK SAW YOU'
        }
    };
    const LAST_LEVEL = 5;
    const cfg = () => LEVEL_INFO[state.levelId];

    function teardown() {
        Monsters.clear();
        AudioSys.stopBeds();
        AudioSys.destroyAllVoices();
        if (scene) {
            disposeObject(scene);
            if (level && level.ownedTextures) level.ownedTextures.forEach((t) => t.dispose());
            if (rig) rig.dispose();
        }
        scene = null;
        level = null;
        rig = null;
        renderer.renderLists.dispose();
    }

    async function loadLevel(id, { fresh = true } = {}) {
        state.mode = 'loading';
        state.levelId = id;
        HUD.showHud(false);
        HUD.closeNote();
        state.note = null;
        HUD.showLoading(true, 'Entering the dark...', 0.02);
        await nextFrame();
        teardown();
        HUD.showLoading(true, 'Waking the creatures...', 0.05);
        await Assets.load();

        scene = new THREE.Scene();
        const q = quality();
        renderer.shadowMap.enabled = q.shadows;
        Monsters.init(scene);

        const info = LEVEL_INFO[id];
        level = await info.builder().build(scene, q, (text, pct) => HUD.showLoading(true, text, pct));

        // Reset the player for this level
        player.pos.copy(level.spawn);
        player.vel.set(0, 0, 0);
        player.yaw = level.spawnYaw;
        player.pitch = 0;
        player.sanity = 100;
        player.stamina = 100;
        player.battery = 100;
        player.matches = 5;
        player.matchLit = false;
        player.matchTime = 0;
        player.flashlightOn = level.flashlightAllowed;
        player.relicTime = 0;
        player.noise = 0;
        player.exhausted = false;
        player.crouch = false;
        player.crouchAmt = 0;
        player.lens = 0;
        player.lensHeld = false;
        player.lensToggle = false;
        player.wade = 0;
        player.aim.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
        for (const n of level.notes) n.read = state.stats.notes.has(n.title);
        state.recordTime = 0;
        state.angelState.closest = Infinity;
        state.angelState.charge = 0;
        state.angelState.looked = 0;

        rig = buildRig(scene, level, q);
        scene.add(camera);
        camera.fov = FOV;
        // Nothing survives the fog past this point, so don't draw it
        camera.far = info.far;
        camera.updateProjectionMatrix();
        updateCamera(0);

        info.spawn();

        // Audio for the level
        AudioSys.ensureContext();
        AudioSys.startDrone();
        AudioSys.setReverb(info.reverb || 0.4);
        if (info.music) AudioSys.playMusic(info.music[0], info.music[1]);
        else AudioSys.stopMusic();
        if (info.bed) rig.bed = AudioSys.startBed(info.bed);
        // The concrete recording is about twice as loud as the others
        rig.footsteps = info.steps ? AudioSys.createVoice(info.steps, { base: info.steps === 'concrete' ? 0.55 : 1 }) : null;
        rig.phantoms = info.dark ? [0, 1, 2, 3].map(() => AudioSys.createVoice('footsteps')) : [];
        rig.ambience = AudioSys.createVoice('ambience2', { loop: false, base: 0.15 });

        HUD.showLoading(true, 'Compiling shaders...', 0.98);
        await nextFrame();
        applySize();
        renderer.compile(scene, camera);

        HUD.resetMap();
        HUD.reveal(World.cellX(player.pos.x), World.cellX(player.pos.z));
        HUD.setObjective('LEVEL ' + info.num, info.objective);
        state.objective = info.objective;
        HUD.setGaze(0);
        HUD.setHint(info.hint);
        HUD.setCamcorder(false);
        HUD.setGodMode(player.godMode);
        state.levelTime = 0;
        state.flash = 0;
        state.fade = 1;
        state.fadeTarget = 0;
        state.hallucination = null;
        state.ambienceTimer = rand(15, 35);
        perf.frames = 0;
        perf.time = 0;
        if (fresh) renderScale = quality().scale;
        applySize();

        HUD.showLoading(false);
        HUD.showHud(true);
        HUD.levelCard(info.num, info.title, info.sub);
        state.mode = 'playing';
        clock.getDelta();
        TouchControls.configure({ flashlight: level.flashlightAllowed, camera: !!level.camcorder });
        if (wantsLock() && !isLocked()) pause();
    }

    let envMap = null;

    // Lights, first-person models and ambient particles shared by every level
    function buildRig(scene, level, q) {
        const r = { disposables: [] };
        const info = LEVEL_INFO[level.id];

        if (info.ambient) {
            // Barely any ambient light: beyond your flashlight, the maze is black
            r.hemi = new THREE.HemisphereLight(info.ambient[0], info.ambient[1], info.ambient[2]);
            r.hemiBase = info.ambient[2];
            scene.add(r.hemi);
        }

        // The flashlight; on the camcorder level the same light is the lens's infrared lamp
        r.flashlight = new THREE.SpotLight(0xfff0d8, 0, 40, level.camcorder ? 0.78 : 0.52, 0.72, 1.5);
        r.flashlight.castShadow = q.shadows && (level.flashlightAllowed || level.camcorder);
        r.flashlight.shadow.mapSize.set(q.shadowSize, q.shadowSize);
        r.flashlight.shadow.camera.near = 0.2;
        r.flashlight.shadow.camera.far = 40;
        r.flashlight.shadow.bias = -0.0004;
        r.flashlight.shadow.normalBias = 0.02;
        scene.add(r.flashlight);
        scene.add(r.flashlight.target);

        // Soft fill so the edges of the beam aren't pitch black
        r.spill = new THREE.PointLight(0xffe8cc, 0, 7, 2);
        scene.add(r.spill);

        r.match = new THREE.PointLight(0xffa04a, 0, 16, 1.8);
        scene.add(r.match);

        if (!envMap) envMap = Models.createEnvMap(renderer);
        const vm = Models.createViewModels(envMap);
        r.vm = vm;
        camera.add(vm.torch);
        camera.add(vm.match);
        vm.torch.visible = level.flashlightAllowed;

        // Ambient motes drifting around the camera (shader-animated, no CPU cost)
        const indoor = level.id !== 2;
        r.motes = createMotes(indoor ? 380 : 260, indoor);
        scene.add(r.motes);

        // Hallucinated eyes in the dark
        r.halluEyes = [0, 1].map(() => {
            const s = Models.glowSprite(0xff2010, 0.28, 0, false);
            s.visible = false;
            scene.add(s);
            return s;
        });

        r.dispose = () => {
            camera.remove(vm.torch);
            camera.remove(vm.match);
            disposeObject(vm.torch);
            disposeObject(vm.match);
        };
        return r;
    }

    function createMotes(count, dust) {
        const g = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3), seed = new Float32Array(count);
        const box = dust ? 22 : 30;
        for (let i = 0; i < count; i++) {
            pos[i * 3] = rand(0, box);
            pos[i * 3 + 1] = rand(0, dust ? 5 : 6);
            pos[i * 3 + 2] = rand(0, box);
            seed[i] = Math.random();
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                time: Models.pointUniforms.time,
                pixelScale: Models.pointUniforms.pixelScale,
                camPos: { value: new THREE.Vector3() },
                box: { value: box },
                color: { value: dust ? new THREE.Color(1.0, 0.92, 0.8) : new THREE.Color(0.75, 1.0, 0.55) },
                size: { value: dust ? 0.022 : 0.06 },
                opacity: { value: dust ? 0.16 : 0.75 },
                blink: { value: dust ? 0 : 1 }
            },
            vertexShader: /* glsl */`
                uniform float time, pixelScale, box, size, blink;
                uniform vec3 camPos;
                attribute float seed;
                varying float vAlpha;
                void main() {
                    vec3 p = position;
                    p.x += sin(time * 0.13 + seed * 20.0) * 1.2 + time * 0.05;
                    p.y += sin(time * 0.21 + seed * 11.0) * 0.4;
                    p.z += cos(time * 0.11 + seed * 7.0) * 1.2;
                    vec2 rel = mod(p.xz - camPos.xz + box * 0.5, box) - box * 0.5;
                    vec3 world = vec3(camPos.x + rel.x, p.y, camPos.z + rel.y);
                    vec4 mv = modelViewMatrix * vec4(world, 1.0);
                    float dist = length(rel);
                    vAlpha = (1.0 - smoothstep(box * 0.3, box * 0.5, dist));
                    if (blink > 0.5) vAlpha *= pow(max(0.0, sin(time * (0.6 + seed) + seed * 40.0)), 6.0);
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
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const pts = new THREE.Points(g, mat);
        pts.frustumCulled = false;
        return pts;
    }

    // =========================================================================
    // Pointer lock & pause
    // =========================================================================
    const isLocked = () => document.pointerLockElement === renderer.domElement;
    // Desktop play captures the mouse; touch play (and ?debug) doesn't need to
    // (never on a browser that can't capture the mouse at all - waiting for it would pause forever)
    const canLock = 'requestPointerLock' in Element.prototype;
    const wantsLock = () => canLock && !touchMode && !state.debug;

    // "Enter the game": capture the mouse on desktop; on a phone go fullscreen in
    // landscape instead and carry straight on (there is no pointer lock to wait for)
    function requestLock() {
        if (touchMode) {
            enterImmersive();
            if (state.mode === 'paused') resume();
            return;
        }
        try {
            const p = renderer.domElement.requestPointerLock();
            if (p && p.catch) p.catch(() => {});
        } catch (e) { /* ignore */ }
    }

    function enterImmersive() {
        AudioSys.unlock();
        const lockLandscape = () => {
            try {
                const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape');
                if (p && p.catch) p.catch(() => {});
            } catch (e) { /* not supported (e.g. iOS) */ }
        };
        const root = document.documentElement;
        if (document.fullscreenElement || document.webkitFullscreenElement) { lockLandscape(); return; }
        const req = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!req) return;
        try {
            const p = req.call(root, { navigationUI: 'hide' });
            if (p && p.then) p.then(lockLandscape).catch(() => {});
        } catch (e) { /* fullscreen not allowed here */ }
    }

    document.addEventListener('pointerlockchange', () => {
        if (isLocked()) {
            if (state.mode === 'paused') resume();
        } else if (state.mode === 'playing' && wantsLock()) {
            pause();
        }
    });

    // Switching apps or tabs pauses the game
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state.mode === 'playing') pause();
    });

    function pause() {
        if (state.mode !== 'playing') return;
        TouchControls.reset();
        for (const k in keys) keys[k] = false;
        state.mode = 'paused';
        $('pause-menu').classList.add('active');
        AudioSys.pauseMusic(true);
        AudioSys.stopAllVoices();
        AudioSys.suspendAll(true);
        if (isLocked()) document.exitPointerLock();
    }

    function resume() {
        if (state.mode !== 'paused') return;
        state.mode = 'playing';
        $('pause-menu').classList.remove('active');
        $('settings-panel').classList.remove('active');
        AudioSys.suspendAll(false);
        AudioSys.pauseMusic(false);
        clock.getDelta();
    }

    // =========================================================================
    // Game loop
    // =========================================================================
    function frame() {
        requestAnimationFrame(frame);
        const rawDt = clock.getDelta();
        const dt = Math.min(rawDt, 0.05);
        state.time += dt;
        Models.pointUniforms.time.value = state.time;

        if (!scene || !level) return;

        if (state.mode === 'playing') {
            // Reading a note stops the world: nothing moves, nothing drains, until you close it
            if (!state.note) update(dt);
            adaptQuality(rawDt);
        } else if (state.mode === 'dying' || state.mode === 'transition') {
            updateCamera(dt);
        }

        if (state.mode !== 'paused' && state.mode !== 'loading' && state.mode !== 'dead' && state.mode !== 'victory') {
            render(dt);
        }
    }

    function update(dt) {
        state.levelTime += dt;
        if (player.relicTime > 0) player.relicTime = Math.max(0, player.relicTime - dt);

        updatePlayer(dt);
        updateCamera(dt);
        updateLights(dt);
        updateSanity(dt);
        if (state.mode !== 'playing') return;

        camera.updateMatrixWorld();
        projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreen);

        const info = cfg();
        const ctx = {
            cam: camera, frustum, player, time: state.time, levelTime: state.levelTime,
            angelState: state.angelState, onKill: die,
            lens: player.lens, maxHunters: info.maxHunters, angelCollide: !!info.angelCollide,
            angelSight: info.angelSight, haloFar: info.haloFar, waterDepth: level.waterDepth
        };
        if (Monsters.watchers.length) Monsters.updateWatchers(dt, ctx);
        if (state.mode !== 'playing') return;
        if (Monsters.angels.length) Monsters.updateAngels(dt, ctx);
        if (state.mode !== 'playing') return;
        if (Monsters.drowned.length) Monsters.updateDrowned(dt, ctx);
        if (state.mode !== 'playing') return;

        level.update(dt, state.time, camera, player);
        if (level.objective && level.objective !== state.objective) {
            state.objective = level.objective;
            HUD.setObjective('LEVEL ' + info.num, level.objective);
        }
        if (level.flash) {
            state.flash = Math.max(state.flash, level.flash);
            state.flashColor.setRGB(0.7, 0.04, 0.03);
            level.flash = 0;
        }
        updateInteractions();
        if (state.mode !== 'playing') return;
        updateAudio(dt);
        updateHallucinations(dt);
        updateHud(dt);
    }

    // -------------------------------------------------------------------------
    // Player movement
    // -------------------------------------------------------------------------
    const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();

    function updatePlayer(dt) {
        const p = player;
        const reading = !!state.note;
        let mz = 0, mx = 0;
        if (keys.KeyW || keys.ArrowUp) mz += 1;
        if (keys.KeyS || keys.ArrowDown) mz -= 1;
        if (keys.KeyD || keys.ArrowRight) mx += 1;
        if (keys.KeyA || keys.ArrowLeft) mx -= 1;
        // Touch joystick: analog, so a light push walks slowly
        const stick = TouchControls.move;
        let analog = 1;
        if (stick.mag > 0.12 && mz === 0 && mx === 0) {
            mx = stick.x;
            mz = stick.y;
            analog = Math.min(1, stick.mag * 1.15);
        }
        const moving = mz !== 0 || mx !== 0;

        if (p.stamina <= 0) p.exhausted = true;
        if (p.exhausted && p.stamina > 30) p.exhausted = false;
        const wantsSprint = keys.ShiftLeft || keys.ShiftRight || stick.sprint;
        p.sprinting = wantsSprint && moving && !p.exhausted && p.sanity > 20 && !p.godMode && !reading;
        if (p.sprinting) p.crouch = false;
        p.crouchAmt = damp(p.crouchAmt, p.crouch ? 1 : 0, 10, dt);

        // Deep water (level III): wading is slow and loud
        const depth = level.waterDepth && !p.godMode ? level.waterDepth(p.pos.x, p.pos.z) : 0;
        p.wade = damp(p.wade, depth, 4, dt);

        // Level V: a hand from the wall or floor has hold of you - you can barely drag yourself free
        const held = !!level.grabbed && !p.godMode;
        if (held) p.sprinting = false;

        let speed = p.sprinting ? 8.2 : 4.2;
        if (reading) speed *= 0.5;
        if (p.exhausted && moving) speed *= 0.72;
        if (p.crouch) speed *= 0.45;
        speed *= 1 - p.wade * 0.38;
        if (p.lens > 0.5) speed *= 0.85;
        if (held) speed *= 0.2;
        if (p.godMode) speed *= 3;

        // Noise: what the creatures can hear. Crouching is near-silent; deep water is not.
        const walkNoise = (p.crouch ? 3.4 : 25) * (1 + p.wade * 0.8);
        if (p.sprinting) {
            p.stamina = Math.max(0, p.stamina - 7.2 * dt);
            p.noise = Math.min(100, p.noise + 80 * dt);
            p.noisePos.copy(p.pos);
        } else {
            p.stamina = Math.min(100, p.stamina + (moving ? 10.5 : 21) * dt);
            if (moving && p.noise < walkNoise) p.noise = Math.min(walkNoise, p.noise + 12 * dt);
            if (moving) p.noisePos.copy(p.pos);
        }
        // Noise fades fast once you stop: standing still really is silent
        p.noise = Math.max(0, p.noise - (moving ? 20 : 45) * dt);
        if (p.godMode) p.noise = 0;

        fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        wish.set(0, 0, 0).addScaledVector(fwd, mz).addScaledVector(right, mx);
        if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * analog);
        const accel = moving ? 11 : 9;
        p.vel.x = damp(p.vel.x, wish.x, accel, dt);
        p.vel.z = damp(p.vel.z, wish.z, accel, dt);

        p.pos.x += p.vel.x * dt;
        p.pos.z += p.vel.z * dt;
        if (p.godMode) {
            if (keys.Space) p.pos.y += speed * dt;
            if (keys.ShiftLeft || keys.ShiftRight) p.pos.y -= speed * dt;
        } else {
            p.pos.y = 0;
            World.resolve(p.pos, 0.4);
        }

        const hs = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
        p.bobPhase += hs * dt * 1.45;
        // Being held: the view jerks as you strain against the grip
        const struggle = held ? Math.sin(state.time * 9) * 0.025 + Math.sin(state.time * 23.7) * 0.012 : 0;
        p.roll = damp(p.roll, -mx * 0.012 - p.swayX * 0.4 + struggle, held ? 14 : 6, dt);

        const targetFov = FOV + (p.sprinting ? 6 : 0) - (state.angelState.charge * 6) - p.lens * 14;
        camera.fov = damp(camera.fov, targetFov, 6, dt);
        camera.updateProjectionMatrix();

        // Footsteps (looping file, sped up while sprinting, hushed while crouching)
        if (rig.footsteps) {
            if (hs > 1 && !p.godMode) {
                const r = cfg().stepRate || 1;
                rig.footsteps.el.playbackRate = (p.sprinting ? 1.5 : p.crouch ? 0.8 : 1.0) * r;
                rig.footsteps.set(p.crouch ? 0.3 : 1);
            } else {
                rig.footsteps.set(0);
            }
        }
        // Level III: every step is a splash.  Level V: every step sticks to the floor.
        if ((level.water || level.flesh) && hs > 0.6 && !p.godMode) {
            const before = Math.floor(p.stepPhase);
            p.stepPhase += hs * dt * 0.46;
            if (Math.floor(p.stepPhase) !== before) {
                if (level.water) {
                    const vol = (p.sprinting ? 0.9 : p.crouch ? 0.16 : 0.45) * (1 + p.wade * 0.6);
                    AudioSys.splash(Math.min(1, vol), p.wade);
                } else {
                    AudioSys.fleshStep(p.sprinting ? 0.9 : p.crouch ? 0.2 : 0.55);
                }
            }
        }

        updateCamcorder(dt);
    }

    // Level IV: raising the camcorder (hold right mouse, or Q to toggle)
    function updateCamcorder(dt) {
        const p = player;
        if (!level.camcorder) { p.lens = 0; return; }
        const want = (p.lensHeld || p.lensToggle) && p.battery > 0 && !state.note;
        const was = p.lens > 0.5;
        p.lens = damp(p.lens, want ? 1 : 0, 14, dt);
        const now = p.lens > 0.5;
        if (now !== was) AudioSys.camBeep(now);
        if (now) {
            p.battery = Math.max(0, p.battery - 1.05 * dt);
            state.recordTime += dt;
            if (p.battery <= 0) {
                p.lensToggle = false;
                AudioSys.batteryDead();
                HUD.toast('CAMERA BATTERY DEAD', 'bad');
            }
        }
        HUD.setCamcorder(now, state.recordTime, p.battery);
    }

    function updateCamera(dt) {
        const p = player;
        const hs = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
        const bobAmt = Math.min(1, hs / 4.2) * (p.sprinting ? 0.075 : 0.05);
        const bobY = Math.sin(p.bobPhase * 2) * bobAmt;
        const bobX = Math.cos(p.bobPhase) * bobAmt * 0.6;
        const baseY = p.godMode ? p.pos.y + p.height : p.height - p.crouchAmt * 0.62 - p.wade * 0.32;
        camera.position.set(p.pos.x + right.x * bobX, baseY + bobY, p.pos.z + right.z * bobX);
        camera.rotation.set(p.pitch, p.yaw, p.roll);

        // Weapon-style sway for the view models
        p.swayX = damp(p.swayX, 0, 8, dt);
        p.swayY = damp(p.swayY, 0, 8, dt);
        if (rig) {
            const vm = rig.vm;
            vm.torch.position.set(vm.basePos.x + p.swayX * 0.6 + bobX * 0.3, vm.basePos.y + p.swayY * 0.6 + bobY * 0.4, vm.basePos.z);
            vm.torch.rotation.set(p.swayY * 0.8, vm.baseYaw - p.swayX * 0.8, 0);
            const raise = player.matchLit ? 1 : 0;
            vm.match.position.y = damp(vm.match.position.y, -0.12 - (1 - raise) * 0.25, 10, dt);
            vm.match.position.x = -0.16 + p.swayX * 0.5;
        }
    }

    // -------------------------------------------------------------------------
    // Flashlight, match & lamp lights
    // -------------------------------------------------------------------------
    const lensPos = new THREE.Vector3(), camDir = new THREE.Vector3();

    function updateLights(dt) {
        const p = player;
        const fl = rig.flashlight;
        camera.updateMatrixWorld();
        camera.getWorldDirection(camDir);
        // The beam lags slightly behind your gaze
        p.aim.lerp(camDir, 1 - Math.exp(-16 * dt)).normalize();

        if (level.flashlightAllowed && p.flashlightOn && p.battery > 0) {
            p.battery = Math.max(0, p.battery - 0.9 * dt);
            if (p.battery <= 0) {
                p.flashlightOn = false;
                AudioSys.batteryDead();
                HUD.toast('BATTERY DEAD', 'bad');
            }
        }
        const on = level.flashlightAllowed && p.flashlightOn && p.battery > 0;
        let flicker = 1;
        if (on && p.battery < 20) {
            const n = Noise.value2(state.time * 7, 3.3, 256, 256);
            flicker = n < 0.25 ? 0.15 : n < 0.32 ? 0.6 : 1;
        }
        const intensity = on ? (2.6 + 1.4 * (p.battery / 100)) * flicker : 0;
        fl.intensity = intensity;
        rig.spill.intensity = on ? 0.16 * flicker : 0;
        if (level.camcorder) {
            // The camcorder's infrared lamp: invisible to the eye, bright through the lens
            fl.intensity = p.lens * 2.2;
            rig.spill.intensity = p.lens * 0.3;
            if (rig.hemi) rig.hemi.intensity = rig.hemiBase + p.lens * 0.22;
        }

        rig.vm.torch.localToWorld(lensPos.set(0, 0, rig.vm.lensZ - 0.02));
        fl.position.copy(lensPos);
        fl.target.position.copy(lensPos).addScaledVector(p.aim, 10);
        fl.target.updateMatrixWorld();
        rig.spill.position.copy(camera.position).addScaledVector(camDir, 1.2);
        rig.vm.lensMat.emissiveIntensity = on ? 5 * flicker : 0.05;
        if (rig.vm.reflMat) rig.vm.reflMat.emissiveIntensity = on ? 1.6 * flicker : 0;

        // Match
        if (p.matchLit) {
            p.matchTime -= dt;
            const f = Math.sin(state.time * 30) * 0.5 + Math.random() * 0.9;
            const life = clamp(p.matchTime / 0.6, 0, 1);
            rig.match.intensity = (4.2 + f) * life;
            rig.vm.flame.getWorldPosition(rig.match.position);
            rig.match.position.y += 0.05;
            rig.vm.match.visible = true;
            const fs = (0.85 + Math.random() * 0.3) * (0.4 + life * 0.6);
            rig.vm.flame.scale.set(0.035 * fs, 0.07 * fs, 1);
            rig.vm.mglow.material.opacity = 0.6 * life;
            if (p.matchTime <= 0) p.matchLit = false;
        } else {
            rig.match.intensity = 0;
            if (rig.vm.match.position.y < -0.3) rig.vm.match.visible = false;
        }

        rig.motes.material.uniforms.camPos.value.copy(camera.position);
    }

    function lightMatch() {
        const p = player;
        if (p.matchLit || p.matches <= 0) return;
        p.matchLit = true;
        p.matchTime = 4;
        p.matches--;
        state.stats.matchesUsed++;
        if (cfg().matchNoise) {
            // The strike carries a long way through the water
            p.noise = Math.max(p.noise, 60);
            p.noisePos.copy(p.pos);
        }
        AudioSys.playMatch();
        HUD.matchFlash(p.matches);
        state.flash = 0.22;
        state.flashColor.setRGB(1, 0.75, 0.4);
        rig.vm.match.visible = true;
        rig.vm.match.position.y = -0.4;
    }

    function toggleFlashlight() {
        if (!level || !level.flashlightAllowed) {
            HUD.toast(level && level.camcorder ? 'NO FLASHLIGHT - RAISE THE CAMERA' : 'The light here belongs to them...', '');
            return;
        }
        if (player.battery <= 0 && !player.flashlightOn) {
            HUD.toast('NO BATTERY', 'bad');
            AudioSys.click();
            return;
        }
        player.flashlightOn = !player.flashlightOn;
        AudioSys.click();
        if (cfg().matchNoise) {
            player.noise = Math.max(player.noise, 8);
            player.noisePos.copy(player.pos);
        }
    }

    function toggleCrouch() {
        player.crouch = !player.crouch;
        if (player.crouch) player.sprinting = false;
    }

    // -------------------------------------------------------------------------
    // Sanity
    // -------------------------------------------------------------------------
    function updateSanity(dt) {
        const p = player;
        if (cfg().dark) {
            const nearest = Monsters.nearestDistance();
            if (p.matchLit) p.sanity += 12 * dt;
            else if (level.flashlightAllowed && p.flashlightOn && p.battery > 0) p.sanity += 3 * dt;
            else if (p.lens > 0.5) p.sanity += 3.5 * dt;   // seeing through the lens steadies you
            else if (level.nearLight(p.pos)) p.sanity += 9 * dt;
            else if (nearest < 4) p.sanity -= 30 * dt;
            else if (nearest < 8) p.sanity -= 18 * dt;
            else p.sanity -= 7.2 * dt;
            // Level V: staring into the eye, being stared at by the walls, being held
            if (level.stare) p.sanity -= level.stare * (level.stareDrain || 24) * dt;
            if (level.watched) p.sanity -= level.watched * 3 * dt;
            if (level.grabbed) p.sanity -= 7 * dt;
        } else {
            p.sanity += 4.8 * dt;
            const c = state.angelState.closest;
            if (c < 4) p.sanity -= 36 * dt;
            else if (c < 10) p.sanity -= 21 * dt;
        }
        if (p.sprinting) p.sanity -= 3.6 * dt;
        p.sanity = clamp(p.sanity, 0, 100);
        if (p.sanity <= 0 && !p.godMode) die('sanity');
    }

    // -------------------------------------------------------------------------
    // Pickups, notes, exits
    // -------------------------------------------------------------------------
    function updateInteractions() {
        const p = player;
        for (const it of level.pickups) {
            if (it.collected) continue;
            const dx = it.pos.x - p.pos.x, dz = it.pos.z - p.pos.z;
            if (dx * dx + dz * dz > 1.7 * 1.7) continue;
            it.collected = true;
            it.group.visible = false;
            if (it.type === 'battery') {
                const amt = cfg().batteryAmount || 50;
                p.battery = Math.min(100, p.battery + amt);
                HUD.toast(`+${amt}% ${level.camcorder ? 'CAMERA ' : ''}BATTERY`, 'good');
                AudioSys.pickup(false);
            } else if (it.type === 'relic') {
                p.sanity = Math.min(100, p.sanity + 30);
                p.relicTime = 10;
                HUD.toast('SACRED RELIC — THE ANGELS FALTER', 'gold');
                AudioSys.pickup(true);
                state.flash = 0.35;
                state.flashColor.setRGB(1, 0.85, 0.5);
            } else if (it.type === 'matches') {
                p.matches += 2;
                HUD.toast('+2 MATCHES', 'warm');
                AudioSys.pickup(false);
            }
        }

        // Notes: E to read
        let nearestNote = null, nd = Infinity;
        for (const n of level.notes) {
            const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
            if (d < nd) { nd = d; nearestNote = n; }
        }
        if (state.note) {
            if (nd > 3.5 || nearestNote !== state.note) closeNote();
            HUD.setPrompt('');
        } else if (nearestNote && nd < 2.4) {
            HUD.setPrompt(touchMode ? 'Tap to read the note' : '<kbd>E</kbd> Read note');
            HUD.setCrosshair('interact');
        } else {
            HUD.setPrompt('');
            HUD.setCrosshair('');
        }
        state.nearNote = nd < 2.4 ? nearestNote : null;

        // Exits (the final level ends on its own terms)
        if (level.completed) {
            completeLevel();
            return;
        }
        if (level.manualExit) return;
        for (const ex of level.exits) {
            const d = Math.hypot(ex.pos.x - p.pos.x, ex.pos.z - p.pos.z);
            if (d < (level.id === 2 || level.exitStyle === 'portal' ? 2.6 : 2.0)) {
                completeLevel();
                return;
            }
        }
    }

    function openNote(n) {
        state.note = n;
        n.read = true;
        state.stats.notes.add(n.title);
        HUD.openNote(n);
        HUD.setPrompt('');
        // The world is paused while you read: hush every looping sound
        Monsters.silence();
        AudioSys.stopAllVoices();
        player.vel.set(0, 0, 0);
    }

    function closeNote() {
        state.note = null;
        HUD.closeNote();
    }

    // -------------------------------------------------------------------------
    // Audio direction
    // -------------------------------------------------------------------------
    function updateAudio(dt) {
        const p = player;
        const fear = 1 - p.sanity / 100;

        // Rhythmic heartbeat
        let intensity = 0;
        if (cfg().dark) {
            const lit = p.matchLit || (level.flashlightAllowed && p.flashlightOn && p.battery > 0) || p.lens > 0.5;
            const near = Monsters.nearestDistance();
            intensity = Math.max(!lit ? 0.35 + fear * 0.65 : 0, p.sanity < 40 ? fear : 0, near < 12 ? 1 - near / 12 : 0,
                state.angelState.charge || 0, level.stare || 0);
        } else {
            const c = state.angelState.closest;
            intensity = Math.max(p.sanity < 40 ? fear : 0, c < 16 ? 1 - c / 16 : 0, state.angelState.charge);
        }
        state.heartbeatTimer -= dt;
        if (intensity > 0.2 && state.heartbeatTimer <= 0) {
            state.heartbeatTimer = lerp(1.35, 0.42, intensity);
            AudioSys.heartbeat(1 + intensity, 0.08 + intensity * 0.12);
            state.beat = 1;
        }
        state.beat = Math.max(0, state.beat - dt * 3.5);
        state.beatIntensity = intensity;

        // Phantom footsteps at low sanity (level 1)
        if (rig.phantoms.length) {
            const pIntensity = p.sanity < 30 ? 1 - p.sanity / 30 : 0;
            rig.phantoms.forEach((v, i) => {
                const thr = i / rig.phantoms.length;
                if (pIntensity > thr) {
                    const layer = (pIntensity - thr) * rig.phantoms.length;
                    v.el.playbackRate = 0.92 + Math.sin(state.time + i) * 0.08;
                    v.set(Math.min(0.6, layer * 0.4), Math.sin(state.time * 0.3 + i * 1.7));
                } else v.set(0);
            });
        }

        // Ambience swells at random moments
        state.ambienceTimer -= dt;
        if (state.ambienceTimer <= 0 && rig.ambience) {
            const v = rig.ambience;
            if (!v.playing) {
                const dur = v.el.duration;
                v.el.currentTime = isFinite(dur) && dur > 40 ? rand(0, dur - 35) : rand(0, 25);
                v.set(1, rand(-0.6, 0.6));
                state.ambienceEnd = state.time + rand(15, 30);
            }
            state.ambienceTimer = rand(40, 80);
        }
        if (rig.ambience && rig.ambience.playing && state.time > (state.ambienceEnd || 0)) {
            const lvl = Math.max(0, rig.ambience.level - dt * 0.4);
            rig.ambience.set(lvl, rig.ambience.pan);
        }
    }

    // Red eyes that appear in the dark when your mind starts to go
    function updateHallucinations(dt) {
        if (!cfg().dark) return;
        const p = player;
        const eyes = rig.halluEyes;
        const h = state.hallucination;
        if (!h) {
            if (p.sanity < 45 && Math.random() < dt * (0.25 + (45 - p.sanity) / 60)) {
                const a = p.yaw + rand(-0.9, 0.9) + Math.PI * (Math.random() < 0.3 ? 1 : 0);
                const d = rand(9, 18);
                const x = p.pos.x - Math.sin(a) * d, z = p.pos.z - Math.cos(a) * d;
                if (!World.overlaps(x, z, 0.5) && World.lineOfSight(p.pos.x, p.pos.z, x, z)) {
                    const y = rand(1.7, 2.6);
                    const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(0.09);
                    eyes[0].position.set(x + side.x, y, z + side.z);
                    eyes[1].position.set(x - side.x, y, z - side.z);
                    eyes.forEach((e) => { e.visible = true; e.material.opacity = 0; });
                    state.hallucination = { life: rand(2, 4), seen: 0, age: 0 };
                }
            }
            return;
        }
        h.age += dt;
        h.life -= dt;
        const tmpv = eyes[0].position.clone().sub(camera.position).normalize();
        camera.getWorldDirection(camDir);
        if (tmpv.dot(camDir) > 0.97) h.seen += dt;
        const alpha = h.seen > 0.35 ? Math.max(0, eyes[0].material.opacity - dt * 6) : Math.min(0.9, h.age * 2);
        eyes.forEach((e) => { e.material.opacity = alpha; });
        if (h.life <= 0 || (h.seen > 0.35 && alpha <= 0)) {
            eyes.forEach((e) => { e.visible = false; });
            state.hallucination = null;
        }
    }

    // -------------------------------------------------------------------------
    // HUD
    // -------------------------------------------------------------------------
    function updateHud(dt) {
        const p = player;
        const info = cfg();

        // Level V: when your mind is going, something flickers across your eyes for a frame
        if (info.subliminal && p.sanity < 45) {
            state.subliminalTimer = (state.subliminalTimer || rand(8, 16)) - dt;
            if (state.subliminalTimer <= 0) {
                state.subliminalTimer = rand(10, 24) * (0.4 + p.sanity / 75);
                HUD.subliminal(Math.random() < 0.5 ? 'images/watcher_jumpscare.png' : 'images/angel.jpg');
            }
        }
        HUD.update(p, info.meter);
        HUD.setLookWarning(state.angelState.looked > 0 ? 0.45 + state.angelState.charge * 0.55 : 0);

        state.revealTimer -= dt;
        if (state.revealTimer <= 0) {
            state.revealTimer = 0.2;
            HUD.reveal(World.cellX(p.pos.x), World.cellX(p.pos.z));
        }
        state.mapTimer -= dt;
        if (state.mapTimer <= 0) {
            state.mapTimer = 1 / 20;
            HUD.drawMap(camera, p.yaw, level, state.time);
        }

        state.hudTimer -= dt;
        if (state.hudTimer > 0) return;
        state.hudTimer = 0.25;
        if (touchMode) {
            TouchControls.setActive('light', level.flashlightAllowed && p.flashlightOn && p.battery > 0);
            TouchControls.setActive('crouch', p.crouch);
            TouchControls.setActive('camera', p.lens > 0.5);
        }
        const id = level.id;
        const hunter = Monsters.nearestHunter;
        HUD.setGaze(level.gaze || 0, level.objective === 'Look at it.');
        let status = '';
        if (level.gaze !== undefined && level.objective === 'Look at it.') {
            status = level.stare > 0.6 ? 'Keep looking. Do not look away.' : 'It is waiting for you to look back.';
        } else if (level.stare > 0.3) status = "DON'T LOOK UP.";
        else if (level.grabbed) status = 'Something is holding on to you...';
        else if (level.watched > 0.5) status = 'So many of them are looking at you...';
        else if (state.angelState.looked > 0) status = 'Look away. LOOK AWAY.';
        else if (id === 4 && p.lens < 0.5 && hunter < 11) status = 'Static... RAISE THE CAMERA.';
        else if (p.matchLit && id === 3) status = 'The strike echoes across the water...';
        else if (p.matchLit) status = 'The warm light protects you...';
        else if (p.relicTime > 0) status = 'The relic slows the Angels...';
        else if (id === 4 && p.battery <= 0) status = 'The camera is dead. Find a battery...';
        else if (id === 4 && p.lens > 0.5 && p.battery < 20) status = 'Camera battery low...';
        else if (level.flashlightAllowed && !p.flashlightOn && p.battery <= 0) status = 'Battery depleted...';
        else if (p.sanity < 30) status = 'You feel them watching...';
        else if (id === 3 && p.sprinting) status = 'Every splash carries through the dark...';
        else if (p.sprinting) status = 'They can hear you running...';
        else if (id === 3 && p.wade > 0.5 && !p.crouch) status = 'The water is deep here. Every step echoes.';
        else if (id === 3 && Monsters.nearestDistance() < 14) status = p.crouch ? 'Hold still. It is listening...' : 'Something is listening... crouch.';
        else if (p.crouch) status = 'Moving quietly...';
        else if (id === 4 && p.lens > 0.5) status = 'Recording...';
        else if (id === 2 && state.angelState.closest < 18) status = 'You hear chimes in the mist...';
        else if (id === 5 && state.angelState.closest < 14) status = 'A halo glimmers in the dark. Keep it at the edge of your eye...';
        else if (Monsters.nearestWatcherDistance() < 16) status = 'Something is near...';
        HUD.setStatus(status);
    }

    // =========================================================================
    // Rendering & screen effects
    // =========================================================================
    function render(dt) {
        const u = PostFX.uniforms;
        const p = player;
        const info = LEVEL_INFO[level.id];
        const fear = 1 - p.sanity / 100;
        const charge = state.angelState.charge || 0;
        const lens = p.lens;
        // Signal tearing in the viewfinder when one of the Unseen is close
        const hunter = Monsters.nearestHunter;
        const tear = lens > 0.01 && hunter < 12 ? (1 - hunter / 12) * lens : 0;

        state.fade = damp(state.fade, state.fadeTarget, 3.5, dt);
        state.flash = Math.max(0, state.flash - dt * 1.6);

        let blackout = Math.max(state.fade, level.blackout || 0);
        if (p.sanity < 18 && state.mode === 'playing') {
            const n = Noise.value2(state.time * 3, 7.7, 256, 256);
            if (n < 0.18) blackout = Math.max(blackout, 0.85);
        }

        const stare = level.stare || 0;
        u.exposure.value = settings.brightness * (info.exposure || 1.0) * (1 + lens * 1.7);
        u.vignette.value = 0.5 + fear * 0.4 + lens * 0.25;
        u.grain.value = 0.045 + fear * 0.07 + lens * 0.05;
        u.aberration.value = smoothstep(0.45, 1, fear) * 1.1 + charge * 1.6 + tear * 1.5 + stare * 1.2;
        u.warp.value = smoothstep(0.6, 1, fear) * (0.7 + 0.3 * Math.sin(state.time * 1.3)) + charge * 0.25 + stare * 0.5;
        u.pulse.value = state.beat * Math.max(smoothstep(0.5, 1, fear), (state.beatIntensity || 0) > 0.7 ? 0.5 : 0);
        u.flash.value = state.flash;
        u.flashColor.value.copy(state.flashColor);
        u.blackout.value = blackout;
        u.saturation.value = info.saturation !== undefined ? info.saturation : 0.8 - fear * 0.25;
        u.tint.value.copy(info.tint);
        u.nightVision.value = lens;
        u.interference.value = tear;

        PostFX.render(scene, camera, state.time);
    }

    // =========================================================================
    // Death, level completion & victory
    // =========================================================================
    const DEATH_TEXT = {
        watcher: 'The darkness consumed you...',
        angel: "The Angel's cold embrace took you...",
        drowned: 'Cold hands pulled you under the black water...',
        unseen: "It was there all along. You just weren't recording.",
        sanity: 'Your mind shattered in the darkness...'
    };

    function die(cause) {
        if (state.mode !== 'playing') return;
        state.mode = 'dying';
        state.stats.deaths++;
        closeNote();
        Monsters.silence();
        AudioSys.stopAllVoices();
        AudioSys.stopBeds();
        HUD.showHud(false);
        if (isLocked()) document.exitPointerLock();

        // Same jumpscare as always: image + scream, two seconds
        const js = $('jumpscare-screen');
        const angelic = cause === 'angel' || (cause === 'sanity' && level.id === 2);
        $('jumpscare-image').src = angelic ? 'images/angel.jpg' : 'images/watcher_jumpscare.png';
        js.style.display = 'flex';
        AudioSys.playJumpscare();
        state.fadeTarget = 1;
        HUD.setCamcorder(false);

        setTimeout(() => {
            js.style.display = 'none';
            state.mode = 'dead';
            AudioSys.stopMusic();
            $('death-title').textContent = LEVEL_INFO[level.id].deathTitle;
            $('death-message').textContent = cause === 'sanity' && level.id === 2 ? 'Your mind shattered in the light...' : DEATH_TEXT[cause];
            $('death-stats').innerHTML =
                `<span>Level <b>${LEVEL_INFO[level.id].num}</b></span>` +
                `<span>Survived <b>${formatTime(state.levelTime)}</b></span>` +
                `<span>Notes <b>${state.stats.notes.size}/${Lore.total()}</b></span>`;
            $('death-screen').classList.add('show');
        }, 2000);
    }

    function completeLevel() {
        if (state.mode !== 'playing') return;
        closeNote();
        if (level.id < LAST_LEVEL) {
            const next = level.id + 1;
            const c = LEVEL_INFO[level.id].exitFlash;
            state.mode = 'transition';
            state.fadeTarget = 1;
            state.flash = 0.5;
            state.flashColor.setRGB(c[0], c[1], c[2]);
            Monsters.silence();
            AudioSys.stopAllVoices();
            HUD.setCamcorder(false);
            setTimeout(() => loadLevel(next, { fresh: false }), 1200);
        } else {
            // You looked back. Everything goes white.
            state.mode = 'transition';
            state.flash = 1.4;
            state.flashColor.setRGB(1, 0.97, 0.94);
            Monsters.silence();
            AudioSys.stopAllVoices();
            AudioSys.stopBeds();
            AudioSys.sting(1);
            HUD.setGaze(0);
            setTimeout(() => { state.fadeTarget = 1; }, 900);
            setTimeout(victory, 2600);
        }
    }

    function victory() {
        $('victory-title').textContent = 'YOU LOOKED BACK';
        $('victory-message').textContent = 'The eye closed. For the first time since you came down here, nothing is watching you.';
        state.mode = 'victory';
        Monsters.silence();
        AudioSys.stopAllVoices();
        AudioSys.stopMusic();
        AudioSys.stopDrone();
        HUD.showHud(false);
        if (isLocked()) document.exitPointerLock();
        const total = (performance.now() - state.stats.runStart) / 1000;
        $('survival-time').textContent = `Time survived: ${formatTime(total)}`;
        $('victory-stats').innerHTML =
            `<span>Matches used <b>${state.stats.matchesUsed}</b></span>` +
            `<span>Notes found <b>${state.stats.notes.size}/${Lore.total()}</b></span>` +
            `<span>Deaths <b>${state.stats.deaths}</b></span>`;
        $('victory-screen').classList.add('show');
    }

    function startRun() {
        AudioSys.ensureContext();
        Menu.stop();
        state.stats = { runStart: performance.now(), deaths: 0, matchesUsed: 0, notes: new Set() };
        $('start-screen').classList.add('hidden');
        requestLock();
        loadLevel(1);
    }

    function retry() {
        $('death-screen').classList.remove('show');
        AudioSys.ensureContext();
        requestLock();
        loadLevel(state.levelId);
    }

    function toMenu() {
        state.mode = 'menu';
        teardown();
        AudioSys.stopMusic();
        AudioSys.stopDrone();
        HUD.showHud(false);
        HUD.showLoading(false);
        ['death-screen', 'victory-screen'].forEach((id) => $(id).classList.remove('show'));
        $('pause-menu').classList.remove('active');
        $('settings-panel').classList.remove('active');
        $('start-screen').classList.remove('hidden');
        if (isLocked()) document.exitPointerLock();
        AudioSys.suspendAll(false);
        Menu.start();
        renderer.setRenderTarget(null);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
    }

    // =========================================================================
    // Debug console: jump to any level, god mode, refills. Press ` to toggle.
    // =========================================================================
    const debugOpen = () => $('debug-console').classList.contains('active');
    let debugResume = false;

    function setGodMode(on) {
        player.godMode = on;
        HUD.setGodMode(on);
        if (!on) player.pos.y = 0;
        if (state.mode === 'playing' || state.mode === 'paused') HUD.toast('GOD MODE: ' + (on ? 'ON' : 'OFF'), on ? 'good' : 'bad');
        syncDebug();
    }

    function syncDebug() {
        const g = $('debug-god');
        g.classList.toggle('on', player.godMode);
        g.querySelector('span').textContent = player.godMode ? 'ON' : 'OFF';
        const inGame = !!level && state.mode !== 'menu';
        document.querySelectorAll('.debug-level').forEach((b) => {
            b.classList.toggle('current', inGame && Number(b.dataset.level) === state.levelId);
        });
    }

    function debugLog(text, kind = '') {
        const log = $('debug-log');
        const line = document.createElement('div');
        if (kind) line.className = kind;
        line.textContent = text;
        log.appendChild(line);
        while (log.children.length > 30) log.removeChild(log.firstChild);
        log.scrollTop = log.scrollHeight;
    }

    function openDebug() {
        debugResume = state.mode === 'playing';
        $('debug-console').classList.add('active');
        if (isLocked()) document.exitPointerLock();
        for (const k in keys) keys[k] = false;
        syncDebug();
        setTimeout(() => $('debug-input').focus(), 30);
    }

    function closeDebug() {
        $('debug-console').classList.remove('active');
        $('debug-input').blur();
        // Drop straight back into the game if that's where we came from
        if (debugResume && state.mode === 'paused') requestLock();
        debugResume = false;
    }

    function toggleDebug() {
        if (debugOpen()) closeDebug();
        else openDebug();
    }

    function jumpToLevel(n) {
        if (!LEVEL_INFO[n]) { debugLog(`No level ${n}. Levels are 1-${LAST_LEVEL}.`, 'err'); return; }
        if (state.mode === 'loading' || state.mode === 'transition' || state.mode === 'dying') {
            debugLog('Busy - try again in a moment.', 'err');
            return;
        }
        debugResume = false;
        $('debug-console').classList.remove('active');
        ['death-screen', 'victory-screen'].forEach((id) => $(id).classList.remove('show'));
        $('pause-menu').classList.remove('active');
        $('settings-panel').classList.remove('active');
        $('jumpscare-screen').style.display = 'none';
        AudioSys.ensureContext();
        AudioSys.suspendAll(false);
        if (state.mode === 'menu' || !state.stats.runStart) {
            Menu.stop();
            state.stats = { runStart: performance.now(), deaths: 0, matchesUsed: 0, notes: new Set() };
        }
        $('start-screen').classList.add('hidden');
        debugLog(`Loading level ${LEVEL_INFO[n].num}: ${LEVEL_INFO[n].title}`, 'ok');
        requestLock();
        loadLevel(n);
    }

    function refillAll() {
        if (!level || state.mode === 'menu') { debugLog('Not in a level.', 'err'); return; }
        player.sanity = 100;
        player.stamina = 100;
        player.battery = 100;
        player.exhausted = false;
        player.matches = Math.max(player.matches, 5);
        debugLog('Sanity, stamina, battery and matches refilled.', 'ok');
    }

    const DEBUG_HELP = [
        'level <1-5>   jump to a level (also: l 3, or just 3)',
        'god [on|off]  toggle invulnerable no-clip flying (also the Z key)',
        'heal          refill sanity, stamina, battery and matches',
        'menu          quit to the title screen',
        'clear         clear this log'
    ];

    function runCommand(raw) {
        const text = raw.trim().toLowerCase();
        if (!text) return;
        debugLog('> ' + raw.trim());
        const [cmd, arg] = text.split(/\s+/);
        if (/^\d+$/.test(cmd)) return jumpToLevel(Number(cmd));
        switch (cmd) {
            case 'level': case 'lvl': case 'l': case 'goto':
                return jumpToLevel(Number(arg));
            case 'god':
                setGodMode(arg === 'on' ? true : arg === 'off' ? false : !player.godMode);
                return debugLog('God mode ' + (player.godMode ? 'ON' : 'OFF'), 'ok');
            case 'heal': case 'refill':
                return refillAll();
            case 'menu':
                $('debug-console').classList.remove('active');
                debugResume = false;
                return toMenu();
            case 'clear':
                $('debug-log').textContent = '';
                return;
            case 'help': case '?':
                DEBUG_HELP.forEach((l) => debugLog(l));
                return;
            default:
                debugLog(`Unknown command "${cmd}". Type help.`, 'err');
        }
    }

    document.querySelectorAll('.debug-level').forEach((b) => {
        b.addEventListener('click', () => jumpToLevel(Number(b.dataset.level)));
    });
    $('debug-god').addEventListener('click', () => setGodMode(!player.godMode));
    $('debug-heal').addEventListener('click', refillAll);
    $('debug-close').addEventListener('click', closeDebug);
    $('pause-debug').addEventListener('click', openDebug);
    $('debug-console').addEventListener('click', (e) => { if (e.target.id === 'debug-console') closeDebug(); });
    $('debug-input').addEventListener('keydown', (e) => {
        if (e.code !== 'Enter') return;
        runCommand(e.target.value);
        e.target.value = '';
    });

    // =========================================================================
    // Input
    // =========================================================================
    document.addEventListener('mousemove', (e) => {
        if (state.mode !== 'playing' || state.note || debugOpen() || (!isLocked() && !state.debug)) return;
        const s = settings.cameraSensitivity;
        player.yaw -= e.movementX * s;
        player.pitch = clamp(player.pitch - e.movementY * s, -1.45, 1.45);
        player.swayX = clamp(player.swayX - e.movementX * 0.00025, -0.05, 0.05);
        player.swayY = clamp(player.swayY + e.movementY * 0.00025, -0.05, 0.05);
    });

    window.addEventListener('keydown', (e) => {
        // The debug console gets first look at every key
        if (e.code === 'Backquote') {
            e.preventDefault();
            if (!e.repeat) toggleDebug();
            return;
        }
        if (debugOpen()) {
            if (e.code === 'Escape') { e.preventDefault(); closeDebug(); }
            return; // typing in the console never moves the player
        }
        keys[e.code] = true;
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        if (state.mode === 'paused' && e.code === 'Escape') {
            requestLock();
            return;
        }
        if (state.mode !== 'playing' || e.repeat) return;
        switch (e.code) {
            case 'Space':
                if (!player.godMode) lightMatch();
                break;
            case 'KeyF':
                toggleFlashlight();
                break;
            case 'KeyC':
                toggleCrouch();
                break;
            case 'KeyQ':
                if (level && level.camcorder) player.lensToggle = !player.lensToggle;
                break;
            case 'KeyE':
                if (state.note) closeNote();
                else if (state.nearNote) openNote(state.nearNote);
                break;
            case 'KeyZ':
                setGodMode(!player.godMode);
                break;
            case 'Escape':
                if (state.note) closeNote();
                break;
        }
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    // Which build is running, and whether it found a touch screen (shown on the title screen)
    const BUILD = '2.1';
    $('build-tag').textContent = `v${BUILD} · ${touchMode ? 'touch controls' : 'keyboard & mouse'}`;
    // iPhone: no fullscreen for web pages - hide the button and point to Add to Home Screen
    if (!TouchControls.canFullscreen) {
        document.querySelectorAll('.fullscreen-toggle').forEach((b) => { b.style.display = 'none'; });
        if (touchMode && !TouchControls.standalone) $('ios-tip').classList.add('show');
    }

    // Touch controls: the joystick is read in updatePlayer; look and buttons arrive here
    if (!TouchControls.canFullscreen) $('t-fullscreen').style.display = 'none';
    TouchControls.init({
        any() { AudioSys.retryBlocked(); },
        // Fullscreen is lost when you switch apps, rotate, or the first request is refused:
        // take it back on the next tap during play (unless you chose to leave it)
        gesture() {
            if (TouchControls.canFullscreen && !fsDeclined && state.mode === 'playing' &&
                !(document.fullscreenElement || document.webkitFullscreenElement)) enterImmersive();
        },
        look(dx, dy) {
            if (state.mode !== 'playing' || state.note || debugOpen()) return;
            const s = settings.cameraSensitivity * 1.9;
            player.yaw -= dx * s;
            player.pitch = clamp(player.pitch - dy * s, -1.45, 1.45);
            player.swayX = clamp(player.swayX - dx * 0.0003, -0.05, 0.05);
            player.swayY = clamp(player.swayY + dy * 0.0003, -0.05, 0.05);
        },
        button(name, down) {
            if (name === 'pause') { if (down) pause(); return; }
            // On release: browsers only allow fullscreen from the end of a tap
            if (name === 'fullscreen') { if (!down) { fsDeclined = false; enterImmersive(); } return; }
            if (name === 'run') { keys.ShiftLeft = down; return; }
            if (!down || state.mode !== 'playing') return;
            if (name === 'match') { if (!player.godMode) lightMatch(); }
            else if (name === 'light') toggleFlashlight();
            else if (name === 'crouch') toggleCrouch();
            else if (name === 'camera') { if (level && level.camcorder) player.lensToggle = !player.lensToggle; }
        }
    });
    // Tap the "read note" prompt to read it
    $('prompt').addEventListener('touchend', (e) => {
        e.preventDefault();
        if (state.mode === 'playing' && !state.note && state.nearNote) openNote(state.nearNote);
    }, { passive: false });
    // Tap anywhere on an open note to close it (a drag scrolls instead)
    let noteTouch = null;
    $('note-screen').addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        noteTouch = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    $('note-screen').addEventListener('touchend', (e) => {
        if (!noteTouch) return;
        const t = e.changedTouches[0];
        const moved = Math.hypot(t.clientX - noteTouch.x, t.clientY - noteTouch.y);
        noteTouch = null;
        if (moved < 12 && state.note) {
            e.preventDefault();
            closeNote();
        }
    }, { passive: false });

    renderer.domElement.addEventListener('click', () => {
        if (state.mode === 'playing' && !isLocked()) requestLock();
    });

    // Right mouse raises the camcorder while held
    document.addEventListener('mousedown', (e) => {
        if (e.button === 2 && state.mode === 'playing') player.lensHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
        if (e.button === 2) player.lensHeld = false;
    });
    window.addEventListener('blur', () => { player.lensHeld = false; });
    document.addEventListener('contextmenu', (e) => {
        if (state.mode === 'playing' || isLocked()) e.preventDefault();
    });

    // =========================================================================
    // Menus & settings UI
    // =========================================================================
    // ---- Fullscreen -----------------------------------------------------------
    const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
    // Set when the player deliberately leaves fullscreen, so taps don't drag them back in
    let fsDeclined = false;
    function toggleFullscreen() {
        const root = document.documentElement;
        if (!fsElement()) {
            fsDeclined = false;
            if (touchMode) { enterImmersive(); return; }
            const req = root.requestFullscreen || root.webkitRequestFullscreen;
            if (req) {
                const p = req.call(root, { navigationUI: 'hide' });
                if (p && p.catch) p.catch(() => HUD.toast('Fullscreen not available', 'bad'));
            }
        } else {
            fsDeclined = true;
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) exit.call(document);
        }
    }
    function syncFullscreenUi() {
        const on = !!fsElement();
        document.body.classList.toggle('fs-on', on);
        document.querySelectorAll('.fullscreen-toggle').forEach((b) => {
            b.classList.toggle('active', on);
            const label = b.querySelector('.fs-label');
            if (label) label.textContent = on ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
            b.title = on ? 'Exit fullscreen (Alt+Enter)' : 'Fullscreen (Alt+Enter)';
        });
    }
    document.addEventListener('fullscreenchange', () => { syncFullscreenUi(); applySize(); });
    document.addEventListener('webkitfullscreenchange', () => { syncFullscreenUi(); applySize(); });
    document.querySelectorAll('.fullscreen-toggle').forEach((b) => b.addEventListener('click', toggleFullscreen));
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' && e.altKey) {
            e.preventDefault();
            toggleFullscreen();
        }
    });

    $('start-button').addEventListener('click', startRun);
    $('restart-button').addEventListener('click', retry);
    $('death-menu-button').addEventListener('click', toMenu);
    $('play-again-button').addEventListener('click', () => { $('victory-screen').classList.remove('show'); startRun(); });
    $('victory-menu-button').addEventListener('click', toMenu);
    $('pause-resume').addEventListener('click', () => { requestLock(); if (state.debug) resume(); });
    $('pause-quit').addEventListener('click', toMenu);
    $('pause-settings').addEventListener('click', () => $('settings-panel').classList.add('active'));
    $('settings-icon').addEventListener('click', () => $('settings-panel').classList.add('active'));
    $('howto-button').addEventListener('click', () => $('howto-panel').classList.add('active'));
    $('howto-close').addEventListener('click', () => $('howto-panel').classList.remove('active'));
    $('settings-close').addEventListener('click', () => $('settings-panel').classList.remove('active'));
    for (const id of ['settings-panel', 'howto-panel']) {
        $(id).addEventListener('click', (e) => { if (e.target.id === id) $(id).classList.remove('active'); });
    }

    const sliders = [
        { id: 'music-volume', key: 'musicVolume', toUi: (v) => v * 100, fromUi: (v) => v / 100, label: (v) => Math.round(v * 100) + '%' },
        { id: 'sfx-volume', key: 'sfxVolume', toUi: (v) => v * 100, fromUi: (v) => v / 100, label: (v) => Math.round(v * 100) + '%' },
        { id: 'camera-sensitivity', key: 'cameraSensitivity', toUi: (v) => (v / 0.002) * 100, fromUi: (v) => (v / 100) * 0.002, label: (v) => Math.round((v / 0.002) * 100) + '%' },
        { id: 'brightness', key: 'brightness', toUi: (v) => v * 100, fromUi: (v) => v / 100, label: (v) => Math.round(v * 100) + '%' }
    ];

    function applySettings() {
        AudioSys.setVolumes(settings.musicVolume, settings.sfxVolume);
        Menu.setVolume(settings.musicVolume);
        applySize();
    }

    function syncSettingsUi() {
        for (const s of sliders) {
            $(s.id).value = s.toUi(settings[s.key]);
            $(s.id + '-value').textContent = s.label(settings[s.key]);
        }
        document.querySelectorAll('.quality-btn').forEach((b) => b.classList.toggle('active', b.dataset.quality === settings.quality));
    }

    for (const s of sliders) {
        $(s.id).addEventListener('input', (e) => {
            settings[s.key] = s.fromUi(Number(e.target.value));
            $(s.id + '-value').textContent = s.label(settings[s.key]);
            applySettings();
            saveSettings();
        });
    }
    document.querySelectorAll('.quality-btn').forEach((b) => {
        b.addEventListener('click', () => {
            settings.quality = b.dataset.quality;
            renderScale = quality().scale;
            syncSettingsUi();
            applySettings();
            saveSettings();
            if (scene) {
                // Shadow settings take effect on the next level load; resolution/bloom apply now.
                HUD.toast('Shadow changes apply on next level', '');
            }
        });
    });
    $('settings-reset').addEventListener('click', () => {
        Object.assign(settings, DEFAULTS);
        renderScale = quality().scale;
        syncSettingsUi();
        applySettings();
        saveSettings();
    });

    // =========================================================================
    // Boot
    // =========================================================================
    syncSettingsUi();
    applySize();
    AudioSys.setVolumes(settings.musicVolume, settings.sfxVolume);
    Menu.init(settings.musicVolume);
    syncFullscreenUi();
    Assets.load();
    frame();

    // Debug hooks for automated testing (harmless in normal play)
    window.__twd = {
        state, player, settings,
        startRun, loadLevel, die, completeLevel,
        get level() { return level; },
        get scene() { return scene; },
        camera, renderer,
        teleport(x, z) { player.pos.set(x, 0, z); },
        info() {
            renderer.info.autoReset = false;
            renderer.info.reset();
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);
            const r = Object.assign({}, renderer.info.render, { programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
            renderer.info.autoReset = true;
            return r;
        }
    };
})();
