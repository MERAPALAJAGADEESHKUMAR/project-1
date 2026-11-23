// ─────────────────────────────────────────────
//  DO OR DIE  –  AI Bots
// ─────────────────────────────────────────────
'use strict';

const Bots = (() => {
  const bots = [];
  let scene = null;

  const BOT_NAMES = [
    'ViperX','Shadow99','BloodHound','IronFist','NightOwl','GhostMask',
    'StormRider','DeathBolt','RedEagle','CrimsonAce','DarkWolf','SilentKill',
    'RapidFire','ColdBlood','HeatSeek','WarPath','DevilEye','FrostByte',
    'ChaosLord','RocketMan','BladeRunner','DoomsDayX','FireStorm','NightCrawler'
  ];

  const BOT_COLORS = [
    0xff4422,0x22cc44,0xffaa00,0xcc44ff,0x00aaff,0xff88cc,
    0x44ffaa,0xff6600,0x0055cc,0xaacc00,0xcc0044,0x00ccaa
  ];

  // ── Bot constructor ────────────────────────────────────────────
  function Bot(name, color, difficulty) {
    this.name = name;
    this.health = C.MAX_HEALTH;
    this.armor = Math.random() > 0.5 ? 50 : 0;
    this.alive = true;
    this.difficulty = difficulty; // 0-1
    this.weaponType = Object.keys(C.WEAPONS)[Math.floor(Math.random()*Object.keys(C.WEAPONS).length)];
    this.ammo = C.WEAPONS[this.weaponType].ammoMax;

    this.pos = GameMap.getRandomLandPosition();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random()*Math.PI*2;
    this.onGround = false;

    // AI state
    this.state = 'parachute';  // parachute→idle→loot→patrol→chase→fight→dead
    this.target = null;         // THREE.Vector3 patrol/move target
    this.stateTimer = Math.random()*3 + 2;
    this.shootCooldown = 0;
    this.fireCooldown  = 0;
    this.reactionTime  = (1 - difficulty)*1.2 + 0.2;  // seconds before engaging
    this.aimAccuracy   = 0.04 - difficulty*0.035;      // spread add
    this.seenPlayer    = false;
    this.visTimer      = 0;   // time player has been visible

    this.paraY = C.PARA_PLANE_HEIGHT + 20 + Math.random()*30;
    this.landTimer = 2 + Math.random()*4;

    this.mesh = this._buildMesh(color);
    this.mesh.userData.bot = this;
  }

  Bot.prototype._buildMesh = function(color) {
    const grp = new THREE.Group();

    // Body — use Cylinder+Sphere combo (CapsuleGeometry only exists in r142+, we use r128)
    const torsoGeo = new THREE.CylinderGeometry(C.PLAYER_RADIUS, C.PLAYER_RADIUS, C.BOT_HEIGHT - C.PLAYER_RADIUS*2, 8);
    const bodyMat = new THREE.MeshLambertMaterial({color});
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = C.BOT_HEIGHT / 2;
    torso.castShadow = true;
    grp.add(torso);

    // Rounded top cap
    const topCapGeo = new THREE.SphereGeometry(C.PLAYER_RADIUS, 8, 6);
    const topCap = new THREE.Mesh(topCapGeo, bodyMat);
    topCap.position.y = C.BOT_HEIGHT - C.PLAYER_RADIUS;
    grp.add(topCap);

    // Rounded bottom cap
    const botCapGeo = new THREE.SphereGeometry(C.PLAYER_RADIUS, 8, 6);
    const botCap = new THREE.Mesh(botCapGeo, bodyMat);
    botCap.position.y = C.PLAYER_RADIUS;
    grp.add(botCap);

    // Head
    const headMat = new THREE.MeshLambertMaterial({color: 0xf4c88a});
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), headMat);
    head.position.y = C.BOT_HEIGHT + 0.1;
    grp.add(head);

    // Weapon visual
    const wMesh = Weapons.buildWeaponMesh(this.weaponType);
    wMesh.position.set(0.4, C.BOT_HEIGHT*0.6, 0.3);
    wMesh.rotation.y = Math.PI;
    grp.add(wMesh);

    grp.position.copy(this.pos);
    grp.position.y -= C.BOT_HEIGHT/2;
    return grp;
  };

  Bot.prototype.takeDamage = function(dmg) {
    if(!this.alive) return;
    const absorb = Math.min(this.armor, dmg*0.6);
    this.armor -= absorb;
    this.health -= (dmg - absorb);
    this.health = Math.max(0, this.health);
    if(this.health<=0) this.die();
    // React to being shot
    if(this.state==='idle'||this.state==='patrol'||this.state==='loot') {
      this.state='chase'; this.stateTimer=5;
    }
  };

  Bot.prototype.die = function() {
    this.alive = false;
    this.state = 'dead';
    // Drop loot
    Loot.spawnItem(scene, this.pos.x, this.pos.z,
      Math.random()>0.3?'weapon':'medkit',
      this.weaponType);
    // Fall over
    this.mesh.rotation.z = Math.PI/2;
    this.mesh.position.y -= 0.5;
    // Fade out after delay
    setTimeout(() => { if(scene) scene.remove(this.mesh); }, 8000);
  };

  // ── Sight check (simple distance + angle) ─────────────────────
  Bot.prototype.canSeePlayer = function(playerPos) {
    const dist = this.pos.distanceTo(playerPos);
    if(dist > 80) return false;
    // Simple LOS – not full raycast, just distance-based
    return true;
  };

  // ── Shoot at player or another bot ────────────────────────────
  Bot.prototype.shootAt = function(target, dt) {
    this.fireCooldown -= dt;
    if(this.fireCooldown > 0) return;

    const cfg = C.WEAPONS[this.weaponType];
    this.fireCooldown = 1/cfg.fireRate * (0.8 + Math.random()*0.4);

    if(this.ammo<=0) { this.ammo=cfg.ammoMax; return; } // "reload"
    this.ammo--;

    // Accuracy
    const dist = this.pos.distanceTo(target instanceof THREE.Vector3 ? target : target.pos);
    const hitChance = Math.max(0.1, 1 - dist/cfg.range) * this.difficulty;

    if(Math.random() < hitChance) {
      const dmg = cfg.damage * (0.7 + Math.random()*0.3);
      if(target.takeDamage) target.takeDamage(dmg);
    }

    // Muzzle flash
    const flash = this.mesh.getObjectByName('muzzleFlash');
    if(flash) { flash.visible=true; setTimeout(()=>flash.visible=false,60); }
  };

  // ── AI state machine ──────────────────────────────────────────
  Bot.prototype.update = function(dt, playerPos, playerAlive, otherBots) {
    if(!this.alive) return;

    // ── Parachute drop ──
    if(this.state==='parachute') {
      this.pos.y -= 30*dt;
      this.landTimer -= dt;
      const th = GameMap.getTerrainHeight(this.pos.x, this.pos.z);
      if(this.pos.y <= th+1 || this.landTimer<=0) {
        this.pos.y = th+1;
        this.state = 'idle';
        this.stateTimer = 1 + Math.random()*2;
        // Equip
        this.onGround = true;
      }
      this.mesh.position.copy(this.pos);
      this.mesh.position.y -= C.BOT_HEIGHT/2;
      return;
    }

    this.stateTimer -= dt;

    // ── Can we see player? ──
    const sawPlayer = playerAlive && this.canSeePlayer(playerPos);
    if(sawPlayer) {
      this.visTimer += dt;
      if(!this.seenPlayer && this.visTimer >= this.reactionTime) {
        this.seenPlayer = true;
        this.state = 'fight';
        this.stateTimer = 8 + Math.random()*6;
      }
    } else {
      this.seenPlayer = false;
      this.visTimer = 0;
    }

    // ── State logic ──
    switch(this.state) {
      case 'idle': {
        if(this.stateTimer<=0) {
          this.state = Math.random()<0.6?'patrol':'loot';
          this.stateTimer = 4+Math.random()*6;
          this.target = GameMap.getRandomLandPosition();
        }
        break;
      }
      case 'patrol': {
        this._moveToward(this.target || this.pos, dt, C.PLAYER_SPEED*0.6);
        const pd = this.pos.distanceTo(this.target||this.pos);
        if(pd < 2 || this.stateTimer<=0) {
          this.state='idle'; this.stateTimer=2+Math.random()*3;
        }
        break;
      }
      case 'loot': {
        // Move toward nearest loot
        const item = Loot.getNearbyItem(this.pos, 25);
        if(item) {
          this._moveToward(item.pos, dt, C.PLAYER_SPEED*0.7);
          if(this.pos.distanceTo(item.pos) < 2) {
            if(item.type==='weapon') this.weaponType=item.weaponType;
            else if(item.type==='medkit') this.health=Math.min(C.MAX_HEALTH,this.health+C.MEDKIT_HEAL);
            else if(item.type==='armor') this.armor=Math.min(C.MAX_ARMOR,this.armor+C.ARMOR_AMOUNT);
            Loot.removeItem(item);
          }
        } else {
          this.state='patrol'; this.stateTimer=5;
        }
        if(this.stateTimer<=0) { this.state='idle'; this.stateTimer=2; }
        break;
      }
      case 'chase': {
        this._moveToward(playerPos, dt, C.PLAYER_SPEED*0.85);
        if(this.pos.distanceTo(playerPos)<30) this.state='fight';
        if(this.stateTimer<=0) { this.state='patrol'; this.stateTimer=5; }
        break;
      }
      case 'fight': {
        // Strafe around player
        const angleToPlayer = Math.atan2(playerPos.x-this.pos.x, playerPos.z-this.pos.z);
        this.yaw = angleToPlayer;
        const fightDist = this.pos.distanceTo(playerPos);
        if(fightDist > 60) {
          this._moveToward(playerPos, dt, C.PLAYER_SPEED*0.75);
        } else if(fightDist < 10) {
          const away = this.pos.clone().sub(playerPos).normalize().multiplyScalar(C.PLAYER_SPEED*0.6);
          this._applyMovement(away, dt);
        } else {
          const strafe = new THREE.Vector3(
            Math.cos(angleToPlayer + Math.PI/2)*C.PLAYER_SPEED*0.5, 0,
            Math.sin(angleToPlayer + Math.PI/2)*C.PLAYER_SPEED*0.5
          );
          this._applyMovement(strafe, dt);
        }
        // Shoot player
        this.shootAt({pos:playerPos, takeDamage:v=>Player.takeDamage(v), alive:true}, dt);
        // Occasionally shoot other bots (friendly fire chaos)
        otherBots.forEach(b => {
          if(b===this||!b.alive) return;
          if(this.pos.distanceTo(b.pos)<40 && Math.random()<0.02) this.shootAt(b, dt);
        });
        if(this.stateTimer<=0 || fightDist>80) {
          this.state='patrol'; this.stateTimer=4;
          this.seenPlayer=false;
        }
        break;
      }
      case 'dead': return;
    }

    // Keep on ground
    const th = GameMap.getTerrainHeight(this.pos.x, this.pos.z);
    if(this.pos.y < th+1) { this.pos.y=th+1; this.vel.y=0; this.onGround=true; }

    // Zone push
    if(Zone.isOutside(this.pos.x, this.pos.z)) {
      const center = Zone.getCenter();
      const toCenter = new THREE.Vector3(center.x-this.pos.x,0,center.z-this.pos.z).normalize();
      this.pos.addScaledVector(toCenter, 4*dt);
    }

    // Bounds
    const half=C.MAP_SIZE/2-2;
    this.pos.x=Math.max(-half,Math.min(half,this.pos.x));
    this.pos.z=Math.max(-half,Math.min(half,this.pos.z));

    // Sync mesh
    this.mesh.position.set(this.pos.x, this.pos.y - C.BOT_HEIGHT/2, this.pos.z);
    this.mesh.rotation.y = this.yaw;
  };

  Bot.prototype._moveToward = function(target, dt, speed) {
    const dir = new THREE.Vector3().subVectors(target, this.pos);
    dir.y = 0;
    if(dir.length()<0.1) return;
    dir.normalize();
    this.yaw = Math.atan2(dir.x, dir.z);
    this._applyMovement(dir.multiplyScalar(speed), dt);
  };

  Bot.prototype._applyMovement = function(vel, dt) {
    this.pos.x += vel.x*dt;
    this.pos.z += vel.z*dt;
  };

  // ── Yield helper: rAF for smooth frames, timer as a safety net ──────────
  // A backgrounded/throttled tab can stop firing rAF entirely. Without the
  // timer fallback the async spawn promise would never resolve and the
  // loading screen would be stuck on "SPAWNING BOTS..." forever.
  function yieldToBrowser() {
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

  // ── Spawn all bots in small batches so the browser never locks up ───────
  async function spawnAll(scn, onProgress) {
    scene = scn;
    const BATCH = 5;
    const total = C.BOT_COUNT;
    let spawned = 0;

    try {
      for(let i = 0; i < total; i++) {
        try {
          const color = BOT_COLORS[i % BOT_COLORS.length];
          const diff  = 0.3 + Math.random() * 0.65;
          const bot   = new Bot(BOT_NAMES[i % BOT_NAMES.length], color, diff);
          scn.add(bot.mesh);
          bots.push(bot);
          spawned++;
        } catch(e) {
          console.error(`[Bots] Failed to spawn bot ${i + 1}/${total}:`, e);
        }

        // Report and yield after every batch (and once after the final bot).
        if((i + 1) % BATCH === 0 || i === total - 1) {
          if(onProgress) {
            try { onProgress(spawned, total); }
            catch(e) { console.warn('[Bots] Progress callback failed:', e); }
          }
          await yieldToBrowser();
        }
      }
      console.log(`[Bots] Spawned ${spawned}/${total}`);
      return spawned;
    } catch(e) {
      console.error('[Bots] spawnAll failed:', e);
      throw e; // let main.js log which loading step failed
    }
  }

  // ── Update all ────────────────────────────────────────────────
  function update(dt, playerPos, playerAlive) {
    const aliveBots = bots.filter(b=>b.alive);
    aliveBots.forEach(bot => {
      bot.update(dt, playerPos, playerAlive, aliveBots);
    });
  }

  function getAliveCount() { return bots.filter(b=>b.alive).length; }
  function getAll() { return bots; }
  function getAliveBots() { return bots.filter(b=>b.alive); }
  function reset() { bots.length = 0; scene = null; }

  return { spawnAll, update, getAliveCount, getAll, getAliveBots, reset };
})();
