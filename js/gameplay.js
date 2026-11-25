import { TM, customPro, state, getLineup } from './data.js';
import { playSfx, speakComm } from './audio.js';
import { engine, initEngine, addMesh, mat, createSkater, createRef, paintIce, recolorCrowd } from './engine3d.js';

const $ = id => document.getElementById(id);

export let game = null;
export const keys = {};
export let joyVec = { x: 0, z: 0 };

let raf = 0;
let last = 0;
let onBracketComplete = null;
let onExitToMenu = null;

export function setGameplayCallbacks({ bracketCb, menuCb }) {
  onBracketComplete = bracketCb;
  onExitToMenu = menuCb;
}

export function setJoyVec(x, z) {
  joyVec.x = x;
  joyVec.z = z;
}

function spawnParticles(pos, color = '#ffffff', count = 6) {
  if (!game || !engine) return;
  for (let i = 0; i < count; i++) {
    const p = addMesh(
      engine.scene,
      new THREE.BoxGeometry(0.07, 0.07, 0.07),
      new THREE.MeshBasicMaterial({ color }),
      pos.x,
      0.08,
      pos.z,
      false
    );
    p.userData = {
      gameObject: true,
      particle: true,
      life: 0.35,
      vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 3)
    };
    game.particles.push(p);
  }
}

export function showBanner(title, sub, dur = 1.8) {
  $('banTitle').textContent = title;
  $('banSub').textContent = sub;
  $('banner').classList.add('on');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => $('banner').classList.remove('on'), dur * 1000);
}

export function showModal(title, sub, buttons) {
  $('modTitle').textContent = title;
  $('modSub').textContent = sub;
  $('modStats').innerHTML = `
    <tr><td>${game.score[0]}</td><td>Goals</td><td>${game.score[1]}</td></tr>
    <tr><td>${game.sog[0]}</td><td>Shots on Goal</td><td>${game.sog[1]}</td></tr>
    <tr><td>${game.hits[0]}</td><td>Body Checks</td><td>${game.hits[1]}</td></tr>`;
  $('modBtns').innerHTML = '';
  buttons.forEach(([txt, fn]) => {
    const b = document.createElement('button');
    b.className = 'enter';
    b.textContent = txt;
    b.onclick = fn;
    $('modBtns').append(b);
  });
  $('modal').classList.add('on');
}

export function togglePause() {
  if (!game || game.over || game.lock) return;
  game.paused = !game.paused;
  if (game.paused) {
    showModal('GAME PAUSED', 'Adjust camera or resume play.', [
      ['Resume', () => togglePause()],
      ['Restart', () => startGame()],
      ['Exit to Menu', () => onExitToMenu && onExitToMenu('menu')]
    ]);
  } else {
    $('modal').classList.remove('on');
  }
}

export function stopGame() {
  cancelAnimationFrame(raf);
  raf = 0;
  game = null;
}

export function startGame() {
  stopGame();
  const eng = initEngine();
  if (!eng) {
    $('gameStatus').textContent = 'Error: 3D engine failed to initialize.';
    return;
  }

  for (const o of [...engine.scene.children]) {
    if (o.userData.gameObject) engine.scene.remove(o);
  }
  engine.goalLights.forEach(gl => gl.material.color.set('#330000'));

  const isShootout = state.mode === 'shootout';
  const isPractice = state.mode === 'practice';
  const homeT = TM[state.home];
  const awayT = TM[state.away];
  recolorCrowd(homeT.c, awayT.c);
  paintIce(homeT, awayT);

  game = {
    players: [],
    refs: [],
    particles: [],
    replayBuf: [],
    replayIdx: 0,
    replayMode: false,
    score: [0, 0],
    sog: [0, 0],
    hits: [0, 0],
    pp: [0, 0],
    period: 1,
    maxPeriods: isShootout ? 1 : 3,
    time: isShootout ? 15 : state.periodLen,
    over: false,
    paused: false,
    faceoff: isPractice ? 0 : 1.1,
    carrier: null,
    lastTouch: null,
    passTarget: null,
    oneTimerWindow: 0,
    puckVel: new THREE.Vector3(),
    shotCharge: 0,
    charging: false,
    shotOriginX: 0,
    icingEligible: false,
    goalTimer: 0,
    stoppageTimer: 0,
    shootoutRound: 1,
    shootoutMax: 5,
    fight: null,
    fightCooldown: 0,
    mode: state.mode,
    diff: state.diff,
    crowdExcite: 0
  };

  // Player & Pass Target Ring Indicators
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.54, 28),
    new THREE.MeshBasicMaterial({ color: '#ffc82e', side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.userData.gameObject = true;
  engine.scene.add(ring);
  game.ring = ring;

  const passRing = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.48, 24),
    new THREE.MeshBasicMaterial({ color: '#58c8ff', side: THREE.DoubleSide })
  );
  passRing.rotation.x = -Math.PI / 2;
  passRing.position.y = 0.02;
  passRing.visible = false;
  passRing.userData.gameObject = true;
  engine.scene.add(passRing);
  game.passRing = passRing;

  // Puck
  const puck = addMesh(engine.scene, new THREE.CylinderGeometry(0.13, 0.13, 0.06, 20), mat('#111317', 0.35), 0, 0.05, 0);
  puck.userData.gameObject = true;
  game.puck = puck;

  if (isShootout) {
    const info = {
      name: customPro.name,
      num: customPro.num,
      pos: 'C',
      ovr: 96,
      spd: customPro.spd,
      sht: customPro.sht,
      chk: customPro.chk
    };
    const atk = createSkater(homeT, info, false, customPro);
    atk.userData.side = 0;
    atk.userData.role = 'center';
    atk.position.set(0, 0, 0);
    atk.rotation.y = Math.PI / 2;

    const goalieInfo = awayT.roster.find(p => p.pos === 'G') || awayT.roster[5];
    const g = createSkater(awayT, goalieInfo, true, null, true);
    g.userData.side = 1;
    g.position.set(16.85, 0, 0);
    g.rotation.y = -Math.PI / 2;

    game.players.push(atk, g);
    game.human = atk;
    game.carrier = atk;
  } else {
    const skCount = isPractice ? 1 : 5;
    const form = [
      [-1.2, 0],
      [-3.2, -3.4],
      [-3.2, 3.4],
      [-7.8, -2.8],
      [-7.8, 2.8]
    ];
    const roles = ['center', 'wing', 'wing', 'defense', 'defense'];

    for (let s = 0; s < (isPractice ? 1 : 2); s++) {
      const team = s === 0 ? homeT : awayT;
      const lu = getLineup(team);
      for (let i = 0; i < skCount; i++) {
        const isCustom = s === 0 && i === 0;
        const info = isCustom
          ? {
              name: customPro.name,
              num: customPro.num,
              pos: 'C',
              ovr: Math.round((customPro.spd + customPro.sht + customPro.chk + customPro.hnd) / 4),
              spd: customPro.spd,
              sht: customPro.sht,
              chk: customPro.chk
            }
          : lu[i];
        const p = createSkater(team, info, false, isCustom ? customPro : null, s === 1);
        p.userData.side = s;
        p.userData.role = roles[i];
        p.userData.homePos = new THREE.Vector3(s === 0 ? form[i][0] : -form[i][0], 0, form[i][1]);
        p.position.copy(p.userData.homePos);
        p.rotation.y = s === 0 ? Math.PI / 2 : -Math.PI / 2;
        game.players.push(p);
      }
      const goalieInfo = team.roster.find(p => p.pos === 'G') || team.roster[5];
      const g = createSkater(team, goalieInfo, true, null, s === 1);
      g.userData.side = s;
      g.position.set(s === 0 ? -16.85 : 16.85, 0, 0);
      g.rotation.y = s === 0 ? Math.PI / 2 : -Math.PI / 2;
      game.players.push(g);
    }

    if (isPractice) {
      const goalieInfo = awayT.roster.find(p => p.pos === 'G') || awayT.roster[5];
      const g = createSkater(awayT, goalieInfo, true, null, true);
      g.userData.side = 1;
      g.position.set(16.85, 0, 0);
      g.rotation.y = -Math.PI / 2;
      game.players.push(g);
      game.carrier = game.players[0];
    }
    game.human = game.players[0];
  }

  if (!isShootout) {
    for (let r = 0; r < 2; r++) {
      const ref = createRef(r);
      ref.position.set(r === 0 ? -4.5 : 4.5, 0, r === 0 ? -8.2 : 8.2);
      game.refs.push(ref);
    }
  }

  $('replayBadge').classList.remove('on');
  $('modal').classList.remove('on');
  speakComm(`Welcome to tonight's matchup: ${awayT.full} at ${homeT.full}!`, true);
  updateBug();
  updatePlayerHud();
  $('gameStatus').textContent = isShootout
    ? 'Shootout! Skate in and bury it past the goalie.'
    : isPractice
    ? 'Free Skate! Practice slap shots, dekes, and one-timers.'
    : 'Faceoff at center ice — press Space or F on the drop!';
  if (!isPractice && !isShootout) showBanner('FACEOFF', 'PRESS SPACE OR F TO WIN THE DRAW', 1.05);

  last = performance.now();
  raf = requestAnimationFrame(loop);
}

function resetFaceoff(fx = 0, fz = 0, label = 'CENTER ICE') {
  const form = [
    [-1.1, 0],
    [-2.8, -3.0],
    [-2.8, 3.0],
    [-6.8, -2.6],
    [-6.8, 2.6]
  ];
  let idx0 = 0;
  let idx1 = 0;

  game.players.forEach(p => {
    p.userData.vel.set(0, 0, 0);
    p.userData.downTimer = 0;
    p.userData.stick.visible = true;
    if (p.userData.goalie) {
      p.position.set(p.userData.side === 0 ? -16.85 : 16.85, 0, 0);
      return;
    }
    const i = p.userData.side === 0 ? idx0++ : idx1++;
    if (p.userData.penTimer > 0) {
      p.position.set(0, 0, p.userData.side === 0 ? -10.6 : 10.6);
      return;
    }
    const px = THREE.MathUtils.clamp(fx + (p.userData.side === 0 ? form[i][0] : -form[i][0]), -16.2, 16.2);
    const pz = THREE.MathUtils.clamp(fz + form[i][1], -8.6, 8.6);
    p.position.set(px, 0, pz);
    p.rotation.y = p.userData.side === 0 ? Math.PI / 2 : -Math.PI / 2;
  });

  game.puck.position.set(fx, 0.05, fz);
  game.puckVel.set(0, 0, 0);
  game.carrier = null;
  game.passTarget = null;
  game.faceoff = 1.0;
  game.icingEligible = false;
  game.fight = null;
  game.human =
    game.players.find(p => p.userData.side === 0 && !p.userData.goalie && p.userData.penTimer <= 0) || game.players[0];
  showBanner('FACEOFF', label, 0.9);
  playSfx('whistle');
}

function diffMult() {
  return game.diff === 'rookie' ? 0.75 : game.diff === 'pro' ? 1 : game.diff === 'allstar' ? 1.18 : 1.34;
}

/* ---------- FIGHT SYSTEM ---------- */
export function startFight() {
  if (!game || game.over || game.paused || game.fight || game.fightCooldown > 0 || game.mode === 'shootout') return;
  const p = game.human;
  if (!p || p.userData.goalie || p.userData.downTimer > 0 || p.userData.penTimer > 0) return;

  const opps = game.players.filter(
    o => o.userData.side !== 0 && !o.userData.goalie && o.userData.downTimer <= 0 && o.userData.penTimer <= 0
  );
  if (!opps.length) return;
  opps.sort((a, b) => a.position.distanceTo(p.position) - b.position.distanceTo(p.position));

  const opp = opps[0];
  if (p.position.distanceTo(opp.position) > 3.6) {
    showBanner('DROP GLOVES', 'SKATE CLOSER TO AN OPPONENT TO FIGHT', 1.0);
    return;
  }

  if (game.carrier === p || game.carrier === opp) {
    game.carrier = null;
    game.puckVel.set(0, 0, 0);
  }

  const mid = p.position.clone().add(opp.position).multiplyScalar(0.5);
  mid.x = THREE.MathUtils.clamp(mid.x, -15.5, 15.5);
  mid.z = THREE.MathUtils.clamp(mid.z, -8.0, 8.0);
  p.position.set(mid.x - 0.55, 0, mid.z);
  opp.position.set(mid.x + 0.55, 0, mid.z);
  p.userData.vel.set(0, 0, 0);
  opp.userData.vel.set(0, 0, 0);
  p.rotation.y = Math.atan2(opp.position.x - p.position.x, opp.position.z - p.position.z);
  opp.rotation.y = Math.atan2(p.position.x - opp.position.x, p.position.z - opp.position.z);
  p.userData.stick.visible = false;
  opp.userData.stick.visible = false;

  game.fight = {
    p1: p,
    p2: opp,
    hp1: 100,
    hp2: 100,
    punch1: 0,
    punch2: 0,
    hitFlash1: 0,
    hitFlash2: 0,
    aiTimer: 0.55,
    ended: false
  };
  game.crowdExcite = 1.6;
  playSfx('whistle');
  showBanner(
    'GLOVES ARE OFF!',
    `#${p.userData.info.num} ${p.userData.info.name} VS #${opp.userData.info.num} ${opp.userData.info.name}`,
    1.5
  );
  speakComm(`Gloves are dropped! ${p.userData.info.name} and ${opp.userData.info.name} square off!`, true);
}

function throwPunch(attacker, defender) {
  if (!game || !game.fight || game.fight.ended) return;
  const f = game.fight;
  const isP1 = attacker === f.p1;
  if (isP1) {
    if (f.punch1 > 0.05) return;
    f.punch1 = 0.32;
  } else {
    if (f.punch2 > 0.05) return;
    f.punch2 = 0.32;
  }

  attacker.rotation.y = Math.atan2(defender.position.x - attacker.position.x, defender.position.z - attacker.position.z);
  const dmg = isP1 ? 15 + attacker.userData.info.chk * 0.12 : 12 * diffMult();
  if (isP1) {
    f.hp2 = Math.max(0, f.hp2 - dmg);
    f.hitFlash2 = 0.2;
  } else {
    f.hp1 = Math.max(0, f.hp1 - dmg);
    f.hitFlash1 = 0.2;
  }

  const knock = defender.position.clone().sub(attacker.position).setY(0).normalize().multiplyScalar(2.4);
  defender.userData.vel.copy(knock);
  playSfx('hit');
  spawnParticles(defender.position, '#ff4d4d', 8);
  game.crowdExcite = Math.min(1.8, game.crowdExcite + 0.35);

  if (f.hp1 <= 0 || f.hp2 <= 0) {
    f.ended = true;
    const winner = f.hp2 <= 0 ? f.p1 : f.p2;
    const loser = f.hp2 <= 0 ? f.p2 : f.p1;
    loser.userData.downTimer = 2.2;
    f.p1.userData.stick.visible = true;
    f.p2.userData.stick.visible = true;
    if (state.rules === 'usa' && game.mode === '5v5') {
      f.p1.userData.penTimer = 14;
      f.p2.userData.penTimer = 14;
      benchHuman();
    }
    game.fightCooldown = 4.0;
    showBanner('TAKEDOWN!', `${winner.userData.info.name.toUpperCase()} WINS THE FIGHT · 5:00 FIGHTING MAJOR`, 1.7);
    speakComm(
      `Big right hand! ${winner.userData.info.name} takes down ${loser.userData.info.name} and the crowd erupts!`,
      true
    );
    setTimeout(() => {
      if (game && game.fight === f) game.fight = null;
    }, 1300);
  }
}

function benchHuman() { // penalized human hands control to nearest skater still on the ice
  if (!game.human || game.human.userData.penTimer <= 0) return;
  const m = game.players.filter(q => q.userData.side === 0 && !q.userData.goalie && q.userData.penTimer <= 0)
    .sort((a, b) => a.position.distanceTo(game.puck.position) - b.position.distanceTo(game.puck.position))[0];
  if (m) game.human = m;
}

/* ---------- ACTIONS: SHOOT, CHECK, PASS, POKE, DEKE ---------- */
function applyBodyCheck(checker, opp) {
  opp.userData.downTimer = 1.35;
  opp.userData.pickupCd = 0.9;
  const push = opp.position.clone().sub(checker.position).setY(0).normalize();
  opp.userData.vel.copy(push.multiplyScalar(6.5));
  game.hits[checker.userData.side]++;
  game.crowdExcite = 1.0;

  if (game.carrier === opp) {
    game.carrier = null;
    const fwd = new THREE.Vector3(Math.sin(checker.rotation.y), 0, Math.cos(checker.rotation.y));
    game.puckVel.copy(fwd.multiplyScalar(3.5));
    speakComm(`Huge open-ice hit by ${checker.userData.info.name}! Puck is loose!`);
  } else {
    speakComm(`Heavy body check delivered by ${checker.userData.info.name}!`);
    if (
      state.rules === 'usa' &&
      game.mode === '5v5' &&
      opp.position.distanceTo(game.puck.position) > 2.6 &&
      Math.random() < 0.42
    ) {
      checker.userData.penTimer = 18;
      benchHuman();
      game.pp[opp.userData.side] = 18;
      game.refs.forEach(r => (r.userData.callTimer = 1.4));
      playSfx('whistle');
      showBanner('PENALTY', '2:00 ROUGHING / INTERFERENCE', 1.4);
      speakComm(`Whistle blows! ${checker.userData.info.name} is going to the box for two minutes!`, true);
    }
  }
  playSfx('hit');
  spawnParticles(opp.position, '#ffc82e', 10);
}

export function triggerShoot(power = 1) {
  if (!game || game.over || game.paused) return;
  if (game.fight) {
    throwPunch(game.fight.p1, game.fight.p2);
    return;
  }

  const p = game.human;
  if (game.carrier === p) {
    game.carrier = null;
    p.userData.pickupCd = 0.35;
    p.userData.shotAnim = 0.35;
    const isOneTimer = game.oneTimerWindow > 0;
    const spd = (15.5 + power * 11.5) * (isOneTimer ? 1.25 : 1);
    const dirX = 17.45 - p.position.x;
    const aimZ = state.cam === 'chase'
      ? Math.max(-1, Math.min(1, (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joyVec.x))
      : (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    const targetZ = aimZ !== 0 ? aimZ * 0.72 : (Math.random() - 0.5) * 1.2;
    const vec = new THREE.Vector3(dirX, 0, targetZ - p.position.z).normalize();

    game.puckVel.copy(vec.multiplyScalar(spd));
    game.puckVel.y = isOneTimer ? 2.2 : 1.2 + power * 1.5;
    game.sog[0]++;
    game.lastTouch = p;
    game.shotOriginX = p.position.x;
    game.icingEligible = p.position.x < 0 && game.pp[1] <= 0;
    playSfx('shot');
    spawnParticles(game.puck.position, '#58c8ff', isOneTimer ? 10 : 5);
  } else if (p.userData.downTimer <= 0 && p.userData.checkTimer <= 0) {
    const dir = new THREE.Vector3(Math.sin(p.rotation.y), 0, Math.cos(p.rotation.y));
    p.userData.vel.addScaledVector(dir, 7.2);
    p.userData.checkTimer = 0.3;
    for (const opp of game.players) {
      if (
        opp.userData.side !== 0 &&
        !opp.userData.goalie &&
        opp.userData.downTimer <= 0 &&
        opp.position.distanceTo(p.position) < 1.65
      ) {
        applyBodyCheck(p, opp);
        p.userData.checkTimer = 0;
        break;
      }
    }
  }
  game.shotCharge = 0;
  game.charging = false;
}

export function triggerPassOrPoke() {
  if (!game || game.over || game.paused) return;
  if (game.fight) {
    throwPunch(game.fight.p1, game.fight.p2);
    return;
  }

  const p = game.human;
  if (game.faceoff > 0) {
    game.faceoff = 0;
    game.carrier = p;
    playSfx('shot');
    return;
  }

  if (game.carrier === p) {
    const mates = game.players.filter(q => q.userData.side === 0 && !q.userData.goalie && q.userData.penTimer <= 0 && q !== p);
    if (!mates.length) return;
    const facing = new THREE.Vector3(Math.sin(p.rotation.y), 0, Math.cos(p.rotation.y));
    mates.sort((a, b) => {
      const da = a.position.clone().sub(p.position).normalize().dot(facing);
      const db = b.position.clone().sub(p.position).normalize().dot(facing);
      return db - da;
    });
    const tgt = mates[0];
    const dir = tgt.position.clone().sub(p.position).normalize();
    game.carrier = null;
    p.userData.pickupCd = 0.3;
    p.userData.shotAnim = 0.22;
    game.puckVel.copy(dir.multiplyScalar(15.0));
    game.passTarget = tgt;
    game.human = tgt;
    game.oneTimerWindow = 0.55;
    playSfx('pass');
  } else if (p.userData.downTimer <= 0) {
    p.userData.pokeTimer = 0.3;
    const car = game.carrier;
    if (car && car.userData.side === 1 && car.position.distanceTo(p.position) < 2.2) {
      car.userData.pickupCd = 0.75;
      game.carrier = p;
      game.lastTouch = p;
      game.puckVel.set(0, 0, 0);
      playSfx('pass');
      spawnParticles(game.puck.position, '#58c8ff', 5);
    } else if (!car && game.puck.position.distanceTo(p.position) < 2.1) {
      game.carrier = p;
      game.lastTouch = p;
      game.puckVel.set(0, 0, 0);
      playSfx('pass');
    }
  }
}

export function triggerDeke() {
  if (!game || game.over || game.paused || game.carrier !== game.human) return;
  const p = game.human;
  p.userData.dekeTimer = 0.35;
  const sideVec = new THREE.Vector3(Math.cos(p.rotation.y), 0, -Math.sin(p.rotation.y));
  p.userData.vel.addScaledVector(sideVec, (Math.random() > 0.5 ? 1 : -1) * 5.8);
  spawnParticles(p.position, '#ffffff', 4);
}

export function switchSkater() {
  if (!game || game.over || game.carrier === game.human) return;
  const mates = game.players.filter(p => p.userData.side === 0 && !p.userData.goalie && p !== game.human);
  if (!mates.length) return;
  mates.sort((a, b) => a.position.distanceTo(game.puck.position) - b.position.distanceTo(game.puck.position));
  game.human = mates[0];
  updatePlayerHud();
}

/* ---------- IRL HOCKEY STRATEGY AI ---------- */
function updateAI(dt) {
  const mult = diffMult();
  const puckPos = game.puck.position;
  const car = game.carrier;

  const chaser = { 0: null, 1: null };
  for (const s of [0, 1]) {
    let bestD = 1e9;
    for (const q of game.players) {
      if (q.userData.side === s && !q.userData.goalie && q.userData.downTimer <= 0 && q.userData.penTimer <= 0 && q !== game.human) {
        const d = q.position.distanceTo(puckPos);
        if (d < bestD) {
          bestD = d;
          chaser[s] = q;
        }
      }
    }
  }

  for (const p of game.players) {
    if (p === game.human && game.mode !== 'practice') continue;
    if (p === game.human && p.userData.side === 0) continue;
    const u = p.userData;
    const s = u.side;
    const dir = s === 0 ? 1 : -1;
    if (u.downTimer > 0) continue;
    if (u.aiCd > 0) u.aiCd -= dt;

    if (u.goalie) {
      const gx = s === 0 ? -16.85 : 16.85;
      const depthShift = Math.abs(puckPos.x) > 10.5 && Math.sign(puckPos.x) === -dir ? dir * 0.45 : 0;
      const tz = THREE.MathUtils.clamp(puckPos.z * 0.55, -0.82, 0.82);
      const dz = tz - p.position.z;
      p.position.z += THREE.MathUtils.clamp(dz, -4.6 * mult * dt, 4.6 * mult * dt);
      p.position.x = THREE.MathUtils.lerp(p.position.x, gx + depthShift, Math.min(1, dt * 6));
      p.rotation.y = s === 0 ? Math.PI / 2 : -Math.PI / 2;
      continue;
    }

    const mates = game.players.filter(q => q.userData.side === s && !q.userData.goalie && q.userData.penTimer <= 0 && q !== p);
    const opps = game.players.filter(q => q.userData.side !== s && !q.userData.goalie && q.userData.downTimer <= 0);
    let tgt = new THREE.Vector3();

    if (car === p) {
      const netX = dir * 17.45;
      const distToNet = Math.hypot(netX - p.position.x, p.position.z);
      const nearestOpp = opps.reduce((b, o) => Math.min(b, o.position.distanceTo(p.position)), 99);
      const inOZone = dir * p.position.x > 6.8;
      const inDZone = dir * p.position.x < -6.8;

      // Breakout outlet pass
      if ((inDZone || nearestOpp < 2.5) && u.aiCd <= 0 && mates.length) {
        const openMate = mates
          .filter(m => dir * m.position.x > dir * p.position.x + 1.4)
          .sort((a, b) => dir * b.position.x - dir * a.position.x)[0];
        if (openMate) {
          const passDir = openMate.position.clone().sub(p.position).normalize();
          game.carrier = null;
          u.pickupCd = 0.35;
          u.shotAnim = 0.25;
          u.aiCd = 0.7;
          game.puckVel.copy(passDir.multiplyScalar(14.0));
          game.passTarget = openMate;
          if (s === 0) game.human = openMate;
          playSfx('pass');
          continue;
        }
      }

      // Offensive zone cycle, backdoor one-timer, or slot shot
      if (inOZone && u.aiCd <= 0) {
        const slotMate = mates.find(
          m => Math.abs(m.position.z) < 3.6 && dir * m.position.x > 9.5 && Math.abs(m.position.z - p.position.z) > 2.8
        );
        if (slotMate && Math.random() < dt * 2.4 * mult) {
          const passDir = slotMate.position.clone().sub(p.position).normalize();
          game.carrier = null;
          u.pickupCd = 0.35;
          u.shotAnim = 0.25;
          u.aiCd = 0.8;
          game.puckVel.copy(passDir.multiplyScalar(14.5));
          game.passTarget = slotMate;
          playSfx('pass');
          continue;
        }
        if (distToNet < 9.5 && Math.random() < dt * 2.6 * mult) {
          game.carrier = null;
          u.pickupCd = 0.4;
          u.shotAnim = 0.35;
          u.aiCd = 0.8;
          const aim = new THREE.Vector3(netX - p.position.x, 0, (Math.random() - 0.5) * 1.35 - p.position.z).normalize();
          game.puckVel.copy(aim.multiplyScalar(16.5 + Math.random() * 5));
          game.puckVel.y = 1.4;
          game.sog[s]++;
          game.lastTouch = p;
          playSfx('shot');
          spawnParticles(game.puck.position, '#58c8ff', 5);
          continue;
        }
      }

      const attackZ = Math.abs(p.position.z) < 2.5 ? p.position.z : Math.sign(p.position.z) * 2.4;
      tgt.set(dir * 13.2, 0, attackZ);
    } else if (car && car.userData.side === s) {
      // 2-1-2 Offensive Cycle & Blue Line Hold
      const carInOZone = dir * car.position.x > 6.0;
      if (u.role === 'defense') {
        const sideZ = p.userData.homePos.z > 0 ? 4.4 : -4.4;
        tgt.set(carInOZone ? dir * 6.6 : dir * -6.0, 0, sideZ);
      } else if (u.role === 'center') {
        tgt.set(carInOZone ? dir * 13.5 : dir * 2.5, 0, 0);
      } else {
        const weakZ = car.position.z > 0 ? -4.8 : 4.8;
        tgt.set(carInOZone ? dir * 14.0 : dir * 5.5, 0, u.info.num % 2 ? weakZ : -weakZ * 0.7);
      }
    } else {
      // Box+1 Defensive Coverage
      const puckInDZone = dir * puckPos.x < -6.0;
      if (p === chaser[s]) {
        tgt.copy(puckPos);
        if (car && car.userData.side !== s && p.position.distanceTo(car.position) < 1.4 && u.aiCd <= 0) {
          u.aiCd = 1.1;
          if (Math.random() < 0.45 * mult) {
            u.pokeTimer = 0.28;
            car.userData.pickupCd = 0.5;
            game.carrier = null;
            game.puckVel.set((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
            playSfx('pass');
          }
        }
      } else if (u.role === 'defense') {
        const slotX = dir * -13.8;
        const slotZ = THREE.MathUtils.clamp(puckPos.z * 0.35, -2.6, 2.6) + (u.homePos.z > 0 ? 1.3 : -1.3);
        tgt.set(puckInDZone ? slotX : dir * -7.2, 0, slotZ);
      } else {
        const laneZ = u.homePos.z > 0 ? 3.4 : -3.4;
        tgt.set(puckInDZone ? dir * -9.4 : puckPos.x * 0.4, 0, laneZ);
      }
    }

    const d = tgt.sub(p.position);
    d.y = 0;
    const dist = d.length();
    if (dist > 0.22) {
      d.normalize();
      const spd = (s === 1 ? 5.6 * mult : 5.5) * (u.info.spd / 86);
      u.vel.lerp(d.multiplyScalar(spd), Math.min(1, dt * 5.5));
    } else {
      u.vel.multiplyScalar(Math.pow(0.88, dt * 60));
    }
  }
}

/* ---------- MAIN SIMULATION LOOP ---------- */
function updateGame(dt) {
  if (!game || game.over || game.paused) return;
  const mult = diffMult();

  // Goal Celebration & Slow-Motion Replay
  if (game.goalTimer > 0) {
    game.goalTimer -= dt;
    const ct = performance.now() / 1000;
    if (game.goalTimer < 2.2 && game.replayBuf.length > 10) {
      if (!game.replayMode) {
        game.replayMode = true;
        game.replayIdx = 0;
        $('replayBadge').classList.add('on');
      }
      const f = game.replayBuf[Math.min(game.replayBuf.length - 1, Math.floor(game.replayIdx))];
      if (f) {
        game.puck.position.copy(f.puck);
        f.players.forEach((fp, i) => {
          if (game.players[i]) {
            game.players[i].position.copy(fp.pos);
            game.players[i].rotation.y = fp.ry;
          }
        });
      }
      game.replayIdx += dt * 34;
    } else {
      const winSide = game.lastTouch ? game.lastTouch.userData.side : 0;
      for (const p of game.players) {
        if (!p.userData.goalie && p.userData.side === winSide) {
          p.userData.arms.forEach(a => (a.rotation.x = -2.5 + Math.sin(ct * 14) * 0.25));
          p.position.y = Math.abs(Math.sin(ct * 8 + p.userData.info.num)) * 0.22;
        }
      }
    }

    if (game.goalTimer <= 0) {
      game.replayMode = false;
      game.replayBuf = [];
      $('replayBadge').classList.remove('on');
      engine.goalLights.forEach(gl => gl.material.color.set('#330000'));
      if (game.mode === 'shootout') {
        if (game.shootoutRound >= game.shootoutMax) {
          game.over = true;
          showModal(
            'SHOOTOUT COMPLETE',
            game.score[0] > game.score[1] ? 'YOU WIN THE SHOOTOUT!' : 'GOALIE TAKES THE WIN',
            [
              ['Rematch', () => startGame()],
              ['Menu', () => onExitToMenu && onExitToMenu('menu')]
            ]
          );
        } else {
          game.shootoutRound++;
          game.human.position.set(0, 0, 0);
          game.carrier = game.human;
          game.time = 15;
          showBanner(`ROUND ${game.shootoutRound}`, 'SKATE IN AND SCORE', 1.0);
        }
      } else {
        resetFaceoff();
      }
    }
    return;
  }

  // Stoppage (Offside / Icing)
  if (game.stoppageTimer > 0) {
    game.stoppageTimer -= dt;
    if (game.stoppageTimer <= 0) {
      const st = game.pendingStoppage || { x: 0, z: 0, lbl: 'NEUTRAL ZONE' };
      game.pendingStoppage = null;
      resetFaceoff(st.x, st.z, st.lbl);
    }
    return;
  }

  // Faceoff Drop Countdown
  if (game.faceoff > 0) {
    game.faceoff -= dt;
    if (game.faceoff <= 0) {
      const aiC = game.players.find(p => p.userData.side === 1 && !p.userData.goalie);
      game.carrier = aiC || game.human;
      playSfx('shot');
    }
    return;
  }

  if (game.oneTimerWindow > 0) game.oneTimerWindow -= dt;
  if (game.fightCooldown > 0) game.fightCooldown = Math.max(0, game.fightCooldown - dt);

  // Active Fight Mode Update
  if (game.fight) {
    const f = game.fight;
    const t = performance.now() / 1000;
    if (f.punch1 > 0) f.punch1 = Math.max(0, f.punch1 - dt);
    if (f.punch2 > 0) f.punch2 = Math.max(0, f.punch2 - dt);
    if (f.hitFlash1 > 0) f.hitFlash1 = Math.max(0, f.hitFlash1 - dt);
    if (f.hitFlash2 > 0) f.hitFlash2 = Math.max(0, f.hitFlash2 - dt);

    if (!f.ended) {
      const rawX = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joyVec.x;
      const rawZ = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + joyVec.z;
      const ix = state.cam === 'chase' ? -rawZ : rawX;
      const iz = state.cam === 'chase' ? rawX : rawZ;
      f.p1.userData.vel.set(ix * 3.8, 0, iz * 3.8);
      f.p1.position.addScaledVector(f.p1.userData.vel, dt);
      f.p1.position.x = THREE.MathUtils.clamp(f.p1.position.x, -18.5, 18.5);
      f.p1.position.z = THREE.MathUtils.clamp(f.p1.position.z, -9.0, 9.0);
      f.p1.rotation.y = Math.atan2(f.p2.position.x - f.p1.position.x, f.p2.position.z - f.p1.position.z);

      f.aiTimer -= dt;
      const toP1 = f.p1.position.clone().sub(f.p2.position).setY(0);
      if (toP1.length() > 1.35) {
        toP1.normalize();
        f.p2.position.addScaledVector(toP1, 3.3 * mult * dt);
      } else if (f.aiTimer <= 0) {
        f.aiTimer = Math.max(0.38, 0.82 / mult);
        throwPunch(f.p2, f.p1);
      }
      f.p2.rotation.y = Math.atan2(f.p1.position.x - f.p2.position.x, f.p1.position.z - f.p2.position.z);
      $('gameStatus').textContent = `FIGHT! You HP: ${Math.ceil(f.hp1)}% | Opponent HP: ${Math.ceil(
        f.hp2
      )}% — Press Space or F to punch!`;
    }

    [
      [f.p1, f.punch1, f.hitFlash1],
      [f.p2, f.punch2, f.hitFlash2]
    ].forEach(([pl, pn, hf]) => {
      pl.userData.arms[0].rotation.x = pn > 0 ? -1.65 : -0.65 + Math.sin(t * 12) * 0.15;
      pl.userData.arms[1].rotation.x = pn > 0 ? -1.45 : -0.55 - Math.sin(t * 12) * 0.15;
      pl.rotation.x = hf > 0 ? -0.22 : 0;
      pl.userData.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 10 + i * Math.PI) * 0.25));
    });
    game.ring.position.set(f.p1.position.x, 0.02, f.p1.position.z);
    game.passRing.visible = false;
    return;
  }

  // Penalty Box & Power Play Timers
  for (const sIdx of [0, 1]) {
    if (game.pp[sIdx] > 0) game.pp[sIdx] = Math.max(0, game.pp[sIdx] - dt);
  }
  for (const p of game.players) {
    if (p.userData.penTimer > 0) {
      p.userData.penTimer -= dt;
      p.position.set(0, 0, p.userData.side === 0 ? -10.6 : 10.6);
      if (p.userData.penTimer <= 0) {
        p.position.set(0, 0, p.userData.side === 0 ? -7.5 : 7.5);
      }
    }
  }

  // Period Clock
  if (game.mode !== 'practice') {
    game.time -= dt;
    if (game.time <= 0) {
      game.time = 0;
      if (game.mode === 'shootout') {
        if (game.shootoutRound >= game.shootoutMax) {
          game.over = true;
          showModal('SHOOTOUT COMPLETE', game.score[0] > game.score[1] ? 'VICTORY!' : 'FINAL', [
            ['Rematch', () => startGame()],
            ['Menu', () => onExitToMenu && onExitToMenu('menu')]
          ]);
          return;
        }
        game.shootoutRound++;
        game.human.position.set(0, 0, 0);
        game.carrier = game.human;
        game.time = 15;
        showBanner(`ROUND ${game.shootoutRound}`, 'NEXT ATTEMPT', 1.0);
        return;
      }
      if (game.period < game.maxPeriods) {
        game.paused = true;
        game.lock = true;
        playSfx('whistle');
        showModal(`END OF PERIOD ${game.period}`, 'Intermission Stats', [
          [
            'Start Next Period',
            () => {
              game.period++;
              game.time = state.periodLen;
              game.paused = false;
              game.lock = false;
              $('modal').classList.remove('on');
              resetFaceoff();
            }
          ]
        ]);
        return;
      } else if (game.score[0] === game.score[1]) {
        game.paused = true;
        game.lock = true;
        playSfx('whistle');
        showModal('OVERTIME!', 'Sudden Death — Next Goal Wins', [
          [
            'Start OT',
            () => {
              game.period = 'OT';
              game.time = 60;
              game.paused = false;
              game.lock = false;
              $('modal').classList.remove('on');
              resetFaceoff();
            }
          ]
        ]);
        return;
      } else {
        game.over = true;
        playSfx('whistle');
        const won = game.score[0] > game.score[1];
        if (state.bracketActive && onBracketComplete) {
          onBracketComplete(won, `${game.score[0]}-${game.score[1]}`);
        }
        showModal(
          won ? `${TM[state.home].full} WIN!` : `${TM[state.away].full} WIN!`,
          'Final Box Score',
          state.bracketActive
            ? [
                ['Back to Bracket', () => onExitToMenu && onExitToMenu('season')]
              ]
            : [
                ['Rematch', () => startGame()],
                ['Menu', () => onExitToMenu && onExitToMenu('menu')]
              ]
        );
        return;
      }
    }
  }

  // Human Skating (Chase Cam Aligned)
  const h = game.human;
  const hu = h.userData;
  if (hu.downTimer <= 0) {
    const rawX = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joyVec.x;
    const rawZ = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + joyVec.z;
    const ix = state.cam === 'chase' ? -rawZ : rawX;
    const iz = state.cam === 'chase' ? rawX : rawZ;
    const inp = new THREE.Vector3(ix, 0, iz);
    const hustle = keys.shift && hu.stamina > 5;

    if (inp.lengthSq() > 0.04) {
      inp.normalize();
      const maxSpd = (hustle ? 8.4 : 6.2) * (hu.info.spd / 86);
      hu.vel.lerp(inp.multiplyScalar(maxSpd), Math.min(1, dt * 6.5));
      if (hustle) {
        hu.stamina = Math.max(0, hu.stamina - 28 * dt);
        if (Math.random() < dt * 12) spawnParticles(h.position, '#ffffff', 1);
      } else {
        hu.stamina = Math.min(100, hu.stamina + 12 * dt);
      }
    } else {
      hu.vel.multiplyScalar(Math.pow(0.94, dt * 60));
      hu.stamina = Math.min(100, hu.stamina + 20 * dt);
    }
  }

  if (game.charging) game.shotCharge = Math.min(1, game.shotCharge + dt * 1.45);

  updateAI(dt);

  // Active Body Check Window
  if (hu.checkTimer > 0) {
    for (const opp of game.players) {
      if (
        opp.userData.side !== 0 &&
        !opp.userData.goalie &&
        opp.userData.downTimer <= 0 &&
        opp.position.distanceTo(h.position) < 1.65
      ) {
        applyBodyCheck(h, opp);
        hu.checkTimer = 0;
        break;
      }
    }
  }

  // Move Skaters & Procedural Animations
  const t = performance.now() / 1000;
  for (const p of game.players) {
    const u = p.userData;
    if (u.pickupCd > 0) u.pickupCd -= dt;
    if (u.pokeTimer > 0) u.pokeTimer -= dt;
    if (u.dekeTimer > 0) u.dekeTimer -= dt;
    if (u.checkTimer > 0) u.checkTimer -= dt;
    if (u.shotAnim > 0) u.shotAnim -= dt;
    if (u.saveTimer > 0) u.saveTimer -= dt;

    if (u.downTimer > 0) {
      u.downTimer -= dt;
      p.rotation.z = Math.PI / 2.3;
      p.position.y = -0.22;
    } else {
      p.rotation.z = 0;
      p.position.y = 0;
    }

    p.position.addScaledVector(u.vel, dt);
    p.position.x = THREE.MathUtils.clamp(p.position.x, -18.9, 18.9);
    p.position.z = THREE.MathUtils.clamp(p.position.z, -9.2, 9.2);
    if (u.vel.lengthSq() > 0.25 && !u.goalie) {
      p.rotation.y = Math.atan2(u.vel.x, u.vel.z);
    }

    const spd = u.vel.length();
    const stride = Math.min(1.4, spd / 5);

    if (u.goalie) {
      const drop = u.saveTimer > 0;
      p.position.y = drop ? -0.24 : 0;
      u.legs[0].rotation.z = drop ? -0.65 : 0;
      u.legs[1].rotation.z = drop ? 0.65 : 0;
      u.arms[0].rotation.x = drop ? -1.1 : -0.35;
      u.arms[1].rotation.x = drop ? -0.7 : -0.25;
      continue;
    }

    p.rotation.x = u.checkTimer > 0 ? 0.32 : Math.min(0.18, spd * 0.022);
    u.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 11 + i * Math.PI + u.info.num) * 0.55 * stride));

    const isCharging = p === h && game.charging;
    if (isCharging) {
      u.stick.rotation.x = 0.75 + game.shotCharge * 0.65;
      u.arms[1].rotation.x = 0.6;
    } else if (u.shotAnim > 0) {
      u.stick.rotation.x = -0.95;
      u.arms[0].rotation.x = -0.9;
      u.arms[1].rotation.x = -0.9;
    } else if (u.pokeTimer > 0) {
      u.stick.rotation.x = -0.85;
      u.stick.position.z = 0.42;
      u.arms[1].rotation.x = -1.15;
    } else {
      u.stick.rotation.x = 0.15 + Math.sin(t * 6) * 0.06;
      u.stick.position.z = u.dekeTimer > 0 ? Math.sin(t * 28) * 0.32 : 0.14;
      u.arms.forEach((a, i) => (a.rotation.x = -0.25 + Math.sin(t * 11 + i * Math.PI) * 0.24 * stride));
    }
  }

  // Ice Selection Rings
  game.ring.position.set(h.position.x, 0.02, h.position.z);
  const mates = game.players.filter(q => q.userData.side === 0 && !q.userData.goalie && q.userData.penTimer <= 0 && q !== h);
  if (game.carrier === h && mates.length) {
    const f = new THREE.Vector3(Math.sin(h.rotation.y), 0, Math.cos(h.rotation.y));
    mates.sort(
      (a, b) =>
        b.position.clone().sub(h.position).normalize().dot(f) - a.position.clone().sub(h.position).normalize().dot(f)
    );
    game.passRing.visible = true;
    game.passRing.position.set(mates[0].position.x, 0.02, mates[0].position.z);
  } else {
    game.passRing.visible = false;
  }

  // Puck Physics
  if (game.carrier) {
    const c = game.carrier;
    game.puck.position.set(c.position.x + Math.sin(c.rotation.y) * 0.52, 0.05, c.position.z + Math.cos(c.rotation.y) * 0.52);
  } else {
    game.puck.position.addScaledVector(game.puckVel, dt);
    game.puckVel.x *= Math.pow(0.986, dt * 60);
    game.puckVel.z *= Math.pow(0.986, dt * 60);
    if (game.puck.position.y > 0.05) game.puckVel.y -= 9.8 * dt;
    if (game.puck.position.y <= 0.05) {
      game.puck.position.y = 0.05;
      game.puckVel.y = 0;
    }

    // Side Boards Bounce (Expanded Rink ±9.4)
    if (Math.abs(game.puck.position.z) > 9.4) {
      game.puck.position.z = Math.sign(game.puck.position.z) * 9.4;
      game.puckVel.z *= -0.72;
      playSfx('pass');
    }

    // Goal Line / Net / Post / Icing (Expanded Rink ±17.45)
    if (Math.abs(game.puck.position.x) > 17.45) {
      const az = Math.abs(game.puck.position.z);
      if (az < 0.85 && game.puck.position.y < 1.05) {
        const scoringSide = game.puck.position.x > 0 ? 0 : 1;
        game.score[scoringSide]++;
        engine.goalLights[scoringSide === 0 ? 1 : 0].material.color.set('#ff1a1a');
        playSfx('horn');
        const scorer =
          game.lastTouch && game.lastTouch.userData.side === scoringSide
            ? game.lastTouch.userData.info
            : { num: 97, name: 'Team Goal' };
        showBanner('GOAL!', `${TM[scoringSide === 0 ? state.home : state.away].full} · #${scorer.num} ${scorer.name}`, 1.8);
        speakComm(
          `HE SCORES! ${scorer.name} buries it for ${TM[scoringSide === 0 ? state.home : state.away].full}!`,
          true
        );
        game.crowdExcite = 1.5;
        game.goalTimer = 3.6;
        game.puckVel.set(0, 0, 0);
        if (game.period === 'OT') game.time = 0;
        return;
      } else if (az >= 0.85 && az <= 1.02 && Math.abs(game.puck.position.x) < 17.7) {
        game.puckVel.x *= -0.8;
        game.puckVel.z += (Math.random() - 0.5) * 4;
        playSfx('post');
      } else if (
        state.rules === 'usa' &&
        game.mode === '5v5' &&
        game.icingEligible &&
        Math.abs(game.puck.position.x) > 17.5 &&
        Math.sign(game.puck.position.x) !== Math.sign(game.shotOriginX)
      ) {
        const side = game.shotOriginX < 0 ? 0 : 1;
        game.stoppageTimer = 1.2;
        game.pendingStoppage = {
          x: side === 0 ? -13.5 : 13.5,
          z: game.puck.position.z > 0 ? 5.2 : -5.2,
          lbl: 'ICING · D-ZONE DRAW'
        };
        game.refs.forEach(r => (r.userData.callTimer = 1.2));
        playSfx('whistle');
        showBanner('ICING', 'DEFENSIVE ZONE FACEOFF', 1.1);
        speakComm('Icing is called. Faceoff comes all the way back.');
        return;
      } else if (Math.abs(game.puck.position.x) > 19.3) {
        game.puck.position.x = Math.sign(game.puck.position.x) * 19.3;
        game.puckVel.x *= -0.72;
      }
    }

    // Goalie Saves & Rebounds
    for (const p of game.players) {
      if (p.userData.goalie && p.position.distanceTo(game.puck.position) < 0.95 && Math.abs(game.puckVel.x) > 2) {
        p.userData.saveTimer = 0.45;
        game.puckVel.x *= -0.55;
        game.puckVel.z += (Math.random() - 0.5) * 7;
        playSfx('hit');
        spawnParticles(game.puck.position, '#ffffff', 6);
      }
    }

    // Puck Pickup
    if (
      game.passTarget &&
      game.passTarget.userData.pickupCd <= 0 &&
      game.puck.position.distanceTo(game.passTarget.position) < 1.1
    ) {
      game.carrier = game.passTarget;
      game.lastTouch = game.passTarget;
      game.passTarget = null;
      game.puckVel.set(0, 0, 0);
    } else {
      for (const p of game.players) {
        if (p.userData.goalie || p.userData.downTimer > 0 || p.userData.pickupCd > 0) continue;
        if (p.position.distanceTo(game.puck.position) < 0.85 && game.puckVel.length() < 11.5) {
          game.carrier = p;
          game.lastTouch = p;
          game.passTarget = null;
          game.icingEligible = false;
          game.puckVel.set(0, 0, 0);
          if (p.userData.side === 0) game.human = p;
          break;
        }
      }
    }
  }

  // USA Hockey Offside Check (Blue Lines at ±6.8)
  if (state.rules === 'usa' && game.mode === '5v5' && !game.carrier && Math.abs(game.puck.position.x) > 6.85) {
    const atkSide = game.puck.position.x > 0 ? 0 : 1;
    const dir = atkSide === 0 ? 1 : -1;
    const offsideSkater = game.players.find(
      p =>
        p.userData.side === atkSide &&
        !p.userData.goalie &&
        p.userData.penTimer <= 0 &&
        dir * p.position.x > 7.7 &&
        game.lastTouch &&
        game.lastTouch.userData.side === atkSide &&
        dir * game.lastTouch.position.x < 6.8
    );
    if (offsideSkater) {
      game.stoppageTimer = 1.1;
      game.pendingStoppage = { x: dir * 5.5, z: game.puck.position.z > 0 ? 4.5 : -4.5, lbl: 'OFFSIDE · NEUTRAL ZONE' };
      game.refs.forEach(r => (r.userData.callTimer = 1.1));
      playSfx('whistle');
      showBanner('OFFSIDE', 'NEUTRAL ZONE FACEOFF', 1.0);
      speakComm('Whistle for offside at the blue line.');
      return;
    }
  }

  // 2 Referees Tracking Play
  for (const ref of game.refs) {
    const ru = ref.userData;
    if (ru.callTimer > 0) ru.callTimer -= dt;
    const tx = THREE.MathUtils.clamp(game.puck.position.x + (ru.idx === 0 ? -4.2 : 4.2), -16.8, 16.8);
    const tz = ru.idx === 0 ? -8.4 : 8.4;
    const d = new THREE.Vector3(tx - ref.position.x, 0, tz - ref.position.z);
    if (d.length() > 0.3) {
      d.normalize();
      ref.position.addScaledVector(d, 4.4 * dt);
      ref.rotation.y = Math.atan2(d.x, d.z);
    }
    ru.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 9 + i * Math.PI) * 0.35));
    ru.arms[0].rotation.x = ru.callTimer > 0 ? -2.6 : -0.2;
  }

  // Record Instant Replay Buffer
  game.replayBuf.push({
    puck: game.puck.position.clone(),
    players: game.players.map(p => ({ pos: p.position.clone(), ry: p.rotation.y }))
  });
  if (game.replayBuf.length > 75) game.replayBuf.shift();

  // Particles
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const pt = game.particles[i];
    pt.userData.life -= dt;
    pt.position.addScaledVector(pt.userData.vel, dt);
    if (pt.userData.life <= 0) {
      engine.scene.remove(pt);
      game.particles.splice(i, 1);
    }
  }
}

function updateCamera(dt) {
  if (!game || !engine) return;
  const px = game.puck.position.x;
  const pz = game.puck.position.z;

  if (game.replayMode) {
    const rPos = new THREE.Vector3(px > 0 ? 14.5 : -14.5, 4.2, pz > 0 ? -7.5 : 7.5);
    engine.camera.position.lerp(rPos, Math.min(1, dt * 6));
    engine.camera.lookAt(px, 0.5, pz);
    return;
  }

  let tgt = new THREE.Vector3(px * 0.45, 0, pz * 0.35);
  let desired;
  if (state.cam === 'chase' && game.human) {
    const h = game.human;
    desired = new THREE.Vector3(h.position.x - 10.2, 7.2, h.position.z * 0.75);
    tgt = new THREE.Vector3(Math.min(17.5, h.position.x + 6.5), 0.4, pz * 0.45);
  } else if (state.cam === 'overhead') {
    desired = new THREE.Vector3(px * 0.3, 29, 13.5);
  } else if (state.cam === 'action') {
    desired = new THREE.Vector3(px * 0.55, 11.0, 18.0 + pz * 0.25);
  } else {
    desired = new THREE.Vector3(px * 0.48, 18.0, 24.0 + pz * 0.2);
  }

  engine.camera.position.lerp(desired, Math.min(1, dt * 5.5));
  engine.camera.lookAt(tgt);
}

function updateBug() {
  if (!game) return;
  const t = Math.max(0, game.time);
  const clk = t < 60 ? t.toFixed(1) : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const per =
    game.mode === 'shootout'
      ? `SO ${game.shootoutRound}/${game.shootoutMax}`
      : game.mode === 'practice'
      ? 'FREE SKATE'
      : game.period === 'OT'
      ? 'OT'
      : ['1ST', '2ND', '3RD'][game.period - 1];

  const bugHtml = `
    <div class="bug-team"><span class="bug-swatch" style="background:${TM[state.home].c}"></span>${state.home}</div>
    <div class="bug-score">${game.score[0]}</div>
    <div class="bug-score">${game.score[1]}</div>
    <div class="bug-team">${state.away}<span class="bug-swatch" style="background:${TM[state.away].c}"></span></div>
    <div class="bug-clock"><span>${per}</span><span>${clk}</span></div>
    <div class="bug-sog">SOG ${game.sog[0]}-${game.sog[1]}</div>
    <div class="bug-pp ${game.pp[0] > 0 || game.pp[1] > 0 ? 'on' : ''}">${
    game.pp[0] > 0 ? 'PP ' + Math.ceil(game.pp[0]) + 's' : 'SH ' + Math.ceil(game.pp[1]) + 's'
  }</div>`;
  if (game._bug !== bugHtml) { game._bug = bugHtml; $('bug').innerHTML = bugHtml; }

  if (engine && engine.jumboCtx && game._jk !== (game._jk = `${game.score}|${per}|${clk}`)) {
    const c = engine.jumboCtx;
    c.fillStyle = '#08152e';
    c.fillRect(0, 0, 512, 256);
    c.fillStyle = '#58c8ff';
    c.fillRect(0, 0, 512, 12);
    c.fillStyle = '#ffffff';
    c.font = 'italic 800 54px Barlow Condensed,sans-serif';
    c.textAlign = 'center';
    c.fillText(`${state.home}  ${game.score[0]}  -  ${game.score[1]}  ${state.away}`, 256, 115);
    c.fillStyle = '#ffc82e';
    c.font = '700 36px Barlow Condensed,sans-serif';
    c.fillText(`${per}  ·  ${clk}`, 256, 185);
    engine.jumboTex.needsUpdate = true;
  }
}

export function updatePlayerHud() {
  if (!game || !game.human) return;
  const u = game.human.userData;
  const parts = u.info.name.trim().split(/\s+/);
  const lastName = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).toUpperCase();
  $('phName').innerHTML = `#${u.info.num} ${lastName} <span>${u.info.pos}</span>`;
  $('staminaFill').style.width = u.stamina + '%';
  $('shotFill').style.width = game.shotCharge * 100 + '%';
}

function loop(now) {
  if (!engine) return;
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.04, (now - last) / 1000 || 0.016);
  last = now;

  if (game) {
    updateGame(dt);
    updateCamera(dt);
    updateBug();
    updatePlayerHud();

    if (engine.crowdPoints && engine.crowdBaseY) {
      if (game.crowdExcite > 0) game.crowdExcite = Math.max(0, game.crowdExcite - dt * 0.6);
      const pos = engine.crowdPoints.geometry.attributes.position;
      const amp = 0.05 + game.crowdExcite * 0.35;
      const spd = 4 + game.crowdExcite * 10;
      const nowS = performance.now() / 1000;
      for (let i = 0; i < engine.crowdBaseY.length; i++) {
        pos.setY(i, engine.crowdBaseY[i] + Math.abs(Math.sin(nowS * spd + i)) * amp);
      }
      pos.needsUpdate = true;
    }
  }
  engine.renderer.render(engine.scene, engine.camera);
}
