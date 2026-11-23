// ─────────────────────────────────────────────
//  DO OR DIE  –  Player
// ─────────────────────────────────────────────
'use strict';

const Player = (() => {
  // ── State ──────────────────────────────────────────────────────
  let health = C.MAX_HEALTH;
  let armor = 0;
  let kills = 0;
  let alive = true;
  let isParachuting = false;
  let hasLanded = false;

  // Position / physics
  const pos = new THREE.Vector3(0, 100, 0);
  const vel = new THREE.Vector3();
  let onGround = false;
  let isCrouching = false;
  let isSprinting = false;
  let currentHeight = C.PLAYER_HEIGHT;

  // Camera
  let yaw = 0;    // horizontal look
  let pitch = 0;  // vertical look
  let isAiming = false;
  const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1200);
  const cameraTarget = new THREE.Vector3();

  // Weapons / inventory
  const inventory = [null, null, null]; // weapon keys
  const ammo = {}; // key: { current, reserve }
  let activeSlot = 0;
  let reloading = false;
  let reloadTimer = 0;
  let fireCooldown = 0;

  // References
  let scene = null;
  let meshGroup = null;   // player visual
  let weaponMesh = null;  // current weapon 3D in-world (held)
  let weaponViewMesh = null; // first-person viewmodel group attached to cam

  // Footstep
  let stepTimer = 0;
  const STEP_INTERVAL = 0.42;

  // Parachute state
  let planeT = 0;
  let paraOpen = false;
  let paraSpeed = C.PARA_FALL_SPEED;
  let planeDir = new THREE.Vector3(1,0,0);
  let planeMesh = null;
  let paraMesh = null;
  let paraLanded = false;

  // ── Build player mesh ──────────────────────────────────────────
  function buildMesh(scn) {
    meshGroup = new THREE.Group();

    // Body — Cylinder + caps (CapsuleGeometry only in Three.js r142+, we use r128)
    const bodyMat = new THREE.MeshLambertMaterial({color: 0x2255cc});
    const torsoGeo = new THREE.CylinderGeometry(C.PLAYER_RADIUS, C.PLAYER_RADIUS, C.PLAYER_HEIGHT - C.PLAYER_RADIUS*2, 8);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = C.PLAYER_HEIGHT / 2;
    torso.castShadow = true;
    meshGroup.add(torso);
    // Top cap
    const topCap = new THREE.Mesh(new THREE.SphereGeometry(C.PLAYER_RADIUS, 8, 6), bodyMat);
    topCap.position.y = C.PLAYER_HEIGHT - C.PLAYER_RADIUS;
    meshGroup.add(topCap);
    // Bottom cap
    const botCap = new THREE.Mesh(new THREE.SphereGeometry(C.PLAYER_RADIUS, 8, 6), bodyMat);
    botCap.position.y = C.PLAYER_RADIUS;
    meshGroup.add(botCap);

    // Head
    const headGeo = new THREE.BoxGeometry(0.5,0.5,0.5);
    const headMat = new THREE.MeshLambertMaterial({color: 0xf4c88a});
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = C.PLAYER_HEIGHT + 0.1;
    head.castShadow = true;
    meshGroup.add(head);

    // Helmet
    const helmGeo = new THREE.BoxGeometry(0.55,0.3,0.55);
    const helmMat = new THREE.MeshLambertMaterial({color:0x334455});
    const helm = new THREE.Mesh(helmGeo, helmMat);
    helm.position.y = C.PLAYER_HEIGHT + 0.3;
    meshGroup.add(helm);

    scn.add(meshGroup);
    meshGroup.position.copy(pos);
    return meshGroup;
  }

  // ── Build parachute plane + chute ─────────────────────────────
  function buildParachuteMeshes(scn) {
    // Plane
    const planeGrp = new THREE.Group();
    const fuselage = new THREE.Mesh(
      new THREE.BoxGeometry(1.5,0.8,8),
      new THREE.MeshLambertMaterial({color:0x888888})
    );
    planeGrp.add(fuselage);
    const wingGeo = new THREE.BoxGeometry(16,0.2,2);
    const wing = new THREE.Mesh(wingGeo, new THREE.MeshLambertMaterial({color:0x666666}));
    planeGrp.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(3,2,0.3), new THREE.MeshLambertMaterial({color:0x666666}));
    tail.position.set(0,0.8,-3.5);
    planeGrp.add(tail);
    scn.add(planeGrp);
    planeMesh = planeGrp;

    // Parachute canopy
    const paraGrp = new THREE.Group();
    const canopyGeo = new THREE.SphereGeometry(2.5,10,8,0,Math.PI*2,0,Math.PI/2);
    const canopyMat = new THREE.MeshLambertMaterial({color:0xff4400,side:THREE.DoubleSide});
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 4;
    paraGrp.add(canopy);
    // Strings
    for(let i=0;i<8;i++){
      const angle = (i/8)*Math.PI*2;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(angle)*2.4, 4-0.3, Math.sin(angle)*2.4),
        new THREE.Vector3(0,0,0)
      ]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({color:0xffffff}));
      paraGrp.add(line);
    }
    paraGrp.visible = false;
    scn.add(paraGrp);
    paraMesh = paraGrp;
  }

  // ── Weapon slot helpers ────────────────────────────────────────
  function equipWeapon(slot, type) {
    inventory[slot] = type;
    if(!ammo[type]) {
      const cfg = C.WEAPONS[type];
      ammo[type] = { current: cfg.ammoMax, reserve: cfg.reserveMax };
    }
  }

  function getActiveWeapon() { return inventory[activeSlot]; }
  function getActiveAmmo() {
    const wt = getActiveWeapon();
    if(!wt) return {current:0, reserve:0};
    return ammo[wt] || {current:0,reserve:0};
  }

  function switchSlot(n) {
    if(n===activeSlot) return;
    activeSlot = n;
    reloading = false;
    updateWeaponMesh();
    UI.updateWeaponSlots(inventory, activeSlot);
    UI.updateAmmo(getActiveAmmo(), getActiveWeapon());
  }

  function updateWeaponMesh() {
    if(weaponViewMesh) { camera.remove(weaponViewMesh); weaponViewMesh=null; }
    const wt = getActiveWeapon();
    if(!wt) return;
    weaponViewMesh = Weapons.buildWeaponMesh(wt);
    // Position on right side, in front of camera
    weaponViewMesh.position.set(0.35, -0.3, -0.6);
    weaponViewMesh.rotation.y = Math.PI;
    camera.add(weaponViewMesh);
  }

  // ── Input ──────────────────────────────────────────────────────
  const keys = {};
  let mouseButtons = { left:false, right:false };
  let mouseDX = 0, mouseDY = 0;
  let sensitivity = 0.002;

  function setupInput() {
    document.addEventListener('keydown', e => {
      keys[e.code] = true;
      if(e.code==='KeyR') tryReload();
      if(e.code==='Digit1') switchSlot(0);
      if(e.code==='Digit2') switchSlot(1);
      if(e.code==='Digit3') switchSlot(2);
      if(e.code==='KeyE') tryPickup();
      if(e.code==='KeyF' && isParachuting) land();
    });
    document.addEventListener('keyup', e => { keys[e.code] = false; });
    document.addEventListener('mousedown', e => {
      if(e.button===0) mouseButtons.left = true;
      if(e.button===2) { mouseButtons.right=true; isAiming=true; }
    });
    document.addEventListener('mouseup', e => {
      if(e.button===0) mouseButtons.left = false;
      if(e.button===2) { mouseButtons.right=false; isAiming=false; }
    });
    document.addEventListener('mousemove', e => {
      mouseDX += e.movementX;
      mouseDY += e.movementY;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── Pickup ─────────────────────────────────────────────────────
  function tryPickup() {
    const item = Loot.getNearbyItem(pos, 2.8);
    if(!item) return;
    if(item.type === 'weapon') {
      // Find empty slot or replace slot 0
      let slot = inventory.indexOf(null);
      if(slot === -1) slot = activeSlot; // replace active
      equipWeapon(slot, item.weaponType);
      if(slot === activeSlot) updateWeaponMesh();
      UI.showPickupMsg(C.WEAPONS[item.weaponType].name);
    } else if(item.type === 'medkit') {
      health = Math.min(C.MAX_HEALTH, health + C.MEDKIT_HEAL);
      Audio.play('heal');
      UI.showPickupMsg('Med Kit');
    } else if(item.type === 'armor') {
      armor = Math.min(C.MAX_ARMOR, armor + C.ARMOR_AMOUNT);
      UI.showPickupMsg('Armor Vest');
    } else if(item.type === 'helmet') {
      armor = Math.min(C.MAX_ARMOR, armor + 25);
      UI.showPickupMsg('Helmet');
    } else if(item.type === 'ammo') {
      const wt = getActiveWeapon();
      if(wt) {
        const a = ammo[wt];
        a.reserve = Math.min(C.WEAPONS[wt].reserveMax, a.reserve + C.WEAPONS[wt].ammoMax);
        UI.showPickupMsg('Ammo');
      } else {
        UI.showPickupMsg('Ammo (no weapon)');
      }
    }
    Audio.play('pickup');
    Loot.removeItem(item);
    UI.updateAmmo(getActiveAmmo(), getActiveWeapon());
    UI.updateStatusBars(health, armor);
  }

  // ── Reload ────────────────────────────────────────────────────
  function tryReload() {
    const wt = getActiveWeapon();
    if(!wt || reloading) return;
    const a = ammo[wt];
    if(!a || a.reserve<=0 || a.current>=C.WEAPONS[wt].ammoMax) return;
    reloading = true;
    reloadTimer = 1.8;
    Audio.play('reload');
    UI.showReloadIndicator(true);
  }

  // ── Shoot ────────────────────────────────────────────────────
  function tryShoot(dt, bots) {
    const wt = getActiveWeapon();
    if(!wt || reloading) return;
    const cfg = C.WEAPONS[wt];
    if(fireCooldown > 0) return;
    if(cfg.type==='auto' && !mouseButtons.left) return;
    if(cfg.type!=='auto' && !mouseButtons.left) return; // handled via click

    const a = ammo[wt];
    if(!a || a.current<=0) { tryReload(); return; }

    a.current--;
    fireCooldown = 1/cfg.fireRate;

    // Recoil (pitch up)
    pitch -= cfg.recoil + Math.random()*cfg.recoil*0.5;
    pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/3, pitch));

    // Muzzle flash
    if(weaponViewMesh) {
      const flash = weaponViewMesh.getObjectByName('muzzleFlash');
      if(flash) { flash.visible=true; setTimeout(()=>flash.visible=false, 60); }
    }

    // Sound
    const soundKey = 'shoot_' + (wt==='ar'?'ar': wt==='smg'?'smg': wt==='shotgun'?'shotgun':
      wt==='sniper'?'sniper':'pistol');
    Audio.play(soundKey);

    // Raycast
    const hits = Weapons.shoot(scene, camera, wt, bots, (target, dmg) => {
      target.takeDamage(dmg);
      if(target.health <= 0 && target.alive) {
        target.die();
        kills++;
        UI.addKillFeed('YOU', target.name, C.WEAPONS[wt].name);
        UI.updateKills(kills);
      }
      UI.showHitMarker();
      UI.showDamageNumber(dmg);
    });

    UI.updateAmmo(getActiveAmmo(), getActiveWeapon());

    // Auto-reload
    if(a.current === 0) tryReload();
  }

  // ── Parachute ──────────────────────────────────────────────────
  function startParachute(scn) {
    isParachuting = true;
    hasLanded = false;
    paraLanded = false;
    paraOpen = false;
    paraSpeed = C.PARA_FALL_SPEED;
    planeT = 0;

    // Start at plane height, random across map
    pos.set((Math.random()-0.5)*300, C.PARA_PLANE_HEIGHT, (Math.random()-0.5)*300);
    planeDir.set(Math.random()-0.5, 0, Math.random()-0.5).normalize();

    buildParachuteMeshes(scn);
    document.getElementById('parachuteScreen').style.display='flex';
  }

  function land() {
    isParachuting = false;
    hasLanded = true;
    paraLanded = true;
    if(paraMesh) paraMesh.visible=false;
    if(planeMesh) planeMesh.visible=false;
    document.getElementById('parachuteScreen').style.display='none';
    Audio.play('land');
    // Give starting pistol
    equipWeapon(0,'pistol');
    updateWeaponMesh();
    UI.updateWeaponSlots(inventory, activeSlot);
    UI.updateAmmo(getActiveAmmo(), getActiveWeapon());
  }

  function updateParachute(dt) {
    // Move plane
    planeT += dt * C.PARA_PLANE_SPEED;
    if(planeMesh) {
      planeMesh.position.set(
        pos.x + planeDir.x * 60,
        C.PARA_PLANE_HEIGHT,
        pos.z + planeDir.z * 60
      );
      planeMesh.rotation.y = Math.atan2(planeDir.x, planeDir.z);
    }

    // Look controls steer descent direction
    yaw -= mouseDX * sensitivity;
    pitch = Math.max(-0.6, Math.min(0.6, pitch - mouseDY * sensitivity * 0.5));
    mouseDX=0; mouseDY=0;

    // Steer with WASD
    const moveDir = new THREE.Vector3();
    if(keys['KeyW']) moveDir.z -= 1;
    if(keys['KeyS']) moveDir.z += 1;
    if(keys['KeyA']) moveDir.x -= 1;
    if(keys['KeyD']) moveDir.x += 1;
    moveDir.applyAxisAngle(new THREE.Vector3(0,1,0), yaw);

    // Space = deploy/undeploy chute
    if(keys['Space'] && !paraOpen) {
      paraOpen=true;
      paraSpeed = C.PARA_OPEN_SPEED;
      Audio.play('parachute_open');
      if(paraMesh) paraMesh.visible=true;
    }
    if(!keys['Space'] && paraOpen) {
      paraOpen=false;
      paraSpeed = C.PARA_FALL_SPEED;
      if(paraMesh) paraMesh.visible=false;
    }

    // Fall
    pos.y -= paraSpeed * dt;
    pos.x += moveDir.x * (paraOpen ? 8 : 20) * dt;
    pos.z += moveDir.z * (paraOpen ? 8 : 20) * dt;

    if(paraMesh) { paraMesh.position.copy(pos); paraMesh.position.y+=1; }

    // Altitude bar
    const frac = Math.max(0, Math.min(1, pos.y/C.PARA_PLANE_HEIGHT));
    document.getElementById('altitudeFill').style.width = (frac*100)+'%';

    // Auto-land at terrain
    const th = GameMap.getTerrainHeight(pos.x, pos.z);
    if(pos.y <= th + 1.5) land();

    updateCamera();
  }

  // ── Movement ───────────────────────────────────────────────────
  function updateMovement(dt) {
    if(isParachuting || !hasLanded) return;

    // Input
    yaw -= mouseDX * sensitivity;
    pitch = Math.max(-Math.PI*0.4, Math.min(Math.PI*0.3, pitch - mouseDY * sensitivity));
    mouseDX=0; mouseDY=0;

    isCrouching = !!keys['KeyC'];
    isSprinting = !!keys['ShiftLeft'] && !isCrouching;
    currentHeight = isCrouching ? C.PLAYER_HEIGHT*0.55 : C.PLAYER_HEIGHT;

    const moveDir = new THREE.Vector3();
    if(keys['KeyW']) moveDir.z -= 1;
    if(keys['KeyS']) moveDir.z += 1;
    if(keys['KeyA']) moveDir.x -= 1;
    if(keys['KeyD']) moveDir.x += 1;
    if(moveDir.length() > 0) moveDir.normalize();
    moveDir.applyAxisAngle(new THREE.Vector3(0,1,0), yaw);

    let speed = C.PLAYER_SPEED;
    if(isSprinting) speed *= C.SPRINT_MULT;
    if(isCrouching) speed *= C.CROUCH_MULT;

    // Apply horizontal velocity
    vel.x = moveDir.x * speed;
    vel.z = moveDir.z * speed;

    // Gravity
    vel.y += C.GRAVITY * dt;

    // Jump
    if(keys['Space'] && onGround) {
      vel.y = C.JUMP_FORCE;
      onGround = false;
      Audio.play('jump');
    }

    // Move
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    pos.y += vel.y * dt;

    // Terrain collision
    const th = GameMap.getTerrainHeight(pos.x, pos.z);
    const groundY = th + currentHeight/2;
    if(pos.y < groundY) {
      if(vel.y < -8) Audio.play('land');
      pos.y = groundY;
      vel.y = 0;
      onGround = true;
    } else {
      onGround = false;
    }

    // Keep in map bounds
    const halfMap = C.MAP_SIZE/2 - 2;
    pos.x = Math.max(-halfMap, Math.min(halfMap, pos.x));
    pos.z = Math.max(-halfMap, Math.min(halfMap, pos.z));

    // Footsteps
    if(onGround && moveDir.length()>0.1) {
      stepTimer -= dt;
      if(stepTimer<=0) {
        Audio.play('footstep');
        stepTimer = isSprinting ? STEP_INTERVAL*0.6 : STEP_INTERVAL;
      }
    }

    // Update visual
    if(meshGroup) {
      meshGroup.position.set(pos.x, pos.y - currentHeight/2, pos.z);
      meshGroup.rotation.y = yaw;
      meshGroup.scale.y = isCrouching ? 0.6 : 1;
    }
  }

  // ── Camera ───────────────────────────────────────────────────
  function updateCamera() {
    const camDist = isAiming ? C.CAM_AIM_DIST : C.CAM_DIST;
    const camH = C.CAM_HEIGHT + (isCrouching ? -0.4 : 0);

    // Orbit around player
    const camOffset = new THREE.Vector3(
      Math.sin(yaw + 0.3) * camDist,
      camH + Math.sin(pitch)*camDist*0.5,
      Math.cos(yaw + 0.3) * camDist
    );
    camera.position.copy(pos).add(camOffset);

    // Look at player upper body
    cameraTarget.set(pos.x, pos.y + camH * 0.5, pos.z);
    camera.lookAt(cameraTarget);

    // Then apply pitch (look up/down from that point)
    camera.rotation.x = pitch * 0.6;

    // Field of view: narrow when aiming
    camera.fov = isAiming ? 45 : 75;
    camera.updateProjectionMatrix();
  }

  // ── Damage ────────────────────────────────────────────────────
  function takeDamage(dmg) {
    if(!alive) return;
    // Armor absorbs 60%
    const armorAbsorb = Math.min(armor, dmg * 0.6);
    armor -= armorAbsorb;
    health -= (dmg - armorAbsorb);
    health = Math.max(0, health);
    armor = Math.max(0, armor);
    Audio.play('hit_self');
    UI.updateStatusBars(health, armor);
    UI.flashDamage();
    if(health <= 0) die();
  }

  function die() {
    alive = false;
    UI.showGameOver(kills);
  }

  // ── Zone damage ───────────────────────────────────────────────
  let zoneDamageTimer = 0;
  function updateZone(dt) {
    if(!Zone.isOutside(pos.x, pos.z)) {
      document.getElementById('zoneWarning').style.display='none';
      document.getElementById('zoneVignette').style.display='none';
      return;
    }
    document.getElementById('zoneWarning').style.display='block';
    document.getElementById('zoneVignette').style.display='block';
    zoneDamageTimer -= dt;
    if(zoneDamageTimer <= 0) {
      zoneDamageTimer = 1;
      takeDamage(Zone.getDamage());
      Audio.play('zone_damage');
    }
  }

  // ── Nearby loot prompt ───────────────────────────────────────
  function updateInteractPrompt() {
    const item = Loot.getNearbyItem(pos, 2.8);
    const el = document.getElementById('interactPrompt');
    if(item) {
      el.style.display='block';
      let name = item.type;
      if(item.type==='weapon') name = C.WEAPONS[item.weaponType].name;
      else if(item.type==='medkit') name='Med Kit';
      else if(item.type==='armor') name='Armor Vest';
      document.getElementById('interactItemName').textContent = name;
    } else {
      el.style.display='none';
    }
  }

  // ── Main update ──────────────────────────────────────────────
  function update(dt, bots) {
    if(!alive) return;

    if(isParachuting) {
      updateParachute(dt);
      return;
    }

    updateMovement(dt);
    updateCamera();

    // Shoot
    if(fireCooldown > 0) fireCooldown -= dt;
    if(mouseButtons.left && hasLanded) tryShoot(dt, bots);

    // Reload
    if(reloading) {
      reloadTimer -= dt;
      if(reloadTimer <= 0) {
        reloading = false;
        const wt = getActiveWeapon();
        if(wt) {
          const a = ammo[wt], cfg = C.WEAPONS[wt];
          const needed = cfg.ammoMax - a.current;
          const take = Math.min(needed, a.reserve);
          a.current += take;
          a.reserve -= take;
        }
        UI.showReloadIndicator(false);
        UI.updateAmmo(getActiveAmmo(), getActiveWeapon());
      }
    }

    updateZone(dt);
    updateInteractPrompt();
  }

  // ── Init ─────────────────────────────────────────────────────
  function init(scn) {
    scene = scn;
    health = C.MAX_HEALTH;
    armor = 0;
    kills = 0;
    alive = true;
    isParachuting = false;
    hasLanded = false;
    vel.set(0,0,0);
    inventory[0]=null; inventory[1]=null; inventory[2]=null;
    fireCooldown=0; reloading=false;
    buildMesh(scn);
    setupInput();
    scn.add(camera);
    return camera;
  }

  function getPosition() { return pos; }
  function getCamera() { return camera; }
  function isAlive() { return alive; }
  function getKills() { return kills; }
  function setSensitivity(v) { sensitivity = v * 0.0004; }

  // Mobile helpers
  function mobileMove(dx, dz) { keys['KeyW']=dz<0; keys['KeyS']=dz>0; keys['KeyA']=dx<0; keys['KeyD']=dx>0; }
  function mobileShoot() { mouseButtons.left=true; setTimeout(()=>mouseButtons.left=false,100); }
  function mobileJump() { keys['Space']=true; setTimeout(()=>keys['Space']=false,120); }
  function mobileReload() { tryReload(); }
  function mobileCrouch() { keys['KeyC']=!keys['KeyC']; }
  function mobileLook(dx, dy) { mouseDX+=dx; mouseDY+=dy; }

  return {
    init, update, getPosition, getCamera, isAlive, getKills,
    setSensitivity, startParachute, land,
    mobileMove, mobileShoot, mobileJump, mobileReload, mobileCrouch, mobileLook,
    get health() { return health; },
    get armor()  { return armor; },
    get alive()  { return alive; },
    takeDamage,
  };
})();
