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
  (Served over http, monster footsteps are panned toward where they are.)

ALTERNATIVE: Direct File Access
  Open index.html directly in your browser - everything still works,
  footsteps just aren't directional.


═══════════════════════════════════════════════════════════════════
  CONTROLS
═══════════════════════════════════════════════════════════════════

  WASD / Arrows   Move through the darkness
  Mouse           Look around for threats
  SHIFT           Sprint (costs stamina and sanity - and they hear you)
  F               Toggle flashlight (limited battery, Level 1)
  SPACE           Light a match (Watchers flee from fire)
  E               Read / close a note
  ESC             Pause menu (settings, resume, quit)
  Z               God mode (testing: invulnerable, no-clip, fly)


═══════════════════════════════════════════════════════════════════
  GAME MECHANICS
═══════════════════════════════════════════════════════════════════

SANITY
  • Drains in darkness - faster when a Watcher is close
  • Restored by matches, lamps and your flashlight
  • Low sanity warps your vision, fills the halls with phantom
    footsteps and shows you eyes that aren't there
  • Game over at 0%

STAMINA
  • Depletes while sprinting; exhausted until it recovers to 30%

FLASHLIGHT
  • Drains battery while on, flickers when nearly dead
  • Batteries (+50%) are scattered through the maze

MATCHES
  • 5 per level; matchboxes (+2) can be found
  • Burn for a few seconds, restore sanity, terrify Watchers

MONSTERS

  Level 1: THE WATCHERS
    - Gaunt figures with wide, flared heads and burning eyes
    - Only move when you're not looking at them
    - Hunt by sight and by sound - sprinting draws them in
    - Navigate the maze to reach you; more join the hunt over time
    - Flee in terror from a lit match
    - Death on contact

  Level 2: THE ANGELS
    - Towering, robed, with tattered wings and a broken halo
    - The opposite of the Watchers: they CHARGE while you look at them,
      faster the longer you stare, and freeze when you look away
    - Their halos glimmer through the fog - a warning not to look
    - Sacred relics restore sanity and slow them for 10 seconds


═══════════════════════════════════════════════════════════════════
  LEVEL DETAILS
═══════════════════════════════════════════════════════════════════

LEVEL 1: THE MAZE
  A procedurally generated labyrinth of stained concrete halls,
  hanging lamps and scrawled warnings. Find a green EXIT door.

LEVEL 2: THE LOST FOREST
  A moonlit hedge maze drowned in fog, full of ruins and stone angel
  statues. Reach the pillar of golden light.


═══════════════════════════════════════════════════════════════════
  FEATURES
═══════════════════════════════════════════════════════════════════

Graphics
  ✓ Procedural PBR textures (colour, normal and roughness maps)
  ✓ HDR rendering with bloom, ACES tone mapping and film grain
  ✓ Sanity-driven distortion, chromatic aberration and heartbeat pulse
  ✓ Shadowed flashlight with lag/sway, first-person flashlight & match
  ✓ Animated monster models, moonlight shadows, drifting ground fog
  ✓ Heading-up minimap that reveals only where you've been

Performance
  ✓ Walls merged into culled chunks; forest drawn with chunked instancing
  ✓ Fixed light budget (lamps share a pool of real lights)
  ✓ Grid-based line of sight & collision, shader-animated particles
  ✓ Dynamic resolution keeps the frame rate smooth
  ✓ Low / Medium / High quality presets

Settings
  ✓ Music & effects volume, mouse sensitivity, field of view,
    brightness and graphics quality (saved between sessions)


═══════════════════════════════════════════════════════════════════
  PROJECT STRUCTURE
═══════════════════════════════════════════════════════════════════

  index.html        Page layout: menus, HUD, overlays
  style.css         All styling
  js/util.js        Math, tileable noise, geometry helpers
  js/textures.js    Procedural texture generation
  js/audio.js       Music, sound effects, positional voices
  js/postfx.js      Bloom / tone mapping / screen effects
  js/world.js       Maze generation, collision, line of sight, pathfinding
  js/models.js      Watcher, Angel, props, first-person models
  js/level1.js      Level 1 construction
  js/level2.js      Level 2 construction
  js/monsters.js    Watcher & Angel behaviour
  js/hud.js         HUD, minimap, notes, loading screen
  js/menu.js        Title screen background & menu music
  js/lore.js        Note texts
  js/main.js        Game flow, player, input, rendering
  audio/            Sound effects and music
  images/           Jumpscare images


═══════════════════════════════════════════════════════════════════
  TECHNICAL INFORMATION
═══════════════════════════════════════════════════════════════════

Engine:        Three.js r128 (WebGL)
Textures:      Procedurally generated (Canvas API)
Audio:         Web Audio API + MP3 files
Controls:      Pointer Lock API

Browser Requirements:
  • Modern browser with WebGL (hardware acceleration recommended)


═══════════════════════════════════════════════════════════════════
  CREDITS
═══════════════════════════════════════════════════════════════════

Engine:       Three.js (threejs.org)
Graphics:     Procedural texture generation
Sound:        Web Audio API
Inspiration:  Silent Hill, Weeping Angels (Doctor Who)

Created as a psychological horror experience.
