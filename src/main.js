// ─────────────────────────────────────────────
//  DO OR DIE  –  Main (game loop, scene setup)
// ─────────────────────────────────────────────
'use strict';

// ── Loading progress helper ───────────────────
function setLoading(pct, msg) {
  const fill = document.getElementById('loadingFill');
  const text = document.getElementById('loadingText');
  if(fill) fill.style.width = pct + '%';
  if(text) text.textContent = msg;
}

function refreshHud() {
  UI.updateStatusBars(Player.health, Player.armor);
  UI.updateAmmo(Player.getActiveAmmo(), Player.getActiveWeapon());
  UI.updateWeaponSlots(Player.getInventory(), Player.getActiveSlot());
  UI.updateKills(Player.getKills());
  UI.updateAlive(Bots.getAll().length + 1);
  UI.clearKillFeed();
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

  // Player.die() already showed the game-over screen – stop the loop here.
  // Release pointer lock so the player can actually click the menu buttons.
  if(!playerAlive) {
    gameRunning = false;
    if(document.exitPointerLock) document.exitPointerLock();
    return;
  }

  Player.update(dt, Bots.getAliveBots());
  Bots.update(dt, playerPos, playerAlive);

  // Check win condition (never award a win when bot spawning yielded nobody)
  const aliveBots = Bots.getAliveCount();
  if(aliveBots === 0 && Bots.getAll().length > 0 && playerAlive) {
    gameRunning = false;
    if(document.exitPointerLock) document.exitPointerLock();
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
let loadingActive = false;

async function startGame() {
  if(loadingActive) return;          // ignore double-clicks on PLAY
  loadingActive = true;

  document.getElementById('mainMenu').style.display    = 'none';
  document.getElementById('loadingScreen').style.display = 'flex';

  let loadFinished = false;
  const core = { player:false, hud:false };
  let safetyTimer = null;

  // Safety net: never leave the player stuck on the loading screen.
  safetyTimer = setTimeout(() => {
    if(loadFinished) return;
    console.warn('[Main] Loading took longer than 10s – starting with whatever is ready');
    finishLoading();
  }, 10000);

  // Isolate every step so one failure is logged by name but never freezes
  // the rest of the loading sequence.
  async function runStep(label, pct, message, fn) {
    if(loadFinished) return null;
    setLoading(pct, message);
    await tick();
    try {
      const result = await fn();
      console.log(`[Main] ${label} OK`);
      return result;
    } catch(e) {
      console.error(`[Main] ${label} FAILED:`, e);
      return null;
    }
  }

  function finishLoading() {
    if(loadFinished) return;
    loadFinished = true;
    clearTimeout(safetyTimer);

    // The 10s fallback can fire before Player/HUD init completed. Make sure
    // the match is still playable rather than half-initialized.
    try {
      if(!core.player) { Player.init(scene); core.player = true; }
      if(!core.hud) {
        UI.showHUD();
        refreshHud();
        core.hud = true;
      }
    } catch(e) {
      console.error('[Main] Fallback system init FAILED:', e);
    }

    const loadingScreen = document.getElementById('loadingScreen');
    if(loadingScreen) loadingScreen.style.display = 'none';
    loadingActive = false;
    launchGame();
  }

  try {
    await runStep('Map', 5, 'BUILDING MAP...', () => GameMap.build(scene));
    await runStep('Loot', 25, 'SPAWNING LOOT...', () => Loot.populate(scene));
    await runStep('Weapons', 40, 'INITIALIZING WEAPONS...', () => Weapons.initTracers(scene));

    await runStep('Bots', 50, `SPAWNING BOTS... (0 / ${C.BOT_COUNT})`, () =>
      Bots.spawnAll(scene, (done, total) => {
        const pct = 50 + Math.round((done / total) * 25);
        setLoading(pct, `SPAWNING BOTS... (${done} / ${total})`);
      })
    );

    await runStep('Player', 78, 'SETTING UP PLAYER...', () => {
      Player.init(scene);
      core.player = true;
    });
    await runStep('Zone', 80, 'INITIALIZING ZONE...', () => Zone.init(scene));
    await runStep('Audio', 82, 'INITIALIZING AUDIO...', () => Audio.init());
    await runStep('Mobile', 85, 'INITIALIZING CONTROLS...', () => Mobile.init());

    await runStep('HUD', 90, 'BUILDING HUD...', () => {
      UI.showHUD();
      refreshHud();
      core.hud = true;
    });

    setLoading(100, 'READY!');
    await delay(250);
  } catch(e) {
    console.error('[Main] Unexpected error during loading:', e);
  } finally {
    // Always remove the loading screen and start, even if a step failed.
    finishLoading();
  }
}

// ── Separated launch so the safety timer can call it too ─────────
function launchGame() {
  if(gameRunning) return;   // idempotent

  document.getElementById('hud').style.display = 'block';

  try { Player.startParachute(scene); } catch(e) { console.error('[Main] Parachute start failed:', e); }

  gameRunning = true;
  matchStartTime = performance.now();
  UI.setMatchStartTime(matchStartTime);
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
  Weapons.reset();
  Zone.reset();
  Audio.stopAmbient();

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
// rAF paces the loading bar with rendering; the timer guarantees the promise
// resolves even when rAF is throttled/stopped (background tab, slow GPU).
function tick() {
  return new Promise(resolve => {
    let done = false;
    let timer = null;
    const finish = () => {
      if(done) return;
      done = true;
      if(timer !== null) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(finish, 100);
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    else finish();
  });
}
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
