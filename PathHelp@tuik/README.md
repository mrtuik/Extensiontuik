# Pathhelp with tuik — v2.0.1

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → pick this folder.
2. Open the HMIS result-entry page, click the toolbar icon → side panel opens.

## Before real use
- **Host permission**: for now the extension runs on ALL pages (`<all_urls>`). Later, replace both entries (content_scripts.matches and host_permissions) with your HMIS domain, e.g. `https://hmis.yourhospital.org/*`.
- **Reference ranges** are the PRD seed (`lib/values.js`) and need pathologist sign-off.
- **Quotes**: add yours in `lib/quotes.js`.
- Templates: `lib/templates.js`. Engine + DC Fix: `lib/engine.js`.
- Fonts: JetBrains Mono is bundled in `fonts/` (works offline). Plus Jakarta Sans and Caveat (patient-name handwriting) load from Google Fonts (`sidepanel.html`); offline they fall back to system fonts.

## Access lock
- Login screen = profile picker → that profile's password. Access stays open for 12 hours (or until Log out in the profile menu).
- Profiles + password hashes: `lib/auth.js` (`PROFILES`). Passwords are stored only as SHA-256 hashes; the file explains how to change one.
- This is a soft lock, not real security — the extension source is readable.

## PT number search (v0.1.9)
- Sits in the patient card (also shown when no result-entry page is open). Date stepper (up = newer day, down = older day; today + previous 7 days, no "Today" text) · fixed `PT` · serial box · search button.
- Full number = `YYMMDD` + `PT` + serial, e.g. `261020PT12`. Serial is typed by hand (digits only, used exactly as typed).
- Enter / search button: the number goes into HMIS's "Patient ID (RG OR RequisitionNo OR Lab No)" box and HMIS's own change handler runs the search. The patient name/age/reg appear in the card once the page reloads (before that the card says "Search a patient").
- The search bar stays visible after a search (no edit step). Tapping the serial box selects the old number, so the next patient is: tap → type → tap outside. If HMIS already has a PT number loaded, the bar shows it.
- Last-used older date is remembered; the newest date follows the calendar (also after midnight). No result / slow response → message with Retry.
- Auto-search: after typing the serial, tap anywhere outside the box and it searches (Enter / search button still work). Stepping the date does not trigger it.
- Demo mode simulates HMIS: any serial finds the sample patient; serial `0` shows the "Patient not found" screen.

## Brandmark
- The app-window mark (same as the header logo) is now the extension icon: `icons/16|48|128.png`. It is what Chrome shows in the toolbar, the extensions page and the side-panel title bar, and on the login screen. After updating, Reload the extension on `chrome://extensions` (Chrome caches icons).

## Setup box + Submit card (v0.2.0)
- **Setup card** ("Setup your Extra" + Setup button) sits under the quote, full width like the MP / PBS cards → opens the Setup box. Options are saved on this device.
- **Confirm** (was "Auto confirm"; off by default): ticks the Confirm box of every result row when you search a patient, or when the panel first sees a patient page. Rows you untick afterwards stay unticked.
- **Add Atypical** (was "Auto Atypical Cell"; off by default): puts `..` in the Atypical Cell box if it is empty — on patient load, and again just before Submit.
- **Add MP** (off by default): on patient load, if the page has an MP row and it is empty, pastes your MP text (the saved MP template) into it. While Add MP is on, the MP row is skipped by **Confirm** (never auto-ticked); you can still tick it yourself from its icon or the confirm-all toggle. Existing MP text is never overwritten.
- **Platelet** is a cell in the LIS grid (type in it and the HMIS Platelet Result Value changes directly; 78 = 78,000 · 120 = 1.2 lakh).
- **Submit card** (icon + "Submit", bottom right, free space between it and the nav): presses the HMIS page's own Submit button. Disabled until a patient with result rows is open.
- The content script may now also write to the Atypical Cell and Platelet boxes, tick Confirm boxes, and press Submit — all only from these buttons/toggles.

## Keyboard focus (v1.3)
- The PT serial box takes the cursor as soon as the panel opens, and again right after a patient is submitted (when HMIS moves on, or after 2.5 s), so the next number can be typed straight away. If your browser refuses to raise the keyboard without a touch, tap the box once.

## Home layout (v1.3.5)
- The CBC / MP-PBS switcher is gone. One home page, top to bottom: patient card → quote + Setup → Malarial parasite (MP) → Peripheral blood smear (PBS) → LIS → DC counts.
- PT date: no dropdown. Tap the up icon for a newer day, the down icon (same icon, rotated) for an older one (limit: today … 7 days back).
- **LIS** (lasso icon): one outlined card with every CBC value in HMIS order — Hb, TC, RBC, Platelet, Neutrophil, Lymphocyte, Eosinophil, Monocyte, Basophil, Atypical, HCT, MCV, MCH, MCHC, RDW — two per row, each an editable input. Typing writes straight into the HMIS box (about 0.35 s after you stop). High / low values turn red with an arrow (same rules as before, from `lib/values.js`); an impossible value gets an amber warning.
- The Abnormal findings cards and the separate Platelet card are removed (Platelet is now a LIS cell; type 78 for 78,000).
- The content script may now write to all CBC value boxes (Hb … RDW), not only DC / Atypical / Platelet — only from the LIS inputs, DC Fix and the Setup options.

## Row inspector (v2.0.1)
- New outlined icon (compass-tool, square-ish corners, black) next to the profile avatar in the header opens a **Row inspector** page.
- **Scans automatically** — no tap needed. It re-scans by itself the moment a patient / page loads (same trigger Setup's auto options use), so the id list is already there when you open the page. A manual **Rescan** button is still there for after HMIS changes without a full page load.
- Scans the current HMIS tab for every *visible* element that has an id — not just CBC/DC rows, all of them (patient fields, buttons, result boxes, confirm boxes, whatever's on screen) — and lists each one as label (what's shown) on the left, its HMIS element id on the right.
- Tap any id to copy just that one; **Copy all** copies every row as `label` + tab + `id`, one per line, ready to paste into a spreadsheet or notes for later development.
- **Demo mode** now shows a sample list (10 example rows with plausible HMIS-style ids) instead of an empty note, with a small "Demo mode — sample rows" banner above it, so the page's look can be checked without a real HMIS tab.
- Engine: `inspectPage()` in `content.js` (walks `[id]`, skips hidden elements, derives each one's label from its own `<label for>`, aria-label, placeholder, or nearest text). Wiring: `inspectView()` / `onInspect()` / `autoInspect()` in `sidepanel.js`.

## Submit rocket animation (v2.0.1)
- Submit pill keeps its original arrow icon — no icon swap. Tap Submit → that same arrow launches like a rocket (flies up, rotates, fades, ~0.65s) while the tap goes through to HMIS as before.
- Plays in **Demo mode too**, so you can try it without touching a real HMIS page (Demo just skips the actual submit call, same as before).

## Platelet bump + Search a patient text removed (v2.0.1)
- **Platelet row** now has an auto icon next to it, same spot as the Neutrophil DC-fix icon. Tap it → **only if the current Platelet is 80–139**, it gets bumped up by a random 60–100 (added to whatever Platelet currently shows). Example: 80 → between 140 and 180. Below 80 (too abnormal) or already 140+ → nothing happens (toast says so on the manual tap).
- **Setup → Add Platelet**: new toggle below Add MP. When on, this same 80–139 bump runs once automatically when a patient loads (silently does nothing outside that range).
- **"Search a patient" placeholder text removed** from the patient card / search box header — the search fields show on their own now.

## LIS auto-fill of normal values (v2.0.1)
- **LIS button** is active when every CBC box (Hb … RDW, Atypical excluded) is blank. Tap → each box gets a random value inside the patient's normal range (age / sex from `lib/values.js`; ≥12 y = pathologist ranges MCV 77–93, MCH 27–32, MCHC 31–35, RDW 11–14).
- **HCT = Hb × 3** — Hb is picked so that HCT also lands inside its range. DC values are whole 2-digit numbers (eosinophil ≥ 01, basophil 00) that add up to exactly 100, so DC Fix has nothing left to do.
- **Tap again** → the boxes the button filled get new random values. Boxes you changed by hand (e.g. an abnormal Hb) are kept, and HCT follows your Hb. Filled boxes carry a small **auto** tag until edited.
- If some boxes already hold values (machine / typed) and none were filled by the button, it behaves as before (v1.3.6): fills blank HCT / MCV / MCH / MCHC by calculation only.
- Nothing is written unless you tap the button. Engine: `planLisFill` / `lisFillTargets` in `lib/engine.js`.

## Setup renames + Add MP, darker navy, smaller search card corners (v1.3.17)
- Setup: "Auto confirm" → **Confirm**, "Auto Atypical Cell" → **Add Atypical**, new third option **Add MP** (see Setup section). Saved setting keys are unchanged, so existing choices carry over. The `confirm` message takes `skip: [keys]` so Confirm can leave the MP row alone.
- Patient / search card: corners 14 px → 4 px, navy made darker (#060e27). "Search a patient" title is smaller (15 px).

## Split patient card, square search fields (v1.3.16)
- The patient card is now two parts: navy top (count, name, age / sex, reg no.) and a **white search strip** below it (date, PT serial, search button, hint / status line). The old divider line is gone — the colour change is the divider. The strip runs to the card edges and the card's rounded corners clip it.
- Date box, PT serial box and search button: corners 12 px / 8 px → 4 px. Fields are white with a grey outline (navy outline-free focus ring is dark grey); search button is navy with a white icon.
- Idle card (no page / patient yet) uses the same split, with "Search a patient" in the navy top.

## Navy search card, black not-confirm icons (v1.3.15)
- The dark patient / PT-search card is now navy dark blue (card, dividers, date + serial fields, hover, placeholder). Other dark surfaces (bottom-nav highlight, toast, login) stay near-black.
- PT search button: new `tab-search-rounded` icon, and a square-ish shape (8 px corners) instead of a circle.
- Not-confirm icon (`box-alert`) is black now, on the rows and on the confirm-all button. Confirm-all button corners 10 px → 4 px, neutral grey outline when not all confirmed (green when all are).

## Confirm-all toggle (v1.3.14)
- The "See Your LIS" row has a small toggle to the right of the LIS button. It confirms every row's Confirm box at once. When all rows are confirmed it shows the green check icon and tapping it un-confirms all; otherwise it shows the amber alert icon and tapping confirms all. Same page click as the per-row icons and Setup → Auto confirm (message `confirm` now takes `on`, default true, so Auto confirm is unchanged). Hidden when the page has no Confirm boxes. Demo mode works on the sample rows.

## Confirm icon in the LIS card (v1.3.13)
- Every LIS row (CBC values, MP, PBS, BT, CT …) has a small icon at the far right, after the unit: **box-check-outline** (green) = Confirm is ticked, **box-alert** (amber) = not confirmed. It mirrors that row's own Confirm checkbox on the HMIS page; tap it to tick / untick just that row. Rows without a Confirm box show no icon; a disabled box shows the icon dimmed and does nothing.
- Content script: the state now carries `confirm: { key: { on, locked } }`; new message `setConfirm { key, on }` clicks the row's checkbox (same click the Setup → Auto confirm uses). Change events on Confirm boxes refresh the panel.
- Demo mode: sample rows start with normal CBC rows confirmed and abnormal / MP / PBS / BT / CT not confirmed; Auto confirm in Demo ticks them all.
- Grid gets a 4th 24 px column (label column is ~28 px narrower).

## MP / PBS rows in LIS, time-style BT / CT (v1.3.12)
- The LIS card now has **MP** and **PBS** rows right after RDW (before the extra rows). They appear only when the HMIS page has those rows, and always in Demo mode. Same box as the MP / PBS cards, so applied text shows here and typing here writes to the page.
- MP / PBS and extra rows (BT, CT …) get a wider input (132 px, right edge unchanged). MP / PBS text is left-aligned with an ellipsis.
- If an extra row's value contains letters (e.g. "1 min 30 sec") its unit label is hidden. Demo BT = "1 min 30 sec", CT = "3 min 45 sec".

## Demo extra rows (v1.3.11)
- Demo mode now includes two sample extra rows (Bleeding Time, Clotting Time) under RDW so the feature can be seen without the real HMIS page. On the real page the extra rows come from whatever unknown test rows it has; MP / PBS keep their own cards at the top.

## Extra rows, coffee link, instant undo (v1.3.10)
- **Extra rows**: any other test row on the HMIS page that Pathhelp does not know by name (BT, CT …) now appears after RDW in the LIS card, in page order, as an editable box (unit is read from the row's unit label when the page has one). Found with the same row pattern as the known rows (`GD_TestName_lblTestName_*` + `txtResult_*`); read-only / disabled boxes are skipped. Typing writes to the page like any LIS box; nothing else ever writes to them. Keys are `x_<name>`.
- **Footer**: "Take a coffee for me." with a coffee icon; tap opens the Pay tab (4th nav button).
- **DC fix**: the new whole numbers and the undo icon now appear immediately after the fix (no waiting for the page to push its state back). Undo icon = undo3-filled.

## DC counts removed (v1.3.9)
- The **DC counts** section (N/L/M/E/B chips, Total, Fix, Undo) is gone. A plain text line "Coffee for me" sits in its place at the bottom of the home tab.
- The DC Fix (round DC to whole numbers, total 100) now lives in the **LIS card**: tap the cursor-button icon next to **Neutrophil**. It runs the same fix as before (same ±2 check dialog). After a fix, a small undo icon appears beside it. The icon is dimmed when the DC is already whole.

## LIS layout (v1.3.8)
- **See Your LIS** row and all LIS values (Hb, TC, RBC …) sit together in ONE outlined card, split by thin lines (not separate cards).
- See Your LIS icon = duotone box icon; the "Nothing blank to calculate" text is removed (the "Calculates …" hint still shows when something can be calculated).
- LIS button icon = lasso icon (was the magic-wand sparkles); button corner radius 10px (`.btn.lis-btn`).

## LIS rows + LIS button (v1.3.6)
- **LIS rows**: one compact row per value (label · value box · unit), Hb … RDW in HMIS order. DC counts are unchanged. Abnormal rows are red with an arrow.
- **See Your LIS card** (under the LIS heading, same style as MP / PBS): the **LIS** button fills only **blank** boxes, only by **calculation** from values already entered — HCT = Hb × 3; MCV = HCT×10 ÷ RBC; MCH = Hb×10 ÷ RBC; MCHC = Hb×100 ÷ HCT. MCV / MCHC use an HCT that was actually entered (never one the button estimated). Boxes it fills carry a small `calc` tag until you edit them. It never overwrites a typed value and never picks a value from a "normal" range. Disabled when nothing can be calculated.
- Independent of Setup → Auto confirm / Auto Atypical Cell (those are separate).
- **Ranges (≥12 y)**: MCV 77–93, MCH 27–32, MCHC 31–35, RDW 11–14 (pathologist). Under 12 y the age-specific ranges in `lib/values.js` still apply.
