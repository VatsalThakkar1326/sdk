(async () => {
  /* ═══════════════════════ CONFIG ═══════════════════════ */
  const MAX_ITER   = 1000;        // hard stop
  const WAIT_MS    = 200;         // settle time after each action
  const DOWNLOAD   = true;        // set false if you just want console JSON

  // Everything we consider an "interactive trigger"
  const TRIGGER_SEL = [
    'a[href]:not([download])',
    'button',
    'summary',                     // opens <details>
    'input:not([type="hidden" i]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
    '[aria-haspopup]',
    '[role~="button"],[role~="link"],[role~="menuitem"],[role~="checkbox"],[role~="switch"],[role~="radio"],[role~="combobox"]'
  ].join(',');

  /* ══════════════════════ STATE ════════════════════════ */
  const visitedControls = new WeakSet();  // elements already serialised
  const doneTriggers    = new WeakSet();  // triggers already acted on
  const queue           = [];             // triggers to act on
  const results         = [];             // final output array

  /* ════════════════  HELPER FUNCTIONS  ═════════════════ */

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function getLabel(el) {
    if (el.labels && el.labels[0]) return el.labels[0].innerText.trim();
    const aria = el.getAttribute('aria-label');
    return aria ? aria.trim() : null;
  }

  function serialise(el) {
    if (visitedControls.has(el)) return;
    visitedControls.add(el);

    const tag = el.tagName.toLowerCase();
    const obj = {
      tag,
      label: getLabel(el),
      innerText: ['button','select','summary'].includes(tag)
                 ? (el.innerText.trim() || null)
                 : null,
      required: el.required || el.hasAttribute('required') || false,
      attributes: Object.fromEntries(
        [...el.attributes].map(a => [a.name, a.value])
      )
    };
    results.push(obj);
  }

  /* -------- collect triggers & controls in any root ------ */
  function scanRoot(root) {
    root.querySelectorAll('input,select,textarea,button,summary').forEach(serialise);
    root.querySelectorAll(TRIGGER_SEL).forEach(el => {
      if (!doneTriggers.has(el)) queue.push(el);
    });
    // recurse into shadow roots
    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) scanRoot(el.shadowRoot);
    });
  }

  /* -------------- perform safest action for a trigger ------------- */
  async function act(el) {
    const tag  = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (tag === 'summary' && el.parentElement?.tagName.toLowerCase() === 'details') {
      el.parentElement.open = true;
    }
    else if (tag === 'details') {
      el.open = true;
    }
    else if (tag === 'select') {
      el.size = Math.max(el.options.length, 5);
    }
    else if (tag === 'a') {
      // only click same-origin or hash links to avoid navigation
      const url = new URL(el.href, location.href);
      if (url.origin === location.origin) el.click();
    }
    else if (type === 'checkbox' || type === 'radio') {
      el.checked = !el.checked;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    else if (tag === 'input' && !type) {          // text input
      el.focus();
      el.value = 'test';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    else {
      ['mousedown','click'].forEach(evt =>
        el.dispatchEvent(new MouseEvent(evt, { bubbles: true }))
      );
    }
    await sleep(WAIT_MS);
  }

  /* ═══════════════ INITIAL REVEAL & SCAN ═══════════════ */
  document.querySelectorAll('details:not([open])').forEach(d => d.open = true);
  document.querySelectorAll('[hidden]').forEach(el => el.removeAttribute('hidden'));
  scanRoot(document);

  /* ══════════════════ MUTATION OBSERVER ════════════════ */
  const observer = new MutationObserver(ms => {
    ms.forEach(m => {
      if (m.addedNodes) m.addedNodes.forEach(node => {
        if (node.nodeType === 1) {          // element
          scanRoot(node);
          if (node.shadowRoot) scanRoot(node.shadowRoot);
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  /* ═════════════════════ MAIN LOOP ═════════════════════ */
  let iterations = 0;
  while (queue.length && iterations < MAX_ITER) {
    const trig = queue.shift();
    if (!trig.isConnected || doneTriggers.has(trig)) { iterations++; continue; }
    doneTriggers.add(trig);
    await act(trig);
    // any new elements/portals are caught by MutationObserver
    iterations++;
  }
  observer.disconnect();

  /* ═══════════════════ DOWNLOAD RESULT ═════════════════ */
  const json = JSON.stringify(results, null, 2);
  if (DOWNLOAD) {
    const blob = new Blob([json], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'dom.json',
      style: 'display:none'
    });
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
    console.log(`✅ Harvested ${results.length} controls; dom.json downloaded.`);
  } else {
    console.log(results);
  }
})();
