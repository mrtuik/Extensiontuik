// Sample patient for Demo mode (profile menu). Nothing here is ever written to HMIS.
export const DEMO = {
  patient: { name: 'Aryan Khan', reg: 'MRBS/RG2600000000', gender: 'Male', age: '9 Year 0 Month 0 Days' },
  values: {
    hb: '4.0', tc: '7.8', rbc: '4.6', plt: '70',
    neut: '67.2', lymph: '27.7', mono: '1.4', eos: '3.5', baso: '0.2', atyp: '', // DC total = 100.0
    hct: '38.5', mcv: '82', mch: '27.5', mchc: '33.4', rdw: '16.2',
    pbs: '', mp: '',
  },
  // Extra rows (any other test row the page has) — sample so Demo mode shows how they look under RDW (BT ≈ 1–2 min, CT ≈ 3–4 min; typed like "1 min 30 sec").
  extras: [
    { key: 'x_bleeding-time', label: 'Bleeding Time', unit: 'min', value: '1 min 30 sec' },
    { key: 'x_clotting-time', label: 'Clotting Time', unit: 'min', value: '3 min 45 sec' },
  ],
};

// Demo Confirm boxes (true = confirmed): normal rows confirmed, abnormal / MP / PBS / BT / CT not yet — so both icons can be seen.
DEMO.confirm = { hb: true, tc: true, rbc: true, plt: true, lymph: true, eos: true, baso: true, atyp: true, hct: true, mcv: true, mch: true, mchc: true };

import { PARAM_META } from './values.js';

// Sample history shown on the History page while Demo mode is on (never saved anywhere).
export function demoHistory(now = Date.now()) {
  const M = 60e3, H = 60 * M, D = 24 * H;
  const keyOf = (label) => {
    const l = label.toLowerCase(), ks = Object.keys(PARAM_META);
    return ks.find((k) => PARAM_META[k].label.toLowerCase() === l) || ks.find((k) => PARAM_META[k].label.toLowerCase().startsWith(l));
  };
  const flagsOf = (abn) => Object.fromEntries(abn.map((a) => [keyOf(a.slice(0, -2)), a.endsWith('↑') ? 'high' : 'low']));
  const norm = { hb: '13.6', rbc: '4.7', tc: '7.2', plt: '260', neut: '58.5', lymph: '32', mono: '6', eos: '3', baso: '0.5', hct: '41', mcv: '88', mch: '29', mchc: '33', rdw: '13.2' };
  const e = (id, ago, reg, name, sex, age, abnormal, actions, values) => ({ id, ts: now - ago, reg, name, sex, age, abnormal, actions, flags: flagsOf(abnormal), values: { ...norm, ...values } });
  const { hb, tc, rbc, plt, neut, lymph, mono, eos, baso, hct, mcv, mch, mchc, rdw } = DEMO.values;
  return [
    e('d1', 4 * M, 'RG2600000000', 'Aryan Khan', 'M', '9 Y', ['Hb ↓', 'Platelet ↓', 'Neut ↑', 'Mono ↓', 'RDW ↑'], ['Fix'], { hb, tc, rbc, plt, neut, lymph, mono, eos, baso, hct, mcv, mch, mchc, rdw }),
    e('d2', 38 * M, 'RG2600000412', 'Nusrat Jahan', 'F', '34 Y', [], ['MP', 'PBS'], { hb: '12.8', mp: 'Not found any MP', pbs: 'RBCs normocytic normochromic. WBCs normal in number. Platelets adequate.' }),
    e('d3', 70 * M, 'RG2600000398', 'Md. Rahim Uddin', 'M', '2 Y, 4 M', ['Hb ↓'], ['Fix'], { hb: '8.9', rbc: '4.4', tc: '9.5', plt: '310', neut: '40.5', lymph: '50', hct: '34', mcv: '76', mch: '26', mchc: '32', rdw: '13' }),
    e('d4', D + 3 * H, 'RG2600000351', 'Sadia Islam', 'F', '7 Y', ['TC ↑', 'Neut ↑'], ['Fix', 'PBS'], { hb: '12.4', tc: '16.2', plt: '280', neut: '78', lymph: '15', mono: '5', eos: '1.5', hct: '37', mcv: '82', mch: '27', pbs: 'Neutrophilic leucocytosis with toxic granulation.' }),
    e('d5', D + 5 * H, 'RG2600000327', 'Tanvir Ahmed', 'M', '41 Y', [], [], { hb: '14.8' }),
    e('d6', 4 * D, 'RG2600000284', 'Farhana Akter', 'F', '26 Y', ['Hb ↓', 'MCV ↓', 'MCH ↓', 'RDW ↑', 'Platelet ↑'], ['Fix', 'MP'], { hb: '8.6', rbc: '4.0', plt: '480', neut: '60', lymph: '33', mono: '5', eos: '1.5', hct: '29', mcv: '68', mch: '21', mchc: '31.5', rdw: '17.1', mp: 'Not found any MP' }),
    e('d7', 6 * D, 'RG2600000219', 'Baby of Rokeya', 'F', '0 D', ['Platelet ↓'], [], { hb: '17.5', rbc: '5.1', tc: '12', plt: '120', neut: '45', lymph: '42.5', mono: '8', eos: '4', hct: '52', mcv: '104', mch: '34', rdw: '16' }),
  ];
}
