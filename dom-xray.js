/* =========================================================================
   dom-xray.js  –  drop-in browser SDK to deep-snapshot the current page
   Author: you                                License: MIT
   ======================================================================= */
const PERCY_URL = 'https://unpkg.com/@percy/dom/dist/percy-dom.min.js';

async function loadPercy() {
  if (window.PercyDOM) return;
  await import(/* @vite-ignore */ PERCY_URL);
}

function expandDetailsAndHidden() {
  // ⧉ open <details>…
  document.querySelectorAll('details:not([open])')
          .forEach(d => (d.open = true));
  // ⧉ reveal [hidden]
  document.querySelectorAll('[hidden]')
          .forEach(el => el.removeAttribute('hidden'));
}

/* ---- heuristically open ANY dropdown / pop-over / combobox ------------ */
async function expandDropdowns() {
  const selector =
    [
      'select',
      '[aria-haspopup]',
      '[role="combobox"]',
      '[role="menu"]',
      '[data-headlessui-state]',
      'button'
    ].join(',');
  const candidates = Array.from(document.querySelectorAll(selector));

  for (const el of candidates) {
    const tag = el.tagName.toLowerCase();

    if (tag === 'select') {
      // native <select>: show all options
      const sel = /** @type {HTMLSelectElement} */ (el);
      sel.size = Math.max(sel.options.length, 5);
      continue;
    }

    // Skip if already expanded
    if (el.getAttribute('aria-expanded') === 'true') continue;

    // Some libs require a mousedown; others click – fire both quickly
    ['mousedown', 'click'].forEach(type => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    });

    // Small delay so portals / animations finish
    await new Promise(r => setTimeout(r, 150));
  }
}

/* ---- main capture ----------------------------------------------------- */
export async function capture({ download = true } = {}) {
  expandDetailsAndHidden();
  await expandDropdowns();
  await loadPercy();

  // @percy/dom serialises CSSOM, canvas, form state, shadow DOM, …  
  const snapshot = window.PercyDOM
    ? window.PercyDOM.serialize(document)
    : document.documentElement.outerHTML;

  if (download) downloadJSON(snapshot, 'dom.json');
  return snapshot;
}

/* ---- helper: trigger a file download --------------------------------- */
function downloadJSON(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: filename, style: 'display:none'
  });
  document.body.append(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

/* ---- expose global API ----------------------------------------------- */
window.DOMXray = { capture };
export default window.DOMXray;
