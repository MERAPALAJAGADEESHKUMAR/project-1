// ─────────────────────────────────────────────
//  DO OR DIE  –  Loot system
// ─────────────────────────────────────────────
'use strict';

const Loot = (() => {
  const items = [];   // { mesh, type, weaponType, amount, pos }
  let scene = null;

  const TYPES = ['weapon','ammo','medkit','armor','helmet'];
  const WEAPON_TYPES = Object.keys(C.WEAPONS);

  // Colors per loot type
  const COLORS = {
    weapon: 0xffdd00,
    ammo:   0x44aaff,
    medkit: 0xff4488,
    armor:  0x44ccff,
    helmet: 0x88ff44,
  };

  function createLootMesh(type, weaponType) {
    let geo, color = COLORS[type];
    if(type === 'weapon') {
      geo = new THREE.BoxGeometry(0.4, 0.15, 0.6);
      color = new THREE.Color(C.WEAPONS[weaponType].color).multiplyScalar(1.5).getHex();
    } else if(type === 'medkit') {
      geo = new THREE.BoxGeometry(0.4,0.4,0.4);
    } else if(type === 'ammo') {
      geo = new THREE.BoxGeometry(0.3,0.2,0.4);
    } else if(type === 'armor') {
      geo = new THREE.BoxGeometry(0.4,0.5,0.15);
    } else {
      geo = new THREE.SphereGeometry(0.22, 6, 6);
    }
    const mat = new THREE.MeshLambertMaterial({color, emissive: color, emissiveIntensity: 0.3});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;

    // Label glow ring
    const ringGeo = new THREE.TorusGeometry(0.3, 0.04, 6, 12);
    const ringMat = new THREE.MeshBasicMaterial({color});
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI/2;
    ring.position.y = -0.3;
    mesh.add(ring);

    return mesh;
  }

  function spawnItem(scn, x, z, type, weaponType, amount=1) {
    const h = GameMap.getTerrainHeight(x,z);
    if(h < 0.2) return;

    const mesh = createLootMesh(type, weaponType);
    mesh.position.set(x, h + 0.5, z);
    scn.add(mesh);

    items.push({ mesh, type, weaponType: weaponType||null, amount, pos: new THREE.Vector3(x, h+0.5, z) });
  }

  function populate(scn) {
    scene = scn;
    // Spawn in and around buildings
    GameMap.buildings.forEach(b => {
      // Inside / doorstep
      for(let i=0;i<3+Math.floor(Math.random()*3);i++) {
        const ox = b.x + (Math.random()-0.5)*b.w;
        const oz = b.z + (Math.random()-0.5)*b.d;
        const t = TYPES[Math.floor(Math.random()*TYPES.length)];
        const wt = t==='weapon' ? WEAPON_TYPES[Math.floor(Math.random()*WEAPON_TYPES.length)] : null;
        spawnItem(scn, ox, oz, t, wt);
      }
    });
    // Random map loot
    for(let i=0;i<C.LOOT_COUNT;i++){
      const x=(Math.random()-0.5)*440;
      const z=(Math.random()-0.5)*440;
      const t = TYPES[Math.floor(Math.random()*TYPES.length)];
      const wt = t==='weapon' ? WEAPON_TYPES[Math.floor(Math.random()*WEAPON_TYPES.length)] : null;
      spawnItem(scn, x, z, t, wt);
    }
    console.log('[Loot] Spawned', items.length, 'items');
  }

  function update(dt) {
    // Bob and spin
    const t = performance.now()/1000;
    items.forEach(item => {
      item.mesh.rotation.y += dt * 1.5;
      item.mesh.position.y = item.pos.y + Math.sin(t*2 + item.pos.x) * 0.08;
    });
  }

  function getNearbyItem(pos, range=2.5) {
    let closest = null, minDist = range;
    items.forEach(item => {
      const d = pos.distanceTo(item.pos);
      if(d < minDist) { minDist=d; closest=item; }
    });
    return closest;
  }

  function removeItem(item) {
    const idx = items.indexOf(item);
    if(idx>=0) {
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      items.splice(idx,1);
    }
  }

  function getAll() { return items; }
  function reset() { items.length = 0; scene = null; }

  return { populate, update, getNearbyItem, removeItem, getAll, spawnItem, reset };
})();
