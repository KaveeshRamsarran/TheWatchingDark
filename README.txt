╔════════════════════════════════════════════════════════════════╗
║                    THE WATCHING DARK                           ║
║              A Psychological Horror Maze Adventure             ║
╚════════════════════════════════════════════════════════════════╝

Navigate pitch-black corridors haunted by grotesque creatures. Your sanity
crumbles in darkness. Your only salvation: light, speed, and survival instinct.

Five nightmarish levels await. Can you escape?

THE STORY
  Two years ago your mother, Dr. Helena Marsh, took a research post at a
  government facility out past the reservoir. Her letters stopped. Three
  weeks ago your little sister Ellie went after her, and never came back.
  Then, at 3:14 this morning, a voicemail from Ellie's number...
  (A short intro tells it when you start a new game - SPACE / click to
  move it on, ESC or SKIP to go straight in.)


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
  F               Toggle flashlight (limited battery)
  C               Crouch (slow, but almost silent)
  RMB (hold) / Q  Raise the camcorder (Level IV)
  SPACE           Light a match (Watchers flee from fire)
  E               Read / close a note (the game pauses while you read)
  ESC             Pause menu (settings, resume, quit)
  ALT+ENTER       Toggle fullscreen (also on the title screen, pause menu & settings)
  Z               God mode (testing: invulnerable, no-clip, fly)
  `  (backquote)  Debug console: jump to any level, god mode, refills,
                  "ending eye" / "ending light" to watch an ending,
                  "scare" to be caught by the nearest monster
                  (also in the pause menu; type help for commands)


═══════════════════════════════════════════════════════════════════
  PLAYING ON A PHONE OR TABLET
═══════════════════════════════════════════════════════════════════

  Touch controls appear automatically on touch screens. Hold the
  phone sideways.

  LEFT THUMB      Drag anywhere on the left half: move (push to the edge to run)
  LIGHT / CROUCH  Left edge, just above the joystick
  RIGHT THUMB     Drag anywhere else: look around
  MATCH           Bottom-right corner; CAM appears above it on Level IV
  Tap prompt      Read a note; tap the note to close it
  II (top)        Pause (debug console is in the pause menu)
  [ ] (top)       Fullscreen again, if it was lost (not on iPhone: use
                  Add to Home Screen)

  Graphics default to LOW on phones, and the levels build lighter there
  (phones keep the anti-aliasing but skip the light-in-the-air and contact
  shadow effects). The game measures the screen's refresh rate and aims for
  it (up to 120 fps), trading resolution - then light in the air, contact
  shadows, bloom, shadows and particles - to hold it.
  Debug console > SHOW FPS shows the frame rate. (iPhone Safari caps every
  web page at 60 fps, 30 in Low Power Mode.)

  HOSTING IT FOR YOUR PHONE
  It is a static website - any static host works.
  - GitHub Pages: repo Settings > Pages > Deploy from a branch >
    main, / (root). Then open https://<user>.github.io/<repo>/
  - Same Wi-Fi, no hosting: run  python -m http.server 8000  in this
    folder and open http://<your PC's IP>:8000 on the phone.
  - Add to Home Screen (Safari: Share > Add to Home Screen; Chrome:
    menu > Add to Home screen) to launch it fullscreen in landscape.


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
    - Starved, hunched giants: a row of spines down the back, shoulder
      blades jutting through the hide, arms so long the claws hang past
      their knees, and a skull face - burning pinpoints deep in empty
      sockets, and a grin torn open to the ears, full of needle teeth
    - They move in a jerky, stop-motion gait; the jaw unhinges as they close in
    - Only move when you're not looking at them
    - Hunt by sight and by sound - sprinting draws them in
    - Navigate the maze to reach you; more join the hunt over time
    - Flee in terror from a lit match
    - Death on contact

  Level 2: THE ANGELS
    - Biblically accurate: burning wheels within wheels, every rim crowded
      with eyes, turning around one vast eye, inside six wings that are
      covered in eyes too. The robed statues in the forest are only what
      people remember of them.
    - Unwatched, they hang utterly still. Look at one and it all begins to
      turn - the wheels spin and burn white-hot, the great eye opens wide
    - The opposite of the Watchers: they CHARGE while you look at them,
      faster the longer you stare, and freeze when you look away
    - Their halos glimmer through the fog - a warning not to look
    - Sacred relics restore sanity and slow them for 10 seconds

  Level 3: THE DROWNED
    - They crawl. Pale, waterlogged things on all fours, elbows and knees
      jutting up like a spider's, the eyeless head hanging low with its
      jaw open and its long black hair trailing through the water
    - Completely blind
    - Hunt by SOUND alone: walking carries ~2 rooms, sprinting the whole
      level, crouching only reaches something right beside you
    - Deep pools (dark water, blue on the minimap) slow you down and
      make every step louder; striking a match is loud too
    - When they hear you they go to where the sound came from - move
      away quietly and they'll find nothing. Listen for their clicking.

  Level 4: THE UNSEEN
    - Patients in torn hospital gowns, necks broken so the head lies on
      one shoulder - no eyes, skin grown over the sockets, the mouth
      stretched open in a scream
    - Exist only on camera: invisible to the naked eye
    - Through the night-vision camcorder they freeze in frame; lower it
      and they move. Static (and a tearing picture) means one is close
    - But don't film one for too long: they get used to the lens. Its head
      starts to twitch - then it walks toward you even on camera, and it
      never stops. Glance, don't stare.
    - The camera drains its battery while raised; spare cells are
      scattered around (+35%)

  Level 5: THE WATCHING DARK
    - Almost nothing hunts here any more - a couple of Watchers and
      Angels linger. The rest climbed out; that's why you met them above.
    - The walls are alive, and they breathe - harder with every heartbeat.
      Eyes grow in them: they stare at you, and roll back white when you
      look at them. Being watched wears you down.
    - Arms reach out of the walls and up out of the floor. If one gets
      hold of you, you can barely drag yourself free - and it hurts your
      mind. Faces and whole bodies strain out through the skin as you
      pass, crying out.
    - A woman in a stained dress stands in the corridors, back turned.
      Sometimes she is behind you.
    - An eye hangs in the void above. Staring at it shreds your sanity.
      When it blinks, the world goes dark - and changes.
    - At the heart, the game tells you to look at it. You don't have to.
      Words flash across your sight - LOOK UP, WATCH ME, STARE AT ME -
      faster the deeper it has you. There are two endings (spoilers below,
      under LEVEL 5).

  WHEN THEY CATCH YOU
    You see it happen - each creature plays out its own kill before the
    scream: the Watcher wrenches you round to face it and unhinges its
    jaw; the Angel comes down to you and you fall into its eye; the
    Drowned drags you down to the water, rears up face to face and pulls
    you under; and when an Unseen gets you, the camcorder drops to the
    floor and keeps recording as it crouches down to the lens.


═══════════════════════════════════════════════════════════════════
  LEVEL DETAILS
═══════════════════════════════════════════════════════════════════

LEVEL 1: THE MAZE
  A procedurally generated labyrinth of stained concrete halls,
  hanging lamps and scrawled warnings. Find a green EXIT door.

LEVEL 2: THE LOST FOREST
  A moonlit hedge maze in a meadow of long grass, drowned in fog so thick
  you can barely see a few metres - only the Angels' halos glimmer through it. Reach the pillar
  of golden light.

LEVEL 3: THE HOLDING TANKS
  Shaw's laboratory under the reservoir, flooded to the shins: tiled lab
  halls full of glass tanks, their green glow almost the only light - and
  whole banks of them flicker and die. Pale shapes float in some tanks
  and turn their heads to follow you. Some tanks were drained from the
  inside, handprints on the glass. Something you saw in a tank may be
  gone when you come back. Find the stairs up without being heard.

LEVEL 4: THE OBSERVATION WING
  Where they filmed them: black-padded soundstages, each with a perfect
  1950s home on it - a living room, a kitchen, a bedroom - with no fourth
  wall, under dead stage lights and buzzing ON AIR signs. The crew are
  mannequins, and through the lens they look exactly like the Unseen.
  Lower the camera: the mannequins are still there. The Unseen are not.
  No flashlight - only a night-vision camcorder. Find a green EXIT door.

LEVEL 5: THE WATCHING DARK
  Not a maze: one long descent through breathing flesh, spiralling in
  toward the heart beneath the eye. A heartbeat shakes the walls, faster
  the deeper you go. At the heart there is no door - only the eye,
  waiting for you to look back.

  THE TWO ENDINGS (spoilers)
    THE WATCHING DARK - hold the eye's gaze until the ring fills. It
      pulls you in, and when your eye opens again you are looking down
      on the maze from above, at a stranger with a flashlight.
    DAYLIGHT - the notes say the light at the heart is real. A shaft of
      grey daylight falls on the far side of the chamber. Stand in it and
      keep your eyes down: the eye drags your head up toward it and
      pleads with you through the HUD, the women close in - don't look.
      Hold out and the light carries you up to the surface at dawn.
    The end screen counts how many endings you've found.

NOTES
  30 notes are scattered through the five levels, telling the story of
  Dr. Shaw, Helena Marsh and her daughter Ellie. Your total is shown
  on the death and victory screens.


═══════════════════════════════════════════════════════════════════
  FEATURES
═══════════════════════════════════════════════════════════════════

Graphics
  ✓ Procedural PBR textures (colour, normal and roughness maps)
  ✓ HDR rendering with bloom, ACES tone mapping and film grain
  ✓ Volumetric light: the flashlight, lamps and flames light up the dust in
    the air, and walls and pillars cut real shadow shafts through the beam
  ✓ Ambient occlusion: contact shadows in corners and under objects
  ✓ FXAA anti-aliasing; on High the nearest hanging lamp casts shadows
  ✓ Sanity-driven distortion, chromatic aberration and heartbeat pulse
  ✓ Shadowed flashlight with lag/sway, first-person flashlight & match
  ✓ Rigged, skinned creatures modelled in Blender - the Watcher, the
    crawling Drowned and the Unseen each have their own body and gait
  ✓ Gnarled forest trees modelled in Blender
  ✓ Detailed first-person flashlight with knurled grip and reflector
  ✓ Moonlight shadows, drifting ground fog
  ✓ Fields of real grass blades that sway in the wind (Level 2, the ending)
  ✓ Heading-up minimap that reveals only where you've been

Performance
  ✓ Walls merged into culled chunks; forest drawn with chunked instancing
  ✓ Fixed light budget (lamps share a pool of real lights)
  ✓ Grid-based line of sight & collision, shader-animated particles
  ✓ Dynamic resolution keeps the frame rate smooth
  ✓ Low / Medium / High quality presets
      Low:    no shadows or bloom, anti-aliasing only (phones)
      Medium: + shadows, bloom, volumetric light, ambient occlusion
      High:   + full resolution, finer volumetrics, shadowed lamps

Settings
  ✓ Music & effects volume, mouse sensitivity,
    brightness and graphics quality (saved between sessions)


═══════════════════════════════════════════════════════════════════
  PROJECT STRUCTURE
═══════════════════════════════════════════════════════════════════

  index.html        Page layout: menus, HUD, overlays
  style.css         All styling
  js/util.js        Math, tileable noise, geometry helpers
  js/textures.js    Procedural texture generation
  js/grass.js       Instanced, wind-swept grass that follows the camera
  js/audio.js       Music, sound effects, positional voices
  js/postfx.js      Volumetric light, ambient occlusion, FXAA, bloom,
                    tone mapping and screen effects
  js/world.js       Maze generation, collision, line of sight, pathfinding
  js/models.js      Watcher, Drowned (crawler) and Unseen, the Angels and
                    their statues, eye, props, first-person models
  js/props.js       Places and batches the Blender-built props (tanks,
                    specimens, 1950s furniture, studio gear)
  js/facility.js    Shared builder for the indoor maze levels (walls,
                    lamps, decals, pickups, notes, exit doors)
  js/level1.js      Level 1 construction
  js/level2.js      Level 2 construction
  js/level3.js      Level 3: the holding tanks (water, deep pools, tank
                    banks that fail, specimens that watch - and leave)
  js/level4.js      Level 4: the studio (soundstages, 1950s sets, the
                    mannequin crew, ON AIR signs, monitors)
  js/level5.js      Level 5: living walls, wall eyes, arms, the woman,
                    the great blink and the final gaze
  js/monsters.js    Watcher, Angel, Drowned & Unseen behaviour
  js/deaths.js      The death scenes: each monster's kill, played in-engine
  js/hud.js         HUD, minimap, notes, loading screen
  js/menu.js        Title screen background & menu music
  js/lore.js        Note texts
  js/main.js        Game flow, player, input, rendering
  js/assets.js      Embedded 3D models (GENERATED - see below)
  js/assetloader.js Loads the embedded models
  tools/blender/    Blender scripts that build the models: build_models.py
                    (statue Angel, the woman, the things in the walls, trees,
                    flashlight, Watcher jumpscare image) and creatures.py
                    (the Watcher, the Unseen and the crawling Drowned),
                    props.py (holding tanks, specimens, set furniture
                    and studio gear)
  tools/pack_assets.mjs  Packs exported models into js/assets.js
  audio/            Sound effects and music
  images/           Jumpscare images


═══════════════════════════════════════════════════════════════════
  REBUILDING THE MODELS
═══════════════════════════════════════════════════════════════════

  blender -b --factory-startup --python tools/blender/build_models.py -- tools/build
  node tools/pack_assets.mjs tools/build js/assets.js

  Add "preview" after the output folder to also render preview images, and
  "watcher", "unseen", "crawler", "monsters" (all three), "props", "trees",
  "flashlight", "angel", "figure", "flesh" or "creatures" (angel + figure
  + flesh) after that to rebuild just those.

  The jumpscare image is rendered from the Watcher model into the build
  folder; copy it to images/watcher_jumpscare.png:
  blender -b --factory-startup --python tools/blender/build_models.py -- tools/build nopreview jumpscare


═══════════════════════════════════════════════════════════════════
  TECHNICAL INFORMATION
═══════════════════════════════════════════════════════════════════

Engine:        Three.js r128 (WebGL) + GLTFLoader / SkeletonUtils
Models:        Blender 5.2 (procedural Python build script)
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
