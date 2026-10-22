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

async function applyMode() {
  const panel = await isPanelMode();
  try { await chrome.action.setPopup({ popup: panel ? '' : 'sidepanel.html' }); } catch (_) {}
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
  openPanel(tab?.windowId);
  // if the panel was already open, ask it to put the cursor in the PT box
  setTimeout(() => { try { chrome.runtime.sendMessage({ type: 'focusPt' }).catch(() => {}); } catch (_) {} }, 250);
});

// "Open after Submit": the HMIS page asks us to bring Pathhelp back.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'openPopup') return;
  const now = Date.now();
  if (now - last < 4000) return; // one open per submit
  last = now;
  const windowId = sender?.tab?.windowId;
  isPanelMode().then((panel) => {
    if (panel) {
      openPanel(windowId); // no-op when already open (it stays open between patients)
      try { chrome.runtime.sendMessage({ type: 'focusPt' }).catch(() => {}); } catch (_) {}
      return;
    }
    try {
      const p = chrome.action.openPopup(windowId != null ? { windowId } : undefined);
      if (p && p.catch) p.catch(() => {}); // not supported / no focused window → just do nothing
    } catch (_) {}
  });
});
