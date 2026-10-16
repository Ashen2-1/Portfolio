/* Tom Li portfolio v4: point-cloud viewer + field-data charts (no dependencies) */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

  /* ---------- tooltip ---------- */
  const tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip);
  const showTip = (e, html) => { tip.innerHTML = html; tip.style.opacity = 1; moveTip(e); };
  const moveTip = (e) => {
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
    const y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  const hideTip = () => { tip.style.opacity = 0; };

  fetch('data/field.json').then(r => r.json()).then(init).catch(err => {
    console.error(err);
    const l = $('#pc-loading'); if (l) l.textContent = 'Could not load field data (open via a web server or GitHub Pages).';
  });

  function init(D) {
    imuChart(D.sessions);
    trajGrid(D.sessions);
    sessionTable(D.sessions);
    viewer(D.clouds);
  }

  /* ---------- IMU horizontal bars ---------- */
  function imuChart(S) {
    const el = $('#imu-chart'); if (!el) return;
    const max = 120;
    const rows = S.slice().sort((a, b) => a.start.localeCompare(b.start));
    el.innerHTML = rows.map(s => {
      const c = s.mode === 'walk' ? 'var(--s-b)' : 'var(--s-a)';
      return `<div class="hrow" data-id="${s.id}">
        <span class="lab">${s.short}</span>
        <span class="track"><span class="bar" style="width:${s.gyro_mean / max * 100}%;background:${c}"></span>
        <span class="p95" style="left:calc(${s.gyro_p95 / max * 100}% - 1px)"></span></span>
        <span class="val">${fmt(s.gyro_mean)}</span></div>`;
    }).join('') + `<div class="haxis"><span></span><span class="ticks">${[0, 30, 60, 90, 120].map(v => `<span style="left:${v / max * 100}%">${v}</span>`).join('')}</span><span></span></div>`;
    el.querySelectorAll('.hrow').forEach(r => {
      const s = S.find(x => x.id === r.dataset.id);
      const html = `<b>${s.short} · ${s.mode === 'walk' ? 'walking' : 'static sweep'}</b><span>mean ${fmt(s.gyro_mean, 1)} °/s · p95 ${fmt(s.gyro_p95, 1)} °/s<br>still (&lt;5 °/s): ${fmt(s.still_frac * 100, 1)}% of samples</span>`;
      r.addEventListener('pointerenter', e => showTip(e, html));
      r.addEventListener('pointermove', moveTip);
      r.addEventListener('pointerleave', hideTip);
    });
    const t = $('#imu-table');
    if (t) t.innerHTML = `<div class="tbl-scroll"><table><thead><tr><th>Session</th><th>Mode</th><th class="num">Mean °/s</th><th class="num">p95 °/s</th><th class="num">Still %</th></tr></thead><tbody>${rows.map(s => `<tr><td>${s.short}</td><td>${s.mode}</td><td class="num">${fmt(s.gyro_mean, 1)}</td><td class="num">${fmt(s.gyro_p95, 1)}</td><td class="num">${fmt(s.still_frac * 100, 1)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- trajectories small multiples (shared scale) ---------- */
  function trajGrid(S) {
    const el = $('#traj-grid'); if (!el) return;
    const walks = S.filter(s => s.mode === 'walk' && s.traj && s.traj.length > 2);
    let span = 0;
    walks.forEach(s => {
      const xs = s.traj.map(p => p[0]), ys = s.traj.map(p => p[1]);
      span = Math.max(span, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    });
    span = Math.ceil((span * 1.12) / 5) * 5;
    el.innerHTML = walks.map(s => {
      const xs = s.traj.map(p => p[0]), ys = s.traj.map(p => p[1]);
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      const W = 100, k = W / span;
      const pts = s.traj.map(p => [(p[0] - cx) * k + W / 2, W / 2 - (p[1] - cy) * k]);
      const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
      const st = pts[0];
      const bar = 10 * k;
      return `<div class="traj-cell" title="${s.short}">
        <svg viewBox="0 0 ${W} ${W}" aria-label="Trajectory ${s.short}">
          <path d="${d}" fill="none" stroke="var(--s-b)" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round" opacity=".95"/>
          <circle cx="${st[0]}" cy="${st[1]}" r="2.4" fill="#0a0b0d" stroke="var(--ink)" stroke-width="1"/>
          <line x1="6" y1="${W - 6}" x2="${6 + bar}" y2="${W - 6}" stroke="var(--ink-3)" stroke-width=".8"/>
          <text x="6" y="${W - 9}" fill="var(--ink-3)" font-size="5" font-family="JetBrains Mono, monospace">10 m</text>
        </svg>
        <div class="cap"><b>${s.short}</b><span>${fmt(s.path_len)} m · ${fmt(s.duration_s / 60, 1)} min</span></div>
      </div>`;
    }).join('');
  }

  /* ---------- session table ---------- */
  function sessionTable(S) {
    const el = $('#session-table'); if (!el) return;
    el.innerHTML = `<div class="tbl-scroll"><table><thead><tr><th>Session</th><th>Mode</th><th class="num">Duration</th><th class="num">LiDAR pts</th><th class="num">pts/s</th><th class="num">IMU Hz</th><th class="num">|a| (g)</th><th>SDK recorder</th><th class="num">Odometry path</th></tr></thead><tbody>${
      S.map(s => `<tr><td>${s.label}</td><td>${s.mode}</td><td class="num">${fmt(s.duration_s, 1)} s</td><td class="num">${fmt(s.points_total / 1e6, 1)} M</td><td class="num">${fmt(s.pts_per_s / 1000, 1)} k</td><td class="num">${fmt(s.imu_hz, 2)}</td><td class="num">${fmt(s.acc_norm_mean, 3)}</td><td>${s.sdk_fail ? 'lost sensor, recovered from pcap' : 'complete'}</td><td class="num">${s.path_len != null ? fmt(s.path_len, 1) + ' m' : '–'}</td></tr>`).join('')
    }</tbody></table></div>`;
  }

  /* ---------- WebGL point-cloud viewer ---------- */
  function viewer(clouds) {
    const canvas = $('#pc-canvas'); if (!canvas || !clouds || !clouds.length) return;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    const loading = $('#pc-loading');
    if (!gl) { loading.textContent = 'WebGL is not available in this browser.'; return; }

    const vs = `
      attribute vec3 p; attribute float r;
      uniform mat4 mvp; uniform float zmin, zmax, size, mode, clip;
      varying vec3 c; varying float k;
      vec3 ramp(float t){
        t = clamp(t,0.,1.);
        vec3 a=vec3(.12,.16,.42), b=vec3(.16,.39,.72), d=vec3(.12,.65,.66), e=vec3(.38,.82,.48), f=vec3(.85,.96,.42);
        if(t<.25) return mix(a,b,t/.25);
        if(t<.5) return mix(b,d,(t-.25)/.25);
        if(t<.75) return mix(d,e,(t-.5)/.25);
        return mix(e,f,(t-.75)/.25);
      }
      void main(){
        k = p.z - clip;
        gl_Position = mvp*vec4(p,1.);
        gl_PointSize = clamp(size / max(gl_Position.w, .5), 1.0, size * .12);
        float t = mode < .5 ? (p.z - zmin)/(zmax - zmin) : pow(r/150., .6);
        c = mode < .5 ? ramp(t) : mix(vec3(.18,.2,.24), vec3(.95,.97,.9), clamp(t,0.,1.));
      }`;
    const fs = `precision mediump float; varying vec3 c; varying float k; uniform float alpha;
      void main(){ if(k>0.) discard; vec2 q = gl_PointCoord*2.-1.; if(dot(q,q)>1.) discard; gl_FragColor = vec4(c, alpha); }`;
    const lvs = `attribute vec3 p; uniform mat4 mvp; void main(){ gl_Position = mvp*vec4(p,1.); }`;
    const lfs = `precision mediump float; uniform vec4 col; void main(){ gl_FragColor = col; }`;
    const prog = (v, f) => {
      const P = gl.createProgram();
      [[gl.VERTEX_SHADER, v], [gl.FRAGMENT_SHADER, f]].forEach(([t, s]) => {
        const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
        gl.attachShader(P, sh);
      });
      gl.linkProgram(P); return P;
    };
    const P = prog(vs, fs), L = prog(lvs, lfs);
    const loc = {
      p: gl.getAttribLocation(P, 'p'), r: gl.getAttribLocation(P, 'r'),
      mvp: gl.getUniformLocation(P, 'mvp'), zmin: gl.getUniformLocation(P, 'zmin'), zmax: gl.getUniformLocation(P, 'zmax'),
      size: gl.getUniformLocation(P, 'size'), mode: gl.getUniformLocation(P, 'mode'), alpha: gl.getUniformLocation(P, 'alpha'), clip: gl.getUniformLocation(P, 'clip'),
      lp: gl.getAttribLocation(L, 'p'), lmvp: gl.getUniformLocation(L, 'mvp'), col: gl.getUniformLocation(L, 'col')
    };
    const bufP = gl.createBuffer(), bufR = gl.createBuffer(), bufT = gl.createBuffer();

    let cur = null, n = 0, nT = 0;
    const st = { yaw: -0.6, pitch: 0.55, dist: 30, tx: 0, ty: 0, tz: 0, spin: true, traj: true, mode: 0, cut: false };
    let home = {};
    const cache = {};

    // tabs
    const tabs = $('#pc-tabs');
    tabs.innerHTML = clouds.map((c, i) => `<button role="tab" aria-selected="${i === 0}" data-i="${i}">${c.tab}</button>`).join('');
    tabs.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', x === b));
      load(clouds[+b.dataset.i]);
    });

    function load(c) {
      loading.classList.remove('hide'); loading.textContent = 'Loading points…';
      const go = buf => {
        cache[c.file] = buf;
        const N = c.n;
        const i16 = new Int16Array(buf, 0, N * 3);
        const f = new Float32Array(N * 3);
        for (let i = 0; i < N * 3; i++) f[i] = i16[i] / 100;
        const r8 = new Uint8Array(buf, N * 6, N);
        const rf = new Float32Array(N); for (let i = 0; i < N; i++) rf[i] = r8[i];
        gl.bindBuffer(gl.ARRAY_BUFFER, bufP); gl.bufferData(gl.ARRAY_BUFFER, f, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufR); gl.bufferData(gl.ARRAY_BUFFER, rf, gl.STATIC_DRAW);
        const T = new Float32Array(c.traj.flat());
        gl.bindBuffer(gl.ARRAY_BUFFER, bufT); gl.bufferData(gl.ARRAY_BUFFER, T, gl.STATIC_DRAW);
        n = N; nT = c.traj.length; cur = c;
        home = { yaw: c.view?.yaw ?? -0.6, pitch: c.view?.pitch ?? 0.6, dist: c.view?.dist ?? c.radius * 1.5, tx: 0, ty: 0, tz: 0 };
        Object.assign(st, home); st.cut = !!c.cutDefault; syncBtns();
        $('#pc-title').textContent = c.title;
        $('#pc-sub').textContent = c.sub;
        $('#pc-hmin').textContent = fmt(c.zmin, 1) + ' m';
        $('#pc-hmax').textContent = fmt(c.zmax, 1) + ' m';
        $('#pc-meta').innerHTML = c.meta.map(m => `<div><b>${m[0]}</b><span>${m[1]}</span></div>`).join('');
        loading.classList.add('hide');
      };
      if (cache[c.file]) return go(cache[c.file]);
      fetch(c.file).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(go)
        .catch(() => { loading.textContent = 'Could not load point cloud.'; });
    }

    // controls
    let drag = null; const pts = new Map();
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; st.spin = false; syncBtns(); });
    canvas.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const others = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
        const d1 = Math.hypot(prev[0] - others[0], prev[1] - others[1]), d2 = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d1 > 0) st.dist = clampD(st.dist * d1 / d2);
        return;
      }
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      if (drag && drag.pan) {
        const s = st.dist * 0.0015;
        st.tx -= (Math.cos(st.yaw) * dx) * s; st.ty -= (Math.sin(st.yaw) * dx) * s; st.tz += dy * s;
      } else {
        st.yaw -= dx * 0.006; st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch + dy * 0.006));
      }
    });
    const up = e => { pts.delete(e.pointerId); if (!pts.size) drag = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); st.dist = clampD(st.dist * Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    const clampD = d => Math.max(2, Math.min(cur ? cur.radius * 4 : 200, d));

    const bColor = $('#pc-color'), bTraj = $('#pc-traj'), bSpin = $('#pc-spin'), bCut = $('#pc-cut');
    const syncBtns = () => {
      bColor.textContent = 'Color: ' + (st.mode ? 'intensity' : 'height'); bColor.setAttribute('aria-pressed', !!st.mode);
      bTraj.textContent = 'Trajectory: ' + (st.traj ? 'on' : 'off'); bTraj.setAttribute('aria-pressed', st.traj);
      bSpin.textContent = 'Auto-rotate: ' + (st.spin ? 'on' : 'off'); bSpin.setAttribute('aria-pressed', st.spin);
      bCut.textContent = 'Ceiling: ' + (st.cut ? 'cut away' : 'shown'); bCut.setAttribute('aria-pressed', st.cut);
      $('.pc-legend').style.visibility = st.mode ? 'hidden' : 'visible';
    };
    bColor.onclick = () => { st.mode = 1 - st.mode; syncBtns(); };
    bTraj.onclick = () => { st.traj = !st.traj; syncBtns(); };
    bCut.onclick = () => { st.cut = !st.cut; syncBtns(); };
    bSpin.onclick = () => { st.spin = !st.spin; syncBtns(); };
    $('#pc-reset').onclick = () => { Object.assign(st, home); st.spin = true; syncBtns(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { st.spin = false; }
    syncBtns();

    // math
    const persp = (fov, a, n, f) => { const t = 1 / Math.tan(fov / 2), nf = 1 / (n - f); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; };
    const mul = (a, b) => { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
    const lookAt = (e, c, u) => {
      let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z = z.map(v => v / l);
      let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
    };

    let visible = true;
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      requestAnimationFrame(frame);
      if (!visible || !cur) return;
      if (st.spin) st.yaw += dt * 0.12;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = canvas.clientWidth * dpr | 0, h = canvas.clientHeight * dpr | 0;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.03, 0.035, 0.04, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      const tgt = [st.tx, st.ty, st.tz];
      const eye = [tgt[0] + st.dist * Math.cos(st.pitch) * Math.cos(st.yaw), tgt[1] + st.dist * Math.cos(st.pitch) * Math.sin(st.yaw), tgt[2] + st.dist * Math.sin(st.pitch)];
      const mvp = mul(persp(0.9, w / h, 0.1, 1000), lookAt(eye, tgt, [0, 0, 1]));
      gl.useProgram(P);
      gl.uniformMatrix4fv(loc.mvp, false, mvp);
      gl.uniform1f(loc.zmin, cur.zmin); gl.uniform1f(loc.zmax, cur.zmax);
      gl.uniform1f(loc.size, 2.2 * dpr * (h / 700) * 6); gl.uniform1f(loc.mode, st.mode); gl.uniform1f(loc.alpha, 1);
      gl.uniform1f(loc.clip, st.cut && cur.cut != null ? cur.cut : 1e6);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufP); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufR); gl.enableVertexAttribArray(loc.r); gl.vertexAttribPointer(loc.r, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.disableVertexAttribArray(loc.r);
      if (st.traj && nT > 1) {
        gl.useProgram(L); gl.disable(gl.DEPTH_TEST);
        gl.uniformMatrix4fv(loc.lmvp, false, mvp); gl.uniform4f(loc.col, 1, 1, 1, 0.95);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufT); gl.enableVertexAttribArray(loc.lp); gl.vertexAttribPointer(loc.lp, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_STRIP, 0, nT);
        gl.disableVertexAttribArray(loc.lp);
      }
    }
    load(clouds[0]);
    requestAnimationFrame(frame);
  }
})();
