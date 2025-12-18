
(() => {
  'use strict';

  /***********************************************************************
   * Hollow's Hunt (Expanded)
   * - First-person raycaster on HTML5 canvas (no external assets).
   * - Procedural textures: walls, floor, ceiling + procedural monster sprite.
   * - Procedural audio: drone/noise + *more footstep-like* impacts, whispers, growls, jumpscare.
   * - Mechanics: movement, sprint/noise, flashlight + battery, pickups, monster pathing, fail/win.
   * - New: camera bob, floor/ceiling texturing, proximity FX (noise + hue shift), scarier monster.
   ***********************************************************************/

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const uiBattery = document.getElementById('batteryVal');
  const uiStamina = document.getElementById('staminaVal');
  const uiNoise = document.getElementById('noiseVal');
  const uiObjective = document.getElementById('objective');

  const menu = document.getElementById('menu');
  const startBtn = document.getElementById('startBtn');

  const gameover = document.getElementById('gameover');
  const restartBtn = document.getElementById('restartBtn');
  const deathLine = document.getElementById('deathLine');

  const winPanel = document.getElementById('win');
  const playAgainBtn = document.getElementById('playAgainBtn');

  // ---------- Utilities ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const now = () => performance.now();

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function hash2(x, y) {
    // deterministic-ish integer hash noise (fast)
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >> 13)) | 0;
    n = (n * 1274126177) | 0;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }

  // ---------- Input ----------
  const keys = new Set();
  let mouseDX = 0;
  let pointerLocked = false;

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyF' || e.code === 'KeyR') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  canvas.addEventListener('click', async () => {
    if (!pointerLocked && state.mode === 'playing') {
      canvas.requestPointerLock?.();
    }
    if (state.mode === 'menu') startGame();
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = (document.pointerLockElement === canvas);
  });

  window.addEventListener('mousemove', (e) => {
    if (pointerLocked) mouseDX += e.movementX || 0;
  });

  // ---------- Game constants ----------
  const W = canvas.width;
  const H = canvas.height;

  const FOV = Math.PI / 3;         // 60°
  const HALF_FOV = FOV / 2;
  const NUM_RAYS = W;              // one ray per column
  const MAX_DIST = 24;             // max ray distance in map units

  // Floor-casting buffer (coarser for performance; we scale up)
  const FC_SCALE = 2;              // 2 = half res
  const FCW = Math.floor(W / FC_SCALE);
  const FCH = Math.floor(H / FC_SCALE);

  // ---------- Procedural textures ----------
  const tex = (() => {
    const size = 64;

    function makeCanvas(s) {
      const c = document.createElement('canvas');
      c.width = c.height = s;
      return c;
    }

    // Wall: damp plaster / stone
    const wall = makeCanvas(size);
    {
      const c = wall.getContext('2d');
      const img = c.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size, v = y / size;
          const n1 = hash2(x, y);
          const n2 = hash2(x * 3, y * 3);
          const n3 = hash2(x * 9, y * 9);
          const grime = (0.55 * n1 + 0.30 * n2 + 0.15 * n3);
          const cracks = Math.pow(hash2(x * 12 + 7, y * 12 - 3), 5);
          const damp = smoothstep(0.55, 0.95, v) * (0.35 + 0.65 * n2);

          let base = 140 + grime * 55 - damp * 55 - cracks * 90;
          base = clamp(base, 35, 210);

          const r = clamp(base * 0.92, 0, 255);
          const g = clamp(base * 0.98 + damp * 28, 0, 255);
          const b = clamp(base * 1.05 + damp * 36, 0, 255);

          const i = (y * size + x) * 4;
          img.data[i + 0] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);

      // faint horizontal seams
      c.globalAlpha = 0.22;
      c.fillStyle = '#0a0d18';
      for (let y = 6; y < size; y += 12) c.fillRect(0, y + randi(-1, 2), size, 1);
      c.globalAlpha = 1;
    }

    // Floor: extremely grimy, filthy asylum floor
    const floor = makeCanvas(size);
    {
      const c = floor.getContext('2d');
      const img = c.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n1 = hash2(x * 2, y * 2);
          const n2 = hash2(x * 7 + 13, y * 7 - 9);
          const n3 = hash2(x * 16, y * 16);
          const n4 = hash2(x * 23 + 5, y * 19 - 3);
          const grime = 0.45 * n1 + 0.30 * n2 + 0.15 * n3 + 0.10 * n4;

          const tileX = (x % 12 === 0) ? 1 : 0;
          const tileY = (y % 12 === 0) ? 1 : 0;
          const seam = (tileX || tileY) ? 0.85 : 0;

          // Much darker base
          let base = 45 + grime * 55 - seam * 40;
          
          // Heavy staining
          const stain = Math.pow(hash2(x * 5 + 20, y * 5 + 90), 4);
          base -= stain * 85;
          
          // Mold patches
          const mold = Math.pow(hash2(x * 11 + 30, y * 13 + 50), 7);
          const moldAmt = mold * 120;

          base = clamp(base, 8, 95);

          const r = clamp(base * 0.88 - moldAmt * 0.3, 0, 255);
          const g = clamp(base * 0.92 - moldAmt * 0.1, 0, 255);
          const b = clamp(base * 0.85 - moldAmt * 0.2, 0, 255);

          const i = (y * size + x) * 4;
          img.data[i + 0] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      // Heavy grime streaks and dirt
      c.globalAlpha = 0.35;
      c.strokeStyle = '#050608';
      c.lineWidth = 2;
      for (let i = 0; i < 35; i++) {
        c.beginPath();
        const y = randi(0, size);
        c.moveTo(randi(0, size), y);
        c.lineTo(randi(0, size), y + randi(-4, 5));
        c.stroke();
      }
      // Dark patches
      c.globalAlpha = 0.25;
      c.fillStyle = '#020304';
      for (let i = 0; i < 15; i++) {
        c.beginPath();
        c.ellipse(randi(0, size), randi(0, size), randi(3, 8), randi(3, 8), 0, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    // Exit door: brown wooden door
    const exitDoor = makeCanvas(size);
    {
      const c = exitDoor.getContext('2d');
      const img = c.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n1 = hash2(x * 4, y * 8);
          const n2 = hash2(x * 12 + 5, y * 2 + 3);
          const woodGrain = 0.65 * n1 + 0.35 * n2;
          
          // Vertical planks
          const plankX = Math.floor(x / 16);
          const plankEdge = (x % 16 === 0 || x % 16 === 15) ? 0.8 : 0;
          
          let base = 85 + woodGrain * 45 - plankEdge * 30;
          base = clamp(base, 40, 140);
          
          const r = clamp(base * 0.72, 0, 255);
          const g = clamp(base * 0.48, 0, 255);
          const b = clamp(base * 0.32, 0, 255);
          
          const i = (y * size + x) * 4;
          img.data[i + 0] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      
      // Door frame and details
      c.strokeStyle = '#1a0f08';
      c.lineWidth = 3;
      c.strokeRect(2, 2, size - 4, size - 4);
      
      // Door handle
      c.fillStyle = '#3a3028';
      c.beginPath();
      c.arc(size * 0.75, size * 0.52, 4, 0, Math.PI * 2);
      c.fill();
      
      // Horizontal beam
      c.fillStyle = '#2a1f18';
      c.fillRect(4, size * 0.48, size - 8, 6);
    }

    // Ceiling: dingy panels with vents
    const ceil = makeCanvas(size);
    {
      const c = ceil.getContext('2d');
      const img = c.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n1 = hash2(x * 2 + 4, y * 2 + 11);
          const n2 = hash2(x * 9 + 1, y * 9 + 7);
          const grime = 0.7 * n1 + 0.3 * n2;

          const panelX = (x % 20 === 0) ? 1 : 0;
          const panelY = (y % 20 === 0) ? 1 : 0;
          const seam = (panelX || panelY) ? 0.85 : 0;

          let base = 120 + grime * 55 - seam * 38;
          // water marks
          const drip = smoothstep(0.4, 0.95, hash2(x * 3 + 90, y * 3 + 10)) * smoothstep(0.2, 0.9, y / size);
          base -= drip * 45;

          base = clamp(base, 25, 200);

          const r = clamp(base * 0.90, 0, 255);
          const g = clamp(base * 0.94, 0, 255);
          const b = clamp(base * 1.04, 0, 255);

          const i = (y * size + x) * 4;
          img.data[i + 0] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      // vent rectangle
      c.globalAlpha = 0.18;
      c.fillStyle = '#05070f';
      c.fillRect(22, 20, 20, 10);
      c.globalAlpha = 0.25;
      c.strokeStyle = '#0b0f1a';
      for (let i = 0; i < 5; i++) c.strokeRect(22 + i, 20 + i, 20 - i * 2, 10 - i * 2);
      c.globalAlpha = 1;
    }

    // Monster sprite (scarier silhouette)
    const sprite = document.createElement('canvas');
    sprite.width = 120;
    sprite.height = 170;
    const s = sprite.getContext('2d');

    function drawMonster(t = 0) {
      s.clearRect(0, 0, sprite.width, sprite.height);
      s.save();
      s.translate(sprite.width / 2, sprite.height * 0.62);

      const sway = 0.12 * Math.sin(t * 2.2);
      const breathe = 0.08 * Math.sin(t * 3.1 + 1.7);

      // shadow aura
      s.globalAlpha = 0.18;
      s.fillStyle = '#000';
      s.beginPath();
      s.ellipse(0, 10, 42, 70, sway * 0.2, 0, Math.PI * 2);
      s.fill();

      s.globalAlpha = 1;

      // torso: extremely emaciated, skeletal frame
      s.fillStyle = '#010104';
      s.beginPath();
      s.moveTo(-14, -62);
      s.quadraticCurveTo(-28, -28, -22, 20 + breathe * 10);
      s.quadraticCurveTo(-16, 58, -5, 76);
      s.quadraticCurveTo(0, 88, 5, 76);
      s.quadraticCurveTo(16, 58, 22, 20 + breathe * 10);
      s.quadraticCurveTo(28, -28, 14, -62);
      s.quadraticCurveTo(0, -76, -14, -62);
      s.closePath();
      s.fill();

      // exposed ribs (very prominent)
      s.globalAlpha = 0.75;
      s.strokeStyle = '#0a0a10';
      s.lineWidth = 4;
      for (let i = 0; i < 8; i++) {
        const yy = -28 + i * 12 + breathe * 7;
        const curve = 8 + i * 0.8;
        s.beginPath();
        s.moveTo(-14, yy);
        s.quadraticCurveTo(-20 - curve, yy + 4, -22, yy + 8);
        s.stroke();
        s.beginPath();
        s.moveTo(14, yy);
        s.quadraticCurveTo(20 + curve, yy + 4, 22, yy + 8);
        s.stroke();
      }
      s.globalAlpha = 1;
      
      // spine protrusions (jagged)
      s.globalAlpha = 0.92;
      s.fillStyle = '#000';
      for (let i = 0; i < 9; i++) {
        const yy = -55 + i * 16 + breathe * 9;
        const spikeH = 15 + i * 1.2;
        s.beginPath();
        s.moveTo(-2, yy);
        s.lineTo(-10 - i * 0.6, yy - spikeH);
        s.lineTo(-6, yy - spikeH * 0.3);
        s.lineTo(-2, yy - 3);
        s.fill();
      }
      s.globalAlpha = 1;

      // arms: extremely long, skeletal, multi-jointed
      s.fillStyle = '#000';
      const armWave = 0.22 * Math.sin(t * 1.6);
      // left arm - unnaturally long
      s.beginPath();
      s.moveTo(-16, -52);
      s.quadraticCurveTo(-62, -22, -68 + armWave * 10, 25);
      s.lineTo(-70 + armWave * 12, 38);
      s.quadraticCurveTo(-68, 65, -52, 92);
      s.lineTo(-48, 98);
      s.lineTo(-42, 94);
      s.lineTo(-44, 88);
      s.quadraticCurveTo(-52, 60, -50, 35);
      s.quadraticCurveTo(-38, 18, -20, -8);
      s.quadraticCurveTo(-14, -28, -16, -52);
      s.fill();
      // elbow joint
      s.beginPath();
      s.arc(-60 + armWave * 10, 32, 5, 0, Math.PI * 2);
      s.fill();
      // right arm
      s.beginPath();
      s.moveTo(16, -52);
      s.quadraticCurveTo(62, -22, 68 - armWave * 10, 25);
      s.lineTo(70 - armWave * 12, 38);
      s.quadraticCurveTo(68, 65, 52, 92);
      s.lineTo(48, 98);
      s.lineTo(42, 94);
      s.lineTo(44, 88);
      s.quadraticCurveTo(52, 60, 50, 35);
      s.quadraticCurveTo(38, 18, 20, -8);
      s.quadraticCurveTo(14, -28, 16, -52);
      s.fill();
      s.beginPath();
      s.arc(60 - armWave * 10, 32, 5, 0, Math.PI * 2);
      s.fill();
      
      // clawed fingers
      s.strokeStyle = '#000';
      s.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        s.beginPath();
        s.moveTo(-48 + i * 2, 98);
        s.lineTo(-52 + i * 2.5, 108 + i);
        s.stroke();
        s.beginPath();
        s.moveTo(48 - i * 2, 98);
        s.lineTo(52 - i * 2.5, 108 + i);
        s.stroke();
      }

      // head: crooked skull-ish mass
      s.save();
      s.translate(0, -74 + sway * 6);
      s.rotate(sway * 0.25);
      s.fillStyle = '#04040b';
      s.beginPath();
      s.ellipse(0, 0, 18, 22, 0, 0, Math.PI * 2);
      s.fill();

      // mouth void (vertical split)
      s.globalAlpha = 0.92;
      s.fillStyle = '#000';
      s.beginPath();
      s.ellipse(0, 10, 10, 13, 0, 0, Math.PI * 2);
      s.fill();

      // teeth scratches
      s.globalAlpha = 0.22;
      s.strokeStyle = '#0f1018';
      s.lineWidth = 2;
      for (let i = -6; i <= 6; i += 3) {
        s.beginPath();
        s.moveTo(i, 2);
        s.lineTo(i + rand(-1, 1), 18);
        s.stroke();
      }

      // eyes: sharp, glowing (animated)
      const eyeGlow = 0.55 + 0.45 * Math.sin(t * 7.0);
      s.globalAlpha = 0.95;
      s.fillStyle = `rgba(255,20,60,${0.45 + 0.45 * eyeGlow})`;
      s.beginPath();
      s.ellipse(-7, -4, 3.2, 5.2, -0.25, 0, Math.PI * 2);
      s.ellipse( 7, -4, 3.2, 5.2,  0.25, 0, Math.PI * 2);
      s.fill();

      // bloom
      s.globalAlpha = 0.12 * eyeGlow;
      s.fillStyle = 'rgb(255,20,60)';
      s.beginPath();
      s.ellipse(-7, -4, 14, 18, 0, 0, Math.PI * 2);
      s.ellipse( 7, -4, 14, 18, 0, 0, Math.PI * 2);
      s.fill();

      s.restore();
      s.restore();
    }

    drawMonster(0);

    // Extract texture data for fast sampling
    function getRGBAData(cnv) {
      const c = cnv.getContext('2d');
      const img = c.getImageData(0, 0, cnv.width, cnv.height);
      return img.data;
    }

    return {
      size,
      wall,
      floor,
      ceil,
      exitDoor,
      sprite,
      drawMonster,
      floorData: getRGBAData(floor),
      ceilData: getRGBAData(ceil),
    };
  })();

  // ---------- Procedural audio ----------
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;

      // beds
      this.droneGain = null;
      this.droneOsc = null;
      this.noiseNode = null;
      this.noiseGain = null;
      this.noiseFilter = null;

      // heartbeat
      this.heartbeatGain = null;
      this.heartbeatLP = null;

      this.enabled = false;
      this._stepGate = 0;
      this._whisperGate = 0;
    }

    async init() {
      if (this.enabled) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      await this.ctx.resume();

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.ctx.destination);

      // low drone
      this.droneOsc = this.ctx.createOscillator();
      this.droneOsc.type = 'sine';
      this.droneOsc.frequency.value = 44;

      const drone2 = this.ctx.createOscillator();
      drone2.type = 'triangle';
      drone2.frequency.value = 55;

      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0.05;

      const droneLP = this.ctx.createBiquadFilter();
      droneLP.type = 'lowpass';
      droneLP.frequency.value = 140;

      const wob = this.ctx.createOscillator();
      wob.type = 'sine';
      wob.frequency.value = 0.18;

      const wobGain = this.ctx.createGain();
      wobGain.gain.value = 7;
      wob.connect(wobGain);
      wobGain.connect(this.droneOsc.frequency);

      this.droneOsc.connect(this.droneGain);
      drone2.connect(this.droneGain);
      this.droneGain.connect(droneLP);
      droneLP.connect(this.master);

      this.droneOsc.start();
      drone2.start();
      wob.start();

      // noise bed
      this.noiseNode = this._makeNoise();
      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0.02;

      this.noiseFilter = this.ctx.createBiquadFilter();
      this.noiseFilter.type = 'bandpass';
      this.noiseFilter.frequency.value = 480;
      this.noiseFilter.Q.value = 0.8;

      this.noiseNode.connect(this.noiseGain);
      this.noiseGain.connect(this.noiseFilter);
      this.noiseFilter.connect(this.master);

      // heartbeat bus
      this.heartbeatGain = this.ctx.createGain();
      this.heartbeatGain.gain.value = 0.0;
      this.heartbeatLP = this.ctx.createBiquadFilter();
      this.heartbeatLP.type = 'lowpass';
      this.heartbeatLP.frequency.value = 650;
      this.heartbeatGain.connect(this.heartbeatLP);
      this.heartbeatLP.connect(this.master);

      this.enabled = true;
    }

    _makeNoise() {
      const bufferSize = 2 * this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.55;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start();
      return src;
    }

    _distCurve(amount) {
      const k = typeof amount === 'number' ? amount : 50;
      const n = 44100;
      const curve = new Float32Array(n);
      const deg = Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const x = (i * 2 / n) - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
      return curve;
    }

    setTension(t) {
      if (!this.enabled) return;
      t = clamp(t, 0, 1);

      const targetDrone = lerp(0.035, 0.095, t);
      this.droneGain.gain.setTargetAtTime(targetDrone, this.ctx.currentTime, 0.25);

      const nf = lerp(320, 980, t);
      this.noiseFilter.frequency.setTargetAtTime(nf, this.ctx.currentTime, 0.25);

      const ng = lerp(0.014, 0.068, t);
      this.noiseGain.gain.setTargetAtTime(ng, this.ctx.currentTime, 0.35);

      const hb = t > 0.18 ? lerp(0.0, 0.22, smoothstep(0.18, 1.0, t)) : 0.0;
      this.heartbeatGain.gain.setTargetAtTime(hb, this.ctx.currentTime, 0.12);
    }

    // New: footstep-like sound (impact + heel/toe grit), fully procedural
    footstep({ volume = 0.12, weight = 1.0, speed = 1.0 } = {}) {
      if (!this.enabled) return;
      const t = this.ctx.currentTime;
      if (t < this._stepGate) return;
      this._stepGate = t + lerp(0.085, 0.16, 1 / clamp(speed, 0.7, 1.6));

      // "thump" (heel impact)
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = lerp(70, 98, Math.random()) * (0.95 + 0.1 * speed);

      const thumpGain = this.ctx.createGain();
      thumpGain.gain.setValueAtTime(0.0001, t);
      thumpGain.gain.exponentialRampToValueAtTime(volume * 0.55 * weight, t + 0.008);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

      const thumpLP = this.ctx.createBiquadFilter();
      thumpLP.type = 'lowpass';
      thumpLP.frequency.value = 220;

      osc.connect(thumpLP);
      thumpLP.connect(thumpGain);
      thumpGain.connect(this.master);

      osc.start(t);
      osc.stop(t + 0.14);

      // "grit" (shoe on concrete) from filtered noise burst
      const src = this._makeNoiseBurst(t, 0.18);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = lerp(240, 520, Math.random());
      bp.Q.value = lerp(2.0, 6.0, Math.random());

      const gritGain = this.ctx.createGain();
      gritGain.gain.setValueAtTime(0.0001, t);
      gritGain.gain.exponentialRampToValueAtTime(volume * 0.42 * weight, t + 0.012);
      gritGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

      const gritLP = this.ctx.createBiquadFilter();
      gritLP.type = 'lowpass';
      gritLP.frequency.value = lerp(900, 1400, speed);

      const distor = this.ctx.createWaveShaper();
      distor.curve = this._distCurve(lerp(10, 28, weight));
      distor.oversample = '2x';

      src.connect(bp);
      bp.connect(distor);
      distor.connect(gritLP);
      gritLP.connect(gritGain);
      gritGain.connect(this.master);

      // cleanup
      setTimeout(() => {
        try { src.stop(); } catch {}
        try { src.disconnect(); bp.disconnect(); distor.disconnect(); gritLP.disconnect(); gritGain.disconnect(); } catch {}
      }, 240);
    }

    _makeNoiseBurst(t, dur = 0.25) {
      const bufferSize = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // pink-ish-ish by integrating white noise a bit
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const w = (Math.random() * 2 - 1) * 0.8;
        last = (last * 0.82 + w * 0.18);
        data[i] = last;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = false;
      src.start(t);
      return src;
    }

    whisper(intensity = 0.35) {
      if (!this.enabled) return;
      const t = this.ctx.currentTime;
      if (t < this._whisperGate) return;
      this._whisperGate = t + 0.20;

      const src = this._makeNoiseBurst(t, 0.38);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = lerp(700, 1900, Math.random());
      bp.Q.value = lerp(3.0, 11.0, Math.random());

      const g = this.ctx.createGain();
      const peak = 0.07 * intensity;

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);

      src.connect(bp);
      bp.connect(g);
      g.connect(this.master);

      setTimeout(() => {
        try { src.stop(); } catch {}
        try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch {}
      }, 460);
    }

    growl(intensity = 0.6) {
      if (!this.enabled) return;
      const t = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = lerp(55, 95, Math.random());

      const distor = this.ctx.createWaveShaper();
      distor.curve = this._distCurve(lerp(35, 85, intensity));
      distor.oversample = '4x';

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 190;
      bp.Q.value = 0.8;

      const g = this.ctx.createGain();
      const peak = 0.055 * intensity;

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);

      osc.connect(distor);
      distor.connect(bp);
      bp.connect(g);
      g.connect(this.master);

      osc.start(t);
      osc.stop(t + 0.33);
    }

    jumpscare() {
      if (!this.enabled) return;
      const t = this.ctx.currentTime;

      const src = this._makeNoiseBurst(t, 0.28);
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.42, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 48;

      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.24, t + 0.015);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.23);
      osc.connect(sg);
      sg.connect(this.master);

      osc.start(t);
      osc.stop(t + 0.26);

      setTimeout(() => {
        try { src.stop(); } catch {}
        try { src.disconnect(); hp.disconnect(); g.disconnect(); } catch {}
      }, 320);
    }

    pulseHeartbeat(speed = 1.0) {
      if (!this.enabled) return;
      const t = this.ctx.currentTime;

      const pulse = (offset, amp, dur) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 90;

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + offset);
        g.gain.exponentialRampToValueAtTime(amp, t + offset + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + offset + dur);

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 420;

        osc.connect(lp);
        lp.connect(g);
        g.connect(this.heartbeatGain);

        osc.start(t + offset);
        osc.stop(t + offset + dur + 0.02);
      };

      const bpm = lerp(72, 132, clamp(speed, 0, 1));
      const beat = 60 / bpm;

      pulse(0.00, 0.20, 0.11);
      pulse(0.14, 0.14, 0.10);

      return beat;
    }
  }

  const audio = new AudioEngine();

  // ---------- Map generation ----------
  // Tile codes: 0 empty, 1 wall, 2 battery, 3 exit, 4 pillar, 5 crate, 6 debris, 7 ceiling light, 8 medkit, 9 noise dampener, 10 speed boost
  function bfsDistances(grid, sx, sy) {
    const h = grid.length;
    const w = grid[0].length;
    const dist = Array.from({ length: h }, () => Array(w).fill(Infinity));
    const q = [];
    dist[sy][sx] = 0;
    q.push([sx, sy]);

    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (q.length) {
      const [x, y] = q.shift();
      const d = dist[y][x];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (grid[ny][nx] === 1) continue;
        if (dist[ny][nx] > d + 1) {
          dist[ny][nx] = d + 1;
          q.push([nx, ny]);
        }
      }
    }
    return dist;
  }

  function generateMaze(w = 65, h = 65) {
    if (w % 2 === 0) w += 1;
    if (h % 2 === 0) h += 1;

    const grid = Array.from({ length: h }, () => Array(w).fill(1));
    const carve = (x, y) => { grid[y][x] = 0; };

    const stack = [];
    const start = { x: 1, y: 1 };
    carve(start.x, start.y);
    stack.push(start);

    const dirs = [
      { dx:  2, dy:  0 },
      { dx: -2, dy:  0 },
      { dx:  0, dy:  2 },
      { dx:  0, dy: -2 }
    ];

    while (stack.length) {
      const cur = stack[stack.length - 1];
      const shuffled = dirs.slice().sort(() => Math.random() - 0.5);
      let moved = false;

      for (const d of shuffled) {
        const nx = cur.x + d.dx;
        const ny = cur.y + d.dy;
        if (nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && grid[ny][nx] === 1) {
          // Carve main path
          carve(cur.x + d.dx / 2, cur.y + d.dy / 2);
          carve(nx, ny);
          
          // Widen corridors by carving adjacent cells
          if (d.dx !== 0) {
            // Horizontal corridor - widen vertically
            if (cur.y + 1 < h - 1) {
              carve(cur.x + d.dx / 2, cur.y + 1);
              carve(nx, ny + 1);
            }
            if (cur.y - 1 > 0) {
              carve(cur.x + d.dx / 2, cur.y - 1);
              carve(nx, ny - 1);
            }
          } else {
            // Vertical corridor - widen horizontally
            if (cur.x + 1 < w - 1) {
              carve(cur.x + 1, cur.y + d.dy / 2);
              carve(nx + 1, ny);
            }
            if (cur.x - 1 > 0) {
              carve(cur.x - 1, cur.y + d.dy / 2);
              carve(nx - 1, ny);
            }
          }
          
          stack.push({ x: nx, y: ny });
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }

    // Create larger open rooms throughout maze
    const roomCount = 18;
    for (let i = 0; i < roomCount; i++) {
      const rx = randi(3, w - 6);
      const ry = randi(3, h - 6);
      const rw = randi(6, 12);
      const rh = randi(6, 12);
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          if (x >= 2 && y >= 2 && x <= w - 3 && y <= h - 3) {
            if (Math.random() < 0.92) grid[y][x] = 0;
          }
        }
      }
    }

    // HARD guarantee: borders are walls (fixes “missing edge / unlit void” reports)
    for (let x = 0; x < w; x++) { grid[0][x] = 1; grid[h-1][x] = 1; }
    for (let y = 0; y < h; y++) { grid[y][0] = 1; grid[y][w-1] = 1; }

    // BFS for distances (needed for item placement)
    const distMap = bfsDistances(grid, start.x, start.y);

    // Place exit RANDOMLY in any valid distant location
    let exitPlaced = false;
    let exitAttempts = 0;
    let far = { x: start.x, y: start.y };
    while (!exitPlaced && exitAttempts < 200) {
      const x = randi(5, w - 5);
      const y = randi(5, h - 5);
      if (grid[y][x] === 0 && distMap[y][x] > 20 && distMap[y][x] !== Infinity) {
        far = { x, y };
        grid[y][x] = 3;
        exitPlaced = true;
      }
      exitAttempts++;
    }
    if (!exitPlaced) {
      // Fallback: find any distant spot
      for (let y = h - 5; y > 5; y--) {
        for (let x = w - 5; x > 5; x--) {
          if (grid[y][x] === 0 && distMap[y][x] > 15) {
            far = { x, y };
            grid[y][x] = 3;
            exitPlaced = true;
            break;
          }
        }
        if (exitPlaced) break;
      }
    }

    // batteries
    const batteryCount = 5;
    let placed = 0;
    while (placed < batteryCount) {
      const x = randi(2, w - 2);
      const y = randi(2, h - 2);
      if (grid[y][x] !== 0) continue;

      if (distMap[y][x] < 12) continue;

      const nWalls = (grid[y-1][x]===1) + (grid[y+1][x]===1) + (grid[y][x-1]===1) + (grid[y][x+1]===1);
      if (Math.random() < (0.34 + 0.14 * nWalls)) {
        grid[y][x] = 2;
        placed++;
      }
    }

    // Scatter pillars and crates sparsely in maze
    const pillarCount = 10;
    placed = 0;
    while (placed < pillarCount) {
      const x = randi(2, w - 2);
      const y = randi(2, h - 2);
      if (grid[y][x] !== 0) continue;
      if (distMap[y][x] < 8) continue;
      const nWalls = (grid[y-1][x]===1) + (grid[y+1][x]===1) + (grid[y][x-1]===1) + (grid[y][x+1]===1);
      if (nWalls <= 1 && Math.random() < 0.3) {
        grid[y][x] = 4;
        placed++;
      }
    }

    const crateCount = 8;
    placed = 0;
    while (placed < crateCount) {
      const x = randi(2, w - 2);
      const y = randi(2, h - 2);
      if (grid[y][x] !== 0) continue;
      if (distMap[y][x] < 6) continue;
      const nWalls = (grid[y-1][x]===1) + (grid[y+1][x]===1) + (grid[y][x-1]===1) + (grid[y][x+1]===1);
      if (nWalls >= 2 && Math.random() < 0.4) {
        grid[y][x] = 5;
        placed++;
      }
    }

    // Sparse debris
    const debrisCount = 12;
    placed = 0;
    while (placed < debrisCount) {
      const x = randi(2, w - 2);
      const y = randi(2, h - 2);
      if (grid[y][x] !== 0) continue;
      if (distMap[y][x] < 4) continue;
      if (Math.random() < 0.2) {
        grid[y][x] = 6;
        placed++;
      }
    }

    // Ceiling lights scattered
    const lightCount = 12;
    placed = 0;
    while (placed < lightCount) {
      const x = randi(3, w - 3);
      const y = randi(3, h - 3);
      if (grid[y][x] !== 0) continue;
      if (distMap[y][x] < 8) continue;
      const nWalls = (grid[y-1][x]===1) + (grid[y+1][x]===1) + (grid[y][x-1]===1) + (grid[y][x+1]===1);
      if (nWalls === 0 && Math.random() < 0.3) {
        grid[y][x] = 7;
        placed++;
      }
    }
    
    // Reduced collectables
    const medkitCount = 3;
    placed = 0;
    while (placed < medkitCount) {
      const x = randi(2, w - 2);
      const y = randi(2, h - 2);
      if (grid[y][x] !== 0) continue;
      if (distMap[y][x] < 15) continue;
      grid[y][x] = 8;
      placed++;
    }
    
    const dampenerCount = 2;
    placed = 0;
    while (placed < dampenerCount) {
      const x = randi(2, w - 2);
      const y = randi(2, h - 2);
      if (grid[y][x] !== 0) continue;
      if (distMap[y][x] < 18) continue;
      grid[y][x] = 9;
      placed++;
    }
    
    const speedCount = 2;
    placed = 0;
    while (placed < speedCount) {
      const x = randi(2, w - 2);
      const y = randi(2, h - 2);
      if (grid[y][x] !== 0) continue;
      if (distMap[y][x] < 20) continue;
      grid[y][x] = 10;
      placed++;
    }

    return { grid, start, exit: { x: far.x, y: far.y } };
  }

  // ---------- World ----------
  let world = null;

  function resetWorld() {
    const { grid, start, exit } = generateMaze(31, 31);

    world = {
      grid,
      w: grid[0].length,
      h: grid.length,
      start,
      exit,
      flicker: 0,
      whisperCooldown: 0,
      pathTimer: 0,
      playerDist: null,

      // film grain
      noiseCanvas: document.createElement('canvas'),
      noiseCtx: null,
      noiseScale: 3,

      // floor-casting buffer
      floorCanvas: document.createElement('canvas'),
      floorCtx: null,
      floorImg: null,
    };

    world.noiseCanvas.width = Math.floor(W / world.noiseScale);
    world.noiseCanvas.height = Math.floor(H / world.noiseScale);
    world.noiseCtx = world.noiseCanvas.getContext('2d');

    world.floorCanvas.width = FCW;
    world.floorCanvas.height = FCH;
    world.floorCtx = world.floorCanvas.getContext('2d', { willReadFrequently: true });
    world.floorImg = world.floorCtx.createImageData(FCW, FCH);

    // player
    state.player.x = start.x + 0.5;
    state.player.y = start.y + 0.5;
    state.player.a = 0;
    state.player.battery = 100;
    state.player.flashlightOn = true;
    state.player.stamina = 100;
    state.player.noise = 0;
    state.player.bobPhase = 0;
    state.player.bob = 0;
    state.player.crouching = false;
    state.player.noiseDampener = 0;
    state.player.speedBoost = 0;

    // monster spawn far
    const dmap = bfsDistances(grid, start.x, start.y);
    let candidates = [];
    for (let y = 1; y < world.h - 1; y++) {
      for (let x = 1; x < world.w - 1; x++) {
        if (grid[y][x] !== 0) continue;
        if (dmap[y][x] > 20) candidates.push({ x, y, d: dmap[y][x] });
      }
    }
    candidates.sort((a, b) => b.d - a.d);
    const pick = candidates[Math.min(12, Math.max(0, candidates.length - 1))] || { x: exit.x, y: exit.y };
    state.monster.x = pick.x + 0.5;
    state.monster.y = pick.y + 0.5;
    state.monster.state = 'stalk';
    state.monster.lastGrowl = 0;
    state.monster.stepTimer = 0;

    state.objectiveStage = 0;
    state.batteriesFound = 0;
    uiObjective.textContent = "Survive and find batteries. Locate the exit.";
  }

  function isWall(x, y) {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (!world) return true;
    if (gx < 0 || gy < 0 || gx >= world.w || gy >= world.h) return true;
    const t = world.grid[gy][gx];
    return t === 1 || t === 4 || t === 5; // walls, pillars, and crates are physical
  }

  function tileAt(x, y) {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (!world) return 1;
    if (gx < 0 || gy < 0 || gx >= world.w || gy >= world.h) return 1;
    return world.grid[gy][gx];
  }

  function setTile(gx, gy, val) {
    if (gx < 0 || gy < 0 || gx >= world.w || gy >= world.h) return;
    world.grid[gy][gx] = val;
  }

  function getCeilingLights(px, py, radius = 15) {
    const lights = [];
    const gx0 = clamp(Math.floor(px) - radius, 0, world.w - 1);
    const gx1 = clamp(Math.floor(px) + radius, 0, world.w - 1);
    const gy0 = clamp(Math.floor(py) - radius, 0, world.h - 1);
    const gy1 = clamp(Math.floor(py) + radius, 0, world.h - 1);
    
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (world.grid[gy][gx] === 7) {
          lights.push({ x: gx + 0.5, y: gy + 0.5 });
        }
      }
    }
    return lights;
  }

  // ---------- State ----------
  const state = {
    mode: 'menu', // menu | playing | dead | win
    t: 0,
    dt: 0,
    last: 0,
    shake: 0,
    proximity: 0,       // 0..1 monster proximity FX amount
    beatWait: 0,
    objectiveStage: 0,  // 0: start, 1: found battery, 2: halfway, 3: find exit
    batteriesFound: 0,

    player: {
      x: 2, y: 2, a: 0,
      r: 0.22,
      speedWalk: 2.25,
      speedRun: 3.75,
      stamina: 100,
      battery: 100,
      flashlightOn: true,
      noise: 0,
      bobPhase: 0,
      bob: 0,
      moving: 0,
      crouching: false,
      noiseDampener: 0,
      speedBoost: 0
    },

    monster: {
      x: 10, y: 10,
      state: 'stalk', // stalk | hunt
      stepTimer: 0,
      lastGrowl: 0
    }
  };

  // ---------- Raycasting ----------
  function castRay(ox, oy, ang) {
    // DDA traversal (robust: never steps out due to border walls)
    const sin = Math.sin(ang);
    const cos = Math.cos(ang);

    let mapX = Math.floor(ox);
    let mapY = Math.floor(oy);

    const deltaDistX = cos === 0 ? 1e9 : Math.abs(1 / cos);
    const deltaDistY = sin === 0 ? 1e9 : Math.abs(1 / sin);

    let stepX, stepY;
    let sideDistX, sideDistY;

    if (cos < 0) { stepX = -1; sideDistX = (ox - mapX) * deltaDistX; }
    else        { stepX =  1; sideDistX = (mapX + 1.0 - ox) * deltaDistX; }

    if (sin < 0) { stepY = -1; sideDistY = (oy - mapY) * deltaDistY; }
    else        { stepY =  1; sideDistY = (mapY + 1.0 - oy) * deltaDistY; }

    let side = 0;
    let steps = 0;

    while (steps++ < 200) {
      if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
      else                       { sideDistY += deltaDistY; mapY += stepY; side = 1; }

      // Since borders are walls, this should always hit before leaving grid.
      if (world.grid[mapY][mapX] === 1) break;
    }

    let perpDist;
    if (side === 0) perpDist = (mapX - ox + (1 - stepX) / 2) / (cos || 1e-9);
    else           perpDist = (mapY - oy + (1 - stepY) / 2) / (sin || 1e-9);

    perpDist = clamp(Math.abs(perpDist), 0.0001, MAX_DIST);

    // texture X coordinate
    let hitX;
    if (side === 0) hitX = oy + perpDist * sin;
    else           hitX = ox + perpDist * cos;
    hitX -= Math.floor(hitX);

    return { dist: perpDist, side, mapX, mapY, hitX };
  }

  function lineOfSight(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return true;
    const steps = Math.ceil(len * 10);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const y = ay + dy * t;
      if (isWall(x, y)) return false;
    }
    return true;
  }

  // ---------- Monster pathing ----------
  function computeBFSFromPlayer() {
    const px = Math.floor(state.player.x);
    const py = Math.floor(state.player.y);
    const h = world.h, w = world.w;

    const distM = Array.from({ length: h }, () => Array(w).fill(Infinity));
    const q = [];
    distM[py][px] = 0;
    q.push([px, py]);

    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (q.length) {
      const [x, y] = q.shift();
      const d = distM[y][x];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (world.grid[ny][nx] === 1) continue;
        if (distM[ny][nx] > d + 1) {
          distM[ny][nx] = d + 1;
          q.push([nx, ny]);
        }
      }
    }
    world.playerDist = distM;
  }

  function monsterChooseDirection() {
    if (!world.playerDist) return { dx: 0, dy: 0 };

    const mx = Math.floor(state.monster.x);
    const my = Math.floor(state.monster.y);

    const dirs = [
      { dx: 1, dy: 0 },
      { dx:-1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy:-1 }
    ];

    let best = null;
    let bestD = Infinity;
    for (const d of dirs) {
      const nx = mx + d.dx;
      const ny = my + d.dy;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
      if (world.grid[ny][nx] === 1) continue;
      const dd = world.playerDist[ny][nx];
      if (dd < bestD) { bestD = dd; best = d; }
    }
    if (!best || bestD === Infinity) return { dx: 0, dy: 0 };

    const tx = mx + best.dx + 0.5;
    const ty = my + best.dy + 0.5;
    const vx = tx - state.monster.x;
    const vy = ty - state.monster.y;
    const l = Math.hypot(vx, vy) || 1;
    return { dx: vx / l, dy: vy / l };
  }

  // ---------- Rendering pipeline ----------
  // We render the 3D scene onto an offscreen canvas, then apply proximity FX to the main ctx.
  const sceneCanvas = document.createElement('canvas');
  sceneCanvas.width = W;
  sceneCanvas.height = H;
  const sctx = sceneCanvas.getContext('2d', { alpha: false });

  const zBuffer = new Float32Array(NUM_RAYS);

  function sampleTex(data, size, u, v) {
    // u,v in [0..1)
    const x = ((u * size) | 0) & (size - 1);
    const y = ((v * size) | 0) & (size - 1);
    const i = (y * size + x) * 4;
    return [data[i], data[i+1], data[i+2]];
  }

  function renderFloorCeil() {
    // floor casting into low-res buffer - STATIC rendering
    const img = world.floorImg;
    const data = img.data;

    // Cache player position at start of frame to prevent movement artifacts
    const px = Math.floor(state.player.x) + 0.5;
    const py = Math.floor(state.player.y) + 0.5;
    const pa = state.player.a;

    const dirX = Math.cos(pa);
    const dirY = Math.sin(pa);

    const planeX = -dirY * Math.tan(HALF_FOV);
    const planeY =  dirX * Math.tan(HALF_FOV);

    const flashlightOn = state.player.flashlightOn && state.player.battery > 0.1;
    const cone = flashlightOn ? (Math.PI / 10) : 0;
    const coneSoft = flashlightOn ? (Math.PI / 7) : 0;
    const lightRange = flashlightOn ? 10.5 : 4.2;

    const amb = 0.10 + 0.04 * world.flicker;

    // clear
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 255;
    }

    const hy = FCH / 2;

    for (let y = 0; y < FCH; y++) {
      const isFloor = y > hy;
      const p = isFloor ? (y - hy) : (hy - y);

      // distance from camera plane; tuned to match wall projection
      const rowDist = (0.5 * FCH) / Math.max(1e-4, p);

      // compute ray directions for left and right edges
      const rayDir0X = dirX - planeX;
      const rayDir0Y = dirY - planeY;
      const rayDir1X = dirX + planeX;
      const rayDir1Y = dirY + planeY;

      // step per screen x
      const stepX = rowDist * (rayDir1X - rayDir0X) / FCW;
      const stepY = rowDist * (rayDir1Y - rayDir0Y) / FCW;

      let worldX = px + rowDist * rayDir0X;
      let worldY = py + rowDist * rayDir0Y;

      for (let x = 0; x < FCW; x++) {
        const cellX = Math.floor(worldX);
        const cellY = Math.floor(worldY);

        // texture coords from fractional parts
        const tx = worldX - cellX;
        const ty = worldY - cellY;

        let rgb;
        if (isFloor) rgb = sampleTex(tex.floorData, tex.size, tx, ty);
        else         rgb = sampleTex(tex.ceilData,  tex.size, tx, ty);

        // lighting: flashlight cone + ceiling lights + ambient
        const camX = (2 * x) / FCW - 1;
        const rayAng = pa + camX * HALF_FOV;
        const rayDiff = Math.abs(((rayAng - pa + Math.PI) % (Math.PI * 2)) - Math.PI);

        let light = amb;
        if (flashlightOn) {
          const inCone = 1.0 - smoothstep(cone, coneSoft, rayDiff);
          const distFall = 1.0 - smoothstep(lightRange * 0.25, lightRange * 1.1, rowDist);
          light += inCone * distFall * (0.92 + 0.22 * world.flicker);
        } else {
          const distFall = 1.0 - smoothstep(2.0, 9.0, rowDist);
          light += distFall * 0.16;
        }
        
        // Add ceiling light contribution
        if (world.ceilingLights) {
          for (const clight of world.ceilingLights) {
            const ldist = dist(worldX, worldY, clight.x, clight.y);
            const lightFall = 1.0 - smoothstep(1.0, 7.5, ldist);
            light += lightFall * (0.55 + 0.15 * world.flicker);
          }
        }

        // floor is darker, ceiling slightly dimmer
        light *= isFloor ? 0.85 : 0.78;

        // fog
        const fog = smoothstep(7.0, MAX_DIST, rowDist);
        const fogAmt = isFloor ? 0.72 * fog : 0.82 * fog;

        // apply darkness
        const dark = clamp(1.0 - light, 0, 1);
        let r = rgb[0] * (1.0 - dark * 0.92);
        let g = rgb[1] * (1.0 - dark * 0.92);
        let b = rgb[2] * (1.0 - dark * 0.92);

        // fog tint
        r = lerp(r, 8, fogAmt);
        g = lerp(g, 10, fogAmt);
        b = lerp(b, 18, fogAmt);

        // subtle distance desaturation
        const sat = 1.0 - fog * 0.35;
        const gray = (r + g + b) / 3;
        r = lerp(gray, r, sat);
        g = lerp(gray, g, sat);
        b = lerp(gray, b, sat);

        const idx = (y * FCW + x) * 4;
        data[idx+0] = r | 0;
        data[idx+1] = g | 0;
        data[idx+2] = b | 0;
        data[idx+3] = 255;

        worldX += stepX;
        worldY += stepY;
      }
    }

    world.floorCtx.putImageData(img, 0, 0);
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(world.floorCanvas, 0, 0, W, H);
  }

  function renderWallsAndSprites() {
    sctx.imageSmoothingEnabled = false;

    const px = state.player.x;
    const py = state.player.y;
    const pa = state.player.a;
    const horizonY = H / 2;

    const flashlightOn = state.player.flashlightOn && state.player.battery > 0.1;
    const cone = flashlightOn ? (Math.PI / 10) : 0;
    const coneSoft = flashlightOn ? (Math.PI / 7) : 0;
    const lightRange = flashlightOn ? 10.5 : 4.2;

    const flick = world.flicker;
    const ambient = 0.08 + 0.03 * flick;
    const darkBase = flashlightOn ? 0.02 : 0.0;
    
    // Cache nearby ceiling lights for this frame
    world.ceilingLights = getCeilingLights(px, py);

    // walls
    for (let x = 0; x < NUM_RAYS; x++) {
      const camX = (2 * x) / NUM_RAYS - 1;
      const rayAng = pa + camX * HALF_FOV;

      const hit = castRay(px, py, rayAng);

      // Fish-eye correction for proper 3D perspective
      const corrected = hit.dist * Math.cos(rayAng - pa);
      const d = Math.max(0.1, Math.min(corrected, MAX_DIST));
      zBuffer[x] = d;

      // Calculate wall height with proper perspective
      const lineH = Math.floor((H / Math.max(0.1, d)) * 3.0);
      const drawStart = Math.floor(horizonY - lineH / 2);

      // texture sample - use exit door texture if this is the exit
      const isExitWall = world.grid[hit.mapY][hit.mapX] === 3;
      const wallTex = isExitWall ? tex.exitDoor : tex.wall;
      const tx = Math.floor(hit.hitX * wallTex.width) % wallTex.width;
      sctx.drawImage(wallTex, tx, 0, 1, wallTex.height, x, drawStart, 1, lineH);

      // lighting
      const rayDiff = Math.abs(((rayAng - pa + Math.PI) % (Math.PI * 2)) - Math.PI);
      let light = ambient;

      if (flashlightOn) {
        const inCone = 1.0 - smoothstep(cone, coneSoft, rayDiff);
        const distFall = 1.0 - smoothstep(lightRange * 0.2, lightRange, d);
        light += inCone * distFall * (0.95 + 0.25 * flick);
      } else {
        const distFall = 1.0 - smoothstep(2.0, 8.0, d);
        light += distFall * 0.18;
      }
      
      // Add ceiling light contribution to walls
      if (world.ceilingLights) {
        const wallX = hit.mapX + 0.5;
        const wallY = hit.mapY + 0.5;
        for (const clight of world.ceilingLights) {
          const ldist = dist(wallX, wallY, clight.x, clight.y);
          const lightFall = 1.0 - smoothstep(0.5, 6.5, ldist);
          light += lightFall * (0.50 + 0.12 * flick);
        }
      }

      const sideShade = hit.side === 1 ? 0.86 : 1.0;
      light *= sideShade;

      // distance fog
      const fog = smoothstep(6.0, MAX_DIST, d);
      const fogAmt = 0.85 * fog;

      // apply darkness overlay
      const darkness = clamp(1.0 - light, 0, 1);
      const darkAlpha = clamp(darkBase + darkness * 0.92, 0, 0.98);
      sctx.fillStyle = `rgba(0,0,0,${darkAlpha})`;
      sctx.fillRect(x, drawStart, 1, lineH);

      // fog tint
      if (fogAmt > 0.01) {
        sctx.fillStyle = `rgba(6,7,14,${fogAmt})`;
        sctx.fillRect(x, drawStart, 1, lineH);
      }
    }

    // sprites (batteries/exit/monster)
    renderWorldSprites(horizonY);
  }

  function projectSprite(wx, wy) {
    const px = state.player.x, py = state.player.y, pa = state.player.a;
    const dx = wx - px;
    const dy = wy - py;
    const d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);

    let rel = ang - pa;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;

    const inFov = Math.abs(rel) < HALF_FOV + 0.20;
    if (!inFov) return null;

    const screenX = Math.floor((rel / HALF_FOV) * (W / 2) + (W / 2));
    return { dist: d, x: screenX, rel };
  }

  function renderWorldSprites(horizonY) {
    const px = state.player.x, py = state.player.y;
    const sprites = [];

    const r = 11;
    const gx0 = clamp(Math.floor(px) - r, 1, world.w - 2);
    const gx1 = clamp(Math.floor(px) + r, 1, world.w - 2);
    const gy0 = clamp(Math.floor(py) - r, 1, world.h - 2);
    const gy1 = clamp(Math.floor(py) + r, 1, world.h - 2);

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const t = world.grid[gy][gx];
        if (t === 2 || t === 8 || t === 9 || t === 10) {
          const wx = gx + 0.5;
          const wy = gy + 0.5;
          const p = projectSprite(wx, wy);
          if (!p) continue;
          sprites.push({ type: t, wx, wy, ...p });
        }
      }
    }

    {
      const p = projectSprite(state.monster.x, state.monster.y);
      if (p) sprites.push({ type: 'monster', wx: state.monster.x, wy: state.monster.y, ...p });
    }

    sprites.sort((a, b) => b.dist - a.dist);

    const flashlightOn = state.player.flashlightOn && state.player.battery > 0.1;

    for (const sp of sprites) {
      const d = sp.dist;
      if (d < 0.25) continue;

      const size = Math.floor((H / d) * 0.85);
      const half = Math.floor(size / 2);
      const top = Math.floor(horizonY - size * 0.35);

      const sx = clamp(sp.x, 0, W - 1);
      if (zBuffer[sx] < d - 0.05) continue;

      const rayDiff = Math.abs(sp.rel);
      let light = 0.12 + 0.03 * world.flicker;
      if (flashlightOn) {
        const inCone = 1.0 - smoothstep(Math.PI / 10, Math.PI / 7, rayDiff);
        const distFall = 1.0 - smoothstep(1.5, 10.5, d);
        light += inCone * distFall * (0.95 + 0.25 * world.flicker);
      } else {
        light += (1.0 - smoothstep(1.2, 7.0, d)) * 0.12;
      }
      light = clamp(light, 0.05, 1.1);

      if (sp.type === 2) {
        // battery
        sctx.save();
        sctx.globalAlpha = 0.95;
        sctx.translate(sp.x, top + half);
        const w = Math.floor(half * 0.35);
        const h = Math.floor(size * 0.55);
        sctx.fillStyle = `rgba(180,200,210,${0.35 + 0.45 * light})`;
        sctx.fillRect(-w, -h/2, w*2, h);
        sctx.fillStyle = `rgba(80,255,200,${0.25 + 0.55 * light})`;
        sctx.fillRect(-w, -h/2, w*2, Math.max(3, Math.floor(h*0.14)));
        sctx.globalAlpha = 0.18 * light;
        sctx.fillStyle = `rgba(120,255,210,1)`;
        sctx.beginPath();
        sctx.ellipse(0, -h/2, w*2.6, w*2.0, 0, 0, Math.PI * 2);
        sctx.fill();
        sctx.restore();
      } else if (sp.type === 8) {
        // medkit
        sctx.save();
        sctx.globalAlpha = 0.95;
        sctx.translate(sp.x, top + half);
        const w = Math.floor(half * 0.4);
        const h = Math.floor(size * 0.5);
        sctx.fillStyle = `rgba(220,235,240,${0.4 + 0.45 * light})`;
        sctx.fillRect(-w, -h/2, w*2, h);
        sctx.fillStyle = `rgba(200,50,50,${0.35 + 0.55 * light})`;
        sctx.fillRect(-w*0.7, -h*0.1, w*1.4, h*0.2);
        sctx.fillRect(-w*0.1, -h*0.4, w*0.2, h*0.8);
        sctx.globalAlpha = 0.22 * light;
        sctx.fillStyle = 'rgba(220,100,100,1)';
        sctx.beginPath();
        sctx.ellipse(0, 0, w*2.4, w*2.0, 0, 0, Math.PI * 2);
        sctx.fill();
        sctx.restore();
      } else if (sp.type === 9) {
        // noise dampener
        sctx.save();
        sctx.globalAlpha = 0.92;
        sctx.translate(sp.x, top + half);
        const w = Math.floor(half * 0.42);
        const h = Math.floor(size * 0.48);
        sctx.fillStyle = `rgba(100,120,200,${0.4 + 0.45 * light})`;
        sctx.fillRect(-w, -h/2, w*2, h);
        sctx.strokeStyle = `rgba(150,170,240,${0.45 + 0.35 * light})`;
        sctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          sctx.beginPath();
          sctx.arc(0, -h/2 + h*0.3 + i*h*0.2, w*0.6, 0, Math.PI * 2);
          sctx.stroke();
        }
        sctx.restore();
      } else if (sp.type === 10) {
        // speed boost
        sctx.save();
        sctx.globalAlpha = 0.90;
        sctx.translate(sp.x, top + half);
        const w = Math.floor(half * 0.38);
        const h = Math.floor(size * 0.52);
        sctx.fillStyle = `rgba(120,220,130,${0.4 + 0.45 * light})`;
        sctx.fillRect(-w, -h/2, w*2, h);
        sctx.fillStyle = `rgba(80,255,100,${0.5 + 0.4 * light})`;
        sctx.beginPath();
        sctx.moveTo(-w*0.5, 0);
        sctx.lineTo(w*0.5, -h*0.3);
        sctx.lineTo(w*0.5, h*0.3);
        sctx.fill();
        sctx.globalAlpha = 0.18 * light;
        sctx.fillStyle = 'rgba(120,255,130,1)';
        sctx.beginPath();
        sctx.ellipse(0, 0, w*2.2, w*1.9, 0, 0, Math.PI * 2);
        sctx.fill();
        sctx.restore();
      } else if (sp.type === 'monster') {
        tex.drawMonster(state.t * 0.001);

        const sw = tex.sprite.width;
        const sh = tex.sprite.height;

        const drawW = Math.floor(size * 0.78);
        const drawH = Math.floor(size * 1.06);
        const left = sp.x - Math.floor(drawW / 2);

        const sliceW = 2;
        for (let sx2 = 0; sx2 < drawW; sx2 += sliceW) {
          const screenX = left + sx2;
          if (screenX < 0 || screenX >= W) continue;
          if (zBuffer[screenX] < d - 0.03) continue;

          const darkness = clamp(1.0 - light, 0, 1);
          sctx.drawImage(
            tex.sprite,
            Math.floor((sx2 / drawW) * sw), 0,
            Math.max(1, Math.floor((sliceW / drawW) * sw)), sh,
            screenX, top, sliceW, drawH
          );

          if (darkness > 0.01) {
            sctx.fillStyle = `rgba(0,0,0,${clamp(0.12 + darkness * 0.88, 0, 0.95)})`;
            sctx.fillRect(screenX, top, sliceW, drawH);
          }
        }
      }
    }
  }

  function renderFilmGrain(baseAlpha = 0.13, extra = 0) {
    const nctx = world.noiseCtx;
    const cw = world.noiseCanvas.width;
    const ch = world.noiseCanvas.height;

    const img = nctx.createImageData(cw, ch);
    const data = img.data;

    const flashlightOn = state.player.flashlightOn && state.player.battery > 0.1;
    const base = flashlightOn ? 16 : 30;
    const extraN = Math.floor(30 * clamp(extra, 0, 1));

    for (let i = 0; i < data.length; i += 4) {
      const v = (Math.random() * (base + extraN)) | 0;
      data[i+0] = v;
      data[i+1] = v;
      data[i+2] = v;
      data[i+3] = (v * 2.0) | 0;
    }
    nctx.putImageData(img, 0, 0);

    ctx.save();
    ctx.globalAlpha = baseAlpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(world.noiseCanvas, 0, 0, W, H);
    ctx.restore();
  }

  function renderCrosshair() {
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(W/2 - 8, H/2);
    ctx.lineTo(W/2 - 2, H/2);
    ctx.moveTo(W/2 + 2, H/2);
    ctx.lineTo(W/2 + 8, H/2);
    ctx.moveTo(W/2, H/2 - 8);
    ctx.lineTo(W/2, H/2 - 2);
    ctx.moveTo(W/2, H/2 + 2);
    ctx.lineTo(W/2, H/2 + 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function render() {
    // camera shake (death/jumpscare)
    let shakeX = 0, shakeY = 0;
    if (state.shake > 0) {
      const s = state.shake * state.shake;
      shakeX = rand(-1, 1) * 12 * s;
      shakeY = rand(-1, 1) * 9 * s;
      state.shake = Math.max(0, state.shake - state.dt * 1.6);
    }

    // 1) render 3D scene to offscreen
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, W, H);

    renderFloorCeil();
    renderWallsAndSprites();

    // 2) proximity FX + present to main canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(shakeX, shakeY);

    const p = clamp(state.proximity, 0, 1);

    // Hue shift intensifies when monster is close
    const hue = lerp(0, -30, p) + Math.sin(state.t * 0.006) * 6 * p;
    const sat = lerp(1.0, 1.55, p);
    const con = lerp(1.0, 1.20, p);
    const blur = lerp(0.0, 0.5, p);

    ctx.save();
    ctx.filter = `hue-rotate(${hue}deg) saturate(${sat}) contrast(${con}) blur(${blur}px)`;
    ctx.drawImage(sceneCanvas, 0, 0);
    ctx.restore();

    // “chromatic slip” + scan jitter (cheap horror feel)
    if (p > 0.001) {
      ctx.save();
      ctx.globalAlpha = 0.14 * p;
      ctx.imageSmoothingEnabled = false;
      const jx = Math.sin(state.t * 0.027) * 6 * p;
      const jy = Math.sin(state.t * 0.031) * 4 * p;
      ctx.drawImage(sceneCanvas, jx, 0);
      ctx.drawImage(sceneCanvas, -jx, 0);
      ctx.drawImage(sceneCanvas, 0, jy);
      ctx.restore();
    }

    // extra grain/noise when close
    renderFilmGrain(0.13 + 0.12 * p, p);

    // red panic vignette + subtle hue pulse
    if (p > 0.01) {
      const a = p * 0.60;
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.62);
      vg.addColorStop(0, `rgba(0,0,0,0)`);
      vg.addColorStop(1, `rgba(150,0,22,${a})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // faint vertical “sensor” lines
      ctx.globalAlpha = 0.08 * p;
      ctx.fillStyle = '#ffffff';
      for (let x = 0; x < W; x += 7) ctx.fillRect(x, 0, 1, H);
      ctx.globalAlpha = 1;
    }

    renderCrosshair();
  }

  // ---------- Simulation ----------
  function update(dt) {
    world.flicker = 0.55 + 0.45 * Math.sin(state.t * 0.003 + Math.sin(state.t * 0.0017) * 1.3);
    world.whisperCooldown -= dt;

    // mouse look
    const sens = 0.0022;
    state.player.a += mouseDX * sens;
    mouseDX = 0;

    if (keys.has('ArrowLeft')) state.player.a -= dt * 1.8;
    if (keys.has('ArrowRight')) state.player.a += dt * 1.8;

    if (state.player.a > Math.PI) state.player.a -= Math.PI * 2;
    if (state.player.a < -Math.PI) state.player.a += Math.PI * 2;

    // flashlight toggle
    if (consumeKey('KeyF')) {
      state.player.flashlightOn = !state.player.flashlightOn;
      if (!state.player.flashlightOn && world.whisperCooldown <= 0) {
        world.whisperCooldown = 6 + Math.random() * 6;
        audio.whisper(0.35);
      }
    }
    
    // crouch toggle
    if (consumeKey('KeyC') || consumeKey('ControlLeft')) {
      state.player.crouching = !state.player.crouching;
    }

    // movement intent
    const forward = (keys.has('KeyW') ? 1 : 0) + (keys.has('KeyS') ? -1 : 0);
    const strafe  = (keys.has('KeyD') ? 1 : 0) + (keys.has('KeyA') ? -1 : 0);

    const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const moveMag = clamp(Math.hypot(forward, strafe), 0, 1);
    const wantRun = running && state.player.stamina > 1 && moveMag > 0 && !state.player.crouching;

    let speedMult = 1.0;
    if (state.player.crouching) speedMult = 0.5;
    if (state.player.speedBoost > 0) {
      speedMult *= 1.45;
      state.player.speedBoost -= dt;
    }
    
    const baseSpeed = wantRun ? state.player.speedRun : state.player.speedWalk;
    const speed = baseSpeed * speedMult;

    // stamina & noise
    if (wantRun && moveMag > 0) state.player.stamina = Math.max(0, state.player.stamina - dt * 22);
    else state.player.stamina = Math.min(100, state.player.stamina + dt * 15);

    let noiseTarget = wantRun ? 10 : (moveMag > 0 ? 4 : 0);
    if (state.player.crouching) noiseTarget *= 0.3;
    if (state.player.noiseDampener > 0) {
      noiseTarget *= 0.4;
      state.player.noiseDampener -= dt;
    }
    state.player.noise = lerp(state.player.noise, noiseTarget, 1 - Math.pow(0.001, dt));

    // camera bob phase (movement realism)
    state.player.moving = lerp(state.player.moving, moveMag, 1 - Math.pow(0.001, dt));
    if (moveMag > 0.01) {
      const rate = wantRun ? 9.5 : 6.4;
      state.player.bobPhase += dt * rate;
      const amp = wantRun ? 1.0 : 0.65;
      state.player.bob = Math.sin(state.player.bobPhase) * 0.55 * amp + Math.sin(state.player.bobPhase * 2.0) * 0.18 * amp;
    } else {
      state.player.bob = lerp(state.player.bob, 0, 1 - Math.pow(0.001, dt));
    }

    // footsteps (more realistic)
    if (moveMag > 0.01) {
      const volume = wantRun ? 0.18 : 0.12;
      const weight = wantRun ? 1.20 : 1.0;
      const spd = wantRun ? 1.35 : 1.0;
      audio.footstep({ volume, weight, speed: spd });
    }

    // move in view space
    const pa = state.player.a;
    const cos = Math.cos(pa), sin = Math.sin(pa);
    const vx = (cos * forward + -sin * strafe) * speed;
    const vy = (sin * forward +  cos * strafe) * speed;

    const nx = state.player.x + vx * dt;
    const ny = state.player.y + vy * dt;
    moveWithCollision(nx, ny);

    // flashlight battery drain
    if (state.player.flashlightOn && state.player.battery > 0) {
      const drain = wantRun ? 5.5 : 4.2;
      state.player.battery = Math.max(0, state.player.battery - dt * drain);
      if (state.player.battery <= 0.01) state.player.flashlightOn = false;
    } else {
      state.player.battery = clamp(state.player.battery, 0, 100);
    }

    // pickups and exit
    const t = tileAt(state.player.x, state.player.y);
    if (t === 2) {
      const gx = Math.floor(state.player.x);
      const gy = Math.floor(state.player.y);
      setTile(gx, gy, 0);
      state.player.battery = clamp(state.player.battery + 38, 0, 100);
      state.batteriesFound++;
      
      if (state.objectiveStage === 0) {
        state.objectiveStage = 1;
        uiObjective.textContent = `Battery found (${state.batteriesFound}). Find items and locate EXIT.`;
      } else if (state.batteriesFound >= 3 && state.objectiveStage === 1) {
        state.objectiveStage = 2;
        uiObjective.textContent = `${state.batteriesFound} batteries. Collect items. Find EXIT.`;
      } else if (state.batteriesFound >= 5 && state.objectiveStage === 2) {
        state.objectiveStage = 3;
        uiObjective.textContent = `${state.batteriesFound} batteries! Search for the EXIT door.`;
      } else {
        uiObjective.textContent = `Battery found (${state.batteriesFound}). Keep searching.`;
      }
      audio.whisper(0.25);
    } else if (t === 8) {
      // medkit
      const gx = Math.floor(state.player.x);
      const gy = Math.floor(state.player.y);
      setTile(gx, gy, 0);
      state.player.stamina = 100;
      state.player.noise = Math.max(0, state.player.noise - 5);
      uiObjective.textContent = "Medkit used. Stamina restored, noise reduced.";
      audio.whisper(0.2);
    } else if (t === 9) {
      // noise dampener
      const gx = Math.floor(state.player.x);
      const gy = Math.floor(state.player.y);
      setTile(gx, gy, 0);
      state.player.noiseDampener = 25;
      uiObjective.textContent = "Noise Dampener active for 25 seconds!";
      audio.whisper(0.2);
    } else if (t === 10) {
      // speed boost
      const gx = Math.floor(state.player.x);
      const gy = Math.floor(state.player.y);
      setTile(gx, gy, 0);
      state.player.speedBoost = 18;
      uiObjective.textContent = "Speed Boost active for 18 seconds!";
      audio.whisper(0.2);
    }
    
    // Check exit door proximity (needs to be close to wall)
    const checkRadius = 0.7;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = Math.floor(state.player.x + dx * checkRadius);
        const cy = Math.floor(state.player.y + dy * checkRadius);
        if (cx >= 0 && cy >= 0 && cx < world.w && cy < world.h) {
          if (world.grid[cy][cx] === 3 && dist(state.player.x, state.player.y, cx + 0.5, cy + 0.5) < 1.2) {
            win();
            return;
          }
        }
      }
    }

    // BFS refresh
    world.pathTimer -= dt;
    if (world.pathTimer <= 0) {
      world.pathTimer = 0.28;
      computeBFSFromPlayer();
    }

    // monster AI
    updateMonster(dt);

    // proximity / tension
    const d = dist(state.player.x, state.player.y, state.monster.x, state.monster.y);
    const tension = clamp(1.0 - (d / 12.0), 0, 1);

    const darknessBoost = (state.player.flashlightOn && state.player.battery > 0.1) ? 0.0 : 0.25;
    const panic = clamp(tension + darknessBoost, 0, 1);

    state.proximity = lerp(state.proximity, panic, 1 - Math.pow(0.002, dt));

    audio.setTension(panic);

    // heartbeat pulses
    state.beatWait -= dt;
    if (state.beatWait <= 0) {
      const next = audio.pulseHeartbeat(clamp(panic, 0, 1));
      state.beatWait = (typeof next === 'number') ? next : 0.8;
    }

    // whispers occasionally
    if (!state.player.flashlightOn && world.whisperCooldown <= 0 && Math.random() < 0.01) {
      world.whisperCooldown = 6 + Math.random() * 6;
      audio.whisper(0.45);
    }

    // HUD
    uiBattery.textContent = Math.round(state.player.battery).toString();
    uiStamina.textContent = Math.round(state.player.stamina).toString();
    uiNoise.textContent = Math.round(state.player.noise).toString();
  }

  function moveWithCollision(nx, ny) {
    const r = state.player.r;

    // X
    if (!isWall(nx + r, state.player.y) && !isWall(nx - r, state.player.y)) {
      state.player.x = nx;
    }

    // Y
    if (!isWall(state.player.x, ny + r) && !isWall(state.player.x, ny - r)) {
      state.player.y = ny;
    }
  }

  function updateMonster(dt) {
    const mx = state.monster.x;
    const my = state.monster.y;
    const px = state.player.x;
    const py = state.player.y;

    const d = dist(mx, my, px, py);
    const canSee = d < 11.5 && lineOfSight(mx, my, px, py);
    const hearing = d < (4.0 + state.player.noise * 0.55);

    if (canSee || hearing) state.monster.state = 'hunt';
    else if (d > 12.5) state.monster.state = 'stalk';

    const base = state.monster.state === 'hunt' ? 1.55 : 1.25;
    const ramp = clamp(1.0 - d / 10.0, 0, 1);
    const speed = base + ramp * 1.35;

    const dir = monsterChooseDirection();

    let vx = dir.dx * speed;
    let vy = dir.dy * speed;

    if (state.monster.state === 'hunt' && d < 5.2) {
      const a = Math.atan2(py - my, px - mx);
      const side = a + Math.PI / 2;
      const wob = Math.sin(state.t * 0.010) * 0.55 * ramp;
      vx += Math.cos(side) * wob;
      vy += Math.sin(side) * wob;
    }

    const nx = mx + vx * dt;
    const ny = my + vy * dt;

    const r = 0.18;
    if (!isWall(nx + r, my) && !isWall(nx - r, my)) state.monster.x = nx;
    if (!isWall(state.monster.x, ny + r) && !isWall(state.monster.x, ny - r)) state.monster.y = ny;

    // monster steps (heavier)
    state.monster.stepTimer -= dt;
    const stepRate = state.monster.state === 'hunt' ? 0.22 : 0.30;
    if (state.monster.stepTimer <= 0) {
      state.monster.stepTimer = stepRate;
      const vol = clamp(0.06 + (1.0 - d / 12.0) * 0.20, 0.03, 0.24);
      audio.footstep({ volume: vol, weight: 1.45, speed: 0.9 });
    }

    if (state.monster.state === 'hunt' && d < 9.0 && (now() - state.monster.lastGrowl) > 600) {
      if (Math.random() < 0.65) {
        state.monster.lastGrowl = now();
        audio.growl(clamp(1.0 - d / 9.0, 0.40, 1.0));
      }
    }

    if (d < 0.62) die();
  }

  // ---------- Key helpers ----------
  const keyLatch = new Set();
  function consumeKey(code) {
    const down = keys.has(code);
    const latched = keyLatch.has(code);
    if (down && !latched) {
      keyLatch.add(code);
      return true;
    }
    if (!down && latched) keyLatch.delete(code);
    return false;
  }

  // ---------- Mode transitions ----------
  function startGame() {
    try {
      const loadingMsg = document.getElementById('loadingMsg');
      if (loadingMsg) {
        loadingMsg.style.display = 'block';
      }
      
      // Use setTimeout to allow UI to update before heavy maze generation
      setTimeout(() => {
        try {
          menu.classList.add('hidden');
          gameover.classList.add('hidden');
          winPanel.classList.add('hidden');

          state.mode = 'playing';
          resetWorld();

          audio.init().catch(() => {});
          
          // Request pointer lock after a brief delay
          setTimeout(() => {
            canvas.requestPointerLock?.();
          }, 100);

          state.shake = 0;
          state.proximity = 0;
        } catch (e) {
          console.error('Error during game start:', e);
          alert('Error starting game: ' + e.message + '. Check console for details.');
          menu.classList.remove('hidden');
          if (loadingMsg) loadingMsg.style.display = 'none';
        }
      }, 50);
    } catch (e) {
      console.error('Error starting game:', e);
      alert('Error starting game. Check console for details.');
    }
  }

  function die() {
    if (state.mode !== 'playing') return;
    state.mode = 'dead';

    state.shake = 1.0;
    audio.jumpscare();
    document.exitPointerLock?.();

    const lines = [
      "You ran in the wrong direction.",
      "It learned your footsteps.",
      "Your light betrayed you.",
      "You never saw the second corridor.",
      "It was waiting in the dark."
    ];
    deathLine.textContent = lines[randi(0, lines.length)];
    gameover.classList.remove('hidden');
  }

  function win() {
    if (state.mode !== 'playing') return;
    state.mode = 'win';
    document.exitPointerLock?.();
    winPanel.classList.remove('hidden');
  }

  // ---------- UI events ----------
  startBtn.addEventListener('click', () => startGame());
  restartBtn.addEventListener('click', () => startGame());
  playAgainBtn.addEventListener('click', () => startGame());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && (state.mode === 'dead' || state.mode === 'win')) startGame();
  });

  // ---------- Main loop ----------
  function loop(ts) {
    if (!state.last) state.last = ts;
    state.t = ts;
    const dt = clamp((ts - state.last) / 1000, 0, 0.05);
    state.dt = dt;
    state.last = ts;

    if (state.mode === 'playing') {
      update(dt);
      render();
    } else {
      if (world) {
        world.flicker = 0.55 + 0.45 * Math.sin(state.t * 0.003 + Math.sin(state.t * 0.0017) * 1.3);
        // still render background for menu
        render();
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }
    }

    requestAnimationFrame(loop);
  }

  // boot
  resetWorld();
  requestAnimationFrame(loop);

})();
