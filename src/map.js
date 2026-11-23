// ─────────────────────────────────────────────
//  DO OR DIE  –  Map (terrain, buildings, props)
// ─────────────────────────────────────────────
'use strict';

const GameMap = (() => {
  let scene;
  const objects = [];          // collidable objects {mesh, box}
  const buildings = [];        // building footprints for loot spawning
  const trees = [];
  let terrainHeightData = null;
  let terrainSegments = 128;
  let terrainSize = C.MAP_SIZE;

  // ── Simplex-ish noise (no external dep) ───────────────────────
  function hash(n) {
    let x = Math.sin(n) * 43758.5453123;
    return x - Math.floor(x);
  }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function fade(t){ return t*t*t*(t*(t*6-15)+10); }
  function noise2D(x, y, seed=0) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = hash(ix + iy*57 + seed);
    const b = hash(ix+1 + iy*57 + seed);
    const c = hash(ix + (iy+1)*57 + seed);
    const d = hash(ix+1 + (iy+1)*57 + seed);
    return lerp(lerp(a,b,fade(fx)), lerp(c,d,fade(fx)), fade(fy));
  }
  function octaveNoise(x, y, octaves=5, persistence=0.5, lacunarity=2, seed=0) {
    let val=0, amp=1, freq=1, max=0;
    for(let i=0;i<octaves;i++){
      val += noise2D(x*freq, y*freq, seed+i*100) * amp;
      max += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return val/max;
  }

  // ── Build height map ───────────────────────────────────────────
  function buildHeightmap() {
    const segs = terrainSegments;
    terrainHeightData = new Float32Array((segs+1)*(segs+1));
    for(let iy=0; iy<=segs; iy++) {
      for(let ix=0; ix<=segs; ix++) {
        const nx = ix/segs * 6;
        const ny = iy/segs * 6;
        let h = octaveNoise(nx, ny, 6, 0.55, 2.1, 42);
        h = Math.pow(h, 1.3);
        // Island mask – fade to water at edges
        const cx = (ix/segs - 0.5)*2;
        const cy = (iy/segs - 0.5)*2;
        const dist = Math.sqrt(cx*cx + cy*cy);
        const mask = Math.max(0, 1 - Math.pow(dist/0.85, 2.5));
        h = h * mask * 30 - 2;
        terrainHeightData[iy*(segs+1)+ix] = h;
      }
    }
  }

  function getTerrainHeight(wx, wz) {
    if(!terrainHeightData) return 0;
    const segs = terrainSegments;
    // wx,wz in world space [-250,250]
    const nx = (wx/terrainSize + 0.5) * segs;
    const nz = (wz/terrainSize + 0.5) * segs;
    const ix = Math.floor(nx), iz = Math.floor(nz);
    const fx = nx-ix, fz = nz-iz;
    if(ix<0||iz<0||ix>=segs||iz>=segs) return -2;
    const h00 = terrainHeightData[iz*(segs+1)+ix];
    const h10 = terrainHeightData[iz*(segs+1)+(ix+1)];
    const h01 = terrainHeightData[(iz+1)*(segs+1)+ix];
    const h11 = terrainHeightData[(iz+1)*(segs+1)+(ix+1)];
    return lerp(lerp(h00,h10,fx), lerp(h01,h11,fx), fz);
  }

  // ── Terrain mesh ───────────────────────────────────────────────
  function createTerrain(scn) {
    buildHeightmap();
    const segs = terrainSegments;
    const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segs, segs);
    geo.rotateX(-Math.PI/2);
    const pos = geo.attributes.position;
    for(let i=0; i<pos.count; i++) {
      pos.setY(i, terrainHeightData[i]);
    }
    geo.computeVertexNormals();

    // Vertex colors based on height
    const colors = new Float32Array(pos.count * 3);
    for(let i=0; i<pos.count; i++) {
      const h = pos.getY(i);
      let r,g,b;
      if(h < 0.2)       { r=0.76;g=0.70;b=0.50; } // sand
      else if(h < 3)    { r=0.30;g=0.60;b=0.25; } // grass low
      else if(h < 10)   { r=0.22;g=0.50;b=0.18; } // grass high
      else if(h < 18)   { r=0.45;g=0.42;b=0.38; } // rock
      else              { r=0.90;g=0.90;b=0.90; } // snow peak
      colors[i*3]=r; colors[i*3+1]=g; colors[i*3+2]=b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scn.add(mesh);

    // Water plane
    const waterGeo = new THREE.PlaneGeometry(terrainSize, terrainSize);
    waterGeo.rotateX(-Math.PI/2);
    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x1a6fa8, transparent: true, opacity: 0.75
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = C.WATER_LEVEL;
    scn.add(water);
  }

  // ── Helpers to build low-poly shapes ──────────────────────────
  function box(w,h,d, color, rx=0,ry=0,rz=0) {
    const g = new THREE.BoxGeometry(w,h,d);
    const m = new THREE.MeshLambertMaterial({color});
    const mesh = new THREE.Mesh(g,m);
    mesh.rotation.set(rx,ry,rz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  function placeObject(mesh, x, z, yOffset=0) {
    const y = getTerrainHeight(x,z);
    mesh.position.set(x, y + yOffset, z);
  }

  function addCollidable(mesh, extraW=0, extraH=0, extraD=0) {
    const bbox = new THREE.Box3().setFromObject(mesh);
    bbox.min.x -= extraW; bbox.min.z -= extraD;
    bbox.max.x += extraW; bbox.max.z += extraD;
    objects.push({ mesh, box: bbox });
  }

  // ── Building ───────────────────────────────────────────────────
  function createBuilding(scn, x, z, w, d, h, color=0xd4c4a8) {
    const groundY = getTerrainHeight(x,z);
    if(groundY < 0.1) return; // skip water area

    const walls = box(w, h, d, color);
    walls.position.set(x, groundY + h/2, z);
    scn.add(walls);
    addCollidable(walls);

    // Roof
    const roofColor = 0xaa4422;
    const roof = box(w+0.4, 0.3, d+0.4, roofColor);
    roof.position.set(x, groundY + h + 0.15, z);
    scn.add(roof);

    // Door opening (cosmetic)
    const doorH = Math.min(2.2, h*0.7);
    const door = box(1.2, doorH, 0.1, 0x8b6914);
    door.position.set(x, groundY + doorH/2, z + d/2 + 0.05);
    scn.add(door);

    // Window (cosmetic)
    const winMat = new THREE.MeshLambertMaterial({color:0x88ccff,transparent:true,opacity:0.5});
    const winGeo = new THREE.BoxGeometry(0.8,0.6,0.1);
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(x + w*0.25, groundY + h*0.6, z + d/2 + 0.06);
    scn.add(win);

    buildings.push({ x, z, w, d, groundY });
  }

  // ── Tree ───────────────────────────────────────────────────────
  function createTree(scn, x, z, scale=1) {
    const groundY = getTerrainHeight(x,z);
    if(groundY < 0.3) return;

    const trunkH = 2.5*scale;
    const trunk = box(0.3*scale, trunkH, 0.3*scale, 0x6b4c2a);
    trunk.position.set(x, groundY + trunkH/2, z);
    scn.add(trunk);

    // 2-3 cone layers for foliage
    const layers = 2 + Math.floor(Math.random()*2);
    const leafColor = new THREE.Color().setHSL(0.3 + Math.random()*0.05, 0.6, 0.3 + Math.random()*0.1);
    for(let i=0;i<layers;i++){
      const r = (1.4 - i*0.3)*scale;
      const h = (1.6 - i*0.1)*scale;
      const geo = new THREE.ConeGeometry(r, h, 6);
      const mat = new THREE.MeshLambertMaterial({color: leafColor});
      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(x, groundY + trunkH + i*0.9*scale, z);
      cone.rotation.y = Math.random()*Math.PI;
      cone.castShadow = true;
      scn.add(cone);
    }

    // Collidable trunk
    addCollidable(trunk, 0.1);
    trees.push({x, z});
  }

  // ── Rock ───────────────────────────────────────────────────────
  function createRock(scn, x, z, scale=1) {
    const groundY = getTerrainHeight(x,z);
    if(groundY < 0) return;
    const geo = new THREE.DodecahedronGeometry(scale * 0.9, 0);
    // Jitter vertices for organic feel
    const pos = geo.attributes.position;
    for(let i=0;i<pos.count;i++){
      pos.setX(i, pos.getX(i) + (Math.random()-0.5)*0.3*scale);
      pos.setY(i, pos.getY(i) + (Math.random()-0.5)*0.2*scale);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({color: 0x888070});
    const rock = new THREE.Mesh(geo, mat);
    rock.position.set(x, groundY + scale*0.4, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    scn.add(rock);
    addCollidable(rock, 0.2);
  }

  // ── Lake (decorative depression) ──────────────────────────────
  function createLake(scn) {
    // The lake is a water-colored disc in a low-lying area near center-left
    const lakeGeo = new THREE.CircleGeometry(22, 24);
    lakeGeo.rotateX(-Math.PI/2);
    const lakeMat = new THREE.MeshLambertMaterial({color:0x2277bb, transparent:true, opacity:0.8});
    const lake = new THREE.Mesh(lakeGeo, lakeMat);
    lake.position.set(-60, 0.6, -40);
    scn.add(lake);
  }

  // ── Sky ───────────────────────────────────────────────────────
  function createSky(scn) {
    // Gradient sky sphere
    const skyGeo = new THREE.SphereGeometry(800, 16, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x87ceeb, side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scn.add(sky);

    // Sun
    const sunGeo = new THREE.SphereGeometry(12, 12, 12);
    const sunMat = new THREE.MeshBasicMaterial({color:0xffff88});
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(200, 350, -200);
    scn.add(sun);

    // Simple clouds
    for(let i=0;i<12;i++) {
      const cx = (Math.random()-0.5)*600;
      const cz = (Math.random()-0.5)*600;
      const cy = 120 + Math.random()*60;
      for(let j=0;j<3;j++){
        const cGeo = new THREE.SphereGeometry(10+Math.random()*8,6,4);
        const cMat = new THREE.MeshBasicMaterial({color:0xffffff});
        const cloud = new THREE.Mesh(cGeo, cMat);
        cloud.position.set(cx + (Math.random()-0.5)*20, cy, cz + (Math.random()-0.5)*10);
        scn.add(cloud);
      }
    }
  }

  // ── Populate entire map ────────────────────────────────────────
  function build(scn) {
    scene = scn;
    createTerrain(scn);
    createSky(scn);
    createLake(scn);

    // ── Village cluster 1 (south) ──
    const v1 = [{x:20,z:30},{x:36,z:28},{x:52,z:35},{x:20,z:52},{x:38,z:50}];
    v1.forEach(p => createBuilding(scn, p.x, p.z, 6+Math.random()*4, 6+Math.random()*4, 3+Math.random()*2));

    // ── Town (center) ──
    const town = [
      {x:-5,z:-5,w:8,d:8,h:5},{x:12,z:-5,w:6,d:6,h:4},{x:-5,z:10,w:7,d:5,h:4},
      {x:10,z:12,w:5,d:7,h:6},{x:-18,z:0,w:6,d:6,h:4},{x:0,z:-18,w:8,d:6,h:5}
    ];
    town.forEach(b => createBuilding(scn, b.x, b.z, b.w, b.d, b.h));

    // ── Village 2 (north-east) ──
    for(let i=0;i<6;i++){
      createBuilding(scn, 80+Math.random()*30, -60-Math.random()*30,
        5+Math.random()*4, 5+Math.random()*4, 3+Math.random()*2);
    }

    // ── Village 3 (west) ──
    for(let i=0;i<5;i++){
      createBuilding(scn, -90-Math.random()*20, 20+Math.random()*40,
        5+Math.random()*3, 5+Math.random()*3, 3+Math.random()*1.5);
    }

    // ── Scattered buildings ──
    const scatterPos = [
      [-40,-80],[60,70],[-70,-60],[100,20],[-30,80],[40,-60],[90,-40],[-100,0],[0,100]
    ];
    scatterPos.forEach(([x,z]) => {
      if(Math.random() > 0.3)
        createBuilding(scn, x+Math.random()*10-5, z+Math.random()*10-5,
          5+Math.random()*5, 5+Math.random()*5, 3+Math.random()*3);
    });

    // ── Trees ──
    for(let i=0;i<180;i++){
      const x=(Math.random()-0.5)*440;
      const z=(Math.random()-0.5)*440;
      const h=getTerrainHeight(x,z);
      if(h>0.5 && h<18) createTree(scn, x, z, 0.7+Math.random()*0.8);
    }

    // ── Rocks ──
    for(let i=0;i<120;i++){
      const x=(Math.random()-0.5)*460;
      const z=(Math.random()-0.5)*460;
      createRock(scn, x, z, 0.5+Math.random()*1.5);
    }

    // ── Runway / open field ──
    const runwayGeo = new THREE.PlaneGeometry(80, 12);
    runwayGeo.rotateX(-Math.PI/2);
    const runwayMat = new THREE.MeshLambertMaterial({color:0x444444});
    const runway = new THREE.Mesh(runwayGeo, runwayMat);
    runway.position.set(50, getTerrainHeight(50,0)+0.05, 0);
    scn.add(runway);

    console.log('[Map] Built. Buildings:', buildings.length, 'Collidables:', objects.length);
  }

  // ── Collision helper ──────────────────────────────────────────
  function checkCollision(bbox) {
    for(const obj of objects) {
      // Recompute box each frame for static objects? They are static – precomputed is fine.
      if(bbox.intersectsBox(obj.box)) return true;
    }
    return false;
  }

  function getRandomLandPosition() {
    for(let attempt=0; attempt<200; attempt++) {
      const x=(Math.random()-0.5)*380;
      const z=(Math.random()-0.5)*380;
      const h=getTerrainHeight(x,z);
      if(h>0.5) return new THREE.Vector3(x, h+1, z);
    }
    return new THREE.Vector3(0, 5, 0);
  }

  function reset() { objects.length=0; buildings.length=0; trees.length=0; terrainHeightData=null; scene=null; }

  return {
    build, getTerrainHeight, checkCollision, getRandomLandPosition, reset,
    get objects() { return objects; },
    get buildings() { return buildings; },
  };
})();
