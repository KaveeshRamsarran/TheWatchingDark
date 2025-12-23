// THE WATCHING DARK - A 3D psychological horror game
// Player must navigate dark corridors in first-person while shadow creatures hunt them
// Sanity drains in darkness, matches provide temporary light

const container = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const deathScreen = document.getElementById('death-screen');
const victoryScreen = document.getElementById('victory-screen');

// Three.js setup
let scene, camera, renderer;
let maze, shadows = [];
let angels = []; // Level 2 monsters
let weepingAngel = null; // Special monster that follows player but stops when looked at
let matchLight, ambientLight, flashlight;
let monsterGlows = []; // Red glow lights for each monster
let clock = new THREE.Clock();
let skybox = null; // For Level 2 outdoor environment

// Game state
const game = {
    running: false,
    paused: false,
    currentLevel: 1,
    startTime: 0,
    survivalTime: 0,
    pointerLocked: false
};

// Player state
const player = {
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    speed: 0.07,
    sprintSpeed: 0.14,
    sanity: 100,
    matches: 5,
    matchLit: false,
    matchTime: 0,
    matchDuration: 180,
    fear: 0,
    sprinting: false,
    height: 1.6,
    flashlight: false,
    battery: 100,
    batteryDrain: 0.015,
    stamina: 100,
    staminaDrain: 0.12,
    staminaRegen: 0.35,
    godMode: false, // Testing mode - press Z to toggle
    noiseLevel: 0, // 0-100 scale, monsters detect above 30
    noisePosition: null, // Last position where noise was made
    noiseDecay: 0.5 // How fast noise fades per frame
};

// Sound system
const sounds = {
    ambient: null,
    heartbeat: null,
    footstepAudio: null, // MP3 file for footsteps
    breathing: null,
    matchLight: null,
    matchLightAudio: null, // MP3 file for match lighting
    batteryPickupAudio: null, // MP3 file for battery pickup
    flashlightToggle: null,
    shadowHunt: null,
    shadowIdle: null,
    lowSanity: null,
    soundtrack: null,
    ambience2: null // Random ambient sounds
};

let audioContext;
let footstepTimer = 0;

// Camera bob for walking
let bobTimer = 0;
const bobSpeed = 0.08;
const bobAmount = 0.08;

// Controls
const keys = {};
const mouse = { x: 0, y: 0 };
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;

// Maze data
const mazeData = [];
const mazeSize = 30;
const cellSize = 8;
let exitCell = null;
let walls = [];
let floor, ceiling;
let matchPickups = [];
let wallMaterial; // Store wall material for reuse
let lightSources = []; // Track light sources in maze
let batteryPickups = []; // Track battery pickups
let pillars = []; // Track pillars for collision
let exitCells = []; // Multiple exit doors

// Particles
const particleSystems = [];

// Monster footstep sounds
const monsterFootsteps = [];

// Low sanity overlapping footsteps (creates illusion of multiple monsters)
const lowSanityFootsteps = [];
const MAX_LOW_SANITY_FOOTSTEPS = 4; // Number of overlapping footstep sounds

// Note system
let noteObject = null;
let noteObjects = []; // Array to hold multiple notes in level 2
let notePickedUp = false;
let noteScreenVisible = false;

// Settings system
const gameSettings = {
    musicVolume: 0.3, // Default 30%
    sfxVolume: 0.75, // Default 75%
    cameraSensitivity: 0.002 // Default sensitivity
};

// Create sound effects using Web Audio API
function createSounds() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Ambient drone sound
    sounds.ambient = createDrone(60, 0.03);
    sounds.ambient.loop = true;
    
    // Heartbeat sound
    sounds.heartbeat = createHeartbeat();
    
    // Heavy breathing
    sounds.breathing = createBreathing();
}

function createDrone(frequency, volume) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    return { oscillator, gainNode, start: () => oscillator.start(), stop: () => oscillator.stop() };
}

function createHeartbeat() {
    return {
        play: (rate = 1) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(100, audioContext.currentTime);
            gain.gain.setValueAtTime(0.15, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1 / rate);
            
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.start();
            osc.stop(audioContext.currentTime + 0.1 / rate);
        }
    };
}

function createBreathing() {
    return {
        play: (intensity = 1) => {
            const noise = audioContext.createBufferSource();
            const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.5, audioContext.sampleRate);
            const data = buffer.getChannelData(0);
            
            for (let i = 0; i < buffer.length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            noise.buffer = buffer;
            
            const filter = audioContext.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 800;
            
            const gain = audioContext.createGain();
            gain.gain.setValueAtTime(0.05 * intensity, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioContext.destination);
            
            noise.start();
            noise.stop(audioContext.currentTime + 0.5);
        }
    };
}

function playFootstep() {
    // Use different footstep sounds based on level
    const footstepFile = game.currentLevel === 2 ? 'grass.mp3' : 'footsteps.mp3';
    
    // Initialize looping footstep audio - recreate if wrong file
    if (!sounds.footstepAudio || !sounds.footstepAudio.src.includes(footstepFile.replace('.mp3', ''))) {
        // Stop old footstep if it exists
        if (sounds.footstepAudio) {
            sounds.footstepAudio.pause();
            sounds.footstepAudio = null;
        }
        sounds.footstepAudio = new Audio('audio/' + footstepFile);
        sounds.footstepAudio.loop = true;
        sounds.footstepAudio.volume = 1.0 * gameSettings.sfxVolume;
    }
    
    // Initialize match lighting audio
    if (!sounds.matchLightAudio) {
        sounds.matchLightAudio = new Audio('audio/lighting a match.mp3');
        sounds.matchLightAudio.volume = 0.5 * gameSettings.sfxVolume;
    }
    
    // Initialize low sanity overlapping footsteps
    if (lowSanityFootsteps.length === 0) {
        for (let i = 0; i < MAX_LOW_SANITY_FOOTSTEPS; i++) {
            const footstep = new Audio('audio/footsteps.mp3');
            footstep.loop = true;
            footstep.volume = 0;
            footstep.playbackRate = 0.95 + (Math.random() * 0.1); // Slight variation in speed
            lowSanityFootsteps.push(footstep);
        }
    }
    
    // Start playing if not already
    if (sounds.footstepAudio.paused) {
        sounds.footstepAudio.play().catch(e => console.log('Footstep error:', e));
    }
}

function stopFootstep() {
    if (sounds.footstepAudio && !sounds.footstepAudio.paused) {
        sounds.footstepAudio.pause();
        sounds.footstepAudio.currentTime = 0;
    }
}

function updateLowSanityFootsteps() {
    // When sanity is below 30, play overlapping footsteps to simulate multiple monsters
    if (player.sanity < 30) {
        const intensity = 1 - (player.sanity / 30); // 0 to 1, higher when sanity is lower
        
        lowSanityFootsteps.forEach((footstep, index) => {
            // Resume audio context if needed
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
            // Calculate volume for this footstep layer
            // Each layer adds to the cacophony as sanity drops
            const layerThreshold = index / MAX_LOW_SANITY_FOOTSTEPS;
            if (intensity > layerThreshold) {
                const layerIntensity = (intensity - layerThreshold) * MAX_LOW_SANITY_FOOTSTEPS;
                footstep.volume = Math.min(0.6, layerIntensity * 0.4) * gameSettings.sfxVolume; // Cap at 0.6 per layer
                
                // Vary playback rate slightly over time for unsettling effect
                footstep.playbackRate = 0.92 + (Math.sin(Date.now() / 1000 + index) * 0.08);
                
                // Start playing with slight offset
                if (footstep.paused) {
                    setTimeout(() => {
                        footstep.play().catch(e => console.log('Low sanity footstep error:', e));
                    }, index * 250); // Stagger start times
                }
            } else {
                // Stop this layer if sanity is too high
                if (!footstep.paused) {
                    footstep.pause();
                    footstep.currentTime = 0;
                }
            }
        });
    } else {
        // Stop all low sanity footsteps when sanity is >= 30
        lowSanityFootsteps.forEach(footstep => {
            if (!footstep.paused) {
                footstep.pause();
                footstep.currentTime = 0;
            }
        });
    }
}

function playMatchLight() {
    // Resume audio context if suspended (prevents freeze)
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // Play match lighting MP3
    if (sounds.matchLightAudio) {
        sounds.matchLightAudio.currentTime = 0;
        sounds.matchLightAudio.play().catch(e => console.log('Match sound error:', e));
    }
}

function toggleFlashlight() {
    if (player.battery > 0 || player.flashlight) {
        player.flashlight = !player.flashlight;
        console.log('Flashlight toggled:', player.flashlight);
        if (player.flashlight && player.battery > 0) {
            // Immediately set flashlight on
            flashlight.intensity = 8 + (4 * (player.battery / 100));
            flashlight.visible = true;
            console.log('Flashlight ON - intensity:', flashlight.intensity);
        } else {
            flashlight.intensity = 0;
            flashlight.visible = false;
            console.log('Flashlight OFF');
        }
        playFlashlightClick();
    }
}

function playFlashlightClick() {
    // Resume audio context if suspended (prevents freeze)
    if (!audioContext) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.02);
    
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.04);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start();
    osc.stop(audioContext.currentTime + 0.04);
}

function playShadowSound(hunting = false) {
    // TV STATIC sound for monsters
    const bufferSize = audioContext.sampleRate * (hunting ? 0.4 : 0.3);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate white noise (TV static)
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1);
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    // Band-pass filter for TV static feel
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hunting ? 3000 : 2000;
    filter.Q.value = 2;
    
    // Add low frequency rumble for scarier effect
    const lowFilter = audioContext.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 500;
    
    const gain = audioContext.createGain();
    const intensity = hunting ? 0.15 : 0.08;
    gain.gain.setValueAtTime(intensity, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + (hunting ? 0.4 : 0.3));
    
    // Split signal for richer sound
    source.connect(filter);
    source.connect(lowFilter);
    filter.connect(gain);
    lowFilter.connect(gain);
    gain.connect(audioContext.destination);
    
    source.start();
}

function playStaticSound(intensity = 0.5) {
    const bufferSize = audioContext.sampleRate * 0.3;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * intensity;
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.08 * intensity, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    source.start();
}

// Helper function to check if a position is valid (not in wall)
function isValidSpawnPosition(x, z) {
    const testPosition = new THREE.Vector3(x, 1.5, z);
    const checkRadius = 2.0; // Much larger radius to ensure clear space
    
    // Check against all walls with expanded collision
    for (const wall of walls) {
        if (wall) {
            const box = new THREE.Box3().setFromObject(wall);
            // Expand the box to add padding
            box.expandByScalar(1.5);
            const sphere = new THREE.Sphere(testPosition, checkRadius);
            
            if (box.intersectsSphere(sphere)) {
                return false;
            }
        }
    }
    
    // Stricter edge boundary checks
    const minDistanceFromEdge = 4.0;
    if (x < minDistanceFromEdge || x > (mazeSize * cellSize) - minDistanceFromEdge) return false;
    if (z < minDistanceFromEdge || z > (mazeSize * cellSize) - minDistanceFromEdge) return false;
    
    return true;
}

// Initialize Three.js
function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    // Volumetric exponential fog - denser and more atmospheric
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.055);
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    
    // Set initial spawn position - will be validated after maze is built
    camera.position.set(8, player.height, 8);
    
    // Create note near spawn describing the Watchers
    const noteGeometry = new THREE.BoxGeometry(0.3, 0.4, 0.05);
    const noteMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffcc,
        emissive: 0x888844,
        emissiveIntensity: 0.3
    });
    noteObject = new THREE.Mesh(noteGeometry, noteMaterial);
    noteObject.position.set(10, 0.5, 10); // Near spawn at (8, 8)
    noteObject.rotation.y = Math.PI / 4;
    scene.add(noteObject);
    
    // Add glow to note
    const noteGlow = new THREE.PointLight(0xffffaa, 1, 5);
    noteGlow.position.copy(noteObject.position);
    scene.add(noteGlow);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0a0a0a);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    // Lighting - base ambient light (increased for natural visibility)
    ambientLight = new THREE.AmbientLight(0x404050, 0.6);
    scene.add(ambientLight);
    
    // Match light - yellow flickering
    matchLight = new THREE.PointLight(0xffdd44, 0, 18);
    matchLight.castShadow = true;
    matchLight.shadow.camera.near = 0.1;
    matchLight.shadow.camera.far = 18;
    scene.add(matchLight);
    
    // Flashlight (spotlight) - bright and focused
    flashlight = new THREE.SpotLight(0xffffee, 10, 45, Math.PI / 6, 0.25, 0.8);
    flashlight.castShadow = true;
    flashlight.shadow.camera.near = 0.1;
    flashlight.shadow.camera.far = 40;
    flashlight.shadow.mapSize.width = 1024;
    flashlight.shadow.mapSize.height = 1024;
    scene.add(flashlight);
    scene.add(flashlight.target);
}

// Generate maze using recursive backtracking
function generateMaze() {
    // Initialize grid
    for (let x = 0; x < mazeSize; x++) {
        mazeData[x] = [];
        for (let z = 0; z < mazeSize; z++) {
            mazeData[x][z] = {
                visited: false,
                walls: { north: true, south: true, east: true, west: true }
            };
        }
    }
    
    // Recursive backtracking
    const stack = [];
    let current = { x: 0, z: 0 };
    mazeData[0][0].visited = true;
    
    while (true) {
        const neighbors = [];
        const dirs = [
            { dx: 0, dz: -1, wall: 'north', opposite: 'south' },
            { dx: 0, dz: 1, wall: 'south', opposite: 'north' },
            { dx: 1, dz: 0, wall: 'east', opposite: 'west' },
            { dx: -1, dz: 0, wall: 'west', opposite: 'east' }
        ];
        
        for (const dir of dirs) {
            const nx = current.x + dir.dx;
            const nz = current.z + dir.dz;
            if (nx >= 0 && nx < mazeSize && nz >= 0 && nz < mazeSize && !mazeData[nx][nz].visited) {
                neighbors.push({ x: nx, z: nz, dir });
            }
        }
        
        if (neighbors.length > 0) {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            stack.push(current);
            
            mazeData[current.x][current.z].walls[next.dir.wall] = false;
            mazeData[next.x][next.z].walls[next.dir.opposite] = false;
            mazeData[next.x][next.z].visited = true;
            
            current = { x: next.x, z: next.z };
        } else if (stack.length > 0) {
            current = stack.pop();
        } else {
            break;
        }
    }
    
    // Create open areas (rooms) by removing interior walls
    const numRooms = 10 + Math.floor(Math.random() * 8); // 10-17 rectangular rooms
    for (let i = 0; i < numRooms; i++) {
        // Random room position and size
        const roomX = 1 + Math.floor(Math.random() * (mazeSize - 12));
        const roomZ = 1 + Math.floor(Math.random() * (mazeSize - 12));
        const roomWidth = 4 + Math.floor(Math.random() * 8); // 4-11 cells wide (larger rooms)
        const roomHeight = 4 + Math.floor(Math.random() * 8); // 4-11 cells tall (larger rooms)
        
        // Remove interior walls in this room
        for (let rx = roomX; rx < Math.min(roomX + roomWidth, mazeSize - 1); rx++) {
            for (let rz = roomZ; rz < Math.min(roomZ + roomHeight, mazeSize - 1); rz++) {
                // Remove east and south walls to create open space
                if (rx < roomX + roomWidth - 1) {
                    mazeData[rx][rz].walls.east = false;
                    if (rx + 1 < mazeSize) mazeData[rx + 1][rz].walls.west = false;
                }
                if (rz < roomZ + roomHeight - 1) {
                    mazeData[rx][rz].walls.south = false;
                    if (rz + 1 < mazeSize) mazeData[rx][rz + 1].walls.north = false;
                }
            }
        }
    }
    
    // Create circular open areas
    const numCircularRooms = 5 + Math.floor(Math.random() * 5); // 5-9 circular areas
    for (let i = 0; i < numCircularRooms; i++) {
        const centerX = 3 + Math.floor(Math.random() * (mazeSize - 6));
        const centerZ = 3 + Math.floor(Math.random() * (mazeSize - 6));
        const radius = 2 + Math.floor(Math.random() * 4); // Radius of 2-5 cells
        
        // Remove walls in circular pattern
        for (let x = centerX - radius; x <= centerX + radius; x++) {
            for (let z = centerZ - radius; z <= centerZ + radius; z++) {
                if (x >= 0 && x < mazeSize && z >= 0 && z < mazeSize) {
                    const dist = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
                    if (dist <= radius) {
                        // Remove all interior walls
                        if (x < mazeSize - 1) {
                            mazeData[x][z].walls.east = false;
                            mazeData[x + 1][z].walls.west = false;
                        }
                        if (z < mazeSize - 1) {
                            mazeData[x][z].walls.south = false;
                            mazeData[x][z + 1].walls.north = false;
                        }
                    }
                }
            }
        }
    }
    
    // Create curved corridors by carving winding paths
    const numCurvedCorridors = 8 + Math.floor(Math.random() * 6); // 8-13 curved corridors
    for (let i = 0; i < numCurvedCorridors; i++) {
        let x = Math.floor(Math.random() * mazeSize);
        let z = Math.floor(Math.random() * mazeSize);
        const length = 6 + Math.floor(Math.random() * 12); // Corridor length
        let direction = Math.floor(Math.random() * 4); // 0=N, 1=E, 2=S, 3=W
        
        for (let step = 0; step < length; step++) {
            // Randomly curve the corridor (30% chance each step)
            if (Math.random() < 0.3) {
                direction = (direction + (Math.random() < 0.5 ? 1 : 3)) % 4; // Turn left or right
            }
            
            // Carve the corridor in current direction
            let nx = x;
            let nz = z;
            let wall = '';
            let oppositeWall = '';
            
            if (direction === 0) { // North
                nz = z - 1;
                wall = 'north';
                oppositeWall = 'south';
            } else if (direction === 1) { // East
                nx = x + 1;
                wall = 'east';
                oppositeWall = 'west';
            } else if (direction === 2) { // South
                nz = z + 1;
                wall = 'south';
                oppositeWall = 'north';
            } else { // West
                nx = x - 1;
                wall = 'west';
                oppositeWall = 'east';
            }
            
            // Check bounds and carve
            if (nx >= 0 && nx < mazeSize && nz >= 0 && nz < mazeSize) {
                mazeData[x][z].walls[wall] = false;
                mazeData[nx][nz].walls[oppositeWall] = false;
                x = nx;
                z = nz;
            } else {
                break; // Hit boundary, stop this corridor
            }
        }
    }
    
    // Place exits at two corners
    exitCells = [
        { x: mazeSize - 1, z: mazeSize - 1 }, // Far corner
        { x: 0, z: mazeSize - 1 } // Left far corner
    ];
    exitCell = exitCells[0]; // Keep for compatibility
    
    // ENSURE PATH EXISTS - Use flood fill to verify connectivity
    // If no path exists, carve a guaranteed route to first exit
    if (!isPathExists(0, 0, exitCells[0].x, exitCells[0].z)) {
        carvePathToExit();
    }
}

// Check if a path exists between two points using flood fill
function isPathExists(startX, startZ, endX, endZ) {
    const visited = new Set();
    const queue = [{x: startX, z: startZ}];
    visited.add(`${startX},${startZ}`);
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        if (current.x === endX && current.z === endZ) {
            return true; // Found path to exit
        }
        
        // Check all four directions
        const directions = [
            { dx: 0, dz: -1, wall: 'north' },
            { dx: 0, dz: 1, wall: 'south' },
            { dx: 1, dz: 0, wall: 'east' },
            { dx: -1, dz: 0, wall: 'west' }
        ];
        
        for (const dir of directions) {
            const nx = current.x + dir.dx;
            const nz = current.z + dir.dz;
            const key = `${nx},${nz}`;
            
            // Check if we can move in this direction (no wall and not visited)
            if (nx >= 0 && nx < mazeSize && nz >= 0 && nz < mazeSize &&
                !visited.has(key) && !mazeData[current.x][current.z].walls[dir.wall]) {
                visited.add(key);
                queue.push({x: nx, z: nz});
            }
        }
    }
    
    return false; // No path found
}

// Carve a guaranteed path from start to exit
function carvePathToExit() {
    let x = 0;
    let z = 0;
    
    // Carve path moving right and down towards exit
    while (x < exitCell.x || z < exitCell.z) {
        // Randomly choose to move right or down (if possible)
        const canMoveRight = x < exitCell.x;
        const canMoveDown = z < exitCell.z;
        
        if (canMoveRight && canMoveDown) {
            // Randomly choose direction
            if (Math.random() < 0.5) {
                // Move right
                mazeData[x][z].walls.east = false;
                mazeData[x + 1][z].walls.west = false;
                x++;
            } else {
                // Move down
                mazeData[x][z].walls.south = false;
                mazeData[x][z + 1].walls.north = false;
                z++;
            }
        } else if (canMoveRight) {
            // Can only move right
            mazeData[x][z].walls.east = false;
            mazeData[x + 1][z].walls.west = false;
            x++;
        } else {
            // Can only move down
            mazeData[x][z].walls.south = false;
            mazeData[x][z + 1].walls.north = false;
            z++;
        }
    }
}

// Build 3D maze geometry
function buildMaze() {
    walls = [];
    
    // Create textured wall material
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = 256;
    wallCanvas.height = 256;
    const wallCtx = wallCanvas.getContext('2d');
    
    // Base dark grey flesh-like texture
    wallCtx.fillStyle = '#1a1a1a';
    wallCtx.fillRect(0, 0, 256, 256);
    
    // Create organic flesh-like texture with veins and irregular patterns
    for (let i = 0; i < 300; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const size = 5 + Math.random() * 15;
        
        // Random grey tones for flesh
        const grey = 20 + Math.random() * 30;
        wallCtx.fillStyle = `rgba(${grey}, ${grey}, ${grey}, ${0.3 + Math.random() * 0.4})`;
        
        // Irregular organic shapes
        wallCtx.beginPath();
        wallCtx.arc(x, y, size, 0, Math.PI * 2);
        wallCtx.fill();
    }
    
    // Add vein-like structures
    for (let i = 0; i < 50; i++) {
        const startX = Math.random() * 256;
        const startY = Math.random() * 256;
        const endX = startX + (Math.random() - 0.5) * 100;
        const endY = startY + (Math.random() - 0.5) * 100;
        
        // Darker grey veins
        const veinGrey = 10 + Math.random() * 15;
        wallCtx.strokeStyle = `rgba(${veinGrey}, ${veinGrey}, ${veinGrey}, 0.6)`;
        wallCtx.lineWidth = 1 + Math.random() * 2;
        wallCtx.beginPath();
        wallCtx.moveTo(startX, startY);
        wallCtx.lineTo(endX, endY);
        wallCtx.stroke();
    }
    
    // Add darker blotches for depth
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const size = 3 + Math.random() * 8;
        
        const darkGrey = Math.random() * 15;
        wallCtx.fillStyle = `rgba(${darkGrey}, ${darkGrey}, ${darkGrey}, 0.5)`;
        wallCtx.beginPath();
        wallCtx.arc(x, y, size, 0, Math.PI * 2);
        wallCtx.fill();
    }
    
    const wallTexture = new THREE.CanvasTexture(wallCanvas);
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(2, 2);
    
    wallMaterial = new THREE.MeshStandardMaterial({ 
        map: wallTexture,
        roughness: 0.7,
        metalness: 0.1,
        emissive: 0x0a0a0a,
        emissiveIntensity: 0.2
    });
    
    const wallHeight = 12;
    const wallThickness = 0.3;
    
    for (let x = 0; x < mazeSize; x++) {
        for (let z = 0; z < mazeSize; z++) {
            const cell = mazeData[x][z];
            const px = x * cellSize;
            const pz = z * cellSize;
            
            // North wall
            if (cell.walls.north) {
                const geometry = new THREE.BoxGeometry(cellSize + wallThickness, wallHeight, wallThickness);
                const wall = new THREE.Mesh(geometry, wallMaterial);
                wall.position.set(px, wallHeight / 2, pz - cellSize / 2);
                wall.castShadow = true;
                wall.receiveShadow = true;
                scene.add(wall);
                walls.push(wall);
            }
            
            // South wall
            if (cell.walls.south) {
                const geometry = new THREE.BoxGeometry(cellSize + wallThickness, wallHeight, wallThickness);
                const wall = new THREE.Mesh(geometry, wallMaterial);
                wall.position.set(px, wallHeight / 2, pz + cellSize / 2);
                wall.castShadow = true;
                wall.receiveShadow = true;
                scene.add(wall);
                walls.push(wall);
            }
            
            // East wall
            if (cell.walls.east) {
                const geometry = new THREE.BoxGeometry(wallThickness, wallHeight, cellSize + wallThickness);
                const wall = new THREE.Mesh(geometry, wallMaterial);
                wall.position.set(px + cellSize / 2, wallHeight / 2, pz);
                wall.castShadow = true;
                wall.receiveShadow = true;
                scene.add(wall);
                walls.push(wall);
            }
            
            // West wall
            if (cell.walls.west) {
                const geometry = new THREE.BoxGeometry(wallThickness, wallHeight, cellSize + wallThickness);
                const wall = new THREE.Mesh(geometry, wallMaterial);
                wall.position.set(px - cellSize / 2, wallHeight / 2, pz);
                wall.castShadow = true;
                wall.receiveShadow = true;
                scene.add(wall);
                walls.push(wall);
            }
        }
    }
    
    // Add curved wall segments for aesthetic variation
    const numCurvedWalls = 12 + Math.floor(Math.random() * 8); // 12-19 curved walls
    for (let i = 0; i < numCurvedWalls; i++) {
        const cx = (Math.random() * (mazeSize - 2) + 1) * cellSize;
        const cz = (Math.random() * (mazeSize - 2) + 1) * cellSize;
        const radius = cellSize * (1.5 + Math.random() * 2); // Radius of curve
        const startAngle = Math.random() * Math.PI * 2;
        const arcLength = Math.PI * 0.3 + Math.random() * Math.PI * 0.4; // 54-126 degrees
        
        // Create curved wall using tube geometry
        const curve = new THREE.EllipseCurve(
            cx, cz, // center
            radius, radius, // x radius, y radius
            startAngle, startAngle + arcLength, // start angle, end angle
            false, // clockwise
            0 // rotation
        );
        
        const points = curve.getPoints(20); // Get points along curve
        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < points.length; j++) {
            shape.lineTo(points[j].x, points[j].y);
        }
        
        // Create path for tube
        const path3D = new THREE.CurvePath();
        const curvePath = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(points[0].x, wallHeight / 2, points[0].y),
            new THREE.Vector3(points[Math.floor(points.length / 2)].x, wallHeight / 2, points[Math.floor(points.length / 2)].y),
            new THREE.Vector3(points[points.length - 1].x, wallHeight / 2, points[points.length - 1].y)
        );
        
        // Use lathe to create curved wall segments
        for (let j = 0; j < points.length - 1; j++) {
            const segmentGeometry = new THREE.BoxGeometry(
                wallThickness,
                wallHeight,
                Math.sqrt((points[j+1].x - points[j].x)**2 + (points[j+1].y - points[j].y)**2)
            );
            const curvedWall = new THREE.Mesh(segmentGeometry, wallMaterial);
            const angle = Math.atan2(points[j+1].y - points[j].y, points[j+1].x - points[j].x);
            curvedWall.rotation.y = -angle + Math.PI / 2;
            curvedWall.position.set(
                (points[j].x + points[j+1].x) / 2,
                wallHeight / 2,
                (points[j].y + points[j+1].y) / 2
            );
            curvedWall.castShadow = true;
            curvedWall.receiveShadow = true;
            scene.add(curvedWall);
            walls.push(curvedWall);
        }
    }
    
    // Floor - bloody, fleshy organic texture
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const floorCtx = floorCanvas.getContext('2d');
    
    // Base dark blood red color
    floorCtx.fillStyle = '#1a0808';
    floorCtx.fillRect(0, 0, 512, 512);
    
    // Fleshy tissue layers - gradient patches (darker tones)
    for (let i = 0; i < 40; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 60 + Math.random() * 120;
        
        const gradient = floorCtx.createRadialGradient(x, y, 0, x, y, size);
        const fleshTone = Math.random();
        if (fleshTone < 0.33) {
            // Dark bloody flesh
            gradient.addColorStop(0, 'rgba(70, 20, 25, 0.7)');
            gradient.addColorStop(0.5, 'rgba(45, 12, 15, 0.5)');
            gradient.addColorStop(1, 'rgba(25, 8, 8, 0)');
        } else if (fleshTone < 0.66) {
            // Very dark muscle tissue
            gradient.addColorStop(0, 'rgba(55, 12, 15, 0.8)');
            gradient.addColorStop(0.5, 'rgba(35, 8, 10, 0.5)');
            gradient.addColorStop(1, 'rgba(20, 5, 5, 0)');
        } else {
            // Darker exposed tissue
            gradient.addColorStop(0, 'rgba(80, 30, 35, 0.6)');
            gradient.addColorStop(0.5, 'rgba(50, 18, 22, 0.4)');
            gradient.addColorStop(1, 'rgba(30, 10, 10, 0)');
        }
        floorCtx.fillStyle = gradient;
        floorCtx.beginPath();
        floorCtx.arc(x, y, size, 0, Math.PI * 2);
        floorCtx.fill();
    }
    
    // Veins and capillaries network
    for (let i = 0; i < 80; i++) {
        let x = Math.random() * 512;
        let y = Math.random() * 512;
        const veinColor = Math.random() < 0.5 ? 
            `rgba(${100 + Math.random() * 50}, ${10 + Math.random() * 20}, ${20 + Math.random() * 15}, ${0.6 + Math.random() * 0.3})` :
            `rgba(${60 + Math.random() * 30}, ${5 + Math.random() * 10}, ${15 + Math.random() * 10}, ${0.5 + Math.random() * 0.4})`;
        
        floorCtx.strokeStyle = veinColor;
        floorCtx.lineWidth = 1 + Math.random() * 3;
        floorCtx.beginPath();
        floorCtx.moveTo(x, y);
        
        // Branching vein pattern
        const segments = 5 + Math.floor(Math.random() * 8);
        for (let s = 0; s < segments; s++) {
            const nextX = x + (Math.random() - 0.5) * 60;
            const nextY = y + (Math.random() - 0.5) * 60;
            floorCtx.quadraticCurveTo(
                x + (Math.random() - 0.5) * 30,
                y + (Math.random() - 0.5) * 30,
                nextX, nextY
            );
            x = nextX;
            y = nextY;
        }
        floorCtx.stroke();
        
        // Small capillary branches
        for (let b = 0; b < 3; b++) {
            const branchX = x + (Math.random() - 0.5) * 40;
            const branchY = y + (Math.random() - 0.5) * 40;
            floorCtx.lineWidth = 0.5 + Math.random() * 1;
            floorCtx.beginPath();
            floorCtx.moveTo(x, y);
            floorCtx.lineTo(branchX, branchY);
            floorCtx.stroke();
        }
    }
    
    // Large blood pools with coagulated edges
    for (let i = 0; i < 25; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 40 + Math.random() * 80;
        
        // Fresh blood pool
        const bloodGradient = floorCtx.createRadialGradient(x, y, 0, x, y, size);
        bloodGradient.addColorStop(0, 'rgba(130, 10, 15, 0.9)');
        bloodGradient.addColorStop(0.6, 'rgba(80, 5, 10, 0.7)');
        bloodGradient.addColorStop(1, 'rgba(40, 0, 5, 0.3)');
        
        floorCtx.fillStyle = bloodGradient;
        floorCtx.beginPath();
        // Irregular blob shape
        for (let a = 0; a < Math.PI * 2; a += 0.3) {
            const radius = size * (0.7 + Math.random() * 0.4);
            const px = x + Math.cos(a) * radius;
            const py = y + Math.sin(a) * radius;
            if (a === 0) floorCtx.moveTo(px, py);
            else floorCtx.lineTo(px, py);
        }
        floorCtx.closePath();
        floorCtx.fill();
        
        // Splatter around pool
        for (let j = 0; j < 15; j++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = size + Math.random() * 40;
            const splatterX = x + Math.cos(angle) * dist;
            const splatterY = y + Math.sin(angle) * dist;
            const splatterSize = 2 + Math.random() * 6;
            
            floorCtx.fillStyle = `rgba(${100 + Math.random() * 30}, 5, 10, ${0.5 + Math.random() * 0.4})`;
            floorCtx.beginPath();
            floorCtx.arc(splatterX, splatterY, splatterSize, 0, Math.PI * 2);
            floorCtx.fill();
        }
    }
    
    // Fleshy bumps and nodules
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 3 + Math.random() * 12;
        
        const bumpGradient = floorCtx.createRadialGradient(x - size*0.3, y - size*0.3, 0, x, y, size);
        bumpGradient.addColorStop(0, 'rgba(160, 80, 85, 0.8)');
        bumpGradient.addColorStop(0.5, 'rgba(100, 40, 45, 0.6)');
        bumpGradient.addColorStop(1, 'rgba(60, 20, 25, 0.3)');
        
        floorCtx.fillStyle = bumpGradient;
        floorCtx.beginPath();
        floorCtx.arc(x, y, size, 0, Math.PI * 2);
        floorCtx.fill();
    }
    
    // Torn flesh and wounds
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const length = 20 + Math.random() * 50;
        const angle = Math.random() * Math.PI;
        
        // Dark wound opening
        floorCtx.strokeStyle = 'rgba(20, 0, 5, 0.9)';
        floorCtx.lineWidth = 3 + Math.random() * 5;
        floorCtx.beginPath();
        floorCtx.moveTo(x, y);
        floorCtx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        floorCtx.stroke();
        
        // Pink flesh edges
        floorCtx.strokeStyle = 'rgba(150, 60, 70, 0.7)';
        floorCtx.lineWidth = 1 + Math.random() * 2;
        floorCtx.beginPath();
        floorCtx.moveTo(x + 2, y + 2);
        floorCtx.lineTo(x + Math.cos(angle) * length + 2, y + Math.sin(angle) * length + 2);
        floorCtx.stroke();
    }
    
    // Glistening wet highlights
    for (let i = 0; i < 60; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 1 + Math.random() * 4;
        
        floorCtx.fillStyle = `rgba(200, 150, 155, ${0.2 + Math.random() * 0.3})`;
        floorCtx.beginPath();
        floorCtx.arc(x, y, size, 0, Math.PI * 2);
        floorCtx.fill();
    }
    
    // Load floor texture
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(mazeSize * 2, mazeSize * 2);
    
    const floorGeometry = new THREE.PlaneGeometry(mazeSize * cellSize * 1.5, mazeSize * cellSize * 1.5);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        map: floorTexture,
        roughness: 0.7,
        emissive: 0x0a0a0a,
        emissiveIntensity: 0.2
    });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((mazeSize * cellSize) / 2 - cellSize / 2, 0, (mazeSize * cellSize) / 2 - cellSize / 2);
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Ceiling - bloody, dripping, nasty texture
    const ceilingCanvas = document.createElement('canvas');
    ceilingCanvas.width = 512;
    ceilingCanvas.height = 512;
    const ceilingCtx = ceilingCanvas.getContext('2d');
    
    // Base pitch black
    ceilingCtx.fillStyle = '#0a0000';
    ceilingCtx.fillRect(0, 0, 512, 512);
    
    // Large blood stains dripping from above
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 40 + Math.random() * 100;
        
        // Dark blood stains
        const redVal = 30 + Math.random() * 40;
        ceilingCtx.fillStyle = `rgba(${redVal}, ${Math.random() * 5}, 0, ${0.6 + Math.random() * 0.3})`;
        
        ceilingCtx.beginPath();
        ceilingCtx.arc(x, y, size, 0, Math.PI * 2);
        ceilingCtx.fill();
        
        // Drip trails downward
        for (let j = 0; j < 8; j++) {
            const dripX = x + (Math.random() - 0.5) * size;
            const dripLength = 20 + Math.random() * 80;
            
            ceilingCtx.strokeStyle = `rgba(${redVal + 20}, 0, 0, ${0.5 + Math.random() * 0.4})`;
            ceilingCtx.lineWidth = 2 + Math.random() * 5;
            ceilingCtx.beginPath();
            ceilingCtx.moveTo(dripX, y + size/2);
            ceilingCtx.lineTo(dripX + (Math.random() - 0.5) * 10, y + size/2 + dripLength);
            ceilingCtx.stroke();
            
            // Drip droplet at end
            ceilingCtx.fillStyle = `rgba(${80 + Math.random() * 50}, 0, 0, 0.8)`;
            ceilingCtx.beginPath();
            ceilingCtx.arc(dripX, y + size/2 + dripLength, 3 + Math.random() * 4, 0, Math.PI * 2);
            ceilingCtx.fill();
        }
    }
    
    // Streaks and smears
    for (let i = 0; i < 120; i++) {
        const startX = Math.random() * 512;
        const startY = Math.random() * 512;
        const length = 30 + Math.random() * 100;
        const angle = Math.random() * Math.PI * 2;
        
        ceilingCtx.strokeStyle = `rgba(${40 + Math.random() * 30}, ${Math.random() * 8}, 0, ${0.3 + Math.random() * 0.4})`;
        ceilingCtx.lineWidth = 3 + Math.random() * 8;
        ceilingCtx.beginPath();
        ceilingCtx.moveTo(startX, startY);
        ceilingCtx.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
        ceilingCtx.stroke();
    }
    
    // Decay patches and mold
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 10 + Math.random() * 40;
        
        // Greenish-brown decay
        const decayVal = Math.random() * 15;
        ceilingCtx.fillStyle = `rgba(${decayVal}, ${decayVal + 5}, 0, ${0.3 + Math.random() * 0.3})`;
        ceilingCtx.beginPath();
        ceilingCtx.arc(x, y, size, 0, Math.PI * 2);
        ceilingCtx.fill();
    }
    
    // Fresh blood splatters
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        
        // Central splatter
        ceilingCtx.fillStyle = `rgba(${100 + Math.random() * 50}, 0, 0, ${0.5 + Math.random() * 0.4})`;
        ceilingCtx.beginPath();
        ceilingCtx.arc(x, y, 3 + Math.random() * 6, 0, Math.PI * 2);
        ceilingCtx.fill();
        
        // Spray pattern
        for (let j = 0; j < 6; j++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 5 + Math.random() * 20;
            const splatterX = x + Math.cos(angle) * dist;
            const splatterY = y + Math.sin(angle) * dist;
            
            ceilingCtx.fillStyle = `rgba(${80 + Math.random() * 40}, 0, 0, ${Math.random() * 0.5})`;
            ceilingCtx.beginPath();
            ceilingCtx.arc(splatterX, splatterY, 1 + Math.random() * 3, 0, Math.PI * 2);
            ceilingCtx.fill();
        }
    }
    
    const ceilingTexture = new THREE.CanvasTexture(ceilingCanvas);
    ceilingTexture.wrapS = THREE.RepeatWrapping;
    ceilingTexture.wrapT = THREE.RepeatWrapping;
    ceilingTexture.repeat.set(mazeSize, mazeSize);
    
    const ceilingGeometry = new THREE.PlaneGeometry(mazeSize * cellSize * 1.5, mazeSize * cellSize * 1.5);
    const ceilingMaterial = new THREE.MeshStandardMaterial({ 
        map: ceilingTexture,
        side: THREE.DoubleSide
    });
    ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((mazeSize * cellSize) / 2 - cellSize / 2, wallHeight, (mazeSize * cellSize) / 2 - cellSize / 2);
    scene.add(ceiling);
    
    // Create exit doors (multiple)
    for (const exit of exitCells) {
        const doorGroup = new THREE.Group();
        
        // Door frame
        const frameMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x2a4a2a,
            roughness: 0.7,
            metalness: 0.3
        });
        
        const leftFrame = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 3.5, 0.3),
            frameMaterial
        );
        leftFrame.position.set(-1.2, 1.75, 0);
        doorGroup.add(leftFrame);
        
        const rightFrame = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 3.5, 0.3),
            frameMaterial
        );
        rightFrame.position.set(1.2, 1.75, 0);
        doorGroup.add(rightFrame);
        
        const topFrame = new THREE.Mesh(
            new THREE.BoxGeometry(2.7, 0.3, 0.3),
            frameMaterial
        );
        topFrame.position.set(0, 3.5, 0);
        doorGroup.add(topFrame);
        
        // Door itself
        const doorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1a3a1a,
            roughness: 0.8,
            metalness: 0.2,
            emissive: 0x00ff00,
            emissiveIntensity: 0.2
        });
        
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(2.1, 3.2, 0.2),
            doorMaterial
        );
        door.position.set(0, 1.6, 0);
        doorGroup.add(door);
        
        // Door handle
        const handleMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x888888,
            roughness: 0.3,
            metalness: 0.9
        });
        const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8),
            handleMaterial
        );
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.8, 1.6, 0.15);
        doorGroup.add(handle);
        
        // Position door at exit
        doorGroup.position.set(
            exit.x * cellSize,
            0,
            exit.z * cellSize
        );
        scene.add(doorGroup);
        
        // Add glow effect around door
        const glowGeometry = new THREE.PlaneGeometry(4, 4);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.set(
            exit.x * cellSize,
            2,
            exit.z * cellSize
        );
        scene.add(glow);
        
        // Add exit light
        const exitLight = new THREE.PointLight(0x00ff00, 0.5, 15);
        exitLight.position.set(exit.x * cellSize, 2, exit.z * cellSize);
        scene.add(exitLight);
    }
    
    // Add decorative objects throughout maze
    addMazeDecor();
    
    // Add light sources throughout maze (only in level 1)
    if (game.currentLevel !== 2) {
        addLightSources();
        
        // Add battery pickups
        addBatteryPickups();
    }
}

// Add light sources throughout maze
function addLightSources() {
    lightSources = [];
    
    // Skip light sources in Level 2
    if (game.currentLevel === 2) {
        return;
    }
    
    // Add 8-12 light sources randomly
    const numLights = 8 + Math.floor(Math.random() * 5);
    
    for (let i = 0; i < numLights; i++) {
        // Find random cell - ensure it's within valid bounds
        let lx, lz, attempts = 0;
        do {
            lx = 2 + Math.floor(Math.random() * (mazeSize - 4)); // Keep away from edges
            lz = 2 + Math.floor(Math.random() * (mazeSize - 4));
            attempts++;
        } while (((lx === 0 && lz === 0) || (lx === exitCell.x && lz === exitCell.z)) && attempts < 100);
        
        const px = lx * cellSize;
        const pz = lz * cellSize;
        const ceilingHeight = 12; // Ceiling is at wallHeight = 12
        
        // Create SPOTLIGHT (conical from ceiling to floor) - MUCH BRIGHTER AND LARGER
        const light = new THREE.SpotLight(0xff8844, 8.0, 50, Math.PI / 3, 0.2, 0.5);
        light.position.set(px, ceilingHeight - 0.2, pz); // Just below ceiling surface
        light.castShadow = true;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        scene.add(light);
        
        // Spotlight target (pointing down)
        const target = new THREE.Object3D();
        target.position.set(px, 0, pz);
        scene.add(target);
        light.target = target;
        
        // Add visible bulb at ceiling - LARGER AND BRIGHTER
        const bulbGeometry = new THREE.SphereGeometry(0.35, 12, 12);
        const bulbMaterial = new THREE.MeshBasicMaterial({
            color: 0xffcc66,
            emissive: 0xffcc66,
            emissiveIntensity: 8
        });
        const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
        bulb.position.set(px, ceilingHeight - 0.2, pz); // Just below ceiling surface
        scene.add(bulb);
        
        // Add glow effect around bulb - MUCH LARGER GLOW
        const glowGeometry = new THREE.SphereGeometry(1.0, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa44,
            transparent: true,
            opacity: 0.7
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.set(px, ceilingHeight - 0.2, pz);
        scene.add(glow);
        
        lightSources.push({
            light: light,
            target: target,
            bulb: bulb,
            glow: glow,
            position: new THREE.Vector3(px, 2, pz) // Mid-height position for distance checks
        });
    }
}

// Add battery pickups
function addBatteryPickups() {
    batteryPickups = [];
    
    // In Level 2, create sacred relics instead of batteries
    if (game.currentLevel === 2) {
        const numRelics = 3 + Math.floor(Math.random() * 2); // 3-4 relics
        
        for (let i = 0; i < numRelics; i++) {
            let bx, bz, attempts = 0;
            do {
                bx = 2 + Math.floor(Math.random() * (mazeSize - 4));
                bz = 2 + Math.floor(Math.random() * (mazeSize - 4));
                attempts++;
            } while (((bx === 0 && bz === 0) || (bx === exitCell.x && bz === exitCell.z)) && attempts < 100);
            
            const px = bx * cellSize;
            const pz = bz * cellSize;
            
            // Create sacred relic (glowing lantern)
            const baseGeometry = new THREE.CylinderGeometry(0.2, 0.25, 0.3, 6);
            const baseMaterial = new THREE.MeshStandardMaterial({
                color: 0xffd700,
                emissive: 0xffaa00,
                emissiveIntensity: 0.7,
                metalness: 0.8,
                roughness: 0.2
            });
            const base = new THREE.Mesh(baseGeometry, baseMaterial);
            base.position.set(px, 0.5, pz);
            base.castShadow = true;
            scene.add(base);
            
            // Glowing orb on top
            const orbGeometry = new THREE.SphereGeometry(0.15, 8, 8);
            const orbMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffaa,
                emissive: 0xffffaa,
                emissiveIntensity: 1.5
            });
            const orb = new THREE.Mesh(orbGeometry, orbMaterial);
            orb.position.set(px, 0.8, pz);
            scene.add(orb);
            
            // Bright glow effect
            const glowGeometry = new THREE.SphereGeometry(0.5, 8, 8);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffaa,
                transparent: true,
                opacity: 0.4
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            glow.position.set(px, 0.6, pz);
            scene.add(glow);
            
            // Strong point light
            const light = new THREE.PointLight(0xffffaa, 1, 8);
            light.position.set(px, 0.6, pz);
            scene.add(light);
            
            batteryPickups.push({
                battery: base,
                glow: glow,
                light: light,
                orb: orb,
                position: new THREE.Vector3(px, 0.5, pz),
                collected: false,
                isRelic: true // Mark as sacred relic
            });
        }
        return;
    }
    
    // Add 4-6 battery pickups
    const numBatteries = 4 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < numBatteries; i++) {
        // Find random cell - ensure it's within valid bounds
        let bx, bz, attempts = 0;
        do {
            bx = 2 + Math.floor(Math.random() * (mazeSize - 4)); // Keep away from edges
            bz = 2 + Math.floor(Math.random() * (mazeSize - 4));
            attempts++;
        } while (((bx === 0 && bz === 0) || (bx === exitCell.x && bz === exitCell.z)) && attempts < 100);
        
        const px = bx * cellSize;
        const pz = bz * cellSize;
        
        // Create battery geometry (cylinder)
        const batteryGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8);
        const batteryMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            emissive: 0x00ff00,
            emissiveIntensity: 0.5,
            metalness: 0.6,
            roughness: 0.3
        });
        const battery = new THREE.Mesh(batteryGeometry, batteryMaterial);
        battery.position.set(px, 0.4, pz);
        battery.castShadow = true;
        scene.add(battery);
        
        // Add glow
        const glowGeometry = new THREE.SphereGeometry(0.4, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.set(px, 0.4, pz);
        scene.add(glow);
        
        // Small point light
        const light = new THREE.PointLight(0x00ff00, 0.3, 4);
        light.position.set(px, 0.4, pz);
        scene.add(light);
        
        batteryPickups.push({
            battery: battery,
            glow: glow,
            light: light,
            position: new THREE.Vector3(px, 0.4, pz),
            collected: false
        });
    }
}

// Add decorative objects to make maze more interesting
function addMazeDecor() {
    pillars = [];
    
    // Add only pillars that go from floor to ceiling - use wall material
    for (let x = 1; x < mazeSize - 1; x++) {
        for (let z = 1; z < mazeSize - 1; z++) {
            // Skip start and exit cells
            if ((x === 0 && z === 0) || (x === exitCell.x && z === exitCell.z)) continue;
            
            const random = Math.random();
            const px = x * cellSize;
            const pz = z * cellSize;
            
            if (random < 0.15) {
                // Pillar from floor to ceiling (12 units tall) - uses wall texture
                const geometry = new THREE.CylinderGeometry(0.25, 0.3, 12, 8);
                const pillar = new THREE.Mesh(geometry, wallMaterial);
                pillar.position.set(
                    px + (Math.random() - 0.5) * 2.5,
                    6, // Half of 12 to center the pillar
                    pz + (Math.random() - 0.5) * 2.5
                );
                pillar.castShadow = true;
                pillar.receiveShadow = true;
                scene.add(pillar);
                pillars.push(pillar);
            }
        }
    }
    
    // Add THICK pillars in open areas for Level 1
    if (game.currentLevel === 1) {
        const numThickPillars = 8 + Math.floor(Math.random() * 5); // 8-12 thick pillars
        
        for (let i = 0; i < numThickPillars; i++) {
            let px, pz, attempts = 0;
            let validPosition = false;
            
            do {
                // Random position in open areas
                const x = 2 + Math.floor(Math.random() * (mazeSize - 4));
                const z = 2 + Math.floor(Math.random() * (mazeSize - 4));
                px = x * cellSize;
                pz = z * cellSize;
                
                // Check if in open area (not a wall)
                const inOpenArea = mazeData[x][z] === 0;
                const notAtSpawn = !(x <= 1 && z <= 1);
                const notAtExit = !(Math.abs(x - exitCell.x) < 2 && Math.abs(z - exitCell.z) < 2);
                
                validPosition = inOpenArea && notAtSpawn && notAtExit;
                attempts++;
            } while (!validPosition && attempts < 100);
            
            if (validPosition) {
                // Create THICK pillar (1.0-1.5 unit radius)
                const thickness = 1.0 + Math.random() * 0.5;
                const geometry = new THREE.CylinderGeometry(thickness, thickness * 1.1, 12, 12);
                const pillar = new THREE.Mesh(geometry, wallMaterial);
                pillar.position.set(px, 6, pz);
                pillar.castShadow = true;
                pillar.receiveShadow = true;
                scene.add(pillar);
                pillars.push(pillar);
            }
        }
    }
}

// Create shadow creatures
function createShadows() {
    shadows = [];
    
    const numMonsters = 18 + Math.floor(Math.random() * 5); // 18-22 monsters (doubled)
    
    for (let i = 0; i < numMonsters; i++) {
        // Find random valid position in maze (not in walls)
        let spawnX, spawnZ;
        let attempts = 0;
        let validPosition = false;
        
        do {
            // Choose cells away from edges and start/exit
            const rx = 5 + Math.floor(Math.random() * (mazeSize - 10));
            const rz = 5 + Math.floor(Math.random() * (mazeSize - 10));
            
            // Position in CENTER of cell (avoid walls at cell boundaries)
            // Add offset to ensure it's truly centered and not near walls
            spawnX = rx * cellSize + cellSize * 0.5;
            spawnZ = rz * cellSize + cellSize * 0.5;
            
            // Check if this position is valid (not in a wall)
            // Also check surrounding positions to ensure not too close to walls
            const testPositions = [
                {x: spawnX, z: spawnZ},
                {x: spawnX + 0.5, z: spawnZ},
                {x: spawnX - 0.5, z: spawnZ},
                {x: spawnX, z: spawnZ + 0.5},
                {x: spawnX, z: spawnZ - 0.5}
            ];
            validPosition = testPositions.every(pos => isValidSpawnPosition(pos.x, pos.z));
            attempts++;
        } while (!validPosition && attempts < 1000);
        
        // Create humanoid shadow monster with distinct body parts
        const bodyGroup = new THREE.Group();
        
        const monsterMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x050505,
            transparent: true,
            opacity: 0.95
        });
        
        // Head - slightly elongated skull shape
        const headGeometry = new THREE.SphereGeometry(0.22, 12, 10);
        headGeometry.scale(0.9, 1.2, 0.95);
        const head = new THREE.Mesh(headGeometry, monsterMaterial);
        head.position.y = 2.45;
        bodyGroup.add(head);
        
        // Neck - thin connection
        const neckGeometry = new THREE.CylinderGeometry(0.06, 0.08, 0.25, 8);
        const neck = new THREE.Mesh(neckGeometry, monsterMaterial);
        neck.position.y = 2.15;
        bodyGroup.add(neck);
        
        // Torso - humanoid chest tapering to waist
        const torsoGeometry = new THREE.CylinderGeometry(0.12, 0.22, 0.7, 10);
        const torso = new THREE.Mesh(torsoGeometry, monsterMaterial);
        torso.position.y = 1.75;
        bodyGroup.add(torso);
        
        // Abdomen/waist
        const waistGeometry = new THREE.CylinderGeometry(0.10, 0.12, 0.35, 8);
        const waist = new THREE.Mesh(waistGeometry, monsterMaterial);
        waist.position.y = 1.25;
        bodyGroup.add(waist);
        
        // Pelvis
        const pelvisGeometry = new THREE.CylinderGeometry(0.14, 0.10, 0.25, 8);
        const pelvis = new THREE.Mesh(pelvisGeometry, monsterMaterial);
        pelvis.position.y = 1.0;
        bodyGroup.add(pelvis);
        
        // Left arm - upper arm
        const upperArmGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.55, 8);
        const leftUpperArm = new THREE.Mesh(upperArmGeo, monsterMaterial);
        leftUpperArm.position.set(-0.28, 1.85, 0);
        leftUpperArm.rotation.z = 0.15;
        bodyGroup.add(leftUpperArm);
        
        // Left arm - forearm
        const forearmGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.50, 8);
        const leftForearm = new THREE.Mesh(forearmGeo, monsterMaterial);
        leftForearm.position.set(-0.35, 1.35, 0);
        leftForearm.rotation.z = 0.1;
        bodyGroup.add(leftForearm);
        
        // Left hand with elongated fingers
        const handGeo = new THREE.BoxGeometry(0.08, 0.12, 0.04);
        const leftHand = new THREE.Mesh(handGeo, monsterMaterial);
        leftHand.position.set(-0.38, 1.05, 0);
        bodyGroup.add(leftHand);
        
        // Left fingers (3 long creepy fingers)
        for (let f = 0; f < 3; f++) {
            const fingerGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.18, 6);
            const finger = new THREE.Mesh(fingerGeo, monsterMaterial);
            finger.position.set(-0.38 + (f - 1) * 0.025, 0.90, 0);
            finger.rotation.z = (f - 1) * 0.15;
            bodyGroup.add(finger);
        }
        
        // Right arm - upper arm
        const rightUpperArm = new THREE.Mesh(upperArmGeo, monsterMaterial);
        rightUpperArm.position.set(0.28, 1.85, 0);
        rightUpperArm.rotation.z = -0.15;
        bodyGroup.add(rightUpperArm);
        
        // Right arm - forearm
        const rightForearm = new THREE.Mesh(forearmGeo, monsterMaterial);
        rightForearm.position.set(0.35, 1.35, 0);
        rightForearm.rotation.z = -0.1;
        bodyGroup.add(rightForearm);
        
        // Right hand
        const rightHand = new THREE.Mesh(handGeo, monsterMaterial);
        rightHand.position.set(0.38, 1.05, 0);
        bodyGroup.add(rightHand);
        
        // Right fingers
        for (let f = 0; f < 3; f++) {
            const fingerGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.18, 6);
            const finger = new THREE.Mesh(fingerGeo, monsterMaterial);
            finger.position.set(0.38 + (f - 1) * 0.025, 0.90, 0);
            finger.rotation.z = (f - 1) * -0.15;
            bodyGroup.add(finger);
        }
        
        // Left leg - thigh
        const thighGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.55, 8);
        const leftThigh = new THREE.Mesh(thighGeo, monsterMaterial);
        leftThigh.position.set(-0.10, 0.78, 0);
        bodyGroup.add(leftThigh);
        
        // Left leg - shin
        const shinGeo = new THREE.CylinderGeometry(0.04, 0.055, 0.55, 8);
        const leftShin = new THREE.Mesh(shinGeo, monsterMaterial);
        leftShin.position.set(-0.10, 0.28, 0);
        bodyGroup.add(leftShin);
        
        // Left foot
        const footGeo = new THREE.BoxGeometry(0.08, 0.05, 0.18);
        const leftFoot = new THREE.Mesh(footGeo, monsterMaterial);
        leftFoot.position.set(-0.10, 0.03, 0.04);
        bodyGroup.add(leftFoot);
        
        // Right leg - thigh
        const rightThigh = new THREE.Mesh(thighGeo, monsterMaterial);
        rightThigh.position.set(0.10, 0.78, 0);
        bodyGroup.add(rightThigh);
        
        // Right leg - shin
        const rightShin = new THREE.Mesh(shinGeo, monsterMaterial);
        rightShin.position.set(0.10, 0.28, 0);
        bodyGroup.add(rightShin);
        
        // Right foot
        const rightFoot = new THREE.Mesh(footGeo, monsterMaterial);
        rightFoot.position.set(0.10, 0.03, 0.04);
        bodyGroup.add(rightFoot);
        
        // Shoulders - slight bulk
        const shoulderGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const leftShoulder = new THREE.Mesh(shoulderGeo, monsterMaterial);
        leftShoulder.position.set(-0.24, 2.0, 0);
        bodyGroup.add(leftShoulder);
        
        const rightShoulder = new THREE.Mesh(shoulderGeo, monsterMaterial);
        rightShoulder.position.set(0.24, 2.0, 0);
        bodyGroup.add(rightShoulder);
        
        // Eyes - glowing red, sunken into head
        const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 1.5
        });
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.08, 2.50, 0.15);
        bodyGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.08, 2.50, 0.15);
        bodyGroup.add(rightEye);
        
        // Mouth - dark gash
        const mouthGeo = new THREE.BoxGeometry(0.12, 0.02, 0.05);
        const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x200000 });
        const mouth = new THREE.Mesh(mouthGeo, mouthMaterial);
        mouth.position.set(0, 2.32, 0.18);
        bodyGroup.add(mouth);
        
        const mesh = bodyGroup;
        mesh.position.set(spawnX, 0, spawnZ);
        scene.add(mesh);
        
        // Create footstep audio for this monster
        // Resume audio context to prevent freeze
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const monsterFootstep = new Audio('audio/footsteps.mp3');
        monsterFootstep.loop = true;
        monsterFootstep.volume = 0; // Start silent
        monsterFootsteps.push(monsterFootstep);
        
        // Add dark aura centered on torso
        const auraGeometry = new THREE.SphereGeometry(1.8, 8, 8);
        const auraMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x110011,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const aura = new THREE.Mesh(auraGeometry, auraMaterial);
        aura.position.y = 1.5; // Center on full body height
        mesh.add(aura);
        
        // Particle system for shadow - surrounds entire body
        const particleCount = 100;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        
        for (let j = 0; j < particleCount; j++) {
            // Spread particles in a sphere around the monster's center
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const radius = 1.0 + Math.random() * 1.5; // Radius between 1.0 and 2.5
            positions[j * 3] = Math.sin(phi) * Math.cos(theta) * radius;
            positions[j * 3 + 1] = Math.cos(phi) * radius + 1.5; // Center around body height
            positions[j * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const particleMaterial = new THREE.PointsMaterial({
            color: 0xff0066,
            size: 0.2,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
        mesh.add(particleSystem); // Attach to mesh so it follows the monster
        scene.add(particleSystem);
        
        // Add red glow light to monster
        const monsterGlow = new THREE.PointLight(0xff0033, 0, 8);
        monsterGlow.decay = 2;
        monsterGlow.position.copy(mesh.position);
        scene.add(monsterGlow);
        monsterGlows.push(monsterGlow);
        
        // Vary monster types for more engagement
        const monsterType = i % 3;
        let speed, detection, hearing, size;
        
        if (monsterType === 0) {
            // Fast but less perceptive
            speed = 0.06;
            detection = 12;
            hearing = 20;
            mesh.scale.set(0.8, 0.8, 0.8);
        } else if (monsterType === 1) {
            // Slow but very perceptive
            speed = 0.04;
            detection = 20;
            hearing = 30;
            mesh.scale.set(1.3, 1.3, 1.3);
        } else {
            // Balanced
            speed = 0.05;
            detection = 15;
            hearing = 25;
        }
        
        shadows.push({
            mesh,
            particles: particleSystem,
            velocity: new THREE.Vector3(),
            speed: speed,
            hunting: false,
            detectionRadius: detection,
            hearingRadius: hearing,
            wanderTimer: 0,
            wanderAngle: Math.random() * Math.PI * 2,
            eyes: [leftEye, rightEye],
            type: monsterType,
            glowLight: monsterGlow,
            fleeingFromMatch: false,
            fleeTimer: 0
        });
    }
    
    // Atmospheric particles
    for (let i = 0; i < 5; i++) {
        const particleCount = 200;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        
        for (let j = 0; j < particleCount; j++) {
            positions[j * 3] = Math.random() * mazeSize * cellSize - (mazeSize * cellSize) / 2;
            positions[j * 3 + 1] = Math.random() * 4;
            positions[j * 3 + 2] = Math.random() * mazeSize * cellSize - (mazeSize * cellSize) / 2;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: 0x4444aa,
            size: 0.05,
            transparent: true,
            opacity: 0.3
        });
        const system = new THREE.Points(geometry, material);
        scene.add(system);
        particleSystems.push(system);
    }
    
    // Blood drip particles from ceiling
    const bloodDripCount = 400;
    const bloodGeometry = new THREE.BufferGeometry();
    const bloodPositions = new Float32Array(bloodDripCount * 3);
    const bloodVelocities = [];
    
    for (let i = 0; i < bloodDripCount; i++) {
        bloodPositions[i * 3] = Math.random() * mazeSize * cellSize - (mazeSize * cellSize) / 2;
        bloodPositions[i * 3 + 1] = 4.5; // Start near ceiling
        bloodPositions[i * 3 + 2] = Math.random() * mazeSize * cellSize - (mazeSize * cellSize) / 2;
        bloodVelocities.push(Math.random() * 0.02 + 0.01); // Random fall speed
    }
    
    bloodGeometry.setAttribute('position', new THREE.BufferAttribute(bloodPositions, 3));
    const bloodMaterial = new THREE.PointsMaterial({
        color: 0xffdd00,
        size: 0.15,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });
    const bloodDrips = new THREE.Points(bloodGeometry, bloodMaterial);
    bloodDrips.userData.velocities = bloodVelocities;
    scene.add(bloodDrips);
    particleSystems.push(bloodDrips);
    
    // Subtle floating dust particles around maze walls
    const dustCount = 300;
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    
    for (let i = 0; i < dustCount; i++) {
        dustPositions[i * 3] = Math.random() * mazeSize * cellSize - (mazeSize * cellSize) / 2;
        dustPositions[i * 3 + 1] = Math.random() * 3.5;
        dustPositions[i * 3 + 2] = Math.random() * mazeSize * cellSize - (mazeSize * cellSize) / 2;
    }
    
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.08,
        transparent: true,
        opacity: 0.5
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);
    particleSystems.push(dust);
}

// Validate spawn position after maze is built to ensure no collision with pillars/walls
function validateSpawnPosition() {
    // Check if current camera position is valid
    if (!checkCollision(camera.position)) {
        return; // Already in a good spot
    }
    
    // Try to find a valid spawn position
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
        // Try positions in a grid pattern radiating from center
        const offset = Math.floor(attempts / 4) + 1;
        const direction = attempts % 4;
        
        let testPos = new THREE.Vector3();
        switch(direction) {
            case 0: testPos.set(8 + offset, player.height, 8); break;
            case 1: testPos.set(8 - offset, player.height, 8); break;
            case 2: testPos.set(8, player.height, 8 + offset); break;
            case 3: testPos.set(8, player.height, 8 - offset); break;
        }
        
        // Make sure position is within maze bounds
        if (testPos.x >= 1 && testPos.x < gameSettings.mazeSize - 1 &&
            testPos.z >= 1 && testPos.z < gameSettings.mazeSize - 1) {
            
            if (!checkCollision(testPos)) {
                camera.position.copy(testPos);
                console.log('Found valid spawn position:', testPos);
                return;
            }
        }
        
        attempts++;
    }
    
    // Fallback: place at a known safe position near edge
    camera.position.set(2, player.height, 2);
    console.warn('Could not find ideal spawn, using fallback position');
}

// Start game
function startGame() {
    console.log('Starting game...');
    
    // COMPLETE CLEANUP of menu music to prevent overlap
    if (menuMusic) {
        menuMusic.pause();
        menuMusic.currentTime = 0;
        menuMusic.volume = 0; // Mute it completely
        menuMusic = null; // Clear reference
    }
    menuMusicStarted = false;
    
    startScreen.style.display = 'none';
    game.running = true;
    game.startTime = Date.now();
    
    player.sanity = 100;
    player.matches = 5;
    player.matchLit = false;
    player.fear = 0;
    player.battery = 100;
    player.flashlight = true;
    
    // Wait a moment before starting game sounds to ensure menu music is fully stopped
    setTimeout(() => {
        // Initialize sound
        createSounds();
        sounds.ambient.start();
        
        // Initialize and play soundtrack
        if (!sounds.soundtrack) {
            sounds.soundtrack = new Audio('audio/OST.mp3');
            sounds.soundtrack.loop = true;
            sounds.soundtrack.volume = 0.05; // 5% volume for subtle atmospheric background
        }
        sounds.soundtrack.play().catch(e => console.log('Soundtrack autoplay prevented:', e));
    }, 200); // 200ms delay to ensure clean separation
    
    initThree();
    generateMaze();
    buildMaze();
    
    // Validate and adjust spawn position after maze is built
    validateSpawnPosition();
    
    // Only create shadows (old monsters) in level 1
    if (game.currentLevel === 1) {
        createShadows();
    }
    
    console.log('Scene initialized, camera position:', camera.position);
    console.log('Flashlight setup:', flashlight);
    
    // Turn flashlight on at start
    if (flashlight) {
        flashlight.intensity = 10;
        flashlight.visible = true;
        console.log('Flashlight turned on:', flashlight.intensity);
    }
    
    // Setup pointer lock
    const canvas = renderer.domElement;
    
    canvas.addEventListener('click', () => {
        if (!game.pointerLocked) {
            canvas.requestPointerLock();
        }
    });
    
    document.addEventListener('pointerlockchange', () => {
        game.pointerLocked = document.pointerLockElement === canvas;
        console.log('Pointer lock:', game.pointerLocked);
    });
    
    document.addEventListener('pointerlockerror', () => {
        console.error('Pointer lock error');
    });
    
    gameLoop();
}

// Check collision with walls
function checkCollision(position) {
    // Skip collision in god mode
    if (player.godMode) return false;
    const playerRadius = 0.4;
    
    for (const wall of walls) {
        const box = new THREE.Box3().setFromObject(wall);
        const sphere = new THREE.Sphere(position, playerRadius);
        
        if (box.intersectsSphere(sphere)) {
            return true;
        }
    }
    
    // Check collision with pillars
    for (const pillar of pillars) {
        const box = new THREE.Box3().setFromObject(pillar);
        const sphere = new THREE.Sphere(position, playerRadius);
        
        if (box.intersectsSphere(sphere)) {
            return true;
        }
    }
    
    return false;
}

// Update player movement
function updatePlayer() {
    if (!game.pointerLocked) return;
    
    // Stamina system
    const isMoving = moveForward || moveBackward || moveLeft || moveRight;
    const wantsToSprint = keys['Shift'] && player.sanity > 20 && player.stamina > 0;
    const canSprint = wantsToSprint && isMoving;
    const isSprinting = canSprint;
    let currentSpeed = isSprinting ? player.sprintSpeed : player.speed;
    
    // Slow down when stamina is depleted
    if (player.stamina <= 0 && isMoving) {
        currentSpeed *= 0.5; // Half speed when exhausted
    }
    
    // Update stamina
    if (isSprinting) {
        player.stamina = Math.max(0, player.stamina - player.staminaDrain);
        // Generate noise when sprinting
        player.noiseLevel = Math.min(100, player.noiseLevel + 8);
        player.noisePosition = camera.position.clone();
    } else {
        // Regenerate stamina when not sprinting (slower when moving)
        const regenRate = isMoving ? player.staminaRegen * 0.5 : player.staminaRegen;
        player.stamina = Math.min(100, player.stamina + regenRate);
        // Walking generates less noise
        if (isMoving) {
            player.noiseLevel = Math.min(100, player.noiseLevel + 2);
            player.noisePosition = camera.position.clone();
        }
    }
    
    // Decay noise over time
    player.noiseLevel = Math.max(0, player.noiseLevel - player.noiseDecay);
    
    // God mode speed boost
    if (player.godMode) {
        currentSpeed *= 3;
    }
    
    // Direct movement - no momentum
    const moveVector = new THREE.Vector3();
    camera.getWorldDirection(moveVector);
    
    // In god mode, allow vertical movement; otherwise lock to horizontal
    if (!player.godMode) {
        moveVector.y = 0;
    }
    moveVector.normalize();
    
    const strafeVector = new THREE.Vector3();
    strafeVector.crossVectors(camera.up, moveVector).normalize();
    
    const newPosition = camera.position.clone();
    
    // Apply movement directly
    if (moveForward) {
        newPosition.add(moveVector.multiplyScalar(currentSpeed));
    }
    if (moveBackward) {
        newPosition.add(moveVector.multiplyScalar(-currentSpeed));
    }
    if (moveLeft) {
        newPosition.add(strafeVector.multiplyScalar(currentSpeed));
    }
    if (moveRight) {
        newPosition.add(strafeVector.multiplyScalar(-currentSpeed));
    }
    
    // God mode: Vertical movement with Shift (down) and Space (up)
    if (player.godMode) {
        if (keys['Shift']) {
            newPosition.y -= currentSpeed * 2; // Move down
        }
        if (keys[' ']) {
            newPosition.y += currentSpeed * 2; // Move up
        }
    }
    
    // Check collision
    if (!checkCollision(newPosition)) {
        camera.position.copy(newPosition);
    }
    
    // Sprint effects
    player.sprinting = isSprinting && (moveForward || moveBackward || moveLeft || moveRight);
    if (player.sprinting) {
        player.sanity -= 0.06;
        // FOV kick for sprint
        camera.fov = THREE.MathUtils.lerp(camera.fov, 78, 0.15);
    } else {
        camera.fov = THREE.MathUtils.lerp(camera.fov, 75, 0.15);
    }
    camera.updateProjectionMatrix();
    
    // Flashlight mechanics - disabled in level 2
    if (game.currentLevel !== 2) {
        flashlight.position.copy(camera.position);
        
        const forwardVector = new THREE.Vector3();
        camera.getWorldDirection(forwardVector);
        
        flashlight.target.position.copy(camera.position).add(forwardVector.multiplyScalar(10));
        flashlight.target.updateMatrixWorld();
    }
    
    if (player.flashlight && player.battery > 0 && game.currentLevel !== 2) {
        player.battery -= player.batteryDrain;
        player.battery = Math.max(0, player.battery);
        
        // Keep flashlight bright - minimum 8, max 12
        flashlight.intensity = 8 + (4 * (player.battery / 100));
        flashlight.visible = true;
        
        if (player.battery <= 0) {
            player.flashlight = false;
            flashlight.intensity = 0;
            flashlight.visible = false;
            
            // Play battery depleted sound
            if (audioContext) {
                // Resume audio context to prevent freeze
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400, audioContext.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);
                
                gain.gain.setValueAtTime(0.2, audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                
                osc.connect(gain);
                gain.connect(audioContext.destination);
                
                osc.start();
                osc.stop(audioContext.currentTime + 0.3);
            }
        }
    } else {
        flashlight.intensity = 0;
        flashlight.visible = false;
    }
    
    // Match mechanics
    if (player.matchLit) {
        player.matchTime--;
        matchLight.position.copy(camera.position);
        // Flickering yellow effect
        const flicker = Math.sin(Date.now() / 50) * 1.0 + Math.random() * 1.5;
        matchLight.intensity = 6 + flicker;
        matchLight.distance = 18;
        matchLight.color.setHex(Math.random() > 0.9 ? 0xffaa00 : 0xffdd44);
        
        if (player.matchTime <= 0) {
            player.matchLit = false;
            matchLight.intensity = 0;
        }
    } else {
        matchLight.intensity = 0;
    }
    
    // Footstep sounds and camera bob
    if ((moveForward || moveBackward || moveLeft || moveRight) && game.pointerLocked) {
        // Play looping footsteps
        playFootstep();
        
        // Adjust playback speed based on sprinting
        if (sounds.footstepAudio) {
            sounds.footstepAudio.playbackRate = player.sprinting ? 1.5 : 1.0;
        }
        
        // Camera bob for walking realism
        bobTimer += bobSpeed * (player.sprinting ? 1.5 : 1);
        const bobOffset = Math.sin(bobTimer) * bobAmount;
        camera.position.y = player.height + bobOffset;
    } else {
        // Stop footsteps when not moving
        stopFootstep();
        // Reset camera height when not moving
        camera.position.y += (player.height - camera.position.y) * 0.1;
    }
    
    // Sanity mechanics - different per level
    const nearShadow = shadows.some(s => {
        return camera.position.distanceTo(s.mesh.position) < 8;
    });
    const veryShadowClose = shadows.some(s => {
        return camera.position.distanceTo(s.mesh.position) < 4;
    });
    
    const nearAngel = angels.some(a => {
        return camera.position.distanceTo(a.mesh.position) < 10;
    });
    const veryAngelClose = angels.some(a => {
        return camera.position.distanceTo(a.mesh.position) < 4;
    });
    
    // Level 1: Darkness drains sanity
    if (game.currentLevel === 1) {
        // Light sources affect sanity
        if (player.matchLit) {
            player.sanity = Math.min(100, player.sanity + 0.2); // Matches restore sanity faster
        } else if (player.flashlight && player.battery > 0) {
            player.sanity = Math.min(100, player.sanity + 0.05); // Flashlight slows drain
        } else {
            // Check if near a light source
            let nearLight = false;
            for (const lightSource of lightSources) {
                const dist = camera.position.distanceTo(lightSource.position);
                if (dist < 10) {
                    nearLight = true;
                    player.sanity = Math.min(100, player.sanity + 0.15); // Light sources restore sanity
                    break;
                }
            }
            
            if (!nearLight) {
                // Sanity drains faster in darkness, even faster near shadows
                if (veryShadowClose) {
                    player.sanity -= 0.5; // Very close to shadow
                } else if (nearShadow) {
                    player.sanity -= 0.3; // Near shadow
                } else {
                    player.sanity -= 0.12; // In darkness
                }
            }
        }
        
        // Play heartbeat sound based on fear/darkness
        if (!player.matchLit && (!player.flashlight || player.battery <= 0)) {
            // In darkness - play heartbeat
            if (Math.random() > 0.95) {
                const rate = 1 + player.fear; // Faster at higher fear
                sounds.heartbeat.play(rate);
            }
        } else if (player.sanity < 40) {
            // Low sanity - occasional heartbeat
            if (Math.random() > 0.98) {
                const rate = 1 + (1 - player.sanity / 100);
                sounds.heartbeat.play(rate);
            }
        }
        
        // Ambient light based on sanity
        ambientLight.intensity = 0.6 + (player.sanity / 100) * 0.2;
    }
    // Level 2: Bright environment, sanity only drains near Angels
    else if (game.currentLevel === 2) {
        // In Level 2, sanity slowly regenerates in the light
        player.sanity = Math.min(100, player.sanity + 0.08);
        
        // But drains when near Angels
        if (veryAngelClose) {
            player.sanity -= 0.6; // Very close to angel
        } else if (nearAngel) {
            player.sanity -= 0.35; // Near angel
        }
        
        // Light stays constant in Level 2
        ambientLight.intensity = 1.5;
    }
    
    // Removed annoying heartbeat and breathing sounds
    
    player.sanity = Math.max(0, player.sanity);
    player.fear = 1 - (player.sanity / 100);
    
    // Check if player reached exit door(s)
    // Level 2 only has one exit, Level 1 has two
    const exitsToCheck = game.currentLevel === 2 ? [exitCells[0]] : exitCells;
    for (const exit of exitsToCheck) {
        const exitPos = new THREE.Vector3(exit.x * cellSize, player.height, exit.z * cellSize);
        if (camera.position.distanceTo(exitPos) < 2.5) {
            victory();
            break;
        }
    }
    
    // Death by sanity
    if (player.sanity <= 0 && !player.godMode) {
        gameOver("Your mind shattered in the darkness...");
    }
}

// Update shadows
function updateShadows() {
    // Track closest monster for radio static effect
    let closestMonsterDist = Infinity;
    
    // Check if match is lit and make nearby monsters flee
    const matchFleeRadius = 15; // Monsters within 15 units will flee
    
    for (let i = 0; i < shadows.length; i++) {
        const shadow = shadows[i];
        const dist = camera.position.distanceTo(shadow.mesh.position);
        if (dist < closestMonsterDist) {
            closestMonsterDist = dist;
        }
        
        // Check if player just lit a match nearby
        if (player.matchLit && dist < matchFleeRadius) {
            shadow.fleeingFromMatch = true;
            shadow.fleeTimer = 300; // Flee for 5 seconds (300 frames at 60fps)
        }
        
        // Decrease flee timer
        if (shadow.fleeingFromMatch) {
            shadow.fleeTimer--;
            if (shadow.fleeTimer <= 0) {
                shadow.fleeingFromMatch = false;
            }
        }
        
        // WEEPING ANGEL BEHAVIOR: Check if player is looking at this shadow
        const directionToShadow = new THREE.Vector3();
            directionToShadow.subVectors(shadow.mesh.position, camera.position).normalize();
            
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            
            // Calculate angle between camera direction and direction to shadow
            const angle = cameraDirection.angleTo(directionToShadow);
            
            // Shadow is visible if within 60 degree cone (PI/3 radians) and within 30 units
            const isVisible = angle < Math.PI / 3 && dist < 30;
            
            shadow.frozen = isVisible;
            
            if (!isVisible) {
                // Shadow moves when not being looked at (Weeping Angel behavior)
                if (!shadow.lastUnseenTime) {
                    shadow.lastUnseenTime = Date.now();
                }
                const now = Date.now();
                const timeSinceUnseen = (now - shadow.lastUnseenTime) / 1000;
                
                // If fleeing from match, run AWAY from player
                const direction = new THREE.Vector3();
                if (shadow.fleeingFromMatch) {
                    // Flee away from player at increased speed
                    direction.subVectors(shadow.mesh.position, camera.position).normalize();
                    const fleeSpeed = shadow.speed * 3; // 3x faster when fleeing
                    shadow.velocity.copy(direction.multiplyScalar(fleeSpeed));
                } else {
                    // Check if player is making loud noise (sprinting)
                    const noiseThreshold = 30;
                    let targetPosition = camera.position;
                    
                    if (player.noiseLevel > noiseThreshold && player.noisePosition) {
                        // Move toward the noise source
                        targetPosition = player.noisePosition;
                        shadow.investigatingNoise = true;
                    } else {
                        shadow.investigatingNoise = false;
                    }
                    
                    // Normal behavior: move toward player or noise source
                    direction.subVectors(targetPosition, shadow.mesh.position).normalize();
                    
                    // Speed increases the longer it's unseen (up to 1.5x)
                    let speedMultiplier = Math.min(1.5, 1 + timeSinceUnseen * 0.1);
                    
                    // Move faster when investigating noise
                    if (shadow.investigatingNoise) {
                        speedMultiplier *= 1.3;
                    }
                    
                    shadow.velocity.copy(direction.multiplyScalar(shadow.speed * speedMultiplier));
                }
                
                // Move shadow with collision handling
                const newPos = shadow.mesh.position.clone().add(shadow.velocity);
                newPos.y = 1.5;
                
                if (!checkCollision(newPos)) {
                    shadow.mesh.position.copy(newPos);
                    shadow.particles.position.copy(newPos);
                } else {
                    // If blocked, try navigating around
                    const leftDir = new THREE.Vector3(-direction.z, 0, direction.x);
                    const rightDir = new THREE.Vector3(direction.z, 0, -direction.x);
                    
                    const leftTest = shadow.mesh.position.clone().add(leftDir.multiplyScalar(0.5));
                    const rightTest = shadow.mesh.position.clone().add(rightDir.multiplyScalar(0.5));
                    leftTest.y = 1.5;
                    rightTest.y = 1.5;
                    
                    if (!checkCollision(leftTest)) {
                        shadow.mesh.position.copy(leftTest);
                        shadow.particles.position.copy(leftTest);
                    } else if (!checkCollision(rightTest)) {
                        shadow.mesh.position.copy(rightTest);
                        shadow.particles.position.copy(rightTest);
                    }
                }
                
                // Face player
                shadow.mesh.lookAt(camera.position);
                
                // Monster footstep sounds - louder than player's
                const monsterFootstep = monsterFootsteps[i];
                if (monsterFootstep) {
                    // Resume audio context to prevent freeze
                    if (audioContext && audioContext.state === 'suspended') {
                        audioContext.resume();
                    }
                    
                    // Volume based on distance (inverse relationship)
                    // Max volume at close range, fade out at distance
                    const maxHearDistance = 40;
                    if (dist < maxHearDistance) {
                        // Calculate volume: louder when closer, 4x louder than player's
                        const volumeRatio = 1 - (dist / maxHearDistance);
                        monsterFootstep.volume = Math.min(1.0, volumeRatio * 4.0) * gameSettings.sfxVolume;
                        
                        // Start playing if not already
                        if (monsterFootstep.paused) {
                            monsterFootstep.play().catch(e => console.log('Monster footstep error:', e));
                        }
                    } else {
                        // Too far, stop sound
                        if (!monsterFootstep.paused) {
                            monsterFootstep.pause();
                            monsterFootstep.currentTime = 0;
                        }
                    }
                }
                
                // Eyes glow when moving
                shadow.eyes[0].visible = true;
                shadow.eyes[1].visible = true;
                shadow.eyes[0].material.emissiveIntensity = 3;
                shadow.eyes[1].material.emissiveIntensity = 3;
            } else {
                // FROZEN when being looked at
                shadow.lastUnseenTime = Date.now();
                shadow.velocity.set(0, 0, 0);
                
                // Stop footsteps when frozen
                const monsterFootstep = monsterFootsteps[i];
                if (monsterFootstep && !monsterFootstep.paused) {
                    // Resume audio context before modifying audio
                    if (audioContext && audioContext.state === 'suspended') {
                        audioContext.resume();
                    }
                    monsterFootstep.pause();
                    monsterFootstep.currentTime = 0;
                }
                
                // Eyes still visible but dimmer when frozen
                shadow.eyes[0].visible = true;
                shadow.eyes[1].visible = true;
                shadow.eyes[0].material.emissiveIntensity = 1;
                shadow.eyes[1].material.emissiveIntensity = 1;
            }
        
        // Animate particles
        const positions = shadow.particles.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] += (Math.random() - 0.5) * 0.1;
            positions[i + 1] += (Math.random() - 0.5) * 0.1;
            positions[i + 2] += (Math.random() - 0.5) * 0.1;
            
            // Keep particles near shadow
            const dist = Math.sqrt(positions[i] ** 2 + positions[i + 1] ** 2 + positions[i + 2] ** 2);
            if (dist > 2) {
                positions[i] *= 0.5;
                positions[i + 1] *= 0.5;
                positions[i + 2] *= 0.5;
            }
        }
        shadow.particles.geometry.attributes.position.needsUpdate = true;
        
        // Collision with player
        if (dist < 1.5 && !player.godMode) {
            gameOver("The darkness consumed you...");
        }
    }
}

// Update Weeping Angel - follows player but freezes when looked at
function updateWeepingAngel() {
    if (!weepingAngel) return;
    
    const dist = camera.position.distanceTo(weepingAngel.mesh.position);
    
    // Check if player is looking at the angel
    const directionToAngel = new THREE.Vector3();
    directionToAngel.subVectors(weepingAngel.mesh.position, camera.position).normalize();
    
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // Calculate angle between camera direction and direction to angel
    const angle = cameraDirection.angleTo(directionToAngel);
    
    // Angel is visible if within 60 degree cone (PI/3 radians) and within 30 units
    const isVisible = angle < Math.PI / 3 && dist < 30;
    
    weepingAngel.frozen = isVisible;
    
    if (!isVisible) {
        // Angel moves when not being looked at
        const now = Date.now();
        const timeSinceUnseen = (now - weepingAngel.lastUnseenTime) / 1000;
        
        // ALWAYS move toward player when not seen
        const direction = new THREE.Vector3();
        direction.subVectors(camera.position, weepingAngel.mesh.position).normalize();
        
        // Speed increases the longer it's unseen (up to 1.25x - less aggressive)
        const speedMultiplier = Math.min(1.25, 1 + timeSinceUnseen * 0.08);
        weepingAngel.velocity.copy(direction.multiplyScalar(weepingAngel.speed * speedMultiplier));
        
        // Improved pathfinding - check ahead for obstacles
        const testPos = weepingAngel.mesh.position.clone().add(weepingAngel.velocity.clone().multiplyScalar(3));
        testPos.y = 1.8;
        
        // Move angel with better collision handling and pathfinding
        const newPos = weepingAngel.mesh.position.clone().add(weepingAngel.velocity);
        newPos.y = 1.8;
        
        if (!checkCollision(newPos)) {
            weepingAngel.mesh.position.copy(newPos);
            weepingAngel.particles.position.copy(newPos);
        } else {
            // If blocked, try navigating around like regular monsters
            const leftDir = new THREE.Vector3(-direction.z, 0, direction.x);
            const rightDir = new THREE.Vector3(direction.z, 0, -direction.x);
            
            const leftTest = weepingAngel.mesh.position.clone().add(leftDir.multiplyScalar(0.5));
            const rightTest = weepingAngel.mesh.position.clone().add(rightDir.multiplyScalar(0.5));
            leftTest.y = 1.8;
            rightTest.y = 1.8;
            
            if (!checkCollision(leftTest)) {
                weepingAngel.mesh.position.copy(leftTest);
                weepingAngel.particles.position.copy(leftTest);
            } else if (!checkCollision(rightTest)) {
                weepingAngel.mesh.position.copy(rightTest);
                weepingAngel.particles.position.copy(rightTest);
            }
        }
        
        // Face player
        weepingAngel.mesh.lookAt(camera.position);
    } else {
        // Reset timer when seen
        weepingAngel.lastUnseenTime = Date.now();
        weepingAngel.velocity.set(0, 0, 0);
    }
    
    // Eyes always glow
    weepingAngel.eyes[0].visible = true;
    weepingAngel.eyes[1].visible = true;
    
    // Animate particles
    const positions = weepingAngel.particles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        positions[i] += (Math.random() - 0.5) * 0.15;
        positions[i + 1] += (Math.random() - 0.5) * 0.15;
        positions[i + 2] += (Math.random() - 0.5) * 0.15;
        
        // Keep particles near angel
        const dist = Math.sqrt(positions[i] ** 2 + positions[i + 1] ** 2 + positions[i + 2] ** 2);
        if (dist > 3) {
            positions[i] *= 0.5;
            positions[i + 1] *= 0.5;
            positions[i + 2] *= 0.5;
        }
    }
    weepingAngel.particles.geometry.attributes.position.needsUpdate = true;
    
    // Collision with player
    if (dist < 1.5 && !player.godMode) {
        gameOver("The Angel caught you in the darkness...");
    }
}

// Update Angels - Level 2 monsters with OPPOSITE behavior
// Angels CHASE when looked at, FREEZE when not looked at
function updateAngels() {
    let closestAngelDist = Infinity;
    
    for (let i = 0; i < angels.length; i++) {
        const angel = angels[i];
        const dist = camera.position.distanceTo(angel.mesh.position);
        
        // Track closest angel for audio cues
        if (dist < closestAngelDist) {
            closestAngelDist = dist;
        }
        
        // Check if player is looking at this angel
        const directionToAngel = new THREE.Vector3();
        directionToAngel.subVectors(angel.mesh.position, camera.position).normalize();
        
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        
        const angle = cameraDirection.angleTo(directionToAngel);
        const isBeingLookedAt = angle < Math.PI / 3 && dist < 40;
        
        if (isBeingLookedAt) {
            // ANGELS CHASE WHEN LOOKED AT (opposite of weeping angels)
            angel.huntMode = true;
            angel.chargeTimer++;
            
            // Calculate direction to player
            const direction = new THREE.Vector3();
            direction.subVectors(camera.position, angel.mesh.position);
            direction.y = 0;
            direction.normalize();
            
            // Move faster the longer they're looked at (charging up)
            let chargeMultiplier = 1 + Math.min(angel.chargeTimer / 60, 3); // Up to 4x speed
            
            // Sacred relic effect: slow down angels
            if (player.relicActive && Date.now() < player.relicEndTime) {
                chargeMultiplier *= 0.3; // 70% slower
            } else if (player.relicActive && Date.now() >= player.relicEndTime) {
                player.relicActive = false; // Deactivate expired relic
            }
            
            const moveSpeed = angel.speed * chargeMultiplier;
            
            // Move toward player
            const movement = direction.multiplyScalar(moveSpeed);
            const newPos = angel.mesh.position.clone().add(movement);
            newPos.y = 0;
            
            // Angels can clip through trees - no collision check
            angel.mesh.position.copy(newPos);
            angel.glow.position.copy(newPos);
            angel.glow.position.y = 2;
            
            // Face player
            angel.mesh.lookAt(camera.position);
            
            // Eyes glow brighter when charging
            angel.eyes[0].visible = true;
            angel.eyes[1].visible = true;
            const glowIntensity = 2 + chargeMultiplier;
            angel.eyes[0].material.emissiveIntensity = glowIntensity;
            angel.eyes[1].material.emissiveIntensity = glowIntensity;
            
            // Halo spins faster when charging
            angel.halo.rotation.z += 0.05 * chargeMultiplier;
            
            // Wings flap when charging
            const flapAngle = Math.sin(Date.now() / 100 * chargeMultiplier) * 0.3;
            angel.wings[0].rotation.y = Math.PI / 6 + flapAngle;
            angel.wings[1].rotation.y = -Math.PI / 6 - flapAngle;
            
            // Glow light pulses
            angel.glow.intensity = 2 + Math.sin(Date.now() / 200) * chargeMultiplier;
            
        } else {
            // FROZEN when not being looked at, BUT can investigate loud noises
            angel.huntMode = false;
            angel.chargeTimer = Math.max(0, angel.chargeTimer - 2); // Slowly lose charge
            
            // Eyes dim
            angel.eyes[0].material.emissiveIntensity = 1;
            angel.eyes[1].material.emissiveIntensity = 1;
            
            // Check if player is making loud noise (sprinting)
            const noiseThreshold = 40; // Angels need louder noise to detect
            if (player.noiseLevel > noiseThreshold && player.noisePosition) {
                // Slowly drift toward noise source even when frozen
                const direction = new THREE.Vector3();
                direction.subVectors(player.noisePosition, angel.mesh.position);
                direction.y = 0;
                direction.normalize();
                
                // Move slowly toward noise (30% normal speed)
                const moveSpeed = angel.speed * 0.3;
                const movement = direction.multiplyScalar(moveSpeed);
                const newPos = angel.mesh.position.clone().add(movement);
                newPos.y = 0;
                
                angel.mesh.position.copy(newPos);
                angel.glow.position.copy(newPos);
                angel.glow.position.y = 2;
                
                // Eyes glow slightly when investigating
                angel.eyes[0].material.emissiveIntensity = 1.5;
                angel.eyes[1].material.emissiveIntensity = 1.5;
            }
            
            // Halo barely spins
            angel.halo.rotation.z += 0.01;
            
            // Wings at rest
            angel.wings[0].rotation.y = Math.PI / 6;
            angel.wings[1].rotation.y = -Math.PI / 6;
            
            // Glow steady
            angel.glow.intensity = 2;
        }
        
        // Collision with player - immediate jumpscare on contact (larger range for tall angel)
        if (dist < 2.5 && !player.godMode) {
            gameOver("The Angel's cold embrace took you...");
        }
    }
    
    // Play angel proximity audio cues (ethereal chimes)
    if (!sounds.angelChimes) {
        sounds.angelChimes = new Audio('audio/angelchimes.mp3');
        sounds.angelChimes.loop = true;
        sounds.angelChimes.volume = 0;
    }
    
    // Adjust volume based on closest angel distance
    if (closestAngelDist < 15) {
        const volume = Math.max(0, 1 - closestAngelDist / 15) * 1.5 * gameSettings.sfxVolume; // Tripled volume
        sounds.angelChimes.volume = volume;
        
        if (sounds.angelChimes.paused && volume > 0) {
            sounds.angelChimes.play().catch(e => console.log('Angel chimes error:', e));
        }
    } else {
        sounds.angelChimes.volume = 0;
        if (!sounds.angelChimes.paused) {
            sounds.angelChimes.pause();
        }
    }
}

// Update atmospheric particles
function updateParticles() {
    for (const system of particleSystems) {
        const positions = system.geometry.attributes.position.array;
        
        // Blood drips fall from ceiling
        if (system.userData.velocities) {
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] -= system.userData.velocities[i / 3];
                
                // Reset to ceiling when hitting ground
                if (positions[i + 1] < 0.1) {
                    positions[i + 1] = 4.5;
                    positions[i] = Math.random() * mazeSize * cellSize - (mazeSize * cellSize) / 2;
                    positions[i + 2] = Math.random() * mazeSize * cellSize - (mazeSize * cellSize) / 2;
                }
            }
        } else {
            // Regular atmospheric particles - gentle rotation and float
            system.rotation.y += 0.0005;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += Math.sin(Date.now() / 1000 + i) * 0.001;
                // Subtle horizontal drift
                positions[i] += Math.sin(Date.now() / 2000 + i) * 0.0005;
                positions[i + 2] += Math.cos(Date.now() / 2000 + i) * 0.0005;
            }
        }
        
        system.geometry.attributes.position.needsUpdate = true;
    }
    
    // Animate match pickup glows
    for (const pickup of matchPickups) {
        if (!pickup.collected) {
            pickup.glow.scale.setScalar(1 + Math.sin(Date.now() / 300) * 0.2);
            pickup.box.rotation.y += 0.01;
        }
    }
    
    // Animate light source glows
    for (const lightSource of lightSources) {
        const pulse = 1 + Math.sin(Date.now() / 500) * 0.2;
        lightSource.glow.scale.setScalar(pulse);
        lightSource.light.intensity = 1.3 + Math.sin(Date.now() / 300) * 0.3;
        // Slight sway for more atmosphere
        lightSource.bulb.position.x = lightSource.position.x + Math.sin(Date.now() / 1000) * 0.05;
        lightSource.glow.position.x = lightSource.position.x + Math.sin(Date.now() / 1000) * 0.05;
    }
    
    // Animate battery pickups
    for (const pickup of batteryPickups) {
        if (!pickup.collected) {
            pickup.glow.scale.setScalar(1 + Math.sin(Date.now() / 400) * 0.25);
            pickup.battery.rotation.y += 0.02;
            pickup.battery.position.y = 0.4 + Math.sin(Date.now() / 500) * 0.1;
        }
    }
}

// Check for match pickups
function checkMatchPickups() {
    for (const pickup of matchPickups) {
        if (!pickup.collected && camera.position.distanceTo(pickup.position) < 2) {
            pickup.collected = true;
            player.matches++;
            scene.remove(pickup.box);
            scene.remove(pickup.glow);
            scene.remove(pickup.light);
        }
    }
}

// Check for battery pickups
function checkBatteryPickups() {
    for (const pickup of batteryPickups) {
        if (!pickup.collected && camera.position.distanceTo(pickup.position) < 2) {
            pickup.collected = true;
            player.battery = Math.min(100, player.battery + 50); // Add 50% battery
            scene.remove(pickup.battery);
            scene.remove(pickup.glow);
            scene.remove(pickup.light);
            if (pickup.orb) scene.remove(pickup.orb);
            
            // Sacred relic effect: slow nearby angels for 10 seconds
            if (pickup.isRelic) {
                player.relicActive = true;
                player.relicEndTime = Date.now() + 10000; // 10 seconds
            }
            
            // Play battery pickup sound
            if (audioContext) {
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                
                // Create a pleasant pickup sound
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, audioContext.currentTime);
                osc.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.1);
                
                gain.gain.setValueAtTime(0.3, audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                
                osc.connect(gain);
                gain.connect(audioContext.destination);
                
                osc.start();
                osc.stop(audioContext.currentTime + 0.3);
            }
        }
    }
}

// Check for note pickup
function checkNotePickup() {
    const noteScreen = document.getElementById('note-screen');
    
    if (game.currentLevel === 1 && noteObject) {
        // Level 1: single note
        const dist = camera.position.distanceTo(noteObject.position);
        
        if (dist < 3) {
            if (!noteScreenVisible) {
                noteScreenVisible = true;
                updateNoteContent();
                noteScreen.style.display = 'flex';
            }
        } else {
            if (noteScreenVisible) {
                noteScreenVisible = false;
                noteScreen.style.display = 'none';
            }
        }
    } else if (game.currentLevel === 2 && noteObjects.length > 0) {
        // Level 2: multiple notes
        let closestNote = null;
        let closestDist = Infinity;
        
        for (const note of noteObjects) {
            const dist = camera.position.distanceTo(note.position);
            if (dist < 3 && dist < closestDist) {
                closestDist = dist;
                closestNote = note;
            }
        }
        
        if (closestNote) {
            if (!noteScreenVisible) {
                noteScreenVisible = true;
                // Update with specific note content
                const noteTitle = document.getElementById('note-title');
                const noteDate = document.getElementById('note-date');
                const noteText = document.getElementById('note-text');
                noteTitle.textContent = closestNote.userData.title;
                noteDate.textContent = closestNote.userData.date;
                noteText.innerHTML = closestNote.userData.text;
                noteScreen.style.display = 'flex';
            }
        } else {
            if (noteScreenVisible) {
                noteScreenVisible = false;
                noteScreen.style.display = 'none';
            }
        }
    }
}

// Update note content based on current level
function updateNoteContent() {
    const noteTitle = document.getElementById('note-title');
    const noteDate = document.getElementById('note-date');
    const noteText = document.getElementById('note-text');
    
    if (game.currentLevel === 1) {
        noteTitle.textContent = "RESEARCHER'S LOG - FINAL ENTRY";
        noteDate.textContent = "Date: [REDACTED]";
        noteText.innerHTML = `
            <p>If you're reading this, you're already being watched.</p>
            <p>They call them "The Watchers" - entities that exist in darkness. I've studied them for months, and I've learned their nature:</p>
            <p><strong>They freeze when observed.</strong> Look directly at them and they become statues. But the moment you blink, the moment you look away... they move. Silent. Swift. Deadly.</p>
            <p><strong>They fear the flame.</strong> Light a match near them and they flee in terror. The fire reminds them of something ancient, something that hurt them long ago.</p>
            <p><strong>You will hear them coming.</strong> Their footsteps echo through these halls - louder than yours, heavier than yours. When you hear them close, you have seconds to decide: look, or run.</p>
            <p>If you want to survive, remember: <em>Don't blink. Don't turn your back. And whatever you do, don't let them get close.</em></p>
            <p class="note-signature">- Dr. [ILLEGIBLE] [Walk away to close note]</p>
        `;
    } else if (game.currentLevel === 2) {
        noteTitle.textContent = "SANCTUARY LOG - ASCENSION RECORD";
        noteDate.textContent = "Location: The Eternal Gardens";
        noteText.innerHTML = `
            <p>You've escaped the darkness. But light can be just as dangerous.</p>
            <p>Welcome to the realm of <strong>The Angels</strong> - beings of pure radiance. But do not let their beauty deceive you.</p>
            <p><strong>They are drawn to attention.</strong> The Angels MOVE when you look at them. Your gaze awakens them. The longer you stare, the faster they charge toward you with terrible purpose.</p>
            <p><strong>They freeze when ignored.</strong> Look away and they become statues of light, harmless and still. But turn your eyes back and their hunt resumes with even greater fervor.</p>
            <p><strong>They build momentum.</strong> The more you watch them, the more power they gain. Their charge accelerates. Their wings beat faster. Soon they will be upon you.</p>
            <p>This is the inverse of what you knew. <em>Here, to look is to invite doom. To ignore is to survive. Keep moving. Never stare too long.</em></p>
            <p class="note-signature">- Keeper of the Light [Walk away to close note]</p>
        `;
    }
}

// Render scene
function render() {
    if (!renderer || !scene || !camera) {
        console.error('Renderer, scene, or camera not initialized!');
        return;
    }
    
    // Update monster glow lights only
    const time = Date.now() / 1000;
    for (let i = 0; i < shadows.length; i++) {
        const shadow = shadows[i];
        if (shadow.glowLight) {
            const glowPulse = Math.sin(time * 3 + i) * 0.5 + 0.5;
            
            if (shadow.hunting) {
                // Brighter, faster pulse when hunting
                shadow.glowLight.intensity = 3 + glowPulse * 2;
                shadow.glowLight.distance = 12 + glowPulse * 4;
            } else {
                // Dim idle glow
                shadow.glowLight.intensity = 0.5 + glowPulse * 0.5;
                shadow.glowLight.distance = 6 + glowPulse * 2;
            }
            
            // Update position to follow monster
            shadow.glowLight.position.copy(shadow.mesh.position);
            shadow.glowLight.position.y += 1;
        }
    }
    
    renderer.render(scene, camera);
    
    // Check for nearby monsters
    let closestMonsterDist = Infinity;
    for (const shadow of shadows) {
        const dist = camera.position.distanceTo(shadow.mesh.position);
        if (dist < closestMonsterDist) {
            closestMonsterDist = dist;
        }
    }
    
    // No VHS filter - clean visual experience
    renderer.domElement.style.filter = 'none';
    
    // Vignette effect at low sanity
    if (player.sanity < 40) {
        const vignetteStrength = (40 - player.sanity) / 40;
        renderer.domElement.style.boxShadow = `inset 0 0 ${100 + vignetteStrength * 200}px rgba(0, 0, 0, ${0.5 + vignetteStrength * 0.5})`;
    } else {
        renderer.domElement.style.boxShadow = 'none';
    }
}

// Update UI
function updateUI() {
    const sanityFill = document.getElementById('sanity-fill');
    const sanityText = document.getElementById('sanity-text');
    const matchesCount = document.getElementById('matches-count');
    const batteryFill = document.getElementById('battery-fill');
    const batteryText = document.getElementById('battery-text');
    const staminaFill = document.getElementById('stamina-fill');
    const staminaText = document.getElementById('stamina-text');
    const statusText = document.getElementById('status-text');
    const heartbeat = document.getElementById('heartbeat');
    
    sanityFill.style.width = player.sanity + '%';
    sanityText.textContent = Math.floor(player.sanity) + '%';
    matchesCount.textContent = player.matches;
    batteryFill.style.width = player.battery + '%';
    batteryText.textContent = Math.floor(player.battery) + '%';
    staminaFill.style.width = player.stamina + '%';
    staminaText.textContent = Math.floor(player.stamina) + '%';
    
    // Heartbeat speed based on fear
    heartbeat.style.animationDuration = (1.5 - player.fear) + 's';
    
    // Status messages
    if (player.matchLit) {
        statusText.textContent = 'The warm light protects you...';
    } else if (player.flashlight && player.battery > 0) {
        statusText.textContent = `Flashlight active - ${Math.floor(player.battery)}% battery`;
    } else if (player.battery <= 0 && player.flashlight) {
        statusText.textContent = 'Battery depleted...';
    } else if (player.sanity < 30) {
        statusText.textContent = 'You feel them watching...';
    } else if (player.sprinting) {
        statusText.textContent = 'They can hear you running...';
    } else {
        const nearestShadow = shadows.reduce((min, s) => {
            const d = Math.sqrt((s.x - player.x) ** 2 + (s.y - player.y) ** 2);
            return d < min ? d : min;
        }, Infinity);
        
        if (nearestShadow < 200) {
            statusText.textContent = 'Something is near...';
        } else {
            statusText.textContent = '';
        }
    }
    
    // Update minimap
    updateMinimap();
}

// Render minimap
function updateMinimap() {
    const minimap = document.getElementById('minimap');
    if (!minimap) return;
    
    const ctx = minimap.getContext('2d');
    const size = 150;
    const scale = size / (mazeSize * cellSize);
    
    // Clear
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, size, size);
    
    // Draw walls
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (const wall of walls) {
        const x = wall.position.x * scale;
        const z = wall.position.z * scale;
        ctx.strokeRect(x - 1, z - 1, 2, 2);
    }
    
    // Draw exits (all exit doors in level 1, only first in level 2)
    ctx.fillStyle = '#00ff00';
    const exitsToShow = game.currentLevel === 2 ? [exitCells[0]] : exitCells;
    for (const exit of exitsToShow) {
        ctx.beginPath();
        ctx.arc(
            exit.x * cellSize * scale,
            exit.z * cellSize * scale,
            4,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }
    
    // Draw light sources (only in level 1)
    if (game.currentLevel === 1) {
        ctx.fillStyle = '#ff9944';
        for (const lightSource of lightSources) {
            ctx.beginPath();
            ctx.arc(
                lightSource.position.x * scale,
                lightSource.position.z * scale,
                2,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }
    
    // Draw battery pickups
    ctx.fillStyle = '#00ff00';
    for (const pickup of batteryPickups) {
        if (!pickup.collected) {
            ctx.beginPath();
            ctx.arc(
                pickup.position.x * scale,
                pickup.position.z * scale,
                2,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }
    
    // Draw notes (Level 2)
    if (game.currentLevel === 2 && noteObjects.length > 0) {
        ctx.fillStyle = '#ffd700';
        for (const note of noteObjects) {
            ctx.beginPath();
            ctx.arc(
                note.position.x * scale,
                note.position.z * scale,
                3,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }
    
    // Draw player
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(
        camera.position.x * scale,
        camera.position.z * scale,
        3,
        0,
        Math.PI * 2
    );
    ctx.fill();
    
    // Draw player direction
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(camera.position.x * scale, camera.position.z * scale);
    ctx.lineTo(
        camera.position.x * scale + dir.x * 10,
        camera.position.z * scale + dir.z * 10
    );
    ctx.stroke();
}

// Game over
function gameOver(message) {
    game.running = false;
    
    // Show jumpscare image first
    const jumpscareScreen = document.getElementById('jumpscare-screen');
    const jumpscareImage = document.getElementById('jumpscare-image');
    
    // Use different jumpscare images based on level
    if (game.currentLevel === 1) {
        jumpscareImage.src = 'images/monster.png';
    } else {
        jumpscareImage.src = 'images/angel.jpg';
    }
    
    jumpscareScreen.style.display = 'flex';
    
    // Play jumpscare sound
    const jumpscareSound = new Audio('audio/jumpscare.mp3');
    jumpscareSound.volume = 0.2 * gameSettings.sfxVolume; // Quieter - 20% volume
    jumpscareSound.play().catch(e => console.log('Jumpscare sound error:', e));
    
    // After 2 seconds, hide jumpscare and show death screen
    setTimeout(() => {
        jumpscareScreen.style.display = 'none';
        deathScreen.style.display = 'flex';
        
        // Change death title based on level
        const deathTitle = document.getElementById('death-title');
        if (game.currentLevel === 1) {
            deathTitle.textContent = 'CONSUMED BY DARKNESS';
        } else {
            deathTitle.textContent = 'CONSUMED BY LIGHT';
        }
        
        document.getElementById('death-message').textContent = message;
        
        // Exit pointer lock to show cursor
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        game.pointerLocked = false;
    }, 2000);
}

// Victory / Level Transition
function victory() {
    // Check if this is Level 1 - if so, transition to Level 2
    if (game.currentLevel === 1) {
        transitionToLevel2();
        return;
    }
    
    // Level 2 complete - show actual victory
    game.running = false;
    game.pointerLocked = false;
    
    // Stop all sounds
    stopFootstep();
    if (sounds.soundtrack) {
        sounds.soundtrack.pause();
    }
    if (sounds.ambient) {
        sounds.ambient.stop();
    }
    if (sounds.ambience2 && !sounds.ambience2.paused) {
        sounds.ambience2.pause();
    }
    
    // Exit pointer lock
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
    
    game.survivalTime = Math.floor((Date.now() - game.startTime) / 1000);
    victoryScreen.style.display = 'flex';
    document.getElementById('survival-time').textContent = 
        `Time survived: ${game.survivalTime} seconds`;
}

// Transition to Level 2
function transitionToLevel2() {
    console.log('Transitioning to Level 2...');
    
    // Stop Level 1 sounds
    stopFootstep();
    if (sounds.soundtrack) sounds.soundtrack.pause();
    if (sounds.ambience2) sounds.ambience2.pause();
    
    // Clean up Level 1
    shadows.forEach(shadow => {
        if (shadow.mesh) scene.remove(shadow.mesh);
        if (shadow.particles) scene.remove(shadow.particles);
        if (shadow.glow) scene.remove(shadow.glow);
    });
    shadows = [];
    
    // Clear monster footsteps
    monsterFootsteps.forEach(fs => {
        fs.pause();
        fs.currentTime = 0;
    });
    monsterFootsteps.length = 0;
    
    // Remove Level 1 maze
    if (maze) {
        scene.remove(maze);
        maze = null;
    }
    if (floor) scene.remove(floor);
    if (ceiling) scene.remove(ceiling);
    
    walls.forEach(wall => scene.remove(wall));
    walls = [];
    
    matchPickups.forEach(pickup => scene.remove(pickup));
    matchPickups = [];
    
    batteryPickups.forEach(pickup => {
        scene.remove(pickup.battery);
        scene.remove(pickup.glow);
        scene.remove(pickup.light);
    });
    batteryPickups = [];
    
    pillars.forEach(pillar => scene.remove(pillar));
    pillars = [];
    
    // Update game state
    game.currentLevel = 2;
    player.sanity = 100;
    player.matches = 5;
    player.battery = 100;
    
    // Initialize Level 2
    initLevel2();
    
    // Start Level 2 music
    if (sounds.soundtrack) {
        sounds.soundtrack.pause();
        sounds.soundtrack = null;
    }
    sounds.soundtrack = new Audio('audio/Level2.mp3');
    sounds.soundtrack.loop = true;
    sounds.soundtrack.volume = 0.9 * gameSettings.musicVolume; // Tripled from 0.3 to 0.9
    sounds.soundtrack.play().catch(e => console.log('Level 2 soundtrack error:', e));
    
    console.log('Level 2 initialized');
}

// Initialize Level 2 - Dark forest maze
function initLevel2() {
    // Change background to match fog - opaque wall of fog
    scene.background = new THREE.Color(0x1a1a1a);
    // Dense fog - player can see about 10 units around them
    scene.fog = new THREE.Fog(0x1a1a1a, 1, 10); // Fog starts at 1 unit, completely opaque at 10 units
    
    // Change ambient light to very dim - enhances fog effect
    ambientLight.color.setHex(0x444444);
    ambientLight.intensity = 0.3; // Much dimmer to enhance fog opacity
    
    // Very dim directional light - fog swallows most light
    const sunlight = new THREE.DirectionalLight(0x333333, 0.2);
    sunlight.position.set(50, 100, 30);
    sunlight.castShadow = true;
    scene.add(sunlight);
    
    // Reduced sun - fog obscures everything beyond tiny radius
    const massiveSun = new THREE.PointLight(0x888866, 0.5, 200);
    massiveSun.position.set(mazeSize * cellSize / 2, 200, mazeSize * cellSize / 2);
    scene.add(massiveSun);
    
    // Create skybox (dark to match impenetrable fog)
    const skyboxGeometry = new THREE.BoxGeometry(1000, 1000, 1000);
    const skyboxMaterials = [
        new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide }), // Right - matches fog
        new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide }), // Left - matches fog
        new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide }), // Top - matches fog
        new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide }), // Bottom - matches fog
        new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide }), // Front - matches fog
        new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide })  // Back - matches fog
    ];
    skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterials);
    scene.add(skybox);
    
    // Regenerate maze with white materials
    generateMaze();
    const treePositions = buildLevel2Maze(); // Get tree positions to avoid
    createAngels();
    
    // Create multiple notes for Level 2 with lore
    noteObjects = [];
    
    // Generate random positions for notes, ensuring they're valid and not too close to each other or trees
    const notePositions = [];
    const minNoteDistance = 3; // Minimum distance between notes
    
    for (let i = 0; i < 6; i++) { // 6 notes total
        let px, pz, attempts = 0;
        let validPosition = false;
        
        do {
            // Random position within maze boundaries
            px = 2 + Math.floor(Math.random() * (mazeSize - 4));
            pz = 2 + Math.floor(Math.random() * (mazeSize - 4));
            
            // Check if position is valid (not in wall, not at spawn/exit)
            const notInWall = mazeData[px][pz] !== 1;
            const notAtSpawn = !(px <= 1 && pz <= 1);
            const notAtExit = !(Math.abs(px - exitCell.x) < 2 && Math.abs(pz - exitCell.z) < 2);
            
            // Check distance from other notes
            let tooClose = false;
            for (const pos of notePositions) {
                const dist = Math.sqrt((px - pos.x) ** 2 + (pz - pos.z) ** 2);
                if (dist < minNoteDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            // Check distance from trees
            let tooCloseToTree = false;
            for (const treePos of treePositions) {
                const dist = Math.sqrt((px - treePos.x) ** 2 + (pz - treePos.z) ** 2);
                if (dist < 2) { // Must be at least 2 cells away from trees
                    tooCloseToTree = true;
                    break;
                }
            }
            
            validPosition = notInWall && notAtSpawn && notAtExit && !tooClose && !tooCloseToTree;
            attempts++;
        } while (!validPosition && attempts < 200);
        
        if (validPosition) {
            notePositions.push({ x: px * cellSize, z: pz * cellSize });
        }
    }
    
    const level2Notes = [
        {
            position: notePositions[0] || { x: 10, z: 10 },
            title: "DR. HELENA'S JOURNAL - DAY 1",
            date: "The First Discovery",
            text: `
                <p>I found it. After months of research, I finally understand what happened in the dark facility.</p>
                <p>The creatures there - the "Watchers" - they weren't born in darkness. They <strong>fled</strong> into it.</p>
                <p>My colleague Dr. Shaw was right. The shadows fear light not because it hurts them, but because of what dwells IN the light.</p>
                <p>I'm following the trail they left. There's a place they call "The Eternal Garden." The shadows whisper about it in terror.</p>
                <p>Tomorrow, I enter the forest. God help me.</p>
                <p class="note-signature">- Dr. Helena Marsh, Paranormal Research Division</p>
            `
        },
        {
            position: notePositions[1] || { x: mazeSize * cellSize * 0.2, z: mazeSize * cellSize * 0.25 },
            title: "DR. HELENA'S JOURNAL - DAY 3",
            date: "The Angels",
            text: `
                <p>I was wrong. So terribly wrong.</p>
                <p>The entities here are not guardians. They're <strong>hunters</strong>. Beautiful. Luminous. Deadly.</p>
                <p>My research assistant, Marcus, looked at one for too long. It... changed. Its eyes ignited with golden fire.</p>
                <p>It didn't freeze like the shadows do. It CHARGED. Faster and faster the longer he stared.</p>
                <p>I pulled him behind a tree. The Angel stopped moving the moment we broke eye contact.</p>
                <p>Marcus is gone now. He ran. I heard him scream.</p>
                <p><em>Never stare. Never let them see you watching.</em></p>
                <p class="note-signature">- Dr. Helena Marsh</p>
            `
        },
        {
            position: notePositions[2] || { x: mazeSize * cellSize * 0.4, z: mazeSize * cellSize * 0.35 },
            title: "ANCIENT TABLET TRANSLATION",
            date: "Age Unknown",
            text: `
                <p>"In the time before time, there was only the Light Eternal."</p>
                <p>"The First Beings were born of radiance - perfect, unwavering, absolute."</p>
                <p>"But perfection cannot tolerate imperfection. The shadows that danced at their feet grew conscious, grew willful."</p>
                <p>"The First Beings - the Angels - declared war. All shadow must be purged."</p>
                <p>"The shadows learned to mimic their hunters. To freeze when seen. To move unseen."</p>
                <p>"They scattered into the void, creating the Dark Places as sanctuary."</p>
                <p><strong>"The war never ended. It merely split into two fronts: Light and Dark."</strong></p>
                <p class="note-signature">- Translated from Pre-Human Script</p>
            `
        },
        {
            position: notePositions[3] || { x: mazeSize * cellSize * 0.5, z: mazeSize * cellSize * 0.5 },
            title: "DR. HELENA'S JOURNAL - DAY 7",
            date: "The Pattern",
            text: `
                <p>I've survived by understanding the pattern.</p>
                <p>The Angels <strong>feed on attention</strong>. Your gaze is their sustenance. The more you look, the stronger they become.</p>
                <p>I watched one charge a deer today. The animal couldn't look away - animals don't understand. The Angel accelerated until it was a blur of light.</p>
                <p>It's the opposite of everything we learned about the shadows. The shadows move when unwatched. The Angels move when watched.</p>
                <p>This is their revenge. The shadows copied the Angels' weakness to escape. So the Angels inverted it, weaponized it.</p>
                <p><em>I'm running out of food. The exit must be close.</em></p>
                <p class="note-signature">- Dr. Helena Marsh</p>
            `
        },
        {
            position: notePositions[4] || { x: mazeSize * cellSize * 0.65, z: mazeSize * cellSize * 0.55 },
            title: "SURVIVOR'S WARNING",
            date: "Left by Someone Who Escaped",
            text: `
                <p>YOU CAN MAKE IT OUT.</p>
                <p>I did. Barely. Here's what you need to know:</p>
                <p><strong>1. Peripheral vision is your friend.</strong> You can see Angels without looking AT them. Navigate by what you see at the edge of your vision.</p>
                <p><strong>2. Quick glances only.</strong> If you must look directly at one, make it brief. One second maximum.</p>
                <p><strong>3. They build momentum.</strong> An Angel you've stared at for 10 seconds is four times faster than one you just glanced at.</p>
                <p><strong>4. Multiple Angels stack.</strong> If three are chasing, look away from ALL of them, or they'll keep accelerating.</p>
                <p>The golden glow ahead is the exit. I marked it for you.</p>
                <p>Don't give up. Don't panic. <em>And whatever you do, don't stare.</em></p>
                <p class="note-signature">- Someone who made it</p>
            `
        },
        {
            position: notePositions[5] || { x: mazeSize * cellSize * 0.75, z: mazeSize * cellSize * 0.7 },
            title: "DR. HELENA'S JOURNAL - FINAL ENTRY",
            date: "Day 12",
            text: `
                <p>I see the exit. Golden light, just like the tablets said.</p>
                <p>But I understand now. There is no escape. Not really.</p>
                <p>The shadows in the dark. The Angels in the light. Both hunting. Both eternal.</p>
                <p>We thought we could study them, contain them, understand them. But they're not subjects. They're forces of nature.</p>
                <p><strong>Whoever reads this: RUN. Don't look back. Not at the shadows. Not at the Angels.</strong></p>
                <p>The exit is ahead. I'm going through. Maybe I'll find peace. Maybe just another nightmare.</p>
                <p>If I don't make it... tell my daughter I tried.</p>
                <p class="note-signature">- Dr. Helena Marsh, final words</p>
            `
        }
    ];
    
    level2Notes.forEach((noteData, index) => {
        const noteGeometry = new THREE.BoxGeometry(0.3, 0.4, 0.05);
        const noteMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffD700,
            emissive: 0xffaa00,
            emissiveIntensity: 0.8
        });
        const note = new THREE.Mesh(noteGeometry, noteMaterial);
        note.position.set(noteData.position.x, 0.5, noteData.position.z);
        note.rotation.y = Math.PI / 4;
        note.userData = {
            title: noteData.title,
            date: noteData.date,
            text: noteData.text
        };
        scene.add(note);
        
        // Golden glow to note
        const noteGlow = new THREE.PointLight(0xffD700, 2, 8);
        noteGlow.position.copy(note.position);
        scene.add(noteGlow);
        
        noteObjects.push(note);
    });
    
    // Set first note as main noteObject for compatibility
    noteObject = noteObjects[0];
    noteScreenVisible = false;
    
    // Reset player position
    camera.position.set(cellSize / 2, player.height, cellSize / 2);
}

// Build Level 2 maze - white and bright
function buildLevel2Maze() {
    const wallHeight = 6;
    
    // Create marble wall material with procedural texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Base marble color
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add marble veins
    ctx.strokeStyle = 'rgba(180, 180, 180, 0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 512, Math.random() * 512);
        for (let j = 0; j < 5; j++) {
            ctx.quadraticCurveTo(
                Math.random() * 512, Math.random() * 512,
                Math.random() * 512, Math.random() * 512
            );
        }
        ctx.stroke();
    }
    
    // Add darker veins
    ctx.strokeStyle = 'rgba(140, 140, 140, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 512, Math.random() * 512);
        for (let j = 0; j < 3; j++) {
            ctx.quadraticCurveTo(
                Math.random() * 512, Math.random() * 512,
                Math.random() * 512, Math.random() * 512
            );
        }
        ctx.stroke();
    }
    
    const marbleTexture = new THREE.CanvasTexture(canvas);
    marbleTexture.wrapS = THREE.RepeatWrapping;
    marbleTexture.wrapT = THREE.RepeatWrapping;
    marbleTexture.repeat.set(2, 2);
    
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        map: marbleTexture,
        color: 0x3d2817,  // Dark brown bark color
        roughness: 0.9,
        metalness: 0.0,
        emissive: 0x000000,
        emissiveIntensity: 0
    });
    
    // Create walls
    for (let x = 0; x < mazeSize; x++) {
        for (let z = 0; z < mazeSize; z++) {
            if (mazeData[x][z] === 1) {
                const wallGeometry = new THREE.BoxGeometry(cellSize, wallHeight, cellSize);
                const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                wall.position.set(x * cellSize, wallHeight / 2, z * cellSize);
                wall.castShadow = true;
                wall.receiveShadow = true;
                scene.add(wall);
                walls.push(wall);
            }
        }
    }
    
    // Create grass floor
    const floorSize = mazeSize * cellSize * 2;
    const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize, 50, 50);
    
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2d5016,  // Dark grass green
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide
    });
    
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Add 3D grass blades throughout the floor
    const grassBladeGeometry = new THREE.ConeGeometry(0.03, 0.4, 3); // Thinner and taller for spiky look
    const grassMaterial = new THREE.MeshStandardMaterial({
        color: 0x3d6b1f,
        roughness: 0.8,
        metalness: 0.0
    });
    
    // Create grass patches (reduced for performance)
    for (let i = 0; i < 3000; i++) {
        const grassBlade = new THREE.Mesh(grassBladeGeometry, grassMaterial);
        grassBlade.position.set(
            (Math.random() - 0.5) * floorSize * 0.9,
            0.15,
            (Math.random() - 0.5) * floorSize * 0.9
        );
        grassBlade.rotation.z = (Math.random() - 0.5) * 0.4; // More varied tilt
        grassBlade.rotation.y = Math.random() * Math.PI * 2; // Random rotation
        grassBlade.scale.y = 0.7 + Math.random() * 0.6; // More height variation
        scene.add(grassBlade);
    }
    
    // NO CEILING - outdoor environment
    // NO BATTERY PICKUPS in Level 2
    // NO LIGHT SOURCES in Level 2
    
    // Add boundary walls around the map to prevent players from leaving
    const boundaryHeight = 15;
    const boundaryThickness = 2;
    const mapSize = mazeSize * cellSize;
    const boundaryMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d2d2d,
        roughness: 0.9,
        metalness: 0.0
    });
    
    // North wall
    const northWall = new THREE.Mesh(
        new THREE.BoxGeometry(mapSize + boundaryThickness * 2, boundaryHeight, boundaryThickness),
        boundaryMaterial
    );
    northWall.position.set(mapSize / 2, boundaryHeight / 2, -boundaryThickness / 2);
    scene.add(northWall);
    walls.push(northWall);
    
    // South wall
    const southWall = new THREE.Mesh(
        new THREE.BoxGeometry(mapSize + boundaryThickness * 2, boundaryHeight, boundaryThickness),
        boundaryMaterial
    );
    southWall.position.set(mapSize / 2, boundaryHeight / 2, mapSize + boundaryThickness / 2);
    scene.add(southWall);
    walls.push(southWall);
    
    // West wall
    const westWall = new THREE.Mesh(
        new THREE.BoxGeometry(boundaryThickness, boundaryHeight, mapSize),
        boundaryMaterial
    );
    westWall.position.set(-boundaryThickness / 2, boundaryHeight / 2, mapSize / 2);
    scene.add(westWall);
    walls.push(westWall);
    
    // East wall
    const eastWall = new THREE.Mesh(
        new THREE.BoxGeometry(boundaryThickness, boundaryHeight, mapSize),
        boundaryMaterial
    );
    eastWall.position.set(mapSize + boundaryThickness / 2, boundaryHeight / 2, mapSize / 2);
    scene.add(eastWall);
    walls.push(eastWall);
    
    // Exit marker - golden glowing portal (ONLY ONE in Level 2)
    const level2ExitCell = exitCells[0]; // Use only the first exit
    const exitGeometry = new THREE.CylinderGeometry(1.5, 1.5, 8, 32);
    const exitMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffD700,
        emissive: 0xffD700,
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.7
    });
    const exitMarker = new THREE.Mesh(exitGeometry, exitMaterial);
    exitMarker.position.set(level2ExitCell.x * cellSize, 4, level2ExitCell.z * cellSize);
    scene.add(exitMarker);
    
    // Add golden light at exit
    const exitLight = new THREE.PointLight(0xffD700, 3, 20);
    exitLight.position.set(level2ExitCell.x * cellSize, 4, level2ExitCell.z * cellSize);
    scene.add(exitLight);
    
    // Optimized tree count for better performance
    const numTrees = 200 + Math.floor(Math.random() * 80); // Reduced to 200-280 trees for smooth FPS
    const treePositions = []; // Track tree positions to avoid overlap
    const objectPositions = []; // Track all object positions (trees, pillars, structures, statues)
    
    for (let i = 0; i < numTrees; i++) {
        let px, pz, attempts = 0;
        let validPosition = false;
        
        do {
            // Ensure trees spawn within map boundaries (0 to mazeSize-1)
            px = 1 + Math.floor(Math.random() * (mazeSize - 2));
            pz = 1 + Math.floor(Math.random() * (mazeSize - 2));
            
            // Check if position is valid (not in walls, not at spawn/exit)
            const notInWall = mazeData[px][pz] !== 1;
            const notAtSpawn = !(px === 0 && pz === 0);
            const notAtExit = !(px === exitCell.x && pz === exitCell.z);
            
            // Check if too close to other objects
            let tooClose = false;
            for (const pos of objectPositions) {
                const dist = Math.sqrt((px - pos.x) ** 2 + (pz - pos.z) ** 2);
                if (dist < 0.8) { // Minimum distance between objects
                    tooClose = true;
                    break;
                }
            }
            
            validPosition = notInWall && notAtSpawn && notAtExit && !tooClose;
            attempts++;
        } while (!validPosition && attempts < 100);
        
        if (!validPosition) continue;
        
        // Store this tree position
        treePositions.push({ x: px, z: pz });
        objectPositions.push({ x: px, z: pz });
        
        const treeType = Math.random();
        
        if (treeType < 0.3) {
            // SHORT BUSH - low, wide foliage with multiple leaf clusters
            const bushRadius = 0.8 + Math.random() * 0.7;
            const bushGeometry = new THREE.SphereGeometry(bushRadius, 8, 8);
            const bushMaterial = new THREE.MeshStandardMaterial({
                color: 0x2a5a1a,
                roughness: 0.9,
                metalness: 0.0
            });
            const bush = new THREE.Mesh(bushGeometry, bushMaterial);
            bush.position.set(px * cellSize, bushRadius * 0.6, pz * cellSize);
            bush.scale.y = 0.6;
            bush.castShadow = true;
            scene.add(bush);
            pillars.push(bush);
            
            // Add extra leaf clusters to bush
            for (let j = 0; j < 3; j++) {
                const extraLeaf = new THREE.Mesh(
                    new THREE.SphereGeometry(bushRadius * 0.5, 6, 6),
                    bushMaterial
                );
                const angle = (j / 3) * Math.PI * 2;
                extraLeaf.position.set(
                    px * cellSize + Math.cos(angle) * bushRadius * 0.5,
                    bushRadius * 0.5,
                    pz * cellSize + Math.sin(angle) * bushRadius * 0.5
                );
                extraLeaf.scale.y = 0.7;
                extraLeaf.castShadow = true;
                scene.add(extraLeaf);
            }
            
        } else if (treeType < 0.6) {
            // CONE/PINE TREE - tall and narrow with layered foliage
            const coneHeight = 5 + Math.random() * 8;
            const coneRadius = 0.8 + Math.random() * 0.6;
            const coneMaterial = new THREE.MeshStandardMaterial({
                color: 0x1a4d0d,
                roughness: 0.9,
                metalness: 0.0
            });
            
            // Main cone
            const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
            const cone = new THREE.Mesh(coneGeometry, coneMaterial);
            cone.position.set(px * cellSize, coneHeight / 2, pz * cellSize);
            cone.castShadow = true;
            scene.add(cone);
            pillars.push(cone);
            
            // Add 3-4 additional cone layers for fuller foliage
            const numLayers = 3 + Math.floor(Math.random() * 2);
            for (let layer = 0; layer < numLayers; layer++) {
                const layerHeight = coneHeight * (0.3 + layer * 0.2);
                const layerRadius = coneRadius * (1.2 - layer * 0.15);
                const layerCone = new THREE.Mesh(
                    new THREE.ConeGeometry(layerRadius, coneHeight * 0.4, 8),
                    coneMaterial
                );
                layerCone.position.set(px * cellSize, layerHeight, pz * cellSize);
                layerCone.castShadow = true;
                scene.add(layerCone);
            }
            
            // Small trunk
            const smallTrunkGeometry = new THREE.CylinderGeometry(0.15, 0.2, coneHeight * 0.4, 6);
            const trunkMaterial = new THREE.MeshStandardMaterial({
                color: 0x3d2817,
                roughness: 0.9,
                metalness: 0.0
            });
            const smallTrunk = new THREE.Mesh(smallTrunkGeometry, trunkMaterial);
            smallTrunk.position.set(px * cellSize, coneHeight * 0.2, pz * cellSize);
            scene.add(smallTrunk);
            
        } else {
            // REGULAR TREE - varied heights with round foliage
            const trunkHeight = 4 + Math.random() * 12; // 4-16 units tall
            const trunkRadius = 0.2 + Math.random() * 0.4;
            const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius + 0.1, trunkHeight, 8);
            const trunkMaterial = new THREE.MeshStandardMaterial({
                color: 0x3d2817,
                roughness: 0.9,
                metalness: 0.0
            });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.set(px * cellSize, trunkHeight / 2, pz * cellSize);
            trunk.castShadow = true;
            trunk.receiveShadow = true;
            scene.add(trunk);
            pillars.push(trunk);
            
            // Foliage - multiple layers for fuller appearance
            const foliageRadius = 1.2 + Math.random() * 1.5;
            const foliageMaterial = new THREE.MeshStandardMaterial({
                color: 0x1a4d0d,
                roughness: 0.8,
                metalness: 0.0
            });
            
            // Main foliage sphere
            const foliageGeometry = new THREE.SphereGeometry(foliageRadius, 10, 10);
            const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
            foliage.position.set(px * cellSize, trunkHeight + foliageRadius - 0.5, pz * cellSize);
            if (Math.random() > 0.5) {
                foliage.scale.y = 1.2 + Math.random() * 0.5;
            }
            foliage.castShadow = true;
            scene.add(foliage);
            
            // Add 4-6 smaller leaf clusters around the main foliage
            const numClusters = 4 + Math.floor(Math.random() * 3);
            for (let c = 0; c < numClusters; c++) {
                const clusterSize = foliageRadius * (0.4 + Math.random() * 0.3);
                const angle = (c / numClusters) * Math.PI * 2;
                const clusterDist = foliageRadius * 0.7;
                const cluster = new THREE.Mesh(
                    new THREE.SphereGeometry(clusterSize, 6, 6),
                    foliageMaterial
                );
                cluster.position.set(
                    px * cellSize + Math.cos(angle) * clusterDist,
                    trunkHeight + foliageRadius * (0.6 + Math.random() * 0.4),
                    pz * cellSize + Math.sin(angle) * clusterDist
                );
                cluster.castShadow = true;
                scene.add(cluster);
            }
        }
    }
    
    // Add fallen logs, rocks, and stumps for visual variety
    const numDecorations = 80 + Math.floor(Math.random() * 40); // Increased from 30-50 to 80-120 decorations
    
    for (let i = 0; i < numDecorations; i++) {
        let px, pz, attempts = 0;
        let validPosition = false;
        
        do {
            px = 1 + Math.floor(Math.random() * (mazeSize - 2));
            pz = 1 + Math.floor(Math.random() * (mazeSize - 2));
            
            // Check if position is valid (not in wall, not at spawn/exit)
            const notInWall = mazeData[px][pz] !== 1;
            const notAtSpawn = !(px <= 1 && pz <= 1);
            const notAtExit = !(Math.abs(px - exitCell.x) < 2 && Math.abs(pz - exitCell.z) < 2);
            
            // Check distance from trees to avoid overlap
            let tooCloseToTree = false;
            for (const treePos of treePositions) {
                const dist = Math.sqrt((px - treePos.x) ** 2 + (pz - treePos.z) ** 2);
                if (dist < 1.2) { // Minimum distance from trees
                    tooCloseToTree = true;
                    break;
                }
            }
            
            validPosition = notInWall && notAtSpawn && notAtExit && !tooCloseToTree;
            attempts++;
        } while (!validPosition && attempts < 100);
        
        if (attempts >= 100) continue;
        
        const decorationType = Math.random();
        
        if (decorationType < 0.4) {
            // FALLEN LOG
            const logLength = 2 + Math.random() * 3;
            const logRadius = 0.2 + Math.random() * 0.2;
            const logGeometry = new THREE.CylinderGeometry(logRadius, logRadius, logLength, 8);
            const logMaterial = new THREE.MeshStandardMaterial({
                color: 0x4a3520,
                roughness: 0.9
            });
            const log = new THREE.Mesh(logGeometry, logMaterial);
            log.position.set(px * cellSize, logRadius, pz * cellSize);
            log.rotation.z = Math.PI / 2; // Lay it flat
            log.rotation.y = Math.random() * Math.PI;
            log.castShadow = true;
            scene.add(log);
            
        } else if (decorationType < 0.7) {
            // ROCK
            const rockSize = 0.3 + Math.random() * 0.5;
            const rockGeometry = new THREE.DodecahedronGeometry(rockSize, 0);
            const rockMaterial = new THREE.MeshStandardMaterial({
                color: 0x555555,
                roughness: 0.95
            });
            const rock = new THREE.Mesh(rockGeometry, rockMaterial);
            rock.position.set(px * cellSize, rockSize * 0.6, pz * cellSize);
            rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            rock.castShadow = true;
            scene.add(rock);
            
        } else {
            // TREE STUMP
            const stumpHeight = 0.5 + Math.random() * 0.8;
            const stumpRadius = 0.3 + Math.random() * 0.3;
            const stumpGeometry = new THREE.CylinderGeometry(stumpRadius, stumpRadius + 0.1, stumpHeight, 8);
            const stumpMaterial = new THREE.MeshStandardMaterial({
                color: 0x3d2817,
                roughness: 0.9
            });
            const stump = new THREE.Mesh(stumpGeometry, stumpMaterial);
            stump.position.set(px * cellSize, stumpHeight / 2, pz * cellSize);
            stump.castShadow = true;
            scene.add(stump);
            
            // Add rings on top
            const topGeometry = new THREE.CircleGeometry(stumpRadius, 16);
            const topMaterial = new THREE.MeshStandardMaterial({
                color: 0x5a4a30,
                roughness: 0.8
            });
            const top = new THREE.Mesh(topGeometry, topMaterial);
            top.position.set(px * cellSize, stumpHeight + 0.01, pz * cellSize);
            top.rotation.x = -Math.PI / 2;
            scene.add(top);
        }
    }
    
    // Add MARBLE PILLARS throughout the forest
    const numPillars = 25 + Math.floor(Math.random() * 15);
    for (let i = 0; i < numPillars; i++) {
        let px, pz, attempts = 0;
        let validPosition = false;
        
        do {
            px = 2 + Math.floor(Math.random() * (mazeSize - 4));
            pz = 2 + Math.floor(Math.random() * (mazeSize - 4));
            
            const notInWall = mazeData[px][pz] !== 1;
            const notAtSpawn = !(px <= 1 && pz <= 1);
            const notAtExit = !(Math.abs(px - exitCell.x) < 2 && Math.abs(pz - exitCell.z) < 2);
            
            let tooClose = false;
            for (const pos of objectPositions) {
                const dist = Math.sqrt((px - pos.x) ** 2 + (pz - pos.z) ** 2);
                if (dist < 1.5) {
                    tooClose = true;
                    break;
                }
            }
            
            validPosition = notInWall && notAtSpawn && notAtExit && !tooClose;
            attempts++;
        } while (!validPosition && attempts < 100);
        
        if (attempts >= 100) continue;
        objectPositions.push({ x: px, z: pz });
        
        // Create marble pillar
        const pillarHeight = 3 + Math.random() * 5;
        const pillarRadius = 0.3 + Math.random() * 0.2;
        const pillarGeometry = new THREE.CylinderGeometry(pillarRadius, pillarRadius, pillarHeight, 12);
        const marbleMaterial = new THREE.MeshStandardMaterial({
            color: 0xdddddd,
            roughness: 0.3,
            metalness: 0.1
        });
        const pillar = new THREE.Mesh(pillarGeometry, marbleMaterial);
        pillar.position.set(px * cellSize, pillarHeight / 2, pz * cellSize);
        pillar.castShadow = true;
        scene.add(pillar);
        pillars.push(pillar);
        
        // Add capital (top)
        const capitalGeometry = new THREE.CylinderGeometry(pillarRadius * 1.5, pillarRadius * 1.2, 0.4, 12);
        const capital = new THREE.Mesh(capitalGeometry, marbleMaterial);
        capital.position.set(px * cellSize, pillarHeight + 0.2, pz * cellSize);
        capital.castShadow = true;
        scene.add(capital);
        
        // Add base
        const baseGeometry = new THREE.CylinderGeometry(pillarRadius * 1.2, pillarRadius * 1.5, 0.3, 12);
        const base = new THREE.Mesh(baseGeometry, marbleMaterial);
        base.position.set(px * cellSize, 0.15, pz * cellSize);
        scene.add(base);
    }
    
    // Add ANGEL STATUES
    const numStatues = 12 + Math.floor(Math.random() * 8);
    for (let i = 0; i < numStatues; i++) {
        let px, pz, attempts = 0;
        let validPosition = false;
        
        do {
            px = 3 + Math.floor(Math.random() * (mazeSize - 6));
            pz = 3 + Math.floor(Math.random() * (mazeSize - 6));
            
            const notInWall = mazeData[px][pz] !== 1;
            const notAtSpawn = !(px <= 2 && pz <= 2);
            const notAtExit = !(Math.abs(px - exitCell.x) < 3 && Math.abs(pz - exitCell.z) < 3);
            
            let tooClose = false;
            for (const pos of objectPositions) {
                const dist = Math.sqrt((px - pos.x) ** 2 + (pz - pos.z) ** 2);
                if (dist < 2) {
                    tooClose = true;
                    break;
                }
            }
            
            validPosition = notInWall && notAtSpawn && notAtExit && !tooClose;
            attempts++;
        } while (!validPosition && attempts < 100);
        
        if (attempts >= 100) continue;
        objectPositions.push({ x: px, z: pz });
        
        // Create angel statue
        const statueGroup = new THREE.Group();
        const statueMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.4,
            metalness: 0.1
        });
        
        // Body/robe
        const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.6, 2, 8);
        const body = new THREE.Mesh(bodyGeometry, statueMaterial);
        body.position.y = 1;
        statueGroup.add(body);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.3, 12, 12);
        const head = new THREE.Mesh(headGeometry, statueMaterial);
        head.position.y = 2.3;
        statueGroup.add(head);
        
        // Wings
        const wingGeometry = new THREE.BoxGeometry(1.2, 1.5, 0.2);
        const leftWing = new THREE.Mesh(wingGeometry, statueMaterial);
        leftWing.position.set(-0.5, 1.5, 0);
        leftWing.rotation.y = -Math.PI / 6;
        statueGroup.add(leftWing);
        
        const rightWing = new THREE.Mesh(wingGeometry, statueMaterial);
        rightWing.position.set(0.5, 1.5, 0);
        rightWing.rotation.y = Math.PI / 6;
        statueGroup.add(rightWing);
        
        // Position statue
        statueGroup.position.set(px * cellSize, 0, pz * cellSize);
        statueGroup.rotation.y = Math.random() * Math.PI * 2;
        statueGroup.castShadow = true;
        scene.add(statueGroup);
        pillars.push(statueGroup);
    }
    
    // Add RUINED STRUCTURES (broken walls, arches)
    const numRuins = 15 + Math.floor(Math.random() * 10);
    for (let i = 0; i < numRuins; i++) {
        let px, pz, attempts = 0;
        let validPosition = false;
        
        do {
            px = 3 + Math.floor(Math.random() * (mazeSize - 6));
            pz = 3 + Math.floor(Math.random() * (mazeSize - 6));
            
            const notInWall = mazeData[px][pz] !== 1;
            const notAtSpawn = !(px <= 2 && pz <= 2);
            const notAtExit = !(Math.abs(px - exitCell.x) < 3 && Math.abs(pz - exitCell.z) < 3);
            
            let tooClose = false;
            for (const pos of objectPositions) {
                const dist = Math.sqrt((px - pos.x) ** 2 + (pz - pos.z) ** 2);
                if (dist < 2.5) {
                    tooClose = true;
                    break;
                }
            }
            
            validPosition = notInWall && notAtSpawn && notAtExit && !tooClose;
            attempts++;
        } while (!validPosition && attempts < 100);
        
        if (attempts >= 100) continue;
        objectPositions.push({ x: px, z: pz });
        
        const ruinType = Math.random();
        const ruinMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.8,
            metalness: 0.0
        });
        
        if (ruinType < 0.4) {
            // Broken wall
            const wallHeight = 2 + Math.random() * 3;
            const wallLength = 3 + Math.random() * 2;
            const wallGeometry = new THREE.BoxGeometry(wallLength, wallHeight, 0.4);
            const wall = new THREE.Mesh(wallGeometry, ruinMaterial);
            wall.position.set(px * cellSize, wallHeight / 2, pz * cellSize);
            wall.rotation.y = Math.random() * Math.PI;
            // Make it look broken
            wall.rotation.x = (Math.random() - 0.5) * 0.3;
            wall.castShadow = true;
            scene.add(wall);
            pillars.push(wall);
            
        } else if (ruinType < 0.7) {
            // Broken arch
            const archHeight = 3 + Math.random() * 2;
            const archWidth = 2 + Math.random() * 1;
            
            // Left pillar
            const leftPillar = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, archHeight, 0.3),
                ruinMaterial
            );
            leftPillar.position.set(px * cellSize - archWidth / 2, archHeight / 2, pz * cellSize);
            leftPillar.castShadow = true;
            scene.add(leftPillar);
            pillars.push(leftPillar);
            
            // Right pillar
            const rightPillar = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, archHeight, 0.3),
                ruinMaterial
            );
            rightPillar.position.set(px * cellSize + archWidth / 2, archHeight / 2, pz * cellSize);
            rightPillar.castShadow = true;
            scene.add(rightPillar);
            pillars.push(rightPillar);
            
            // Broken arch top
            const archTop = new THREE.Mesh(
                new THREE.BoxGeometry(archWidth, 0.4, 0.3),
                ruinMaterial
            );
            archTop.position.set(px * cellSize, archHeight - 0.2, pz * cellSize);
            archTop.rotation.z = (Math.random() - 0.5) * 0.5;
            archTop.castShadow = true;
            scene.add(archTop);
            
        } else {
            // Rubble pile
            const numRocks = 4 + Math.floor(Math.random() * 4);
            for (let r = 0; r < numRocks; r++) {
                const rockSize = 0.3 + Math.random() * 0.4;
                const rockGeometry = new THREE.DodecahedronGeometry(rockSize, 0);
                const rock = new THREE.Mesh(rockGeometry, ruinMaterial);
                rock.position.set(
                    px * cellSize + (Math.random() - 0.5) * 1.5,
                    rockSize * 0.5,
                    pz * cellSize + (Math.random() - 0.5) * 1.5
                );
                rock.rotation.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                );
                rock.castShadow = true;
                scene.add(rock);
            }
        }
    }
    
    // Return tree positions for note placement
    return treePositions;
}

// Create Angels - Level 2 monsters
function createAngels() {
    angels = [];
    
    const numAngels = 15 + Math.floor(Math.random() * 5); // 15-19 angels (added 3 more)
    
    for (let i = 0; i < numAngels; i++) {
        // Find random valid position
        let spawnX, spawnZ;
        let attempts = 0;
        let validPosition = false;
        
        do {
            const rx = 5 + Math.floor(Math.random() * (mazeSize - 10));
            const rz = 5 + Math.floor(Math.random() * (mazeSize - 10));
            
            spawnX = rx * cellSize + cellSize * 0.5;
            spawnZ = rz * cellSize + cellSize * 0.5;
            
            const testPos = new THREE.Vector3(spawnX, 1.5, spawnZ);
            validPosition = !checkCollision(testPos);
            
            // Also check distance from player
            const distFromPlayer = Math.sqrt(
                (spawnX - camera.position.x) ** 2 + 
                (spawnZ - camera.position.z) ** 2
            );
            if (distFromPlayer < 30) validPosition = false;
            
            attempts++;
        } while (!validPosition && attempts < 100);
        
        if (!validPosition) continue;
        
        // Create TERRIFYING Angel - tall, impossibly thin, unsettling
        const bodyGroup = new THREE.Group();
        
        // Ghostly pale material with eerie glow
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xd8d0c8,
            emissive: 0xeee8dd,
            emissiveIntensity: 0.4,
            roughness: 0.2,
            metalness: 0.1
        });
        
        // Darker material for contrast
        const darkMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a1a,
            emissive: 0x000000,
            roughness: 0.9
        });
        
        // TALL thin torso - elongated and skeletal
        const torsoGeometry = new THREE.CylinderGeometry(0.15, 0.25, 3.5, 8);
        const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
        torso.position.y = 2.5;
        bodyGroup.add(torso);
        
        // Ribcage detail - visible bones
        for (let r = 0; r < 5; r++) {
            const ribGeo = new THREE.TorusGeometry(0.18, 0.02, 4, 12, Math.PI);
            const rib = new THREE.Mesh(ribGeo, bodyMaterial);
            rib.position.set(0, 1.8 + r * 0.35, 0.05);
            rib.rotation.x = Math.PI / 2;
            rib.rotation.z = Math.PI;
            bodyGroup.add(rib);
        }
        
        // Lower body - tattered robe-like
        const robeGeometry = new THREE.ConeGeometry(0.4, 2.0, 8);
        const robe = new THREE.Mesh(robeGeometry, bodyMaterial);
        robe.position.y = 0.5;
        robe.rotation.x = Math.PI;
        bodyGroup.add(robe);
        
        // Elongated neck - unnaturally long
        const neckGeometry = new THREE.CylinderGeometry(0.06, 0.08, 0.8, 6);
        const neck = new THREE.Mesh(neckGeometry, bodyMaterial);
        neck.position.y = 4.6;
        bodyGroup.add(neck);
        
        // Head - gaunt, elongated skull shape
        const headGeometry = new THREE.SphereGeometry(0.25, 12, 12);
        headGeometry.scale(0.8, 1.4, 0.9);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.y = 5.3;
        bodyGroup.add(head);
        
        // Sunken eye sockets - dark voids
        const socketGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const leftSocket = new THREE.Mesh(socketGeo, darkMaterial);
        leftSocket.position.set(-0.10, 5.35, 0.18);
        leftSocket.scale.z = 0.5;
        bodyGroup.add(leftSocket);
        
        const rightSocket = new THREE.Mesh(socketGeo, darkMaterial);
        rightSocket.position.set(0.10, 5.35, 0.18);
        rightSocket.scale.z = 0.5;
        bodyGroup.add(rightSocket);
        
        // Glowing eyes inside sockets - piercing
        const eyeGeometry = new THREE.SphereGeometry(0.045, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffdd00,
            emissive: 0xffaa00,
            emissiveIntensity: 4
        });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.10, 5.35, 0.20);
        bodyGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.10, 5.35, 0.20);
        bodyGroup.add(rightEye);
        
        // Eye glow light
        const eyeGlow = new THREE.PointLight(0xffcc00, 0.8, 4);
        eyeGlow.position.set(0, 5.35, 0.25);
        bodyGroup.add(eyeGlow);
        
        // Gaping mouth - dark hollow
        const mouthGeo = new THREE.BoxGeometry(0.12, 0.06, 0.08);
        const mouth = new THREE.Mesh(mouthGeo, darkMaterial);
        mouth.position.set(0, 5.15, 0.20);
        bodyGroup.add(mouth);
        
        // LONG skeletal arms - disturbingly thin
        const upperArmGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.4, 6);
        const forearmGeo = new THREE.CylinderGeometry(0.025, 0.03, 1.3, 6);
        
        // Left arm
        const leftUpperArm = new THREE.Mesh(upperArmGeo, bodyMaterial);
        leftUpperArm.position.set(-0.25, 3.8, 0);
        leftUpperArm.rotation.z = 0.3;
        bodyGroup.add(leftUpperArm);
        
        const leftForearm = new THREE.Mesh(forearmGeo, bodyMaterial);
        leftForearm.position.set(-0.55, 2.7, 0);
        leftForearm.rotation.z = 0.15;
        bodyGroup.add(leftForearm);
        
        // Right arm
        const rightUpperArm = new THREE.Mesh(upperArmGeo, bodyMaterial);
        rightUpperArm.position.set(0.25, 3.8, 0);
        rightUpperArm.rotation.z = -0.3;
        bodyGroup.add(rightUpperArm);
        
        const rightForearm = new THREE.Mesh(forearmGeo, bodyMaterial);
        rightForearm.position.set(0.55, 2.7, 0);
        rightForearm.rotation.z = -0.15;
        bodyGroup.add(rightForearm);
        
        // Bony hands with long fingers
        const handGeo = new THREE.BoxGeometry(0.08, 0.06, 0.03);
        const leftHand = new THREE.Mesh(handGeo, bodyMaterial);
        leftHand.position.set(-0.65, 2.0, 0);
        bodyGroup.add(leftHand);
        
        const rightHand = new THREE.Mesh(handGeo, bodyMaterial);
        rightHand.position.set(0.65, 2.0, 0);
        bodyGroup.add(rightHand);
        
        // Long creepy fingers
        for (let f = 0; f < 4; f++) {
            const fingerGeo = new THREE.CylinderGeometry(0.008, 0.005, 0.25, 4);
            const leftFinger = new THREE.Mesh(fingerGeo, bodyMaterial);
            leftFinger.position.set(-0.65 + (f - 1.5) * 0.02, 1.8, 0);
            leftFinger.rotation.z = (f - 1.5) * 0.1;
            bodyGroup.add(leftFinger);
            
            const rightFinger = new THREE.Mesh(fingerGeo, bodyMaterial);
            rightFinger.position.set(0.65 + (f - 1.5) * 0.02, 1.8, 0);
            rightFinger.rotation.z = -(f - 1.5) * 0.1;
            bodyGroup.add(rightFinger);
        }
        
        // MASSIVE tattered wings - ragged and skeletal
        const wingMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xc8c0b8,
            emissive: 0xddd8d0,
            emissiveIntensity: 0.3,
            roughness: 0.3,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        
        // Wing bone structure
        const wingBoneGeo = new THREE.CylinderGeometry(0.02, 0.015, 2.5, 4);
        
        // Left wing bones
        const leftWingBone1 = new THREE.Mesh(wingBoneGeo, bodyMaterial);
        leftWingBone1.position.set(-0.3, 3.5, -0.1);
        leftWingBone1.rotation.z = Math.PI / 3;
        leftWingBone1.rotation.x = 0.2;
        bodyGroup.add(leftWingBone1);
        
        // Wing membrane - tattered
        const wingGeometry = new THREE.PlaneGeometry(2.5, 3.0, 4, 4);
        const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
        leftWing.position.set(-1.5, 3.2, -0.15);
        leftWing.rotation.y = Math.PI / 5;
        leftWing.rotation.z = 0.2;
        bodyGroup.add(leftWing);
        
        const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
        rightWing.position.set(1.5, 3.2, -0.15);
        rightWing.rotation.y = -Math.PI / 5;
        rightWing.rotation.z = -0.2;
        bodyGroup.add(rightWing);
        
        // Broken/cracked halo - corrupted divine
        const haloGeometry = new THREE.TorusGeometry(0.4, 0.03, 6, 24);
        const haloMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xccaa00,
            emissive: 0xaa8800,
            emissiveIntensity: 2
        });
        const halo = new THREE.Mesh(haloGeometry, haloMaterial);
        halo.position.y = 5.9;
        halo.rotation.x = Math.PI / 2;
        halo.rotation.z = 0.15; // Slightly tilted - imperfect
        bodyGroup.add(halo);
        
        // Dark ethereal aura around the Angel
        const auraGeo = new THREE.SphereGeometry(1.5, 8, 8);
        const auraMat = new THREE.MeshBasicMaterial({
            color: 0x111108,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide
        });
        const aura = new THREE.Mesh(auraGeo, auraMat);
        aura.position.y = 3;
        aura.scale.y = 2.5;
        bodyGroup.add(aura);
        
        bodyGroup.position.set(spawnX, 0, spawnZ);
        scene.add(bodyGroup);
        
        // Eerie glow light - positioned at chest height of tall angel
        const glowLight = new THREE.PointLight(0xeedd88, 2.5, 12);
        glowLight.position.copy(bodyGroup.position);
        glowLight.position.y = 3.5;
        scene.add(glowLight);
        
        // Secondary dimmer light at head for face illumination
        const headGlow = new THREE.PointLight(0xffcc66, 1, 6);
        headGlow.position.copy(bodyGroup.position);
        headGlow.position.y = 5.3;
        scene.add(headGlow);
        
        angels.push({
            mesh: bodyGroup,
            x: spawnX,
            y: spawnZ,
            velocity: new THREE.Vector3(0, 0, 0),
            speed: 0.05,
            eyes: [leftEye, rightEye],
            glow: glowLight,
            halo: halo,
            wings: [leftWing, rightWing],
            huntMode: false, // Angels have different behavior
            chargeTimer: 0
        });
    }
}


// Game loop
function gameLoop() {
    // Always continue the loop, even when paused
    requestAnimationFrame(gameLoop);
    
    // Pause game logic when not running OR when paused
    if (!game.running || game.paused) return;
    
    // Game logic runs even when note is visible (no pausing)
    updatePlayer();
    
    // Update monsters based on current level
    if (game.currentLevel === 1) {
        updateShadows();
        updateLowSanityFootsteps(); // Update overlapping footsteps when sanity is low
    } else if (game.currentLevel === 2) {
        updateAngels();
    }
    
    updateParticles();
    checkMatchPickups();
    // Only check battery pickups in level 1
    if (game.currentLevel === 1) {
        checkBatteryPickups();
    }
    checkNotePickup();
    
    // Randomly play ambience2.mp3 at random timestamps
    // Check every frame with low probability for random triggering
    if (Math.random() > 0.9985) { // Very low chance per frame (~1-2 times per minute)
        if (!sounds.ambience2) {
            sounds.ambience2 = new Audio('audio/ambience2.mp3');
            sounds.ambience2.volume = 0.15 * gameSettings.sfxVolume; // Lower volume
        }
        
        // Only play if not currently playing
        if (sounds.ambience2.paused) {
            // Set random start time (assuming file is ~30 seconds, adjust if needed)
            const randomStart = Math.random() * 25; // Random time between 0-25 seconds
            sounds.ambience2.currentTime = randomStart;
            sounds.ambience2.play().catch(e => console.log('Ambience2 play error:', e));
        }
    }
    
    // Always render the scene
    render();
    updateUI();
}

// Event listeners
document.getElementById('start-button').addEventListener('click', () => {
    console.log('Start button clicked');
    startGame();
});

// Don't auto-start - wait for button click
let menuMusic;
let menuMusicStarted = false;

window.addEventListener('load', () => {
    console.log('Page loaded, showing start screen');
    startScreen.style.display = 'flex';
    
    // Initialize main menu music
    menuMusic = new Audio('audio/main%20menu.mp3'); // URL encoded space
    menuMusic.loop = true;
    menuMusic.volume = 0.3; // Play softly at 30% volume
    
    // Try to play immediately (might be blocked by browser)
    menuMusic.play().catch(e => {
        console.log('Menu music autoplay prevented, will play on user interaction');
        menuMusicStarted = false;
    });
    
    // Add click listener to start screen to ensure music plays on any interaction
    startScreen.addEventListener('click', () => {
        if (!menuMusicStarted && menuMusic) {
            menuMusic.play().then(() => {
                menuMusicStarted = true;
                console.log('Menu music started');
            }).catch(e => console.log('Menu music play error:', e));
        }
    }, { once: false });
});

document.getElementById('restart-button').addEventListener('click', () => {
    deathScreen.style.display = 'none';
    
    // Clean up old game
    if (scene) {
        while(scene.children.length > 0) { 
            scene.remove(scene.children[0]); 
        }
    }
    if (renderer && renderer.domElement) {
        container.removeChild(renderer.domElement);
    }
    
    // Reset game state completely
    game.running = false;
    game.pointerLocked = false;
    game.currentLevel = 1; // Reset to level 1
    shadows = [];
    angels = []; // Clear angels
    weepingAngel = null;
    walls = [];
    particleSystems.length = 0;
    lightSources = [];
    batteryPickups = [];
    pillars = [];
    matchPickups = [];
    skybox = null;
    
    // Start fresh from level 1
    startGame();
});

document.getElementById('play-again-button').addEventListener('click', () => {
    victoryScreen.style.display = 'none';
    
    // Clean up old game completely
    if (scene) {
        while(scene.children.length > 0) { 
            scene.remove(scene.children[0]); 
        }
    }
    if (renderer && renderer.domElement) {
        container.removeChild(renderer.domElement);
    }
    
    // Stop all sounds
    if (sounds.soundtrack) {
        sounds.soundtrack.pause();
        sounds.soundtrack = null;
    }
    if (sounds.ambient) {
        sounds.ambient.stop();
        sounds.ambient = null;
    }
    
    // Reset game state completely
    game.running = false;
    game.pointerLocked = false;
    game.currentLevel = 1;
    shadows = [];
    angels = [];
    weepingAngel = null;
    walls = [];
    particleSystems.length = 0;
    lightSources = [];
    batteryPickups = [];
    pillars = [];
    matchPickups = [];
    noteObjects = [];
    skybox = null;
    scene = null;
    camera = null;
    renderer = null;
    
    // Return to main menu
    startScreen.style.display = 'flex';
});

// Mouse movement
document.addEventListener('mousemove', (e) => {
    if (!game.pointerLocked || !game.running) return;
    
    const sensitivity = gameSettings.cameraSensitivity;
    
    // Update camera rotation properly
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);
    
    euler.y -= e.movementX * sensitivity;
    euler.x -= e.movementY * sensitivity;
    
    // Clamp vertical rotation
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    
    camera.quaternion.setFromEuler(euler);
});

// Keyboard controls
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    switch(e.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space':
            if (!player.matchLit && player.matches > 0) {
                player.matchLit = true;
                player.matchTime = player.matchDuration;
                player.matches--;
                playMatchLight();
                
                // Show big match counter message
                const matchMessage = document.getElementById('match-counter-message');
                matchMessage.textContent = player.matches + '/5';
                matchMessage.classList.remove('show');
                // Force reflow to restart animation
                void matchMessage.offsetWidth;
                matchMessage.classList.add('show');
                
                // Remove class after animation
                setTimeout(() => {
                    matchMessage.classList.remove('show');
                }, 2000);
            }
            break;
        case 'KeyF':
            // Resume audio context on first interaction and WAIT for it
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    toggleFlashlight();
                });
            } else {
                toggleFlashlight();
            }
            break;
        case 'KeyZ':
            // Toggle god mode for testing
            player.godMode = !player.godMode;
            console.log('GOD MODE:', player.godMode ? 'ENABLED' : 'DISABLED');
            
            // Show/hide persistent indicator
            const godModeIndicator = document.getElementById('godmode-indicator');
            if (godModeIndicator) {
                godModeIndicator.style.display = player.godMode ? 'block' : 'none';
            }
            
            // Show temporary notification
            const godModeMsg = document.createElement('div');
            godModeMsg.style.position = 'fixed';
            godModeMsg.style.top = '20px';
            godModeMsg.style.left = '50%';
            godModeMsg.style.transform = 'translateX(-50%)';
            godModeMsg.style.color = player.godMode ? '#0f0' : '#f00';
            godModeMsg.style.fontSize = '24px';
            godModeMsg.style.fontWeight = 'bold';
            godModeMsg.style.textShadow = '0 0 10px currentColor';
            godModeMsg.style.zIndex = '10000';
            godModeMsg.textContent = 'GOD MODE: ' + (player.godMode ? 'ON' : 'OFF');
            document.body.appendChild(godModeMsg);
            setTimeout(() => godModeMsg.remove(), 2000);
            break;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    
    switch(e.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
});

// Resize handler
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});
// Settings Menu System
const settingsIcon = document.getElementById('settings-icon');
const settingsPanel = document.getElementById('settings-panel');
const settingsClose = document.getElementById('settings-close');
const settingsReset = document.getElementById('settings-reset');
const musicVolumeSlider = document.getElementById('music-volume');
const sfxVolumeSlider = document.getElementById('sfx-volume');
const cameraSensitivitySlider = document.getElementById('camera-sensitivity');
const musicVolumeValue = document.getElementById('music-volume-value');
const sfxVolumeValue = document.getElementById('sfx-volume-value');
const cameraSensitivityValue = document.getElementById('camera-sensitivity-value');

// Load settings from localStorage or use defaults
function loadSettings() {
    const saved = localStorage.getItem('gameSettings');
    if (saved) {
        const parsed = JSON.parse(saved);
        gameSettings.musicVolume = parsed.musicVolume || 0.3;
        gameSettings.sfxVolume = parsed.sfxVolume || 0.75;
        gameSettings.cameraSensitivity = parsed.cameraSensitivity || 0.002;
    }
    
    // Update sliders
    musicVolumeSlider.value = gameSettings.musicVolume * 100;
    sfxVolumeSlider.value = gameSettings.sfxVolume * 100;
    cameraSensitivitySlider.value = (gameSettings.cameraSensitivity / 0.002) * 100;
    
    // Update displays
    updateSettingsDisplay();
    applySettings();
}

// Save settings to localStorage
function saveSettings() {
    localStorage.setItem('gameSettings', JSON.stringify(gameSettings));
}

// Update display values
function updateSettingsDisplay() {
    musicVolumeValue.textContent = Math.round(gameSettings.musicVolume * 100) + '%';
    sfxVolumeValue.textContent = Math.round(gameSettings.sfxVolume * 100) + '%';
    cameraSensitivityValue.textContent = Math.round((gameSettings.cameraSensitivity / 0.002) * 100) + '%';
}

// Apply settings to game
function applySettings() {
    // Apply music volume
    if (menuMusic) {
        menuMusic.volume = gameSettings.musicVolume;
    }
    if (sounds.soundtrack) {
        sounds.soundtrack.volume = 0.05 * (gameSettings.musicVolume / 0.3); // Scale based on default
    }
    
    // Apply SFX volumes to all active sounds
    if (sounds.footstepAudio) {
        sounds.footstepAudio.volume = 1.0 * gameSettings.sfxVolume;
    }
    if (sounds.matchLightAudio) {
        sounds.matchLightAudio.volume = 0.5 * gameSettings.sfxVolume;
    }
    if (sounds.ambience2) {
        sounds.ambience2.volume = 0.15 * gameSettings.sfxVolume;
    }
    
    // Update monster footsteps
    monsterFootsteps.forEach(footstep => {
        if (footstep && footstep.volume > 0) {
            // Preserve relative volume but apply settings multiplier
            const baseVolume = footstep.volume / (gameSettings.sfxVolume || 1);
            footstep.volume = baseVolume * gameSettings.sfxVolume;
        }
    });
}

// Settings icon click
settingsIcon.addEventListener('click', () => {
    settingsPanel.classList.add('active');
});

// Close button click
settingsClose.addEventListener('click', () => {
    settingsPanel.classList.remove('active');
});

// Close when clicking outside
settingsPanel.addEventListener('click', (e) => {
    if (e.target === settingsPanel) {
        settingsPanel.classList.remove('active');
    }
});

// Music volume slider
musicVolumeSlider.addEventListener('input', (e) => {
    gameSettings.musicVolume = e.target.value / 100;
    updateSettingsDisplay();
    applySettings();
    saveSettings();
});

// SFX volume slider
sfxVolumeSlider.addEventListener('input', (e) => {
    gameSettings.sfxVolume = e.target.value / 100;
    updateSettingsDisplay();
    applySettings();
    saveSettings();
});

// Camera sensitivity slider
cameraSensitivitySlider.addEventListener('input', (e) => {
    gameSettings.cameraSensitivity = (e.target.value / 100) * 0.002;
    updateSettingsDisplay();
    saveSettings();
});

// Reset to defaults
settingsReset.addEventListener('click', () => {
    gameSettings.musicVolume = 0.3;
    gameSettings.sfxVolume = 0.75;
    gameSettings.cameraSensitivity = 0.002;
    
    musicVolumeSlider.value = 30;
    sfxVolumeSlider.value = 75;
    cameraSensitivitySlider.value = 100;
    
    updateSettingsDisplay();
    applySettings();
    saveSettings();
});

// Initialize settings on page load
loadSettings();

// Pause Menu System
const pauseMenu = document.getElementById('pause-menu');
const pauseResumeBtn = document.getElementById('pause-resume');
const pauseQuitBtn = document.getElementById('pause-quit');
const pauseMusicVolumeSlider = document.getElementById('pause-music-volume');
const pauseSfxVolumeSlider = document.getElementById('pause-sfx-volume');
const pauseCameraSensitivitySlider = document.getElementById('pause-camera-sensitivity');
const pauseMusicVolumeValue = document.getElementById('pause-music-volume-value');
const pauseSfxVolumeValue = document.getElementById('pause-sfx-volume-value');
const pauseCameraSensitivityValue = document.getElementById('pause-camera-sensitivity-value');
const pauseSettingsReset = document.getElementById('pause-settings-reset');

// Toggle pause menu
function togglePause() {
    if (!game.running) return; // Can't pause if game isn't running
    
    game.paused = !game.paused;
    
    if (game.paused) {
        pauseMenu.classList.add('active');
        // Unlock pointer when paused
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        // Sync pause menu sliders with current settings
        syncPauseMenuSettings();
        
        // Pause all sounds
        if (sounds.footstepAudio && !sounds.footstepAudio.paused) {
            sounds.footstepAudio.pause();
        }
        lowSanityFootsteps.forEach(fs => {
            if (!fs.paused) fs.pause();
        });
        monsterFootsteps.forEach(fs => {
            if (!fs.paused) fs.pause();
        });
    } else {
        pauseMenu.classList.remove('active');
        // Re-lock pointer when resuming
        container.requestPointerLock();
    }
}

// Sync pause menu settings with current values
function syncPauseMenuSettings() {
    pauseMusicVolumeSlider.value = gameSettings.musicVolume * 100;
    pauseSfxVolumeSlider.value = gameSettings.sfxVolume * 100;
    pauseCameraSensitivitySlider.value = (gameSettings.cameraSensitivity / 0.002) * 100;
    
    pauseMusicVolumeValue.textContent = Math.round(gameSettings.musicVolume * 100) + '%';
    pauseSfxVolumeValue.textContent = Math.round(gameSettings.sfxVolume * 100) + '%';
    pauseCameraSensitivityValue.textContent = Math.round((gameSettings.cameraSensitivity / 0.002) * 100) + '%';
}

// Resume button
pauseResumeBtn.addEventListener('click', () => {
    togglePause();
});

// Quit button
pauseQuitBtn.addEventListener('click', () => {
    // Stop the game
    game.running = false;
    game.paused = false;
    pauseMenu.classList.remove('active');
    
    // Stop all sounds
    if (sounds.footstepAudio) sounds.footstepAudio.pause();
    if (sounds.soundtrack) sounds.soundtrack.pause();
    if (sounds.ambience2) sounds.ambience2.pause();
    lowSanityFootsteps.forEach(fs => fs.pause());
    monsterFootsteps.forEach(fs => fs.pause());
    
    // Show start screen
    startScreen.style.display = 'flex';
    
    // Restart menu music
    if (menuMusic) {
        menuMusic.currentTime = 0;
        menuMusic.play().catch(e => console.log('Menu music error:', e));
    }
    
    // Clean up scene
    if (scene) {
        while(scene.children.length > 0) { 
            scene.remove(scene.children[0]); 
        }
    }
    if (renderer && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
    }
});

// Pause menu sliders
pauseMusicVolumeSlider.addEventListener('input', (e) => {
    gameSettings.musicVolume = e.target.value / 100;
    pauseMusicVolumeValue.textContent = Math.round(gameSettings.musicVolume * 100) + '%';
    musicVolumeValue.textContent = Math.round(gameSettings.musicVolume * 100) + '%';
    musicVolumeSlider.value = e.target.value;
    applySettings();
    saveSettings();
});

pauseSfxVolumeSlider.addEventListener('input', (e) => {
    gameSettings.sfxVolume = e.target.value / 100;
    pauseSfxVolumeValue.textContent = Math.round(gameSettings.sfxVolume * 100) + '%';
    sfxVolumeValue.textContent = Math.round(gameSettings.sfxVolume * 100) + '%';
    sfxVolumeSlider.value = e.target.value;
    applySettings();
    saveSettings();
});

pauseCameraSensitivitySlider.addEventListener('input', (e) => {
    gameSettings.cameraSensitivity = (e.target.value / 100) * 0.002;
    pauseCameraSensitivityValue.textContent = e.target.value + '%';
    cameraSensitivityValue.textContent = e.target.value + '%';
    cameraSensitivitySlider.value = e.target.value;
    saveSettings();
});

// Pause menu reset button
pauseSettingsReset.addEventListener('click', () => {
    gameSettings.musicVolume = 0.3;
    gameSettings.sfxVolume = 0.75;
    gameSettings.cameraSensitivity = 0.002;
    
    syncPauseMenuSettings();
    
    // Also sync main settings menu
    musicVolumeSlider.value = 30;
    sfxVolumeSlider.value = 75;
    cameraSensitivitySlider.value = 100;
    updateSettingsDisplay();
    
    applySettings();
    saveSettings();
});

// ESC key to toggle pause
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        togglePause();
    }
}, true); // Use capture phase to ensure it fires first
