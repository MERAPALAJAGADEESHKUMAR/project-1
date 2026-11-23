// ─────────────────────────────────────────────
//  DO OR DIE  –  Safe Zone (blue circle)
// ─────────────────────────────────────────────
'use strict';

const Zone = (() => {
  // State
  let stage = 0;                 // 0-indexed, 0 = waiting for first shrink
  let phase = 'waiting';         // 'waiting' | 'shrinking' | 'done'
  let timer = 0;                 // seconds remaining in current phase
  let currentRadius = 240;
  let targetRadius = 240;
  let centerX = 0, centerZ = 0;
  let zoneCircleMesh = null;
  let zoneBorderMesh = null;
  let scene = null;

  const stages = C.ZONE_STAGES;

  function init(scn) {
    scene = scn;
    // Pick a random zone center (biased toward map center)
    centerX = (Math.random()-0.5)*60;
    centerZ = (Math.random()-0.5)*60;
    currentRadius = stages[0].startR;
    targetRadius  = stages[0].startR;
    timer = stages[0].waitTime;

    // Blue transparent disc on terrain
    const geo = new THREE.CircleGeometry(currentRadius, 64);
    geo.rotateX(-Math.PI/2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x2244ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide
    });
    zoneCircleMesh = new THREE.Mesh(geo, mat);
    zoneCircleMesh.position.set(centerX, 0.5, centerZ);
    scn.add(zoneCircleMesh);

    // Blue border ring
    const borderGeo = new THREE.TorusGeometry(currentRadius, 1.2, 8, 80);
    borderGeo.rotateX(Math.PI/2);
    const borderMat = new THREE.MeshBasicMaterial({color:0x2255ff, transparent:true, opacity:0.6});
    zoneBorderMesh = new THREE.Mesh(borderGeo, borderMat);
    zoneBorderMesh.position.set(centerX, 1.0, centerZ);
    scn.add(zoneBorderMesh);
  }

  function updateMesh() {
    if(!zoneCircleMesh) return;
    // Rebuild geometry with new radius
    zoneCircleMesh.geometry.dispose();
    zoneCircleMesh.geometry = new THREE.CircleGeometry(currentRadius, 64);
    zoneCircleMesh.geometry.rotateX(-Math.PI/2);

    zoneBorderMesh.geometry.dispose();
    zoneBorderMesh.geometry = new THREE.TorusGeometry(currentRadius, 1.2, 8, 80);
    zoneBorderMesh.geometry.rotateX(Math.PI/2);
  }

  function update(dt) {
    if(phase === 'done') return;

    const stg = stages[stage];
    if(!stg) { phase='done'; return; }

    timer -= dt;

    if(phase === 'waiting') {
      if(timer <= 0) {
        phase = 'shrinking';
        targetRadius = stg.endR;
        timer = stg.duration;
      }
    } else if(phase === 'shrinking') {
      // Lerp radius
      const shrinkRate = (stg.startR - stg.endR) / stg.duration;
      currentRadius = Math.max(stg.endR, currentRadius - shrinkRate * dt);
      updateMesh();

      if(timer <= 0 || currentRadius <= stg.endR) {
        currentRadius = stg.endR;
        stage++;
        if(stage >= stages.length) {
          phase = 'done';
        } else {
          phase = 'waiting';
          timer = stages[stage].waitTime;
        }
        updateMesh();
      }
    }
  }

  function isOutside(x, z) {
    const dx = x - centerX, dz = z - centerZ;
    return Math.sqrt(dx*dx + dz*dz) > currentRadius;
  }

  function getDamage() {
    if(stage === 0 && phase === 'waiting') return 0;
    return stages[Math.min(stage, stages.length-1)].damage;
  }

  function getTimerText() {
    if(phase === 'done') return '0:00';
    const s = Math.max(0, Math.ceil(timer));
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }

  function getPhaseText() {
    if(phase === 'waiting') return `Zone ${stage+1} in ${getTimerText()}`;
    if(phase === 'shrinking') return `Shrinking: ${getTimerText()}`;
    return 'Final Zone';
  }

  function getCenter() { return {x:centerX, z:centerZ}; }
  function getRadius() { return currentRadius; }

  return { init, update, isOutside, getDamage, getTimerText, getPhaseText, getCenter, getRadius };
})();
