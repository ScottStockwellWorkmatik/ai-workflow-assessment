/* Workmatik shared helpers, schema workmatik-shared-ids-2. See docs/shared-contract.md.
   Plain ES5 so every app can load it with one script tag. Nothing is sent anywhere;
   the organisation block is held in memory only and is cleared when the page closes. */
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

  // Nothing is stored in the browser. Any value saved by an earlier version is removed.
  try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
  var memory = { org: '', unit: '', by: '' };
  function current() { return memory; }
  function set(patch) {
    var c = memory, k;
    for (k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) c[k] = String(patch[k] == null ? '' : patch[k]); }
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
  var notes = [];
  function showNote(text) { notes.forEach(function (n) { n.textContent = text; n.hidden = !text; }); }
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
    var note = el('p', 'org-note'); note.setAttribute('aria-live', 'polite'); note.hidden = true; wrap.appendChild(note); notes.push(note);
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

  // Everything on the page is lost when it closes, so ask before leaving once work has been started.
  if (root.addEventListener) {
    root.addEventListener('beforeunload', function (e) {
      var c = memory;
      if (c.org || c.unit || c.by) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // Drag and drop. onDrop(files) is called with an array of File objects dropped anywhere on the page.
  // A full-page cue appears while a file is dragged over. Dropping outside a handler never opens the file in the browser.
  function enableDrop(onDrop, opts) {
    if (typeof document === 'undefined') return;
    var label = (opts && opts.label) || 'Drop your Workmatik file to load it';
    var depth = 0, cue = null;
    function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; if (!t) return false; for (var i = 0; i < t.length; i++) if (t[i] === 'Files') return true; return false; }
    function show() { if (!cue) { cue = document.createElement('div'); cue.className = 'wm-dropcue'; cue.setAttribute('aria-hidden', 'true'); cue.textContent = label; document.body.appendChild(cue); } }
    function hide() { depth = 0; if (cue && cue.parentNode) cue.parentNode.removeChild(cue); cue = null; }
    document.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; show(); });
    document.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    document.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; depth--; if (depth <= 0) hide(); });
    document.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return; e.preventDefault(); hide();
      var list = []; for (var i = 0; i < e.dataTransfer.files.length; i++) list.push(e.dataTransfer.files[i]);
      if (list.length) onDrop(list);
    });
  }

  // Work out what a file is from its contents, not its name. Resolves { file, kind, tool }.
  // kind: 'json' | 'xlsx' | 'other'. tool: the Tool key in the Workmatik data sheet, or a guess from the sheet names for older files.
  function identify(file) {
    return new Promise(function (resolve) {
      var base = { file: file, kind: 'other', tool: '' };
      if (/\.json$/i.test(file.name)) { base.kind = 'json'; base.tool = 'roles'; return resolve(base); }
      if (!/\.xlsx?$/i.test(file.name) || typeof XLSX === 'undefined') return resolve(base);
      var rd = new FileReader();
      rd.onerror = function () { resolve(base); };
      rd.onload = function () {
        try {
          var wb = XLSX.read(rd.result, { type: 'array' }), names = wb.SheetNames; base.kind = 'xlsx';
          var mw = wb.Sheets['Workmatik data'];
          if (mw) XLSX.utils.sheet_to_json(mw, { header: 1 }).forEach(function (r) { if (r[0] === 'Tool key' && !base.tool) base.tool = String(r[1] || ''); });
          if (!base.tool) {
            if (names.indexOf('Measures') >= 0 && names.indexOf('Rows') >= 0) base.tool = 'strategy';
            else if (names.indexOf('Selected activities') >= 0) base.tool = 'roles';
            else if (names.indexOf('Scoring') >= 0) base.tool = 'scoring';
          }
          base.sheets = names;
        } catch (e) {}
        resolve(base);
      };
      rd.readAsArrayBuffer(file);
    });
  }

  // Identify several files at once and return them in the order given by `order` (tool keys), unknown last.
  function identifyAll(files, order) {
    return Promise.all(files.map(identify)).then(function (items) {
      function rank(it) { var i = order.indexOf(it.tool); return i < 0 ? order.length : i; }
      return items.sort(function (a, b) { return rank(a) - rank(b); });
    });
  }

  // Hand-off between Workmatik tabs. All the tools share one web address, so a tool opened from another can ask the tab that
  // opened it for the organisation details. The details pass tab to tab in memory only: nothing is stored and nothing goes in the URL.
  var REQ = 'workmatik-context-request', RES = 'workmatik-context';
  function toolName() {
    var t = (typeof document !== 'undefined' && document.title) || 'the previous tool';
    return t.replace(/\s*[|–—-]\s*Workmatik.*$/i, '').replace(/^Workmatik\s*/i, '') || 'the previous tool';
  }
  function tidy(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
  function initHandoff() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    window.addEventListener('message', function (e) {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === REQ && e.source && e.source !== window) {
        var c = current();
        if (c.org || c.unit || c.by) e.source.postMessage({ type: RES, org: c.org, unit: c.unit, by: c.by, from: toolName() }, e.origin);
      } else if (e.data.type === RES && window.opener && e.source === window.opener) {
        var cur = current(), patch = {};
        ['org', 'unit', 'by'].forEach(function (k) { if (!cur[k] && typeof e.data[k] === 'string') patch[k] = tidy(e.data[k], 80); });
        if (Object.keys(patch).length) {
          set(patch);
          showNote('Organisation details brought over from ' + tidy(e.data.from || 'the previous tool', 60) + '. Change or clear them if they are not right.');
        }
      }
    });
    // Links to another Workmatik tool that open a new tab keep a line back to this tab, so the details can follow.
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var u; try { u = new URL(a.href, window.location.href); } catch (err) { return; }
      if (u.origin !== window.location.origin) return;
      e.preventDefault(); window.open(u.href, '_blank');
    }, true);
    if (window.opener && window.opener !== window) {
      try { window.opener.postMessage({ type: REQ }, window.location.origin); } catch (err) {}
    }
  }
  initHandoff();

  root.Workmatik = {
    SCHEMA: SCHEMA, clean: clean, same: same, today: today, get: current, set: set, onChange: onChange,
    fileName: fileName, metaRows: metaRows, fileContext: fileContext, check: check, prefillFrom: prefillFrom, requireOrg: requireOrg, renderOrgBlock: renderOrgBlock,
    enableDrop: enableDrop, identify: identify, identifyAll: identifyAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
