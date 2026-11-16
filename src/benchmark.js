(() => {
  const hdr = document.getElementById('hdr');
  const onScroll = () => hdr.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const SUBDOMAIN_LABEL = { biology: 'Biology', ecology: 'Ecology', medicine: 'Medicine', neuroscience: 'Neuroscience' };
  const SUBDOMAIN_ORDER = ['biology', 'ecology', 'medicine', 'neuroscience'];

  // Domains follow the official Terminal-Bench-Science leaderboard (v0.1: 70 tasks).
  const DOMAINS = [
    { id: 'all', label: 'All domains', tasks: 70 },
    { id: 'life', label: 'Life sciences', tasks: 19 },
    { id: 'physical', label: 'Physical sciences', tasks: 17 },
    { id: 'earth', label: 'Earth sciences', tasks: 8 },
    { id: 'mathematical', label: 'Mathematical sciences', tasks: 17 },
    { id: 'engineering', label: 'Engineering sciences', tasks: 9 },
  ];
  const DOMAIN = Object.fromEntries(DOMAINS.map((d) => [d.id, d]));
  const state = { bench: 'tbs', view: 'ranking', domain: 'life', showPublic: true };   // open on the domain we have run
  const cache = {};

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (n) => (n == null ? '–' : `${n.toFixed(1)}%`);
  const ratio = (p, t) => (p == null || t == null ? '–' : `${p}/${t}`);

  async function getJSON(path) {
    if (cache[path]) return cache[path];
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    const data = await res.json();
    cache[path] = data;
    return data;
  }

  function arrow(label, up) {
    return `<span class="chip ${up ? 'chip-local' : 'chip-snapshot'}">${esc(label)}</span>`;
  }

  function sourceChip(arm) {
    if (arm.source === 'scienceinfra') return `<span class="chip chip-local">ScienceInfra &middot; local</span>`;
    if (arm.source === 'scienceinfra-earlier-benchmark') return `<span class="chip chip-snapshot">snapshot ${esc(arm.snapshot || '')}</span>`;
    return '';
  }

  function perDomainStr(perSub) {
    const parts = SUBDOMAIN_ORDER.filter((k) => perSub[k]).map((k) => `${SUBDOMAIN_LABEL[k].slice(0, 3)} ${pct(perSub[k].accuracy)}`);
    return parts.length ? parts.join(' &middot; ') : '–';
  }

  // ---------------------------------------------------------------- loaders

  async function loadTbs() { return getJSON('data/tbs.json'); }
  async function loadHeldout() { return getJSON('data/heldout-summary.json'); }
  async function loadPublic() { return getJSON('data/public-leaderboards.json'); }
  async function loadOfficialDomains() { return getJSON('data/official-domains.json'); }

  // ---------------------------------------------------------------- meta line

  async function renderMeta() {
    const meta = $('#bench-meta');
    if (state.bench === 'heldout') {
      const d = await loadHeldout();
      meta.classList.remove('in-progress');
      meta.innerHTML = `<span class="dot"></span>updated ${esc(d.updated)} &middot; task details private`;
      return;
    }
    const d = await loadTbs();
    meta.classList.toggle('in-progress', !!d.in_progress);
    meta.innerHTML = `<span class="dot"></span>updated ${esc(d.updated)}` + (d.in_progress ? ` <span class="pill-chip">in progress &mdash; some arms still have unrun tasks</span>` : '');
  }

  // ---------------------------------------------------------------- RANKING

  // One score per row for the selected domain. Our arms have only run life
  // sciences: every other domain counts as 0, and "All domains" counts the
  // unrun official tasks as failed, so no cell is left empty.
  // Our harness runs the task repository's current life-science set (25 tasks);
  // the official leaderboard is v0.1, which has 19 of them. Scores are computed on
  // those 19 so they line up with the public rows; the newer tasks are reported
  // separately and never enter the rate.
  function splitTasks(d, off) {
    const v01 = new Set(off.life_v01_tasks);
    return { v01: d.tasks.filter((t) => v01.has(t.name)), newer: d.tasks.filter((t) => !v01.has(t.name)) };
  }
  const passCount = (a, tasks) => tasks.filter((t) => (a.per_task[t.id] || {}).status === 'pass').length;

  function localScore(a, dom, split) {
    const passed = passCount(a, split.v01);
    if (dom === 'life') return { acc: (100 * passed) / split.v01.length, passed, total: split.v01.length, run: true };
    if (dom === 'all') return { acc: (100 * passed) / DOMAIN.all.tasks, passed, total: DOMAIN.all.tasks, run: true, partial: true };
    return { acc: 0, passed: 0, total: DOMAIN[dom].tasks, run: false };
  }

  function buildRows(d, pub, off, dom) {
    const split = splitTasks(d, off);
    const rows = d.arms.map((a) => {
      const sc = localScore(a, dom, split);
      const newerRun = split.newer.filter((t) => a.per_task[t.id] && a.per_task[t.id].status !== 'not_run').length;
      const newer = newerRun ? ` · newer tasks ${passCount(a, split.newer)}/${newerRun}` : '';
      return {
        agent: a.agent, model: a.model, acc: sc.acc, tasksStr: ratio(sc.passed, sc.total), run: sc.run, kind: 'local',
        sourceHtml: sourceChip(a) + (a.caveat ? ` <span title="${esc(a.caveat)}" class="chip chip-snapshot" style="cursor:help">caveats</span>` : ''),
        taskSet: !sc.run ? 'not run · counted as 0' : sc.partial ? 'v0.1 · life 19 run · other 51 counted as 0' : `v0.1 · 19 tasks · 1 run${newer}`,
        cost: null,
      };
    });
    if (pub) {
      const src = Object.fromEntries(pub.sources.map((s) => [s.id, s]));
      const chip = (id) => `<a class="chip chip-public" href="${esc(src[id].url)}" target="_blank" rel="noopener">${esc(src[id].label)}</a>`;
      for (const r of pub.rows.official || []) {
        const sc = dom === 'all'
          ? { accuracy: r.overall_accuracy, passes: Math.round((r.overall_accuracy * 210) / 100), trials: 210, cost_usd: r.cost_usd }
          : (off.scores[r.model] || {})[dom];
        if (!sc) continue;
        rows.push({
          agent: r.agent, model: r.model, acc: sc.accuracy, tasksStr: ratio(sc.passes, sc.trials), run: true, kind: 'official',
          sourceHtml: chip('official'), taskSet: `v0.1 · ${DOMAIN[dom].tasks} tasks · 3 trials`, cost: sc.cost_usd,
        });
      }
      // vals.ai publishes one overall number per model, so its rows only exist under "All domains".
      if (dom === 'all') for (const r of pub.rows.vals || []) rows.push({
        agent: r.agent, model: r.model, acc: r.overall_accuracy, tasksStr: ratio(Math.round((r.overall_accuracy * 70) / 100), 70), run: true, kind: 'vals',
        sourceHtml: chip('vals'), taskSet: 'v0.1 · 70 tasks · 1 run', cost: r.cost_usd_per_test,
      });
    }
    rows.sort((a, b) => (b.acc - a.acc) || (b.run - a.run) || ((a.cost ?? Infinity) - (b.cost ?? Infinity)));
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  async function loadRows() {
    const d = await loadTbs();
    const pub = state.showPublic ? await loadPublic() : null;
    const off = await loadOfficialDomains();
    return buildRows(d, pub, off, state.domain);
  }

  async function renderRanking() {
    const el = $('#bench-view-ranking');
    const rows = await loadRows();
    const dom = DOMAIN[state.domain];
    el.innerHTML = `
      <p class="bench-caption">${esc(dom.label)} <span class="sub">/ ${dom.tasks} official tasks</span></p>
      <div class="bench-table-scroll"><table class="bench-table">
        <thead><tr>
          <th>#</th><th>Agent</th><th>Model</th><th>Accuracy</th><th class="num">Passed</th><th>Task set</th><th>Source</th>
        </tr></thead>
        <tbody>${rows.map((r) => `
          <tr class="${r.run ? '' : 'not-run'}">
            <td class="rank">${r.rank}</td>
            <td class="agent">${esc(r.agent)}</td>
            <td>${esc(r.model)}</td>
            <td><div class="acc-bar-wrap"><span class="acc-bar"><i style="width:${r.acc}%"></i></span><span class="acc-num">${pct(r.acc)}</span></div></td>
            <td class="num">${esc(r.tasksStr)}</td>
            <td class="sub">${esc(r.taskSet)}</td>
            <td>${r.sourceHtml}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  }

  // ---------------------------------------------------------------- PARETO

  async function renderPareto() {
    const el = $('#bench-view-pareto');
    if (!state.showPublic) {
      el.innerHTML = `<p class="bench-empty">Cost isn't tracked for local runs yet, so there is nothing to plot. Turn on "Show public leaderboards" to see accuracy vs. cost for the public entries.</p>`;
      return;
    }
    const pub = await loadPublic();
    const off = await loadOfficialDomains();
    const dom = state.domain;
    const pts = [];
    for (const r of pub.rows.official) {
      const sc = dom === 'all' ? { accuracy: r.overall_accuracy, cost_usd: r.cost_usd } : (off.scores[r.model] || {})[dom];
      if (sc && sc.accuracy != null && sc.cost_usd != null) pts.push({ x: sc.cost_usd, y: sc.accuracy, label: `${r.model} (official)`, cls: 'off' });
    }
    const W = 720, H = 360, PAD = 44;
    const maxX = Math.max(...pts.map((p) => p.x)) * 1.08 || 1;
    const sx = (x) => PAD + (x / maxX) * (W - PAD * 2);
    const sy = (y) => H - PAD - (y / 100) * (H - PAD * 2);
    const ticks = [0, 25, 50, 75, 100];
    el.innerHTML = `
      <div class="pareto-wrap">
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Accuracy vs cost">
          <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="var(--hair)" />
          <line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="var(--hair)" />
          ${ticks.map((t) => `<text x="${PAD - 8}" y="${sy(t) + 3}" text-anchor="end">${t}%</text>`).join('')}
          <text class="lbl" x="${W / 2}" y="${H - 8}" text-anchor="middle">${esc(DOMAIN[dom].label)} &middot; cost in $ for the full run (official leaderboard, 3 trials per task)</text>
          <text class="lbl" transform="rotate(-90 14 ${H / 2})" x="14" y="${H / 2}" text-anchor="middle">accuracy</text>
          ${pts.map((p) => `<g class="pt"><circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="5" fill="${p.cls === 'off' ? 'var(--t-teal)' : 'var(--t-blue)'}"><title>${esc(p.label)}: ${p.y.toFixed(1)}% at $${p.x.toFixed(2)}</title></circle></g>`).join('')}
        </svg>
      </div>`;
  }

  // ---------------------------------------------------------------- RADAR

  function barCard(title, rows) {
    return `<div class="radar-card"><h4>${esc(title)}</h4>${rows.map((r) => `
        <div class="radar-row${r.run === false ? ' not-run' : ''}">
          <span class="name" title="${esc(r.name)}">${esc(r.name)}</span>
          <span class="bar"><i class="${r.kind === 'local' ? '' : 'pub'}" style="width:${r.acc}%"></i></span>
          <span class="val">${pct(r.acc)}</span>
        </div>`).join('')}</div>`;
  }

  async function renderRadar() {
    const el = $('#bench-view-radar');
    const d = await loadTbs();
    const pub = state.showPublic ? await loadPublic() : null;
    const off = await loadOfficialDomains();
    const card = (dom) => barCard(`${DOMAIN[dom].label} · ${DOMAIN[dom].tasks} tasks`,
      buildRows(d, pub, off, dom).filter((r) => r.kind !== 'vals').filter((r, i) => i < 8 || r.kind === 'local').map((r) => ({ ...r, name: `${r.agent} / ${r.model}` })));
    let cards;
    if (state.domain === 'all') {
      cards = DOMAINS.filter((x) => x.id !== 'all').map((x) => card(x.id)).join('');
    } else if (state.domain === 'life') {
      // our own runs, split by sub-domain
      const split = splitTasks(d, off);
      cards = SUBDOMAIN_ORDER.map((sub) => {
        const ts = split.v01.filter((t) => t.subdomain === sub);
        return barCard(`${SUBDOMAIN_LABEL[sub]} · ${ts.length} task${ts.length === 1 ? '' : 's'}`, d.arms
          .map((a) => ({ name: `${a.agent} / ${a.model}`, kind: 'local', acc: (100 * passCount(a, ts)) / ts.length }))
          .sort((a, b) => b.acc - a.acc));
      }).join('') + card('life');
    } else {
      cards = card(state.domain);
    }
    el.innerHTML = `<div class="radar-grid">${cards}</div>`;
  }

  // ---------------------------------------------------------------- MATRIX

  async function renderMatrix() {
    const el = $('#bench-view-matrix');
    const d = await loadTbs();
    if (state.domain !== 'all' && state.domain !== 'life') {
      el.innerHTML = `<p class="bench-empty">No ScienceInfra runs in ${esc(DOMAIN[state.domain].label.toLowerCase())} yet &mdash; every arm counts as 0 here. Per-task results exist for life sciences only.</p>`;
      return;
    }
    const off = await loadOfficialDomains();
    const split = splitTasks(d, off);
    const newerIds = new Set(split.newer.map((t) => t.id));
    const header = d.arms.map((a) => `<th>${esc(a.agent)}<br>${esc(a.model)}</th>`).join('');
    const body = [...split.v01, ...split.newer].map((t) => {
      const cells = d.arms.map((a) => {
        const r = a.per_task[t.id];
        if (!r || r.status === 'not_run') return `<td><span class="cell cell-not-run" title="not run">&middot;</span></td>`;
        const cls = r.status === 'pass' ? 'cell-pass' : 'cell-fail';
        const mark = r.status === 'pass' ? '&#10003;' : '&#10007;';
        if (r.source) return `<td><span class="cell ${cls} cell-published" title="${esc(t.id)}: ${esc(r.source)}, pass/fail only (older 70-task release)">${mark}<sup>v</sup></span></td>`;
        return `<td><span class="cell ${cls}" title="${esc(t.id)}: ${r.passed}/${r.total} tests passed, reward=${r.reward}">${mark}</span></td>`;
      }).join('');
      return `<tr><th>${esc(t.id)}<span class="sub"> &middot; ${esc(t.subdomain)}</span>${newerIds.has(t.id) ? ' <span class="chip chip-pending">after v0.1</span>' : ''}</th>${cells}</tr>`;
    }).join('');
    el.innerHTML = `
      <div class="matrix-scroll">
        <table class="bench-matrix">
          <thead><tr><th></th>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  // ---------------------------------------------------------------- HELD-OUT (aggregate only)

  async function renderHeldout() {
    const el = $('#bench-view-heldout');
    const d = await loadHeldout();
    const dom = state.domain;
    const rows = d.arms.map((a, i) => {
      const xs = dom === 'all' ? Object.values(a.domains) : dom === 'life' ? [a.domains['life-sciences']].filter(Boolean) : [];
      const passed = xs.reduce((n, x) => n + x.passed, 0), tasks = xs.reduce((n, x) => n + x.tasks, 0);
      const acc = tasks ? (100 * passed) / tasks : 0;
      return `<tr class="${tasks ? '' : 'not-run'}"><td class="rank">${i + 1}</td><td class="agent">${esc(a.agent)}</td><td>${esc(a.model)}</td>
        <td><div class="acc-bar-wrap"><span class="acc-bar"><i style="width:${acc}%"></i></span><span class="acc-num">${pct(acc)}</span></div></td>
        <td class="num">${tasks ? ratio(passed, tasks) : '0/0'}</td><td class="sub">${tasks ? 'held-out · 1 run' : 'not run · counted as 0'}</td><td>${sourceChip(a)}</td></tr>`;
    }).join('');
    const side = (t, h) => `
      <div class="ho-side"><p class="ho-label">${esc(h)}</p>
        ${t.task ? `<p class="ho-task">${esc(t.task)}</p>` : ''}
        <p><b>Data</b> ${esc(t.data)}</p>${t.schema ? `<p><b>Differs</b> ${esc(t.schema)}</p>` : ''}
        <p><b>Asks</b> ${esc(t.asks)}</p></div>`;
    const ex = d.examples.map((e) => `
      <article class="ho-pair"><header><span class="ho-cap">${esc(e.capability)}</span><span class="sub">${esc(e.domain)}</span></header>
        <div class="ho-grid">${side(e.original, 'Terminal-Bench-Science task')}${side(e.heldout, 'Held-out counterpart')}</div></article>`).join('');
    el.innerHTML = `
      <table class="bench-table">
        <thead><tr><th>#</th><th>Agent</th><th>Model</th><th>Accuracy</th><th class="num">Passed</th><th>Task set</th><th>Source</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h3 class="ho-h">Example pairs</h3>
      <p class="sub">Three retired held-outs next to the Terminal-Bench-Science task each one mirrors.</p>
      ${ex}`;
    $('#bench-footnote').innerHTML = esc(d.footnote);
  }

  // ---------------------------------------------------------------- footnote (tbs)

  async function renderTbsFootnote() {
    const d = await loadTbs();
    const notes = [
      `ScienceInfra arms are scored on the 19 life-science tasks of Terminal-Bench-Science v0.1, the same task set as the official leaderboard; a task that was not run counts as failed. Our harness also runs 6 life-science tasks added to the task repository after v0.1 (ehr-error-detection, bloodculture-gram-call, haplotype-risk-audit, mdd-executive-function, nis3d-hard-volume, plant-distribution-modeling): they are listed as "newer tasks" and in the matrix, and are not part of any rate.`,
      `Life sciences is the only domain we have run. In every other domain our arms are shown as 0, and under "All domains" their rate is passed / 70.`,
      `mini-swe-agent2 rows: cells marked v (matrix) use vals.ai's published per-task pass/fail (mini-swe-agent 2.2.4, single run, older 70-task release; DeepSeek V4.1 Flash and GPT-5.6 Luna); the remaining cells were run locally on our harness.`,
    ];
    const caveatArm = d.arms.find((a) => a.caveat);
    if (caveatArm) notes.push(caveatArm.caveat);
    if (state.showPublic) {
      const pub = await loadPublic();
      notes.push(pub.footnote.replace(', which has 19 life-science tasks versus our 25', ''));
      notes.push(`Per-domain public rows are the official leaderboard's domain tabs (v0.1: life 19, physical 17, earth 8, mathematical 17, engineering 9 tasks; passes are out of tasks x 3 trials). vals.ai publishes only an overall number, so its rows appear under "All domains" only.`);
    }
    $('#bench-footnote').innerHTML = notes.map(esc).join('<br>');
  }

  // ---------------------------------------------------------------- wiring

  function showView(view) {
    $$('.bench-view').forEach((v) => (v.hidden = true));
    const map = { ranking: renderRanking, pareto: renderPareto, radar: renderRadar, matrix: renderMatrix };
    const id = `#bench-view-${view}`;
    $(id).hidden = false;
    (map[view] || (() => Promise.resolve()))().then(renderTbsFootnote).catch((e) => { $(id).innerHTML = `<p class="bench-empty">Couldn't load benchmark data (${esc(e.message)}).</p>`; });
  }

  async function renderAll() {
    await renderMeta();
    const isHeldout = state.bench === 'heldout';
    $('#bench-tabs').hidden = isHeldout;
    $('#bench-public-wrap').hidden = isHeldout;
    if (isHeldout) {
      $$('.bench-view').forEach((v) => (v.hidden = true));
      $('#bench-view-heldout').hidden = false;
      renderHeldout().catch((e) => { $('#bench-view-heldout').innerHTML = `<p class="bench-empty">Couldn't load held-out data (${esc(e.message)}).</p>`; });
    } else {
      showView(state.view);
    }
  }

  $('#bench-select').addEventListener('change', (e) => { state.bench = e.target.value; renderAll(); });
  $('#bench-public-toggle').addEventListener('change', (e) => { state.showPublic = e.target.checked; showView(state.view); });
  $$('#bench-tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('#bench-tabs button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    state.view = b.dataset.view;
    showView(state.view);
  }));
  $$('#bench-domain-toggle button').forEach((b) => b.addEventListener('click', () => {
    $$('#bench-domain-toggle button').forEach((x) => x.classList.toggle('on', x === b));
    state.domain = b.dataset.domain;
    renderAll();
  }));

  renderAll();
})();
