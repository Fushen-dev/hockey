import { NHL_TEAMS, TM, customPro, state } from './data.js';
import { playSfx } from './audio.js';
import {
  game,
  keys,
  setJoyVec,
  setGameplayCallbacks,
  startGame,
  stopGame,
  togglePause,
  startFight,
  triggerShoot,
  triggerPassOrPoke,
  triggerDeke,
  switchSkater
} from './gameplay.js';

const $ = id => document.getElementById(id);

const MENU = [
  ['Play Now', 'Quick Match', 'Drop into full 5v5 NHL broadcast hockey on an expanded rink with real rosters, USA Hockey rules, 2 referees, fighting, and goal instant replays.', 'game'],
  ['Be A Pro Customizer', 'Sticks & Gear', 'Equip Bauer, CCM, Warrior, or True sticks, blade curves, visors, body shape, handedness, and ratings.', 'custom'],
  ['Game Setup', 'Matchup & Rules', 'Pick from all 32 NHL franchises, set difficulty, period length, ruleset, and camera angles.', 'teams'],
  ['Playoff Bracket', 'Stanley Cup Run', 'Compete in a 16-team elimination tournament to win the Championship Cup.', 'season'],
  ['Shootout', '1v1 Breakaways', 'Go head-to-head against top NHL goalies in a 5-round penalty shot duel.', 'shootout'],
  ['NHL Rosters', '32 Franchises', 'Inspect real NHL lineups, overalls, speeds, and live NHL API roster updates.', 'rosters'],
  ['Build Hub', 'Lightbox Project', 'View the Backlit Lightbox circuit, 3D-printed frame, and laser-engraved panel notes.', 'project']
];

let cur = 0;

function drawMenu() {
  $('list').innerHTML = '';
  MENU.forEach((m, i) => {
    const b = document.createElement('button');
    b.textContent = m[0];
    b.className = i === cur ? 'cur' : '';
    b.onmouseenter = () => setCur(i);
    b.onclick = () => {
      setCur(i);
      enterMenu();
    };
    $('list').append(b);
  });
  updateHero();
}

function setCur(i) {
  cur = i;
  [...$('list').children].forEach((b, j) => (b.className = j === cur ? 'cur' : ''));
  updateHero();
}

function updateHero() {
  const m = MENU[cur];
  $('heroTag').textContent = m[1];
  $('ct').textContent = m[0];
  $('cd').textContent = m[2];
  $('hmMatch').textContent = `${state.home} vs ${state.away}`;
  $('hmDiff').textContent = state.diff.toUpperCase();
  $('hmMode').textContent = state.mode === '5v5' ? '5v5 Pro' : state.mode === 'shootout' ? 'Shootout' : 'Practice';
}

function enterMenu() {
  state.bracketActive = false;
  const target = MENU[cur][3];
  if (target === 'shootout') {
    state.mode = 'shootout';
    $('selMode').value = 'shootout';
    go('game');
  } else {
    if (target === 'game' && state.mode === 'shootout') {
      state.mode = '5v5';
      $('selMode').value = '5v5';
    }
    go(target);
  }
}

$('enter').onclick = enterMenu;

$('pills').innerHTML = [
  ['Menu', 'menu'],
  ['Play', 'game'],
  ['Setup', 'teams'],
  ['Customizer', 'custom'],
  ['Playoffs', 'season'],
  ['Rosters', 'rosters'],
  ['Build', 'project']
]
  .map(p => `<button data-v="${p[1]}">${p[0]}</button>`)
  .join('');

$('pills').onclick = e => {
  if (e.target.dataset.v) { if (e.target.dataset.v === 'game') state.bracketActive = false; go(e.target.dataset.v); }
};

$('commBtn').onclick = () => {
  state.commOn = !state.commOn;
  $('commBtn').textContent = state.commOn ? 'Comm: On' : 'Comm: Off';
  $('commBtn').classList.toggle('muted', !state.commOn);
  if (!state.commOn && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
};

$('muteBtn').onclick = () => {
  state.muted = !state.muted;
  $('muteBtn').textContent = state.muted ? 'SFX: Off' : 'SFX: On';
  $('muteBtn').classList.toggle('muted', state.muted);
};

$('touchToggle').onclick = () => {
  state.touchForce = !state.touchForce;
  $('touchUI').style.display = state.touchForce ? 'block' : '';
};

const lum = h =>
  (parseInt(h.slice(1, 3), 16) * 0.299 + parseInt(h.slice(3, 5), 16) * 0.587 + parseInt(h.slice(5, 7), 16) * 0.114) / 255;

const badge = a => {
  const t = TM[a];
  return `<span class="badge" style="background:${t.c};color:${lum(t.c) > 0.55 ? '#111' : '#fff'};border-color:${t.d}">${a}</span>`;
};

const ratHtml = a => {
  const t = TM[a];
  return `<div class="rpill"><small>OVR</small><b>${t.ovr}</b></div><div class="rpill"><small>OFF</small><b>${t.off}</b></div><div class="rpill"><small>DEF</small><b>${t.def}</b></div><div class="rpill"><small>GOL</small><b>${t.gol}</b></div>`;
};

function theme() {
  document.documentElement.style.setProperty('--c1', TM[state.home].c);
  document.documentElement.style.setProperty('--c2', TM[state.home].d);
  $('wm').textContent = state.home;
  $('bH').innerHTML = badge(state.home);
  $('bA').innerHTML = badge(state.away);
  $('ratH').innerHTML = ratHtml(state.home);
  $('ratA').innerHTML = ratHtml(state.away);
  updateHero();
}

function fillSelect(el, val) {
  el.innerHTML = NHL_TEAMS.map(
    t => `<option value="${t[0]}" ${t[0] === val ? 'selected' : ''}>${t[1]} ${t[2]} (${t[5]} OVR)</option>`
  ).join('');
}

fillSelect($('selH'), state.home);
fillSelect($('selA'), state.away);
fillSelect($('selR'), state.home);
theme();

$('selH').onchange = e => {
  state.home = e.target.value;
  theme();
};
$('selA').onchange = e => {
  state.away = e.target.value;
  theme();
};
$('swapTeams').onclick = () => {
  [state.home, state.away] = [state.away, state.home];
  $('selH').value = state.home;
  $('selA').value = state.away;
  theme();
};
$('selMode').onchange = e => {
  state.mode = e.target.value;
  updateHero();
};
$('selDiff').onchange = e => {
  state.diff = e.target.value;
  updateHero();
};
$('selPer').onchange = e => {
  state.periodLen = parseInt(e.target.value, 10);
};
$('selRules').onchange = e => {
  state.rules = e.target.value;
};
$('selCam').onchange = e => {
  state.cam = e.target.value;
  $('btnCamCycle').textContent = 'Cam: ' + e.target.options[e.target.selectedIndex].text.split(' ')[0];
};
$('goPlay').onclick = () => {
  state.bracketActive = false;
  go('game');
};

export function go(v) {
  ['menu', 'teams', 'rosters', 'season', 'custom', 'game', 'project'].forEach(x =>
    $('v-' + x).classList.toggle('on', x === v)
  );
  [...$('pills').children].forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v !== 'game') stopGame();
  if (v === 'game') startGame();
  if (v === 'rosters') showRoster();
  if (v === 'season') renderBracket();
  window.scrollTo(0, 0);
}

/* ---------- ROSTERS + LIVE NHL API SYNC ---------- */
function showRoster() {
  const t = TM[$('selR').value];
  const groups = [
    ['Forwards', t.roster.filter(p => ['C', 'LW', 'RW', 'L', 'R'].includes(p.pos))],
    ['Defensemen', t.roster.filter(p => ['LD', 'RD', 'D'].includes(p.pos))],
    ['Goalies', t.roster.filter(p => p.pos === 'G')]
  ];
  $('rosterOut').innerHTML = groups
    .map(
      ([title, arr]) => `
    <h3 class="d" style="color:var(--ice);margin:14px 0 8px">${title}</h3>
    <div class="cards">${arr
      .map(
        p => `
      <div class="pc">
        <div class="pc-top"><span class="pc-num">#${p.num} · ${p.pos}</span><span class="pc-ovr">${p.ovr}</span></div>
        <b>${p.name}</b>
        <div class="pc-bars"><span>SPD ${p.spd}</span><span>SHT ${p.sht}</span><span>CHK ${p.chk}</span></div>
      </div>`
      )
      .join('')}
    </div>`
    )
    .join('');
}

$('selR').onchange = showRoster;

$('syncLiveBtn').onclick = async () => {
  const code = $('selR').value;
  $('syncLiveBtn').textContent = 'Syncing...';
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/roster/${code}/current`);
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();
    const mapPlayer = (x, fallbackPos) => ({
      name: `${x.firstName?.default || ''} ${x.lastName?.default || 'Player'}`.trim(),
      num: x.sweaterNumber || 10,
      pos: x.positionCode || fallbackPos,
      ovr: 86,
      spd: 86,
      sht: 85,
      chk: 84
    });
    const fw = (data.forwards || []).slice(0, 6).map(x => mapPlayer(x, 'C'));
    const df = (data.defensemen || []).slice(0, 4).map(x => mapPlayer(x, 'D'));
    const gl = (data.goalies || []).slice(0, 2).map(x => mapPlayer(x, 'G'));
    if (fw.length && gl.length) {
      TM[code].roster = [...fw, ...df, ...gl];
      showRoster();
    }
    $('syncLiveBtn').textContent = 'Synced Live!';
  } catch (e) {
    $('syncLiveBtn').textContent = 'Offline Roster Active';
  }
  setTimeout(() => ($('syncLiveBtn').textContent = 'Sync Live NHL API'), 2200);
};

/* ---------- CUSTOMIZER ---------- */
function syncCustomUI() {
  customPro.name = $('cName').value.trim() || 'Connor McDavid';
  customPro.num = Math.max(1, Math.min(98, parseInt($('cNum').value, 10) || 97));
  customPro.hand = $('cHand').value;
  customPro.height = parseFloat($('cHeight').value);
  const inches = Math.round(72 * customPro.height);
  $('cHeightVal').textContent = `${Math.floor(inches / 12)}'${inches % 12}"`;
  customPro.build = $('cBuild').value;
  customPro.stick = $('cStick').value;
  customPro.tape = $('cTape').value;
  customPro.visor = $('cVisor').value;
  customPro.gear = $('cGear').value;
  customPro.spd = parseInt($('cSpd').value, 10);
  $('vSpd').textContent = customPro.spd;
  customPro.sht = parseInt($('cSht').value, 10);
  $('vSht').textContent = customPro.sht;
  customPro.chk = parseInt($('cChk').value, 10);
  $('vChk').textContent = customPro.chk;
  customPro.hnd = parseInt($('cHnd').value, 10);
  $('vHnd').textContent = customPro.hnd;
}

['cName', 'cNum', 'cHand', 'cHeight', 'cBuild', 'cStick', 'cTape', 'cVisor', 'cGear', 'cSpd', 'cSht', 'cChk', 'cHnd'].forEach(
  id => $(id).addEventListener('input', syncCustomUI)
);

$('saveCustomPlay').onclick = () => {
  syncCustomUI();
  go('game');
};

/* ---------- PLAYOFF BRACKET ---------- */
function initBracket() {
  const pool = NHL_TEAMS.map(t => t[0])
    .filter(a => a !== state.home)
    .sort(() => Math.random() - 0.5)
    .slice(0, 15);
  const teams = [state.home, ...pool];
  const r1 = [];
  for (let i = 0; i < 16; i += 2) r1.push({ a: teams[i], b: teams[i + 1], winner: null, score: '' });
  state.bracket = { round: 0, rounds: [r1, [], [], []], champ: null };
}

function simMatch(a, b) {
  const ta = TM[a];
  const tb = TM[b];
  const pa = ta.ovr + (Math.random() * 10 - 5);
  const pb = tb.ovr + (Math.random() * 10 - 5);
  const win = pa >= pb ? a : b;
  const sa = 2 + Math.floor(Math.random() * 3) + (win === a ? 1 : 0);
  const sb = Math.min(sa - 1, 1 + Math.floor(Math.random() * 3));
  return { winner: win, score: win === a ? `${sa}-${sb}` : `${sb}-${sa}` };
}

function advanceBracketWithUserWin(userWon, scoreStr) {
  if (!state.bracket) return;
  const br = state.bracket;
  const r = br.rounds[br.round];
  const userMatch = r.find(m => m.a === state.home || m.b === state.home);
  if (userMatch) {
    userMatch.winner = userWon ? state.home : userMatch.a === state.home ? userMatch.b : userMatch.a;
    userMatch.score = scoreStr;
  }
  r.forEach(m => {
    if (!m.winner) {
      const res = simMatch(m.a, m.b);
      m.winner = res.winner;
      m.score = res.score;
    }
  });
  if (br.round === 3) {
    br.champ = r[0].winner;
    return;
  }
  const step = () => {
    const q = br.rounds[br.round], next = [];
    for (let i = 0; i < q.length; i += 2) next.push({ a: q[i].winner, b: q[i + 1].winner, winner: null, score: '' });
    br.round++;
    br.rounds[br.round] = next;
  };
  step();
  while (!userWon && br.round <= 3) { // user eliminated: sim the rest so a champion is crowned
    br.rounds[br.round].forEach(m => { const x = simMatch(m.a, m.b); m.winner = x.winner; m.score = x.score; });
    if (br.round === 3) { br.champ = br.rounds[3][0].winner; break; }
    step();
  }
}

function renderBracket() {
  if (!state.bracket) initBracket();
  const br = state.bracket;
  const names = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Stanley Cup Final'];
  $('bracketStatus').textContent = br.champ
    ? br.champ === state.home
      ? `CHAMPIONS! ${TM[state.home].full} won the Cup!`
      : `${TM[br.champ].full} won the Cup. Start a new bracket!`
    : `Round ${br.round + 1} of 4 · Controlling ${TM[state.home].full}`;

  $('bracketOut').innerHTML = names
    .map((nm, ri) => {
      const ms = br.rounds[ri];
      return `<div><h3 class="d" style="color:var(--ice);margin:0 0 8px">${nm}</h3>${
        ms.length
          ? ms
              .map(m => {
                const isUser = m.a === state.home || m.b === state.home;
                return `<div class="series-card ${isUser ? 'user' : ''}">
          <div class="series-row ${m.winner === m.a ? 'win' : ''}"><span>${TM[m.a].full}</span><span>${
                  m.winner === m.a ? 'W' : ''
                }</span></div>
          <div class="series-row ${m.winner === m.b ? 'win' : ''}"><span>${TM[m.b].full}</span><span>${
                  m.score || ''
                }</span></div>
        </div>`;
              })
              .join('<div style="height:8px"></div>')
          : '<div class="series-card" style="color:#7896bd">Awaiting previous round</div>'
      }</div>`;
    })
    .join('');
}

$('resetBracket').onclick = () => {
  initBracket();
  renderBracket();
};

$('playBracketGame').onclick = () => {
  if (!state.bracket) initBracket();
  if (state.bracket.champ || !state.bracket.rounds[state.bracket.round].some(x => x.a === state.home || x.b === state.home)) initBracket();
  const r = state.bracket.rounds[state.bracket.round];
  const m = r.find(x => x.a === state.home || x.b === state.home);
  if (m) {
    state.away = m.a === state.home ? m.b : m.a;
    $('selA').value = state.away;
    theme();
    state.mode = '5v5';
    $('selMode').value = '5v5';
    state.bracketActive = true;
    go('game');
  }
};

/* ---------- KEYBOARD & TOUCH INPUTS ---------- */
document.addEventListener('keydown', e => {
  if ($('v-menu').classList.contains('on')) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setCur((cur + (e.key === 'ArrowDown' ? 1 : MENU.length - 1)) % MENU.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      enterMenu();
    }
  } else if (e.key === 'Escape') {
    if ($('v-game').classList.contains('on') && game && !game.over) togglePause();
    else go('menu');
  }
});

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (!$('v-game').classList.contains('on') || !game) return;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
  if (e.repeat && k !== ' ') return;

  if (k === ' ') {
    if (game.faceoff > 0) {
      game.faceoff = 0;
      game.carrier = game.human;
      playSfx('shot');
      return;
    }
    if (game.carrier === game.human) game.charging = true;
    else if (!e.repeat) triggerShoot(0);
  }
  if (k === 'f') triggerPassOrPoke();
  if (k === 'g') startFight();
  if (k === 'q' || k === 'e') triggerDeke();
  if (k === 'tab') switchSkater();
  if (k === 'p') togglePause();
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  if (k === ' ' && game && game.charging) triggerShoot(game.shotCharge);
});

(() => {
  const zone = $('joyZone');
  const knob = $('joyKnob');
  let activeId = null;
  const upd = (cx, cy) => {
    const r = zone.getBoundingClientRect();
    const dx = cx - (r.left + r.width / 2);
    const dy = cy - (r.top + r.height / 2);
    const max = r.width / 2 - 18;
    const dist = Math.min(max, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    knob.style.transform = `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px)`;
    setJoyVec((Math.cos(ang) * dist) / max, (Math.sin(ang) * dist) / max);
  };
  zone.addEventListener('pointerdown', e => {
    activeId = e.pointerId;
    zone.setPointerCapture(activeId);
    upd(e.clientX, e.clientY);
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId === activeId) upd(e.clientX, e.clientY);
  });
  const end = e => {
    if (e.pointerId === activeId) {
      activeId = null;
      setJoyVec(0, 0);
      knob.style.transform = '';
    }
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);

  $('btnShoot').addEventListener('pointerdown', () => {
    if (game && game.faceoff > 0) {
      game.faceoff = 0;
      game.carrier = game.human;
    } else {
      triggerShoot(0.75);
    }
  });
  $('btnPass').addEventListener('pointerdown', () => triggerPassOrPoke());
  $('btnDeke').addEventListener('pointerdown', () => triggerDeke());
  $('btnFight').addEventListener('pointerdown', () => startFight());
  $('btnSwitch').addEventListener('pointerdown', () => switchSkater());
})();

$('btnCamCycle').onclick = () => {
  const order = ['chase', 'broadcast', 'overhead', 'action'];
  const labels = ['Chase', 'Broadcast', 'Overhead', 'Action'];
  const i = (order.indexOf(state.cam) + 1) % order.length;
  state.cam = order[i];
  $('selCam').value = state.cam;
  $('btnCamCycle').textContent = 'Cam: ' + labels[i];
};

$('btnPause').onclick = () => togglePause();

setGameplayCallbacks({
  bracketCb: advanceBracketWithUserWin,
  menuCb: go
});

drawMenu();
