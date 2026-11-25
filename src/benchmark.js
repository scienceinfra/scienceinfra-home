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

  // One score per row for the selected domain. Our arms have real runs for
  // life and physical sciences: every other domain counts as 0, and "All
  // domains" counts the unrun official tasks as failed, so no cell is left
  // empty.
  // Our harness runs the task repository's current life-science (25) and
  // physical-science (20) sets; the official leaderboard is v0.1, which has
  // 19 and 17 of them respectively. Scores are computed on those so they line
  // up with the public rows; the newer tasks are reported separately and
  // never enter the rate.
  const V01_KEYS = { life: 'life_v01_tasks', physical: 'physical_v01_tasks', earth: 'earth_v01_tasks',
                     mathematical: 'mathematical_v01_tasks', engineering: 'engineering_v01_tasks' };
  const DOMAIN_KEY = { life: 'life-sciences', physical: 'physical-sciences', earth: 'earth-sciences',
                       mathematical: 'mathematical-sciences', engineering: 'engineering-sciences' };
  const LOCAL_DOMAINS = ['life', 'physical', 'earth', 'mathematical', 'engineering'];   // domains we have real local run data for

  function splitTasks(d, off, dom) {
    let v01;
    if (dom === 'all') {
      v01 = new Set(LOCAL_DOMAINS.flatMap((x) => off[V01_KEYS[x]] || []));
    } else {
      v01 = new Set(off[V01_KEYS[dom]] || []);
    }
    const inDom = (t) => dom === 'all' || t.domain === DOMAIN_KEY[dom];
    return { v01: d.tasks.filter((t) => inDom(t) && v01.has(t.name)), newer: d.tasks.filter((t) => inDom(t) && !v01.has(t.name)) };
  }
  const passCount = (a, tasks) => tasks.filter((t) => (a.per_task[t.id] || {}).status === 'pass').length;

  // Arms with repeated runs carry per-task trials; scored like the official
  // leaderboard: passes over all recorded trials (e.g. life 19 tasks x 3 = 57).
  // A task that was not run adds 3 failed trials, so it still weighs in.
  const TRIALS_PER_TASK = 3;
  const trialsOf = (a, tasks) => tasks.flatMap((t) => (a.per_task[t.id] || {}).trials || []);
  const hasTrials = (a, tasks) => tasks.some((t) => ((a.per_task[t.id] || {}).trials || []).length > 1);
  const trialScore = (a, tasks) => {
    let passed = 0, total = 0;
    for (const t of tasks) {
      const c = a.per_task[t.id] || {}, tr = c.trials || [];
      if (tr.length) { passed += tr.filter((x) => x.pass).length; total += tr.length; }
      else if ((c.status || 'not_run') === 'not_run') total += TRIALS_PER_TASK;
      else { passed += c.status === 'pass' ? 1 : 0; total += 1; }
    }
    return { passed, total };
  };

  // An arm only counts as having "run" a single domain (life / physical) if
  // it covers at least half that domain's v0.1 tasks -- otherwise a handful
  // of incidental spot-check runs (e.g. a model only ever confirmed on 1 of
  // 17 physical tasks) would render as a real, very-low accuracy rather than
  // what it actually is: mostly not run. "All domains" keeps its existing,
  // documented semantics (an unrun official task always counts as failed).
  const evaluatedCount = (a, tasks) => tasks.filter((t) => ((a.per_task[t.id] || {}).status || 'not_run') !== 'not_run').length;

  function localScore(a, dom, split) {
    if (LOCAL_DOMAINS.includes(dom)) {
      const ev = evaluatedCount(a, split.v01);
      if (ev === 0) return { acc: 0, passed: 0, total: DOMAIN[dom].tasks, run: false };
      // Partial coverage (e.g. a backfill still running): score the tasks that
      // were run and say so; unrun tasks are "not run", not failures, here.
      if (ev < split.v01.length && !hasTrials(a, split.v01)) {
        const passed = passCount(a, split.v01);
        return { acc: (100 * passed) / ev, passed, total: ev, run: true, coverage: `${ev} of ${split.v01.length} tasks run` };
      }
      if (hasTrials(a, split.v01)) {
        const { passed, total } = trialScore(a, split.v01);
        return { acc: (100 * passed) / total, passed, total, run: true, trials: total === TRIALS_PER_TASK * split.v01.length ? `${TRIALS_PER_TASK} trials` : `up to ${TRIALS_PER_TASK} trials` };
      }
      const passed = passCount(a, split.v01);
      return { acc: (100 * passed) / split.v01.length, passed, total: split.v01.length, run: true };
    }
    const passed = passCount(a, split.v01);
    if (dom === 'all') return { acc: (100 * passed) / DOMAIN.all.tasks, passed, total: DOMAIN.all.tasks, run: true, partial: true, ev: evaluatedCount(a, split.v01) };
    return { acc: 0, passed: 0, total: DOMAIN[dom].tasks, run: false };
  }

  function buildRows(d, pub, off, dom) {
    const split = splitTasks(d, off, dom);
    const rows = d.arms.map((a) => {
      const sc = localScore(a, dom, split);
      const newerRun = split.newer.filter((t) => a.per_task[t.id] && a.per_task[t.id].status !== 'not_run').length;
      const newer = newerRun ? ` · newer tasks ${passCount(a, split.newer)}/${newerRun}` : '';
      return {
        agent: a.agent, model: a.model, acc: sc.acc, tasksStr: ratio(sc.passed, sc.total), run: sc.run, kind: 'local',
        sourceHtml: sourceChip(a) + (a.caveat ? ` <span title="${esc(a.caveat)}" class="chip chip-snapshot" style="cursor:help">caveats</span>` : ''),
        taskSet: !sc.run ? 'not run · counted as 0' : sc.partial
          ? (() => { const n = LOCAL_DOMAINS.reduce((s, x) => s + DOMAIN[x].tasks, 0); return n >= DOMAIN.all.tasks ? (sc.ev < DOMAIN.all.tasks ? `v0.1 · ${sc.ev} of ${n} run · rest counted as failed` : `v0.1 · ${n} tasks · latest run`) : `v0.1 · ${LOCAL_DOMAINS.join('+')} ${n} run · other ${DOMAIN.all.tasks - n} counted as 0`; })()
          : `v0.1 · ${sc.coverage || DOMAIN[dom].tasks + ' tasks'} · ${sc.trials || '1 run'}${newer}`,
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
          <tr class="${(r.run ? '' : 'not-run') + (/^omicos$/i.test(r.agent) ? ' row-omicos' : '')}">
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
  // Scatter of cost vs. resolution rate with the Pareto frontier drawn through
  // the points nothing else beats on both axes (same form as the official chart).

  const money = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : v >= 10 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(1)}` : `$${v.toFixed(2)}`);

  async function renderPareto() {
    const el = $('#bench-view-pareto');
    const off = await loadOfficialDomains();
    const pub = state.showPublic ? await loadPublic() : null;
    const dom = state.domain;
    // Life sciences: x = cost per task attempt, so one run per task (ours) and
    // three trials per task (official) sit on the same axis.
    const perAttempt = dom === 'life';
    const pts = [];
    if (pub) for (const r of pub.rows.official) {
      const sc = dom === 'all' ? { accuracy: r.overall_accuracy, cost_usd: r.cost_usd } : (off.scores[r.model] || {})[dom];
      if (sc && sc.accuracy != null && sc.cost_usd != null) pts.push({ x: perAttempt ? sc.cost_usd / sc.trials : sc.cost_usd, y: sc.accuracy, model: r.model, agent: r.agent, local: false });
    }
    if (perAttempt) {
      const d = await loadTbs();
      const split = splitTasks(d, off, dom);
      for (const a of d.arms) {
        let cells, y;
        if (hasTrials(a, split.v01)) { cells = trialsOf(a, split.v01); const sc = trialScore(a, split.v01); y = (100 * sc.passed) / sc.total; }
        else { cells = split.v01.map((t) => a.per_task[t.id]).filter((c) => c && c.status !== 'not_run'); y = (100 * passCount(a, split.v01)) / split.v01.length; }
        if (!cells.length || cells.some((c) => c.cost_usd == null)) continue;  // no token log (e.g. vals.ai cells)
        const cost = cells.reduce((s, c) => s + c.cost_usd, 0);
        pts.push({ x: cost / cells.length, y, model: a.model, agent: a.agent, local: true,
                   note: `${cells.length} attempts, ${money(cost)} total` });
      }
    }
    if (!pts.length) {
      el.innerHTML = `<p class="bench-empty">${dom === 'life' ? 'No cost data yet.' : 'Cost for ScienceInfra runs is shown under Life sciences only. Turn on "Show public leaderboards" to see the public entries here.'}</p>`;
      return;
    }
    const W = 1100, H = 520, L = 64, R = 150, T = 24, B = 56;
    const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
    const xStep = nice(Math.max(...pts.map((p) => p.x)) / 4);
    const maxX = Math.ceil(Math.max(...pts.map((p) => p.x)) / xStep) * xStep;
    const maxY = Math.min(100, Math.ceil((Math.max(...pts.map((p) => p.y)) + 4) / 20) * 20);
    const sx = (x) => L + (x / maxX) * (W - L - R);
    const sy = (y) => H - B - (y / maxY) * (H - T - B);
    const xt = []; for (let v = 0; v <= maxX + 1e-9; v += xStep) xt.push(v);
    const yt = []; for (let v = 0; v <= maxY; v += 20) yt.push(v);
    // frontier: walk by ascending cost, keep each point that raises the best rate so far
    let best = -1;
    const front = [...pts].sort((a, b) => a.x - b.x || b.y - a.y).filter((p) => (p.y > best ? ((best = p.y), true) : false));
    const onFront = new Set(front);
    // label every point unless its label box would sit on one already placed
    const placed = [];
    const labelled = [...pts].sort((a, b) => (onFront.has(b) - onFront.has(a)) || b.y - a.y).filter((p) => {
      const box = { x0: sx(p.x) + 8, x1: sx(p.x) + 8 + Math.max(p.model.length, p.agent.length) * 6.4, y0: sy(p.y) - 9, y1: sy(p.y) + 15 };
      if (placed.some((q) => box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0)) return false;
      placed.push(box); return true;
    });
    const lab = new Set(labelled);
    el.innerHTML = `
      <p class="bench-caption">Pareto frontier <span class="sub">/ ${esc(DOMAIN[dom].label)} / ${DOMAIN[dom].tasks} tasks</span></p>
      <div class="chart-card"><div class="chart-scroll">
        <svg class="pareto" viewBox="0 0 ${W} ${H}" role="img" aria-label="Resolution rate vs cost">
          ${yt.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="tick" x="${L - 10}" y="${sy(v) + 4}" text-anchor="end">${v}%</text>`).join('')}
          ${xt.map((v) => `<line class="grid" x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}"/><text class="tick" x="${sx(v)}" y="${H - B + 20}" text-anchor="middle">${money(v)}</text>`).join('')}
          <text class="axis" x="${(L + W - R) / 2}" y="${H - 10}" text-anchor="middle">${perAttempt ? 'Cost per task attempt' : 'Cost'}</text>
          <text class="axis" transform="rotate(-90 16 ${(T + H - B) / 2})" x="16" y="${(T + H - B) / 2}" text-anchor="middle">Resolution rate</text>
          <polyline class="front" points="${front.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}"/>
          ${pts.map((p) => `<g class="pt${onFront.has(p) ? ' on' : ''}${p.local ? ' local' : ''}">
            <circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${onFront.has(p) ? 4.5 : 3.5}"><title>${esc(p.model)} (${esc(p.agent)}${p.local ? ', ScienceInfra' : ''}): ${p.y.toFixed(1)}% at ${money(p.x)}${perAttempt ? ' per task attempt' : ''}${p.note ? ` (${esc(p.note)})` : ''}</title></circle>
            ${lab.has(p) ? `<text class="m" x="${(sx(p.x) + 9).toFixed(1)}" y="${(sy(p.y) + 1).toFixed(1)}">${esc(p.model)}</text><text class="a" x="${(sx(p.x) + 9).toFixed(1)}" y="${(sy(p.y) + 13).toFixed(1)}">${esc(p.agent)}</text>` : ''}
          </g>`).join('')}
        </svg>
      </div></div>
      <p class="bench-note">${perAttempt
        ? 'Cost per task attempt: the official leaderboard\'s spend divided by its trials (19 tasks × 3); for ScienceInfra runs (highlighted), the 19 v0.1 tasks run once each, priced from logged tokens at the providers\' public list prices (gpt-6.1-sol $2 / $0.10 cached / $10, gpt-5.6-luna $0.20 / $0.02 / $1.20, DeepSeek V4.1 Flash $0.15 / $0.003 / $0.60 per 1M input / cached input / output). Cache hits are measured for codex and Wisp and estimated for omicos from repeated prompt prefixes; mini-swe-agent cells published by vals.ai have no token log and are not plotted.'
        : 'Cost is the official leaderboard\'s spend for the full run (3 trials per task). ScienceInfra runs are plotted under Life sciences.'}</p>`;
  }

  // ---------------------------------------------------------------- RADAR
  // Domain table on the left, one polygon per row over the five domains on the right.

  const AXES = ['life', 'earth', 'engineering', 'mathematical', 'physical'];   // clockwise from the top, as on the official chart

  async function renderRadar() {
    const el = $('#bench-view-radar');
    const d = await loadTbs();
    const pub = state.showPublic ? await loadPublic() : null;
    const off = await loadOfficialDomains();
    const byKey = new Map();
    for (const dom of DOMAINS) for (const r of buildRows(d, pub, off, dom.id)) {
      if (r.kind === 'vals') continue;
      const k = `${r.kind}|${r.agent}|${r.model}`;
      if (!byKey.has(k)) byKey.set(k, { agent: r.agent, model: r.model, kind: r.kind, v: {} });
      byKey.get(k).v[dom.id] = r.acc;
    }
    const sel = state.domain;
    const rows = [...byKey.values()].sort((a, b) => b.v[sel] - a.v[sel] || b.v.all - a.v.all);
    // polygons: every ScienceInfra arm that scored, plus the best public rows
    const drawn = [...rows.filter((r) => r.kind === 'local' && r.v.all > 0), ...rows.filter((r) => r.kind !== 'local').slice(0, 6)];
    const S = 460, C = S / 2, RAD = 150;
    const pt = (i, f) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length; return [C + Math.cos(a) * RAD * f, C + Math.sin(a) * RAD * f]; };
    const poly = (f) => AXES.map((_, i) => pt(i, f).map((n) => n.toFixed(1)).join(',')).join(' ');
    const dashes = ['', '6 3', '2 3', '8 3 2 3', '1 4', '10 4'];
    let li = 0, pi = 0;
    const shapes = drawn.map((r) => {
      const local = r.kind === 'local';
      const style = local ? { stroke: ['#ff6308', '#ffc673', '#fff3dc', '#cf5a1e', '#a04a22'][li++ % 5], dash: '', w: 2 } : { stroke: 'rgba(255,255,255,.45)', dash: dashes[pi++ % dashes.length], w: 1.2 };
      return { r, style, points: AXES.map((a, i) => pt(i, r.v[a] / 100).map((n) => n.toFixed(1)).join(',')).join(' ') };
    });
    const sub = state.domain === 'life' ? (() => {
      const split = splitTasks(d, off, 'life');
      return `<p class="bench-caption" style="margin-top:36px">Life sciences by sub-field <span class="sub">/ ScienceInfra arms, v0.1 tasks</span></p><div class="radar-grid">${SUBDOMAIN_ORDER.map((sf) => {
        const ts = split.v01.filter((t) => t.subdomain === sf);
        return barCard(`${SUBDOMAIN_LABEL[sf]} · ${ts.length} task${ts.length === 1 ? '' : 's'}`, d.arms
          .map((a) => ({ name: `${a.agent} / ${a.model}`, kind: 'local', acc: (100 * passCount(a, ts)) / ts.length }))
          .sort((a, b) => b.acc - a.acc));
      }).join('')}</div>`;
    })() : '';
    el.innerHTML = `
      <p class="bench-caption">Domain radar <span class="sub">/ 70 official tasks</span></p>
      <div class="radar-split">
        <div class="bench-table-scroll"><table class="bench-table radar-table">
          <thead><tr><th>Model / agent</th>${DOMAINS.map((x) => `<th class="num${x.id === sel ? ' sel' : ''}">${esc(x.label.replace(' sciences', '').replace(' domains', ''))}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr class="${/^omicos$/i.test(r.agent) ? 'row-omicos' : ''}">
            <td><span class="agent">${esc(r.model)}</span><br><span class="sub">${esc(r.agent)}${r.kind === 'local' ? ' · ScienceInfra' : ''}</span></td>
            ${DOMAINS.map((x) => `<td class="num${x.id === sel ? ' sel' : ''}${r.v[x.id] === 0 ? ' zero' : ''}">${pct(r.v[x.id])}</td>`).join('')}
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="chart-card radar-chart">
          <svg viewBox="0 0 ${S} ${S}" role="img" aria-label="Resolution rate by domain">
            ${[0.2, 0.4, 0.6, 0.8, 1].map((f) => `<polygon class="ring" points="${poly(f)}"/>`).join('')}
            ${AXES.map((a, i) => { const [x, y] = pt(i, 1); const [lx, ly] = pt(i, 1.2); return `<line class="ring" x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axis" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${esc(DOMAIN[a].label.replace(' sciences', '').toUpperCase())}</text>`; }).join('')}
            ${[20, 60, 100].map((v) => `<text class="tick" x="${C + 4}" y="${(C - (RAD * v) / 100 + 3).toFixed(1)}">${v}</text>`).join('')}
            ${shapes.map((s) => `<polygon class="shape" points="${s.points}" stroke="${s.style.stroke}" stroke-width="${s.style.w}" ${s.style.dash ? `stroke-dasharray="${s.style.dash}"` : ''}><title>${esc(s.r.model)} (${esc(s.r.agent)})</title></polygon>`).join('')}
          </svg>
          <div class="radar-legend">${shapes.map((s) => `<span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="${s.style.stroke}" stroke-width="${s.style.w}" ${s.style.dash ? `stroke-dasharray="${s.style.dash}"` : ''}/></svg>${esc(s.r.model)} <i>${esc(s.r.agent)}</i></span>`).join('')}</div>
        </div>
      </div>${sub}`;
  }

  function barCard(title, rows) {
    return `<div class="radar-card"><h4>${esc(title)}</h4>${rows.map((r) => `
        <div class="radar-row">
          <span class="name" title="${esc(r.name)}">${esc(r.name)}</span>
          <span class="bar"><i style="width:${r.acc}%"></i></span>
          <span class="val">${pct(r.acc)}</span>
        </div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- MATRIX
  // Heat map: one row per model/agent, one column per task, cell = trials solved.

  async function loadOfficialMatrix() { return getJSON('data/official-matrix.json'); }

  function heat(rows, tasks, title) {
    const cell = (c) => {
      if (!c) return `<td><span class="hm hm-0 hm-na">0/0</span></td>`;
      const lvl = c.n === 0 ? 0 : Math.max(1, Math.round((3 * c.k) / c.n));
      return `<td><span class="hm hm-${c.k === 0 ? 0 : lvl}${c.n === 0 ? ' hm-na' : ''}" title="${esc(c.tip)}">${c.k}/${c.n}</span></td>`;
    };
    return `
      <p class="bench-caption">${title}</p>
      <div class="chart-card hm-scroll"><table class="heatmap">
        <thead><tr><th class="hm-corner"><span>Model / agent</span><span>Resolution rate</span></th>
          ${tasks.map((t) => `<th class="hm-task"><div><span>${esc(t.name)}</span></div></th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr class="${(r.kind === 'local' ? 'local' : '') + (/^omicos$/i.test(r.agent) ? ' row-omicos' : '')}">
          <th class="hm-row"><div><span class="who"><b>${esc(r.model)}</b><i>${esc(r.agent)}${r.kind === 'local' ? ' · ScienceInfra' : ''}</i></span><span class="rate">${pct(r.acc)}</span></div></th>
          ${r.cells.map(cell).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
  }

  async function renderMatrix() {
    const el = $('#bench-view-matrix');
    const d = await loadTbs();
    const off = await loadOfficialDomains();
    const om = await loadOfficialMatrix();
    const pub = state.showPublic ? await loadPublic() : null;
    const dom = state.domain;
    const split = splitTasks(d, off, dom);
    const idOf = Object.fromEntries(d.tasks.map((t) => [t.name, t.id]));
    const noteOf = Object.fromEntries(d.tasks.filter((t) => t.note).map((t) => [t.name, t.note]));
    const cols = om.tasks.map((t, i) => ({ ...t, i })).filter((t) => dom === 'all' || t.domain === dom);
    const rate = (cells) => { const n = cells.reduce((a, c) => a + (c.n || 1), 0); return n ? (100 * cells.reduce((a, c) => a + c.k, 0)) / n : 0; };
    // a task one of our arms did not run counts as 0 out of 0 runs
    const localCell = (a, t) => {
      const r = a.per_task[idOf[t.name]];
      const note = noteOf[t.name] ? ` (${noteOf[t.name]})` : '';
      if (!r || r.status === 'not_run') return { k: 0, n: 0, tip: `${a.agent} / ${a.model} · ${t.name}: not run, counted as 0${note}` };
      if (r.trials && r.trials.length > 1) { const k = r.trials.filter((x) => x.pass).length; return { k, n: r.trials.length, tip: `${a.agent} / ${a.model} · ${t.name}: ${k}/${r.trials.length} runs solved` }; }
      return { k: r.status === 'pass' ? 1 : 0, n: 1, tip: `${a.agent} / ${a.model} · ${t.name}: ${r.status}${r.total ? ` (${r.passed}/${r.total} tests)` : ''}${r.source ? ` · ${r.source}` : ''}` };
    };
    const rows = d.arms.map((a) => { const cells = cols.map((t) => localCell(a, t)); return { kind: 'local', agent: a.agent, model: a.model, cells, acc: rate(cells) }; });
    if (pub) for (const r of pub.rows.official) {
      const line = om.rows[r.model];
      if (!line) continue;
      const cells = cols.map((t) => ({ k: +line[t.i], n: 3, tip: `${r.model} (${r.agent}) · ${t.name}: ${line[t.i]}/3 trials solved` }));
      rows.push({ kind: 'official', agent: r.agent, model: r.model, cells, acc: rate(cells) });
    }
    rows.sort((a, b) => b.acc - a.acc || (a.kind === 'local') - (b.kind === 'local'));
    let html = heat(rows, cols, `Task matrix <span class="sub">/ ${esc(DOMAIN[dom].label)} / ${cols.length} tasks</span>`);
    if ((dom === 'all' || LOCAL_DOMAINS.includes(dom)) && split.newer.length) {
      const nrows = d.arms.map((a) => { const cells = split.newer.map((t) => localCell(a, t)); return { kind: 'local', agent: a.agent, model: a.model, cells, acc: rate(cells) }; })
        .sort((a, b) => b.acc - a.acc);
      const label = dom === 'all' ? 'Tasks added after v0.1' : `${DOMAIN[dom].label} tasks added after v0.1`;
      html += `<div style="margin-top:36px">${heat(nrows, split.newer, `${label} <span class="sub">/ ${split.newer.length} tasks / ScienceInfra arms only, not part of any rate above</span>`)}</div>`;
    }
    el.innerHTML = html + `<p class="bench-note">Cells show runs solved. Public rows are the official leaderboard's 3 trials per task; ScienceInfra rows show the runs we made per task (omicos + ds4-flash: up to 3; others: 1), and 0/0 marks a task that was not run and is counted as 0. Hover a cell for documented task limits (e.g. Lean proofs not integrated, task-rule limits).</p>`;
  }

  // ---------------------------------------------------------------- HELD-OUT (aggregate only)

  async function renderHeldout() {
    const el = $('#bench-view-heldout');
    const d = await loadHeldout();
    const dom = state.domain;
    const rows = d.arms.map((a, i) => {
      const xs = dom === 'all' ? Object.values(a.domains) : [a.domains[DOMAIN_KEY[dom]]].filter(Boolean);
      const passed = xs.reduce((n, x) => n + x.passed, 0), tasks = xs.reduce((n, x) => n + x.tasks, 0);
      const acc = tasks ? (100 * passed) / tasks : 0;
      return `<tr class="${(tasks ? '' : 'not-run') + (/^omicos$/i.test(a.agent) ? ' row-omicos' : '')}"><td class="rank">${i + 1}</td><td class="agent">${esc(a.agent)}</td><td>${esc(a.model)}</td>
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
      `ScienceInfra arms are scored on the 70 tasks of Terminal-Bench-Science v0.1 (life 19, physical 17, earth 8, mathematical 17, engineering 9), the same task sets as the official leaderboard; a task that was not run counts as failed. Our harness also runs tasks added to the task repository after v0.1: they are listed as "newer tasks" and in the matrix, and are not part of any rate.`,
      `omicos + ds4-flash is scored over up to 3 trials per task (passes / recorded trials; a task that was not run adds 3 failed trials). Life and physical sciences use fixed benchmark batches; earth, engineering and mathematical sciences use each task's 3 most recent valid runs, which come from the ongoing improvement rounds. omicos + gpt-6.1-sol is being backfilled on earth, engineering and mathematical sciences (one run per task); where only part of a domain has finished, its rate is over the tasks run and the row says how many. Under All domains every unrun task counts as failed. The other ScienceInfra arms ran life and physical sciences only. Six Lean-proof tasks are documented as task-scale limited; five of them have no harness integration (three are v0.1 mathematical tasks) and count as failed.`,
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
