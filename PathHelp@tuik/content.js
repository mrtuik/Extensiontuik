// Pathhelp content script — runs on the HMIS result-entry page.
// Reads patient header + Result Value inputs. Writes ONLY to whitelisted Result Value inputs (from the LIS grid, DC Fix, MP/PBS and Setup),
// plus these explicit actions: tick the row "Confirm" boxes (all at once from Setup, or one row at a time from the LIS card icon), and press Submit.
(() => {
  if (window.__pathhelpLoaded) return;
  window.__pathhelpLoaded = true;

  // Set when this page load is the result of a Pathhelp PT search (survives the ASP.NET postback via sessionStorage).
  const SEARCH_KEY = '__pathhelpSearch';
  let searchedFor = '';
  try {
    searchedFor = sessionStorage.getItem(SEARCH_KEY) || '';
    sessionStorage.removeItem(SEARCH_KEY);
  } catch (_) {}
  let searchLock = false; // true while a search postback is in flight: old-page states must not leak out

  // Rows the extension is allowed to write to (every CBC value Hb … RDW, PBS, MP, plus the extra rows typed in the LIS card). Nothing else is ever modified.
  const WRITABLE = new Set(['hb', 'tc', 'rbc', 'plt', 'neut', 'lymph', 'eos', 'mono', 'baso', 'atyp', 'hct', 'mcv', 'mch', 'mchc', 'rdw', 'pbs', 'mp']);

  function keyFor(rawName) {
    const n = (rawName || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!n) return null;
    if (n === 'pbs') return 'pbs';
    if (/^mp\b/.test(n) || n.includes('malarial')) return 'mp';
    if (/h(a)?emoglobin/.test(n)) return 'hb';
    if (/\bwbc\b|\(tc\)/.test(n)) return 'tc';
    if (/\brbc\b/.test(n)) return 'rbc';
    if (n.includes('platelet')) return 'plt';
    if (n.includes('neutrophil')) return 'neut';
    if (n.includes('lymphocyte')) return 'lymph';
    if (n.includes('eosinophil')) return 'eos';
    if (n.includes('monocyte')) return 'mono';
    if (n.includes('basophil')) return 'baso';
    if (n.includes('atypical')) return 'atyp';
    if (n === 'hct' || /h(a)?ematocrit|^pcv\b/.test(n)) return 'hct';
    if (/^mchc\b/.test(n)) return 'mchc';
    if (/^mch\b/.test(n)) return 'mch';
    if (/^mcv\b/.test(n)) return 'mcv';
    if (/^rdw/.test(n)) return 'rdw';
    return null;
  }

  // Map rows by test NAME (never by row index).
  function findRows(withExtras) {
    const rows = {};
    document.querySelectorAll('[id*="GD_TestName_lblTestName_"]').forEach((lbl) => {
      const key = keyFor(lbl.textContent);
      if (!key || rows[key]) return;
      const input = document.getElementById(lbl.id.replace('lblTestName', 'txtResult'));
      if (input && input.tagName === 'INPUT' && input.type === 'text') rows[key] = input;
    });
    if (withExtras) for (const x of findExtras()) rows[x.key] = x.input;
    return rows;
  }

  // Extra rows: any other test row on the page that the app does not know by name (BT, CT …).
  // Same row pattern as the known rows (name label + result box); shown after RDW in the LIS card, typed by the technician only.
  const isExtraKey = (k) => /^x_/.test(k || '');
  function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'row';
  }
  function findExtras() {
    const list = [];
    const used = {};
    document.querySelectorAll('[id*="GD_TestName_lblTestName_"]').forEach((lbl) => {
      const name = (lbl.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name || keyFor(name)) return;
      const input = document.getElementById(lbl.id.replace('lblTestName', 'txtResult'));
      if (!input) return;
      const okType = (input.tagName === 'INPUT' && input.type === 'text') || input.tagName === 'TEXTAREA';
      if (!okType || input.disabled || input.readOnly) return;
      const base = 'x_' + slug(name);
      let key = base;
      let n = 2;
      while (used[key]) key = base + '_' + n++;
      used[key] = 1;
      const unitEl = document.getElementById(lbl.id.replace('lblTestName', 'lblUnit'));
      list.push({ key, label: name, unit: (unitEl?.textContent || '').replace(/\s+/g, ' ').trim(), input, box: confirmBoxOf(lbl) });
    });
    return list;
  }

  // The row's own "Confirm" checkbox (same row suffix as the name label).
  function confirmBoxOf(lbl) {
    const b = document.getElementById(lbl.id.replace('lblTestName', 'cbIsConfirm'));
    return b && b.tagName === 'INPUT' && b.type === 'checkbox' ? b : null;
  }
  // key → Confirm checkbox, for every row findRows(true) knows (same row-picking rules, so a key always means the same row).
  function findBoxes() {
    const boxes = {};
    const seen = {};
    document.querySelectorAll('[id*="GD_TestName_lblTestName_"]').forEach((lbl) => {
      const key = keyFor(lbl.textContent);
      if (!key || seen[key]) return;
      const input = document.getElementById(lbl.id.replace('lblTestName', 'txtResult'));
      if (!(input && input.tagName === 'INPUT' && input.type === 'text')) return;
      seen[key] = 1;
      const box = confirmBoxOf(lbl);
      if (box) boxes[key] = box;
    });
    for (const x of findExtras()) if (x.box) boxes[x.key] = x.box;
    return boxes;
  }

  const text = (sel) => (document.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim();

  function readState() {
    const rows = findRows();
    const regEl = document.querySelector('[id$="_txtPatientID"]');
    // Not a result-entry page (runs on every page for now) → nothing to report.
    if (!Object.keys(rows).length && !regEl) return null;
    const values = {};
    for (const k in rows) values[k] = rows[k].value;
    const extras = findExtras().map((x) => ({ key: x.key, label: x.label, unit: x.unit, value: x.input.value }));
    const confirm = {};
    for (const [k, b] of Object.entries(findBoxes())) confirm[k] = { on: b.checked, locked: b.disabled };
    return {
      page: true,
      patient: {
        name: text('[id$="_lblName"]'),
        reg: (regEl?.value || '').trim(),
        gender: text('[id$="_lblGender"]'),
        age: text('[id$="_lblAge"]'),
      },
      values,
      extras,
      confirm,
      canSubmit: !!document.querySelector('[id$="_btnSubmit"]'),
      searchedFor,
      search: (document.querySelector('[id$="_txtRGORRequisitionNo"]')?.value || '').trim(),
    };
  }

  let lastSent = '';
  let timer = null;
  function push(force) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (searchLock) return;
      try {
        const state = readState();
        const s = JSON.stringify(state);
        if (!force && s === lastSent) return;
        lastSent = s;
        chrome.runtime.sendMessage({ type: 'state', state }).catch(() => {});
      } catch (_) {
        /* extension reloaded — ignore */
      }
    }, 120);
  }

  function setValue(input, value) {
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    // ASP.NET picks the value up from the DOM on submit; events keep any page scripts in sync.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function applyWrites(updates) {
    const rows = findRows(true);
    const out = { written: [], pending: [], skipped: [] };
    for (const u of updates || []) {
      const input = rows[u.key];
      if ((!WRITABLE.has(u.key) && !isExtraKey(u.key)) || !input || input.disabled || input.readOnly) {
        out.skipped.push(u.key);
        continue;
      }
      const value = String(u.value ?? '');
      if (document.activeElement === input) {
        // Technician is typing here: wait until they leave the field, then write.
        out.pending.push(u.key);
        input.addEventListener(
          'blur',
          () => {
            setValue(input, value);
            push(true);
          },
          { once: true }
        );
      } else {
        setValue(input, value);
        out.written.push(u.key);
      }
    }
    push(true);
    return out;
  }

  // PT search: put the full number in HMIS's "Patient ID (RG OR RequisitionNo OR Lab No)" box.
  // Its own onchange handler then posts the form back — exactly what a technician's manual search does.
  function doSearch(value) {
    const input = document.querySelector('[id$="_txtRGORRequisitionNo"]');
    if (!input || input.disabled || input.readOnly) return { ok: false, error: 'no-field' };
    const v = String(value || '').trim().toUpperCase();
    if (!/^\d{6}PT\d+$/.test(v)) return { ok: false, error: 'bad-format' };
    try { sessionStorage.setItem(SEARCH_KEY, v); } catch (_) {}
    searchLock = true;
    setTimeout(() => { searchLock = false; push(true); }, 15000); // postback never happened → resume normal updates
    setValue(input, v);
    return { ok: true };
  }

  // Setup → Confirm and the LIS "confirm all" toggle: tick (on) or untick (!on) the "Confirm" box of every result row (boxes already in that state are left alone).
  // skip = row keys (e.g. ['mp']) whose box is never touched by this call.
  function confirmAll(on = true, skip = []) {
    const enabled = [...document.querySelectorAll('input[type="checkbox"][id*="GD_TestName_cbIsConfirm_"]')].filter((b) => !b.disabled);
    const named = skip && skip.length ? findBoxes() : {};
    const skipBoxes = new Set((skip || []).map((k) => named[k]).filter(Boolean));
    const boxes = enabled.filter((b) => !skipBoxes.has(b));
    let ticked = 0;
    for (const b of boxes) if (b.checked !== on) { b.click(); ticked++; }
    const head = document.querySelector('input[type="checkbox"][id$="GD_TestName_checkAll"]');
    if (head && enabled.length) head.checked = enabled.every((b) => b.checked);
    push(true);
    return { ok: boxes.length > 0, total: boxes.length, ticked, on };
  }

  // LIS card icon: tick / untick ONE row's Confirm box (exactly like a tap on the page).
  function setConfirm(key, on) {
    const box = findBoxes()[key];
    if (!box || box.disabled) return { ok: false, error: 'no-box' };
    if (box.checked !== !!on) box.click();
    push(true);
    return { ok: true, on: box.checked };
  }

  // Submit card: press HMIS's own Submit button (exactly like a tap on the page).
  function doSubmit() {
    const btn = document.querySelector('[id$="_btnSubmit"]');
    if (!btn || btn.disabled) return { ok: false, error: 'no-button' };
    btn.click();
    return { ok: true };
  }

  // ───── Row inspector (v2.0.1): dumps every visible, labelled element's id on the page — not just CBC/DC rows — so future features can be built against real HMIS ids without guessing.
  function visible(el) {
    if (!(el instanceof Element)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function ownText(el) {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.replace(/\s+/g, ' ').trim();
  }
  function labelFor(el) {
    if (el.id) {
      const lab = document.querySelector(`label[for="${(window.CSS && CSS.escape) ? CSS.escape(el.id) : el.id}"]`);
      if (lab) { const t = (lab.textContent || '').replace(/\s+/g, ' ').trim(); if (t) return t; }
    }
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();
    let sib = el.previousElementSibling;
    while (sib) {
      const t = ownText(sib) || (sib.children.length ? '' : (sib.textContent || '').replace(/\s+/g, ' ').trim());
      if (t) return t.length > 70 ? t.slice(0, 70) + '…' : t;
      sib = sib.previousElementSibling;
    }
    const own = ownText(el);
    return own ? (own.length > 70 ? own.slice(0, 70) + '…' : own) : '';
  }
  function inspectPage() {
    const seen = new Set();
    const rows = [];
    document.querySelectorAll('[id]').forEach((el) => {
      const id = (el.id || '').trim();
      if (!id || seen.has(id) || !visible(el)) return;
      const tag = el.tagName.toLowerCase();
      const isField = tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button' || tag === 'a';
      const label = labelFor(el);
      if (!isField && !label) return; // skip bare layout containers with nothing to show
      seen.add(id);
      rows.push({ id, label: label || '(no label found)', tag, value: 'value' in el ? String(el.value ?? '').slice(0, 60) : '' });
    });
    return rows;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'confirm') {
      sendResponse(confirmAll(msg.on !== false, Array.isArray(msg.skip) ? msg.skip : []));
    } else if (msg?.type === 'setConfirm') {
      sendResponse(setConfirm(msg.key, msg.on));
    } else if (msg?.type === 'submit') {
      sendResponse(doSubmit());
    } else if (msg?.type === 'search') {
      sendResponse(doSearch(msg.value));
    } else if (msg?.type === 'getState') {
      sendResponse({ state: readState() });
    } else if (msg?.type === 'write') {
      sendResponse(applyWrites(msg.updates));
    } else if (msg?.type === 'inspect') {
      sendResponse({ ok: true, page: !!document.querySelector('[id*="GD_TestName_lblTestName_"], [id$="_txtPatientID"]'), rows: inspectPage() });
    }
  });

  const onEdit = (e) => {
    if (e.target?.id && (e.target.id.includes('txtResult') || e.target.id.includes('cbIsConfirm'))) push();
  };
  document.addEventListener('input', onEdit, true);
  document.addEventListener('change', onEdit, true);
  new MutationObserver(() => push()).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  push(true); // initial state on load / after every ASP.NET postback
})();
