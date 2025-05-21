(async () => {
  // ─── Helpers ────────────────────────────────────────────────────────────
  // Build a minimal unique selector for an element
  function getSelector(el) {
    let sel = el.tagName.toLowerCase();
    if (el.id) sel += `#${el.id}`;
    const cls = Array.from(el.classList).slice(0,2);          // take first two classes
    if (cls.length) sel += '.' + cls.join('.');
    return sel;
  }

  // Convert a DOM node to a structured object
  function nodeToObject(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      return t ? { type: 'text', content: t } : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node;
    const obj = {
      tag: el.tagName.toLowerCase(),
      attributes: {},
      children: []
    };
    for (const {name, value} of Array.from(el.attributes)) {
      obj.attributes[name] = value;
    }
    for (const child of Array.from(el.childNodes)) {
      const c = nodeToObject(child);
      if (c) obj.children.push(c);
    }
    return obj;
  }

  // Download JSON
  function downloadJSON(data, filename = 'dom.json') {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  // Reveal hidden elements and expand <details>
  function revealAll() {
    document.querySelectorAll('details:not([open])')
            .forEach(d => d.open = true);
    document.querySelectorAll('[hidden]')
            .forEach(el => el.removeAttribute('hidden'));
  }

  // Collapse everything back to base state
  function collapseAll(triggers) {
    document.querySelectorAll('details[open]')
            .forEach(d => d.open = false);
    document.querySelectorAll('select')
            .forEach(s => s.size = 1);
    triggers.forEach(el => {
      if (el.getAttribute('aria-expanded') === 'true') {
        ['mousedown','click'].forEach(evt =>
          el.dispatchEvent(new MouseEvent(evt, { bubbles: true }))
        );
      }
    });
  }

  // Heuristically open a set of triggers
  async function openCombo(triggers, indices) {
    for (const i of indices) {
      const el = triggers[i];
      if (!el) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') {
        el.size = Math.max(el.options.length, 5);
      } else if (el.getAttribute('aria-expanded') !== 'true') {
        ['mousedown','click'].forEach(evt =>
          el.dispatchEvent(new MouseEvent(evt, { bubbles: true }))
        );
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // ─── Phase 1: Discover DOM & triggers ────────────────────────────────────
  revealAll();
  const triggerEls = Array.from(
    document.querySelectorAll('select,[aria-haspopup],[role="combobox"],[role="menu"],button')
  );
  const triggers = triggerEls.map(getSelector);
  console.log(`Discovered ${triggers.length} dropdown/menu/button triggers:`, triggers);

  const baseTree = nodeToObject(document.documentElement);

  // ─── Phase 2: Build combinations (singles + pairs) ──────────────────────
  const combos = [];
  for (let i = 0; i < triggerEls.length; i++) {
    combos.push([i]);              // each single
    for (let j = i + 1; j < triggerEls.length; j++) {
      combos.push([i, j]);         // each pair
    }
  }

  // Warn if too many
  if (combos.length > 20) {
    console.warn(`🚨 ${combos.length} combos; you may want to reduce trigger count.`);
  }

  // ─── Phase 3: Run each combo & capture ──────────────────────────────────
  const runs = [];
  for (const combo of combos) {
    collapseAll(triggerEls);
    revealAll();
    await openCombo(triggerEls, combo);
    const tree = nodeToObject(document.documentElement);
    const comboSelectors = combo.map(i => triggers[i]);
    runs.push({ combo: comboSelectors, tree });
  }

  // ─── Phase 4: Download results ──────────────────────────────────────────
  const result = { base: baseTree, runs };
  downloadJSON(result, 'dom-permutations.json');
  console.log(`✅ Captured base + ${runs.length} permutations → dom-permutations.json`);
})();
