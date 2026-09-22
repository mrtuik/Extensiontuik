import { icon } from './lib/icons.js';
import { evaluate, planFix, planLisCalc, planLisFill, lisFillTargets, plateletBump, ORDER, parseNum, indian } from './lib/engine.js';
import { MP_NEGATIVE, PBS_NORMAL, toSingleLine } from './lib/templates.js';
import { PARAM_META } from './lib/values.js';
import { QUOTES } from './lib/quotes.js';
import { DEMO, demoHistory } from './lib/demo.js';
import { PROFILES, SESSION_HOURS, sha256Hex } from './lib/auth.js';
import { avatar } from './lib/avatars.js';
import { UPI_ID, QR_SRC, upiLink } from './lib/pay.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const navRoot = $('#navRoot');
const dlg = $('#dlg');
const HISTORY_DAYS = 30;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => String(+Number(n).toFixed(2));

// ───────── state ─────────
let tabId = null;
let state = null; // latest snapshot from the content script
let ev = null; // evaluate(state)
let view = 'main'; // main | history | about
let quoteIdx = 0;
let animate = false; // false | 'view' — play the enter animation on the next render
let menuOpen = false;
let undo = null; // { reg, before, after }
let session = { actions: new Set() };
const openHist = new Set(); // expanded history entries
const openMp = new Set(); // expanded MP / PBS applied text
let tpl = {}; // saved MP / PBS template overrides { mp, pbs }
let history = [];
let histQuery = '';
let histTimer = null;
let demoMode = false;
let auth = null; // { name, until } while unlocked
let loginPick = null; // profile chosen on the login screen
let loginErr = '';
let demoValues = {};
let demoExtras = [];
let demoConfirm = {}; // Demo mode: Confirm ticks per row key
let demoHist = [];
let ptDate = 'today'; // PT search: 'today' | 'YYMMDD' (one of the last 7 days)
let ptSerial = ''; // PT search: digits typed after "PT"
let searching = null; // { value } while a PT search is waiting for HMIS to answer
let searchMsg = ''; // last PT search problem (shown with a Retry button)
let searchTimer = null;
let lastDayCode = '';
let setup = { autoConfirm: false, autoAtyp: false, autoMp: false, autoPlt: false }; // Setup box options (saved on this device)
let lastAutoKey = ''; // patient load that auto-confirm / auto-atypical last ran for
let lisCalc = { reg: null, vals: {} }; // boxes the LIS button calculated for this patient (shown with a "calc" tag until edited)
let lisFill = { reg: null, vals: {} }; // boxes the LIS button auto-filled with random normal values (re-rolled on the next click, "auto" tag until edited)
let submitting = false;
let focusAfterSubmit = null; // reg of the patient just submitted → focus the PT box once HMIS moves on
let inspectRows = null; // Row inspector (v2.0.1): last {id,label,tag,value}[] scan of the HMIS page, or null if not scanned yet
let inspectLoading = false;
let inspectMsg = ''; // error / demo-mode note for the inspector page
let inspectDemo = false; // true when inspectRows is the Demo-mode sample, not a real scan
let lastInspectKey = ''; // page load the inspector last auto-scanned for (like lastAutoKey, but for the Row inspector)

// Row inspector: sample rows shown in Demo mode (no real HMIS DOM to scan there) — same field names as DEMO.values, in plausible HMIS id shapes.
const DEMO_INSPECT_ROWS = [
  { id: 'ctl00_CPH1_lblName', label: 'Aryan Khan', tag: 'span', value: '' },
  { id: 'ctl00_CPH1_lblGender', label: 'Male', tag: 'span', value: '' },
  { id: 'ctl00_CPH1_lblAge', label: '9 Year 0 Month 0 Days', tag: 'span', value: '' },
  { id: 'ctl00_CPH1_txtPatientID', label: 'Reg. No.', tag: 'input', value: 'RG2600000000' },
  { id: 'ctl00_CPH1_txtRGORRequisitionNo', label: 'Search a patient', tag: 'input', value: '' },
  { id: 'ctl00_CPH1_GD_TestName_lblTestName_0', label: 'Hb', tag: 'span', value: '' },
  { id: 'ctl00_CPH1_GD_TestName_txtResult_0', label: 'Hb', tag: 'input', value: '4.0' },
  { id: 'ctl00_CPH1_GD_TestName_cbIsConfirm_0', label: 'Hb', tag: 'input', value: '' },
  { id: 'ctl00_CPH1_GD_TestName_txtResult_3', label: 'Platelet', tag: 'input', value: '70' },
  { id: 'ctl00_CPH1_btnSubmit', label: 'Submit', tag: 'button', value: '' },
];

// ───────── storage: history ─────────
async function loadHistory() {
  const { history: h = [] } = await chrome.storage.local.get('history');
  const cutoff = Date.now() - HISTORY_DAYS * 864e5;
  history = h.filter((e) => e.ts >= cutoff);
}
const saveHistory = () => chrome.storage.local.set({ history });

// ───────── storage: MP / PBS templates (edited text is kept on this device as the new default) ─────────
const TPL_DEFAULT = { mp: MP_NEGATIVE, pbs: PBS_NORMAL };
const TPL_LABEL = { mp: 'MP', pbs: 'PBS' };
const tplText = (k) => (tpl[k] && tpl[k].trim() ? tpl[k] : TPL_DEFAULT[k]);
async function loadTemplates() { ({ templates: tpl = {} } = await chrome.storage.local.get('templates')); }
const saveTemplates = () => chrome.storage.local.set({ templates: tpl });

// ───────── storage: Setup options ─────────
async function loadSetup() { const { setup: s } = await chrome.storage.local.get('setup'); setup = { autoConfirm: false, autoAtyp: false, autoMp: false, autoPlt: false, ...(s || {}) }; }
const saveSetup = () => chrome.storage.local.set({ setup });

function ageChip(age) {
  if (!age) return '';
  const parts = [];
  if (age.y) parts.push(`${age.y} Y`);
  if (age.m) parts.push(`${age.m} M`);
  if (age.d) parts.push(`${age.d} D`);
  return parts.join(', ') || '0 D';
}

function upsertHistory(s, e, actions) {
  if (!s || s.demo || !e || (e.entered === 0 && actions.size === 0)) return;
  const p = s.patient;
  const day = new Date().toISOString().slice(0, 10);
  const id = `${p.reg || p.name}|${day}`;
  const entry = {
    id, ts: Date.now(), reg: shortReg(p.reg), name: p.name, sex: e.sex, age: ageChip(e.age),
    abnormal: e.findings.map((f) => `${f.label} ${f.dir === 'low' ? '↓' : '↑'}`),
    actions: [...actions],
    flags: { ...e.flags },
    values: Object.fromEntries([...ORDER, 'mp', 'pbs'].filter((k) => String(s.values?.[k] ?? '').trim() !== '').map((k) => [k, String(s.values[k]).trim().slice(0, 300)])),
  };
  const i = history.findIndex((h) => h.id === id);
  if (i >= 0) entry.actions = [...new Set([...history[i].actions, ...entry.actions])];
  if (i >= 0) history.splice(i, 1);
  history.unshift(entry);
}
function scheduleHistory() {
  if (!auth) return;
  clearTimeout(histTimer);
  histTimer = setTimeout(() => {
    upsertHistory(state, ev, session.actions);
    saveHistory();
  }, 800);
}

function shortReg(reg) {
  const m = /RG\d+/i.exec(reg || '');
  return m ? m[0].toUpperCase() : (reg || '').split('/').pop().toUpperCase();
}

// ───────── talking to the page ─────────
let demoPt = { search: '', found: true }; // Demo mode: pretend HMIS search result
const demoRowKeys = () => [...Object.keys(demoValues), ...demoExtras.map((x) => x.key)];
const demoState = () => ({
  demo: true,
  patient: demoPt.found ? { ...DEMO.patient } : { name: '', reg: '', gender: '', age: '' },
  values: { ...demoValues },
  extras: demoExtras.map((x) => ({ ...x })),
  confirm: Object.fromEntries(demoRowKeys().map((k) => [k, { on: !!demoConfirm[k], locked: false }])),
  search: demoPt.search,
});

async function send(msg) {
  if (demoMode) {
    // Demo: read/write the local sample instead of the page.
    if (msg.type === 'write') {
      const written = [];
      for (const u of msg.updates || []) {
        const ex = demoExtras.find((x) => x.key === u.key);
        if (u.key in demoValues) { demoValues[u.key] = String(u.value ?? ''); written.push(u.key); }
        else if (ex) { ex.value = String(u.value ?? ''); written.push(u.key); }
      }
      setState(demoState());
      return { written, pending: [], skipped: [] };
    }
    if (msg.type === 'confirm') {
      const on = msg.on !== false;
      let ticked = 0;
      for (const k of demoRowKeys()) if (!(msg.skip || []).includes(k) && !!demoConfirm[k] !== on) { demoConfirm[k] = on; ticked++; }
      if (ticked) setState(demoState());
      return { ok: true, total: demoRowKeys().length, ticked, on };
    }
    if (msg.type === 'setConfirm') {
      if (!demoRowKeys().includes(msg.key)) return { ok: false, error: 'no-box' };
      demoConfirm[msg.key] = !!msg.on;
      setState(demoState());
      return { ok: true, on: !!msg.on };
    }
    if (msg.type === 'inspect') return { ok: false, demo: true }; // no real page DOM to scan in Demo mode
    return { state: demoState() };
  }
  if (tabId == null) return null;
  try { return await chrome.tabs.sendMessage(tabId, msg); } catch { return null; }
}

async function pull() {
  if (demoMode) return setState(demoState());
  let [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!t) [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  tabId = t?.id ?? null;
  const r = await send({ type: 'getState' });
  setState(r?.state || null);
}

function setState(next) {
  const prevReg = state?.patient?.reg ?? null;
  const nextReg = next?.patient?.reg ?? null;
  if (state && prevReg !== nextReg) {
    if (auth) { upsertHistory(state, ev, session.actions); saveHistory(); } // save the previous patient
    resetSession();
  } else if (!state) resetSession();
  resolveSearch(next);
  syncPtFromPage(next);
  state = next;
  ev = next ? evaluate(next) : null;
  if (undo && (!state || state.patient.reg !== undo.reg || Object.keys(undo.after).some((k) => (state.values[k] ?? '') !== undo.after[k]))) undo = null;
  render();
  if (focusAfterSubmit !== null && next && next.patient.reg !== focusAfterSubmit) { focusAfterSubmit = null; focusPt(); }
  trackAuto(next);
  autoInspect(next);
  if (state) scheduleHistory();
}
function resetSession() { undo = null; session = { actions: new Set() }; openMp.clear(); lisCalc = { reg: null, vals: {} }; lisFill = { reg: null, vals: {} }; }

async function doWrite(updates, action, okMsg) {
  const r = await send({ type: 'write', updates });
  if (!r) { toast('Could not reach the HMIS page — reload it.'); return null; }
  if (r.pending?.length) toast('Field is being edited — will apply when you leave it.');
  else if (r.written?.length) { session.actions.add(action); scheduleHistory(); toast(okMsg); }
  else toast('Nothing to change.');
  return r;
}

async function toggleDemo() {
  demoMode = !demoMode;
  if (demoMode) { demoValues = { ...DEMO.values }; demoExtras = DEMO.extras.map((x) => ({ ...x })); demoConfirm = { ...DEMO.confirm }; demoHist = demoHistory(); demoPt = { search: '', found: true }; lastSynced = ''; searchMsg = ''; searching = null; }
  chrome.storage.local.set({ demoMode });
  menuOpen = false;
  view = 'main';
  await pull();
  toast(demoMode ? 'Demo mode on — sample data only' : 'Demo mode off');
}

// ───────── PT number search ─────────
// Full number = YYMMDD + "PT" + serial, e.g. 261020PT12. The date comes from the custom dropdown, the serial is typed by hand.
const PT_DAYS = 7;
const PT_RE = /^(\d{6})PT(\d+)$/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');
const dayCode = (d) => `${pad2(d.getFullYear() % 100)}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const codeLabel = (c) => `${+c.slice(4, 6)} ${MONTHS[+c.slice(2, 4) - 1] || ''}`;
let ptExtra = ''; // loaded date older than the 7-day window (so the menu can still show it)
let lastSynced = '';
let lastSearched = ''; // last number sent to HMIS (blur must not repeat it)
let rendering = false;

function ptDates() {
  const t = new Date(), out = [];
  for (let i = 0; i <= PT_DAYS; i++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - i);
    out.push({ code: dayCode(d), label: `${d.getDate()} ${MONTHS[d.getMonth()]}` });
  }
  if (ptExtra && !out.some((x) => x.code === ptExtra)) out.push({ code: ptExtra, label: codeLabel(ptExtra) });
  return out;
}
// 'today' always follows the calendar; an older pick is kept only while it is still in the list.
const ptSel = () => { const l = ptDates(); return l.find((x) => x.code === ptDate) || l[0]; };
const ptPrefix = () => ptSel().code;
const ptFull = () => `${ptPrefix()}PT${ptSerial}`;

// The PT number HMIS currently has loaded (a finished search, or one made by hand on the page).
function loadedPt() {
  const m = state ? PT_RE.exec(state.search || '') : null;
  if (!m || !(state.patient.name || state.patient.reg)) return null;
  return { date: m[1], serial: m[2] };
}

function ptMsgInner() {
  if (searching) return `<span class="busy"><i class="spin"></i>Searching ${esc(searching.value)}…</span>`;
  if (searchMsg) return `<span class="err">${icon('triangle-alert', 13)}<span>${esc(searchMsg)}</span></span><button class="pretry" data-act="ptgo">Retry</button>`;
  return (ptSerial ? `<span class="prev">${icon('border-right', 15)}${esc(ptFull())}</span>` : `<span class="hint">Type serial — searches when you tap outside</span>`);
}
function refreshPtBar() { // update in place — never re-render while the technician is typing
  const m = $('#ptMsg'); if (m) m.innerHTML = ptMsgInner();
  const b = $('#ptGo'); if (b) b.disabled = !ptSerial || !!searching;
}
// Up = newer day, down = older day (index 0 of ptDates() is today).
function syncPtDate() {
  const l = ptDates(), cur = ptSel(), i = l.findIndex((x) => x.code === cur.code);
  const lbl = $('#ptDateLbl'); if (lbl) lbl.textContent = cur.label;
  const up = $('#ptUp'); if (up) up.disabled = i <= 0;
  const dn = $('#ptDown'); if (dn) dn.disabled = i >= l.length - 1;
}
function stepDate(dir) { // dir: +1 = newer (up), -1 = older (down)
  const l = ptDates(), i = l.findIndex((x) => x.code === ptSel().code), n = i - dir;
  if (n < 0 || n >= l.length) return;
  ptDate = n === 0 ? 'today' : l[n].code;
  if (l[n].code !== ptExtra) ptExtra = '';
  chrome.storage.local.set({ ptDate });
  searchMsg = '';
  syncPtDate(); refreshPtBar();
  $('#ptSerial')?.focus();
}

function searchHtml(solo = false) {
  const cls = `psearch${solo ? ' solo' : ''}`;
  const l = ptDates(), cur = ptSel(), ci = l.findIndex((x) => x.code === cur.code);
  return `<div class="${cls}">
    <div class="psrow">
      <div class="ptdd ptsel" role="group" aria-label="Date">
        <span id="ptDateLbl" class="ptdv">${esc(cur.label)}</span>
        <span class="ptstep">
          <button id="ptUp" data-act="ptup" aria-label="Next day" ${ci <= 0 ? 'disabled' : ''}>${icon('up-small-fill', 22)}</button>
          <button id="ptDown" data-act="ptdown" aria-label="Previous day" ${ci >= l.length - 1 ? 'disabled' : ''}>${icon('down-small-fill', 22)}</button>
        </span>
      </div>
      <span class="ptlbl">PT</span>
      <input id="ptSerial" class="ptin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="12" value="${esc(ptSerial)}" aria-label="PT serial number" enterkeyhint="search" />
      <button id="ptGo" class="ptgo" data-act="ptgo" aria-label="Search patient" ${!ptSerial || searching ? 'disabled' : ''}>${icon('tab-search-rounded', 22)}</button>
    </div>
    <div id="ptMsg" class="psmsg">${ptMsgInner()}</div>
  </div>`;
}
const idleCardHtml = () => `<div class="patient idle"><div class="pmain"></div>${searchHtml()}</div>`;

async function doSearch() {
  if (searching) return;
  if (!ptSerial) { toast('Type the serial number first.'); $('#ptSerial')?.focus(); return; }
  const value = ptFull();
  searchMsg = '';
  searching = { value };
  lastSearched = value;
  refreshPtBar();
  if (demoMode) { // simulated HMIS: any serial finds the sample patient, serial 0 = "not found" (to check that screen)
    setTimeout(() => {
      if (!demoMode || !searching || searching.value !== value) return;
      demoPt = { search: value, found: Number(ptSerial) !== 0 };
      setState({ ...demoState(), searchedFor: value });
    }, 700);
    return;
  }
  const r = await send({ type: 'search', value });
  if (!r || !r.ok) {
    searching = null;
    searchMsg = r?.error === 'no-field' ? 'HMIS search box not found on this page.'
      : state ? 'Could not reach the HMIS page — reload it.' : 'Open the HMIS result-entry page first.';
    refreshPtBar();
    return;
  }
  // HMIS now reloads; setState() resolves the search when the new page reports in.
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (!searching) return;
    searching = null; searchMsg = 'HMIS is slow to respond.';
    refreshPtBar();
  }, 15000);
}

// Called for every incoming page snapshot: did it come from our search?
function resolveSearch(next) {
  if (!searching || !next || !next.searchedFor) return;
  if (next.searchedFor.toUpperCase() !== searching.value.toUpperCase()) return;
  const found = !!(next.patient.name || next.patient.reg);
  if (found) lastAutoKey = ''; // a fresh search always counts as a new load for Setup → auto options
  const v = searching.value;
  searching = null; clearTimeout(searchTimer);
  searchMsg = found ? '' : `Patient not found · ${v}`;
}

// The page already has a PT number in its search box (earlier search / typed by hand): show it, unless the technician is editing.
function syncPtFromPage(next) {
  const s = next ? String(next.search || '').toUpperCase() : '';
  if (s === lastSynced) return;
  lastSynced = s;
  const m = PT_RE.exec(s);
  if (!m || searching || document.activeElement?.id === 'ptSerial') return;
  ptSerial = m[2];
  ptDate = m[1] === dayCode(new Date()) ? 'today' : m[1];
  ptExtra = ptDates().slice(0, PT_DAYS + 1).some((d) => d.code === m[1]) ? '' : m[1];
}

// ───────── actions ─────────
// Show a write right away (values, flags, undo) instead of waiting for the page to push its new state back.
function applyLocal(vals) {
  if (!state) return;
  state = { ...state, values: { ...state.values, ...vals } };
  ev = evaluate(state);
}

async function onFix() {
  const plan = planFix(state);
  if (plan.error) return toast(plan.error);
  if (!plan.updates.length) return toast('DC already fixed.');
  if (plan.rawTotal < 98 || plan.rawTotal > 102) {
    const r = await openDialog({
      title: 'Check DC entries',
      warn: `DC raw total is ${fmtNum(plan.rawTotal)} — check entries before fixing.`,
      body: 'A large correction can hide a data-entry mistake. Fix anyway?',
      ok: 'Fix anyway',
    });
    if (!r.ok) return;
  }
  const res = await doWrite(plan.updates, 'Fix', 'DC fixed — total 100');
  if (res && !res.pending?.length) {
    undo = { reg: state.patient.reg, before: plan.before, after: plan.after };
    applyLocal(Object.fromEntries((res.written || []).map((k) => [k, plan.after[k] ?? plan.updates.find((u) => u.key === k)?.value])));
    render();
  }
}

async function onUndo() {
  if (!undo) return;
  const updates = Object.keys(undo.before).map((k) => ({ key: k, value: undo.before[k] }));
  const before = undo.before;
  undo = null;
  const res = await doWrite(updates, 'Fix', 'DC restored');
  if (res?.written?.length) applyLocal(Object.fromEntries(res.written.map((k) => [k, before[k]])));
  render();
}

async function onPltBump() {
  const cur = parseNum(state.values.plt);
  if (cur === null) return toast('Enter Platelet first.');
  const p = plateletBump(state.values.plt);
  if (!p) return toast(cur < 80 ? 'Platelet is below 80 — too abnormal to auto-adjust.' : 'Platelet is 140 or above — nothing to bump.');
  await doWrite([{ key: 'plt', value: String(p.value) }], 'LIS', `Platelet +${p.add} → ${p.value}`);
}

async function bumpPlatelet(next) {
  if (!('plt' in next.values)) return;
  const p = plateletBump(next.values.plt);
  if (!p) return;
  const r = await send({ type: 'write', updates: [{ key: 'plt', value: String(p.value) }] });
  if (r?.written?.length) { session.actions.add('LIS'); scheduleHistory(); toast(`Platelet +${p.add} → ${p.value}`); }
}

async function applyMp() {
  if ((state.values.mp || '').trim()) {
    const r = await openDialog({ title: 'Replace MP text?', body: 'The MP field already has text and will be overwritten.', ok: 'Replace' });
    if (!r.ok) return;
  }
  await doWrite([{ key: 'mp', value: toSingleLine(tplText('mp')) }], 'MP', 'MP text applied');
}

async function applyPbs() {
  const has = (state.values.pbs || '').trim() !== '';
  const abnormal = ev.findings.length > 0;
  let text = toSingleLine(tplText('pbs'));
  if (abnormal || has) {
    const r = await openDialog({
      title: has ? 'Replace PBS text?' : 'Apply PBS template?',
      warn: abnormal ? 'Abnormal findings exist — the template says “Adequate in Smear”. Apply anyway?' : null,
      body: has ? 'The PBS field already has text and will be overwritten. Edit the preview if needed.' : 'Edit the preview if needed.',
      textarea: text,
      ok: 'Apply',
    });
    if (!r.ok) return;
    text = toSingleLine(r.text || '');
    if (!text) return;
  }
  await doWrite([{ key: 'pbs', value: text }], 'PBS', 'PBS text applied');
}

async function removeText(key) {
  const label = TPL_LABEL[key];
  const cur = (state.values[key] || '').trim();
  if (!cur) return;
  if (cur !== toSingleLine(tplText(key))) { // typed by hand / edited: don't wipe it silently
    const r = await openDialog({ title: `Remove ${label} text?`, body: `This text was not pasted from the ${label} template. It will be cleared from the field.`, ok: 'Remove' });
    if (!r.ok) return;
  }
  const r = await send({ type: 'write', updates: [{ key, value: '' }] });
  if (!r) return toast('Could not reach the HMIS page — reload it.');
  if (r.pending?.length) return toast('Field is being edited — will clear when you leave it.');
  session.actions.delete(label);
  if (!demoMode) {
    const p = state.patient, id = `${p.reg || p.name}|${new Date().toISOString().slice(0, 10)}`;
    const h = history.find((x) => x.id === id);
    if (h) h.actions = h.actions.filter((a) => a !== label);
  }
  openMp.delete(key);
  scheduleHistory();
  toast(`${label} text removed`);
}

async function editTemplate(key) {
  const label = TPL_LABEL[key];
  const custom = !!(tpl[key] && tpl[key].trim());
  const r = await openDialog({
    title: `${label} template`,
    body: 'This is the text pasted when you tap Apply. Saving keeps it as your default on this device.',
    textarea: tplText(key),
    ok: 'Save',
    extra: custom ? 'Reset to default' : null,
  });
  if (r.extra) { delete tpl[key]; await saveTemplates(); toast(`${label} template reset`); render(); return; }
  if (!r.ok) return;
  const t = (r.text || '').trim();
  if (!t || t === TPL_DEFAULT[key].trim()) delete tpl[key]; else tpl[key] = t;
  await saveTemplates();
  toast(`${label} template saved`);
  render();
}

// ───────── UI helpers ─────────
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function openDialog({ title, body, warn, textarea, ok = 'Confirm', cancel = 'Cancel', extra = null }) {
  return new Promise((resolve) => {
    dlg.innerHTML = `
      <div class="dlg-title">${esc(title)}</div>
      ${warn ? `<div class="dlg-warn">${icon('triangle-alert', 16)}<span>${esc(warn)}</span></div>` : ''}
      ${body ? `<div class="dlg-body">${esc(body)}</div>` : ''}
      ${textarea != null ? `<textarea id="dlgText" spellcheck="false">${esc(textarea)}</textarea>` : ''}
      <div class="dlg-actions">
        ${extra ? `<button class="btn ghost x-left" data-x="extra">${esc(extra)}</button>` : ''}
        <button class="btn ghost" data-x="cancel">${esc(cancel)}</button>
        <button class="btn" data-x="ok">${esc(ok)}</button>
      </div>`;
    let settled = false;
    const done = (okFlag, extraFlag = false) => {
      if (settled) return;
      settled = true;
      const text = $('#dlgText')?.value ?? null;
      dlg.close();
      resolve({ ok: okFlag, text, extra: extraFlag });
    };
    dlg.querySelector('[data-x="extra"]')?.addEventListener('click', () => done(false, true));
    dlg.querySelector('[data-x="ok"]').onclick = () => done(true);
    dlg.querySelector('[data-x="cancel"]').onclick = () => done(false);
    dlg.onclose = () => done(false);
    dlg.showModal();
  });
}

// ───────── views ─────────
// ───────── access lock (profile picker + password) ─────────
const getProfile = (name) => PROFILES.find((p) => p.name === name);
// profile icon if it has one, else the first letter
// illustrated avatar if the profile has one, else the first letter
const avatarInner = (name, size = 28) => { const p = getProfile(name); return p?.avatar ? avatar(p.avatar, size) : esc(name[0].toUpperCase()); };

function accessLeft() {
  const ms = Math.max(0, (auth?.until || 0) - Date.now());
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function loginView() {
  const brand = `<div class="lbrand"><img src="icons/128.png" alt="" /><span>Pathhelp with tuik</span></div>`;
  const note = `<p class="lnote">Access stays open for ${SESSION_HOURS} hours</p>`;
  if (!loginPick) {
    return `<div class="login">${brand}
      <h1>Who's using Pathhelp?</h1>
      <div class="profiles">${PROFILES.map((p) => `<button class="ptile" data-act="pick" data-name="${esc(p.name)}">${avatarInner(p.name, 76)}<span>${esc(p.name)}</span></button>`).join('')}</div>
      ${note}
    </div>`;
  }
  return `<div class="login">${brand}
    <div class="pw-box">
      <div class="pw-group ${loginErr ? 'err' : ''}">
        <div class="pw-user">${avatarInner(loginPick, 44)}<span class="pw-name">${esc(loginPick)}</span></div>
        <label class="pw-row"><span class="pw-key">${icon('key', 20)}</span><input id="pw" class="pw-input" type="password" placeholder="Password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" /></label>
      </div>
      <div class="pw-err">${esc(loginErr)}</div>
      <div class="pw-actions"><button class="lbtn ghost" data-act="loginback">Back</button><button class="lbtn" data-act="unlock">Unlock</button></div>
    </div>
    ${note}
  </div>`;
}

// Login is drawn only when its own state changes, so incoming page updates never wipe the password box.
function showLogin(force = false) {
  navRoot.hidden = true;
  if (!force && app.querySelector('.login')) return;
  app.innerHTML = loginView();
  $('#pw')?.focus();
}

async function unlock() {
  const val = ($('#pw')?.value || '').trim();
  const prof = getProfile(loginPick);
  if (!val || !prof) return;
  if ((await sha256Hex(val)) !== prof.hash) { loginErr = 'Wrong password. Try again.'; showLogin(true); return; }
  auth = { name: prof.name, until: Date.now() + SESSION_HOURS * 36e5 };
  await chrome.storage.local.set({ session: auth });
  loginPick = null; loginErr = ''; view = 'main'; animate = 'view';
  render();
  pull().then(focusPt);
}

function logout() {
  auth = null; loginPick = null; loginErr = ''; menuOpen = false;
  chrome.storage.local.remove('session');
  showLogin(true);
}

function headerHtml() {
  return `
  <div class="header">
    <div class="brand"><span class="logo">${icon('app-window-filled', 22)}</span><span class="brand-name">Pathhelp with tuik</span></div>
    <div class="hactions">
      <button class="icon-btn insp-trigger" data-act="inspect" aria-label="Row inspector" title="Row inspector — see every field's id on this HMIS page">${icon('compass-tool', 18)}</button>
      <button class="avatar${getProfile(auth?.name)?.avatar ? ' has-av' : ''}" data-act="menu" data-menu aria-label="Profile">${auth ? avatarInner(auth.name, 34) : icon('user', 16)}</button>
    </div>
    ${menuOpen ? `<div class="menu" data-menu>
      <div class="who">${esc(auth?.name || '')}<small>Access ends in ${accessLeft()}</small></div>
      <button data-act="demo">${icon('flask-conical', 15)}<span style="flex:1">Demo mode</span><span class="sw ${demoMode ? 'on' : ''}"></span></button>
      <button data-act="logout">${icon('log-out', 15)}Log out</button>
    </div>` : ''}
  </div>`;
}

function emptyHtml() {
  return `<div class="empty">${icon('microscope', 28)}
    <b>No result-entry rows on this page</b>
    <span>Open the HMIS result-entry page in the active tab — Pathhelp will pick it up automatically.</span></div>`;
}

function statusText() {
  if (ev.findings.length) return `${ev.findings.length} abnormal`;
  if (ev.tone === 'green') return 'Normal';
  return ev.entered > 0 ? 'Check entries' : 'Empty';
}

const P_BARCODE = '<svg viewBox="0 0 24 30" width="16" height="20" fill="currentColor" aria-hidden="true"><rect x="0" width="3" height="30"/><rect x="5" width="1.5" height="30"/><rect x="8.5" width="3" height="30"/><rect x="13.5" width="1.5" height="30"/><rect x="17" width="3" height="30"/><rect x="22" width="1.5" height="30"/></svg>';

function patientHtml() {
  const p = state.patient;
  const g = ev.sex === 'U' ? (p.gender ? p.gender[0].toUpperCase() : '–') : ev.sex;
  const reg = shortReg(p.reg) || '–';
  const has = !!(p.name || p.reg);
  const age = ageChip(ev.age) || '–';
  const n = ev.findings.length;
  const big = n ? String(n) : ev.tone === 'green' ? icon('check', 30) : '–';
  const lbl = n ? 'abnormal' : statusText();
  const copyBtn = reg !== '–' ? `<button class="pcopy" data-act="copy" aria-label="Copy reg no.">${icon('copy', 16)}</button>` : '';
  return `<div class="patient ${ev.tone}">
    <div class="pstat"><b class="pnum">${big}</b><span class="plbl">${esc(lbl)}</span></div>
    <div class="pmain">
      ${has ? `<h1 class="name">${esc(p.name || 'Unknown')}</h1>` : ''}
      ${has ? `<div class="prow">
        <span class="pmeta">${esc(age)} · ${esc(g)}</span>
        <span class="pregno">${esc(reg)}</span>
        ${copyBtn}
      </div>` : ''}
    </div>
    ${searchHtml()}
  </div>`;
}

async function copyReg() {
  const reg = shortReg(state?.patient?.reg);
  if (!reg) return;
  try { await navigator.clipboard.writeText(reg); }
  catch {
    const t = document.createElement('textarea');
    t.value = reg; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch {}
    t.remove();
  }
  toast('Reg no. copied');
  const b = document.querySelector('[data-act="copy"]');
  if (!b) return;
  b.innerHTML = icon('check', 16);
  b.classList.add('done');
  setTimeout(() => {
    const b2 = document.querySelector('[data-act="copy"]');
    if (b2) { b2.innerHTML = icon('copy', 16); b2.classList.remove('done'); }
  }, 1200);
}

// ───────── LIS: every CBC value (Hb … RDW, in HMIS order) as an editable two-column grid ─────────
const LIS_ORDER = ['hb', 'tc', 'rbc', 'plt', 'neut', 'lymph', 'eos', 'mono', 'baso', 'atyp', 'hct', 'mcv', 'mch', 'mchc', 'rdw'];
const LIS_LABEL = { neut: 'Neutrophil', lymph: 'Lymphocyte', mono: 'Monocyte', eos: 'Eosinophil', baso: 'Basophil', atyp: 'Atypical', mp: 'MP', pbs: 'PBS' };
const LIS_UNIT = { hb: 'g/dL', tc: '×10³', rbc: '×10⁶', plt: '×10³', hct: '%', mcv: 'fL', mch: 'pg', mchc: 'g/dL', rdw: '%', neut: '%', lymph: '%', mono: '%', eos: '%', baso: '%', atyp: '%' };

function lisHtml() {
  const keys = LIS_ORDER.filter((k) => k in state.values);
  const extras = state.extras || [];
  const hasMpPbs = ['mp', 'pbs'].some((k) => k in state.values);
  if (!keys.length && !extras.length && !hasMpPbs) return '';
  const calcOn = lisCalc.reg === (state.patient?.reg ?? null);
  const fillOn = lisFill.reg === (state.patient?.reg ?? null);
  // Confirm / not-confirm icon at the right end of each row (mirrors the row's Confirm box on the HMIS page; tap to toggle).
  const cfm = (k) => {
    const c = state.confirm?.[k];
    if (!c) return '<span class="lis-c"></span>';
    const msg = c.on ? 'Confirmed — tap to un-confirm' : 'Not confirmed — tap to confirm';
    return `<button type="button" class="lis-cfm ${c.on ? 'on' : 'off'}" data-act="cfm" data-key="${esc(k)}" ${c.locked ? 'disabled' : ''} aria-pressed="${c.on}" aria-label="${msg}" title="${msg}">${icon(c.on ? 'box-check-outline' : 'box-alert', 18)}</button>`;
  };
  // Confirm-all toggle (next to the LIS button): all rows confirmed → green check, tap un-confirms all; otherwise amber alert, tap confirms all.
  const cfmList = Object.values(state.confirm || {}).filter((c) => !c.locked);
  const allOn = cfmList.length > 0 && cfmList.every((c) => c.on);
  const allMsg = allOn ? 'All confirmed — tap to un-confirm all' : 'Tap to confirm all rows';
  const cfmAll = cfmList.length
    ? `<button type="button" class="lis-all ${allOn ? 'on' : 'off'}" data-act="cfmall" aria-pressed="${allOn}" aria-label="${allMsg}" title="${allMsg}">${icon(allOn ? 'box-check-outline' : 'box-alert', 18)}</button>`
    : '';
  const rows = keys.map((k) => {
    const dir = ev.flags[k]; // 'low' | 'high' | undefined
    const chk = ev.checks.find((c) => c.key === k);
    const cls = dir ? `bad ${dir}` : chk ? 'warn' : '';
    const flag = dir ? `<span class="lis-dir" aria-label="${dir === 'low' ? 'Low' : 'High'}">${icon(dir === 'low' ? 'arrow-down' : 'arrow-up', 12)}</span>`
      : chk ? `<span class="lis-dir warn" title="${esc(chk.msg)}">${icon('triangle-alert', 12)}</span>` : '';
    const tag = calcOn && lisCalc.vals[k] !== undefined && lisCalc.vals[k] === state.values[k] ? '<span class="lis-tag" title="Calculated by the LIS button, not read from a machine">calc</span>' : '';
    const fillTag = fillOn && lisFill.vals[k] !== undefined && lisFill.vals[k] === String(state.values[k]).trim() ? '<span class="lis-tag" title="Filled by the LIS button (random normal value), not read from a machine">auto</span>' : '';
    const label = LIS_LABEL[k] || PARAM_META[k].label;
    const dcTools = k === 'neut'
      ? `<button type="button" class="lis-fix ${ev.dc.needsFix ? '' : 'dim'}" data-act="fix" title="Make DC counts whole numbers" aria-label="Make DC counts whole numbers">${icon('button-cursor', 16)}</button>`
        + (undo ? `<button type="button" class="lis-fix" data-act="undo" title="Undo DC fix" aria-label="Undo DC fix">${icon('undo3-filled', 16)}</button>` : '')
      : k === 'plt'
      ? `<button type="button" class="lis-fix" data-act="pltbump" title="Bump Platelet up by a random 60–100" aria-label="Bump Platelet up by a random 60–100">${icon('button-cursor', 16)}</button>`
      : '';
    return `<label class="lis-row ${cls}" for="lis-${k}">
      <span class="lis-k">${esc(label)}${flag}${tag}${fillTag}${dcTools}</span>
      <input id="lis-${k}" class="lisin" data-key="${k}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="—" aria-label="${esc(label)}" value="${esc(state.values[k] ?? '')}" />
      <span class="lis-u">${LIS_UNIT[k] || ''}</span>
      ${cfm(k)}
    </label>`;
  }).join('');
  // MP / PBS: shown right after RDW only when the HMIS page has those rows (or in Demo mode). Text comes from / goes to the same box as the MP / PBS cards.
  const mpRows = ['mp', 'pbs'].filter((k) => k in state.values).map((k) => `<label class="lis-row lis-wide lis-text" for="lis-${k}">
      <span class="lis-k">${LIS_LABEL[k]}</span>
      <input id="lis-${k}" class="lisin" data-key="${k}" type="text" autocomplete="off" spellcheck="false" placeholder="—" aria-label="${LIS_LABEL[k]}" value="${esc(state.values[k] ?? '')}" />
      <span class="lis-u"></span>
      ${cfm(k)}
    </label>`).join('');
  const extraRows = extras.map((x) => `<label class="lis-row lis-wide" for="lis-${esc(x.key)}">
      <span class="lis-k">${esc(x.label)}</span>
      <input id="lis-${esc(x.key)}" class="lisin" data-key="${esc(x.key)}" type="text" autocomplete="off" spellcheck="false" placeholder="—" aria-label="${esc(x.label)}" value="${esc(x.value ?? '')}" />
      <span class="lis-u">${/[a-z]/i.test(x.value ?? '') ? '' : esc(x.unit || '')}</span>
      ${cfm(x.key)}
    </label>`).join('');
  const plan = planLisCalc(state);
  const fill = lisFillTargets(state, fillOn ? lisFill.vals : {});
  const hint = fill.kind === 'fill' ? 'Fills normal values' : fill.kind === 'refill' ? 'Tap again for new normal values' : plan.length ? `Calculates ${plan.map((u) => PARAM_META[u.key].label).join(', ')}` : '';
  const seeRow = `<div class="mp-row">
      <span class="ic-lead">${icon('box', 20)}</span>
      <div class="txt"><div class="t">See Your LIS</div>${hint ? `<div class="lis-hint">${esc(hint)}</div>` : ''}</div>
      <button class="btn sm lis-btn" data-act="lis" ${plan.length || fill.keys.length ? '' : 'disabled'}>${icon('lasso-tool-02', 14)}LIS</button>
      ${cfmAll}
    </div>`;
  return `<section><h2>${icon('lasso-tool-02', 16)}LIS</h2><div class="mp-stack"><div class="mp-card lis-card">${seeRow}${rows}${mpRows}${extraRows}</div></div></section>`;
}

// Confirm icon: tick / untick that row's Confirm box on the HMIS page (Demo: local sample).
async function onCfm(key) {
  const c = state?.confirm?.[key];
  if (!c || c.locked) return;
  const r = await send({ type: 'setConfirm', key, on: !c.on });
  if (!r) toast('Could not reach the HMIS page — reload it.');
  else if (!r.ok) toast('No Confirm box for this row on the page.');
}

// Confirm-all toggle: if every row is confirmed → un-confirm all, otherwise confirm all.
async function onCfmAll() {
  const list = Object.values(state?.confirm || {}).filter((c) => !c.locked);
  if (!list.length) return;
  const on = !list.every((c) => c.on);
  const r = await send({ type: 'confirm', on });
  if (!r) toast('Could not reach the HMIS page — reload it.');
  else if (!r.ok) toast('No Confirm boxes found on this page.');
  else if (r.ticked) toast(on ? `Confirmed ${r.ticked} row${r.ticked > 1 ? 's' : ''}` : `Un-confirmed ${r.ticked} row${r.ticked > 1 ? 's' : ''}`);
}

// LIS button: fills blank boxes by calculation only (see planLisCalc). Typed / machine values are never touched.
async function onLisCalc() {
  const reg = state.patient?.reg ?? null;
  const prevFill = lisFill.reg === reg ? lisFill.vals : {};
  if (lisFillTargets(state, prevFill).keys.length) {
    const p = planLisFill(state, prevFill);
    if (p.error) return toast(p.error);
    if (!p.updates.length) return toast('Nothing to fill.');
    const r = await doWrite(p.updates, 'LIS', p.kind === 'refill' ? 'New normal values filled' : 'Normal values filled');
    if (r?.written?.length) {
      lisFill = { reg, vals: Object.fromEntries(p.updates.filter((u) => r.written.includes(u.key)).map((u) => [u.key, u.value])) };
      if (p.notes?.length) toast(p.notes[0]);
      render();
    }
    return;
  }
  const plan = planLisCalc(state);
  if (!plan.length) return toast('Nothing to fill — some boxes already have values.');
  const r = await doWrite(plan.map(({ key, value }) => ({ key, value })), 'LIS', `Calculated ${plan.map((u) => PARAM_META[u.key].label).join(', ')}`);
  if (r?.written?.length) {
    lisCalc = { reg: state.patient?.reg ?? null, vals: { ...(lisCalc.reg === (state.patient?.reg ?? null) ? lisCalc.vals : {}), ...Object.fromEntries(plan.filter((u) => r.written.includes(u.key)).map((u) => [u.key, u.value])) } };
    render();
  }
}

const lisTimers = {};
function onLisInput(input) {
  const key = input.dataset.key, value = input.value.trim();
  clearTimeout(lisTimers[key]);
  lisTimers[key] = setTimeout(async () => {
    const r = await send({ type: 'write', updates: [{ key, value }] });
    if (!r) toast('Could not reach the HMIS page — reload it.');
    else if (r.skipped?.includes(key)) toast(`No ${LIS_LABEL[key] || PARAM_META[key]?.label || key} row on this page.`);
    else if (r.pending?.length) toast('Field is being edited on the page — will apply when you leave it.');
    else if (r.written?.length) { session.actions.add('LIS'); scheduleHistory(); }
  }, 350);
}

function coffeeHtml() {
  return `<button type="button" class="coffee" data-act="nav" data-to="pay">${icon('coffee-sharp', 16)}<span>Take a coffee for me.</span></button>`;
}

function mpRow(key, heading, headIcon, emptyText) {
  if (!(key in state.values)) return '';
  const label = TPL_LABEL[key];
  const v = (state.values[key] || '').trim();
  const same = v !== '' && v === toSingleLine(tplText(key)); // already exactly the template
  const open = openMp.has(key);
  // 1) template card: always there — edit (pen) + Apply live inside the same outline
  const tplCard = `<div class="mp-card"><div class="mp-row">
      <span class="ic-lead">${icon('search-x', 20)}</span>
      <div class="txt"><div class="t">${emptyText}</div></div>
      <button class="mp-edit" data-act="tpl" data-key="${key}" aria-label="Edit ${label} template" title="Edit template">${icon('square-pen', 18)}</button>
      <button class="btn sm" data-act="apply" data-key="${key}" ${same ? 'disabled' : ''}>${icon('clipboard-paste', 13)}Apply</button>
    </div></div>`;
  // 2) applied card: appears below once the field has text — Remove + expandable text
  const applied = v
    ? `<div class="mp-card have ${open ? 'open' : ''}">
        <div class="mp-ahead">
          <span class="mp-ok">${icon('border-right', 16)}Applied</span>
          <button class="mp-rm" data-act="rm" data-key="${key}" aria-label="Remove ${label} text">${icon('remove-r', 16)}Remove</button>
        </div>
        <button class="mp-txt" data-act="mpx" data-key="${key}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} applied ${label} text">
          <span class="mp-prev">${esc(v)}</span><span class="mp-chev">${icon('chevron-down', 16)}</span>
        </button>
      </div>`
    : '';
  return `<section><h2>${icon(headIcon, 16)}${heading}</h2><div class="mp-stack">${tplCard}${applied}</div></section>`;
}

function mainView() {
  if (!state) return `<div class="wrap">${headerHtml()}${idleCardHtml()}${quoteHtml()}${emptyHtml()}</div>`;
  const hasRows = Object.keys(state.values).length > 0;
  let body = '';
  if (!hasRows) body = `<div class="empty"><span>No CBC / MP / PBS rows found on this page.</span></div>`;
  else body = mpRow('mp', 'Malarial parasite (MP)', 'microscope', 'Not found any MP')
    + mpRow('pbs', 'Peripheral blood smear (PBS)', 'test-tube-diagonal', 'Not found any PBS')
    + lisHtml() + coffeeHtml();
  return `<div class="wrap">${headerHtml()}${patientHtml()}${quoteHtml()}
    <div class="tab-body">${body}</div></div>`;
}
const quoteInner = () => {
  const q = QUOTES[quoteIdx];
  return `<span class="q">${esc(q.text)}</span>${q.by ? `<span class="by"> — ${esc(q.by)}</span>` : ''}`;
};
const quoteHtml = () => `<div class="qwrap"><div class="quote">${icon('quote', 16)}<div class="qtext" id="quoteText">${quoteInner()}</div></div>
  <div class="srow">
    <span class="sic">${icon('toolbar-right', 20)}</span>
    <span class="stxt"><b>Setup your Extra</b></span>
    <button class="btn sm" data-act="setup" aria-label="Setup">${icon('pen-tool-add', 14)}Setup</button>
  </div></div>`;

const FLAG_MAX = 4; // abnormal flags shown per patient before "+N"
function dayLabel(ts) {
  const d = new Date(ts), today = new Date();
  const sameDay = (x, y) => x.toDateString() === y.toDateString();
  if (sameDay(d, today)) return 'Today';
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const histSource = () => (demoMode ? demoHist : history);

function historyDetail(h) {
  const when = `${dayLabel(h.ts)} · ${new Date(h.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const vals = h.values || null;
  const flags = h.flags || {};
  const cells = vals ? ORDER.filter((k) => k in vals).map((k) => {
    const f = flags[k];
    return `<div class="hcell ${f || ''}"><span class="k">${esc(PARAM_META[k].label)}</span><span class="v">${esc(vals[k])}${f ? icon(f === 'low' ? 'arrow-down' : 'arrow-up', 11) : ''}</span></div>`;
  }).join('') : '';
  const texts = vals ? [['mp', 'MP'], ['pbs', 'PBS']].filter(([k]) => vals[k]).map(([k, l]) => `<div class="htext"><b>${l}</b> ${esc(vals[k])}</div>`).join('') : '';
  const fallback = !cells && h.abnormal.length ? `<div class="hflags">${h.abnormal.map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : '';
  const acts = h.actions.map((a) => `<span>${icon('check', 11)}${esc(a)}</span>`).join('');
  return `<div class="hdetail">
    <div class="hwhen">${esc(when)}</div>
    ${cells ? `<div class="hgrid">${cells}</div>` : ''}${fallback}${texts}
    ${acts ? `<div class="hacts">${acts}</div>` : ''}
  </div>`;
}

function historyRows() {
  const src = histSource();
  const q = histQuery.trim().toLowerCase();
  const list = src.filter((h) => !q || `${h.name} ${h.reg}`.toLowerCase().includes(q));
  if (!list.length) return `<div class="empty"><span>${src.length ? 'No matches.' : 'No patients yet.'}</span></div>`;
  let lastDay = '', out = '';
  for (const h of list) {
    const day = dayLabel(h.ts);
    if (day !== lastDay) { out += `<div class="hgroup">${esc(day)}</div>`; lastDay = day; }
    const open = openHist.has(h.id);
    out += `<div class="hitem ${open ? 'open' : ''}">
      <button class="hhead" data-act="hist" data-id="${esc(h.id)}" aria-expanded="${open}">
        <span class="hicon">${icon('app-window-filled', 20)}</span>
        <span class="hmain">
          <span class="hname">${esc(h.name || 'Unknown')}</span>
          <span class="hmeta">${esc([h.reg, h.sex, h.age].filter(Boolean).join(' · '))}</span>
        </span>
        <span class="hchev">${icon('chevron-down', 16)}</span>
      </button>
      ${open ? historyDetail(h) : ''}
    </div>`;
  }
  return out;
}

function historyView() {
  const n = histSource().length;
  return `<div class="wrap">${headerHtml()}
    <div class="page-head"><button class="icon-btn" data-act="back" aria-label="Back">${icon('arrow-left', 20)}</button>History</div>
    <div class="searchbox">${icon('profile-fill', 20, 'sl')}${icon('tab-search', 20, 'sr')}<input id="histSearch" class="input" placeholder="Search name or reg no." value="${esc(histQuery)}" /></div>
    <div class="hcount">${n ? `<b>${n}</b> patient${n > 1 ? 's' : ''} · last ${HISTORY_DAYS} days` : `Last ${HISTORY_DAYS} days`}</div>
    <div id="histList">${historyRows()}</div>
    <div class="hnote">${demoMode ? 'Demo mode — sample history. Nothing is saved.' : `Stored only on this device · removed automatically after ${HISTORY_DAYS} days.`}</div>
  </div>`;
}

function aboutView() {
  const v = chrome.runtime.getManifest().version;
  return `<div class="wrap">${headerHtml()}
    <div class="page-head"><button class="icon-btn" data-act="back" aria-label="Back">${icon('arrow-left', 20)}</button>About</div>
    <div class="card about">
      <p><b>Pathhelp with tuik</b> · v${esc(v)}</p>
      <p>Helps the pathology technician check CBC values against age- and gender-specific reference ranges, tidy the Differential Count to exactly 100, and paste standard MP / PBS text into HMIS.</p>
      <p>It only ever writes into Result Value inputs. Nothing is submitted or confirmed for you, and no data leaves the browser.</p>
      <p class="muted">Reference ranges are a draft seed and need pathologist sign-off. Credits: tuik.</p>
    </div></div>`;
}

function payView() {
  return `<div class="wrap">${headerHtml()}
    <div class="page-head"><button class="icon-btn" data-act="back" aria-label="Back">${icon('arrow-left', 20)}</button>Pay</div>
    <div class="paycard">
      <div class="paytop"><span class="payic">${icon('nav-pay', 26)}</span>
        <div class="paytxt"><div class="paytitle">Take a coffee for me</div><div class="paysub">Optional · any amount via UPI</div></div>
        <button class="qrbtn" data-act="qr" aria-label="Show QR code">${icon('qr-code', 16)}QR</button></div>
      <div class="upirow"><small>UPI ID</small><span class="upiid">${esc(UPI_ID)}</span>
        <button class="upicopy" data-act="copyupi" aria-label="Copy UPI ID">${icon('copy', 16)}</button></div>
      <a class="btn paybtn" href="${esc(upiLink())}" target="_blank" rel="noopener">${icon('nav-pay', 16)}Pay with UPI</a>
    </div>
    <div class="hnote">Opens your UPI app. If nothing opens, copy the UPI ID or scan the QR.</div>
  </div>`;
}

function showQr() {
  dlg.innerHTML = `<div class="qr-wrap">
      <div class="dlg-title">Scan to pay</div>
      <img class="qr-img" src="${QR_SRC}" alt="UPI QR code" />
      <div class="qr-id">${esc(UPI_ID)}</div>
      <div class="qr-sub">Scan with any UPI app</div>
      <div class="dlg-actions"><button class="btn ghost" data-x="close">Close</button></div>
    </div>`;
  const shut = () => dlg.close();
  dlg.querySelector('[data-x="close"]').onclick = shut;
  dlg.onclick = (e) => { if (e.target === dlg) shut(); };
  dlg.onclose = () => { dlg.onclick = null; dlg.onclose = null; };
  dlg.showModal();
}

// ───── Row inspector view (v2.0.1) ─────
function inspectView() {
  const rows = inspectRows || [];
  const body = inspectLoading
    ? `<div class="empty"><span>Scanning the HMIS page…</span></div>`
    : inspectMsg
    ? `<div class="empty"><span>${esc(inspectMsg)}</span></div>`
    : !rows.length
    ? `<div class="empty"><span>No visible fields with an id found on this page.</span></div>`
    : `<div class="insp-list">${rows.map((r) => `<div class="insp-row">
        <div class="insp-l"><span class="insp-lbl" title="${esc(r.label)}">${esc(r.label)}</span>${r.value ? `<span class="insp-val">${esc(r.value)}</span>` : ''}</div>
        <button type="button" class="insp-id" data-act="cpid" data-id="${esc(r.id)}" title="Tap to copy this id">${esc(r.id)}</button>
      </div>`).join('')}</div>`;
  return `<div class="wrap"><div class="header">
    <div class="brand"><span class="logo">${icon('app-window-filled', 22)}</span><span class="brand-name">Pathhelp with tuik</span></div>
  </div>
    <div class="page-head"><button class="icon-btn" data-act="back" aria-label="Back">${icon('arrow-left', 20)}</button>Row inspector</div>
    <div class="insp-toolbar">
      <span class="insp-count">${rows.length ? `<b>${rows.length}</b> field${rows.length > 1 ? 's' : ''} found` : 'Every visible, labelled field on this HMIS page'}</span>
      <span class="insp-btns">
        ${rows.length ? `<button type="button" class="btn sm ghost" data-act="cpall">${icon('copy', 14)}Copy all</button>` : ''}
        <button type="button" class="btn sm ghost" data-act="rescan">${icon('refresh-cw', 14)}Rescan</button>
      </span>
    </div>
    ${inspectDemo ? `<div class="insp-demo">${icon('flask-conical', 13)} Demo mode — these are sample rows so you can see how the list looks. Turn Demo mode off on a real HMIS page for actual ids.</div>` : ''}
    ${rows.length ? `<div class="insp-head"><span>Label (shown on the page)</span><span>HMIS id</span></div>` : ''}
    ${body}
    <div class="hnote">${inspectDemo ? 'Rescan does nothing in Demo mode — it just re-shows this sample.' : 'Scans automatically whenever a patient / page loads. Tap Rescan if HMIS changed since then.'}</div>
  </div>`;
}

async function onInspect() {
  setView('inspect');
  if (demoMode) { inspectDemo = true; inspectRows = DEMO_INSPECT_ROWS; inspectMsg = ''; inspectLoading = false; render(); return; }
  inspectDemo = false;
  inspectLoading = true; inspectMsg = ''; render();
  const r = await send({ type: 'inspect' });
  inspectLoading = false;
  if (!r) { inspectMsg = 'Could not reach the HMIS page — open it in this tab and reload it.'; inspectRows = null; }
  else { inspectRows = r.rows || []; inspectMsg = inspectRows.length ? '' : 'No visible fields with an id found on this page.'; }
  render();
}

// Silent background scan — keeps inspectRows fresh without the person having to open Row inspector or tap Rescan.
// Runs once per distinct HMIS page load (same key the Setup auto options use), never in Demo mode.
async function autoInspect(next) {
  if (demoMode || !next?.page) return;
  const key = `${next.patient?.reg || ''}|${next.searchedFor || ''}`;
  if (key === lastInspectKey) return;
  lastInspectKey = key;
  const r = await send({ type: 'inspect' });
  if (!r) return;
  inspectDemo = false;
  inspectRows = r.rows || [];
  if (view === 'inspect') { inspectMsg = inspectRows.length ? '' : 'No visible fields with an id found on this page.'; render(); }
}

function copyText(text) {
  const t = document.createElement('textarea');
  t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); } catch {}
  t.remove();
}

function onCopyId(id) {
  copyText(id);
  toast('Id copied');
}

function onCopyAllIds() {
  if (!inspectRows?.length) return;
  copyText(inspectRows.map((r) => `${r.label}\t${r.id}`).join('\n'));
  toast(`Copied ${inspectRows.length} rows`);
}


async function copyUpi() {
  try { await navigator.clipboard.writeText(UPI_ID); }
  catch {
    const t = document.createElement('textarea');
    t.value = UPI_ID; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch {}
    t.remove();
  }
  toast('UPI ID copied');
  const b = document.querySelector('[data-act="copyupi"]');
  if (!b) return;
  b.innerHTML = icon('check', 16); b.classList.add('done');
  setTimeout(() => { const b2 = document.querySelector('[data-act="copyupi"]'); if (b2) { b2.innerHTML = icon('copy', 16); b2.classList.remove('done'); } }, 1200);
}

const NAV = [['main', 'nav-home', 'Home'], ['history', 'nav-history', 'History'], ['about', 'nav-about', 'About'], ['pay', 'nav-pay', 'Pay']];
function initNav() {
  navRoot.innerHTML = `<div class="navrow"><div class="bnav" style="--i:0"><span class="ind"></span>${NAV.map(([to, ic, label]) => `<button data-act="nav" data-to="${to}" aria-label="${label}" title="${label}">${icon(ic, 20)}</button>`).join('')}</div><button class="subcard" data-act="submit" aria-label="Submit" title="Submit to HMIS" disabled><span class="subicon">${icon('submit', 18)}</span><span>Submit</span></button></div>`;
}
// Updated in place (not re-created) so the black highlight can slide between tabs.
function updateNav() {
  const i = Math.max(0, NAV.findIndex((n) => n[0] === view));
  const nav = navRoot.querySelector('.bnav');
  nav.style.setProperty('--i', i);
  nav.querySelectorAll('button').forEach((b, n) => b.classList.toggle('on', n === i));
  const sb = navRoot.querySelector('.subcard');
  if (sb) sb.disabled = !canSubmit() || submitting;
}
const canSubmit = () => !!state && Object.keys(state.values).length > 0 && (demoMode || state.canSubmit !== false);

// Put the cursor in the PT serial box so the next number can be typed straight away.
function focusPt() {
  requestAnimationFrame(() => {
    if (!auth || view !== 'main' || dlg.open) return;
    const n = $('#ptSerial');
    if (!n || n.disabled || document.activeElement === n) return;
    n.focus({ preventScroll: true });
  });
}
function setView(to) { view = to; animate = 'view'; render(); }

// ───────── Setup box ─────────
// Setup box (opens from the Setup card)
function setupHtml() {
  const row = (key, ic, title, sub) => `<button class="srow" data-act="setopt" data-key="${key}" role="switch" aria-checked="${!!setup[key]}">
      <span class="sic">${icon(ic, 18)}</span><span class="stxt"><b>${title}</b><small>${sub}</small></span><span class="sw ${setup[key] ? 'on' : ''}"></span></button>`;
  return `<div class="setup">
    <div class="dlg-title setup-title">${icon('pen-tool-add', 18)}<span>Setup</span></div>
    <div class="setup-sub">Customise how Pathhelp works with HMIS</div>
    ${row('autoConfirm', 'clipboard-check', 'Confirm', 'Ticks Confirm on every row when you search a patient or open this panel')}
    ${row('autoAtyp', 'microscope', 'Add Atypical', 'Puts “..” in Atypical Cell so the row gets saved')}
    ${row('autoMp', 'clipboard-paste', 'Add MP', 'Pastes your MP text into an empty MP row. That row is not auto-confirmed')}
    ${row('autoPlt', 'button-cursor', 'Add Platelet', 'Bumps Platelet up by a random 60–100 (×10³) when the patient loads')}
    <div class="dlg-actions"><button class="btn" data-x="close">Done</button></div>
  </div>`;
}
function openSetup() {
  dlg.innerHTML = setupHtml();
  const shut = () => dlg.close();
  dlg.querySelector('[data-x="close"]').onclick = shut;
  dlg.onclick = (e) => { if (e.target === dlg) shut(); };
  dlg.onclose = () => { dlg.onclick = null; dlg.onclose = null; };
  dlg.showModal();
}
function toggleSetupOpt(el) {
  const k = el.dataset.key;
  setup[k] = !setup[k];
  saveSetup();
  el.querySelector('.sw')?.classList.toggle('on', setup[k]);
  el.setAttribute('aria-checked', String(setup[k]));
}
// Confirm / Add Atypical / Add MP (Setup): run once per patient load (after a search, or when the panel first sees the patient).
function trackAuto(next) {
  if (!next || !(next.patient.name || next.patient.reg) || !Object.keys(next.values).length) return;
  const key = `${next.patient.reg}|${next.searchedFor || ''}`;
  if (key === lastAutoKey) return;
  lastAutoKey = key;
  if (setup.autoConfirm || setup.autoAtyp || setup.autoMp || setup.autoPlt) runAuto(next);
}
async function runAuto(next) {
  if (setup.autoAtyp && 'atyp' in next.values && !String(next.values.atyp).trim()) await send({ type: 'write', updates: [{ key: 'atyp', value: '..' }] });
  if (setup.autoPlt) await bumpPlatelet(next);
  const skip = [];
  if (setup.autoMp && 'mp' in next.values) {
    skip.push('mp'); // Add MP: the MP row is never auto-confirmed — the technician checks it first
    if (!String(next.values.mp).trim()) {
      const r = await send({ type: 'write', updates: [{ key: 'mp', value: toSingleLine(tplText('mp')) }] });
      if (r?.written?.length) { session.actions.add('MP'); scheduleHistory(); toast('MP text added'); }
    }
  }
  if (setup.autoConfirm) {
    const r = await send({ type: 'confirm', skip });
    if (r?.ticked) toast(`Confirmed ${r.ticked} row${r.ticked > 1 ? 's' : ''}`);
  }
}

// Submit card (bottom nav): presses HMIS's own Submit button.
// Rocket launch: plays on the Submit pill whenever it's pressed (Demo mode included, so it can be tried without touching real HMIS).
function launchRocket() {
  const btn = navRoot.querySelector('.subcard');
  if (!btn) return;
  btn.classList.remove('launch');
  void btn.offsetWidth; // restart the animation if it's already mid-flight
  btn.classList.add('launch');
  setTimeout(() => btn.classList.remove('launch'), 700);
}

async function onSubmit() {
  if (submitting) return;
  if (!canSubmit()) return toast('Open a patient first.');
  submitting = true; updateNav();
  launchRocket();
  if (demoMode) { setTimeout(() => toast('Demo mode — nothing was submitted.'), 400); submitting = false; updateNav(); return; }
  try {
    if (setup.autoAtyp && 'atyp' in state.values && !String(state.values.atyp).trim()) await send({ type: 'write', updates: [{ key: 'atyp', value: '..' }] });
    const r = await send({ type: 'submit' });
    if (!r) toast('Could not reach the HMIS page — reload it.');
    else if (!r.ok) toast('Submit button not found on this page.');
    else {
      toast('Submitted to HMIS');
      focusAfterSubmit = state.patient.reg;
      setTimeout(() => { if (focusAfterSubmit !== null) { focusAfterSubmit = null; focusPt(); } }, 2500); // fallback if HMIS keeps the same patient on screen
    }
  } finally { submitting = false; updateNav(); }
}

function render() {
  if (!auth) { showLogin(); return; }
  navRoot.hidden = false;
  const ae = document.activeElement;
  const keep = ae && (ae.id === 'ptSerial' || ae.classList?.contains('lisin')) ? { id: ae.id, v: ae.value, s: ae.selectionStart, e: ae.selectionEnd } : null;
  rendering = true;
  app.innerHTML = view === 'history' ? historyView() : view === 'about' ? aboutView() : view === 'pay' ? payView() : view === 'inspect' ? inspectView() : mainView();
  rendering = false;
  updateNav();
  if (keep) {
    const n = document.getElementById(keep.id);
    if (n) {
      if (keep.id !== 'ptSerial') n.value = keep.v;
      n.focus({ preventScroll: true });
      try { n.setSelectionRange(keep.s, keep.e); } catch {}
    }
  }

  if (animate) {
    // view change: animate the whole page
    app.firstElementChild?.classList.add('enter');
    animate = false;
  }
}

// ───────── events ─────────
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  const inMenu = e.target.closest('[data-menu]');
  let redraw = false;
  if (menuOpen && !inMenu) { menuOpen = false; redraw = true; }
  if (!el) { if (redraw) render(); return; }
  const act = el.dataset.act;
  switch (act) {
    case 'menu': menuOpen = !menuOpen; render(); return;
    case 'demo': toggleDemo(); return;
    case 'inspect': onInspect(); return;
    case 'logout': logout(); return;
    case 'pick': loginPick = el.dataset.name; loginErr = ''; showLogin(true); return;
    case 'loginback': loginPick = null; loginErr = ''; showLogin(true); return;
    case 'unlock': unlock(); return;
    case 'nav': if (view !== el.dataset.to) setView(el.dataset.to); return;
    case 'back': setView('main'); return;
    case 'hist': {
      const id = el.dataset.id;
      openHist.has(id) ? openHist.delete(id) : openHist.add(id);
      $('#histList').innerHTML = historyRows();
      return;
    }
    case 'copy': if (redraw) render(); copyReg(); return;
    case 'cpid': onCopyId(el.dataset.id); return;
    case 'cpall': onCopyAllIds(); return;
    case 'rescan': onInspect(); return;
    case 'qr': showQr(); return;
    case 'copyupi': if (redraw) render(); copyUpi(); return;
    case 'ptgo': doSearch(); return;
    case 'setup': openSetup(); return;
    case 'setopt': toggleSetupOpt(el); return;
    case 'submit': onSubmit(); return;
    case 'ptup': stepDate(1); return;
    case 'ptdown': stepDate(-1); return;
    case 'lis': onLisCalc(); return;
    case 'cfm': onCfm(el.dataset.key); return;
    case 'cfmall': onCfmAll(); return;
    case 'fix': onFix(); break;
    case 'undo': onUndo(); break;
    case 'pltbump': onPltBump(); break;
    case 'apply': (el.dataset.key === 'mp' ? applyMp : applyPbs)(); break;
    case 'rm': removeText(el.dataset.key); break;
    case 'tpl': editTemplate(el.dataset.key); break;
    case 'mpx': { const k = el.dataset.key; openMp.has(k) ? openMp.delete(k) : openMp.add(k); render(); return; }
  }
  if (redraw) render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'pw') unlock();
  if (e.key === 'Enter' && e.target.id === 'ptSerial') { e.preventDefault(); doSearch(); }
});

// PT search inputs: the serial takes digits only; everything updates in place (no re-render while typing).
document.addEventListener('focusin', (e) => { if (e.target.id === 'ptSerial') e.target.select(); });
// Tap anywhere outside the serial box after typing → search (the search button / Enter still work too).
document.addEventListener('focusout', (e) => {
  if (e.target.id !== 'ptSerial' || rendering) return;
  setTimeout(() => {
    if (document.activeElement?.closest?.('.ptdd, #ptGo')) return; // stepping the date / pressing the button
    if (!ptSerial || searching || ptFull() === lastSearched) return;
    const lp = loadedPt();
    if (lp && `${lp.date}PT${lp.serial}`.toUpperCase() === ptFull().toUpperCase()) return; // already loaded
    doSearch();
  }, 0);
});

document.addEventListener('input', (e) => {
  if (e.target.classList?.contains('lisin')) { onLisInput(e.target); return; }
  if (e.target.id === 'ptSerial') {
    const v = e.target.value.replace(/\D/g, '');
    if (v !== e.target.value) e.target.value = v;
    ptSerial = v;
    if (!searching) searchMsg = '';
    refreshPtBar();
    return;
  }
  if (e.target.id === 'histSearch') {
    histQuery = e.target.value;
    $('#histList').innerHTML = historyRows();
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!demoMode && msg?.type === 'state' && sender.tab && sender.tab.id === tabId) setState(msg.state);
});
chrome.tabs.onActivated.addListener(() => pull());
chrome.tabs.onUpdated.addListener((id, info) => { if (id === tabId && info.status === 'complete') pull(); });

// ───────── boot ─────────
(async function init() {
  await loadHistory();
  await loadTemplates();
  await loadSetup();
  const { session } = await chrome.storage.local.get('session');
  if (session && session.until > Date.now() && getProfile(session.name)) auth = session;
  else if (session) chrome.storage.local.remove('session');
  setInterval(() => {
    if (auth && Date.now() >= auth.until) { logout(); return; }
    const dc = dayCode(new Date()); // midnight passed: "Today" and the 7-day list move on
    if (dc !== lastDayCode) {
      lastDayCode = dc;
      if (ptDate !== 'today' && !ptDates().some((d) => d.code === ptDate)) ptDate = 'today';
      if (view === 'main' && document.activeElement?.id !== 'ptSerial') render();
    }
  }, 30000);
  ({ demoMode = false } = await chrome.storage.local.get('demoMode'));
  ({ ptDate = 'today' } = await chrome.storage.local.get('ptDate'));
  if (ptDate !== 'today' && !ptDates().some((d) => d.code === ptDate)) ptDate = 'today';
  lastDayCode = dayCode(new Date());
  if (demoMode) { demoValues = { ...DEMO.values }; demoExtras = DEMO.extras.map((x) => ({ ...x })); demoConfirm = { ...DEMO.confirm }; demoHist = demoHistory(); }
  initNav();
  render();
  // quote strip: fade to the next quote every 5 seconds
  setInterval(() => {
    quoteIdx = (quoteIdx + 1) % QUOTES.length;
    const el = $('#quoteText');
    if (!el) return;
    el.classList.add('fade');
    setTimeout(() => {
      const el2 = $('#quoteText');
      if (el2) { el2.innerHTML = quoteInner(); el2.classList.remove('fade'); }
    }, 220);
  }, 5000);
  await pull();
  focusPt();
})();
