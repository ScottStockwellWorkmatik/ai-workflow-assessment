/* Workmatik shared helpers, schema workmatik-shared-ids-2. See docs/shared-contract.md.
   Plain ES5 so every app can load it with one script tag. Nothing is sent anywhere;
   the organisation block is remembered in this browser only. */
(function (root) {
  'use strict';

  var KEY = 'workmatik.context.v1';
  var SCHEMA = 'workmatik-shared-ids-2';
  var listeners = [];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // Letters and digits only; any other run of characters becomes one hyphen.
  function clean(s, max) {
    s = String(s == null ? '' : s).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s.slice(0, max || 40).replace(/-+$/, '');
  }
  function same(a, b) { return clean(a, 80).toLowerCase() === clean(b, 80).toLowerCase(); }

  function get() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (v && typeof v === 'object') return { org: String(v.org || ''), unit: String(v.unit || ''), by: String(v.by || '') };
    } catch (e) { /* storage blocked or corrupt: fall through */ }
    return { org: '', unit: '', by: '' };
  }
  var memory = null;
  function current() { return memory || (memory = get()); }
  function set(patch) {
    var c = current(), k;
    for (k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) c[k] = String(patch[k] == null ? '' : patch[k]); }
    memory = c;
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* keep in memory only */ }
    listeners.forEach(function (fn) { try { fn(c); } catch (e) { /* ignore listener errors */ } });
    return c;
  }
  function onChange(fn) { listeners.push(fn); }

  // File name: Organisation_BusinessUnit_toolkey_YYYY-MM-DD.ext (unit omitted when blank).
  function fileName(toolKey, ext) {
    var c = current(), parts = [clean(c.org) || 'Organisation'];
    if (clean(c.unit)) parts.push(clean(c.unit));
    parts.push(toolKey, today());
    return parts.join('_') + '.' + (ext || 'xlsx');
  }

  // Rows for the 'Workmatik data' sheet (Field and Value columns).
  function metaRows(tool, toolKey, dataVersion, extra) {
    var c = current();
    var rows = [['Field', 'Value'], ['Tool', tool], ['Tool key', toolKey], ['Data version', dataVersion], ['Schema', SCHEMA],
      ['Organisation', c.org], ['Business unit', c.unit], ['Prepared by', c.by], ['Exported', today()]];
    return extra ? rows.concat(extra) : rows;
  }

  // kv is an object of Field to Value read from a file's 'Workmatik data' sheet.
  function fileContext(kv) {
    kv = kv || {};
    return { org: String(kv['Organisation'] || ''), unit: String(kv['Business unit'] || ''), tool: String(kv['Tool key'] || ''), schema: String(kv['Schema'] || '') };
  }

  // Compare a file with what the user has entered. Never blocks; the caller shows the message.
  function check(kv) {
    var f = fileContext(kv), c = current(), notes = [];
    if (!c.org) return { ok: true, message: '' };
    if (f.org && !same(f.org, c.org)) notes.push('This file is for "' + f.org + '" but you are working on "' + c.org + '".');
    if (c.unit && f.unit && !same(f.unit, c.unit)) notes.push('This file is for business unit "' + f.unit + '" but you are working on "' + c.unit + '".');
    if (c.unit && !f.unit && f.org) notes.push('This file does not name a business unit.');
    return { ok: notes.length === 0, message: notes.join(' ') };
  }

  // Use a file's organisation to fill the block, only when the block is still empty.
  function prefillFrom(kv) {
    var f = fileContext(kv), c = current(), patch = {};
    if (!c.org && f.org) patch.org = f.org;
    if (!c.unit && f.unit) patch.unit = f.unit;
    if (patch.org || patch.unit) set(patch);
    return current();
  }

  // Call before any export or save. Stops with a clear message if the organisation is blank.
  function requireOrg() {
    if (current().org) return true;
    alert('Enter the organisation at the top of the page first, so the file is named and checked correctly.');
    var i = document.querySelector('.org-block input');
    if (i) i.focus();
    return false;
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // Draws the organisation block into host. Safe to call once per page.
  function renderOrgBlock(host) {
    if (!host) return;
    var c = current();
    host.className = (host.className ? host.className + ' ' : '') + 'org-block';
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'Organisation');
    var wrap = el('div', 'org-inner');
    var defs = [['org', 'Organisation', 'Required: the organisation these answers are for'], ['unit', 'Business unit or company', 'Optional'], ['by', 'Prepared by', 'Optional']];
    var inputs = {};
    defs.forEach(function (d) {
      var lab = el('label', 'org-field'), name = el('span', 'org-label', d[1]), inp = el('input');
      inp.type = 'text'; inp.value = c[d[0]]; inp.placeholder = d[2]; inp.autocomplete = 'off'; inp.maxLength = 80;
      inp.addEventListener('input', function () { var p = {}; p[d[0]] = inp.value; set(p); sync(); });
      lab.appendChild(name); lab.appendChild(inp); wrap.appendChild(lab); inputs[d[0]] = inp;
    });
    var chip = el('p', 'org-chip'); chip.setAttribute('aria-live', 'polite');
    wrap.appendChild(chip);
    host.appendChild(wrap);
    function sync() {
      var cur = current();
      ['org', 'unit', 'by'].forEach(function (k) { if (inputs[k].value !== cur[k]) inputs[k].value = cur[k]; });
      chip.textContent = cur.org ? 'File name starts: ' + fileName('tool').replace(/_tool_.*$/, '') : 'Enter the organisation so every file is named and checked the same way.';
      chip.className = 'org-chip' + (cur.org ? '' : ' org-missing');
    }
    onChange(sync);
    sync();
  }

  root.Workmatik = {
    SCHEMA: SCHEMA, clean: clean, same: same, today: today, get: current, set: set, onChange: onChange,
    fileName: fileName, metaRows: metaRows, fileContext: fileContext, check: check, prefillFrom: prefillFrom, requireOrg: requireOrg, renderOrgBlock: renderOrgBlock
  };
})(typeof window !== 'undefined' ? window : globalThis);
