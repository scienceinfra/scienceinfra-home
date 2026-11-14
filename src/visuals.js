/* Live visuals for the homepage: the black hole behind the hero and one
   simulation per verse card. Inlined into the page by build.py. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONO = '11px "Geist Mono", ui-monospace, Menlo, monospace';
  const C = { muted: '#8d867e', dim: '#59534d', text: '#f2ede5', blue: '#88a6ff', purple: '#bc97ff',
              teal: '#29c6be', green: '#91c17a', warm: '#e8a87c', sunset: '#ff6308' };
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2832 * r());
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  const caption = (ctx, w, left, right) => {
    ctx.font = MONO; ctx.textBaseline = 'top'; ctx.globalAlpha = 1;
    ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText(left, 16, 14);
    if (right) { ctx.fillStyle = C.dim; ctx.textAlign = 'right'; ctx.fillText(right, w - 16, 14); }
  };

  /* ================= black hole (WebGL) =================
     Photons are traced backwards from the camera through a Schwarzschild
     field (r_s = 1). The disk is a thin plane; every crossing adds light, so
     the far side shows up bent over the top of the shadow. */
  const FRAG = `
precision highp float;
uniform vec2 uC; uniform float uS; uniform float uT;
const float D = 24.0, RIN = 3.0, ROUT = 11.0, EL = 0.075;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float tex(vec3 q, float rr, float t){
  float om = 3.0 * pow(rr, -1.5), a = t * om, c = cos(a), s = sin(a);
  vec2 p = vec2(c * q.x - s * q.z, s * q.x + c * q.z);
  return fbm(p * 1.15) * 0.7 + fbm(p * 3.1) * 0.3;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - uC) / uS * (2.598 / D);
  vec3 ro = D * vec3(0.0, sin(EL), -cos(EL));
  vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
  vec3 p = ro, v = normalize(fw + uv.x * rt + uv.y * up);
  vec3 hc = cross(p, v); float h2 = dot(hc, hc);
  vec3 col = vec3(0.0); float acc = 0.0; bool captured = false;
  const float P = 36.0;
  float t1 = mod(uT, P), t2 = mod(uT + P * 0.5, P);
  float w1 = 1.0 - abs(t1 / P * 2.0 - 1.0);
  for (int i = 0; i < 120; i++){
    float r = length(p);
    if (r < 1.0){ captured = true; break; }
    if (r > 60.0) break;
    float dt = max(0.03, 0.11 * (r - 0.9));
    v += -1.5 * h2 * p / pow(r, 5.0) * dt;
    vec3 np = p + v * dt;
    if (p.y * np.y < 0.0){
      vec3 q = mix(p, np, p.y / (p.y - np.y));
      float rr = length(q.xz);
      if (rr > RIN && rr < ROUT){
        float x = (rr - RIN) / (ROUT - RIN);
        float n = mix(tex(q, rr, t2), tex(q, rr, t1), w1);
        float I = pow(1.0 - x, 2.4) * (0.25 + 1.5 * n * n) * smoothstep(0.0, 0.05, x);
        vec3 tang = normalize(vec3(-q.z, 0.0, q.x));
        float beta = 0.52 * sqrt(RIN / rr);
        float dop = 1.0 / (1.0 - beta * dot(tang, -normalize(v)));
        I *= dop * dop * dop;
        vec3 c = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.86, 0.66), pow(1.0 - x, 2.5));
        float a = clamp(I * 1.3, 0.0, 1.0);
        col += (1.0 - acc) * c * I * 1.5 * a;
        acc += (1.0 - acc) * a * 0.92;
      }
    }
    p = np;
  }
  if (!captured){
    vec3 d = normalize(v);
    vec2 sp = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 70.0;
    vec2 id = floor(sp), f = fract(sp) - 0.5;
    float hsh = hash(id);
    float star = step(0.94, hsh) * smoothstep(0.16, 0.0, length(f + (vec2(hash(id + 3.1), hash(id + 9.7)) - 0.5) * 0.6));
    col += (1.0 - acc) * vec3(0.85, 0.9, 1.0) * star * (0.25 + 0.75 * hash(id + 1.7));
  }
  col = 1.0 - exp(-col * 1.05);
  gl_FragColor = vec4(col, 1.0);
}`;

  const bh = document.getElementById('bh');
  let drawHole = null;
  if (bh) {
    const gl = bh.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (gl) {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog); gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const uC = gl.getUniformLocation(prog, 'uC'), uS = gl.getUniformLocation(prog, 'uS'), uT = gl.getUniformLocation(prog, 'uT');
      let q = 1, cx = 0, cy = 0, S = 1;
      const layout = () => {
        const r = bh.getBoundingClientRect();
        if (!r.width) return;
        q = Math.min(1, 1100 / r.width) * 0.8;                 // render scale: keep the buffer under ~0.6 MP
        bh.width = Math.round(r.width * q); bh.height = Math.round(r.height * q);
        gl.viewport(0, 0, bh.width, bh.height);
        // Centre the shadow on the headline block so the text sits in the dark.
        const lede = document.querySelector('.lede').getBoundingClientRect();
        const cta = document.querySelector('.cta').getBoundingClientRect();
        cx = r.width / 2; cy = (lede.bottom + cta.top) / 2 - r.top - 8;
        S = Math.min(240, r.width * 0.4);
      };
      drawHole = t => {
        gl.uniform2f(uC, cx * q, bh.height - cy * q); gl.uniform1f(uS, S * q); gl.uniform1f(uT, t);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      layout();
      let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); drawHole(performance.now() / 1000); }, 150); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); });
    } else bh.remove();
  }

  /* ================= card simulations ================= */
  const VIZ = {};

  /* socialverse: an event-study plot drawn coefficient by coefficient */
  VIZ.event = (w, h) => {
    const r = rng(23), ks = [];
    for (let k = -6; k <= 8; k++) {
      const post = k >= 0, b = k === -1 ? 0 : post ? .13 * (1 - Math.exp(-(k + 1) / 2.6)) + gauss(r) * .008 : gauss(r) * .012;
      ks.push({ k, b, se: k === -1 ? 0 : .022 + (post ? .004 * k : .002 * -k) });
    }
    return (ctx, t) => {
      const T = 11, u = t % T, L = 44, R = w - 18, top = 44, bot = h - 62;
      const fade = u > T - 1 ? T - u : 1;
      const X = k => L + (k + 6) / 14 * (R - L), Y = v => bot - (v + .06) / .26 * (bot - top);
      ctx.font = MONO; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
      ctx.globalAlpha = .12 * fade; ctx.strokeStyle = '#fff';
      [0, .1].forEach(v => { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke(); });
      ctx.globalAlpha = fade; ctx.fillStyle = C.dim; ctx.textAlign = 'right';
      ctx.fillText('0', L - 8, Y(0)); ctx.fillText('0.1', L - 8, Y(.1));
      ctx.setLineDash([3, 4]); ctx.globalAlpha = .35 * fade; ctx.strokeStyle = C.warm;
      ctx.beginPath(); ctx.moveTo(X(-.5), top - 6); ctx.lineTo(X(-.5), bot + 4); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = fade; ctx.fillStyle = C.warm; ctx.textAlign = 'left'; ctx.fillText('policy', X(-.5) + 6, top - 2);
      const shown = u / 4.5 * ks.length;
      const bandA = ease((u - 5) / 1) * fade;
      if (bandA > 0) {
        ctx.globalAlpha = .12 * bandA; ctx.fillStyle = C.warm; ctx.beginPath();
        ks.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](X(p.k), Y(p.b + 1.96 * p.se)));
        [...ks].reverse().forEach(p => ctx.lineTo(X(p.k), Y(p.b - 1.96 * p.se))); ctx.fill();
        ctx.globalAlpha = .7 * bandA; ctx.strokeStyle = C.warm; ctx.beginPath();
        ks.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](X(p.k), Y(p.b))); ctx.stroke();
      }
      ks.forEach((p, i) => {
        const a = ease(shown - i) * fade; if (a <= 0) return;
        const col = p.k >= 0 ? C.warm : '#cfcac2';
        ctx.globalAlpha = a * .7; ctx.strokeStyle = col;
        ctx.beginPath(); ctx.moveTo(X(p.k), Y(p.b + 1.96 * p.se)); ctx.lineTo(X(p.k), Y(p.b - 1.96 * p.se)); ctx.stroke();
        ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(p.k), Y(p.b), 2.6, 0, 6.2832); ctx.fill();
      });
      ctx.globalAlpha = fade; ctx.fillStyle = C.dim; ctx.textAlign = 'center';
      [-6, -3, 0, 3, 6].forEach(k => ctx.fillText(k > 0 ? '+' + k : '' + k, X(k), bot + 14));
      caption(ctx, w, 'event study · staggered DiD', u > 6 ? 'pre-trends flat ✓' : 'estimating');
    };
  };

  /* physverse: a 2D Ising model, Metropolis updates, temperature swept through T_c */
  VIZ.ising = (w, h) => {
    const cell = 3, gx = Math.ceil(w / cell), gy = Math.ceil((h - 30) / cell), N = gx * gy, r = rng(31);
    const s = new Int8Array(N); for (let i = 0; i < N; i++) s[i] = r() < .5 ? 1 : -1;
    const off = document.createElement('canvas'); off.width = gx; off.height = gy;
    const octx = off.getContext('2d'), img = octx.createImageData(gx, gy);
    let m = 0;
    return (ctx, t) => {
      const T = 2.27 + .75 * Math.sin(t * 6.2832 / 26 + 2.2), e4 = Math.exp(-4 / T), e8 = Math.exp(-8 / T);
      for (let n = 0; n < N * .7; n++) {
        const i = (Math.random() * N) | 0, x = i % gx, y = (i / gx) | 0;
        const nb = s[y * gx + (x + 1) % gx] + s[y * gx + (x + gx - 1) % gx] + s[((y + 1) % gy) * gx + x] + s[((y + gy - 1) % gy) * gx + x];
        const dE = 2 * s[i] * nb;
        if (dE <= 0 || Math.random() < (dE === 4 ? e4 : e8)) s[i] = -s[i];
      }
      let sum = 0; const d = img.data;
      for (let i = 0; i < N; i++) { sum += s[i]; const o = i * 4; d[o] = 232; d[o + 1] = 234; d[o + 2] = 240; d[o + 3] = s[i] > 0 ? 200 : 0; }
      m += (Math.abs(sum) / N - m) * .08;
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.globalAlpha = .9;
      ctx.drawImage(off, 0, 36, gx * cell, gy * cell);
      caption(ctx, w, '2D Ising · Metropolis', `T = ${T.toFixed(2)}   |m| = ${m.toFixed(2)}`);
    };
  };

  /* astroverse: a planet crosses its star and the light curve dips */
  VIZ.transit = (w, h) => {
    const r = rng(41), P = 8, noise = Array.from({ length: 150 }, () => gauss(r) * .0016);
    const model = q => { const dd = Math.abs(q - .5) * 7.5, cv = ease((1 + .14 - dd) / .28);
      return 1 - .016 * cv * (1 - .45 * (1 - Math.sqrt(Math.max(0, 1 - Math.min(1, dd) ** 2)))); };
    return (ctx, t) => {
      const wide = w > 480, R = wide ? Math.min(h * .25, w * .11) : h * .17;
      const sx = wide ? w * .19 : w / 2, sy = wide ? (h - 44) / 2 + 12 : h * .3, rp = R * .14;
      const ph = (t % P) / P, px = sx + (ph - .5) * 7.5 * R, d = Math.abs(px - sx) / R;
      const cover = ease((1 + rp / R - d) / (2 * rp / R));
      const flux = 1 - .016 * cover * (1 - .45 * (1 - Math.sqrt(Math.max(0, 1 - Math.min(1, d) ** 2))));
      // star
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 2.3);
      g.addColorStop(0, 'rgba(255,196,120,.22)'); g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(sx - R * 2.4, sy - R * 2.4, R * 4.8, R * 4.8);
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      sg.addColorStop(0, '#fff3dc'); sg.addColorStop(.6, '#ffc778'); sg.addColorStop(1, '#f08a2c');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, R, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.arc(px, sy + R * .18, rp, 0, 6.2832); ctx.fill();
      // light curve
      const L = wide ? w * .4 : 20, Rr = w - 20, top = wide ? 52 : h * .56, bot = wide ? h - 72 : h - 66;
      const X = p => L + p * (Rr - L), Y = f => top + (1.004 - f) / .026 * (bot - top);
      ctx.font = MONO; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineWidth = 1;
      ctx.globalAlpha = .1; ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(L, Y(1)); ctx.lineTo(Rr, Y(1)); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = C.dim; ctx.fillText('1.000', L, Y(1) - 10); ctx.fillText('0.984', L, Y(.984));
      ctx.fillStyle = '#cfcac2';
      for (let i = 0; i < noise.length; i++) { const q = (i + .5) / noise.length; if (q > ph) break;
        ctx.globalAlpha = .7; ctx.fillRect(X(q) - 1, Y(model(q) + noise[i]) - 1, 2, 2); }
      ctx.globalAlpha = .9; ctx.strokeStyle = '#ffc778'; ctx.beginPath();
      for (let i = 0; i <= 160; i++) { const q = i / 160; if (q > ph) break; ctx[i ? 'lineTo' : 'moveTo'](X(q), Y(model(q))); }
      ctx.stroke();
      caption(ctx, w, 'astv.ts.bls(t, flux, dy, grid)', cover > .5 ? 'in transit' : 'depth 1.6%');
    };
  };

  /* ================= one object, three sciences =================
     The same particles are rearranged from an embryo (cells) to a crystal
     (materials) to a stack of light curves (sources). */
  const orb = document.getElementById('orb');
  let drawOrb = null, orbOn = false;
  if (orb) {
    const raw = atob('{{EMBRYO_B64}}'), N = raw.length / 4;
    const PALS = ['#fff3dc', '#ffdca0', '#ffc673', '#ffa24f', '#f57f2c', '#cf5a1e', '#a04a22', '#b5aba0', '#8d857d', '#d6cdc2', '#6f6861'];
    const col = new Array(N), shapes = [new Float32Array(N * 3), new Float32Array(N * 3), new Float32Array(N * 3)];
    const i8 = c => { const b = raw.charCodeAt(c); return (b > 127 ? b - 256 : b) / 127; };
    const r = rng(77), delay = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      col[i] = PALS[raw.charCodeAt(i * 4 + 3)]; delay[i] = r() * .5;
      shapes[0][i * 3] = i8(i * 4) * .95; shapes[0][i * 3 + 1] = -i8(i * 4 + 1) * .95; shapes[0][i * 3 + 2] = i8(i * 4 + 2) * .95;
      // crystal: 14 x 14 x 13 lattice
      const j = i % 2548, a = j % 14, b = ((j / 14) | 0) % 14, c = (j / 196) | 0;
      shapes[1][i * 3] = (a - 6.5) / 6.5 * .68; shapes[1][i * 3 + 1] = (b - 6.5) / 6.5 * .68; shapes[1][i * 3 + 2] = (c - 6) / 6 * .68;
      // light curves: 13 sources, 200 samples each, each with its own transit depth
      const src = i % 13, q = ((i / 13) | 0) / 200, dd = Math.abs(q - .5) * 9, cv = ease((1.15 - dd) / .3);
      shapes[2][i * 3] = (q - .5) * 2.1; shapes[2][i * 3 + 1] = -.25 + cv * (.18 + src * .022) + gauss(r) * .018; shapes[2][i * 3 + 2] = (src - 6) / 6 * .7;
    }
    const names = ['cells · mouse embryo E8.5', 'materials · crystal lattice', 'sources · transit light curves'];
    const label = document.getElementById('orb-label'), keys = [...document.querySelectorAll('.anatomy [data-k]')];
    let shown = -1, octx, ow, oh, od;
    const sizeOrb = () => { od = Math.min(devicePixelRatio || 1, 2); const b = orb.getBoundingClientRect(); if (!b.width) return;
      orb.width = b.width * od; orb.height = b.height * od; ow = b.width; oh = b.height; octx = orb.getContext('2d'); };
    sizeOrb(); addEventListener('resize', () => setTimeout(sizeOrb, 160));
    new IntersectionObserver(es => { orbOn = es[0].isIntersecting; }, { threshold: .05 }).observe(orb);
    drawOrb = t => {
      if (!octx) return;
      const HOLD = 5.5, MOVE = 2.2, T = HOLD + MOVE, k = Math.floor(t / T) % 3, u = t % T, nx = (k + 1) % 3;
      const active = u > HOLD + MOVE / 2 ? nx : k;
      if (active !== shown) { shown = active; label.textContent = names[active]; keys.forEach(e => e.classList.toggle('on', +e.dataset.k === active)); }
      const A = shapes[k], B = shapes[nx], m0 = (u - HOLD) / MOVE;
      const ang = t * .16, ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(.3), st = Math.sin(.3);
      const R = Math.min(ow, oh) * .40, cx = ow * .56, cy = oh * .40;
      octx.setTransform(od, 0, 0, od, 0, 0); octx.clearRect(0, 0, ow, oh); octx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        const m = m0 <= 0 ? 0 : ease((m0 * 1.5 - delay[i]) / 1), j = i * 3;
        const x = A[j] + (B[j] - A[j]) * m, y = A[j + 1] + (B[j + 1] - A[j + 1]) * m, z = A[j + 2] + (B[j + 2] - A[j + 2]) * m;
        const X = x * ca - z * sa, Z = x * sa + z * ca, Y = y * ct - Z * st, Z2 = y * st + Z * ct, f = 3.2 / (3.2 + Z2), dp = (1 - Z2) / 2;
        const sz = (.7 + dp * 1.5) * f;
        octx.globalAlpha = .18 + dp * .7; octx.fillStyle = col[i];
        octx.fillRect(cx + X * R * f - sz / 2, cy + Y * R * f - sz / 2, sz, sz);
      }
      octx.globalCompositeOperation = 'source-over'; octx.globalAlpha = 1;
    };
  }

  const cards = [...document.querySelectorAll('canvas[data-viz]')].map(cv => ({ cv, on: false, draw: null }));
  const size = c => {
    const d = Math.min(devicePixelRatio || 1, 2), r = c.cv.getBoundingClientRect();
    if (!r.width) return;
    c.cv.width = r.width * d; c.cv.height = r.height * d; c.w = r.width; c.h = r.height; c.d = d;
    c.ctx = c.cv.getContext('2d'); c.draw = VIZ[c.cv.dataset.viz](r.width, r.height);
  };
  cards.forEach(size);
  let rt2; addEventListener('resize', () => { clearTimeout(rt2); rt2 = setTimeout(() => cards.forEach(size), 150); });
  const io = new IntersectionObserver(es => es.forEach(e => { const c = cards.find(k => k.cv === e.target); if (c) c.on = e.isIntersecting; }), { threshold: .05 });
  cards.forEach(c => io.observe(c.cv));
  // videos play only while on screen
  const vids = [...document.querySelectorAll('.card video')];
  const vio = new IntersectionObserver(es => es.forEach(e => { e.isIntersecting && !reduce ? e.target.play().catch(() => {}) : e.target.pause(); }), { threshold: .05 });
  vids.forEach(x => vio.observe(x));
  // each card alternates between its visual and its code, out of step with its neighbours
  if (!reduce) {
    const cs = [...document.querySelectorAll('.card')];
    setInterval(() => { const t = performance.now() / 1000;
      cs.forEach((c, i) => c.classList.toggle('show-code', ((t + i * 3.4) % 17) > 10.5)); }, 400);
  }
  let holeOn = true;
  if (bh && bh.isConnected) new IntersectionObserver(es => { holeOn = es[0].isIntersecting; }, { threshold: 0 }).observe(bh);

  let lastHole = 0;
  const frame = now => {
    const t = now / 1000;
    if (drawHole && holeOn && now - lastHole > 30) { drawHole(t); lastHole = now; }
    for (const c of cards) {
      if (!c.draw || !(c.on || reduce)) continue;
      c.ctx.setTransform(c.d, 0, 0, c.d, 0, 0); c.ctx.clearRect(0, 0, c.w, c.h);
      c.draw(c.ctx, reduce ? 7.5 : t);
    }
    if (drawOrb && (orbOn || reduce)) drawOrb(reduce ? 2 : t);
    if (!reduce) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
