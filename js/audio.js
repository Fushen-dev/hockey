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
