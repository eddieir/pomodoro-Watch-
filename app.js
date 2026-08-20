const STORAGE_KEY = 'tomato-watch-v1';
const CIRCUMFERENCE = 2 * Math.PI * 126;

const defaults = {
  durations: { focus: 25, short: 5, long: 15 },
  longInterval: 4,
  dailyGoal: 4,
  sound: true,
  autoBreak: false,
  theme: 'light',
  focusText: '',
  today: { date: '', sessions: 0, focusMinutes: 0, rituals: {} }
};

const quotes = [
  'Softness is not distraction. It is a way of staying present beautifully.',
  'You do not need a hard mood to do meaningful work.',
  'A gentle rhythm can still create something striking.',
  'One flower at a time still becomes a field.',
  'Resting your mind is part of making beautiful work.',
  'Stay with this moment. The rest can bloom later.',
  'Quiet progress is still progress.',
  'Elegance can live inside discipline too.'
];

// Optional public-domain rainforest layer. The app never depends on it:
// the Web Audio rainforest generator below is the guaranteed base sound.
const OPTIONAL_FOREST_AUDIO = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Walk_in_the_rainforest.ogg';

const $ = (id) => document.getElementById(id);
const els = {
  time: $('timeDisplay'), progress: $('progressRing'), start: $('startPauseButton'), reset: $('resetButton'), skip: $('skipButton'),
  focusInput: $('focusInput'), sessions: $('sessionsCount'), minutes: $('focusMinutes'), goalText: $('goalText'), goalBar: $('goalBar'),
  dayLabel: $('dayLabel'), quote: $('quoteText'), newQuote: $('newQuoteButton'), settings: $('settingsButton'), closeSettings: $('closeSettingsButton'),
  drawer: $('settingsDrawer'), backdrop: $('settingsBackdrop'), form: $('settingsForm'), themeToggle: $('themeToggle'), toast: $('toast'),
  soundToggle: $('soundToggle'), autoBreakToggle: $('autoBreakToggle'), installButton: $('installButton'), resetDay: $('resetDayButton')
};

let state = loadState();
let mode = 'focus';
let remaining = state.durations.focus * 60;
let total = remaining;
let timer = null;
let deferredPrompt = null;
let soundscape = null;

function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const merged = { ...defaults, ...saved, durations: { ...defaults.durations, ...(saved?.durations || {}) }, today: { ...defaults.today, ...(saved?.today || {}) } };
    if (merged.today.date !== localDateKey()) merged.today = { date: localDateKey(), sessions: 0, focusMinutes: 0, rituals: {} };
    return merged;
  } catch {
    return structuredClone(defaults);
  }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function makeNoiseBuffer(ctx, seconds = 4) {
  const frameCount = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, frameCount, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let previous = 0;
    for (let i = 0; i < frameCount; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.92 + white * 0.08;
      data[i] = white * 0.52 + previous * 0.48;
    }
  }
  return buffer;
}

function scheduleJungleChirp(engine) {
  if (!engine || engine.released) return;

  const { ctx, birdGain } = engine;
  const delayMs = 1800 + Math.random() * 5200;

  engine.chirpTimer = setTimeout(() => {
    if (!soundscape || soundscape !== engine || engine.released || engine.paused) {
      scheduleJungleChirp(engine);
      return;
    }

    const now = ctx.currentTime;
    const base = 1600 + Math.random() * 2100;
    const noteCount = Math.random() > 0.55 ? 3 : 2;

    for (let i = 0; i < noteCount; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * (0.09 + Math.random() * 0.05);
      const end = start + 0.11 + Math.random() * 0.10;

      osc.type = Math.random() > 0.5 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(base * (1 + i * 0.08), start);
      osc.frequency.exponentialRampToValueAtTime(base * (1.16 + Math.random() * 0.18), end);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.018 + Math.random() * 0.024, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(birdGain);
      osc.start(start);
      osc.stop(end + 0.02);
    }

    scheduleJungleChirp(engine);
  }, delayMs);
}

function createSoundscape() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  const master = ctx.createGain();
  const rainGain = ctx.createGain();
  const distantRainGain = ctx.createGain();
  const birdGain = ctx.createGain();
  const lowPass = ctx.createBiquadFilter();
  const highPass = ctx.createBiquadFilter();

  const intensity = 0.72 + Math.random() * 0.35;
  const brightness = 3900 + Math.random() * 2300;

  master.gain.value = 0.72;
  rainGain.gain.value = 0.16 * intensity;
  distantRainGain.gain.value = 0.07 * intensity;
  birdGain.gain.value = 0.95;

  lowPass.type = 'lowpass';
  lowPass.frequency.value = brightness;
  lowPass.Q.value = 0.35;

  highPass.type = 'highpass';
  highPass.frequency.value = 180 + Math.random() * 140;
  highPass.Q.value = 0.25;

  const rain = ctx.createBufferSource();
  rain.buffer = makeNoiseBuffer(ctx, 4.5);
  rain.loop = true;

  const distantRain = ctx.createBufferSource();
  distantRain.buffer = makeNoiseBuffer(ctx, 5.2);
  distantRain.loop = true;
  distantRain.playbackRate.value = 0.82 + Math.random() * 0.12;

  rain.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(rainGain);
  rainGain.connect(master);

  distantRain.connect(distantRainGain);
  distantRainGain.connect(master);
  birdGain.connect(master);
  master.connect(ctx.destination);

  rain.start();
  distantRain.start();

  const engine = {
    ctx,
    master,
    rain,
    distantRain,
    birdGain,
    chirpTimer: null,
    optionalForest: null,
    released: false,
    paused: false
  };

  // Optional real rainforest ambience; failures are ignored because the
  // generated rain + jungle layer is already playing.
  try {
    const forest = new Audio(OPTIONAL_FOREST_AUDIO);
    forest.loop = true;
    forest.preload = 'none';
    forest.volume = 0.07;
    forest.playsInline = true;
    forest.play().catch(() => {});
    engine.optionalForest = forest;
  } catch {}

  scheduleJungleChirp(engine);
  return engine;
}

async function startSoundscape() {
  if (!soundscape || soundscape.released) {
    soundscape = createSoundscape();
  }
  if (!soundscape) return;

  soundscape.paused = false;
  if (soundscape.ctx.state === 'suspended') {
    try { await soundscape.ctx.resume(); } catch {}
  }
  if (soundscape.optionalForest?.paused) {
    soundscape.optionalForest.play().catch(() => {});
  }
}

function pauseSoundscape() {
  if (!soundscape || soundscape.released) return;
  soundscape.paused = true;
  soundscape.optionalForest?.pause();
  if (soundscape.ctx.state === 'running') {
    soundscape.ctx.suspend().catch(() => {});
  }
}

function releaseSoundscape() {
  if (!soundscape) return;
  soundscape.released = true;
  clearTimeout(soundscape.chirpTimer);
  soundscape.optionalForest?.pause();
  try {
    if (soundscape.optionalForest) {
      soundscape.optionalForest.removeAttribute('src');
      soundscape.optionalForest.load();
    }
  } catch {}
  try { soundscape.rain.stop(); } catch {}
  try { soundscape.distantRain.stop(); } catch {}
  try { soundscape.ctx.close(); } catch {}
  soundscape = null;
}

function setMode(next, autoStart = false) {
  stopTimer();
  releaseSoundscape();
  mode = next;
  total = state.durations[mode] * 60;
  remaining = total;
  document.querySelectorAll('.mode-tab').forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  const titles = {
    focus: ['BLOOM WHERE YOUR ATTENTION IS', 'Stay with one lovely task.'],
    short: ['A LITTLE PETAL BREAK', 'Loosen your shoulders and breathe.'],
    long: ['GARDEN REST', 'Pause longer. Let your mind soften.']
  };
  $('modeEyebrow').textContent = titles[mode][0];
  $('modeTitle').textContent = titles[mode][1];
  renderTimer();
  if (autoStart) startTimer();
}

function renderTimer() {
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  els.time.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  document.title = `${els.time.textContent} · Tomato Watch`;
  const progress = total ? remaining / total : 0;
  els.progress.style.strokeDasharray = CIRCUMFERENCE;
  els.progress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
}

function startTimer() {
  if (timer) return;
  els.start.textContent = 'Pause';
  startSoundscape();

  const target = Date.now() + remaining * 1000;
  timer = setInterval(() => {
    remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    renderTimer();
    if (remaining <= 0) completeSession();
  }, 250);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
  els.start.textContent = 'Start';
  pauseSoundscape();
}

function toggleTimer() { timer ? stopTimer() : startTimer(); }

function resetTimer() {
  stopTimer();
  releaseSoundscape();
  remaining = total;
  renderTimer();
  showToast('A fresh start.');
}

function skipSession() {
  releaseSoundscape();
  const next = mode === 'focus' ? 'short' : 'focus';
  setMode(next);
  showToast(mode === 'focus' ? 'Back to your little bloom.' : 'Petal break started.');
}

function completeSession() {
  stopTimer();
  releaseSoundscape();
  if (mode === 'focus') {
    state.today.sessions += 1;
    state.today.focusMinutes += state.durations.focus;
    saveState();
    renderStats();
    notify('A daisy bloomed ✿', 'You stayed with it. Time for a soft little pause.');
    const next = state.today.sessions % state.longInterval === 0 ? 'long' : 'short';
    setMode(next, state.autoBreak);
  } else {
    notify('Rest complete', 'Come back gently when you are ready.');
    setMode('focus');
  }
}

function notify(title, body) {
  chime();
  if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/icon.svg' });
  showToast(title);
}

function chime() {
  if (!state.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    gain.connect(ctx.destination);
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freq; osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.12); osc.stop(ctx.currentTime + 0.9);
    });
  } catch {}
}

function renderStats() {
  els.sessions.textContent = state.today.sessions;
  els.minutes.textContent = state.today.focusMinutes;
  els.goalText.textContent = `${state.today.sessions} / ${state.dailyGoal}`;
  els.goalBar.style.width = `${Math.min(100, (state.today.sessions / state.dailyGoal) * 100)}%`;
}

function openSettings() {
  $('focusDuration').value = state.durations.focus;
  $('shortDuration').value = state.durations.short;
  $('longDuration').value = state.durations.long;
  $('longInterval').value = state.longInterval;
  $('dailyGoal').value = state.dailyGoal;
  els.soundToggle.setAttribute('aria-checked', String(state.sound));
  els.autoBreakToggle.setAttribute('aria-checked', String(state.autoBreak));
  els.drawer.classList.add('open');
  els.drawer.setAttribute('aria-hidden', 'false');
  els.backdrop.hidden = false;
}

function closeSettings() {
  els.drawer.classList.remove('open');
  els.drawer.setAttribute('aria-hidden', 'true');
  els.backdrop.hidden = true;
}

function toggleSwitch(el, key) {
  state[key] = !state[key];
  el.setAttribute('aria-checked', String(state[key]));
  saveState();
}

function saveSettings(e) {
  e.preventDefault();
  state.durations.focus = clamp(+$('focusDuration').value, 1, 120);
  state.durations.short = clamp(+$('shortDuration').value, 1, 60);
  state.durations.long = clamp(+$('longDuration').value, 1, 90);
  state.longInterval = clamp(+$('longInterval').value, 2, 12);
  state.dailyGoal = clamp(+$('dailyGoal').value, 1, 16);
  saveState();
  setMode(mode);
  renderStats();
  closeSettings();
  showToast('Your daisy rhythm is saved.');
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min)); }

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

function applyTheme() {
  document.body.classList.toggle('evening', state.theme === 'evening');
  els.themeToggle.innerHTML = `<span aria-hidden="true">${state.theme === 'evening' ? '☼' : '☾'}</span>`;
}

function init() {
  state.today.date = localDateKey();
  saveState();
  els.focusInput.value = state.focusText;
  els.dayLabel.textContent = new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date());
  applyTheme(); renderStats(); setMode('focus');
  document.querySelectorAll('.ritual-item').forEach(btn => btn.classList.toggle('done', !!state.today.rituals[btn.dataset.ritual]));

  document.querySelectorAll('.mode-tab').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  els.start.addEventListener('click', async () => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    toggleTimer();
  });
  els.reset.addEventListener('click', resetTimer);
  els.skip.addEventListener('click', skipSession);
  els.focusInput.addEventListener('input', () => { state.focusText = els.focusInput.value; saveState(); });
  els.newQuote.addEventListener('click', () => {
    let next = quotes[Math.floor(Math.random() * quotes.length)];
    if (quotes.length > 1) while (next === els.quote.textContent) next = quotes[Math.floor(Math.random() * quotes.length)];
    els.quote.textContent = next;
  });
  els.settings.addEventListener('click', openSettings);
  els.closeSettings.addEventListener('click', closeSettings);
  els.backdrop.addEventListener('click', closeSettings);
  els.form.addEventListener('submit', saveSettings);
  els.soundToggle.addEventListener('click', () => toggleSwitch(els.soundToggle, 'sound'));
  els.autoBreakToggle.addEventListener('click', () => toggleSwitch(els.autoBreakToggle, 'autoBreak'));
  els.themeToggle.addEventListener('click', () => { state.theme = state.theme === 'evening' ? 'light' : 'evening'; saveState(); applyTheme(); });
  els.resetDay.addEventListener('click', () => {
    state.today = { date: localDateKey(), sessions: 0, focusMinutes: 0, rituals: {} };
    saveState(); renderStats();
    document.querySelectorAll('.ritual-item').forEach(btn => btn.classList.remove('done'));
    showToast('Today’s garden is fresh again.');
  });
  document.querySelectorAll('.ritual-item').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.ritual;
    state.today.rituals[key] = !state.today.rituals[key];
    btn.classList.toggle('done', state.today.rituals[key]);
    saveState();
  }));

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e; els.installButton.classList.remove('hidden');
  });
  els.installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; els.installButton.classList.add('hidden');
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) renderTimer(); });
}

init();