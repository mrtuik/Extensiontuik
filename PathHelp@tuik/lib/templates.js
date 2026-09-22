// MP / PBS text templates — stored exactly as supplied (including "Plateletes" and the double space).
export const MP_NEGATIVE =
  'MALARIAL PARASITE NOT IDENTIFIED IN 100 OIL IMMERSION FIELD IN THE GIVEN SMEAR . MERE SLIDE NEGATIVITY DOES NOT RULE OUT INFECTIVITY .';

export const PBS_NORMAL = [
  'RBC : Mostly Normocytic  normochromic .No nucleated RBC seen.',
  'WBC : Total count within normal reference range. Differential count within normal range.',
  'No abnormal cell noted.',
  'Plateletes : Adequate in Smear.',
].join('\n');

// Result Value is a single-line input: line breaks become a single space.
export function toSingleLine(s) {
  return String(s).replace(/\s*[\r\n]+\s*/g, ' ').trim();
}
