// Flat illustrated avatars (original artwork, generated as inline SVG — no image files).
// Pick one per profile with `avatar: 'a1'` … in lib/auth.js.

const SKIN = {
  peach: ['#f8b6a4', '#ea9884'],
  tan: ['#e8a882', '#d38c66'],
  brown: ['#bb7c58', '#a46747'],
  deep: ['#8c5c3e', '#764c32'],
};

const PRESETS = {
  a1: { bg: '#cfe3f7', skin: 'peach', hair: '#3b2b2b', style: 'long', shirt: '#7b97f2' },
  a2: { bg: '#fbe3b8', skin: 'peach', hair: '#3f2f2c', style: 'side', shirt: '#f08a6b' },
  a3: { bg: '#ddd6f5', skin: 'peach', hair: '#3d1f8a', style: 'long', shirt: '#f2b544' },
  a4: { bg: '#c8e7d6', skin: 'tan', hair: '#0f3f3f', style: 'short', shirt: '#5fae8e' },
  a5: { bg: '#ffd9e3', skin: 'peach', hair: '#b83232', style: 'bob', shirt: '#7b97f2' },
  a6: { bg: '#ffe2bc', skin: 'tan', hair: '#2a1b12', style: 'bun', shirt: '#e0709a' },
  a7: { bg: '#c8e7d6', skin: 'brown', hair: '#3a2416', style: 'cap', cap: '#2c7d6b', shirt: '#f2b544' },
  a8: { bg: '#ffd9e3', skin: 'peach', hair: '#6a3b2a', style: 'short', shirt: '#4b5fb8', glasses: true },
  a9: { bg: '#cfe3f7', skin: 'deep', hair: '#1d1512', style: 'curly', shirt: '#f08a6b' },
  a10: { bg: '#ddd6f5', skin: 'tan', hair: '#1f2a4d', style: 'side', shirt: '#e0709a' },
};

const back = (p) => {
  switch (p.style) {
    case 'long': return `<path d="M25 44C22 20 38 10 50 10c14 0 28 10 25 34 2 18 5 30 10 42H15c5-12 8-24 10-42z" fill="${p.hair}"/>`;
    case 'bob': return `<path d="M24 46C21 20 37 10 50 10c14 0 29 10 26 36 0 10-1 16-3 22H27c-2-6-3-12-3-22z" fill="${p.hair}"/>`;
    case 'bun': return `<circle cx="50" cy="12" r="9" fill="${p.hair}"/>`;
    case 'curly': return [[30, 32, 9], [40, 22, 10], [52, 18, 10], [64, 22, 10], [72, 32, 9], [26, 46, 7], [74, 46, 7]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.hair}"/>`).join('');
    default: return '';
  }
};

const front = (p) => {
  const h = p.hair;
  switch (p.style) {
    case 'long': return `<path d="M27 46C24 22 38 13 51 13c15 0 27 11 22 33-5-10-15-18-29-14-8 3-14 8-17 14z" fill="${h}"/>`;
    case 'bob': return `<path d="M27 46C24 22 38 13 51 13c15 0 27 11 22 33-4-9-13-16-25-15-9 1-17 6-21 15z" fill="${h}"/>`;
    case 'side': return `<path d="M27 46C22 24 36 13 52 13c16 0 27 13 21 33-2-8-7-14-15-16-9 6-21 5-31 16z" fill="${h}"/>`;
    case 'curly': return [[38, 27, 6], [50, 24, 6.5], [62, 27, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${h}"/>`).join('');
    case 'cap': return `<path d="M26 35C26 17 38 11 50 11s24 6 24 24z" fill="${p.cap}"/><path d="M27 34c12-5 34-5 46 0-12 4-34 4-46 0z" fill="${p.cap}" stroke="rgb(0 0 0 / .2)" stroke-width="1"/>`;
    default: return `<path d="M27 46C23 22 38 13 51 13c15 0 27 11 22 33-3-10-11-17-23-17-12 0-19 7-23 17z" fill="${h}"/>`; // short / bun
  }
};

/** @param {string} key preset name  @param {number} size px */
export function avatar(key, size = 48) {
  const p = PRESETS[key] || PRESETS.a1;
  const [skin, shade] = SKIN[p.skin];
  const ink = '#2b2233';
  const glasses = p.glasses ? `<g fill="none" stroke="${ink}" stroke-width="1.8"><circle cx="40" cy="47" r="6.4"/><circle cx="60" cy="47" r="6.4"/><path d="M46.4 47h7.2"/></g>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    <rect width="100" height="100" fill="${p.bg}"/>
    ${back(p)}
    <path d="M12 100c0-18 16-27 38-27s38 9 38 27z" fill="${p.shirt}"/>
    <rect x="42" y="58" width="16" height="20" rx="6" fill="${shade}"/>
    <circle cx="28" cy="46" r="4.8" fill="${skin}"/><circle cx="72" cy="46" r="4.8" fill="${skin}"/>
    <ellipse cx="50" cy="44" rx="22.5" ry="25" fill="${skin}"/>
    ${front(p)}
    <g stroke="${ink}" stroke-width="2" stroke-linecap="round" fill="none"><path d="M35 39q5-3 10-1"/><path d="M55 38q5-2 10 1"/></g>
    <circle cx="40" cy="47" r="2.5" fill="${ink}"/><circle cx="60" cy="47" r="2.5" fill="${ink}"/>
    ${glasses}
    <path d="M50 49q-3 6 1 7" stroke="${shade}" stroke-width="1.7" stroke-linecap="round" fill="none"/>
    <circle cx="35" cy="55" r="3.4" fill="#f27b7b" opacity=".3"/><circle cx="65" cy="55" r="3.4" fill="#f27b7b" opacity=".3"/>
    <path d="M42.5 59q7.5 7 15 0" stroke="#c2493d" stroke-width="2.3" stroke-linecap="round" fill="none"/>
  </svg>`;
  return `<span class="av" style="width:${size}px;height:${size}px">${svg}</span>`;
}

export const AVATAR_KEYS = Object.keys(PRESETS);
