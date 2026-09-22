// Reference ranges — SEED v0.1 (from PRD §6). Must be reviewed and signed off by the lab pathologist.
// Edit the tables below; the UI never needs to change.
// Age is measured in days: years*365.25 + months*30.44 + days.

const MO = 30.44;
const YR = 365.25;
const INF = 1e9;

// Age bands: [id, label, minDays, maxDays]
const AGE = {
  b0: ['0–<1 mo', 0, MO],
  b1: ['1–<3 mo', MO, 3 * MO],
  b2: ['3 mo–<1 y', 3 * MO, YR],
  b3: ['1–<3 y', YR, 3 * YR],
  b4: ['3–<6 y', 3 * YR, 6 * YR],
  b5: ['6–<12 y', 6 * YR, 12 * YR],
  b6: ['12–<18 y', 12 * YR, 18 * YR],
  b7: ['≥18 y', 18 * YR, INF],
  d1: ['1 mo–<1 y', MO, YR], // DC only
  d6: ['≥12 y', 12 * YR, INF], // DC only
};

// Red-cell + platelet table. Columns:
// age, sex, Hb, RBC, HCT, MCV, MCH, MCHC, RDW-CV, TC, Plt
const CBC_PARAMS = ['hb', 'rbc', 'hct', 'mcv', 'mch', 'mchc', 'rdw', 'tc', 'plt'];
const CBC_ROWS = [
  ['b0', '*', [13.0, 22.5], [3.6, 6.6], [42, 64], [86, 126], [28, 40], [30, 36], [14.0, 20.0], [5.0, 21.0], [150, 450]],
  ['b1', '*', [9.0, 18.0], [2.7, 5.4], [28, 55], [77, 123], [26, 40], [28, 37], [11.5, 17.0], [5.0, 19.5], [150, 450]],
  ['b2', '*', [9.5, 13.5], [3.1, 5.3], [29, 41], [70, 108], [23, 31], [29, 37], [11.5, 17.0], [6.0, 17.5], [150, 450]],
  ['b3', '*', [10.5, 13.5], [3.7, 5.3], [32, 44], [70, 87], [23, 31], [30, 36], [11.5, 14.5], [6.0, 17.0], [150, 450]],
  ['b4', '*', [11.5, 13.5], [3.9, 5.3], [34, 40], [75, 87], [24, 30], [31, 36], [11.5, 14.5], [5.5, 15.5], [150, 450]],
  ['b5', '*', [11.5, 15.5], [4.0, 5.2], [35, 45], [77, 95], [25, 33], [31, 36], [11.5, 14.5], [4.5, 13.5], [150, 450]],
  ['b6', 'M', [13.0, 17.0], [4.0, 5.8], [37, 49], [77, 93], [27, 32], [31, 35], [11, 14], [4.5, 13.5], [150, 450]],
  ['b6', 'F', [12.0, 16.0], [3.8, 5.2], [36, 46], [77, 93], [27, 32], [31, 35], [11, 14], [4.5, 13.5], [150, 450]],
  // v1.3.6: for ≥12 y, MCV 77–93, MCH 27–32, MCHC 31–35, RDW 11–14 = the lab pathologist's ranges (also the HMIS page's). Under 12 y stay age-specific.
  ['b7', 'M', [13.0, 17.0], [4.5, 5.5], [40, 50], [77, 93], [27, 32], [31, 35], [11, 14], [4.0, 11.0], [150, 400]],
  ['b7', 'F', [12.0, 15.0], [3.8, 4.8], [36, 46], [77, 93], [27, 32], [31, 35], [11, 14], [4.0, 11.0], [150, 400]],
];

// Differential count (%). Columns: age, sex, Neutrophil, Lymphocyte, Monocyte, Eosinophil, Basophil
const DC_PARAMS = ['neut', 'lymph', 'mono', 'eos', 'baso'];
const DC_ROWS = [
  ['b0', '*', [20, 65], [20, 65], [2, 12], [0, 6], [0, 1]],
  ['d1', '*', [15, 45], [40, 75], [2, 12], [0, 6], [0, 1]],
  ['b3', '*', [20, 50], [40, 70], [2, 10], [0, 6], [0, 1]],
  ['b4', '*', [30, 60], [30, 60], [2, 10], [0, 6], [0, 1]],
  ['b5', '*', [35, 65], [25, 55], [2, 10], [0, 6], [0, 1]],
  ['d6', '*', [40, 75], [20, 45], [2, 10], [0, 6], [0, 1]],
];

export const PARAM_META = {
  hb: { label: 'Hb', full: 'Haemoglobin', unit: 'g/dL' },
  rbc: { label: 'RBC', full: 'RBC Count', unit: '×10⁶/µL' },
  hct: { label: 'HCT', full: 'HCT', unit: '%' },
  mcv: { label: 'MCV', full: 'MCV', unit: 'fL' },
  mch: { label: 'MCH', full: 'MCH', unit: 'pg' },
  mchc: { label: 'MCHC', full: 'MCHC', unit: 'g/dL' },
  rdw: { label: 'RDW', full: 'RDW-CV', unit: '%' },
  tc: { label: 'TC', full: 'WBC Count', unit: '×10³/µL' },
  plt: { label: 'Platelet', full: 'Platelet Count', unit: '×10³/µL' },
  neut: { label: 'Neutrophil', full: 'Neutrophil', unit: '%' },
  lymph: { label: 'Lymphocyte', full: 'Lymphocyte', unit: '%' },
  mono: { label: 'Monocyte', full: 'Monocyte', unit: '%' },
  eos: { label: 'Eosinophil', full: 'Eosinophil', unit: '%' },
  baso: { label: 'Basophil', full: 'Basophil', unit: '%' },
  atyp: { label: 'Atypical cells', full: 'Atypical Cell', unit: '%' },
};

function build() {
  const ref = {};
  const add = (rows, params) => {
    params.forEach((p, i) => {
      ref[p] = ref[p] || { label: PARAM_META[p].full, unit: PARAM_META[p].unit, bands: [] };
      for (const row of rows) {
        const [ageKey, sex] = row;
        const [ageLabel, minDays, maxDays] = AGE[ageKey];
        const [low, high] = row[2 + i];
        ref[p].bands.push({ minDays, maxDays, sex, low, high, ageLabel });
      }
    });
  };
  add(CBC_ROWS, CBC_PARAMS);
  add(DC_ROWS, DC_PARAMS);
  return ref;
}

export const REFERENCE = build();

/**
 * @param {string} param  key from REFERENCE
 * @param {number} ageDays
 * @param {'M'|'F'|'U'} sex  U = unknown/other → union of male and female ranges
 * @returns {{low:number, high:number, bandLabel:string}|null}
 */
export function getRange(param, ageDays, sex) {
  const p = REFERENCE[param];
  if (!p || ageDays == null || Number.isNaN(ageDays)) return null;
  const d = ageDays + 1e-6;
  const hits = p.bands.filter((b) => d >= b.minDays && d < b.maxDays);
  if (!hits.length) return null;
  const ageLabel = hits[0].ageLabel;
  const sexWord = sex === 'M' ? 'male' : sex === 'F' ? 'female' : null;
  const exact = hits.filter((b) => b.sex === '*' || b.sex === sex);
  if (exact.length) {
    return {
      low: exact[0].low,
      high: exact[0].high,
      bandLabel: sexWord ? `${sexWord}, ${ageLabel}` : ageLabel,
    };
  }
  return {
    low: Math.min(...hits.map((b) => b.low)),
    high: Math.max(...hits.map((b) => b.high)),
    bandLabel: `${ageLabel}, sex not stated — male/female union`,
  };
}
