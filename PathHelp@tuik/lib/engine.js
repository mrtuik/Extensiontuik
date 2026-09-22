// Abnormal engine + DC Fix. Pure functions — no DOM, no chrome.* APIs.
import { getRange, PARAM_META } from './values.js';

// Display order in "Abnormal findings" (PRD §4.5)
export const ORDER = ['hb', 'rbc', 'tc', 'plt', 'neut', 'lymph', 'mono', 'eos', 'baso', 'hct', 'mcv', 'mch', 'mchc', 'rdw', 'atyp'];
export const DC_KEYS = ['neut', 'lymph', 'mono', 'eos', 'baso'];
export const DC_CHIPS = { neut: 'N', lymph: 'L', mono: 'M', eos: 'E', baso: 'B' };

// Physiologically impossible → "check entry" instead of a verdict (internal units)
const PLAUSIBLE = {
  hb: [0, 30], rbc: [0, 10], hct: [0, 80], mcv: [0, 200], mch: [0, 60], mchc: [0, 50], rdw: [0, 40],
  tc: [0, 500], plt: [0, 2000], neut: [0, 100], lymph: [0, 100], mono: [0, 100], eos: [0, 100], baso: [0, 100], atyp: [0, 100],
};

export function parseNum(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
}

export function parseAge(text) {
  const t = text || '';
  const y = /(\d+)\s*year/i.exec(t), m = /(\d+)\s*month/i.exec(t), d = /(\d+)\s*day/i.exec(t);
  if (!y && !m && !d) return null;
  const Y = y ? +y[1] : 0, M = m ? +m[1] : 0, D = d ? +d[1] : 0;
  return { y: Y, m: M, d: D, days: Y * 365.25 + M * 30.44 + D };
}

export function parseSex(text) {
  const t = (text || '').trim();
  if (/^m/i.test(t)) return 'M';
  if (/^f/i.test(t)) return 'F';
  return 'U';
}

// 542000 → "5,42,000"
export function indian(n) {
  const s = String(Math.round(n));
  if (s.length <= 3) return s;
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${s.slice(-3)}`;
}

const num = (x) => String(+x.toFixed(2));
export const pad2 = (n) => (n < 10 ? `0${n}` : String(n)); // 1 → 01, 4 → 04, 0 → 00
const roundHalfUp = (x) => Math.floor(x + 0.5 + 1e-9);

function describe(key, raw, v) {
  const { label, unit } = PARAM_META[key];
  if (key === 'tc' || key === 'plt') return `${label} ${raw} ${unit} (${indian(v * 1000)}/µL)`;
  return `${label} ${raw} ${unit}`;
}

export function evaluate(state) {
  const values = state?.values || {};
  const age = parseAge(state?.patient?.age);
  const sex = parseSex(state?.patient?.gender);
  const out = {
    age, sex, findings: [], checks: [], notes: [], flags: {}, entered: 0, tone: 'grey',
    dc: { present: DC_KEYS.filter((k) => k in values), total: 0, hasAny: false, totalOk: false, needsFix: false, nums: {} },
  };
  if (!age) out.notes.push('Age could not be read — reference ranges unavailable.');

  for (const key of ORDER) {
    if (!(key in values)) continue;
    const raw = String(values[key]).trim();
    let v = parseNum(raw);
    if (v === null) continue; // blank / "Nil" → ignored

    const meta = PARAM_META[key];
    if (key === 'tc' && v > 100) {
      v = v / 1000; // raw count typed (e.g. 7800)
      out.notes.push(`TC ${raw} read as raw count → ${num(v)} ×10³/µL.`);
    }
    const [lo, hi] = PLAUSIBLE[key];
    if (v < lo || v > hi) {
      out.checks.push({ key, label: meta.label, valueText: raw, msg: `${meta.label} ${raw} ${meta.unit} looks physiologically impossible — check entry.` });
      continue;
    }
    if (key === 'plt' && v < 10) out.notes.push(`Platelet ${raw} — unusually low. Did you mean lakh (e.g. ${raw} lakh = ${raw}00)?`);

    if (DC_KEYS.includes(key)) out.dc.nums[key] = v;

    if (key === 'atyp') {
      out.entered++;
      if (v > 0) {
        out.flags[key] = 'high';
        out.findings.push({ key, label: meta.label, valueText: raw, value: v, low: 0, high: 0, unit: meta.unit, dir: 'high', why: `Atypical cells ${raw} % — any value above 0 is abnormal.` });
      }
      continue;
    }

    const r = age ? getRange(key, age.days, sex) : null;
    if (!r) continue;
    out.entered++;

    let dir = null, why = '';
    const rangeTxt = `${r.low}–${r.high} ${meta.unit}`;
    if (key === 'baso') {
      if (v >= 1) {
        dir = 'high';
        why = `Basophil ${raw} % is 1 % or more — always flagged abnormal (reference 0–<1 %, ${r.bandLabel}).`;
      }
    } else if (v < r.low && key !== 'eos') {
      dir = 'low';
      why = `${describe(key, raw, v)} is below the reference range ${rangeTxt} (${r.bandLabel}).`;
    } else if (v > r.high) {
      dir = 'high';
      why = `${describe(key, raw, v)} is above the reference range ${rangeTxt} (${r.bandLabel}).`;
    }
    if (dir) {
      out.flags[key] = dir;
      out.findings.push({ key, label: meta.label, valueText: raw, value: v, low: r.low, high: r.high, unit: meta.unit, dir, why });
    }
  }

  // DC totals — blank fields count as 0
  const dc = out.dc;
  dc.hasAny = dc.present.some((k) => parseNum(values[k]) !== null);
  dc.total = Math.round(dc.present.reduce((s, k) => s + (parseNum(values[k]) ?? 0), 0) * 100) / 100;
  dc.totalOk = dc.hasAny && dc.total === 100;
  dc.needsFix =
    dc.hasAny &&
    (!dc.totalOk ||
      dc.present.some((k) => {
        const s = String(values[k]).trim();
        if (s === '') return true; // blank → will be filled with 00
        const n = parseNum(s);
        if (n === null) return false;
        return !Number.isInteger(n) || (n < 10 && s !== pad2(n)); // not whole, or not 2-digit
      }));

  out.tone = out.findings.length ? 'red' : out.entered > 0 && out.checks.length === 0 ? 'green' : 'grey';
  return out;
}

/** Chip text for a DC row: basophil < 1 is shown as 00. */
/** Platelet bump (v2.0.1): only when the current Platelet value is 80–139 (below 80 is left alone — too abnormal to auto-adjust), adds a random 60–100 to it. Returns null otherwise (blank / not a number / <80 / ≥140). */
export function plateletBump(currentRaw, rng = Math.random) {
  const cur = parseNum(currentRaw);
  if (cur === null || cur < 80 || cur >= 140) return null;
  const add = 60 + Math.floor(rng() * 41); // 60..100 inclusive
  return { value: Math.round(cur + add), add };
}

export function dcDisplay(key, raw) {
  const n = parseNum(raw);
  if (n === null) return String(raw ?? '').trim() || '–';
  if (key === 'baso' && n < 1) return '00';
  return String(raw).trim();
}

/**
 * DC Fix (PRD §7.2). Returns { error } or
 * { rawTotal, before, after, updates, target, diff }.
 */
export function planFix(state) {
  const values = state?.values || {};
  const present = DC_KEYS.filter((k) => k in values);
  if (!present.length) return { error: 'No differential count rows found on this page.' };
  if (!present.some((k) => parseNum(values[k]) !== null)) return { error: 'Enter DC values first.' };
  if (!present.includes('neut') && !present.includes('lymph')) return { error: 'Neutrophil / Lymphocyte rows are missing — cannot balance the total.' };

  const raw = {};
  let rawTotal = 0;
  for (const k of present) {
    const s = String(values[k]).trim();
    if (s === '') raw[k] = 0;
    else {
      const n = parseNum(s);
      if (n === null) return { error: `${PARAM_META[k].label} contains text ("${s}") — fix it manually.` };
      raw[k] = n;
    }
    rawTotal += raw[k];
  }
  rawTotal = Math.round(rawTotal * 100) / 100;

  const after = {};
  for (const k of present) after[k] = k === 'baso' && raw[k] < 1 ? 0 : roundHalfUp(raw[k]);

  const diff = 100 - present.reduce((s, k) => s + after[k], 0);
  const cands = ['neut', 'lymph'].filter((k) => present.includes(k));
  const target = cands.length === 2 ? (after.lymph > after.neut ? 'lymph' : 'neut') : cands[0];
  after[target] += diff;
  if (after[target] < 0) return { error: `Correction would make ${PARAM_META[target].label} negative — check entries.` };

  const before = {}, afterText = {}, updates = [];
  for (const k of present) {
    before[k] = String(values[k]);
    afterText[k] = pad2(after[k]);
    if (afterText[k] !== before[k].trim()) updates.push({ key: k, value: afterText[k] });
  }
  return { rawTotal, before, after: afterText, updates, target, diff };
}

/**
 * LIS button (v1.3.6). Fills ONLY boxes that are still blank, and ONLY by calculation from values already entered:
 *   HCT = Hb × 3 (lab rule) · MCV = HCT×10÷RBC · MCH = Hb×10÷RBC · MCHC = Hb×100÷HCT
 * MCV / MCHC use an HCT that was actually entered — never an HCT this button just estimated.
 * It never writes a value picked from a "normal" range and never overwrites anything already typed.
 * @returns {{key:string, value:string, how:string}[]}
 */
export function planLisCalc(state) {
  const v = state?.values || {};
  const val = (k) => (k in v ? parseNum(v[k]) : null);
  const blank = (k) => k in v && String(v[k]).trim() === '';
  const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
  const hb = val('hb'), rbc = val('rbc'), hct = val('hct');
  const out = [];
  const add = (key, value, how) => {
    const n = +value;
    if (Number.isFinite(n) && n > 0 && n <= PLAUSIBLE[key][1]) out.push({ key, value: String(value), how });
  };
  if (blank('hct') && hb > 0) add('hct', r1(hb * 3), 'Hb × 3');
  if (blank('mcv') && hct > 0 && rbc > 0) add('mcv', String(Math.round((hct * 10) / rbc)), 'HCT × 10 ÷ RBC');
  if (blank('mch') && hb > 0 && rbc > 0) add('mch', r1((hb * 10) / rbc), 'Hb × 10 ÷ RBC');
  if (blank('mchc') && hb > 0 && hct > 0) add('mchc', r1((hb * 100) / hct), 'Hb × 100 ÷ HCT');
  return out;
}

/**
 * LIS auto-fill (v2.0.1). Fills the CBC boxes (Hb … RDW, not Atypical) with random values inside the normal range for the patient's age / sex.
 *  • Works when every CBC box is blank, or again on boxes this button filled earlier (each click gives new values).
 *  • A box the user changed by hand after an auto-fill is left alone (so abnormal values typed manually stay).
 *  • HCT = Hb × 3 (Hb is picked so HCT also lands in range). DC values are whole 2-digit numbers that add up to exactly 100.
 * `prev` = { key: value } the button wrote last time for this patient.
 */
export const FILL_KEYS = ['hb', 'tc', 'rbc', 'plt', 'neut', 'lymph', 'eos', 'mono', 'baso', 'hct', 'mcv', 'mch', 'mchc', 'rdw'];

export function lisFillTargets(state, prev = {}) {
  const v = state?.values || {};
  const present = FILL_KEYS.filter((k) => k in v);
  if (!present.length) return { kind: null, keys: [] };
  const blank = (k) => String(v[k]).trim() === '';
  const auto = (k) => k in prev && String(v[k]).trim() === String(prev[k]);
  if (present.every(blank)) return { kind: 'fill', keys: present };
  if (present.some(auto)) return { kind: 'refill', keys: present.filter((k) => auto(k) || blank(k)) };
  return { kind: null, keys: [] };
}

export function planLisFill(state, prev = {}, rng = Math.random) {
  const { kind, keys } = lisFillTargets(state, prev);
  if (!keys.length) return { updates: [], kind: null };
  const age = parseAge(state?.patient?.age);
  if (!age) return { error: 'Age could not be read — cannot pick normal values.' };
  const sex = parseSex(state?.patient?.gender);
  const v = state.values || {};
  const want = new Set(keys);
  const rangeOf = (k) => getRange(k, age.days, sex);
  const pick = (lo, hi, dec) => {
    const f = 10 ** dec, a = Math.ceil(lo * f - 1e-9), b = Math.floor(hi * f + 1e-9);
    return (a + Math.floor(rng() * (b - a + 1))) / f;
  };
  const fmt = (x, dec) => x.toFixed(dec);
  const out = {};

  // Hb + HCT (HCT = Hb × 3)
  const rHb = rangeOf('hb'), rHct = rangeOf('hct');
  let hb = parseNum(v.hb);
  if (want.has('hb') && rHb) {
    let lo = rHb.low, hi = rHb.high;
    if (rHct) { lo = Math.max(lo, rHct.low / 3); hi = Math.min(hi, rHct.high / 3); }
    if (lo > hi) { lo = rHb.low; hi = rHb.high; }
    hb = pick(lo, hi, 1);
    out.hb = fmt(hb, 1);
  }
  if (want.has('hct')) {
    if (hb > 0) out.hct = fmt(Math.round(hb * 30) / 10, 1);
    else if (rHct) out.hct = fmt(pick(rHct.low, rHct.high, 1), 1);
  }
  // Other red-cell / count values
  const simple = { tc: 1, rbc: 1, plt: 0, mcv: 0, mch: 1, mchc: 1, rdw: 1 };
  for (const [k, dec] of Object.entries(simple)) {
    if (!want.has(k)) continue;
    const r = rangeOf(k);
    if (r) out[k] = fmt(pick(r.low, r.high, dec), dec);
  }

  // DC: whole numbers, 2 digits, total exactly 100
  const notes = [];
  const dcT = DC_KEYS.filter((k) => want.has(k));
  if (dcT.length) {
    const fixedSum = DC_KEYS.filter((k) => k in v && !want.has(k)).reduce((s, k) => s + (parseNum(v[k]) ?? 0), 0);
    const need = Math.round((100 - fixedSum) * 100) / 100;
    const rg = {};
    for (const k of dcT) {
      const r = rangeOf(k);
      if (!r) continue;
      rg[k] = k === 'baso' ? [0, 0] : k === 'eos' ? [Math.max(1, Math.ceil(r.low)), Math.floor(r.high)] : [Math.ceil(r.low), Math.floor(r.high)];
    }
    const order = ['baso', 'eos', 'mono', dcT.includes('lymph') && dcT.includes('neut') ? 'lymph' : null, 'neut', 'lymph'].filter((k, i, a) => k && dcT.includes(k) && rg[k] && a.indexOf(k) === i);
    const last = order[order.length - 1];
    let best = null;
    for (let t = 0; t < 300 && !best; t++) {
      const vals = {};
      let sum = 0;
      for (const k of order) { if (k === last) continue; vals[k] = pick(rg[k][0], rg[k][1], 0); sum += vals[k]; }
      if (!last) break;
      const rest = need - sum;
      if (rest >= rg[last][0] && rest <= rg[last][1]) { vals[last] = rest; best = vals; }
    }
    if (!best && last) { // ranges cannot reach 100 (an abnormal DC value was typed): let the last box balance the total
      const vals = {};
      let sum = 0;
      for (const k of order) { if (k === last) continue; vals[k] = pick(rg[k][0], rg[k][1], 0); sum += vals[k]; }
      if (need - sum >= 0) { vals[last] = need - sum; best = vals; notes.push('DC could not stay inside normal ranges with the typed values — total kept at 100.'); }
      else notes.push('DC not filled — typed values leave no room for a total of 100.');
    }
    if (best) for (const k of Object.keys(best)) out[k] = pad2(best[k]);
  }

  const updates = FILL_KEYS.filter((k) => k in out).map((k) => ({ key: k, value: out[k] }));
  return { updates, kind, notes };
}
