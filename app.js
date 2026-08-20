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

function setMode(next, autoStart = false) {
  stopTimer();
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
}

function toggleTimer() { timer ? stopTimer() : startTimer(); }

function resetTimer() {
  stopTimer();
  remaining = total;
  renderTimer();
  showToast('A fresh start.');
}

function skipSession() {
  const next = mode === 'focus' ? 'short' : 'focus';
  setMode(next);
  showToast(mode === 'focus' ? 'Back to your little bloom.' : 'Petal break started.');
}

function completeSession() {
  stopTimer();
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