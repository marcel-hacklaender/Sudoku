'use strict';

/* ---------- Generator ---------- */

const LEVELS = {
  easy:   { name: 'Leicht', clues: 40 },
  medium: { name: 'Mittel', clues: 32 },
  hard:   { name: 'Schwer', clues: 26 },
};

const ROW = (i) => Math.floor(i / 9);
const COL = (i) => i % 9;
const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

// Nachbarn (gleiche Zeile, Spalte oder Box) für jedes Feld
const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
  }
  return [...s];
});

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function candidates(grid, i) {
  let used = 0;
  for (const p of PEERS[i]) if (grid[p]) used |= 1 << grid[p];
  const out = [];
  for (let n = 1; n <= 9; n++) if (!(used & (1 << n))) out.push(n);
  return out;
}

// Zählt Lösungen bis `limit` (Feld mit den wenigsten Kandidaten zuerst)
function countSolutions(grid, limit = 2) {
  let best = -1, bestC = null;
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    const c = candidates(grid, i);
    if (c.length === 0) return 0;
    if (!bestC || c.length < bestC.length) { best = i; bestC = c; if (c.length === 1) break; }
  }
  if (best === -1) return 1;
  let count = 0;
  for (const n of bestC) {
    grid[best] = n;
    count += countSolutions(grid, limit - count);
    if (count >= limit) break;
  }
  grid[best] = 0;
  return count;
}

function fillGrid(grid) {
  const i = grid.indexOf(0);
  if (i === -1) return true;
  for (const n of shuffle(candidates(grid, i))) {
    grid[i] = n;
    if (fillGrid(grid)) return true;
  }
  grid[i] = 0;
  return false;
}

function generate(level) {
  const solution = new Array(81).fill(0);
  fillGrid(solution);
  const puzzle = solution.slice();
  const target = LEVELS[level].clues;
  let clues = 81;
  for (const i of shuffle([...Array(81).keys()])) {
    if (clues <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle.slice()) !== 1) puzzle[i] = keep;
    else clues--;
  }
  return { puzzle, solution };
}

/* ---------- Zustand ---------- */

const STORE_KEY = 'sudoku-state-v1';
const HELPS_KEY = 'sudoku-helps';
let S = null;           // aktuelles Spiel
let notesMode = false;
// Hilfen (Markierungen, rote Fehler, Zähler, Tipp). Standard: aus, wie auf Papier.
let helps = false;
try { helps = localStorage.getItem(HELPS_KEY) === 'on'; } catch (e) { /* egal */ }
let timerId = null;

function newGame(level = 'medium') {
  const { puzzle, solution } = generate(level);
  S = {
    level, puzzle, solution,
    values: puzzle.slice(),
    notes: new Array(81).fill(0),   // Bitmaske 1..9
    selected: puzzle.findIndex((v) => v === 0),
    history: [],
    elapsed: 0,
    mistakes: 0,
    won: false,
  };
  save();
  render();
  startTimer();
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* egal */ }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.values) && s.values.length === 81) return s;
  } catch (e) { /* egal */ }
  return null;
}

/* ---------- Aktionen ---------- */

function pushHistory(i) {
  S.history.push({ i, v: S.values[i], n: S.notes[i], peers: PEERS[i].map((p) => S.notes[p]) });
  if (S.history.length > 300) S.history.shift();
}

function enter(n) {
  const i = S.selected;
  if (S.won || i < 0 || S.puzzle[i]) return;

  if (notesMode) {
    if (S.values[i]) return;
    pushHistory(i);
    S.notes[i] ^= 1 << n;
  } else {
    if (S.values[i] === n) return;
    pushHistory(i);
    S.values[i] = n;
    S.notes[i] = 0;
    if (!helps) {
      // wie auf Papier: keine Rückmeldung
    } else if (n !== S.solution[i]) {
      S.mistakes++;
    } else {
      // passende Notizen bei den Nachbarn entfernen
      for (const p of PEERS[i]) S.notes[p] &= ~(1 << n);
      flashCompleted(i);
    }
  }
  save();
  render();
  checkWin();
}

function erase() {
  const i = S.selected;
  if (S.won || i < 0 || S.puzzle[i]) return;
  if (!S.values[i] && !S.notes[i]) return;
  pushHistory(i);
  S.values[i] = 0;
  S.notes[i] = 0;
  save();
  render();
}

function undo() {
  const h = S.history.pop();
  if (!h || S.won) return;
  S.values[h.i] = h.v;
  S.notes[h.i] = h.n;
  PEERS[h.i].forEach((p, k) => { S.notes[p] = h.peers[k]; });
  S.selected = h.i;
  save();
  render();
}

function hint() {
  if (S.won) return;
  let i = S.selected;
  if (i < 0 || S.puzzle[i] || S.values[i] === S.solution[i]) {
    const open = [];
    for (let k = 0; k < 81; k++) if (S.values[k] !== S.solution[k]) open.push(k);
    if (!open.length) return;
    i = open[Math.floor(Math.random() * open.length)];
  }
  S.selected = i;
  const was = notesMode;
  notesMode = false;
  enter(S.solution[i]);
  notesMode = was;
}

function select(i) {
  S.selected = i;
  render();
}

function moveSel(dr, dc) {
  const i = S.selected < 0 ? 0 : S.selected;
  const r = (ROW(i) + dr + 9) % 9, c = (COL(i) + dc + 9) % 9;
  select(r * 9 + c);
}

function checkWin() {
  if (S.values.every((v) => v) && S.values.some((v, i) => v !== S.solution[i])) {
    if (!helps) toast('Alle Felder sind voll, aber irgendwo stimmt noch etwas nicht.');
    return;
  }
  if (S.values.every((v, i) => v === S.solution[i])) {
    S.won = true;
    stopTimer();
    save();
    render();
    const m = S.mistakes;
    document.getElementById('win-text').textContent =
      `${LEVELS[S.level].name} in ${fmtTime(S.elapsed)}` +
      (!helps ? '.' : m === 0 ? ' und ohne Fehler.' : ` mit ${m} ${m === 1 ? 'Fehler' : 'Fehlern'}.`);
    setTimeout(() => winDialog.showModal(), 500);
  }
}

// Zeile/Spalte/Box kurz aufleuchten lassen, wenn komplett
function flashCompleted(i) {
  if (!helps) return;
  const groups = [
    [...Array(81).keys()].filter((k) => ROW(k) === ROW(i)),
    [...Array(81).keys()].filter((k) => COL(k) === COL(i)),
    [...Array(81).keys()].filter((k) => BOX(k) === BOX(i)),
  ];
  const cells = new Set();
  for (const g of groups) {
    if (g.every((k) => S.values[k] === S.solution[k])) g.forEach((k) => cells.add(k));
  }
  if (!cells.size) return;
  requestAnimationFrame(() => {
    cells.forEach((k) => {
      const el = cellEls[k];
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    });
  });
}

/* ---------- Timer ---------- */

function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = h ? String(m).padStart(2, '0') : m;
  return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

function startTimer() {
  stopTimer();
  if (S.won) return;
  timerId = setInterval(() => {
    if (document.hidden) return;
    S.elapsed++;
    timerEl.textContent = fmtTime(S.elapsed);
    if (S.elapsed % 5 === 0) save();
  }, 1000);
}
function stopTimer() { clearInterval(timerId); timerId = null; }

/* ---------- Darstellung ---------- */

const boardEl = document.getElementById('board');
const padEl = document.getElementById('pad');
const timerEl = document.getElementById('timer');
const mistakesEl = document.getElementById('mistakes');
const levelEl = document.getElementById('level-label');
const notesBtn = document.getElementById('notes-btn');
const notesState = document.getElementById('notes-state');
const newDialog = document.getElementById('new-dialog');
const winDialog = document.getElementById('win-dialog');
const helpsBtn = document.getElementById('helps-btn');
const helpsState = document.getElementById('helps-state');
const hintBtn = document.getElementById('hint-btn');
const toastEl = document.getElementById('toast');

let toastId = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastId);
  toastId = setTimeout(() => toastEl.classList.remove('show'), 3500);
}

const cellEls = [];
for (let i = 0; i < 81; i++) {
  const el = document.createElement('div');
  el.className = 'cell';
  el.setAttribute('role', 'gridcell');
  if (COL(i) === 2 || COL(i) === 5) el.classList.add('br');
  if (ROW(i) === 2 || ROW(i) === 5) el.classList.add('bb');
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); select(i); });
  boardEl.appendChild(el);
  cellEls.push(el);
}

const padBtns = [];
for (let n = 1; n <= 9; n++) {
  const b = document.createElement('button');
  b.innerHTML = `${n}<small></small>`;
  b.addEventListener('click', () => enter(n));
  padEl.appendChild(b);
  padBtns.push(b);
}

function render() {
  const sel = S.selected;
  const selVal = sel >= 0 ? S.values[sel] : 0;
  const peers = helps && sel >= 0 ? new Set(PEERS[sel]) : new Set();

  for (let i = 0; i < 81; i++) {
    const el = cellEls[i];
    const v = S.values[i];
    el.classList.toggle('given', !!S.puzzle[i]);
    el.classList.toggle('selected', i === sel);
    el.classList.toggle('peer', peers.has(i));
    el.classList.toggle('same', helps && !!selVal && v === selVal && i !== sel);
    el.classList.toggle('wrong', helps && !!v && !S.puzzle[i] && v !== S.solution[i]);

    if (v) {
      if (el.textContent !== String(v) || el.firstChild?.nodeType !== 3) el.textContent = v;
    } else if (S.notes[i]) {
      let html = '<div class="notes">';
      for (let n = 1; n <= 9; n++) {
        const on = S.notes[i] & (1 << n);
        html += `<span${on && helps && n === selVal ? ' class="hl"' : ''}>${on ? n : ''}</span>`;
      }
      el.innerHTML = html + '</div>';
    } else {
      el.textContent = '';
    }
  }

  // wie viele von jeder Zahl noch fehlen
  const counts = new Array(10).fill(0);
  S.values.forEach((v, i) => { if (v && v === S.solution[i]) counts[v]++; });
  padBtns.forEach((b, k) => {
    const left = 9 - counts[k + 1];
    b.classList.toggle('done', helps && left === 0);
    b.querySelector('small').textContent = helps && left ? left : '';
  });

  timerEl.textContent = fmtTime(S.elapsed);
  mistakesEl.textContent = `${S.mistakes} Fehler`;
  levelEl.textContent = LEVELS[S.level].name;
  document.body.classList.toggle('no-helps', !helps);
  helpsBtn.setAttribute('aria-pressed', String(helps));
  helpsState.textContent = helps ? 'an' : 'aus';
  notesBtn.setAttribute('aria-pressed', String(notesMode));
  notesState.textContent = notesMode ? 'an' : 'aus';
}

/* ---------- Eingaben ---------- */

document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('erase-btn').addEventListener('click', erase);
hintBtn.addEventListener('click', hint);
helpsBtn.addEventListener('click', () => {
  helps = !helps;
  try { localStorage.setItem(HELPS_KEY, helps ? 'on' : 'off'); } catch (e) { /* egal */ }
  render();
  toast(helps ? 'Hilfen an: Markierungen, rote Fehler und Tipps.' : 'Hilfen aus: wie auf Papier, geprüft wird am Ende.');
});
notesBtn.addEventListener('click', () => { notesMode = !notesMode; render(); });
document.getElementById('new-btn').addEventListener('click', () => newDialog.showModal());

newDialog.addEventListener('close', () => {
  const v = newDialog.returnValue;
  if (LEVELS[v]) {
    boardEl.style.opacity = '0.4';
    // kurz rendern lassen, dann generieren
    setTimeout(() => { newGame(v); boardEl.style.opacity = ''; }, 30);
  }
});
winDialog.addEventListener('close', () => {
  if (winDialog.returnValue === 'again') newDialog.showModal();
});

document.addEventListener('keydown', (e) => {
  if (newDialog.open || winDialog.open) return;
  if (e.key >= '1' && e.key <= '9') enter(Number(e.key));
  else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
  else if (e.key === 'ArrowUp') moveSel(-1, 0);
  else if (e.key === 'ArrowDown') moveSel(1, 0);
  else if (e.key === 'ArrowLeft') moveSel(0, -1);
  else if (e.key === 'ArrowRight') moveSel(0, 1);
  else if (e.key.toLowerCase() === 'n') { notesMode = !notesMode; render(); }
  else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) undo();
  else return;
  e.preventDefault();
});

document.addEventListener('visibilitychange', () => { if (document.hidden && S) save(); });

// iOS: Doppeltipp-Zoom und Pinch verhindern
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

/* ---------- Start ---------- */

S = load();
if (S) { render(); startTimer(); } else newGame('medium');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
