'use strict';

const STORAGE_KEY = 'protein-tracker-v1';
const TUBE_HEIGHT = 250;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---- State -----------------------------------------------------------------

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.entries)) return saved;
  } catch (_) { /* fall through to defaults */ }
  return { goal: 150, entries: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const state = loadState();
let viewDate = startOfDay(new Date());

// ---- Date helpers ----------------------------------------------------------

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
}

function isToday(d) {
  return dayKey(d) === dayKey(new Date());
}

function dayLabel(d) {
  if (isToday(d)) return 'Today';
  if (dayKey(d) === dayKey(addDays(new Date(), -1))) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---- Data queries ----------------------------------------------------------

function entriesFor(d) {
  const key = dayKey(d);
  return state.entries.filter(e => dayKey(e.ts) === key).sort((a, b) => b.ts - a.ts);
}

function totalFor(d) {
  return entriesFor(d).reduce((sum, e) => sum + e.grams, 0);
}

// Most frequently logged name+amount combos become quick-add chips.
function quickAddItems(limit = 8) {
  const counts = new Map();
  for (const e of state.entries) {
    if (!e.name) continue;
    const k = `${e.name.toLowerCase()}|${e.grams}`;
    const c = counts.get(k) || { name: e.name, grams: e.grams, count: 0, last: 0 };
    c.count++;
    c.last = Math.max(c.last, e.ts);
    counts.set(k, c);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, limit);
}

// ---- Mutations -------------------------------------------------------------

function addEntry(name, grams) {
  // Logging onto a past day puts it at noon so it lands on the right date.
  const ts = isToday(viewDate) ? Date.now() : viewDate.getTime() + 12 * 3600 * 1000;
  const before = totalFor(viewDate);
  const id = crypto.randomUUID?.() ?? String(Date.now() + Math.random());
  state.entries.push({ id, name, grams, ts });
  saveState();
  justAddedId = id;
  render();

  const after = before + grams;
  floatGain(grams, Math.min(after / state.goal, 1));
  if (before < state.goal && after >= state.goal) celebrate();
}

// ---- Effects ---------------------------------------------------------------

let justAddedId = null;

// Tween a number up or down instead of snapping to it.
function countTo(el, target) {
  const from = parseFloat(el.dataset.value ?? '0');
  el.dataset.value = target;
  if (reducedMotion.matches || from === target) { el.textContent = fmt(target); return; }
  const start = performance.now();
  const duration = 900;
  const step = now => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (target - from) * eased);
    if (t < 1 && el.dataset.value == target) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function floatGain(grams, level) {
  const tag = document.createElement('span');
  tag.className = 'float';
  tag.textContent = `+${fmt(grams)}g`;
  tag.style.top = `${Math.max((1 - level) * TUBE_HEIGHT - 26, -18)}px`;
  tag.addEventListener('animationend', () => tag.remove());
  $('fx').append(tag);

  const tube = $('tube');
  tube.classList.remove('slosh');
  void tube.offsetWidth; // restart the animation
  tube.classList.add('slosh');
}

function celebrate() {
  if (reducedMotion.matches) return;
  const style = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--liquid-top', '--liquid-bottom', '--border-strong'].map(v => style.getPropertyValue(v));
  const fx = $('fx');
  for (let i = 0; i < 28; i++) {
    const bit = document.createElement('i');
    bit.className = 'confetti';
    const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 70;
    bit.style.setProperty('--x', `${Math.cos(angle) * dist}px`);
    bit.style.setProperty('--y', `${Math.sin(angle) * dist - 30}px`);
    bit.style.setProperty('--r', `${Math.random() * 540 - 270}deg`);
    bit.style.setProperty('--c', colors[i % colors.length]);
    bit.style.animationDelay = `${Math.random() * 120}ms`;
    bit.addEventListener('animationend', () => bit.remove());
    fx.append(bit);
  }
}

function deleteEntry(id) {
  state.entries = state.entries.filter(e => e.id !== id);
  saveState();
  render();
}

// ---- Rendering -------------------------------------------------------------

const $ = id => document.getElementById(id);
const fmt = n => (Math.round(n * 10) / 10).toString();

function render() {
  const total = totalFor(viewDate);
  const goal = state.goal;

  const left = Math.max(goal - total, 0);
  const hit = total >= goal;
  const level = Math.min(total / goal, 1);

  $('dayLabel').textContent = dayLabel(viewDate);
  $('nextDay').disabled = isToday(viewDate);
  $('goalGrams').textContent = goal;
  $('goalStat').textContent = goal;
  $('leftStat').textContent = fmt(left);
  $('mealStat').textContent = entriesFor(viewDate).length;
  $('remaining').textContent = hit ? 'goal reached' : `${fmt(left)}g to go`;
  $('statusDot').className = 'dot' + (hit ? ' hit' : total > 0 ? ' live' : '');
  $('scaleTop').textContent = goal;
  $('scaleMid').textContent = Math.round(goal / 2);
  countTo($('totalGrams'), total);
  $('pct').textContent = `${Math.round((total / goal) * 100)}%`;

  const tube = $('tube');
  tube.style.setProperty('--level', level);
  tube.classList.toggle('empty', total === 0);
  tube.classList.toggle('full', hit);
  tube.setAttribute('aria-valuenow', Math.round(level * 100));

  renderEntries();
  renderQuickAdd();
  renderWeek();
  renderSuggestions();
}

function renderEntries() {
  const list = $('entryList');
  const entries = entriesFor(viewDate);
  list.replaceChildren(...entries.map(e => {
    const li = document.createElement('li');
    if (e.id === justAddedId) li.className = 'enter';
    const time = new Date(e.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const name = e.name || 'Protein';
    li.innerHTML = `
      <span class="avatar"></span>
      <div class="entry-main">
        <div class="entry-name"></div>
        <div class="entry-time">${time}</div>
      </div>
      <span class="grams-pill">+${fmt(e.grams)}g</span>
      <button class="del-btn" aria-label="Delete">×</button>`;
    li.querySelector('.avatar').textContent = name[0];
    li.querySelector('.entry-name').textContent = name;
    li.querySelector('.del-btn').addEventListener('click', () => deleteEntry(e.id));
    return li;
  }));
  justAddedId = null;
  $('entryCount').textContent = entries.length;
  $('emptyMsg').hidden = entries.length > 0;
}

function renderQuickAdd() {
  const items = quickAddItems();
  $('quickSection').hidden = items.length === 0;
  $('quickList').replaceChildren(...items.map(item => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = item.name;
    const b = document.createElement('b');
    b.textContent = `${fmt(item.grams)}g`;
    btn.append(b);
    btn.addEventListener('click', () => addEntry(item.name, item.grams));
    return btn;
  }));
}

function renderWeek() {
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const totals = days.map(totalFor);
  const max = Math.max(state.goal, ...totals);

  $('weekChart').replaceChildren(...days.map((d, i) => {
    const col = document.createElement('button');
    col.className = 'bar-col' + (dayKey(d) === dayKey(viewDate) ? ' selected' : '');
    const t = totals[i];
    col.innerHTML = `
      <span class="bar-val">${t ? Math.round(t) : ''}</span>
      <span class="bar${t >= state.goal ? ' hit' : t > 0 ? ' some' : ''}" style="height:${(t / max) * 100}%; --i:${i}"></span>
      <span class="bar-day">${d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>`;
    col.addEventListener('click', () => { viewDate = d; render(); });
    return col;
  }));
}

function renderSuggestions() {
  const names = [...new Set(state.entries.map(e => e.name).filter(Boolean))];
  $('foodSuggestions').replaceChildren(...names.map(n => {
    const o = document.createElement('option');
    o.value = n;
    return o;
  }));
}

// ---- Events ----------------------------------------------------------------

$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const grams = parseFloat($('gramsInput').value);
  if (!(grams > 0)) return;
  addEntry($('foodInput').value.trim(), grams);
  $('foodInput').value = '';
  $('gramsInput').value = '';
  $('gramsInput').blur();
});

// Picking a known food pre-fills the grams you last logged for it.
$('foodInput').addEventListener('change', () => {
  const name = $('foodInput').value.trim().toLowerCase();
  const last = [...state.entries].reverse().find(e => e.name.toLowerCase() === name);
  if (last && !$('gramsInput').value) $('gramsInput').value = last.grams;
});

$('prevDay').addEventListener('click', () => { viewDate = addDays(viewDate, -1); render(); });
$('nextDay').addEventListener('click', () => {
  if (!isToday(viewDate)) { viewDate = addDays(viewDate, 1); render(); }
});

// ---- Goal sheet ------------------------------------------------------------

const GOAL_MIN = 10;
const GOAL_MAX = 500;
const GOAL_PRESETS = [100, 120, 150, 180, 200];

const clampGoal = g => Math.min(Math.max(Math.round(g) || 0, GOAL_MIN), GOAL_MAX);

function draftGoal() {
  return parseInt($('goalInput').value, 10) || 0;
}

function setDraftGoal(g) {
  $('goalInput').value = clampGoal(g);
  const wrap = $('goalInput').parentElement;
  wrap.classList.remove('bump');
  void wrap.offsetWidth;
  wrap.classList.add('bump');
  updateGoalSheet();
}

function updateGoalSheet() {
  const g = draftGoal();
  const diff = g - state.goal;
  $('goalDelta').textContent = !g ? ' '
    : diff === 0 ? `current goal · ≈ ${Math.round(g / 3)}g per meal`
    : `was ${state.goal}g · ${diff > 0 ? '+' : '−'}${Math.abs(diff)}g`;
  for (const btn of $('goalPresets').children) {
    btn.classList.toggle('selected', Number(btn.dataset.goal) === g);
  }
}

$('goalPresets').replaceChildren(...GOAL_PRESETS.map(g => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'preset';
  btn.dataset.goal = g;
  btn.innerHTML = `${g}<small>grams</small>`;
  btn.addEventListener('click', () => setDraftGoal(g));
  return btn;
}));

// − / + step by 5; holding the button keeps stepping, faster over time.
for (const btn of document.querySelectorAll('.step-btn')) {
  const step = Number(btn.dataset.step);
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; };
  const repeat = delay => {
    timer = setTimeout(() => { setDraftGoal(draftGoal() + step); repeat(Math.max(delay * 0.8, 50)); }, delay);
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    setDraftGoal(draftGoal() + step);
    repeat(400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  // Keyboard activation (no pointer involved).
  btn.addEventListener('click', e => { if (e.detail === 0) setDraftGoal(draftGoal() + step); });
}

$('goalInput').addEventListener('input', updateGoalSheet);

$('goalBtn').addEventListener('click', () => {
  $('goalInput').value = state.goal;
  updateGoalSheet();
  $('goalDialog').showModal();
});

// Tapping the dimmed backdrop dismisses the sheet.
$('goalDialog').addEventListener('click', e => {
  if (e.target === $('goalDialog')) $('goalDialog').close('cancel');
});

$('goalDialog').addEventListener('close', () => {
  if ($('goalDialog').returnValue !== 'save') return;
  const g = draftGoal();
  if (g > 0) { state.goal = clampGoal(g); saveState(); render(); }
});

// When the app is reopened on a new day, jump back to today.
let lastSeenDay = dayKey(new Date());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = dayKey(new Date());
  if (now !== lastSeenDay) {
    lastSeenDay = now;
    viewDate = startOfDay(new Date());
  }
  render();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Start the tube empty so it fills on launch, and only animate the week bars once.
requestAnimationFrame(() => requestAnimationFrame(render));
setTimeout(() => document.body.classList.remove('intro'), 1500);
