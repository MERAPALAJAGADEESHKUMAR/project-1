// ─────────────────────────────────────────────
//  DO OR DIE  –  Weapons system
// ─────────────────────────────────────────────
'use strict';

const Weapons = (() => {
  // ── Visual helpers ─────────────────────────────────────────────
  function buildWeaponMesh(type) {
    const cfg = C.WEAPONS[type];
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.12, 0.12, cfg.barrelLen);
    const bodyMat = new THREE.MeshLambertMaterial({color: cfg.color});
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.025, 0.025, cfg.barrelLen*0.6, 6);
    barrelGeo.rotateX(Math.PI/2);
    const barrelMat = new THREE.MeshLambertMaterial({color: 0x333333});
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, 0.04, cfg.barrelLen*0.3);
    group.add(barrel);

    // Stock
    const stockGeo = new THREE.BoxGeometry(0.08, 0.14, 0.2);
    const stock = new THREE.Mesh(stockGeo, bodyMat);
    stock.position.set(0, -0.02, -cfg.barrelLen*0.5);
    group.add(stock);

    // Mag
    if(type !== 'pistol') {
      const magGeo = new THREE.BoxGeometry(0.08, 0.2, 0.08);
      const mag = new THREE.Mesh(magGeo, barrelMat);
      mag.position.set(0, -0.14, 0);
      group.add(mag);
    }

    // Muzzle flash (hidden by default)
    const flashGeo = new THREE.ConeGeometry(0.1, 0.25, 6);
    flashGeo.rotateX(-Math.PI/2);
    const flashMat = new THREE.MeshBasicMaterial({color:0xffee44, transparent:true, opacity:0.9});
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0, 0, cfg.barrelLen*0.6 + 0.12);
    flash.visible = false;
    flash.name = 'muzzleFlash';
    group.add(flash);

    group.userData.type = type;
    group.userData.cfg = cfg;
    return group;
  }

  // ── Bullet tracer pool ────────────────────────────────────────
  const tracers = [];
  const MAX_TRACERS = 60;
  let tracerScene = null;

  function initTracers(scene) {
    tracerScene = scene;
    for(let i=0;i<MAX_TRACERS;i++){
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(6);
      geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
      const mat = new THREE.LineBasicMaterial({color:0xffee88, transparent:true, opacity:0.6});
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.userData.life = 0;
      scene.add(line);
      tracers.push(line);
    }
  }

  function spawnTracer(from, to) {
    const t = tracers.find(t => !t.visible) || tracers[0];
    const pos = t.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.visible = true;
    t.userData.life = 0.08; // seconds
  }

  function updateTracers(dt) {
    tracers.forEach(t => {
      if(!t.visible) return;
      t.userData.life -= dt;
      if(t.userData.life <= 0) t.visible = false;
      else t.material.opacity = (t.userData.life/0.08) * 0.6;
    });
  }

  // ── Hit effect (sparks/blood placeholder) ─────────────────────
  const hitParticles = [];
  function spawnHitEffect(scene, pos, isPlayer=false) {
    const color = isPlayer ? 0xff2222 : 0xff8800;
    for(let i=0;i<6;i++){
      const geo = new THREE.SphereGeometry(0.05,4,4);
      const mat = new THREE.MeshBasicMaterial({color});
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random()-0.5)*6, Math.random()*4, (Math.random()-0.5)*6
      );
      p.userData.vel = vel;
      p.userData.life = 0.3;
      scene.add(p);
      hitParticles.push(p);
    }
  }

  function updateHitParticles(dt, scene) {
    for(let i=hitParticles.length-1;i>=0;i--){
      const p = hitParticles[i];
      p.userData.life -= dt;
      if(p.userData.life <= 0) {
        scene.remove(p);
        hitParticles.splice(i,1);
        continue;
      }
      p.userData.vel.y -= 15*dt;
      p.position.addScaledVector(p.userData.vel, dt);
      p.material.opacity = p.userData.life / 0.3;
      p.material.transparent = true;
    }
  }

  // ── Raycast shoot ─────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();

  function shoot(scene, cameraObj, weaponType, targets, onHit) {
    const cfg = C.WEAPONS[weaponType];
    const pellets = cfg.pellets || 1;
    const results = [];

    for(let p=0; p<pellets; p++) {
      // Build direction from camera forward + spread
      const dir = new THREE.Vector3(0,0,-1);
      dir.applyQuaternion(cameraObj.quaternion);
      dir.x += (Math.random()-0.5)*cfg.spread*2;
      dir.y += (Math.random()-0.5)*cfg.spread*2;
      dir.z += (Math.random()-0.5)*cfg.spread*2;
      dir.normalize();

      const origin = cameraObj.position.clone().addScaledVector(dir, 0.5);
      raycaster.set(origin, dir);
      raycaster.far = cfg.range;

      // Check targets (bots / player)
      const meshes = targets.map(t => t.mesh).filter(Boolean);
      let hit = null;
      let hitDist = cfg.range;

      // Check map collidables
      const mapMeshes = GameMap.objects.map(o => o.mesh);
      const mapHits = raycaster.intersectObjects(mapMeshes, true);
      if(mapHits.length) hitDist = mapHits[0].distance;

      const targetHits = raycaster.intersectObjects(meshes, true);
      if(targetHits.length && targetHits[0].distance < hitDist) {
        const idx = meshes.indexOf(targetHits[0].object.parent || targetHits[0].object);
        const realIdx = targets.findIndex(t => t.mesh === meshes[idx] ||
          (t.mesh && (t.mesh === targetHits[0].object || t.mesh.children.includes(targetHits[0].object))));
        if(realIdx >= 0) {
          hit = { target: targets[realIdx], point: targetHits[0].point, dist: targetHits[0].distance };
        }
        hitDist = targetHits[0].distance;
      }

      // Tracer
      const endPt = origin.clone().addScaledVector(dir, hitDist);
      spawnTracer(origin, endPt);

      if(hit) {
        spawnHitEffect(scene, hit.point, false);
        onHit && onHit(hit.target, cfg.damage);
        results.push(hit);
      }
    }

    return results;
  }

  return { buildWeaponMesh, initTracers, spawnTracer, updateTracers, spawnHitEffect, updateHitParticles, shoot };
})();
