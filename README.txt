╔════════════════════════════════════════════════════════════════╗
║                    THE WATCHING DARK                           ║
║              A Psychological Horror Maze Adventure             ║
╚════════════════════════════════════════════════════════════════╝

Navigate pitch-black corridors haunted by grotesque creatures. Your sanity 
crumbles in darkness. Your only salvation: light, speed, and survival instinct.

Two nightmarish levels await. Can you escape?


═══════════════════════════════════════════════════════════════════
  GETTING STARTED
═══════════════════════════════════════════════════════════════════

RECOMMENDED: Local Web Server
  Python 3:  python -m http.server 8000
  Then:      Open http://localhost:8000/index.html in your browser

ALTERNATIVE: Direct File Access
  Open index.html directly in your browser
  (Some features may not work without a server)


═══════════════════════════════════════════════════════════════════
  CONTROLS
═══════════════════════════════════════════════════════════════════

Movement
  WASD          Navigate through the darkness
  SHIFT         Sprint faster (costs stamina, monsters hear you!)

Interaction
  Mouse         Look around for threats
  F             Toggle flashlight (limited battery power)
  SPACE         Light a match (scares creatures away!)

Camera
  Click         Lock cursor to begin


═══════════════════════════════════════════════════════════════════
  GAME MECHANICS
═══════════════════════════════════════════════════════════════════

SANITY SYSTEM
  • Rapidly drains in complete darkness
  • Restored by matches and light sources
  • Game Over at 0% sanity
  • Low sanity causes visual/audio distortions

STAMINA SYSTEM
  • Depletes during sprint (SHIFT)
  • Regenerates while walking or standing
  • Must recover to sprint again

FLASHLIGHT
  • Limited battery power (drains while active)
  • Essential for navigation
  • Find battery pickups scattered throughout each level

MATCHES
  • Start with 5 matches per level
  • Bright emergency light source
  • Terrifies creatures - forces them to flee temporarily
  • Instantly restores sanity when lit

MONSTERS

  Level 1: WATCHERS
    - Humanoid entities with glowing red eyes
    - Only move when you're not looking at them
    - Flee in terror from lit matches
    - Death on contact

  Level 2: THE ANGELS
    - Tall, skeletal, tattered creatures of nightmare
    - Emerge from the dense fog around you
    - Incredibly dangerous and aggressive
    - Impossible to see through the oppressive mist


═══════════════════════════════════════════════════════════════════
  LEVEL DETAILS
═══════════════════════════════════════════════════════════════════

LEVEL 1: THE MAZE
  Indoor labyrinth of dark corridors
  Shadow creatures hunt you relentlessly
  Your sanity is your greatest enemy
  Find the green exit to progress

LEVEL 2: THE LOST FOREST
  Dense, suffocating fog obscures your vision
  Can only see ~10 units in any direction
  Angels lurk just beyond the fog's edge
  Navigate by flashlight alone
  Escape through the darkness to survive


═══════════════════════════════════════════════════════════════════
  SURVIVAL STRATEGIES
═══════════════════════════════════════════════════════════════════

✓ Keep your flashlight on - darkness kills you
✓ Use matches strategically when surrounded
✓ Sprint sparingly to conserve stamina
✓ Keep moving - standing still attracts creatures
✓ The green door is your goal - find it
✓ In Level 2, listen for breathing and footsteps
✓ Don't look away from threats for long
✓ Matches are your last resort - use wisely


═══════════════════════════════════════════════════════════════════
  FEATURES
═══════════════════════════════════════════════════════════════════

Graphics & Atmosphere
  ✓ Procedurally generated mazes
  ✓ Dynamic lighting with shadows
  ✓ Oppressive fog system (Level 2)
  ✓ Terrifyingly detailed monster models
  ✓ VHS-style post-processing effects
  ✓ Minimap for navigation

Gameplay
  ✓ Weeping Angel AI - creatures freeze when observed
  ✓ Two distinct monster types with unique behavior
  ✓ Sanity and stamina systems
  ✓ Resource management (matches, battery)
  ✓ Multiple difficulty levels

Audio
  ✓ Spatial sound design
  ✓ Footstep audio cues
  ✓ Creature vocalizations
  ✓ Atmospheric ambience
  ✓ Menacing soundtrack


═══════════════════════════════════════════════════════════════════
  REQUIRED AUDIO FILES
═══════════════════════════════════════════════════════════════════

Place these files in the audio/ folder:
  • main menu.mp3       - Main menu theme
  • OST.mp3             - In-game background music
  • footsteps.mp3       - Player footstep sounds
  • lighting a match.mp3 - Match ignition sound
  • jumpscare.mp3       - Death scream
  • ambience2.mp3       - Environmental ambience


═══════════════════════════════════════════════════════════════════
  TECHNICAL INFORMATION
═══════════════════════════════════════════════════════════════════

Engine:        Three.js r128 (WebGL)
Textures:      Procedurally generated (Canvas API)
Audio:         Web Audio API + MP3 files
Controls:      Pointer Lock API
Performance:   Optimized for 60 FPS

Browser Requirements:
  • Modern browser with WebGL support
  • Hardware accelerated graphics recommended
  • 4GB+ RAM
  • 50MB+ free disk space


═══════════════════════════════════════════════════════════════════
  CREDITS
═══════════════════════════════════════════════════════════════════

Engine:       Three.js (threejs.org)
Graphics:     Procedural texture generation
Sound:        Web Audio API
Inspiration:  Silent Hill, Weeping Angels (Doctor Who)

Created as a psychological horror experience.
