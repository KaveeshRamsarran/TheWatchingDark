// THE WATCHING DARK - title screen background & menu music
'use strict';

const Menu = (() => {
    let music = null;
    let running = false;
    let canvas, ctx;
    let w = 0, h = 0;
    const blobs = [];
    const eyes = [];
    let last = 0;

    function resize() {
        // Rendered small and scaled up by CSS: soft, cheap fog
        w = Math.ceil(window.innerWidth / 3);
        h = Math.ceil(window.innerHeight / 3);
        canvas.width = w;
        canvas.height = h;
    }

    function init(volume) {
        canvas = document.getElementById('menu-bg');
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
        for (let i = 0; i < 9; i++) {
            blobs.push({ x: Math.random(), y: Math.random(), r: rand(0.25, 0.6), vx: rand(-0.01, 0.01), vy: rand(-0.006, 0.006), a: rand(0.05, 0.12) });
        }
        for (let i = 0; i < 6; i++) eyes.push(newEye());

        music = new Audio('audio/main menu.mp3');
        music.loop = true;
        music.volume = volume;
        const tryPlay = () => { if (running && music.paused) music.play().catch(() => {}); };
        tryPlay();
        // Browsers block autoplay until the first interaction
        const unlock = () => tryPlay();
        document.addEventListener('pointerdown', unlock);
        document.addEventListener('keydown', unlock);
        start();
    }

    function newEye() {
        return {
            x: rand(0.05, 0.95), y: rand(0.15, 0.9), size: rand(0.6, 1.6),
            t: -rand(0, 6), life: rand(3, 7), gap: rand(2.5, 4.5)
        };
    }

    function start() {
        running = true;
        if (music) {
            music.currentTime = 0;
            music.play().catch(() => {});
        }
        last = performance.now();
        requestAnimationFrame(loop);
    }

    function stop() {
        running = false;
        if (music) {
            music.pause();
            music.currentTime = 0;
        }
    }

    function setVolume(v) {
        if (music) music.volume = clamp(v, 0, 1);
    }

    function loop(now) {
        if (!running) return;
        requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const t = now / 1000;

        ctx.fillStyle = '#030203';
        ctx.fillRect(0, 0, w, h);

        // Drifting red-black fog
        for (const b of blobs) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.x < -0.3) b.x = 1.3; if (b.x > 1.3) b.x = -0.3;
            if (b.y < -0.3) b.y = 1.3; if (b.y > 1.3) b.y = -0.3;
            const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * Math.max(w, h));
            g.addColorStop(0, `rgba(90, 8, 10, ${b.a})`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        }

        // Eyes opening in the dark
        for (let i = 0; i < eyes.length; i++) {
            const e = eyes[i];
            e.t += dt;
            if (e.t > e.life) { eyes[i] = newEye(); continue; }
            if (e.t < 0) continue;
            const open = Math.min(1, e.t / 0.8) * Math.min(1, (e.life - e.t) / 0.6);
            const blink = (e.t % e.gap) < 0.12 ? 0.1 : 1;
            const a = open * blink;
            const s = e.size * Math.max(w, h) / 320;
            for (const side of [-1, 1]) {
                const ex = e.x * w + side * 5 * s, ey = e.y * h;
                const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 6 * s);
                g.addColorStop(0, `rgba(255, 60, 40, ${0.95 * a})`);
                g.addColorStop(0.3, `rgba(200, 10, 10, ${0.5 * a})`);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(ex - 6 * s, ey - 6 * s, 12 * s, 12 * s);
                ctx.fillStyle = `rgba(255, 220, 200, ${a})`;
                ctx.fillRect(ex - 0.6 * s, ey - 0.4 * s * blink, 1.2 * s, 0.8 * s * blink);
            }
        }

        // Slow light sweep, like a dying flashlight
        const sweep = (Math.sin(t * 0.23) * 0.5 + 0.5) * w;
        const lg = ctx.createRadialGradient(sweep, h * 0.65, 0, sweep, h * 0.65, w * 0.35);
        const flick = Math.random() < 0.03 ? 0.02 : 0.06;
        lg.addColorStop(0, `rgba(255, 230, 190, ${flick})`);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, w, h);
    }

    return { init, start, stop, setVolume };
})();
