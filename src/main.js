// ─────────────────────────────────────────────
//  DO OR DIE  –  Main (game loop, scene setup)
// ─────────────────────────────────────────────
'use strict';

// ── Loading progress helper ───────────────────
function setLoading(pct, msg) {
  document.getElementById('loadingFill').style.width = pct+'%';
  document.getElementById('loadingText').textContent = msg;
}

// ── Three.js scene ────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('gameCanvas'),
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x87ceeb);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd0eeff, 0.0025);

// Lights
const ambientLight = new THREE.AmbientLight(0xfff4e0, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.1);
sunLight.position.set(100, 200, 80);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 500;
sunLight.shadow.camera.left = -200;
sunLight.shadow.camera.right = 200;
sunLight.shadow.camera.top = 200;
sunLight.shadow.camera.bottom = -200;
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x44aa44, 0.3);
scene.add(hemiLight);

// ── Game state ────────────────────────────────
let gameRunning = false;
let gamePaused  = false;
let matchStartTime = 0;
let lastTime = 0;
const clock = new THREE.Clock();

// ── Pointer lock ──────────────────────────────
function requestPointerLock() {
  document.body.requestPointerLock =
    document.body.requestPointerLock ||
    document.body.mozRequestPointerLock;
  document.body.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  gamePaused = !document.pointerLockElement;
});
document.addEventListener('mozpointerlockchange', () => {
  gamePaused = !document.mozPointerLockElement;
});

document.getElementById('gameCanvas').addEventListener('click', () => {
  if(gameRunning) requestPointerLock();
});

// ── Window resize ─────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const cam = Player.getCamera();
  if(cam) {
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
  }
});

// ── Game loop ────────────────────────────────
function gameLoop() {
  if(!gameRunning) return;
  requestAnimationFrame(gameLoop);

  const dt = Math.min(clock.getDelta(), 0.05); // cap at 50ms
  if(gamePaused && document.pointerLockElement) gamePaused = false;

  // Update systems
  Weapons.updateTracers(dt);
  Weapons.updateHitParticles(dt, scene);
  Loot.update(dt);
  Zone.update(dt);

  const playerPos = Player.getPosition();
  const playerAlive = Player.isAlive();

  Player.update(dt, Bots.getAliveBots());
  Bots.update(dt, playerPos, playerAlive);

  // Check win condition
  const aliveBots = Bots.getAliveCount();
  if(aliveBots === 0 && playerAlive) {
    gameRunning = false;
    UI.showWinScreen(Player.getKills());
    return;
  }

  // HUD updates
  UI.updateAlive(aliveBots + (playerAlive ? 1 : 0));
  UI.updateZoneTimer(Zone.getPhaseText());
  UI.drawMinimap(playerPos, Bots.getAll());

  // Render
  renderer.render(scene, Player.getCamera());
}

// ── Start Game ────────────────────────────────
async function startGame() {
  document.getElementById('mainMenu').style.display    = 'none';
  document.getElementById('loadingScreen').style.display = 'flex';

  // Safety: hide loading screen after 10 s no matter what
  const safetyTimer = setTimeout(() => {
    console.warn('[Main] Safety timeout fired – forcing game start');
    document.getElementById('loadingScreen').style.display = 'none';
    if(!gameRunning) launchGame();
  }, 10000);

  try {
    // ── Step 1: Map ──────────────────────────────────────────────
    setLoading(5, 'BUILDING MAP...');
    await tick();
    try {
      GameMap.build(scene);
      console.log('[Main] Map built OK');
    } catch(e) {
      console.error('[Main] Map build FAILED:', e);
    }

    // ── Step 2: Loot ─────────────────────────────────────────────
    setLoading(25, 'SPAWNING LOOT...');
    await tick();
    try {
      Loot.populate(scene);
      console.log('[Main] Loot populated OK');
    } catch(e) {
      console.error('[Main] Loot populate FAILED:', e);
    }

    // ── Step 3: Weapon tracers ────────────────────────────────────
    setLoading(40, 'INITIALIZING WEAPONS...');
    await tick();
    try {
      Weapons.initTracers(scene);
      console.log('[Main] Weapon tracers OK');
    } catch(e) {
      console.error('[Main] Weapons init FAILED:', e);
    }

    // ── Step 4: Bots (async batched, 5 per frame) ─────────────────
    setLoading(50, 'SPAWNING BOTS... (0 / ' + C.BOT_COUNT + ')');
    await tick();
    try {
      await Bots.spawnAll(scene, (done, total) => {
        const pct = 50 + Math.round((done / total) * 25);
        setLoading(pct, 'SPAWNING BOTS... (' + done + ' / ' + total + ')');
      });
      console.log('[Main] Bots spawned OK:', Bots.getAll().length);
    } catch(e) {
      console.error('[Main] Bot spawn FAILED:', e);
    }

    // ── Step 5: Player / Zone / Audio / Mobile ────────────────────
    setLoading(78, 'SETTING UP PLAYER...');
    await tick();
    try {
      Player.init(scene);
      console.log('[Main] Player init OK');
    } catch(e) {
      console.error('[Main] Player init FAILED:', e);
    }

    try { Zone.init(scene);  } catch(e) { console.error('[Main] Zone init FAILED:', e); }
    try { Audio.init();      } catch(e) { console.error('[Main] Audio init FAILED:', e); }
    try { Mobile.init();     } catch(e) { console.error('[Main] Mobile init FAILED:', e); }

    // ── Step 6: HUD ───────────────────────────────────────────────
    setLoading(90, 'BUILDING HUD...');
    await tick();
    try {
      UI.showHUD();
      UI.updateStatusBars(100, 0);
      UI.updateAlive(C.BOT_COUNT + 1);
      console.log('[Main] HUD OK');
    } catch(e) {
      console.error('[Main] HUD FAILED:', e);
    }

    setLoading(100, 'READY!');
    await delay(250);

  } catch(outerErr) {
    console.error('[Main] Unexpected error during loading:', outerErr);
  }

  // Always clear the loading screen and start
  clearTimeout(safetyTimer);
  document.getElementById('loadingScreen').style.display = 'none';
  launchGame();
}

// ── Separated launch so the safety timer can call it too ─────────
function launchGame() {
  if(gameRunning) return;   // idempotent

  document.getElementById('hud').style.display = 'block';

  try { Player.startParachute(scene); } catch(e) { console.error('[Main] Parachute start failed:', e); }

  gameRunning = true;
  matchStartTime = performance.now();
  clock.start();

  try { Audio.startAmbient(); } catch(e) {}
  try { requestPointerLock(); } catch(e) {}

  gameLoop();
  console.log('[Main] Game launched! Bots alive:', Bots.getAliveCount());
}

function resetGame() {
  // Clear all scene children except the lights we added at the top
  while(scene.children.length > 0) scene.remove(scene.children[0]);

  // Re-add lights
  scene.add(ambientLight);
  scene.add(sunLight);
  scene.add(hemiLight);

  // Reset module state
  Bots.reset();
  Loot.reset();
  GameMap.reset();

  document.getElementById('gameOverScreen').style.display='none';
  document.getElementById('winScreen').style.display='none';
  document.getElementById('hud').style.display='none';
  document.getElementById('parachuteScreen').style.display='none';
  document.getElementById('zoneWarning').style.display='none';
  document.getElementById('zoneVignette').style.display='none';

  gameRunning = false;
  gamePaused = false;
  if(document.exitPointerLock) document.exitPointerLock();
}

// ── Helpers ───────────────────────────────────
function tick() { return new Promise(r => requestAnimationFrame(r)); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Menu buttons ──────────────────────────────
document.getElementById('btnPlay').addEventListener('click', () => {
  Audio.init(); Audio.play('ui_click'); startGame();
});

document.getElementById('btnSettings').addEventListener('click', () => {
  Audio.play('ui_click');
  document.getElementById('settingsMenu').style.display='flex';
});

document.getElementById('btnSettingsBack').addEventListener('click', () => {
  Audio.play('ui_click');
  document.getElementById('settingsMenu').style.display='none';
});

document.getElementById('btnPlayAgain').addEventListener('click', () => {
  resetGame(); startGame();
});
document.getElementById('btnGoMenu').addEventListener('click', () => {
  resetGame();
  document.getElementById('mainMenu').style.display='flex';
});
document.getElementById('btnWinPlay').addEventListener('click', () => {
  resetGame(); startGame();
});
document.getElementById('btnWinMenu').addEventListener('click', () => {
  resetGame();
  document.getElementById('mainMenu').style.display='flex';
});

// ── Settings ──────────────────────────────────
document.getElementById('settingSens').addEventListener('input', e => {
  Player.setSensitivity(parseInt(e.target.value));
});
document.getElementById('settingMusic').addEventListener('input', e => {
  Audio.setVolume('music', parseInt(e.target.value)/100);
});
document.getElementById('settingSFX').addEventListener('input', e => {
  Audio.setVolume('sfx', parseInt(e.target.value)/100);
});
document.getElementById('settingGfx').addEventListener('change', e => {
  if(e.target.value==='low') {
    renderer.setPixelRatio(1);
    scene.fog.density = 0.004;
  } else if(e.target.value==='medium') {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    scene.fog.density = 0.0025;
  } else {
    renderer.setPixelRatio(window.devicePixelRatio);
    scene.fog.density = 0.0015;
  }
});

// ── Hide loading on ready ─────────────────────
window.addEventListener('load', () => {
  document.getElementById('loadingScreen').style.display='none';
  document.getElementById('mainMenu').style.display='flex';
});
