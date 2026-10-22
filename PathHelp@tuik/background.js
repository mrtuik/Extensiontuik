// Opens the Pathhelp popup when the HMIS page asks for it (after Submit).
// The keyboard shortcut (Alt+Z) is handled by the browser itself through manifest "commands" → _execute_action.
let last = 0;
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'openPopup') return;
  const now = Date.now();
  if (now - last < 4000) return; // one open per submit
  last = now;
  try {
    const p = chrome.action.openPopup(sender?.tab?.windowId != null ? { windowId: sender.tab.windowId } : undefined);
    if (p && p.catch) p.catch(() => {}); // not supported / no focused window → just do nothing
  } catch (_) {}
});
