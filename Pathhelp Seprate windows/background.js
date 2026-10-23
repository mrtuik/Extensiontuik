// Pathhelp background.
// Two ways to open the same UI (sidepanel.html), chosen in Setup → "Side panel mode" (saved as setup.sidePanel):
//   • Popup mode (default): toolbar icon / Alt+Z opens the popup.
//   • Side panel mode: the popup is switched off, so the toolbar icon / Alt+Z fires action.onClicked → we open the side panel.
// Alt+Z is the manifest command "_execute_action"; the browser turns it into an icon click.
const PANEL_PATH = 'sidepanel.html?mode=panel'; // ?mode=panel lets the page switch to the flexible side-panel layout
let last = 0;

async function isPanelMode() {
  try { const { setup } = await chrome.storage.local.get('setup'); return !!setup?.sidePanel; } catch (_) { return false; }
}

async function isWinMode() {
  try { const { setup } = await chrome.storage.local.get('setup'); return !!setup?.winMode && !setup?.sidePanel; } catch (_) { return false; }
}

// Separate-window mode (works on old Chrome without chrome.sidePanel): one small popup-type window, re-focused if already open.
let winId = null;
async function openWindow() {
  try { if (winId != null) { await chrome.windows.update(winId, { focused: true }); return; } } catch (_) { winId = null; }
  try {
    const w = await chrome.windows.create({ url: 'sidepanel.html?mode=window', type: 'popup', width: 420, height: 720 });
    winId = w.id;
  } catch (_) {}
}
chrome.windows.onRemoved.addListener((id) => { if (id === winId) winId = null; });

async function applyMode() {
  const panel = await isPanelMode();
  const win = await isWinMode();
  try { await chrome.action.setIcon({ path: win ? { 16: 'icons/mouse-16.png', 48: 'icons/mouse-48.png', 128: 'icons/mouse-128.png' } : { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' } }); } catch (_) {} // separate-windows mode has its own toolbar icon
  try { await chrome.action.setPopup({ popup: panel || win ? '' : 'sidepanel.html' }); } catch (_) {}
  try {
    if (chrome.sidePanel?.setOptions) await chrome.sidePanel.setOptions({ path: PANEL_PATH, enabled: panel });
    if (chrome.sidePanel?.setPanelBehavior) await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (_) {}
}

// setPopup is not remembered across browser restarts, so apply on every service-worker start too.
applyMode();
chrome.runtime.onInstalled.addListener(applyMode);
chrome.runtime.onStartup.addListener(applyMode);
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.setup) applyMode(); });

// Must run straight inside the click (no await before it) or Chrome refuses: sidePanel.open needs a user gesture.
function openPanel(windowId) {
  try {
    const p = chrome.sidePanel.open(windowId != null ? { windowId } : {});
    if (p && p.catch) p.catch(() => {});
  } catch (_) {}
}

// Only fires in side panel mode (in popup mode the icon opens the popup itself).
chrome.action.onClicked.addListener((tab) => {
  isWinMode().then((win) => { if (win) openWindow(); });
  if (!chrome.sidePanel) return;
  openPanel(tab?.windowId);
  // if the panel was already open, ask it to put the cursor in the PT box
  setTimeout(() => { try { chrome.runtime.sendMessage({ type: 'focusPt' }).catch(() => {}); } catch (_) {} }, 250);
});
