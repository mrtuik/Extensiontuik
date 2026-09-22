// Access lock — profile picker + a password per profile.
// NOTE: this is a soft lock (it keeps casual users out). The extension source is readable,
// so it is not real security. Passwords are stored only as SHA-256 hashes, never as text.

export const SESSION_HOURS = 12; // access stays open this long, or until profile menu → Log out

// name   : shown on the login screen (read-only there)
// hash   : SHA-256 of that profile's password
// avatar : illustrated avatar from lib/avatars.js — a1 … a10 (change it to swap the picture)
//
// To change a password, run this in any browser console and paste the result into `hash`:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('NEW PASSWORD')).then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
export const PROFILES = [
  { name: 'Tuik', hash: '77b95e204fc3ea2eeeb40aa243c844c8ea993dd6259131174d9c7e2aec756348', avatar: 'a7' },
  { name: 'Sagor Pandey', hash: 'cf58473877dc5de7325facd993804be4726d2acfcb921928d6c2614036131e19', avatar: 'a2' },
];

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
