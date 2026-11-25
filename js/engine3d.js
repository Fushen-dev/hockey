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
  container.append(engine.renderer.domElement);

  // Arena Lighting
  engine.scene.add(new THREE.HemisphereLight(0xeef7ff, 0x1d2b44, 1.35));
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.35);
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

  // Expanded NHL Proportioned Ice Sheet (42 x 20.4)
  const iceMat = new THREE.MeshStandardMaterial({ color: '#dff2fc', roughness: 0.16, metalness: 0.08 });
  addBox(engine.scene, 42, 0.2, 20.4, iceMat, 0, -0.1, 0, false);

  // Rink Markings
  const line = (x, z, w, d, c) => addBox(engine.scene, w, 0.012, d, mat(c, 0.4), x, 0.006, z, false);
  line(0, 0, 0.14, 19.8, '#d52b3b');       // Center Red Line
  line(-6.8, 0, 0.15, 19.8, '#1d58a8');   // Left Blue Line
  line(6.8, 0, 0.15, 19.8, '#1d58a8');    // Right Blue Line
  line(-17.4, 0, 0.08, 19.8, '#d52b3b');  // Left Goal Line
  line(17.4, 0, 0.08, 19.8, '#d52b3b');   // Right Goal Line

  // Center Ice Circle
  const cRing = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.42, 48), mat('#1d58a8', 0.4));
  cRing.rotation.x = -Math.PI / 2;
  cRing.position.y = 0.012;
  engine.scene.add(cRing);

  const cDot = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), mat('#1d58a8', 0.4));
  cDot.rotation.x = -Math.PI / 2;
  cDot.position.y = 0.013;
  engine.scene.add(cDot);

  // 4 End-Zone Faceoff Circles
  for (const fx of [-13.5, 13.5]) {
    for (const fz of [-5.2, 5.2]) {
      const r = new THREE.Mesh(new THREE.RingGeometry(1.85, 1.95, 36), mat('#d52b3b', 0.4));
      r.rotation.x = -Math.PI / 2;
      r.position.set(fx, 0.012, fz);
      engine.scene.add(r);

      const d = new THREE.Mesh(new THREE.CircleGeometry(0.22, 18), mat('#d52b3b', 0.4));
      d.rotation.x = -Math.PI / 2;
      d.position.set(fx, 0.013, fz);
      engine.scene.add(d);
    }
  }

  // Goal Creases
  for (const side of [-1, 1]) {
    const crease = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 28, side < 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI),
      mat('#72b8eb', 0.3)
    );
    crease.rotation.x = -Math.PI / 2;
    crease.position.set(side * 17.4, 0.012, 0);
    engine.scene.add(crease);
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

  // Arena Crowd Multi-Tier Bowl & Cheering Spectators
  const tierMat = mat('#101d34', 0.92);
  addBox(engine.scene, 48, 2.2, 5.5, tierMat, 0, 0.9, -14.5, false);
  addBox(engine.scene, 48, 2.2, 5.5, tierMat, 0, 0.9, 14.5, false);
  addBox(engine.scene, 5.5, 2.2, 32, tierMat, -24.0, 0.9, 0, false);
  addBox(engine.scene, 5.5, 2.2, 32, tierMat, 24.0, 0.9, 0, false);

  const crowdGeo = new THREE.BufferGeometry();
  const cPos = [];
  const cCol = [];
  const cBaseY = [];
  const palette = [
    new THREE.Color('#ff4d4d'),
    new THREE.Color('#58c8ff'),
    new THREE.Color('#ffc82e'),
    new THREE.Color('#ffffff'),
    new THREE.Color('#6ee7b7')
  ];

  for (let i = 0; i < 1300; i++) {
    let x, y, z;
    if (i < 900) {
      const side = i % 2 ? 1 : -1;
      x = (Math.random() - 0.5) * 44;
      const row = Math.random();
      y = 1.6 + row * 2.6;
      z = side * (12.0 + row * 4.4);
    } else {
      const side = i % 2 ? 1 : -1;
      const row = Math.random();
      x = side * (21.6 + row * 4.0);
      y = 1.6 + row * 2.6;
      z = (Math.random() - 0.5) * 26;
    }
    cPos.push(x, y, z);
    cBaseY.push(y);
    const col = palette[i % palette.length];
    cCol.push(col.r, col.g, col.b);
  }
  crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
  crowdGeo.setAttribute('color', new THREE.Float32BufferAttribute(cCol, 3));
  engine.crowdBaseY = cBaseY;
  engine.crowdPoints = new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: 0.32, vertexColors: true }));
  engine.scene.add(engine.crowdPoints);

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

export function createSkater(team, info, goalie = false, custom = null) {
  const root = new THREE.Group();
  engine.scene.add(root);

  const jersey = mat(team.c, 0.55);
  const trim = mat(team.d, 0.5);
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
