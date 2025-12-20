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
let weepingAngel = null; // Special monster that follows player but stops when looked at
let matchLight, ambientLight, flashlight;
let monsterGlows = []; // Red glow lights for each monster
let clock = new THREE.Clock();

// Game state
const game = {
    running: false,
    startTime: 0,
    survivalTime: 0,
    pointerLocked: false
};

// Player state
const player = {
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    speed: 0.04,
    sprintSpeed: 0.09,
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
    batteryDrain: 0.015
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
const mazeSize = 20;
const cellSize = 8;
let exitCell = null;
let walls = [];
let floor, ceiling;
let matchPickups = [];
let wallMaterial; // Store wall material for reuse
let lightSources = []; // Track light sources in maze
let batteryPickups = []; // Track battery pickups

// Particles
const particleSystems = [];

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
    // Initialize looping footstep audio
    if (!sounds.footstepAudio) {
        sounds.footstepAudio = new Audio('footsteps.mp3');
        sounds.footstepAudio.loop = true;
        sounds.footstepAudio.volume = 0.99;
    }
    
    // Initialize match lighting audio
    if (!sounds.matchLightAudio) {
        sounds.matchLightAudio = new Audio('lighting a match.mp3');
        sounds.matchLightAudio.volume = 0.5;
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

function playFlashlightClick() {
    // Resume audio context if suspended (prevents freeze)
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
    scene.fog = new THREE.Fog(0x0a0a0a, 5, 35);
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(8, player.height, 8);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0a0a0a);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    // Lighting - base ambient light
    ambientLight = new THREE.AmbientLight(0x404050, 0.35);
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
    const numRooms = 8 + Math.floor(Math.random() * 8); // 8-15 open areas
    for (let i = 0; i < numRooms; i++) {
        // Random room position and size
        const roomX = 1 + Math.floor(Math.random() * (mazeSize - 8));
        const roomZ = 1 + Math.floor(Math.random() * (mazeSize - 8));
        const roomWidth = 3 + Math.floor(Math.random() * 5); // 3-7 cells wide
        const roomHeight = 3 + Math.floor(Math.random() * 5); // 3-7 cells tall
        
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
    
    // Place exit at far corner
    exitCell = { x: mazeSize - 1, z: mazeSize - 1 };
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
    
    const wallHeight = 4;
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
    
    // Floor with fleshy organic texture
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const floorCtx = floorCanvas.getContext('2d');
    
    // Base dark grey flesh
    floorCtx.fillStyle = '#1a1515';
    floorCtx.fillRect(0, 0, 512, 512);
    
    // Create organic flesh-like texture with veins and irregular patterns
    for (let i = 0; i < 400; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 5 + Math.random() * 20;
        
        // Random grey/red tones for flesh
        const grey = 15 + Math.random() * 25;
        const red = grey + Math.random() * 10;
        floorCtx.fillStyle = `rgba(${red}, ${grey * 0.7}, ${grey * 0.7}, ${0.3 + Math.random() * 0.4})`;
        
        // Irregular organic shapes
        floorCtx.beginPath();
        floorCtx.arc(x, y, size, 0, Math.PI * 2);
        floorCtx.fill();
    }
    
    // Add vein-like structures
    for (let i = 0; i < 80; i++) {
        const startX = Math.random() * 512;
        const startY = Math.random() * 512;
        const endX = startX + (Math.random() - 0.5) * 150;
        const endY = startY + (Math.random() - 0.5) * 150;
        
        // Darker red/grey veins
        const veinGrey = 8 + Math.random() * 12;
        const veinRed = veinGrey + Math.random() * 8;
        floorCtx.strokeStyle = `rgba(${veinRed}, ${veinGrey * 0.5}, ${veinGrey * 0.5}, 0.7)`;
        floorCtx.lineWidth = 1 + Math.random() * 3;
        floorCtx.beginPath();
        floorCtx.moveTo(startX, startY);
        floorCtx.lineTo(endX, endY);
        floorCtx.stroke();
    }
    
    // Add darker blotches for depth
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 3 + Math.random() * 10;
        
        const darkGrey = Math.random() * 12;
        floorCtx.fillStyle = `rgba(${darkGrey + 5}, ${darkGrey}, ${darkGrey}, 0.5)`;
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
    
    // Ceiling with texture
    const ceilingCanvas = document.createElement('canvas');
    ceilingCanvas.width = 256;
    ceilingCanvas.height = 256;
    const ceilingCtx = ceilingCanvas.getContext('2d');
    
    ceilingCtx.fillStyle = '#000000';
    ceilingCtx.fillRect(0, 0, 256, 256);
    
    // Add brown and red stains
    for (let i = 0; i < 120; i++) {
        const stainType = Math.random();
        let stainColor;
        if (stainType < 0.5) {
            // Brown stain
            const brown = 15 + Math.random() * 20;
            stainColor = `rgba(${brown}, ${brown * 0.4}, 0, ${Math.random() * 0.5})`;
        } else {
            // Red stain
            const red = 20 + Math.random() * 30;
            stainColor = `rgba(${red}, 0, 0, ${Math.random() * 0.5})`;
        }
        
        ceilingCtx.fillStyle = stainColor;
        ceilingCtx.beginPath();
        ceilingCtx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 60, 0, Math.PI * 2);
        ceilingCtx.fill();
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
    
    // Create exit door
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
        exitCell.x * cellSize,
        0,
        exitCell.z * cellSize
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
        exitCell.x * cellSize,
        2,
        exitCell.z * cellSize
    );
    scene.add(glow);
    
    // Add exit light
    const exitLight = new THREE.PointLight(0x00ff00, 0.5, 15);
    exitLight.position.set(exitCell.x * cellSize, 2, exitCell.z * cellSize);
    scene.add(exitLight);
    
    // Add decorative objects throughout maze
    addMazeDecor();
    
    // Add light sources throughout maze
    addLightSources();
    
    // Add battery pickups
    addBatteryPickups();
}

// Add light sources throughout maze
function addLightSources() {
    lightSources = [];
    
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
        
        // Create SPOTLIGHT (conical from ceiling to floor)
        const light = new THREE.SpotLight(0xff8844, 1.5, 20, Math.PI / 4, 0.3, 0.8);
        light.position.set(px, 3.8, pz); // Near ceiling
        light.castShadow = true;
        light.shadow.mapSize.width = 512;
        light.shadow.mapSize.height = 512;
        scene.add(light);
        
        // Spotlight target (pointing down)
        const target = new THREE.Object3D();
        target.position.set(px, 0, pz);
        scene.add(target);
        light.target = target;
        
        // Add visible bulb at ceiling
        const bulbGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const bulbMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa44,
            emissive: 0xffaa44,
            emissiveIntensity: 3
        });
        const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
        bulb.position.set(px, 3.8, pz);
        scene.add(bulb);
        
        // Add glow effect around bulb
        const glowGeometry = new THREE.SphereGeometry(0.4, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff8844,
            transparent: true,
            opacity: 0.5
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.set(px, 3.8, pz);
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
    const decorObjects = [];
    
    // Add only pillars that go from floor to ceiling - use wall material
    for (let x = 1; x < mazeSize - 1; x++) {
        for (let z = 1; z < mazeSize - 1; z++) {
            // Skip start and exit cells
            if ((x === 0 && z === 0) || (x === exitCell.x && z === exitCell.z)) continue;
            
            const random = Math.random();
            const px = x * cellSize;
            const pz = z * cellSize;
            
            if (random < 0.15) {
                // Pillar from floor to ceiling (4 units tall) - uses wall texture
                const geometry = new THREE.CylinderGeometry(0.25, 0.3, 4, 8);
                const pillar = new THREE.Mesh(geometry, wallMaterial);
                pillar.position.set(
                    px + (Math.random() - 0.5) * 2.5,
                    2,
                    pz + (Math.random() - 0.5) * 2.5
                );
                pillar.castShadow = true;
                pillar.receiveShadow = true;
                scene.add(pillar);
                decorObjects.push(pillar);
            }
        }
    }
}

// Create shadow creatures
function createShadows() {
    shadows = [];
    
    const numMonsters = 5 + Math.floor(Math.random() * 3); // 5-7 monsters
    
    for (let i = 0; i < numMonsters; i++) {
        // Find random valid position in maze (not in walls)
        let spawnX, spawnZ;
        let attempts = 0;
        let validPosition = false;
        
        do {
            // Choose cells away from edges and start/exit
            const rx = 3 + Math.floor(Math.random() * (mazeSize - 6));
            const rz = 3 + Math.floor(Math.random() * (mazeSize - 6));
            
            // Position in CENTER of cell (avoid walls at cell boundaries)
            spawnX = rx * cellSize;
            spawnZ = rz * cellSize;
            
            // Check if this position is valid (not in a wall)
            validPosition = isValidSpawnPosition(spawnX, spawnZ);
            attempts++;
        } while (!validPosition && attempts < 500);
        
        // Core shadow - elongated and distorted
        const geometry = new THREE.ConeGeometry(0.6, 2.5, 6);
        
        // All are Weeping Angels with texture
        const textureLoader = new THREE.TextureLoader();
        const angelTexture = textureLoader.load('monster.png');
        const material = new THREE.MeshBasicMaterial({ 
            map: angelTexture,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(spawnX, 1.5, spawnZ);
        mesh.rotation.x = Math.PI;
        scene.add(mesh);
        
        // Add dark aura
        const auraGeometry = new THREE.SphereGeometry(1.2, 8, 8);
        const auraMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x110011,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const aura = new THREE.Mesh(auraGeometry, auraMaterial);
        mesh.add(aura);
        
        // Add creepy floating tendrils
        for (let t = 0; t < 8; t++) {
            const tendrilGeometry = new THREE.BoxGeometry(0.08, 2, 0.08);
            const tendrilMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x1a001a,
                transparent: true,
                opacity: 0.7
            });
            const tendril = new THREE.Mesh(tendrilGeometry, tendrilMaterial);
            const angle = (t / 8) * Math.PI * 2;
            tendril.position.set(
                Math.cos(angle) * 0.6,
                -0.8,
                Math.sin(angle) * 0.6
            );
            tendril.rotation.z = Math.random() * Math.PI / 4;
            mesh.add(tendril);
        }
        
        // Particle system for shadow
        const particleCount = 100;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        
        for (let j = 0; j < particleCount; j++) {
            positions[j * 3] = (Math.random() - 0.5) * 3;
            positions[j * 3 + 1] = (Math.random() - 0.5) * 3;
            positions[j * 3 + 2] = (Math.random() - 0.5) * 3;
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
        particleSystem.position.copy(mesh.position);
        scene.add(particleSystem);
        
        // Eyes - large, glowing, and terrifying
        const eyeGeometry = new THREE.SphereGeometry(0.25, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 2
        });
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.35, 0.8, 0.4);
        rightEye.position.set(0.35, 0.8, 0.4);
        mesh.add(leftEye);
        mesh.add(rightEye);
        
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
    
    // Create WEEPING ANGEL - always follows player but stops when looked at
    // ALWAYS spawn directly IN FRONT of the player so they can see it immediately
    // Get camera direction and spawn ahead
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    
    // Spawn 20 units in front of camera in the direction it's facing
    const angelSpawnX = camera.position.x + (cameraDir.x * 20);
    const angelSpawnZ = camera.position.z + (cameraDir.z * 20);
    
    // Taller, more menacing figure
    const angelGeometry = new THREE.ConeGeometry(0.8, 3.2, 6);
    const angelMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x1a0000,
        transparent: true,
        opacity: 0.98,
        side: THREE.DoubleSide
    });
    const angelMesh = new THREE.Mesh(angelGeometry, angelMaterial);
    angelMesh.position.set(angelSpawnX, 1.8, angelSpawnZ);
    angelMesh.rotation.x = Math.PI;
    scene.add(angelMesh);
    
    // Dark red aura
    const angelAuraGeometry = new THREE.SphereGeometry(1.5, 8, 8);
    const angelAuraMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x330000,
        transparent: true,
        opacity: 0.4,
        side: THREE.BackSide
    });
    const angelAura = new THREE.Mesh(angelAuraGeometry, angelAuraMaterial);
    angelMesh.add(angelAura);
    
    // Larger, brighter red eyes
    const angelEyeGeometry = new THREE.SphereGeometry(0.35, 8, 8);
    const angelEyeMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 3
    });
    const angelLeftEye = new THREE.Mesh(angelEyeGeometry, angelEyeMaterial);
    const angelRightEye = new THREE.Mesh(angelEyeGeometry, angelEyeMaterial);
    angelLeftEye.position.set(-0.4, 1.0, 0.5);
    angelRightEye.position.set(0.4, 1.0, 0.5);
    angelMesh.add(angelLeftEye);
    angelMesh.add(angelRightEye);
    
    // Dark trailing particles
    const angelParticleCount = 150;
    const angelParticleGeometry = new THREE.BufferGeometry();
    const angelParticlePositions = new Float32Array(angelParticleCount * 3);
    
    for (let j = 0; j < angelParticleCount; j++) {
        angelParticlePositions[j * 3] = (Math.random() - 0.5) * 4;
        angelParticlePositions[j * 3 + 1] = (Math.random() - 0.5) * 4;
        angelParticlePositions[j * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    
    angelParticleGeometry.setAttribute('position', new THREE.BufferAttribute(angelParticlePositions, 3));
    const angelParticleMaterial = new THREE.PointsMaterial({
        color: 0x660000,
        size: 0.3,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending
    });
    const angelParticleSystem = new THREE.Points(angelParticleGeometry, angelParticleMaterial);
    angelParticleSystem.position.copy(angelMesh.position);
    scene.add(angelParticleSystem);
    
    weepingAngel = {
        mesh: angelMesh,
        particles: angelParticleSystem,
        velocity: new THREE.Vector3(),
        speed: 0.035, // Even slower and more manageable
        frozen: false,
        eyes: [angelLeftEye, angelRightEye],
        lastUnseenTime: Date.now()
    };
}

// Start game
function startGame() {
    console.log('Starting game...');
    
    // Stop and cleanup menu music
    if (menuMusic) {
        menuMusic.pause();
        menuMusic.currentTime = 0;
    }
    
    startScreen.style.display = 'none';
    game.running = true;
    game.startTime = Date.now();
    
    player.sanity = 100;
    player.matches = 10;
    player.matchLit = false;
    player.fear = 0;
    player.battery = 100;
    player.flashlight = true;
    
    // Initialize sound
    createSounds();
    sounds.ambient.start();
    
    // Initialize and play soundtrack
    if (!sounds.soundtrack) {
        sounds.soundtrack = new Audio('OST.mp3');
        sounds.soundtrack.loop = true;
        sounds.soundtrack.volume = 0.10; // 10% volume for atmospheric background
    }
    sounds.soundtrack.play().catch(e => console.log('Soundtrack autoplay prevented:', e));
    
    initThree();
    generateMaze();
    buildMaze();
    createShadows();
    
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
    const playerRadius = 0.4;
    
    for (const wall of walls) {
        const box = new THREE.Box3().setFromObject(wall);
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
    
    const isSprinting = keys['Shift'] && player.sanity > 20;
    const currentSpeed = isSprinting ? player.sprintSpeed : player.speed;
    
    // Direct movement - no momentum
    const moveVector = new THREE.Vector3();
    camera.getWorldDirection(moveVector);
    moveVector.y = 0;
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
    
    // Flashlight mechanics - always update position and target
    flashlight.position.copy(camera.position);
    
    const forwardVector = new THREE.Vector3();
    camera.getWorldDirection(forwardVector);
    
    flashlight.target.position.copy(camera.position).add(forwardVector.multiplyScalar(10));
    flashlight.target.updateMatrixWorld();
    
    if (player.flashlight && player.battery > 0) {
        player.battery -= player.batteryDrain;
        player.battery = Math.max(0, player.battery);
        
        // Keep flashlight bright - minimum 8, max 12
        flashlight.intensity = 8 + (4 * (player.battery / 100));
        flashlight.visible = true;
        
        if (player.battery <= 0) {
            player.flashlight = false;
            flashlight.intensity = 0;
            flashlight.visible = false;
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
    
    // Sanity mechanics - MORE INTENSE
    const nearShadow = shadows.some(s => {
        return camera.position.distanceTo(s.mesh.position) < 8;
    });
    const veryShadowClose = shadows.some(s => {
        return camera.position.distanceTo(s.mesh.position) < 4;
    });
    
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
    
    // Removed annoying heartbeat and breathing sounds
    
    player.sanity = Math.max(0, player.sanity);
    player.fear = 1 - (player.sanity / 100);
    
    // Ambient light based on sanity (always provide some base light)
    ambientLight.intensity = 0.35 + (player.sanity / 100) * 0.15;
    
    // Check exit door
    const exitPos = new THREE.Vector3(exitCell.x * cellSize, player.height, exitCell.z * cellSize);
    if (camera.position.distanceTo(exitPos) < 2.5) {
        victory();
    }
    
    // Death by sanity
    if (player.sanity <= 0) {
        gameOver("Your mind shattered in the darkness...");
    }
}

// Update shadows
function updateShadows() {
    // Track closest monster for radio static effect
    let closestMonsterDist = Infinity;
    
    // Check if match is lit and make nearby monsters flee
    const matchFleeRadius = 15; // Monsters within 15 units will flee
    
    for (const shadow of shadows) {
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
                    // Normal behavior: move toward player
                    direction.subVectors(camera.position, shadow.mesh.position).normalize();
                    
                    // Speed increases the longer it's unseen (up to 1.5x)
                    const speedMultiplier = Math.min(1.5, 1 + timeSinceUnseen * 0.1);
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
                
                // Eyes glow when moving
                shadow.eyes[0].visible = true;
                shadow.eyes[1].visible = true;
                shadow.eyes[0].material.emissiveIntensity = 3;
                shadow.eyes[1].material.emissiveIntensity = 3;
            } else {
                // FROZEN when being looked at
                shadow.lastUnseenTime = Date.now();
                shadow.velocity.set(0, 0, 0);
                
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
        if (dist < 1.5) {
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
    if (dist < 1.5) {
        gameOver("The Angel caught you in the darkness...");
    }
}

// Update atmospheric particles
function updateParticles() {
    for (const system of particleSystems) {
        system.rotation.y += 0.0005;
        const positions = system.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] += Math.sin(Date.now() / 1000 + i) * 0.001;
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
            
            // Play battery pickup sound
            if (audioContext && audioContext.state === 'suspended') {
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
    
    // ENHANCED VHS filter - much more pronounced and visible
    // (time variable already declared at start of render function)
    
    // Strong base VHS effects
    let filterString = 'saturate(0.5) contrast(1.6) sepia(0.35) ';
    
    // Heavy chromatic aberration
    const chromaticShift = Math.sin(time * 3) * 1.5 + 1.5;
    filterString += `hue-rotate(${chromaticShift * 6}deg) `;
    
    // Strong brightness flicker (VHS tape degradation)
    const flicker = 0.85 + Math.sin(time * 60) * 0.1 + Math.random() * 0.1;
    filterString += `brightness(${flicker}) `;
    
    // Frequent strong glitches
    if (Math.random() > 0.95) {
        filterString += `hue-rotate(${Math.random() * 60 - 30}deg) `;
        filterString += `contrast(${1 + Math.random() * 0.5}) `;
    }
    
    // Add noticeable grain/noise
    const grain = 0.05 + Math.random() * 0.05;
    filterString += `opacity(${1 - grain}) `;
    
    // Scanline simulation
    if (Math.floor(time * 10) % 2 === 0) {
        filterString += 'brightness(0.95) ';
    }
    
    // Static effect when monster is close
    if (closestMonsterDist < 12) {
        const staticIntensity = 1 - (closestMonsterDist / 12);
        filterString += `brightness(${1 + Math.random() * staticIntensity * 0.2}) `;
        filterString += `contrast(${1 + staticIntensity * 0.3}) `;
    }
    
    // Post-processing fear effects - MORE INTENSE
    if (player.fear > 0.4) {
        // Camera shake increases with fear
        const shake = (player.fear - 0.3) * 0.025;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.z += (Math.random() - 0.5) * shake;
        
        // Chromatic aberration and distortion
        if (Math.random() > 0.95) {
            const distortion = Math.floor(player.fear * 25);
            filterString += `hue-rotate(${Math.random() * distortion}deg) blur(${player.fear * 0.8}px)`;
        }
    }
    
    renderer.domElement.style.filter = filterString;
    
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
    const statusText = document.getElementById('status-text');
    const heartbeat = document.getElementById('heartbeat');
    
    sanityFill.style.width = player.sanity + '%';
    sanityText.textContent = Math.floor(player.sanity) + '%';
    matchesCount.textContent = player.matches;
    batteryFill.style.width = player.battery + '%';
    batteryText.textContent = Math.floor(player.battery) + '%';
    
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
    
    // Draw exit
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(
        exitCell.x * cellSize * scale,
        exitCell.z * cellSize * scale,
        4,
        0,
        Math.PI * 2
    );
    ctx.fill();
    
    // Draw light sources
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
    deathScreen.style.display = 'flex';
    document.getElementById('death-message').textContent = message;
    
    // Play jumpscare sound
    const jumpscareSound = new Audio('jumpscare.mp3');
    jumpscareSound.volume = 0.4; // Not too loud - 40% volume
    jumpscareSound.play().catch(e => console.log('Jumpscare sound error:', e));
}

// Victory
function victory() {
    game.running = false;
    game.survivalTime = Math.floor((Date.now() - game.startTime) / 1000);
    victoryScreen.style.display = 'flex';
    document.getElementById('survival-time').textContent = 
        `Time survived: ${game.survivalTime} seconds`;
}

// Game loop
function gameLoop() {
    if (!game.running) return;
    
    updatePlayer();
    updateShadows();
    updateWeepingAngel();
    updateParticles();
    checkMatchPickups();
    checkBatteryPickups();
    render();
    updateUI();
    
    // Randomly play ambience2.mp3 at random timestamps
    // Check every frame with low probability for random triggering
    if (Math.random() > 0.9985) { // Very low chance per frame (~1-2 times per minute)
        if (!sounds.ambience2) {
            sounds.ambience2 = new Audio('ambience2.mp3');
            sounds.ambience2.volume = 0.35; // Moderate volume
        }
        
        // Only play if not currently playing
        if (sounds.ambience2.paused) {
            // Set random start time (assuming file is ~30 seconds, adjust if needed)
            const randomStart = Math.random() * 25; // Random time between 0-25 seconds
            sounds.ambience2.currentTime = randomStart;
            sounds.ambience2.play().catch(e => console.log('Ambience2 play error:', e));
        }
    }
    
    requestAnimationFrame(gameLoop);
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
    menuMusic = new Audio('main%20menu.mp3'); // URL encoded space
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
    
    // Reset game state
    game.running = false;
    game.pointerLocked = false;
    shadows = [];
    weepingAngel = null;
    walls = [];
    particleSystems.length = 0;
    lightSources = [];
    batteryPickups = [];
    
    // Start fresh
    startGame();
});

document.getElementById('play-again-button').addEventListener('click', () => {
    victoryScreen.style.display = 'none';
    
    // Clean up old game
    if (scene) {
        while(scene.children.length > 0) { 
            scene.remove(scene.children[0]); 
        }
    }
    if (renderer && renderer.domElement) {
        container.removeChild(renderer.domElement);
    }
    
    // Reset game state
    game.running = false;
    game.pointerLocked = false;
    shadows = [];
    weepingAngel = null;
    walls = [];
    particleSystems.length = 0;
    lightSources = [];
    batteryPickups = [];
    
    // Start fresh
    startGame();
});

// Mouse movement
document.addEventListener('mousemove', (e) => {
    if (!game.pointerLocked || !game.running) return;
    
    const sensitivity = 0.002;
    
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
                matchMessage.textContent = player.matches + '/10';
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
            // Resume audio context on first interaction
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
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
