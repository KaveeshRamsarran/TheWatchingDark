// THE WATCHING DARK - touch controls for phones and tablets
// Left half of the screen: a floating joystick (push it to the edge to run).
// Anywhere else: drag to look. Buttons on the right for everything else.
'use strict';

const TouchControls = (() => {
    // Touch mode if the main pointer is a finger, the device has a touch screen, or the
    // browser identifies as a phone/tablet. Force it with ?touch=1 (or off with ?touch=0).
    const forced = /[?&]touch=([01])\b/.exec(location.search);
    const ua = navigator.userAgent || '';
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i.test(ua) ||
        (navigator.userAgentData && navigator.userAgentData.mobile) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPadOS pretends to be a Mac
    const enabled = forced ? forced[1] === '1' :
        !!((window.matchMedia && matchMedia('(pointer: coarse)').matches) ||
        ('ontouchstart' in window && navigator.maxTouchPoints > 0) || mobileUA);
    // iPhone Safari has no fullscreen API for web pages (Add to Home Screen instead)
    const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
    const standalone = (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) ||
        navigator.standalone === true;
    const move = { x: 0, y: 0, mag: 0, sprint: false };
    const R = 58;              // joystick travel in px
    let handlers = {};
    let stickId = null, lookId = null;
    const origin = { x: 0, y: 0 }, last = { x: 0, y: 0 };
    let base = null, knob = null;

    function init(h) {
        handlers = h;
        if (!enabled) return;
        document.body.classList.add('touch');
        base = document.getElementById('touch-stick');
        knob = document.getElementById('touch-knob');
        const zone = document.getElementById('touch-zone');
        const opts = { passive: false };
        zone.addEventListener('touchstart', onStart, opts);
        zone.addEventListener('touchmove', onMove, opts);
        zone.addEventListener('touchend', onEnd, opts);
        zone.addEventListener('touchcancel', onEnd, opts);

        // Buttons report press and release, and never reach the look zone behind them
        document.querySelectorAll('[data-touch]').forEach((b) => {
            const name = b.dataset.touch;
            b.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                b.classList.add('down');
                handlers.any && handlers.any();
                handlers.button && handlers.button(name, true);
            }, opts);
            const up = (e) => {
                e.preventDefault();
                e.stopPropagation();
                b.classList.remove('down');
                handlers.button && handlers.button(name, false);
            };
            b.addEventListener('touchend', up, opts);
            b.addEventListener('touchcancel', up, opts);
        });
        // Any touch at all gives blocked audio another chance to start (iOS). The end of a
        // touch also counts as a user gesture, so it's the moment we may re-enter fullscreen.
        document.addEventListener('touchend', () => {
            handlers.any && handlers.any();
            handlers.gesture && handlers.gesture();
        }, { passive: true });
    }

    function onStart(e) {
        e.preventDefault();
        handlers.any && handlers.any();
        for (const t of e.changedTouches) {
            if (stickId === null && t.clientX < window.innerWidth * 0.45) {
                stickId = t.identifier;
                origin.x = t.clientX;
                origin.y = t.clientY;
                base.style.transform = `translate(${origin.x}px, ${origin.y}px)`;
                knob.style.transform = 'translate(-50%, -50%)';
                base.classList.add('show');
            } else if (lookId === null) {
                lookId = t.identifier;
                last.x = t.clientX;
                last.y = t.clientY;
            }
        }
    }

    function onMove(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === stickId) {
                let dx = t.clientX - origin.x, dy = t.clientY - origin.y;
                const len = Math.hypot(dx, dy);
                // The stick follows a thumb that slides too far, so it never gets "stuck"
                if (len > R * 1.6) {
                    const k = (len - R * 1.6) / len;
                    origin.x += dx * k;
                    origin.y += dy * k;
                    base.style.transform = `translate(${origin.x}px, ${origin.y}px)`;
                    dx = t.clientX - origin.x;
                    dy = t.clientY - origin.y;
                }
                const l2 = Math.hypot(dx, dy);
                const c = l2 > R ? R / l2 : 1;
                move.x = (dx * c) / R;
                move.y = -(dy * c) / R;
                move.mag = Math.min(1, l2 / R);
                move.sprint = l2 > R * 1.25;
                base.classList.toggle('sprint', move.sprint);
                knob.style.transform = `translate(calc(-50% + ${dx * c}px), calc(-50% + ${dy * c}px))`;
            } else if (t.identifier === lookId) {
                handlers.look && handlers.look(t.clientX - last.x, t.clientY - last.y);
                last.x = t.clientX;
                last.y = t.clientY;
            }
        }
    }

    function onEnd(e) {
        for (const t of e.changedTouches) {
            if (t.identifier === stickId) {
                stickId = null;
                move.x = move.y = move.mag = 0;
                move.sprint = false;
                base.classList.remove('show', 'sprint');
            } else if (t.identifier === lookId) {
                lookId = null;
            }
        }
    }

    // Drop any held input (e.g. when the game pauses)
    function reset() {
        stickId = lookId = null;
        move.x = move.y = move.mag = 0;
        move.sprint = false;
        if (base) base.classList.remove('show', 'sprint');
        document.querySelectorAll('[data-touch].down').forEach((b) => b.classList.remove('down'));
    }

    // Show only the buttons that make sense on this level
    function configure({ flashlight = true, camera = false } = {}) {
        if (!enabled) return;
        const show = (name, on) => document.querySelectorAll(`[data-touch="${name}"]`).forEach((b) => { b.hidden = !on; });
        show('light', flashlight);
        show('camera', camera);
    }

    function setActive(name, on) {
        document.querySelectorAll(`[data-touch="${name}"]`).forEach((b) => b.classList.toggle('active', !!on));
    }

    return { enabled, canFullscreen, standalone, move, init, reset, configure, setActive };
})();
