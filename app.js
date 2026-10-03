'use strict';

const STORAGE_KEY = 'protein-tracker-v1';
const BAR_BLOCKS = 20;

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
  state.entries.push({ id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()), name, grams, ts });
  saveState();
  render();
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

  $('dayLabel').textContent = dayLabel(viewDate);
  $('nextDay').disabled = isToday(viewDate);
  $('goalGrams').textContent = goal;
  $('totalGrams').textContent = fmt(total);
  $('goalStat').textContent = goal;
  $('leftStat').textContent = fmt(left);
  $('remaining').textContent = hit ? 'goal reached' : `${fmt(left)}g to go`;
  $('statusDot').classList.toggle('hit', hit);

  const filled = Math.min(Math.round((total / goal) * BAR_BLOCKS), BAR_BLOCKS);
  const bar = $('blockBar');
  bar.classList.toggle('hit', hit);
  bar.replaceChildren(...Array.from({ length: BAR_BLOCKS }, (_, i) => {
    const b = document.createElement('i');
    if (i < filled) b.className = 'on';
    return b;
  }));

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
      <span class="bar${t >= state.goal ? ' hit' : t > 0 ? ' some' : ''}" style="height:${(t / max) * 100}%"></span>
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

$('goalBtn').addEventListener('click', () => {
  $('goalInput').value = state.goal;
  $('goalDialog').showModal();
});

$('goalDialog').addEventListener('close', () => {
  if ($('goalDialog').returnValue !== 'save') return;
  const g = parseInt($('goalInput').value, 10);
  if (g > 0) { state.goal = g; saveState(); render(); }
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

render();
