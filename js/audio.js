import { state } from './data.js';

let actx = null;
let lastCommAt = 0;

function ensureAudio() {
  if (!actx && (window.AudioContext || window.webkitAudioContext)) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (actx && actx.state === 'suspended') {
    actx.resume().catch(() => {});
  }
}

export function playSfx(type) {
  if (state.muted) return;
  ensureAudio();
  if (!actx) return;

  const now = actx.currentTime;
  if (type === 'shot' || type === 'pass') {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(type === 'shot' ? 185 : 285, now);
    o.frequency.exponentialRampToValueAtTime(55, now + (type === 'shot' ? 0.12 : 0.07));
    g.gain.setValueAtTime(type === 'shot' ? 0.35 : 0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (type === 'shot' ? 0.13 : 0.08));
    o.connect(g);
    g.connect(actx.destination);
    o.start(now);
    o.stop(now + 0.14);
  } else if (type === 'post') {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1180, now);
    o.frequency.exponentialRampToValueAtTime(840, now + 0.35);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    o.connect(g);
    g.connect(actx.destination);
    o.start(now);
    o.stop(now + 0.4);
  } else if (type === 'hit') {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, now);
    o.frequency.exponentialRampToValueAtTime(34, now + 0.18);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    o.connect(g);
    g.connect(actx.destination);
    o.start(now);
    o.stop(now + 0.21);
  } else if (type === 'whistle') {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(2850, now);
    o.frequency.setValueAtTime(2980, now + 0.08);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    o.connect(g);
    g.connect(actx.destination);
    o.start(now);
    o.stop(now + 0.34);
  } else if (type === 'horn') {
    [138.59, 174.61, 207.65].forEach(freq => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.14, now);
      g.gain.setValueAtTime(0.14, now + 1.1);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.65);
      o.connect(g);
      g.connect(actx.destination);
      o.start(now);
      o.stop(now + 1.7);
    });
  }
}

export function speakComm(text, priority = false) {
  const el = document.getElementById('commText');
  if (el) el.textContent = text;
  if (!state.commOn || state.muted || !('speechSynthesis' in window)) return;

  const now = performance.now();
  if (!priority && now - lastCommAt < 2600) return;
  lastCommAt = now;

  try {
    if (priority) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.12;
    u.pitch = 1.02;
    u.volume = 0.75;
    window.speechSynthesis.speak(u);
  } catch (e) {
    // Ignore speech synthesis autoplay restrictions
  }
}
/* ---------- Arena atmosphere: crowd bed, roars, team goal songs ---------- */
let amb = null;
function noiseBuf(sec) {
  const b = actx.createBuffer(1, Math.floor(actx.sampleRate * sec), actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
export function startAmbience() {
  ensureAudio();
  if (!actx || amb) return;
  const s = actx.createBufferSource(); s.buffer = noiseBuf(2); s.loop = true;
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.4;
  const g = actx.createGain(); g.gain.value = 0.03;
  s.connect(f); f.connect(g); g.connect(actx.destination); s.start();
  amb = { s, g };
}
export function stopAmbience() { if (amb) { try { amb.s.stop(); } catch (e) {} amb = null; } }
export function setCrowdLevel(v) { if (amb && actx) amb.g.gain.setTargetAtTime(state.muted ? 0 : v, actx.currentTime, 0.2); }
export function playRoar(sec = 2) {
  if (state.muted) return;
  ensureAudio();
  if (!actx) return;
  const s = actx.createBufferSource(); s.buffer = noiseBuf(sec);
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900;
  const g = actx.createGain(), n = actx.currentTime;
  g.gain.setValueAtTime(0.001, n); g.gain.exponentialRampToValueAtTime(0.25, n + 0.25); g.gain.exponentialRampToValueAtTime(0.001, n + sec);
  s.connect(f); f.connect(g); g.connect(actx.destination); s.start(n);
}
export function playGoalSong(abbr) { // each club gets its own short riff
  if (state.muted) return;
  ensureAudio();
  if (!actx) return;
  let h = 7; for (const ch of abbr) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const sc = [0, 2, 4, 7, 9, 12], t0 = actx.currentTime + 0.5;
  for (let i = 0; i < 8; i++) {
    const o = actx.createOscillator(), g = actx.createGain(), t = t0 + i * 0.22;
    o.type = 'square'; o.frequency.value = 261.6 * Math.pow(2, sc[((h >> (i * 2)) & 7) % 6] / 12);
    g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.21);
  }
}
