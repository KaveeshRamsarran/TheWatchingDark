THE WATCHING DARK
-----------------
Navigate dark corridors in first-person while humanoid shadow creatures hunt you.
Your sanity drains in darkness. Light is survival.

How to Run
----------
Option A (Recommended): Local Web Server
- Python 3:   python -m http.server 8000
- Then open:  http://localhost:8000/index.html

Option B: Open Directly
- Open index.html in your browser
- Some browsers restrict pointer lock/audio autoplay without a server
- If issues occur, use Option A

Controls
--------
WASD        - Move through the darkness
Mouse       - Look around for threats
SHIFT       - Sprint (drains stamina and sanity, monsters can hear you)
F           - Toggle flashlight (limited battery)
SPACE       - Light a match (restores sanity, scares monsters away!)
Click       - Lock cursor to begin

Game Mechanics
--------------
SANITY      - Drains in darkness, restored by light sources and matches
              Death occurs at 0% sanity
STAMINA     - Depletes while sprinting, regenerates while walking/standing
              Cannot sprint when depleted
FLASHLIGHT  - Limited battery that drains while active
              Find battery pickups throughout the maze
MATCHES     - Start with 10 matches
              Light to scare nearby monsters away temporarily
              Creates bright light and restores sanity quickly
MONSTERS    - Humanoid shadow creatures with glowing red eyes
              Only move when not being looked at (Weeping Angel behavior)
              Flee in terror when you light a match nearby
              Will kill you on contact

Survival Tips
-------------
- Conserve your flashlight battery - darkness is deadly
- Use matches strategically when surrounded
- Sprint only when necessary - you'll make noise and drain stamina
- Light sources scattered in the maze restore sanity
- Keep moving toward the green exit door
- Don't let them catch you

Features
--------
- Procedurally generated maze with organic textures
- Humanoid shadow monsters with realistic anatomy
- Dynamic lighting and shadow system
- Weeping Angel AI - monsters freeze when observed
- Match mechanic - scare monsters away with fire
- Stamina system for realistic movement
- Sanity system with visual/audio distortion
- VHS-style post-processing effects
- Atmospheric audio (footsteps, ambience, jumpscares)
- Minimap navigation
- Main menu music and in-game soundtrack

Audio Files Required
--------------------
- main menu.mp3        - Main menu background music
- OST.mp3              - In-game soundtrack
- footsteps.mp3        - Footstep sound effects
- lighting a match.mp3 - Match lighting sound
- jumpscare.mp3        - Death sound effect
- ambience2.mp3        - Random ambient sounds

Technical Details
-----------------
- Built with Three.js (r128)
- Procedural texture generation
- Web Audio API for sound
- Pointer Lock API for mouse control
- Real-time lighting and shadows

Credits
-------
Created with Three.js
All textures procedurally generated
Web Audio API for sound synthesis
Silent Hill 2 Soundtrack for Main Menu and BG Audio
