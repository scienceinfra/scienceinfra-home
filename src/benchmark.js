(() => {
  const hdr = document.getElementById('hdr');
  const onScroll = () => hdr.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const SUBDOMAIN_LABEL = { biology: 'Biology', ecology: 'Ecology', medicine: 'Medicine', neuroscience: 'Neuroscience' };
  const SUBDOMAIN_ORDER = ['biology', 'ecology', 'medicine', 'neuroscience'];

  const state = { bench: 'tbs', view: 'ranking', domain: 'life-sciences', showPublic: false };
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

  function buildTbsRows(d, pub, showPublic) {
    const rows = d.arms.map((a) => ({
      rank: null,
      agent: a.agent, model: a.model,
      lifeAcc: a.accuracy, tasksStr: ratio(a.tasks_passed, a.tasks_evaluated),
      perDomain: perDomainStr(a.per_subdomain), overallAcc: null,
      sourceHtml: sourceChip(a) + (a.caveat ? ` <span title="${esc(a.caveat)}" class="chip chip-snapshot" style="cursor:help">caveats</span>` : ''),
      cost: null, sortAcc: a.accuracy == null ? -1 : a.accuracy,
    }));
    if (showPublic && pub) {
      for (const r of pub.rows.official) {
        rows.push({
          agent: r.agent, model: r.model,
          lifeAcc: r.life_accuracy, tasksStr: ratio(r.life_passes, r.life_tasks),
          perDomain: '–', overallAcc: r.overall_accuracy,
          sourceHtml: `<a class="chip chip-public" href="https://www.terminal-bench-science.ai/" target="_blank" rel="noopener">public &middot; official</a>`,
          cost: r.cost_usd, sortAcc: r.life_accuracy ?? r.overall_accuracy ?? -1,
        });
      }
      for (const r of pub.rows.vals) {
        rows.push({
          agent: r.agent, model: r.model,
          lifeAcc: null, tasksStr: '–',
          perDomain: '–', overallAcc: r.overall_accuracy,
          sourceHtml: `<a class="chip chip-public" href="https://www.vals.ai/benchmarks/terminal-bench-science" target="_blank" rel="noopener">public &middot; vals.ai</a>`,
          cost: r.cost_usd_per_test, sortAcc: r.overall_accuracy ?? -1,
        });
      }
    }
    rows.sort((a, b) => (b.sortAcc - a.sortAcc) || ((a.cost ?? Infinity) - (b.cost ?? Infinity)));
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  async function renderRanking() {
    const el = $('#bench-view-ranking');
    const d = await loadTbs();
    const pub = state.showPublic ? await loadPublic() : null;
    const rows = buildTbsRows(d, pub, state.showPublic);
    el.innerHTML = `
      <table class="bench-table">
        <thead><tr>
          <th>#</th><th>Agent</th><th>Model</th><th>Accuracy (life)</th><th>Tasks</th>
          <th>Per domain</th><th>Overall (all domains)</th><th>Source</th>
        </tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td class="rank">${r.rank}</td>
            <td class="agent">${esc(r.agent)}</td>
            <td>${esc(r.model)}</td>
            <td><div class="acc-bar-wrap"><span class="acc-bar"><i style="width:${r.lifeAcc ?? 0}%"></i></span><span class="acc-num">${pct(r.lifeAcc)}</span></div></td>
            <td class="num">${esc(r.tasksStr)}</td>
            <td class="sub">${r.perDomain}</td>
            <td class="num">${pct(r.overallAcc)}</td>
            <td>${r.sourceHtml}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  // ---------------------------------------------------------------- PARETO

  async function renderPareto() {
    const el = $('#bench-view-pareto');
    if (!state.showPublic) {
      el.innerHTML = `<p class="bench-empty">Cost isn't tracked for local runs yet, so there is nothing to plot. Turn on "Show public leaderboards" to see accuracy vs. cost for the public entries.</p>`;
      return;
    }
    const pub = await loadPublic();
    const pts = [];
    for (const r of pub.rows.official) if (r.life_accuracy != null && r.cost_usd != null) pts.push({ x: r.cost_usd, y: r.life_accuracy, label: `${r.model} (official)`, cls: 'off' });
    for (const r of pub.rows.vals) if (r.overall_accuracy != null && r.cost_usd_per_test != null) pts.push({ x: r.cost_usd_per_test, y: r.overall_accuracy, label: `${r.model} (vals.ai)`, cls: 'val' });
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
          <text class="lbl" x="${W / 2}" y="${H - 8}" text-anchor="middle">cost (official: $ per full run &middot; vals.ai: $ per task &mdash; not the same scale)</text>
          <text class="lbl" transform="rotate(-90 14 ${H / 2})" x="14" y="${H / 2}" text-anchor="middle">accuracy</text>
          ${pts.map((p) => `<g class="pt"><circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="5" fill="${p.cls === 'off' ? 'var(--t-teal)' : 'var(--t-blue)'}"><title>${esc(p.label)}: ${p.y.toFixed(1)}% at $${p.x.toFixed(2)}</title></circle></g>`).join('')}
        </svg>
      </div>`;
  }

  // ---------------------------------------------------------------- RADAR

  async function renderRadar() {
    const el = $('#bench-view-radar');
    const d = await loadTbs();
    const cards = SUBDOMAIN_ORDER.map((sub) => {
      const rows = d.arms
        .map((a) => ({ name: `${a.agent} / ${a.model}`, v: a.per_subdomain[sub] }))
        .filter((r) => r.v && r.v.evaluated > 0)
        .sort((a, b) => (b.v.accuracy ?? 0) - (a.v.accuracy ?? 0));
      if (!rows.length) return '';
      return `<div class="radar-card"><h4>${SUBDOMAIN_LABEL[sub]}</h4>${rows.map((r) => `
        <div class="radar-row">
          <span class="name" title="${esc(r.name)}">${esc(r.name)}</span>
          <span class="bar"><i style="width:${r.v.accuracy ?? 0}%"></i></span>
          <span class="val">${pct(r.v.accuracy)}</span>
        </div>`).join('')}</div>`;
    }).join('');
    el.innerHTML = `<div class="radar-grid">${cards}</div>`;
  }

  // ---------------------------------------------------------------- MATRIX

  async function renderMatrix() {
    const el = $('#bench-view-matrix');
    const d = await loadTbs();
    const header = d.arms.map((a) => `<th>${esc(a.agent)}<br>${esc(a.model)}</th>`).join('');
    const body = d.tasks.map((t) => {
      const cells = d.arms.map((a) => {
        const r = a.per_task[t.id];
        if (!r || r.status === 'not_run') return `<td><span class="cell cell-not-run" title="not run">&middot;</span></td>`;
        const cls = r.status === 'pass' ? 'cell-pass' : 'cell-fail';
        const mark = r.status === 'pass' ? '&#10003;' : '&#10007;';
        return `<td><span class="cell ${cls}" title="${esc(t.id)}: ${r.passed}/${r.total} tests passed, reward=${r.reward}">${mark}</span></td>`;
      }).join('');
      return `<tr><th>${esc(t.id)}<span class="sub"> &middot; ${esc(t.subdomain)}</span></th>${cells}</tr>`;
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
      const x = a.domains[dom];
      if (!x) return '';
      const f = (100 * x.first_run_pass) / x.tasks, n = (100 * x.any_run_pass) / x.tasks;
      return `<tr><td class="rank">${i + 1}</td><td class="agent">${esc(a.agent)}</td><td class="sub">${esc(a.model)}</td>
        <td class="num">${x.tasks}</td><td class="num">${ratio(x.first_run_pass, x.tasks)} &middot; ${pct(f)}</td>
        <td class="num">${ratio(x.any_run_pass, x.tasks)} &middot; ${pct(n)}</td></tr>`;
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
        <thead><tr><th>#</th><th>Agent</th><th>Model</th><th class="num">Held-out tasks</th><th class="num">First blind run</th><th class="num">Any run</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="bench-empty">No held-out results for this domain yet.</td></tr>`}</tbody>
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
      `All ScienceInfra arms above were run on the life-sciences domain only (25 tasks); physical sciences is coming soon and not yet running.`,
    ];
    const caveatArm = d.arms.find((a) => a.caveat);
    if (caveatArm) notes.push(caveatArm.caveat);
    if (state.showPublic) {
      const pub = await loadPublic();
      notes.push(pub.footnote);
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
    if (b.dataset.domain === 'physical-sciences') {
      $('#bench-view-' + (state.bench === 'heldout' ? 'heldout' : state.view)).innerHTML = `<p class="bench-empty">Physical sciences: coming soon &mdash; we are not running this domain yet.</p>`;
      $$('#bench-domain-toggle button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      return;
    }
    $$('#bench-domain-toggle button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    state.domain = 'life-sciences';
    renderAll();
  }));

  renderAll();
})();
