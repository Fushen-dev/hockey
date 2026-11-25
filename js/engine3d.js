import { STICK_MODELS } from './data.js';

export let engine = null;

export const mat = (c, r = 0.65, m = 0.05) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

export function addMesh(parent, geo, m, x, y, z, cast = true) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = cast;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

export function addBox(parent, w, h, d, m, x, y, z, cast = true) {
  return addMesh(parent, new THREE.BoxGeometry(w, h, d), m, x, y, z, cast);
}

export function initEngine() {
  if (engine) return engine;
  if (typeof THREE === 'undefined') return null;

  const container = document.getElementById('game3d');
  engine = { scene: new THREE.Scene() };
  engine.scene.background = new THREE.Color('#091426');
  engine.scene.fog = new THREE.Fog('#091426', 48, 98);
  engine.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 160);
  engine.renderer = new THREE.WebGLRenderer({ antialias: true });
  engine.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  engine.renderer.shadowMap.enabled = true;
  engine.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  engine.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  engine.renderer.toneMappingExposure = 1.0;
  container.append(engine.renderer.domElement);

  // Arena Lighting
  engine.scene.add(new THREE.HemisphereLight(0xeef7ff, 0x1d2b44, 0.95));
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.1);
  mainLight.position.set(-8, 24, 15);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(2048, 2048);
  mainLight.shadow.camera.left = -24;
  mainLight.shadow.camera.right = 24;
  mainLight.shadow.camera.top = 14;
  mainLight.shadow.camera.bottom = -14;
  engine.scene.add(mainLight);

  const rimLight = new THREE.DirectionalLight(0x88ccff, 0.65);
  rimLight.position.set(10, 18, -15);
  engine.scene.add(rimLight);

  // Rink floor: one canvas texture carries every marking (see paintIce)
  const iceCan = document.createElement('canvas');
  iceCan.width = 2048; iceCan.height = 1024;
  engine.iceCtx = iceCan.getContext('2d');
  engine.iceTex = new THREE.CanvasTexture(iceCan);
  engine.iceTex.anisotropy = engine.renderer.capabilities.getMaxAnisotropy();
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(39.6, 19.8), new THREE.MeshStandardMaterial({ map: engine.iceTex, roughness: 0.14, metalness: 0.1 }));
  ice.rotation.x = -Math.PI / 2; ice.position.y = 0.002; ice.receiveShadow = true;
  engine.scene.add(ice);
  addBox(engine.scene, 40.2, 0.2, 20.4, mat('#9fc3d6', 0.5), 0, -0.11, 0, false);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), mat('#070d1a', 0.95));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.22; engine.scene.add(floor);
  paintIce(null, null);

  // Dasher-board advertising strips
  const adCan = document.createElement('canvas'); adCan.width = 2048; adCan.height = 64;
  const ac = adCan.getContext('2d');
  ac.fillStyle = '#0b1e44'; ac.fillRect(0, 0, 2048, 64);
  ac.fillStyle = '#ffffff'; ac.textBaseline = 'middle'; ac.font = 'italic 800 40px Barlow Condensed, Arial Narrow, sans-serif';
  for (let i = 0; i < 4; i++) ac.fillText('NHL 27  \u00b7  PRO HOCKEY  \u00b7  ', 12 + i * 512, 34);
  const adMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(adCan) });
  for (const [w, x, z, ry] of [[39.4, 0, -9.78, 0], [39.4, 0, 9.78, Math.PI], [19.4, -19.68, 0, Math.PI / 2], [19.4, 19.68, 0, -Math.PI / 2]]) {
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.6), adMat);
    ad.position.set(x, 0.5, z); ad.rotation.y = ry; engine.scene.add(ad);
  }

  // Dasher Boards, Kickplate & Plexiglass
  const boardMat = mat('#f5f8fc', 0.4);
  const kickMat = mat('#f2c324', 0.5);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcceeff,
    transparent: true,
    opacity: 0.18,
    roughness: 0.1
  });

  for (const z of [-9.9, 9.9]) {
    addBox(engine.scene, 39.8, 0.95, 0.22, boardMat, 0, 0.47, z, true);
    addBox(engine.scene, 39.6, 0.18, 0.24, kickMat, 0, 0.09, z, false);
    addBox(engine.scene, 39.6, 1.25, 0.05, glassMat, 0, 1.55, z, false);
  }
  for (const x of [-19.8, 19.8]) {
    addBox(engine.scene, 0.22, 0.95, 19.8, boardMat, x, 0.47, 0, true);
    addBox(engine.scene, 0.24, 0.18, 19.6, kickMat, x, 0.09, 0, false);
    addBox(engine.scene, 0.05, 1.25, 19.6, glassMat, x, 1.55, 0, false);
  }

  // 3D Goal Cages & Goal Lights
  engine.goalLights = [];
  for (const side of [-1, 1]) {
    const gx = side * 17.45;
    const g = new THREE.Group();
    g.position.set(gx, 0, 0);
    engine.scene.add(g);

    const postMat = mat('#d72d3b', 0.3, 0.2);
    const netMat = new THREE.MeshStandardMaterial({
      color: '#e8eef5',
      roughness: 0.8,
      transparent: true,
      opacity: 0.55,
      wireframe: true
    });

    addMesh(g, new THREE.CylinderGeometry(0.045, 0.045, 1.05, 10), postMat, 0, 0.52, -0.92);
    addMesh(g, new THREE.CylinderGeometry(0.045, 0.045, 1.05, 10), postMat, 0, 0.52, 0.92);
    const bar = addMesh(g, new THREE.CylinderGeometry(0.045, 0.045, 1.88, 10), postMat, 0, 1.04, 0);
    bar.rotation.x = Math.PI / 2;
    addBox(g, 0.75, 1.0, 1.8, netMat, side * 0.4, 0.51, 0, false);

    const gl = addMesh(
      engine.scene,
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#330000' }),
      side * 18.6,
      1.2,
      0,
      false
    );
    engine.goalLights.push(gl);
  }

  // Stepped seating bowl with spectators on every row
  const seatMat = mat('#16264a', 0.9);
  const cPos = [], cBaseY = [], cRoll = [];
  const ROWS = 11;
  const addPeople = (x, y, z) => { if (Math.random() < 0.88) { cPos.push(x, y, z); cBaseY.push(y); cRoll.push(Math.random()); } };
  for (const sg of [-1, 1]) {
    for (let r = 0; r < ROWS; r++) {
      const top = 0.9 + r * 0.62, h = top + 0.3;
      const zz = sg * (11.0 + r * 0.95), xx = sg * (21.4 + r * 0.95);
      addBox(engine.scene, 56, h, 0.95, seatMat, 0, top - h / 2, zz, false);
      addBox(engine.scene, 0.95, h, 22, seatMat, xx, top - h / 2, 0, false);
      for (let x = -26; x <= 26; x += 0.62) addPeople(x, top + 0.5, zz);
      for (let z = -10.4; z <= 10.4; z += 0.62) addPeople(xx, top + 0.5, z);
    }
    addBox(engine.scene, 60, 14, 0.5, seatMat, 0, 5, sg * 23.5, false);
    addBox(engine.scene, 0.5, 14, 50, seatMat, sg * 33, 5, 0, false);
  }
  const crowdGeo = new THREE.BufferGeometry();
  crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
  crowdGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(cPos.length).fill(1), 3));
  engine.crowdBaseY = cBaseY;
  engine.crowdRoll = cRoll;
  engine.crowdPoints = new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true }));
  engine.scene.add(engine.crowdPoints);
  recolorCrowd('#FF4C00', '#C8102E');

  // Center-Ice Overhead Jumbotron
  const jumbo = new THREE.Group();
  jumbo.position.set(0, 9.6, 0);
  engine.scene.add(jumbo);
  addBox(jumbo, 5.2, 2.2, 5.2, mat('#0b1324', 0.4, 0.5), 0, 0, 0, false);
  addBox(jumbo, 5.5, 0.22, 5.5, mat('#58c8ff', 0.2, 0.6), 0, 1.15, 0, false);
  addBox(jumbo, 5.5, 0.22, 5.5, mat('#ffc82e', 0.2, 0.6), 0, -1.15, 0, false);

  const jCan = document.createElement('canvas');
  jCan.width = 512;
  jCan.height = 256;
  engine.jumboCtx = jCan.getContext('2d');
  engine.jumboTex = new THREE.CanvasTexture(jCan);
  const scrMat = new THREE.MeshBasicMaterial({ map: engine.jumboTex });

  for (const [rx, rz, ry] of [
    [0, 2.62, 0],
    [0, -2.62, Math.PI],
    [2.62, 0, Math.PI / 2],
    [-2.62, 0, -Math.PI / 2]
  ]) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.9), scrMat);
    scr.position.set(rx, 0, rz);
    scr.rotation.y = ry;
    jumbo.add(scr);
  }

  resizeEngine();
  window.addEventListener('resize', resizeEngine);
  return engine;
}

export function resizeEngine() {
  if (!engine) return;
  const el = document.getElementById('game3d');
  const w = el.clientWidth || 800;
  const h = el.clientHeight || 450;
  engine.camera.aspect = w / h;
  engine.camera.updateProjectionMatrix();
  engine.renderer.setSize(w, h, false);
}

export function createSkater(team, info, goalie = false, custom = null, away = false) {
  const root = new THREE.Group();
  engine.scene.add(root);

  const jersey = mat(away ? '#f2f5f8' : team.c, 0.55);
  const trim = mat(away ? team.c : team.d, 0.5);
  const dark = mat('#121822', 0.6);
  const pants = mat('#172233', 0.7);
  const white = mat('#edf2f7', 0.4);
  const skin = mat('#c99474', 0.7);

  const gloveColor = custom
    ? custom.gear === 'black'
      ? '#15181c'
      : custom.gear === 'white'
      ? '#f1f5f9'
      : team.d
    : team.d;
  const gloveMat = mat(gloveColor, 0.5);
  const visorMat = mat(custom ? custom.visor : '#9edcf4', 0.15, 0.4);

  const stickSpec = custom && STICK_MODELS[custom.stick] ? STICK_MODELS[custom.stick] : null;
  const stickMat = mat(stickSpec ? stickSpec.shaft : '#2f353d', 0.35, 0.25);
  const tapeMat = mat(custom ? custom.tape : '#111111', 0.7);

  const legs = [];
  const arms = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * (goalie ? 0.2 : 0.17), 0.66, 0);
    root.add(leg);
    addMesh(leg, new THREE.CylinderGeometry(goalie ? 0.14 : 0.1, goalie ? 0.16 : 0.12, 0.44, 10), goalie ? white : pants, 0, -0.14, 0);
    addBox(leg, goalie ? 0.22 : 0.13, 0.11, 0.31, custom && custom.gear === 'white' ? white : dark, 0, -0.39, 0.07);
    addBox(leg, 0.04, 0.04, 0.34, mat('#d9e6f2', 0.2, 0.8), 0, -0.46, 0.07);
    legs.push(leg);
  }

  addMesh(root, new THREE.SphereGeometry(goalie ? 0.35 : 0.3, 16, 12), jersey, 0, 1.2, 0).scale.set(0.95, 1.15, 0.65);
  {
    const jc = away ? '#f2f5f8' : team.c;
    const L = (parseInt(jc.slice(1, 3), 16) * 0.299 + parseInt(jc.slice(3, 5), 16) * 0.587 + parseInt(jc.slice(5, 7), 16) * 0.114) / 255;
    const nc = document.createElement('canvas'); nc.width = nc.height = 128;
    const x = nc.getContext('2d'); x.textAlign = 'center'; x.fillStyle = L > 0.6 ? '#10151f' : '#ffffff';
    x.font = '800 26px Arial Narrow, Arial, sans-serif';
    x.fillText(String(info.name || '').trim().split(/\s+/).pop().toUpperCase().slice(0, 11), 64, 26);
    x.font = '800 84px Arial Narrow, Arial, sans-serif'; x.fillText(String(info.num), 64, 108);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nc), transparent: true }));
    tag.position.set(0, 1.26, -0.21); tag.rotation.y = Math.PI; root.add(tag);
  }
  addBox(root, goalie ? 0.64 : 0.54, 0.15, 0.42, trim, 0, 1.42, 0);
  addMesh(root, new THREE.CylinderGeometry(0.085, 0.085, 0.12, 10), skin, 0, 1.58, 0);
  addMesh(root, new THREE.SphereGeometry(0.19, 14, 10), skin, 0, 1.76, 0).scale.set(0.9, 1.05, 0.9);
  addMesh(root, new THREE.SphereGeometry(0.21, 14, 10), goalie ? white : jersey, 0, 1.89, 0).scale.set(1, 0.68, 1);
  addMesh(root, new THREE.SphereGeometry(0.16, 10, 8), visorMat, 0, 1.79, 0.15).scale.set(1, 0.42, 0.15);

  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * (goalie ? 0.38 : 0.33), 1.38, 0);
    root.add(arm);
    addMesh(arm, new THREE.CylinderGeometry(0.085, 0.11, 0.4, 10), jersey, 0, -0.16, 0);
    addMesh(arm, new THREE.CylinderGeometry(0.093, 0.099, 0.06, 10), trim, 0, -0.22, 0);
    addMesh(arm, new THREE.SphereGeometry(goalie && s < 0 ? 0.16 : 0.12, 10, 8), gloveMat, 0, -0.38, 0.05);
    arms.push(arm);
  }

  const handSign = custom && custom.hand === 'L' ? -1 : 1;
  const stick = new THREE.Group();
  stick.position.set(handSign * 0.27, 0.92, 0.14);
  root.add(stick);
  addMesh(stick, new THREE.CylinderGeometry(0.02, 0.025, 1.12, 8), stickMat, 0, -0.33, 0);
  addBox(stick, 0.05, 0.06, 0.38, tapeMat, 0, -0.88, 0.18);

  if (custom) {
    const w = custom.build === 'enforcer' ? 1.18 : custom.build === 'slim' ? 0.88 : 1.0;
    root.scale.set(w, custom.height, w);
  }

  root.userData = {
    legs,
    arms,
    stick,
    goalie,
    team,
    info,
    vel: new THREE.Vector3(),
    stamina: 100,
    downTimer: 0,
    pokeTimer: 0,
    dekeTimer: 0,
    checkTimer: 0,
    shotAnim: 0,
    saveTimer: 0,
    pickupCd: 0,
    aiCd: 0,
    penTimer: 0,
    gameObject: true
  };
  return root;
}

export function createRef(idx) {
  const root = new THREE.Group();
  engine.scene.add(root);

  const black = mat('#111418', 0.6);
  const stripe = mat('#f1f5f9', 0.5);
  const orange = mat('#ff6b00', 0.4);
  const skin = mat('#c99474', 0.7);
  const legs = [];
  const arms = [];

  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.16, 0.66, 0);
    root.add(leg);
    addMesh(leg, new THREE.CylinderGeometry(0.095, 0.11, 0.44, 10), black, 0, -0.14, 0);
    addBox(leg, 0.12, 0.1, 0.3, black, 0, -0.39, 0.07);
    legs.push(leg);
  }

  addMesh(root, new THREE.SphereGeometry(0.28, 14, 10), stripe, 0, 1.2, 0).scale.set(0.95, 1.15, 0.65);
  addBox(root, 0.52, 0.14, 0.4, black, 0, 1.4, 0);
  addMesh(root, new THREE.SphereGeometry(0.18, 12, 10), skin, 0, 1.74, 0);
  addMesh(root, new THREE.SphereGeometry(0.2, 12, 10), black, 0, 1.87, 0).scale.set(1, 0.66, 1);

  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.31, 1.36, 0);
    root.add(arm);
    addMesh(arm, new THREE.CylinderGeometry(0.08, 0.1, 0.38, 10), stripe, 0, -0.15, 0);
    addBox(arm, 0.14, 0.1, 0.14, orange, 0, -0.12, 0);
    arms.push(arm);
  }

  root.userData = { legs, arms, idx, vel: new THREE.Vector3(), callTimer: 0, gameObject: true };
  return root;
}
export function recolorCrowd(hc, ac) {
  if (!engine || !engine.crowdPoints) return;
  const col = engine.crowdPoints.geometry.attributes.color;
  const h = new THREE.Color(hc), a = new THREE.Color(ac);
  const n = ['#ffffff', '#9fb4d0', '#2a3a5c', '#ffc82e'].map(c => new THREE.Color(c));
  engine.crowdRoll.forEach((r, i) => {
    const c = r < 0.48 ? h : r < 0.68 ? a : n[i % 4];
    col.setXYZ(i, c.r, c.g, c.b);
  });
  col.needsUpdate = true;
}

// Paints rink markings and the home logo onto the ice texture (1 unit = 51.7px)
export function paintIce(home) {
  if (!engine || !engine.iceCtx) return;
  const c = engine.iceCtx, S = 2048 / 39.6, X = x => (x + 19.8) * S, Z = z => (z + 9.9) * S;
  c.fillStyle = '#e8f4fa'; c.fillRect(0, 0, 2048, 1024);
  c.globalAlpha = 0.16;
  for (let i = 0; i < 700; i++) {
    c.strokeStyle = i % 2 ? '#ffffff' : '#a9cfe2'; c.lineWidth = 1 + Math.random();
    const x = Math.random() * 2048, y = Math.random() * 1024;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 80 * Math.random(), y + 40 * (Math.random() - 0.5), x + 200 * Math.random(), y + 60 * (Math.random() - 0.5)); c.stroke();
  }
  c.globalAlpha = 1;
  const red = '#c8202f', blue = '#1b4fa0';
  const band = (x, w, col) => { c.fillStyle = col; c.fillRect(X(x) - (w * S) / 2, 0, w * S, 1024); };
  const ring = (x, z, r, col, w) => { c.strokeStyle = col; c.lineWidth = w * S; c.beginPath(); c.arc(X(x), Z(z), r * S, 0, Math.PI * 2); c.stroke(); };
  const dot = (x, z, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(X(x), Z(z), r * S, 0, Math.PI * 2); c.fill(); };
  for (const sd of [-1, 1]) {
    c.fillStyle = '#8cc4ea'; c.beginPath();
    c.arc(X(sd * 17.4), Z(0), 1.35 * S, sd < 0 ? -Math.PI / 2 : Math.PI / 2, sd < 0 ? Math.PI / 2 : Math.PI * 1.5);
    c.closePath(); c.fill();
  }
  band(0, 0.3, red); band(-6.8, 0.6, blue); band(6.8, 0.6, blue); band(-17.4, 0.1, red); band(17.4, 0.1, red);
  c.fillStyle = '#ffffff';
  for (let z = -9.6; z < 9.6; z += 0.6) c.fillRect(X(0) - 0.03 * S, Z(z), 0.06 * S, 0.3 * S);
  ring(0, 0, 2.3, blue, 0.1); dot(0, 0, 0.34, blue);
  c.textAlign = 'center'; c.font = 'italic 800 140px Barlow Condensed, Impact, sans-serif';
  c.globalAlpha = 0.85; c.fillStyle = home ? home.c : blue; c.fillText(home ? home.a : 'NHL', X(0), Z(0) + 48); c.globalAlpha = 1;
  for (const fx of [-13.5, 13.5]) for (const fz of [-5.2, 5.2]) { ring(fx, fz, 1.9, red, 0.1); dot(fx, fz, 0.22, red); }
  for (const fx of [-5.5, 5.5]) for (const fz of [-4.5, 4.5]) dot(fx, fz, 0.22, red);
  engine.iceTex.needsUpdate = true;
}

// Dynamic ice wear: skate trails scratch the ice texture during play
export function scratchIce(x0, z0, x1, z1) {
  if (!engine || !engine.iceCtx) return;
  const c = engine.iceCtx, S = 2048 / 39.6;
  c.strokeStyle = 'rgba(150,185,205,0.35)'; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo((x0 + 19.8) * S, (z0 + 9.9) * S); c.lineTo((x1 + 19.8) * S, (z1 + 9.9) * S); c.stroke();
  engine.iceDirty = true;
}
export function flushIce() { if (engine && engine.iceDirty) { engine.iceTex.needsUpdate = true; engine.iceDirty = false; } }
