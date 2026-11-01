(function () {
  'use strict';
  var FW = null;
  var CAT = null, ACT = {}, ROLEBYID = {}, CUSTCAT = { roles: [], acts: [] }, lastRole = {};
  var state = { off: {}, stepsOff: {}, custom: [], extra: {}, roles: null, scores: {}, tiers: {}, notes: {}, filter: 'all' };
  var CLS = ['Full automation', 'Augmentation', 'Human only'];
  var openSet = {};
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function fmt(n) { return n == null ? '–' : round1(n).toFixed(1); }

  // Logo fallback if the file is missing
  (function () {
    var img = $('logoScreen'); if (!img) return;
    function swap() { var w = el('p', 'logo wordmark', 'Workmatik'); if (img.parentNode) img.parentNode.replaceChild(w, img); }
    if (img.complete && img.naturalWidth === 0) swap(); else img.addEventListener('error', swap);
  })();

  function getJson(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  Promise.all([getJson('data/framework.json?v=2'), getJson('data/roles.json?v=2')])
    .then(function (d) { FW = d[0]; CAT = d[1]; prep(); init(); })
    .catch(function () { var e = $('loadError'); e.textContent = 'The framework data could not be loaded. If you opened this file directly from your computer, use the published web address instead.'; e.hidden = false; });

  // ---------- catalogue (roles and activities shared with the AI Roles Assessment)
  function mkStep(aid) { var a = ACT[aid]; return a ? { aid: aid, role: a.role, activity: a.activity, cls: a.cls } : null; }
  function rebuildCat() {
    ACT = {}; ROLEBYID = {};
    CAT.roles.forEach(function (r) { ROLEBYID[r.id] = { id: r.id, name: r.name, group: '', custom: false }; });
    CAT.groups.forEach(function (g) { g.roles.forEach(function (n) { CAT.roles.forEach(function (r) { if (r.name === n) ROLEBYID[r.id].group = g.group; }); }); });
    CUSTCAT.roles.forEach(function (r) { ROLEBYID[r.rid] = { id: r.rid, name: r.name, group: r.group, custom: true }; });
    CAT.activities.forEach(function (a) { var r = ROLEBYID[a[1]]; ACT[a[0]] = { id: a[0], rid: a[1], task: a[2], activity: a[3], cls: a[4], role: r ? r.name : '' }; });
    CUSTCAT.acts.forEach(function (a) { var r = ROLEBYID[a.rid]; if (r) ACT[a.id] = { id: a.id, rid: a.rid, task: a.task, activity: a.activity, cls: a.cls, role: r.name, custom: true }; });
  }
  function prep() {
    rebuildCat();
    FW.workflows.forEach(function (w) { w.steps = w.steps.map(function (a) { return mkStep(a); }).filter(Boolean); });
  }
  function cleanStr(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
  function setCustomCat(c) {
    var out = { roles: [], acts: [] }, names = {};
    CAT.roles.forEach(function (r) { names[r.name.toLowerCase()] = 1; });
    var groups = FW.groups;
    if (c && Array.isArray(c.roles)) {
      c.roles.forEach(function (r) {
        var rid = cleanStr(r.rid, 8), name = cleanStr(r.name, 80), group = cleanStr(r.group, 60);
        if (!/^RC\d+$/.test(rid) || !name || groups.indexOf(group) < 0 || names[name.toLowerCase()]) return;
        names[name.toLowerCase()] = 1; out.roles.push({ rid: rid, name: name, group: group });
      });
      (Array.isArray(c.acts) ? c.acts : []).forEach(function (a) {
        var id = cleanStr(a.id, 8), rid = cleanStr(a.rid, 8), task = cleanStr(a.task, 100), act = cleanStr(a.activity, 160), cl = cleanStr(a.cls, 30);
        var known = CAT.roles.some(function (r) { return r.id === rid; }) || out.roles.some(function (r) { return r.rid === rid; });
        if (!/^AC\d+$/.test(id) || !known || !task || !act || CLS.indexOf(cl) < 0) return;
        out.acts.push({ id: id, rid: rid, task: task, activity: act, cls: cl });
      });
    }
    CUSTCAT = out; rebuildCat();
  }
  function normId(id) { id = String(id || '').trim(); var m = /^W(\d{2})$/.exec(id); if (m) return 'WF' + m[1]; m = /^C(\d{2,})$/.exec(id); if (m) return 'WFC' + m[1]; return id; }

  // ---------- data helpers
  function stepsOf(w) { return w.custom ? w.steps : w.steps.concat(state.extra[w.id] || []); }
  function editArr(w) { return w.custom ? w.steps : (state.extra[w.id] = state.extra[w.id] || []); }
  function baseLen(w) { return w.custom ? 0 : w.steps.length; }
  function stepCls(st) { var o = st.aid && state.roles && state.roles.ovr[st.aid]; return o || st.cls || ''; }
  function inScope(st) { return !state.roles || !st.aid || !!state.roles.scope[st.aid]; }
  function allWf() { return FW.workflows.concat(state.custom); }
  function wfById(id) { return allWf().filter(function (w) { return w.id === id; })[0]; }
  function included(w) { return !state.off[w.id]; }
  function tierOf(w) { return state.tiers[w.id] || w.tier || 'minimal'; }
  function tierName(id) { return FW.tiers.filter(function (t) { return t.id === id; })[0].name; }
  function stepOn(w, i) { return !(state.stepsOff[w.id] && state.stepsOff[w.id][i]); }
  function quadById(id) { return FW.quadrants.filter(function (q) { return q.id === id; })[0]; }
  function thr() {
    var v = parseFloat($('thrValue').value), f = parseFloat($('thrFeas').value);
    return { v: isNaN(v) ? FW.thresholds.value : v, f: isNaN(f) ? FW.thresholds.feasibility : f };
  }
  function avg(sc, ids) {
    var t = 0; for (var i = 0; i < ids.length; i++) { if (!(sc[ids[i]] >= 1)) return null; t += sc[ids[i]]; }
    return t / ids.length;
  }
  function suitability(w) {
    var fa = 0, au = 0, ho = 0, un = 0, n = 0;
    stepsOf(w).forEach(function (s, i) {
      if (!stepOn(w, i)) return; n++; var c = stepCls(s);
      if (c === 'Full automation') fa++; else if (c === 'Augmentation') au++; else if (c === 'Human only') ho++; else un++;
    });
    var cl = fa + au + ho;
    return { fa: fa, au: au, ho: ho, un: un, n: n, pct: cl ? Math.round((fa + au) / cl * 100) : null };
  }
  function calcWf(w, t) {
    var sc = state.scores[w.id] || {};
    var v = avg(sc, ['V1', 'V2']), f = avg(sc, ['F1', 'F2', 'F3']), r = avg(sc, ['R1', 'R2']);
    var answered = FW.questions.filter(function (q) { return sc[q.id] >= 1; }).length;
    var out = { w: w, v: v, f: f, r: r, answered: answered, complete: answered === FW.questions.length, tier: tierOf(w), sc: sc };
    if (out.complete) {
      out.priority = Math.round(v * f / 25 * 100 * (1 - 0.1 * (r - 1)));
      out.quad = out.tier === 'prohibited' ? 'prohibited' : (v > t.v && f > t.f) ? 'start' : (v > t.v) ? 'prepare' : (f > t.f) ? 'quick' : 'park';
    }
    return out;
  }
  function calcAll() {
    var t = thr();
    var rows = allWf().filter(included).map(function (w) { return calcWf(w, t); });
    var ranked = rows.filter(function (x) { return x.complete && x.tier !== 'prohibited'; }).sort(function (a, b) {
      return (b.priority - a.priority) || ((b.v * b.f) - (a.v * a.f)) || a.w.name.localeCompare(b.w.name);
    });
    ranked.forEach(function (x, i) { x.rank = i + 1; });
    return { rows: rows, ranked: ranked, t: t, scored: rows.filter(function (x) { return x.complete; }) };
  }
  function capHints(x) {
    var sc = x.sc, C = FW.capabilities, out = [];
    function add(k) { var c = C[k]; if (!out.some(function (o) { return o[0] === c[0]; })) out.push(c); }
    if (sc.F1 <= 2) add('F1');
    if (sc.F2 <= 2) add('F2');
    if (sc.F3 <= 2) add('F3');
    if (sc.R1 >= 4 || sc.R2 >= 4 || x.tier === 'limited' || x.tier === 'high') { add('R'); add('R2'); }
    if (sc.R1 >= 3) add('H');
    return out;
  }

  // ---------- tab 1: workflows
  function removeStep(w, idx) {
    var arr = editArr(w), k = idx - baseLen(w); if (k < 0 || k >= arr.length) return;
    arr.splice(k, 1);
    var old = state.stepsOff[w.id] || {}, nu = {};
    Object.keys(old).forEach(function (key) { var j = +key; if (j < idx) nu[j] = true; else if (j > idx) nu[j - 1] = true; });
    state.stepsOff[w.id] = nu;
  }
  function roleSelect(cls, withBlank) {
    var sel = el('select', cls);
    if (withBlank) { var o0 = el('option', null, 'Choose a role'); o0.value = ''; sel.appendChild(o0); }
    FW.groups.forEach(function (g) {
      var og = el('optgroup'); og.label = g;
      Object.keys(ROLEBYID).map(function (k) { return ROLEBYID[k]; }).filter(function (r) { return r.group === g; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); })
        .forEach(function (r) { var o = el('option', null, r.name + (r.custom ? ' (custom)' : '')); o.value = r.id; og.appendChild(o); });
      if (og.children.length) sel.appendChild(og);
    });
    return sel;
  }
  function fillActs(sel, rid) {
    sel.textContent = '';
    var o0 = el('option', null, rid ? 'Choose an activity' : 'Choose a role first'); o0.value = ''; sel.appendChild(o0);
    if (!rid) return;
    var tasks = {}, order = [];
    Object.keys(ACT).map(function (k) { return ACT[k]; }).filter(function (a) { return a.rid === rid; }).forEach(function (a) { if (!tasks[a.task]) { tasks[a.task] = []; order.push(a.task); } tasks[a.task].push(a); });
    order.forEach(function (t) { var og = el('optgroup'); og.label = t; tasks[t].forEach(function (a) { var o = el('option', null, a.activity); o.value = a.id; og.appendChild(o); }); sel.appendChild(og); });
  }
  function addStepForm(w) {
    var f = el('div', 'addstep'); f.appendChild(el('p', 'grp', 'Add a step'));
    var row = el('div', 'addstep-row');
    var rs = roleSelect('', true); rs.setAttribute('aria-label', 'Role for the new step'); var as = el('select'); as.setAttribute('aria-label', 'Activity for the new step'); fillActs(as, '');
    if (lastRole[w.id]) { rs.value = lastRole[w.id]; fillActs(as, rs.value); }
    rs.addEventListener('change', function () { lastRole[w.id] = rs.value; fillActs(as, rs.value); });
    var tx = el('input'); tx.type = 'text'; tx.maxLength = 100; tx.placeholder = 'or type your own step'; tx.setAttribute('aria-label', 'Your own step');
    var btn = el('button', 'btn small', 'Add step'); btn.type = 'button'; var msg = el('span', 'hint');
    btn.addEventListener('click', function () {
      var st = null, text = tx.value.trim();
      if (as.value) st = mkStep(as.value); else if (text) st = { role: '', activity: text.slice(0, 100), cls: '' };
      if (!st) { msg.textContent = ' Choose an activity or type a step.'; return; }
      if (st.aid && stepsOf(w).some(function (x) { return x.aid === st.aid; })) { msg.textContent = ' That activity is already in this workflow.'; return; }
      editArr(w).push(st); openSet[w.id] = true; renderWorkflows();
    });
    row.appendChild(rs); row.appendChild(as); row.appendChild(tx); row.appendChild(btn); f.appendChild(row); f.appendChild(msg);
    return f;
  }
  function wfCard(w) {
    var inc = included(w), steps = stepsOf(w);
    var card = el('div', 'wf'); card.id = 'wf-' + w.id;
    var head = el('div', 'wf-head');
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = inc; cb.setAttribute('aria-label', 'Include ' + w.name);
    cb.addEventListener('change', function () { if (cb.checked) delete state.off[w.id]; else state.off[w.id] = true; renderWorkflows(); });
    head.appendChild(cb);
    var txt = el('div'); txt.appendChild(el('div', 'wf-title', w.name)); txt.appendChild(el('div', 'wf-out', w.outcome || '')); head.appendChild(txt);
    var meta = el('div', 'wf-meta'); var s = suitability(w);
    meta.appendChild(el('span', 'mini idtag', w.id));
    if (w.custom) meta.appendChild(el('span', 'mini cust', 'Your own'));
    meta.appendChild(el('span', 'mini', s.n + ' step' + (s.n === 1 ? '' : 's')));
    if (state.roles) { var sc = steps.filter(function (x) { return x.aid && state.roles.scope[x.aid]; }).length, wa = steps.filter(function (x) { return x.aid; }).length; meta.appendChild(el('span', 'mini scope', sc + ' of ' + wa + ' in your roles scope')); }
    if (s.pct != null) meta.appendChild(el('span', 'mini fa', s.pct + '% suited to AI'));
    head.appendChild(meta); card.appendChild(head);
    var det = el('details'); det.open = !!openSet[w.id];
    det.addEventListener('toggle', function () { openSet[w.id] = det.open; });
    det.appendChild(el('summary', null, 'Steps in this workflow'));
    var ul = el('ul', 'steps-list'), bl = baseLen(w);
    steps.forEach(function (st, i) {
      var li = el('li', stepOn(w, i) ? '' : 'off');
      var scb = el('input'); scb.type = 'checkbox'; scb.checked = stepOn(w, i); scb.setAttribute('aria-label', 'Include step ' + st.activity);
      scb.addEventListener('change', function () {
        if (!state.stepsOff[w.id]) state.stepsOff[w.id] = {};
        if (scb.checked) delete state.stepsOff[w.id][i]; else state.stepsOff[w.id][i] = true;
        renderWorkflows();
      });
      li.appendChild(scb);
      var d = el('div'); d.appendChild(document.createTextNode(st.activity));
      if (st.role) d.appendChild(el('span', 'role', st.role));
      if (state.roles && st.aid && !inScope(st)) d.appendChild(el('span', 'role out', 'not in your roles scope'));
      li.appendChild(d);
      var c = stepCls(st);
      if (c) li.appendChild(el('span', 'mini ' + (c === 'Full automation' ? 'fa' : c === 'Human only' ? 'ho' : ''), c));
      if (i >= bl) { var rmb = el('button', 'lnk', 'Remove'); rmb.type = 'button'; rmb.setAttribute('aria-label', 'Remove step ' + st.activity); rmb.addEventListener('click', function () { removeStep(w, i); renderWorkflows(); }); li.appendChild(rmb); }
      ul.appendChild(li);
    });
    det.appendChild(ul);
    det.appendChild(addStepForm(w));
    if (w.custom) {
      var act = el('div', 'wf-actions'); var rm = el('button', 'btn small', 'Remove this workflow'); rm.type = 'button';
      rm.addEventListener('click', function () {
        state.custom = state.custom.filter(function (c) { return c.id !== w.id; });
        delete state.scores[w.id]; delete state.tiers[w.id]; delete state.notes[w.id]; delete state.off[w.id]; delete state.stepsOff[w.id]; delete state.extra[w.id];
        renderWorkflows();
      });
      act.appendChild(rm); det.appendChild(act);
    }
    card.appendChild(det); return card;
  }
  function renderWorkflows() {
    var host = $('wfList'); host.textContent = '';
    var n = 0, all = allWf();
    all.forEach(function (w) { if (included(w)) n++; });
    FW.groups.forEach(function (g) {
      var list = all.filter(function (w) { return (w.group || FW.groups[0]) === g; }).sort(function (x, y) { return x.name.localeCompare(y.name); });
      if (!list.length) return;
      var on = list.filter(included).length;
      var gh = el('div', 'wf-group'); var gcb = el('input'); gcb.type = 'checkbox'; gcb.checked = on === list.length; gcb.indeterminate = on > 0 && on < list.length; gcb.setAttribute('aria-label', 'Include all workflows in ' + g);
      gcb.addEventListener('change', function () { list.forEach(function (w) { if (gcb.checked) delete state.off[w.id]; else state.off[w.id] = true; }); renderWorkflows(); });
      gh.appendChild(gcb); gh.appendChild(el('span', 'wf-group-name', g)); gh.appendChild(el('span', 'hint', on + ' of ' + list.length + ' selected'));
      host.appendChild(gh);
      list.forEach(function (w) { host.appendChild(wfCard(w)); });
    });
    $('wfCount').textContent = n + ' of ' + all.length + ' workflows selected';
    renderRolesStatus();
  }
  function renderRolesStatus() {
    var h = $('rolesStatus'); if (!h) return; h.textContent = '';
    $('btnRolesClear').hidden = !state.roles;
    if (!state.roles) { h.textContent = 'No roles file loaded. All starter steps are shown.'; return; }
    var n = Object.keys(state.roles.scope).length;
    h.textContent = 'Roles scope loaded' + (state.roles.org ? ' for ' + state.roles.org : '') + ': ' + n + ' activit' + (n === 1 ? 'y' : 'ies') + ' in scope.';
  }
  function nextCustomId() { var n = 1; function id() { return 'WFC' + (n < 10 ? '0' + n : n); } while (wfById(id())) n++; return id(); }
  function addCustom() {
    var name = $('newName').value.trim(), out = $('newOutcome').value.trim(), grp = $('newGroup').value;
    var lines = $('newSteps').value.split(/\r?\n/).map(function (s) { return s.trim().slice(0, 100); }).filter(Boolean).slice(0, 20);
    var msg = $('addMsg');
    if (!name || !lines.length) { msg.textContent = ' Add a name and at least one step. You can add steps from the roles list afterwards.'; return; }
    var id = nextCustomId();
    state.custom.push({ id: id, name: name.slice(0, 80), outcome: out, group: grp, tier: 'minimal', custom: true, steps: lines.map(function (l) { return { role: '', activity: l, cls: '' }; }) });
    $('newName').value = ''; $('newOutcome').value = ''; $('newSteps').value = ''; msg.textContent = ' Added to ' + grp + '.';
    openSet[id] = true; renderWorkflows();
  }

  // ---------- roles import
  function parseRolesXlsx(buf) {
    var wb = XLSX.read(buf, { type: 'array' }), ws = wb.Sheets['Selected activities']; if (!ws) throw new Error('no sheet');
    var cc = { roles: [], acts: [] }, cw = wb.Sheets['Custom items'];
    if (cw) XLSX.utils.sheet_to_json(cw, { defval: '' }).forEach(function (r) {
      if (r['Type'] === 'Role') cc.roles.push({ rid: r['Role ID'], name: r['Role'], group: r['Group'] });
      else if (r['Type'] === 'Activity') cc.acts.push({ id: r['Activity ID'], rid: r['Role ID'], task: r['Task'], activity: r['Activity'], cls: r['Classification'] });
    });
    var rows = XLSX.utils.sheet_to_json(ws, { defval: '' }), org = '';
    var mw = wb.Sheets['Workmatik data']; if (mw) XLSX.utils.sheet_to_json(mw, { header: 1 }).forEach(function (r) { if (r[0] === 'Organisation') org = String(r[1] || ''); });
    return { custom: cc, rows: rows.map(function (r) { return [String(r['Activity ID']).trim(), String(r['AI Suitability Classification']).trim()]; }), org: org };
  }
  function parseRolesJson(text) {
    var d = JSON.parse(text); if (!d || !Array.isArray(d.scopeIds)) throw new Error('old format');
    var rows = d.scopeIds.map(function (id) { return [String(id), (d.overrideIds || {})[id] || '']; });
    return { custom: d.custom || { roles: [], acts: [] }, rows: rows, org: d.clientName || '' };
  }
  function applyRoles(parsed, fname) {
    setCustomCat(parsed.custom);
    var scope = {}, ovr = {}, n = 0;
    parsed.rows.forEach(function (r) {
      var a = ACT[r[0]]; if (!a) return; scope[a.id] = true; n++;
      if (CLS.indexOf(r[1]) >= 0 && r[1] !== a.cls) ovr[a.id] = r[1];
    });
    if (!n) return { ok: false };
    state.roles = { org: String(parsed.org || '').slice(0, 80), scope: scope, ovr: ovr, file: fname };
    var offWf = 0, withScope = 0, used = {};
    allWf().forEach(function (w) {
      var steps = stepsOf(w), any = false, hasAid = false; state.stepsOff[w.id] = {};
      steps.forEach(function (st, i) {
        if (st.aid) { hasAid = true; used[st.aid] = true; if (scope[st.aid]) any = true; else state.stepsOff[w.id][i] = true; }
      });
      if (hasAid && !any) { state.off[w.id] = true; offWf++; } else { delete state.off[w.id]; withScope++; }
    });
    var unused = Object.keys(scope).filter(function (id) { return !used[id]; }).length;
    if (parsed.org && !$('orgName').value) $('orgName').value = parsed.org;
    return { ok: true, n: n, withScope: withScope, offWf: offWf, unused: unused, custom: CUSTCAT.acts.length };
  }
  function loadRolesFile(file) {
    var msgs = $('loadMessages'); msgs.textContent = '';
    function msg(t, ok) { msgs.appendChild(el('li', ok ? 'ok' : 'bad', t)); }
    var isX = /\.xlsx?$/i.test(file.name);
    (isX ? readFileBuffer(file) : new Promise(function (res, rej) { var rd = new FileReader(); rd.onload = function () { res(rd.result); }; rd.onerror = rej; rd.readAsText(file); }))
      .then(function (data) {
        var parsed; try { parsed = isX ? parseRolesXlsx(data) : parseRolesJson(data); } catch (e) { msg('That file could not be read as an AI Roles Assessment file. Use the Excel export, or a Save file from the updated tool.', false); return; }
        var r = applyRoles(parsed, file.name);
        if (!r.ok) { msg('That file has no activities in scope that this tool recognises.', false); return; }
        renderWorkflows(); renderAssess();
        msg('Loaded ' + r.n + ' activities in scope from ' + file.name + '. ' + r.withScope + ' workflow' + (r.withScope === 1 ? ' has' : 's have') + ' at least one step in your scope; ' + r.offWf + ' with none were switched off. Steps outside your scope are unticked, and you can tick them back on.', true);
        if (r.unused) msg(r.unused + ' of your in-scope activit' + (r.unused === 1 ? 'y is' : 'ies are') + ' not in any workflow yet. Use Add a step on a workflow to include ' + (r.unused === 1 ? 'it' : 'them') + (r.custom ? ', including your custom ones' : '') + '.', true);
      }).catch(function () { msg('That file could not be read.', false); });
  }

  // ---------- tab 2: assessment
  function renderChips() {
    var host = $('assessChips'); host.textContent = '';
    [['all', 'All'], ['todo', 'Not fully scored'], ['done', 'Fully scored']].forEach(function (f) {
      var b = el('button', 'chip', f[1]); b.type = 'button'; b.setAttribute('aria-pressed', state.filter === f[0] ? 'true' : 'false');
      b.addEventListener('click', function () { state.filter = f[0]; renderChips(); renderAssess(); });
      host.appendChild(b);
    });
  }
  function liveText(x) {
    if (!x.complete) return 'Answer all seven questions to see this workflow’s result. ' + x.answered + ' of ' + FW.questions.length + ' answered.';
    var q = x.quad === 'prohibited' ? null : quadById(x.quad);
    return 'Value ' + fmt(x.v) + ' · Feasibility ' + fmt(x.f) + ' · Risk ' + fmt(x.r) + ' · ' + (q ? 'Priority ' + x.priority + ' · ' + q.name : 'Prohibited tier: do not proceed');
  }
  function assessCard(w) {
    var card = el('div', 'assess-card'); card.id = 'as-' + w.id;
    var h = el('h3'); h.appendChild(document.createTextNode(w.name)); var s = suitability(w); h.appendChild(el('span', 'mini', s.n + ' steps'));
    if (s.pct != null) h.appendChild(el('span', 'mini fa', s.pct + '% suited to AI'));
    card.appendChild(h); if (w.outcome) card.appendChild(el('p', 'hint', 'Outcome: ' + w.outcome));
    var groups = [['value', 'Value'], ['feasibility', 'Feasibility'], ['risk', 'Risk (higher is riskier)']];
    groups.forEach(function (g) {
      card.appendChild(el('p', 'grp', g[1]));
      FW.questions.filter(function (q) { return q.group === g[0]; }).forEach(function (q) {
        var box = el('div', 'q'); box.appendChild(el('div', 'q-name', q.id + '  ' + q.name)); box.appendChild(el('div', 'q-text', q.q));
        var rg = el('div', 'scale5'); rg.setAttribute('role', 'radiogroup'); rg.setAttribute('aria-label', w.name + ': ' + q.name);
        for (var n = 1; n <= 5; n++) (function (n) {
          var b = el('button', null, String(n)); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', (state.scores[w.id] || {})[q.id] === n ? 'true' : 'false');
          b.setAttribute('aria-label', n + ' of 5');
          b.addEventListener('click', function () {
            var sc = state.scores[w.id] = state.scores[w.id] || {};
            sc[q.id] = sc[q.id] === n ? 0 : n; refreshCard(w.id); refreshProgress();
          });
          rg.appendChild(b);
        })(n);
        box.appendChild(rg);
        var an = el('div', 'anchors'); q.a.forEach(function (t, i) { an.appendChild(el('span', null, [1, 3, 5][i] + ' = ' + t)); }); box.appendChild(an);
        card.appendChild(box);
      });
    });
    card.appendChild(el('p', 'grp', 'Indicative EU AI Act tier'));
    var tiers = el('div', 'tiers'); tiers.setAttribute('role', 'radiogroup'); tiers.setAttribute('aria-label', w.name + ': EU AI Act tier');
    FW.tiers.forEach(function (t) {
      var lab = el('label', 'tier ' + t.id + (tierOf(w) === t.id ? ' sel' : ''));
      var r = el('input'); r.type = 'radio'; r.name = 'tier-' + w.id; r.checked = tierOf(w) === t.id;
      r.addEventListener('change', function () { state.tiers[w.id] = t.id; refreshCard(w.id); refreshProgress(); });
      var b = el('b'); b.appendChild(r); b.appendChild(document.createTextNode(t.name)); lab.appendChild(b); lab.appendChild(document.createTextNode(t.text)); tiers.appendChild(lab);
    });
    card.appendChild(tiers);
    var ta = el('textarea'); ta.maxLength = 500; ta.placeholder = 'Notes: why you scored it this way, evidence or caveats (optional)'; ta.setAttribute('aria-label', w.name + ' notes'); ta.value = state.notes[w.id] || '';
    ta.addEventListener('input', function () { state.notes[w.id] = ta.value; });
    card.appendChild(ta);
    var live = el('div', 'live'); live.id = 'live-' + w.id; live.setAttribute('aria-live', 'polite'); live.textContent = liveText(calcWf(w, thr())); card.appendChild(live);
    return card;
  }
  function refreshCard(id) {
    var w = wfById(id); var old = $('as-' + id); if (!w || !old) return;
    var fresh = assessCard(w); old.parentNode.replaceChild(fresh, old);
  }
  function renderAssess() {
    var host = $('assessList'); host.textContent = '';
    var list = allWf().filter(included);
    if (!list.length) { host.appendChild(el('p', 'empty', 'No workflows selected. Choose some on the Workflows tab.')); refreshProgress(); return; }
    var t = thr();
    list.forEach(function (w) {
      var done = calcWf(w, t).complete;
      if (state.filter === 'todo' && done) return; if (state.filter === 'done' && !done) return;
      host.appendChild(assessCard(w));
    });
    refreshProgress();
  }
  function refreshProgress() {
    var list = allWf().filter(included), t = thr(), done = 0, ans = 0;
    list.forEach(function (w) { var x = calcWf(w, t); ans += x.answered; if (x.complete) done++; });
    var tot = list.length * FW.questions.length;
    $('progBar').style.width = (tot ? Math.round(ans / tot * 100) : 0) + '%';
    $('progText').textContent = done + ' of ' + list.length + ' workflows fully scored';
  }

  // ---------- tab 3: results
  function buildQuad(rows, t, opts) {
    var NS = 'http://www.w3.org/2000/svg', x0 = 60, x1 = 530, y0 = 20, y1 = 340;
    function mk(tag, a, txt) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; }
    var svg = mk('svg', { viewBox: '0 0 560 400', width: '100%', role: 'img' });
    function px(f) { return x0 + (f - 1) / 4 * (x1 - x0); } function py(v) { return y1 - (v - 1) / 4 * (y1 - y0); }
    for (var i = 1; i <= 5; i++) {
      svg.appendChild(mk('line', { x1: px(i), y1: y0, x2: px(i), y2: y1, stroke: '#EEF1F3', 'stroke-width': 1 }));
      svg.appendChild(mk('line', { x1: x0, y1: py(i), x2: x1, y2: py(i), stroke: '#EEF1F3', 'stroke-width': 1 }));
      svg.appendChild(mk('text', { x: px(i), y: y1 + 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#4A5560' }, String(i)));
      svg.appendChild(mk('text', { x: x0 - 8, y: py(i) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#4A5560' }, String(i)));
    }
    svg.appendChild(mk('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: 'none', stroke: '#8A949C', 'stroke-width': 1 }));
    var tx = px(t.f), ty = py(t.v);
    svg.appendChild(mk('line', { x1: tx, y1: y0, x2: tx, y2: y1, stroke: '#024873', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    svg.appendChild(mk('line', { x1: x0, y1: ty, x2: x1, y2: ty, stroke: '#024873', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    [['Prepare first', x0 + 8, y0 + 16, 'start'], ['Start here', x1 - 8, y0 + 16, 'end'], ['Park', x0 + 8, y1 - 8, 'start'], ['Quick win', x1 - 8, y1 - 8, 'end']].forEach(function (q) {
      svg.appendChild(mk('text', { x: q[1], y: q[2], 'text-anchor': q[3], 'font-size': 13, 'font-weight': 700, fill: '#B8C0C6' }, q[0]));
    });
    svg.appendChild(mk('text', { x: (x0 + x1) / 2, y: 378, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#0D0D0D' }, 'Feasibility (1 to 5, higher is more feasible)'));
    svg.appendChild(mk('text', { x: 16, y: (y0 + y1) / 2, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#0D0D0D', transform: 'rotate(-90 16 ' + (y0 + y1) / 2 + ')' }, 'Value (1 to 5)'));
    var seen = {};
    rows.forEach(function (x) {
      var cx = px(x.f), cy = py(x.v), key = round1(x.f) + '|' + round1(x.v), k = seen[key] || 0; seen[key] = k + 1;
      cx += (k % 3) * 14 - (k > 0 ? 7 : 0); cy += Math.floor(k / 3) * 14;
      var q = quadById(x.quad), navy = q.id === 'prepare';
      svg.appendChild(mk('circle', { cx: cx, cy: cy, r: 11, fill: q.colour, stroke: '#0D0D0D', 'stroke-width': 1.5 }));
      svg.appendChild(mk('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: navy ? '#FFFFFF' : '#0D0D0D' }, String(x.rank)));
    });
    return svg;
  }
  function quadPng(rows, t) {
    return new Promise(function (resolve) {
      try {
        var svg = buildQuad(rows, t); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', '1680'); svg.setAttribute('height', '1200');
        Array.prototype.forEach.call(svg.querySelectorAll('text'), function (e) { e.setAttribute('font-family', 'Arial, Helvetica, sans-serif'); });
        var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); bg.setAttribute('x', '0'); bg.setAttribute('y', '0'); bg.setAttribute('width', '560'); bg.setAttribute('height', '400'); bg.setAttribute('fill', '#FFFFFF'); svg.insertBefore(bg, svg.firstChild);
        var img = new Image();
        img.onload = function () { try { var c = document.createElement('canvas'); c.width = 1680; c.height = 1200; c.getContext('2d').drawImage(img, 0, 0, 1680, 1200); resolve(c.toDataURL('image/png')); } catch (e) { resolve(null); } };
        img.onerror = function () { resolve(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      } catch (e) { resolve(null); }
    });
  }
  function pill(quad) {
    if (quad === 'prohibited') { var p0 = el('span', 'pill-q', 'Do not proceed'); p0.style.background = '#B42318'; return p0; }
    var q = quadById(quad), p = el('span', 'pill-q ' + q.id, q.name); p.style.background = q.colour; return p;
  }
  function renderResults() {
    var r = calcAll(), has = r.scored.length > 0;
    $('resultsEmpty').hidden = has; $('resultsBody').hidden = !has; if (!has) return;
    var sc = $('summaryCards'); sc.textContent = '';
    function metric(label, val) { var m = el('div', 'metric'); m.appendChild(el('div', 'label', label)); m.appendChild(el('div', 'val', String(val))); sc.appendChild(m); }
    function count(q) { return r.scored.filter(function (x) { return x.quad === q; }).length; }
    metric('Workflows scored', r.scored.length + ' of ' + r.rows.length);
    metric('Start here', count('start')); metric('Prepare first', count('prepare')); metric('Quick wins', count('quick'));
    metric('Flagged on risk', r.scored.filter(function (x) { return x.tier === 'high' || x.tier === 'prohibited'; }).length);

    var fl = $('flags'); fl.textContent = '';
    var pro = r.scored.filter(function (x) { return x.tier === 'prohibited'; }), hi = r.scored.filter(function (x) { return x.tier === 'high'; });
    if (pro.length) { var b = el('div', 'flagbox red'); b.appendChild(el('strong', null, 'Do not proceed. ')); b.appendChild(document.createTextNode(pro.map(function (x) { return x.w.name; }).join('; ') + ' marked as a prohibited tier. These are not ranked. Take legal advice before any use of AI here.')); fl.appendChild(b); }
    if (hi.length) { var b2 = el('div', 'flagbox'); b2.appendChild(el('strong', null, 'Governance first. ')); b2.appendChild(document.createTextNode(hi.map(function (x) { return x.w.name; }).join('; ') + ' marked as high-risk. Put governance, human oversight and documentation in place before building.')); fl.appendChild(b2); }

    var tb = $('rankTable'); tb.textContent = '';
    var hr = el('tr'); ['#', 'Workflow', 'Value', 'Feasibility', 'Risk', 'Priority', 'Group', 'Suited to AI', 'EU AI Act tier'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); tb.appendChild(th);
    var body = el('tbody');
    r.ranked.concat(r.scored.filter(function (x) { return x.tier === 'prohibited'; })).forEach(function (x) {
      var tr = el('tr'); tr.appendChild(el('td', 'num', x.rank ? String(x.rank) : '–')); tr.appendChild(el('td', null, x.w.name));
      tr.appendChild(el('td', 'num', fmt(x.v))); tr.appendChild(el('td', 'num', fmt(x.f))); tr.appendChild(el('td', 'num', fmt(x.r)));
      tr.appendChild(el('td', 'num', x.quad === 'prohibited' ? '–' : String(x.priority)));
      var g = el('td'); g.appendChild(pill(x.quad)); tr.appendChild(g);
      var s = suitability(x.w); tr.appendChild(el('td', 'num', s.pct == null ? '–' : s.pct + '%'));
      tr.appendChild(el('td', null, tierName(x.tier))); body.appendChild(tr);
    });
    tb.appendChild(body);

    var q = $('quad'); q.textContent = ''; q.appendChild(buildQuad(r.ranked, r.t));
    var lg = $('quadLegend'); lg.textContent = '';
    FW.quadrants.forEach(function (qq) { var li = el('li'); var sw = el('span', 'sw'); sw.style.background = qq.colour; li.appendChild(sw); li.appendChild(document.createTextNode(qq.name + ': ' + qq.text)); lg.appendChild(li); });

    var uc = $('useCases'); uc.textContent = '';
    var top = r.ranked.filter(function (x) { return x.quad === 'start'; }).slice(0, 3);
    if (!top.length) uc.appendChild(el('p', 'empty', 'No workflow is in the Start here group yet. Look at Prepare first, and close the gaps flagged against each one.'));
    top.forEach(function (x) {
      var s = suitability(x.w), d = el('div', 'uc');
      d.appendChild(el('h4', null, x.rank + '. ' + x.w.name));
      var line = 'Use case: apply AI to ' + (s.fa + s.au) + ' of ' + s.n + ' steps (' + s.fa + ' full automation, ' + s.au + ' augmentation). People keep ' + s.ho + ' human-only step' + (s.ho === 1 ? '' : 's') + '.';
      if (s.un) line += ' ' + s.un + ' step' + (s.un === 1 ? ' is' : 's are') + ' not yet classified.';
      d.appendChild(el('p', null, line));
      if (x.w.outcome) d.appendChild(el('p', null, 'Outcome to protect: ' + x.w.outcome));
      var hints = capHints(x);
      d.appendChild(el('p', null, hints.length ? 'Check first in the AI Capability Assessment: ' + hints.map(function (h) { return h[0] + ' ' + h[1]; }).join('; ') + '.' : 'Your scores flag no capability gaps for this workflow.'));
      uc.appendChild(d);
    });
  }

  // ---------- guide
  function renderGuide() {
    $('fwVersion').textContent = FW.version;
    var gq = $('guideQs'); gq.textContent = '';
    var hr = el('tr'); ['ID', 'Group', 'Question', '1 =', '3 =', '5 ='].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); gq.appendChild(th); var tbd = el('tbody');
    FW.questions.forEach(function (q) { var tr = el('tr'); [q.id, q.group.charAt(0).toUpperCase() + q.group.slice(1), q.name + ': ' + q.q].concat(q.a).forEach(function (c) { tr.appendChild(el('td', null, c)); }); tbd.appendChild(tr); });
    gq.appendChild(tbd);
    var gt = $('guideTiers'); gt.textContent = '';
    var h2 = el('tr'); ['Tier', 'What it means'].forEach(function (h) { h2.appendChild(el('th', null, h)); }); var t2 = el('thead'); t2.appendChild(h2); gt.appendChild(t2);
    var b2 = el('tbody'); FW.tiers.forEach(function (t) { var tr = el('tr'); tr.appendChild(el('td', null, t.name)); tr.appendChild(el('td', null, t.text)); b2.appendChild(tr); }); gt.appendChild(b2);
  }

  // ---------- download
  function metaVals() { return { org: $('orgName').value, who: $('assessor').value, date: $('assessDate').value }; }
  function buildSheets(r) {
    var m = metaVals(), t = r.t;
    var summary = [
      ['AI Workflow Assessment'], ['Framework version', FW.version],
      ['Organisation or function', m.org], ['Assessor', m.who], ['Assessment date', m.date],
      ['Value is high above', t.v], ['Feasibility is high above', t.f], [],
      ['Workflows scored', r.scored.length + ' of ' + r.rows.length],
      ['Start here', r.scored.filter(function (x) { return x.quad === 'start'; }).length],
      ['Prepare first', r.scored.filter(function (x) { return x.quad === 'prepare'; }).length],
      ['Quick wins', r.scored.filter(function (x) { return x.quad === 'quick'; }).length],
      [], ['Generated in the browser by the Workmatik AI Workflow Assessment. Questions, thresholds, tiers and starter workflows are the author’s draft judgement.']
    ];
    var scoring = [['ID', 'Workflow', 'Group', 'Source', 'Included', 'V1', 'V2', 'F1', 'F2', 'F3', 'R1', 'R2', 'EU AI Act tier', 'Note']];
    allWf().forEach(function (w) {
      var sc = state.scores[w.id] || {};
      scoring.push([w.id, w.name, w.group || FW.groups[0], w.custom ? 'Own' : 'Starter', included(w) ? 'Y' : 'N'].concat(['V1', 'V2', 'F1', 'F2', 'F3', 'R1', 'R2'].map(function (k) { return sc[k] >= 1 ? sc[k] : ''; })).concat([tierOf(w), state.notes[w.id] || '']));
    });
    var steps = [['Workflow ID', 'Workflow', 'Step no', 'Role', 'Activity', 'Activity ID', 'Source', 'Classification', 'Included', 'Outcome']];
    allWf().forEach(function (w) { var bl = baseLen(w); stepsOf(w).forEach(function (s, i) { steps.push([w.id, w.name, i + 1, s.role || '', s.activity, s.aid || '', w.custom ? 'Own' : (i < bl ? 'Starter' : 'Added'), stepCls(s), stepOn(w, i) ? 'Y' : 'N', i === 0 ? (w.outcome || '') : '']); }); });
    var qs = [['ID', 'Group', 'Name', 'Question', '1 =', '3 =', '5 =']];
    FW.questions.forEach(function (q) { qs.push([q.id, q.group, q.name, q.q].concat(q.a)); });
    var res = [['Rank', 'ID', 'Workflow', 'Value', 'Feasibility', 'Risk', 'Priority index', 'Group', 'EU AI Act tier', 'Suited to AI']];
    r.ranked.forEach(function (x) { var s = suitability(x.w); res.push([x.rank, x.w.id, x.w.name, round1(x.v), round1(x.f), round1(x.r), x.priority, quadById(x.quad).name, tierName(x.tier), s.pct == null ? '' : s.pct + '%']); });
    r.scored.filter(function (x) { return x.tier === 'prohibited'; }).forEach(function (x) { res.push(['', x.w.id, x.w.name, round1(x.v), round1(x.f), round1(x.r), '', 'Do not proceed', tierName(x.tier), '']); });
    var data = [['Field', 'Value'], ['Tool', 'Workmatik AI Workflow Assessment'], ['Tool key', 'workflow'], ['Data version', FW.version], ['Schema', 'workmatik-shared-ids-1'], ['Organisation', m.org], ['Assessor', m.who], ['Assessment date', m.date],
      ['Workflows scored', r.scored.length], ['Roles file loaded', state.roles ? 'Yes' : 'No'], ['Roles file organisation', state.roles ? state.roles.org : ''], ['Roles activities in scope', state.roles ? Object.keys(state.roles.scope).length : ''],
      ['Note', 'Workflow IDs (WF##, own WFC##) and Activity IDs (A###, custom AC###) are stable. Other Workmatik tools match on these IDs.']];
    var out = [['Summary', summary, [30, 60]], ['Workmatik data', data, [26, 90]], ['Scoring', scoring, [8, 40, 28, 9, 9, 6, 6, 6, 6, 6, 6, 6, 16, 50]], ['Steps', steps, [11, 36, 8, 30, 50, 11, 9, 16, 9, 50]], ['Questions', qs, [6, 12, 28, 70, 30, 30, 30]], ['Results', res, [7, 8, 40, 8, 11, 8, 13, 16, 22, 12]]];
    if (state.roles) {
      var rs = [['Activity ID', 'Role', 'Task', 'Activity', 'Classification', 'Default classification']];
      Object.keys(state.roles.scope).sort().forEach(function (id) { var a = ACT[id]; if (a) rs.push([id, a.role, a.task, a.activity, state.roles.ovr[id] || a.cls, a.cls]); });
      out.push(['Roles scope', rs, [11, 34, 30, 50, 20, 22]]);
    }
    if (CUSTCAT.roles.length || CUSTCAT.acts.length) {
      var ci = [['Type', 'Role ID', 'Group', 'Role', 'Activity ID', 'Task', 'Activity', 'Classification']];
      CUSTCAT.roles.forEach(function (r) { ci.push(['Role', r.rid, r.group, r.name, '', '', '', '']); });
      CUSTCAT.acts.forEach(function (a) { var r = ROLEBYID[a.rid]; ci.push(['Activity', a.rid, r ? r.group : '', r ? r.name : '', a.id, a.task, a.activity, a.cls]); });
      out.push(['Custom items', ci, [10, 8, 30, 34, 11, 30, 50, 20]]);
    }
    return out;
  }
  function saveBlob(buf, fname) {
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function headStyle(ws) { ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF024873' } }; }); }
  function download() {
    var r = calcAll(), sheets = buildSheets(r), m = metaVals();
    var org = (m.org || 'results').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40), fname = 'AI_Workflow_Assessment_' + org + '.xlsx';
    function fallback() {
      var wb = XLSX.utils.book_new();
      sheets.forEach(function (sh) { var ws = XLSX.utils.aoa_to_sheet(sh[1]); ws['!cols'] = sh[2].map(function (w) { return { wch: w }; }); XLSX.utils.book_append_sheet(wb, ws, sh[0]); });
      XLSX.writeFile(wb, fname);
    }
    if (typeof ExcelJS === 'undefined') { fallback(); return; }
    quadPng(r.ranked, r.t).then(function (png) {
      var wb = new ExcelJS.Workbook(); wb.creator = 'Workmatik'; wb.title = 'AI Workflow Assessment'; var objs = {};
      sheets.forEach(function (sh) {
        var ws = wb.addWorksheet(sh[0]); objs[sh[0]] = ws;
        sh[1].forEach(function (row) { ws.addRow(row); });
        sh[2].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
        ws.eachRow(function (row) { row.alignment = { vertical: 'top', wrapText: true }; });
      });
      objs.Summary.getRow(1).font = { bold: true, size: 14 };
      Object.keys(objs).forEach(function (n) { if (n !== 'Summary') headStyle(objs[n]); });
      if (png) { var id = wb.addImage({ base64: png, extension: 'png' }); objs.Results.addImage(id, { tl: { col: 0, row: objs.Results.rowCount + 2 }, ext: { width: 560, height: 400 } }); }
      return wb.xlsx.writeBuffer();
    }).then(function (buf) { saveBlob(buf, fname); }).catch(function () { fallback(); });
  }

  // ---------- load
  function serialToIso(v) {
    if (typeof v === 'number' && v > 30000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : '';
  }
  function validTier(t) { return FW.tiers.some(function (x) { return x.id === t; }); }
  function parseWorkbook(buf) {
    var wb = XLSX.read(buf, { type: 'array' }), ws = wb.Sheets['Scoring']; if (!ws) throw new Error('no scoring sheet');
    var out = { off: {}, stepsOff: {}, custom: [], extra: {}, roles: null, custcat: { roles: [], acts: [] }, scores: {}, tiers: {}, notes: {}, org: '', who: '', date: '', tv: null, tf: null, n: 0, rows: [] };
    var cw = wb.Sheets['Custom items'];
    if (cw) XLSX.utils.sheet_to_json(cw, { defval: '' }).forEach(function (r) {
      if (r['Type'] === 'Role') out.custcat.roles.push({ rid: r['Role ID'], name: r['Role'], group: r['Group'] });
      else if (r['Type'] === 'Activity') out.custcat.acts.push({ id: r['Activity ID'], rid: r['Role ID'], task: r['Task'], activity: r['Activity'], cls: r['Classification'] });
    });
    setCustomCat(out.custcat);
    var rsw = wb.Sheets['Roles scope'];
    if (rsw) {
      var sc0 = {}, ov0 = {}, c0 = 0;
      XLSX.utils.sheet_to_json(rsw, { defval: '' }).forEach(function (r) { var id = String(r['Activity ID']).trim(), a = ACT[id]; if (!a) return; sc0[id] = true; c0++; var cl = String(r['Classification']).trim(); if (CLS.indexOf(cl) >= 0 && cl !== a.cls) ov0[id] = cl; });
      var org0 = ''; if (wb.Sheets['Workmatik data']) XLSX.utils.sheet_to_json(wb.Sheets['Workmatik data'], { header: 1 }).forEach(function (r) { if (r[0] === 'Roles file organisation') org0 = String(r[1] || ''); });
      if (c0) out.roles = { org: org0, scope: sc0, ovr: ov0, file: '' };
    }
    var stepRows = wb.Sheets['Steps'] ? XLSX.utils.sheet_to_json(wb.Sheets['Steps'], { defval: '' }) : [];
    function rowStep(s) {
      var id = String(s['Activity ID'] || '').trim();
      if (id && ACT[id]) return mkStep(id);
      return { role: String(s['Role'] || '').slice(0, 80), activity: String(s['Activity'] || '').slice(0, 100), cls: '' };
    }
    XLSX.utils.sheet_to_json(ws, { defval: '' }).forEach(function (row) {
      var id = normId(row['ID']), name = String(row['Workflow'] || '').trim();
      var own = String(row['Source']).toLowerCase() === 'own' || /^WFC\d{2,}$/.test(id);
      var tier = String(row['EU AI Act tier'] || '').trim(), sc = {}, got = 0;
      ['V1', 'V2', 'F1', 'F2', 'F3', 'R1', 'R2'].forEach(function (k) { var n = parseInt(row[k], 10); if (n >= 1 && n <= 5) { sc[k] = n; got++; } });
      var myRows = stepRows.filter(function (s) { return normId(s['Workflow ID']) === id; }).sort(function (a, b) { return (parseInt(a['Step no'], 10) || 0) - (parseInt(b['Step no'], 10) || 0); });
      if (own) {
        if (!/^WFC\d{2,}$/.test(id) || !name || !myRows.length) return;
        var grp = String(row['Group'] || '').trim(); if (FW.groups.indexOf(grp) < 0) grp = FW.groups[0];
        out.custom.push({ id: id, name: name.slice(0, 80), outcome: String((myRows[0]['Outcome'] || '')).slice(0, 140), group: grp, tier: 'minimal', custom: true, steps: myRows.map(rowStep) });
        myRows.forEach(function (s, i) { if (String(s['Included']).toUpperCase() === 'N') { (out.stepsOff[id] = out.stepsOff[id] || {})[i] = true; } });
      } else {
        var w = FW.workflows.filter(function (x) { return x.id === id; })[0]; if (!w) return;
        myRows.forEach(function (s, i) {
          var inc = String(s['Included']).toUpperCase() !== 'N';
          if (i < w.steps.length) { if (!inc && w.steps[i].activity === String(s['Activity'])) (out.stepsOff[id] = out.stepsOff[id] || {})[i] = true; }
          else if (String(s['Source']) === 'Added') { (out.extra[id] = out.extra[id] || []).push(rowStep(s)); if (!inc) (out.stepsOff[id] = out.stepsOff[id] || {})[i] = true; }
        });
      }
      if (String(row['Included']).toUpperCase() === 'N') out.off[id] = true;
      if (got) { out.scores[id] = sc; out.n++; }
      if (validTier(tier)) out.tiers[id] = tier;
      if (row['Note']) out.notes[id] = String(row['Note']).slice(0, 500);
      out.rows.push(id);
    });
    var sm = wb.Sheets['Summary'];
    if (sm) XLSX.utils.sheet_to_json(sm, { header: 1, defval: '' }).forEach(function (r) {
      if (r[0] === 'Organisation or function') out.org = String(r[1] || '');
      if (r[0] === 'Assessor') out.who = String(r[1] || '');
      if (r[0] === 'Assessment date') out.date = serialToIso(r[1]);
      if (r[0] === 'Value is high above' && r[1]) out.tv = parseFloat(r[1]) || null;
      if (r[0] === 'Feasibility is high above' && r[1]) out.tf = parseFloat(r[1]) || null;
    });
    return out;
  }
  function readFileBuffer(file) { return new Promise(function (resolve, reject) { var rd = new FileReader(); rd.onload = function () { resolve(rd.result); }; rd.onerror = reject; rd.readAsArrayBuffer(file); }); }
  function loadFile(file) {
    var msgs = $('loadMessages'); msgs.textContent = '';
    function msg(t, ok) { msgs.appendChild(el('li', ok ? 'ok' : 'bad', t)); }
    readFileBuffer(file).then(function (buf) {
      var d; try { d = parseWorkbook(buf); } catch (e) { msg('This file has no Scoring sheet, or could not be read as an assessment file, so it was not loaded.', false); return; }
      state.off = d.off; state.stepsOff = d.stepsOff; state.custom = d.custom; state.extra = d.extra; state.roles = d.roles; state.scores = d.scores; state.tiers = d.tiers; state.notes = d.notes;
      $('orgName').value = d.org; $('assessor').value = d.who; $('assessDate').value = d.date;
      if (d.tv) $('thrValue').value = d.tv; if (d.tf) $('thrFeas').value = d.tf;
      renderWorkflows(); renderAssess(); msg('Loaded ' + d.n + ' scored workflow' + (d.n === 1 ? '' : 's') + ' and ' + d.custom.length + ' of your own from ' + file.name + '.', true);
    }).catch(function () { msg('That file could not be read as an assessment file.', false); });
  }

  // ---------- compare
  var cmp = { snaps: [], includeCurrent: true };
  var COMPARE_MAX = 6;
  function snapFromState() {
    var r = calcAll(), items = {};
    r.scored.forEach(function (x) { items[x.w.custom ? 'C:' + x.w.name.toLowerCase() : x.w.id] = { name: x.w.name, v: x.v, f: x.f, r: x.r, priority: x.priority, quad: x.quad }; });
    return { name: 'Current', date: $('assessDate').value || 'Current', org: $('orgName').value, items: items, current: true };
  }
  function parseSnapshot(buf, fname) {
    var wb = XLSX.read(buf, { type: 'array' }), ws = wb.Sheets['Scoring']; if (!ws) throw new Error('no scoring');
    var meta = { org: '', date: '', tv: FW.thresholds.value, tf: FW.thresholds.feasibility };
    var sm = wb.Sheets['Summary'];
    if (sm) XLSX.utils.sheet_to_json(sm, { header: 1, defval: '' }).forEach(function (r) {
      if (r[0] === 'Organisation or function') meta.org = String(r[1] || '');
      if (r[0] === 'Assessment date') meta.date = serialToIso(r[1]);
      if (r[0] === 'Value is high above' && r[1]) meta.tv = parseFloat(r[1]) || meta.tv;
      if (r[0] === 'Feasibility is high above' && r[1]) meta.tf = parseFloat(r[1]) || meta.tf;
    });
    var items = {}, n = 0;
    XLSX.utils.sheet_to_json(ws, { defval: '' }).forEach(function (row) {
      if (String(row['Included']).toUpperCase() === 'N') return;
      var id = normId(row['ID']), own = String(row['Source']).toLowerCase() === 'own', name = String(row['Workflow'] || '').trim();
      var sc = {}, got = 0; ['V1', 'V2', 'F1', 'F2', 'F3', 'R1', 'R2'].forEach(function (k) { var v = parseInt(row[k], 10); if (v >= 1 && v <= 5) { sc[k] = v; got++; } });
      if (got !== 7) return;
      var tier = validTier(String(row['EU AI Act tier'])) ? String(row['EU AI Act tier']) : 'minimal';
      var v = (sc.V1 + sc.V2) / 2, f = (sc.F1 + sc.F2 + sc.F3) / 3, r = (sc.R1 + sc.R2) / 2;
      var quad = tier === 'prohibited' ? 'prohibited' : (v > meta.tv && f > meta.tf) ? 'start' : (v > meta.tv) ? 'prepare' : (f > meta.tf) ? 'quick' : 'park';
      items[own ? 'C:' + name.toLowerCase() : id] = { name: name, v: v, f: f, r: r, priority: Math.round(v * f / 25 * 100 * (1 - 0.1 * (r - 1))), quad: quad }; n++;
    });
    return { name: fname, date: meta.date, org: meta.org, items: items, n: n };
  }
  function addCmpFiles(files) {
    var msgs = $('cmpMessages');
    var list = Array.prototype.slice.call(files);
    var chain = Promise.resolve();
    list.forEach(function (f) {
      chain = chain.then(function () {
        if (cmp.snaps.length >= COMPARE_MAX) { msgs.appendChild(el('li', 'bad', f.name + ' was not added: the limit is ' + COMPARE_MAX + ' earlier files.')); return; }
        return readFileBuffer(f).then(function (buf) {
          var s; try { s = parseSnapshot(buf, f.name); } catch (e) { msgs.appendChild(el('li', 'bad', f.name + ' could not be read as an assessment file.')); return; }
          if (!s.date) { msgs.appendChild(el('li', 'bad', f.name + ' has no assessment date, so it cannot be placed in order.')); return; }
          if (!s.n) { msgs.appendChild(el('li', 'bad', f.name + ' has no fully scored workflows.')); return; }
          cmp.snaps.push(s); msgs.appendChild(el('li', 'ok', 'Added ' + f.name + ' (' + s.date + ', ' + s.n + ' scored workflow' + (s.n === 1 ? '' : 's') + ').'));
        });
      });
    });
    chain.then(renderCompare);
  }
  function cmpList() {
    var list = cmp.snaps.slice();
    if (cmp.includeCurrent) { var c = snapFromState(); if (Object.keys(c.items).length) list.push(c); }
    list.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    return list;
  }
  function cmpRows(list) {
    var keys = {}; list.forEach(function (s) { Object.keys(s.items).forEach(function (k) { keys[k] = s.items[k].name; }); });
    var rows = Object.keys(keys).map(function (k) {
      var vals = list.map(function (s) { return s.items[k] || null; });
      var first = null, last = null; vals.forEach(function (v) { if (v) { if (!first) first = v; last = v; } });
      var seen = vals.filter(Boolean).length;
      return { key: k, name: keys[k], vals: vals, d: seen > 1 ? last.priority - first.priority : null, first: first, last: last, seen: seen };
    });
    rows.sort(function (a, b) { return (b.last ? b.last.priority : 0) - (a.last ? a.last.priority : 0); });
    return rows;
  }
  function qname(id) { return id === 'prohibited' ? 'Do not proceed' : quadById(id).name; }
  function renderCompare() {
    var list = cmpList(); $('cmpClear').hidden = !cmp.snaps.length;
    $('cmpEmpty').hidden = list.length > 0; $('cmpBody').hidden = list.length === 0; if (!list.length) return;
    var st = $('cmpSnaps'); st.textContent = '';
    var hr = el('tr'); ['Assessment', 'Date', 'Organisation', 'Workflows scored'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); st.appendChild(th); var tb = el('tbody');
    list.forEach(function (s) { var tr = el('tr'); tr.appendChild(el('td', null, s.current ? 'This page' : s.name)); tr.appendChild(el('td', null, s.date)); tr.appendChild(el('td', null, s.org || '')); tr.appendChild(el('td', null, String(Object.keys(s.items).length))); tb.appendChild(tr); });
    st.appendChild(tb);
    var rows = cmpRows(list), t = $('cmpTable'); t.textContent = '';
    var h2 = el('tr'); h2.appendChild(el('th', null, 'Workflow')); list.forEach(function (s) { h2.appendChild(el('th', null, s.date)); }); h2.appendChild(el('th', null, 'Change')); h2.appendChild(el('th', null, 'Group, first to last'));
    var t2 = el('thead'); t2.appendChild(h2); t.appendChild(t2); var b2 = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr'); tr.appendChild(el('td', null, r.name));
      r.vals.forEach(function (v) { tr.appendChild(el('td', 'num', v ? String(v.priority) : '–')); });
      var dc = el('td', 'num', r.d == null ? '–' : (r.d > 0 ? '▲ +' + r.d : r.d < 0 ? '▼ ' + r.d : '0')); if (r.d > 0) dc.className = 'num up-good'; if (r.d < 0) dc.className = 'num down-bad'; tr.appendChild(dc);
      tr.appendChild(el('td', null, r.seen > 1 ? (r.first.quad === r.last.quad ? qname(r.last.quad) : qname(r.first.quad) + ' → ' + qname(r.last.quad)) : qname(r.last.quad)));
      b2.appendChild(tr);
    });
    t.appendChild(b2);
    $('cmpNote').textContent = list.length < 2 ? 'Only one assessment is loaded, so there is no change to show yet. Add an earlier file.' : 'Priority index, 0 to 100, for workflows fully scored in each assessment. Change is first to last assessment in which the workflow appears.';
  }
  function downloadCompare() {
    var list = cmpList(); if (!list.length) return; var rows = cmpRows(list);
    var head = ['Workflow'].concat(list.map(function (s) { return s.date; })).concat(['Change', 'Group, first to last']);
    var data = [head]; rows.forEach(function (r) { data.push([r.name].concat(r.vals.map(function (v) { return v ? v.priority : ''; })).concat([r.d == null ? '' : r.d, r.seen > 1 ? qname(r.first.quad) + ' to ' + qname(r.last.quad) : qname(r.last.quad)])); });
    var fname = 'AI_Workflow_Assessment_comparison.xlsx';
    function fallback() { var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Comparison'); XLSX.writeFile(wb, fname); }
    if (typeof ExcelJS === 'undefined') { fallback(); return; }
    var wb = new ExcelJS.Workbook(); wb.creator = 'Workmatik'; var ws = wb.addWorksheet('Comparison');
    data.forEach(function (r) { ws.addRow(r); }); ws.getColumn(1).width = 44; for (var i = 2; i <= head.length; i++) ws.getColumn(i).width = i === head.length ? 36 : 14; headStyle(ws);
    wb.xlsx.writeBuffer().then(function (buf) { saveBlob(buf, fname); }).catch(fallback);
  }

  // ---------- tabs and init
  var TABS = ['workflows', 'assess', 'results', 'compare', 'guide'];
  function showTab(name) {
    TABS.forEach(function (t) { var on = t === name; $('tab-' + t).setAttribute('aria-selected', on ? 'true' : 'false'); $('tab-' + t).tabIndex = on ? 0 : -1; $('panel-' + t).hidden = !on; });
    if (name === 'assess') renderAssess();
    if (name === 'results') renderResults();
    if (name === 'compare') renderCompare();
    window.scrollTo(0, 0);
  }
  function init() {
    renderGuide();
    $('assessDate').value = new Date().toISOString().slice(0, 10);
    $('thrValue').value = FW.thresholds.value; $('thrFeas').value = FW.thresholds.feasibility;
    renderWorkflows(); renderChips();
    TABS.forEach(function (t, i) {
      $('tab-' + t).addEventListener('click', function () { showTab(t); });
      $('tab-' + t).addEventListener('keydown', function (e) {
        var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!k) return;
        var nt = TABS[(i + k + TABS.length) % TABS.length]; showTab(nt); $('tab-' + nt).focus();
      });
    });
    $('btnAll').addEventListener('click', function () { state.off = {}; renderWorkflows(); });
    $('btnNone').addEventListener('click', function () { allWf().forEach(function (w) { state.off[w.id] = true; }); renderWorkflows(); });
    $('btnAdd').addEventListener('click', addCustom);
    FW.groups.forEach(function (g) { var o = el('option', null, g); o.value = g; $('newGroup').appendChild(o); });
    $('btnRoles').addEventListener('click', function () { $('rolesInput').click(); });
    $('rolesInput').addEventListener('change', function (e) { if (e.target.files[0]) loadRolesFile(e.target.files[0]); e.target.value = ''; });
    $('btnRolesClear').addEventListener('click', function () {
      state.roles = null; CUSTCAT = { roles: [], acts: [] }; rebuildCat(); state.stepsOff = {}; state.off = {}; $('loadMessages').textContent = '';
      renderWorkflows(); renderAssess();
    });
    $('btnGoAssess').addEventListener('click', function () { showTab('assess'); });
    $('btnGoResults').addEventListener('click', function () { showTab('results'); });
    $('btnDownload').addEventListener('click', download);
    $('btnLoad').addEventListener('click', function () { $('fileInput').click(); });
    $('fileInput').addEventListener('change', function (e) { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; });
    $('btnReset').addEventListener('click', function () {
      if (!window.confirm('Clear all selections, your own workflows, scores, tiers and notes?')) return;
      state.off = {}; state.stepsOff = {}; state.custom = []; state.extra = {}; state.roles = null; CUSTCAT = { roles: [], acts: [] }; rebuildCat(); state.scores = {}; state.tiers = {}; state.notes = {}; $('loadMessages').textContent = ''; renderWorkflows(); renderAssess();
    });
    ['thrValue', 'thrFeas'].forEach(function (id) { $(id).addEventListener('input', renderResults); });
    $('btnCmpAdd').addEventListener('click', function () { $('cmpFiles').click(); });
    $('cmpFiles').addEventListener('change', function (e) { if (e.target.files.length) addCmpFiles(e.target.files); e.target.value = ''; });
    $('cmpCurrent').addEventListener('change', function (e) { cmp.includeCurrent = e.target.checked; renderCompare(); });
    $('cmpClear').addEventListener('click', function () { cmp.snaps = []; $('cmpMessages').textContent = ''; renderCompare(); });
    $('btnCmpDownload').addEventListener('click', downloadCompare);
    $('btnCmpGo').addEventListener('click', function () { showTab('compare'); });
  }
})();
