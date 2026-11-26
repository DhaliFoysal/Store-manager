/**
 * Puts a scanned code into the text box the user last clicked.
 *
 *  • the focused text box / textarea wins;
 *  • if focus is on nothing / a button (e.g. the "Phone scanner" button), the LAST text box the user clicked is used;
 *  • single-line boxes are replaced with the code, textareas (serial lists) get the code on a new line;
 *  • boxes marked  data-scan-passthrough  (the POS scan box) are NOT filled – the page handles those scans itself;
 *  • number / password / date boxes, selects, checkboxes, disabled and read-only fields are never filled.
 *
 * Returns the scan with `filled: true|false`. Page listeners (useScanListener) skip scans that were filled.
 */
const TEXT_TYPES = new Set(['text', 'search', 'tel', 'email', 'url', '']);

let lastField = null;

export function isEditable(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return TEXT_TYPES.has((el.getAttribute('type') || '').toLowerCase());
  return false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => { if (isEditable(e.target)) lastField = e.target; }, true);
}

function pickTarget() {
  const a = document.activeElement;
  if (isEditable(a)) return a;
  const idle = !a || a === document.body || a.tagName === 'BUTTON';
  if (idle && lastField && lastField.isConnected && isEditable(lastField) && lastField.offsetParent !== null) return lastField;
  return null;
}

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true })); // makes React's onChange fire
}

export function deliverScan(scan) {
  const el = typeof document === 'undefined' ? null : pickTarget();
  if (!el || el.hasAttribute('data-scan-passthrough')) return { ...scan, filled: false };

  if (el.tagName === 'TEXTAREA') {
    const lines = el.value.split(/[\n,;\t]+/).map((s) => s.trim().toLowerCase());
    if (!lines.includes(scan.code.toLowerCase())) {
      const base = el.value.trimEnd();
      setNativeValue(el, `${base ? `${base}\n` : ''}${scan.code}`);
    }
  } else {
    setNativeValue(el, scan.code);
  }
  try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
  return { ...scan, filled: true };
}
