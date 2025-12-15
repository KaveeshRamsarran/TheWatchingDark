Hollow's Hunt — Browser Horror Game (No external assets)
====================================================

How to run
----------
Option A (recommended): local web server
- Python 3:   python -m http.server 8000
- Then open:  http://localhost:8000/hollows_hunt/index.html

Option B: open index.html directly
- Some browsers restrict pointer lock / audio autoplay without a server. If so, use Option A.

Controls
--------
- WASD: move
- Mouse: look (click canvas to lock cursor)
- Shift: run (drains stamina + makes more noise)
- F: toggle flashlight (drains battery)
- R: restart after death/win

Design notes
------------
- Procedural wall textures + monster sprite drawn at runtime.
- All audio is generated live with Web Audio (drone/noise/steps/whispers/growls/jumpscare).


Update (Expanded build)
----------------------
- Footsteps reworked to sound more like actual impacts on concrete (procedural: thump + grit).
- Added floor + ceiling textures with perspective floor-casting (procedural).
- Monster sprite redesigned (taller, thinner, glowing eyes, long limbs).
- Proximity effects: hue shift, added noise and subtle “sensor jitter” when monster is close.
- Added camera bob tied to movement speed (walk/run).
- Hardened map borders as walls to avoid “missing edge / void” artifacts.
