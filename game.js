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
let matchLight, ambientLight, flashlight;
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
    footstep: null,
    breathing: null,
    matchLight: null,
    flashlightToggle: null,
    shadowHunt: null,
    shadowIdle: null,
    lowSanity: null
};

let audioContext;
let footstepTimer = 0;

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
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    osc.type = 'brown';
    osc.frequency.setValueAtTime(80, audioContext.currentTime);
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.08);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start();
    osc.stop(audioContext.currentTime + 0.08);
}

function playMatchLight() {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(2000, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start();
    osc.stop(audioContext.currentTime + 0.2);
}

function playFlashlightClick() {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, audioContext.currentTime);
    
    gain.gain.setValueAtTime(0.15, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start();
    osc.stop(audioContext.currentTime + 0.05);
}

function playShadowSound(hunting = false) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(hunting ? 150 : 80, audioContext.currentTime);
    filter.type = 'lowpass';
    filter.frequency.value = hunting ? 400 : 200;
    
    gain.gain.setValueAtTime(hunting ? 0.08 : 0.03, audioContext.currentTime);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start();
    osc.stop(audioContext.currentTime + (hunting ? 0.3 : 0.5));
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
    ambientLight = new THREE.AmbientLight(0x404050, 0.15);
    scene.add(ambientLight);
    
    // Match light - yellow flickering
    matchLight = new THREE.PointLight(0xffdd44, 0, 12);
    matchLight.castShadow = true;
    matchLight.shadow.camera.near = 0.1;
    matchLight.shadow.camera.far = 12;
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
    
    // Very dark grimy stone texture
    wallCtx.fillStyle = '#0d0d0d';
    wallCtx.fillRect(0, 0, 256, 256);
    
    // Add dirt and grime layers
    for (let i = 0; i < 300; i++) {
        wallCtx.fillStyle = `rgba(${Math.random() * 30}, ${Math.random() * 20}, ${Math.random() * 10}, ${0.3 + Math.random() * 0.5})`;
        wallCtx.beginPath();
        wallCtx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 40, 0, Math.PI * 2);
        wallCtx.fill();
    }
    
    // Add moldy streaks
    for (let i = 0; i < 50; i++) {
        wallCtx.strokeStyle = `rgba(${Math.random() * 20}, ${10 + Math.random() * 20}, ${Math.random() * 10}, ${0.2 + Math.random() * 0.3})`;
        wallCtx.lineWidth = 2 + Math.random() * 8;
        wallCtx.beginPath();
        wallCtx.moveTo(Math.random() * 256, Math.random() * 256);
        wallCtx.lineTo(Math.random() * 256, Math.random() * 256);
        wallCtx.stroke();
    }
    
    // Add brick patterns with grime
    for (let y = 0; y < 256; y += 32) {
        for (let x = 0; x < 256; x += 64) {
            wallCtx.strokeStyle = '#050505';
            wallCtx.lineWidth = 1;
            wallCtx.strokeRect(x + (y % 64), y, 64, 32);
        }
    }
    
    const wallTexture = new THREE.CanvasTexture(wallCanvas);
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(2, 2);
    
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        map: wallTexture,
        roughness: 0.7,
        metalness: 0.1,
        emissive: 0x1a1a2e,
        emissiveIntensity: 0.3
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
    
    // Floor with texture
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const floorCtx = floorCanvas.getContext('2d');
    
    // Very dark grimy concrete base
    floorCtx.fillStyle = '#050505';
    floorCtx.fillRect(0, 0, 512, 512);
    
    // Heavy dirt and grime layers
    for (let i = 0; i < 500; i++) {
        floorCtx.fillStyle = `rgba(${Math.random() * 30}, ${Math.random() * 25}, ${Math.random() * 15}, ${Math.random() * 0.5})`;
        floorCtx.beginPath();
        floorCtx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 30, 0, Math.PI * 2);
        floorCtx.fill();
    }
    
    // Add water stains
    for (let i = 0; i < 100; i++) {
        floorCtx.fillStyle = `rgba(10, 20, 10, ${Math.random() * 0.4})`;
        floorCtx.beginPath();
        floorCtx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 50, 0, Math.PI * 2);
        floorCtx.fill();
    }
    
    // Add many cracks
    for (let i = 0; i < 80; i++) {
        floorCtx.strokeStyle = '#000000';
        floorCtx.lineWidth = 1 + Math.random() * 3;
        floorCtx.beginPath();
        floorCtx.moveTo(Math.random() * 512, Math.random() * 512);
        floorCtx.lineTo(Math.random() * 512, Math.random() * 512);
        floorCtx.stroke();
    }
    
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
    
    // Add heavy water stains and mold
    for (let i = 0; i < 150; i++) {
        ceilingCtx.fillStyle = `rgba(${Math.random() * 20}, ${20 + Math.random() * 30}, ${Math.random() * 15}, ${Math.random() * 0.6})`;
        ceilingCtx.beginPath();
        ceilingCtx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 50, 0, Math.PI * 2);
        ceilingCtx.fill();
    }
    
    // Add drip marks
    for (let i = 0; i < 40; i++) {
        ceilingCtx.strokeStyle = `rgba(10, 25, 10, ${Math.random() * 0.5})`;
        ceilingCtx.lineWidth = 2 + Math.random() * 6;
        const x = Math.random() * 256;
        ceilingCtx.beginPath();
        ceilingCtx.moveTo(x, Math.random() * 256);
        ceilingCtx.lineTo(x + (Math.random() - 0.5) * 20, Math.random() * 256);
        ceilingCtx.stroke();
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
}

// Add decorative objects to make maze more interesting
function addMazeDecor() {
    const decorObjects = [];
    
    // Create pillar material
    const pillarTexture = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a2e,
        roughness: 0.8,
        metalness: 0.2,
        emissive: 0x0a0a0a,
        emissiveIntensity: 0.2
    });
    
    // Add only pillars that go from floor to ceiling
    for (let x = 1; x < mazeSize - 1; x++) {
        for (let z = 1; z < mazeSize - 1; z++) {
            // Skip start and exit cells
            if ((x === 0 && z === 0) || (x === exitCell.x && z === exitCell.z)) continue;
            
            const random = Math.random();
            const px = x * cellSize;
            const pz = z * cellSize;
            
            if (random < 0.15) {
                // Pillar from floor to ceiling (4 units tall)
                const geometry = new THREE.CylinderGeometry(0.25, 0.3, 4, 8);
                const pillar = new THREE.Mesh(geometry, pillarTexture);
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
    
    for (let i = 0; i < 6; i++) {
        // Find random position in maze
        let rx, rz;
        do {
            rx = Math.floor(Math.random() * mazeSize);
            rz = Math.floor(Math.random() * mazeSize);
        } while ((rx === 0 && rz === 0) || (rx === exitCell.x && rz === exitCell.z));
        
        // Core shadow - elongated and distorted
        const geometry = new THREE.ConeGeometry(0.6, 2.5, 6);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x0a0a0a,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(rx * cellSize, 1.5, rz * cellSize);
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
        
        // Vary monster types for more engagement
        const monsterType = i % 3;
        let speed, detection, hearing, size;
        
        if (monsterType === 0) {
            // Fast but less perceptive
            speed = 0.05;
            detection = 12;
            hearing = 20;
            mesh.scale.set(0.8, 0.8, 0.8);
        } else if (monsterType === 1) {
            // Slow but very perceptive
            speed = 0.025;
            detection = 20;
            hearing = 30;
            mesh.scale.set(1.3, 1.3, 1.3);
        } else {
            // Balanced
            speed = 0.035;
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
            type: monsterType
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
}

// Start game
function startGame() {
    console.log('Starting game...');
    startScreen.style.display = 'none';
    game.running = true;
    game.startTime = Date.now();
    
    player.sanity = 100;
    player.matches = 5;
    player.matchLit = false;
    player.fear = 0;
    player.battery = 100;
    player.flashlight = true;
    
    // Initialize sound
    createSounds();
    sounds.ambient.start();
    
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
        const flicker = Math.sin(Date.now() / 50) * 0.5 + Math.random() * 0.8;
        matchLight.intensity = 3 + flicker;
        matchLight.distance = 12;
        matchLight.color.setHex(Math.random() > 0.9 ? 0xffaa00 : 0xffdd44);
        
        if (player.matchTime <= 0) {
            player.matchLit = false;
            matchLight.intensity = 0;
        }
    } else {
        matchLight.intensity = 0;
    }
    
    // Footstep sounds
    if ((moveForward || moveBackward || moveLeft || moveRight) && game.pointerLocked) {
        footstepTimer++;
        const stepInterval = player.sprinting ? 20 : 35;
        if (footstepTimer > stepInterval) {
            playFootstep();
            footstepTimer = 0;
        }
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
        // Sanity drains faster in darkness, even faster near shadows
        if (veryShadowClose) {
            player.sanity -= 0.5; // Very close to shadow
        } else if (nearShadow) {
            player.sanity -= 0.3; // Near shadow
        } else {
            player.sanity -= 0.12; // In darkness
        }
    }
    
    // Removed annoying heartbeat and breathing sounds
    
    player.sanity = Math.max(0, player.sanity);
    player.fear = 1 - (player.sanity / 100);
    
    // Ambient light based on sanity (always provide some base light)
    ambientLight.intensity = 0.15 + (player.sanity / 100) * 0.1;
    
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
    for (const shadow of shadows) {
        const dist = camera.position.distanceTo(shadow.mesh.position);
        
        // Detection logic - MORE AGGRESSIVE when sanity is low
        const sanityMultiplier = 1 + (1 - player.sanity / 100) * 2; // 1x to 3x detection range
        const effectiveDetection = shadow.detectionRadius * sanityMultiplier;
        const effectiveHearing = shadow.hearingRadius * sanityMultiplier;
        
        const canSeePlayer = !player.matchLit && dist < effectiveDetection;
        const canHearPlayer = player.sprinting && dist < effectiveHearing;
        const senseLowSanity = player.sanity < 40 && dist < 25; // Can sense low sanity
        
        shadow.hunting = canSeePlayer || canHearPlayer || senseLowSanity;
        
        if (shadow.hunting) {
            // Chase player with some variation
            const direction = new THREE.Vector3();
            direction.subVectors(camera.position, shadow.mesh.position).normalize();
            
            // Add some wandering even while hunting to make them less predictable
            const wanderOffset = new THREE.Vector3(
                Math.sin(Date.now() / 1000 + shadow.mesh.position.x) * 0.2,
                0,
                Math.cos(Date.now() / 1000 + shadow.mesh.position.z) * 0.2
            );
            direction.add(wanderOffset).normalize();
            
            // Speed increases with low sanity and proximity
            let chaseSpeed = shadow.speed;
            if (shadow.type === 0 && dist < 8) {
                chaseSpeed *= 1.5;
            }
            // Low sanity = faster monsters
            if (player.sanity < 40) {
                chaseSpeed *= 1.3;
            }
            if (player.sanity < 20) {
                chaseSpeed *= 1.5;
            }
            
            shadow.velocity.copy(direction.multiplyScalar(chaseSpeed));
            
            // Show eyes when hunting - glow brighter at low sanity
            shadow.eyes[0].visible = true;
            shadow.eyes[1].visible = true;
            const eyeIntensity = player.sanity < 40 ? 2 : 1;
            shadow.eyes[0].material.emissiveIntensity = eyeIntensity;
            shadow.eyes[1].material.emissiveIntensity = eyeIntensity;
            
            // Play hunting sound more frequently at low sanity
            const soundChance = player.sanity < 40 ? 0.98 : 0.99;
            if (Math.random() > soundChance && dist < 20) {
                playShadowSound(true);
            }
        } else {
            // Wander
            shadow.wanderTimer++;
            if (shadow.wanderTimer > 120) {
                shadow.wanderAngle = Math.random() * Math.PI * 2;
                shadow.wanderTimer = 0;
            }
            shadow.velocity.set(
                Math.cos(shadow.wanderAngle) * shadow.speed * 0.5,
                0,
                Math.sin(shadow.wanderAngle) * shadow.speed * 0.5
            );
            
            shadow.eyes[0].visible = false;
            shadow.eyes[1].visible = false;
            
            // Ambient shadow sounds
            if (Math.random() > 0.995 && dist < 20) {
                playShadowSound(false);
            }
        }
        
        // Move shadow
        const newPos = shadow.mesh.position.clone().add(shadow.velocity);
        newPos.y = 1.5; // Keep at consistent height
        
        if (!checkCollision(newPos)) {
            shadow.mesh.position.copy(newPos);
            shadow.particles.position.copy(newPos);
        } else {
            shadow.wanderAngle += Math.PI / 2;
        }
        
        // Rotate shadow to face player
        if (shadow.hunting) {
            shadow.mesh.lookAt(camera.position);
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

// Render scene
function render() {
    if (!renderer || !scene || !camera) {
        console.error('Renderer, scene, or camera not initialized!');
        return;
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
    
    // VHS filter - always active
    let filterString = 'saturate(0.9) contrast(1.1) ';
    
    // Add scanlines effect
    const scanlineOffset = (Date.now() % 1000) / 10;
    
    // Static effect when monster is close
    if (closestMonsterDist < 12) {
        const staticIntensity = 1 - (closestMonsterDist / 12);
        filterString += `brightness(${1 + Math.random() * staticIntensity * 0.15}) `;
        
        // Play static sound occasionally
        if (Math.random() > 0.97) {
            playStaticSound(staticIntensity);
        }
    }
    
    // Post-processing fear effects - MORE INTENSE
    if (player.fear > 0.4) {
        // Camera shake increases with fear
        const shake = (player.fear - 0.3) * 0.025;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.z += (Math.random() - 0.5) * shake;
        
        // Chromatic aberration and distortion
        if (Math.random() > 0.95) {
            const distortion = Math.floor(player.fear * 20);
            filterString += `hue-rotate(${Math.random() * distortion}deg) blur(${player.fear * 0.5}px)`;
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
    updateParticles();
    checkMatchPickups();
    render();
    updateUI();
    
    requestAnimationFrame(gameLoop);
}

// Event listeners
document.getElementById('start-button').addEventListener('click', () => {
    console.log('Start button clicked');
    startGame();
});

// Don't auto-start - wait for button click
window.addEventListener('load', () => {
    console.log('Page loaded, showing start screen');
    startScreen.style.display = 'flex';
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
    walls = [];
    particleSystems.length = 0;
    
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
    walls = [];
    particleSystems.length = 0;
    
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
            }
            break;
        case 'KeyF':
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
