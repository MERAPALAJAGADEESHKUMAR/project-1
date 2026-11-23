// ─────────────────────────────────────────────
//  DO OR DIE  –  UI
// ─────────────────────────────────────────────
'use strict';

const UI = (() => {
  // Elements
  const healthFill  = () => document.getElementById('healthFill');
  const armorFill   = () => document.getElementById('armorFill');
  const healthText  = () => document.getElementById('healthText');
  const armorText   = () => document.getElementById('armorText');
  const currentAmmo = () => document.getElementById('currentAmmo');
  const reserveAmmo = () => document.getElementById('reserveAmmo');
  const weaponName  = () => document.getElementById('weaponNameDisplay');
  const killsVal    = () => document.getElementById('killsVal');
  const aliveVal    = () => document.getElementById('aliveVal');
  const zoneTimerVal= () => document.getElementById('zoneTimerVal');
  const killFeed    = () => document.getElementById('killFeed');
  const hitMarker   = () => document.getElementById('hitMarker');
  const reloadInd   = () => document.getElementById('reloadIndicator');

  // Minimap canvas
  let mmCtx = null;
  const MM = C.MINIMAP_SIZE;

  function initMinimap() {
    const canvas = document.getElementById('minimapCanvas');
    mmCtx = canvas.getContext('2d');
  }

  function updateStatusBars(health, armor) {
    const hp = Math.max(0, Math.min(100, health));
    const ap = Math.max(0, Math.min(100, armor));
    healthFill().style.width = hp+'%';
    armorFill().style.width  = ap+'%';
    healthText().textContent = Math.ceil(hp);
    armorText().textContent  = Math.ceil(ap);
  }

  function updateAmmo(a, weaponType) {
    if(!weaponType) {
      currentAmmo().textContent = '-';
      reserveAmmo().textContent = '-';
      weaponName().textContent  = 'NO WEAPON';
      return;
    }
    currentAmmo().textContent = a.current;
    reserveAmmo().textContent = a.reserve;
    weaponName().textContent  = C.WEAPONS[weaponType].name.toUpperCase();
  }

  function updateKills(k) {
    killsVal().textContent = k;
  }

  function updateAlive(n) {
    aliveVal().textContent = n;
  }

  function updateZoneTimer(text) {
    zoneTimerVal().textContent = text;
  }

  function updateWeaponSlots(inventory, activeSlot) {
    for(let i=0;i<3;i++){
      const el = document.getElementById('slot'+(i+1));
      const slotNameEl = el.querySelector('.slotName');
      slotNameEl.textContent = inventory[i] ? C.WEAPONS[inventory[i]].name : '—';
      el.classList.toggle('active', i===activeSlot);
    }
  }

  // ── Kill feed ─────────────────────────────────────────────────
  const killEntries = [];
  function addKillFeed(killer, victim, weapon) {
    const el = document.createElement('div');
    el.className = 'killEntry';
    el.innerHTML = `<span class="killer">${killer}</span> <span class="weapon">[${weapon}]</span> <span class="victim">${victim}</span>`;
    killFeed().prepend(el);
    killEntries.push(el);
    setTimeout(() => {
      el.style.opacity='0'; el.style.transition='opacity 0.5s';
      setTimeout(()=>el.remove(), 500);
    }, 4000);
    // Max 6 entries
    if(killEntries.length>6) { killEntries[0].remove(); killEntries.shift(); }
  }

  // ── Hit marker ───────────────────────────────────────────────
  let hitTimeout = null;
  function showHitMarker() {
    hitMarker().style.display='block';
    if(hitTimeout) clearTimeout(hitTimeout);
    hitTimeout = setTimeout(()=>hitMarker().style.display='none', 120);
  }

  // ── Damage flash (red vignette) ───────────────────────────────
  let flashEl = null;
  function flashDamage() {
    if(!flashEl) {
      flashEl = document.createElement('div');
      flashEl.style.cssText='position:fixed;inset:0;background:rgba(255,0,0,0.25);pointer-events:none;z-index:9;transition:opacity 0.4s;';
      document.body.appendChild(flashEl);
    }
    flashEl.style.opacity='1';
    setTimeout(()=>flashEl.style.opacity='0', 50);
  }

  // ── Damage numbers ────────────────────────────────────────────
  function showDamageNumber(dmg) {
    const el = document.createElement('div');
    el.className = 'dmgNum';
    el.textContent = Math.ceil(dmg);
    el.style.left = (40+Math.random()*20)+'%';
    el.style.top  = (35+Math.random()*15)+'%';
    document.getElementById('hud').appendChild(el);
    setTimeout(()=>el.remove(), 800);
  }

  // ── Reload indicator ─────────────────────────────────────────
  function showReloadIndicator(show) {
    reloadInd().style.display = show?'block':'none';
  }

  // ── Pickup message ───────────────────────────────────────────
  let pickupEl = null;
  let pickupTimeout = null;
  function showPickupMsg(name) {
    if(!pickupEl) {
      pickupEl = document.createElement('div');
      pickupEl.style.cssText = `position:fixed;bottom:220px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.75);color:#ffdd00;padding:6px 20px;border-radius:20px;
        font-size:14px;font-weight:700;letter-spacing:2px;pointer-events:none;
        z-index:11;border:1px solid rgba(255,221,0,0.4);`;
      document.body.appendChild(pickupEl);
    }
    pickupEl.textContent = '+ '+name;
    pickupEl.style.display='block';
    pickupEl.style.opacity='1';
    if(pickupTimeout) clearTimeout(pickupTimeout);
    pickupTimeout = setTimeout(()=>{
      pickupEl.style.transition='opacity 0.4s';
      pickupEl.style.opacity='0';
      setTimeout(()=>pickupEl.style.display='none',400);
    }, 1500);
  }

  // ── Minimap ───────────────────────────────────────────────────
  function drawMinimap(playerPos, bots) {
    if(!mmCtx) return;
    const ctx = mmCtx;
    ctx.clearRect(0,0,MM,MM);

    // Background
    ctx.fillStyle='rgba(0,0,0,0.65)';
    ctx.beginPath(); ctx.arc(MM/2,MM/2,MM/2,0,Math.PI*2); ctx.fill();

    // Safe zone
    const center = Zone.getCenter();
    const radius = Zone.getRadius();
    const scale = MM/C.MAP_SIZE;
    const cx = MM/2 + center.x*scale;
    const cy = MM/2 + center.z*scale;
    const cr = radius*scale;
    ctx.strokeStyle='rgba(0,100,255,0.9)';
    ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.stroke();

    // Clip to circle
    ctx.save();
    ctx.beginPath(); ctx.arc(MM/2,MM/2,MM/2-2,0,Math.PI*2); ctx.clip();

    // Bots
    bots.forEach(b => {
      if(!b.alive) return;
      const bx = MM/2 + b.pos.x*scale;
      const by = MM/2 + b.pos.z*scale;
      ctx.fillStyle='#ff4422';
      ctx.beginPath(); ctx.arc(bx,by,3,0,Math.PI*2); ctx.fill();
    });

    // Player
    const px = MM/2 + playerPos.x*scale;
    const py = MM/2 + playerPos.z*scale;
    ctx.fillStyle='#44ff88';
    ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2); ctx.fill();
    // Arrow
    ctx.strokeStyle='#44ff88';
    ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(px,py-5); ctx.lineTo(px,py-9);
    ctx.stroke();

    ctx.restore();

    // Border
    ctx.strokeStyle='rgba(255,255,255,0.3)';
    ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(MM/2,MM/2,MM/2-1,0,Math.PI*2); ctx.stroke();
  }

  // ── Game Over ─────────────────────────────────────────────────
  function showGameOver(kills) {
    document.getElementById('hud').style.display='none';
    const alive = Bots.getAliveCount();
    const rank = alive + 1;
    const mins = Math.floor(performance.now()/60000);
    const secs = Math.floor((performance.now()%60000)/1000);
    document.getElementById('goRank').textContent   = '#'+rank;
    document.getElementById('goKills').textContent  = kills;
    document.getElementById('goTime').textContent   = `${mins}:${String(secs).padStart(2,'0')}`;
    document.getElementById('gameOverScreen').style.display='flex';
  }

  function showWinScreen(kills) {
    document.getElementById('hud').style.display='none';
    const mins = Math.floor(performance.now()/60000);
    const secs = Math.floor((performance.now()%60000)/1000);
    document.getElementById('winKills').textContent = kills;
    document.getElementById('winTime').textContent  = `${mins}:${String(secs).padStart(2,'0')}`;
    document.getElementById('winScreen').style.display='flex';
  }

  function showHUD() {
    document.getElementById('hud').style.display='block';
    const mmEl = document.getElementById('minimap');
    // Position minimap above weapon slots
    mmEl.style.position='absolute';
    mmEl.style.bottom='220px';
    mmEl.style.right='24px';
    mmEl.style.display='block';
    initMinimap();
  }

  return {
    updateStatusBars, updateAmmo, updateKills, updateAlive, updateZoneTimer,
    updateWeaponSlots, addKillFeed, showHitMarker, flashDamage, showDamageNumber,
    showReloadIndicator, showPickupMsg, drawMinimap, showGameOver, showWinScreen, showHUD,
  };
})();
