/* The cabinet.
   One WebGL2 context, never on screen. Each frame it ray-marches the person into a texture pinned to the
   middle of the viewport (or takes the camera or a photo instead), then renders every visible mirror's
   glass and copies it into that mirror's own canvas. Those canvases are position: fixed inside an element
   with clip-path, so the browser itself slides the glass over the person while scrolling: the person
   never moves, the mirrors do. */
(function () {
  'use strict';
  const SK = window.SK;
  const qs = new URLSearchParams(location.search);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, qs.has('dpr') ? +qs.get('dpr') : 1.5);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const root = document.documentElement;

  /* ---------------- who appears in which mirror ---------------- */
  const TROLL_LOOK = { skin: [0.20, 0.27, 0.10], iris: [0.42, 0.30, 0.02] };
  const VARIANTS = {
    hero: { p: { smile: 0.3 } },
    fog: { p: { lid: 0.85, hairMess: 1.1, hairVol: 0.45, smile: -0.05, under: 0.8, brow: -0.25, open: 0.05 },
      l: { keyDir: [0.05, 0.9, 0.5], keyCol: [1.35, 1.28, 1.15], amb: [0.12, 0.12, 0.12] } },
    water: { p: { smile: 0.5, lid: -0.05, eye: 1.06, under: 0, cheek: -0.25, hairMess: 0.45, pitch: 0.1 },
      l: { keyDir: [0.1, 1.0, 0.4], keyCol: [1.15, 1.25, 1.35], fillCol: [0.26, 0.3, 0.32], skin: [0.66, 0.43, 0.33] } },
    fun: { p: { smile: 1, open: 0.45, brow: 0.6, lid: 0.45 }, l: { keyCol: [1.4, 1.15, 0.9], rimCol: [0.8, 0.3, 0.3] } },
    portrait: { p: { yaw: 0.32, smile: 0.08 }, follow: 0.12,
      l: { keyDir: [-0.85, 0.55, 0.45], keyCol: [1.5, 1.22, 0.9], fillCol: [0.08, 0.07, 0.06], amb: [0.05, 0.04, 0.03], rimCol: [0.15, 0.12, 0.1] },
      dyn: (m) => { const a = m.age || 0; return { age: a, under: 0.15 + a, brow: -0.6 * a, smile: 0.08 - 0.5 * a, troll: 0.14 * a, lid: 0.1 + 0.3 * a, hairVol: 0.8 - 0.5 * a, hairMess: 0.7 - 0.4 * a }; } },
    shards: { p: { worry: 1, brow: -0.3, smile: -0.35, lid: -0.1 }, l: { keyDir: [0, 1, 0.3], keyCol: [1.1, 1.25, 1.2] } },
    phone: { p: { lid: 0.6, under: 1, glow: 0.9, smile: -0.15, pitch: 0.2 },
      l: { keyCol: [0.3, 0.33, 0.4], fillCol: [0.06, 0.07, 0.1], amb: [0.03, 0.03, 0.04], rimCol: [0.1, 0.12, 0.2] } },
    portal: { p: { smile: 0.15 }, invert: 1, l: { rimCol: [0.3, 0.8, 0.9], keyCol: [1.1, 1.15, 1.35], skin: [0.52, 0.38, 0.36] } },
    magic: { p: { smile: 0.6, brow: 0.3 },
      l: { keyDir: [0, -0.5, 0.85], keyCol: [0.9, 1.25, 1.0], fillCol: [0.1, 0.05, 0.15], amb: [0.04, 0.03, 0.06], rimCol: [0.4, 0.7, 0.6] },
      dyn: (m) => ({ troll: m.troll || 0, smile: 0.6 + 0.3 * (m.troll || 0), open: 0.25 * (m.troll || 0) }) },
    plain: { p: { smile: 0.22 } }
  };
  const KEYS = SK.HEAD_KEYS, NK = KEYS.length;
  const LOOK_KEYS = ['skin', 'hair', 'iris', 'cloth', 'keyDir', 'keyCol', 'fillCol', 'rimCol', 'amb'];

  /* ---------------- GL ---------------- */
  const glc = document.createElement('canvas');
  const gl = glc.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl || qs.has('nogl')) { root.classList.add('no-gl'); return; }
  root.classList.add('gl');
  const parallel = gl.getExtension('KHR_parallel_shader_compile');

  const VS = `#version 300 es
in vec2 a; void main(){ gl_Position=vec4(a,0.,1.); }`;
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function program(fs, name) {
    const p = gl.createProgram();
    const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s); return s; };
    const v = mk(gl.VERTEX_SHADER, VS), f = mk(gl.FRAGMENT_SHADER, fs);
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    const prog = { p, ok: null, locs: {}, name,
      ready() {
        if (this.ok !== null) return this.ok;
        if (parallel && !gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR)) return false;
        this.ok = !!gl.getProgramParameter(p, gl.LINK_STATUS);
        if (!this.ok) console.warn(name, gl.getShaderInfoLog(f) || gl.getProgramInfoLog(p));
        return this.ok;
      },
      u(n) { if (!(n in this.locs)) this.locs[n] = gl.getUniformLocation(p, n); return this.locs[n]; } };
    return prog;
  }
  const headProg = program(SK.headFrag, 'head');
  const photoProg = program(SK.photoFrag, 'photo');
  const maskProg = program(SK.fogMaskFrag, 'fog mask');
  const glassProgs = {};
  for (const k in SK.glass) glassProgs[k] = program(SK.glassPrelude + SK.glass[k], k);

  function texture(w, h, fmt, mips) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    const R8 = fmt === 'r8';
    gl.texImage2D(gl.TEXTURE_2D, 0, R8 ? gl.R8 : gl.RGBA8, w, h, 0, R8 ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, fb, w, h };
  }
  const emptyTex = texture(1, 1, 'rgba');

  /* ---------------- viewport and the pinned person ---------------- */
  let vw = 0, vh = 0, head = { x: 0, y: 0, w: 0, h: 0 }, headTex = null, quality = qs.has('q') ? +qs.get('q') : 0.8;
  function layout() {
    vw = root.clientWidth; vh = window.innerHeight;
    const H = Math.min(vh * 0.66, vw * 1.08), W = H * 0.8;
    head = { w: W, h: H, x: (vw - W) / 2, y: vh / 2 - 0.4 * H };
    root.style.setProperty('--hh', H.toFixed(1) + 'px');
    root.style.setProperty('--hw', W.toFixed(1) + 'px');
    glc.width = Math.round(vw * DPR); glc.height = Math.round(vh * DPR);
    for (const m of mirrors) if (m.near) sizeCanvas(m);
    makeHeadTex();
    dirty = true;
  }
  function makeHeadTex() {
    const s = source === 'sdf' ? quality : 1;
    const w = Math.max(64, Math.round(head.w * DPR * s)), h = Math.max(80, Math.round(head.h * DPR * s));
    if (headTex && headTex.w === w && headTex.h === h) return;
    if (headTex) { gl.deleteTexture(headTex.t); gl.deleteFramebuffer(headTex.fb); }
    headTex = texture(w, h, 'rgba', true);
    dirty = true;
  }

  /* ---------------- pointer, gaze, blinking ---------------- */
  const ptr = { x: 0, y: 0, has: false, last: 0, down: false };
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  let wanderAt = 0, blinkAt = performance.now() + 2500, blinkT = -1;
  addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.has = true; ptr.last = performance.now(); }, { passive: true });
  addEventListener('pointerdown', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.has = true; ptr.last = performance.now(); ptr.down = true; }, { passive: true });
  addEventListener('pointerup', () => { ptr.down = false; }, { passive: true });
  document.addEventListener('pointerleave', () => { ptr.has = false; });

  function updateLook(now, dt) {
    const idle = !ptr.has || now - ptr.last > 4000;
    if (!idle) {
      look.tx = clamp((ptr.x - vw / 2) / (vw / 2), -1.2, 1.2);
      look.ty = clamp((ptr.y - vh / 2) / (vh / 2), -1.2, 1.2);
    } else if (now > wanderAt && !REDUCED) {
      look.tx = (Math.random() * 2 - 1) * 0.6; look.ty = (Math.random() * 2 - 1) * 0.35;
      wanderAt = now + 1600 + Math.random() * 2600;
    }
    const k = 1 - Math.exp(-dt * (idle ? 3 : 7));
    look.x += (look.tx - look.x) * k; look.y += (look.ty - look.y) * k;
    if (now > blinkAt && blinkT < 0) { blinkT = now; }
    let blink = 0;
    if (blinkT >= 0) {
      const u = (now - blinkT) / 170;
      if (u >= 1) { blinkT = -1; blinkAt = now + 2200 + Math.random() * 4200; } else blink = Math.sin(Math.PI * u);
    }
    return blink;
  }

  /* ---------------- mirrors ---------------- */
  const mirrors = [];
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      const m = e.target.__mirror; m.near = e.isIntersecting;
      if (m.near) sizeCanvas(m); else { m.canvas.width = 1; m.canvas.height = 1; }
    }
  }, { rootMargin: '30% 0px' });
  function sizeCanvas(m) {
    if (m.canvas.width !== glc.width || m.canvas.height !== glc.height) { m.canvas.width = glc.width; m.canvas.height = glc.height; }
  }
  function localPtr(m, e) {
    const r = m.el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height, px: e.clientX - r.left, py: r.bottom - e.clientY, r };
  }

  /* ---------------- what each kind of mirror does on its own ---------------- */
  const BEHAVIOUR = {
    fog: {
      init(m) {
        const s = m.state; s.w = 256; s.h = 256; s.cur = 0; s.ready = false;
        s.stroke = []; s.auto = null; s.autoDone = false;
        const add = (e) => {
          const p = localPtr(m, e);
          if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) { s.last = null; return; }
          if (e.pointerType !== 'mouse' && e.buttons === 0 && e.type === 'pointermove') return;
          s.stroke.push([s.last || [p.x, p.y], [p.x, p.y]]); s.last = [p.x, p.y];
          s.touched = true;
        };
        m.el.addEventListener('pointermove', add);
        m.el.addEventListener('pointerdown', (e) => { s.last = null; add(e); });
        m.el.addEventListener('pointerleave', () => { s.last = null; });
      },
      frame(m, dt, now) {
        const s = m.state, r = m.rect;
        const h = Math.max(64, Math.round(256 * r.height / r.width));
        if (!s.ready || s.h !== h) {
          if (s.tex) s.tex.forEach((t) => { gl.deleteTexture(t.t); gl.deleteFramebuffer(t.fb); });
          s.h = h; s.tex = [texture(s.w, h, 'r8'), texture(s.w, h, 'r8')]; s.ready = true; s.reset = true;
        }
        /* the first time the mirror is centred, a hand wipes a band across the eyes */
        if (!s.autoDone && Math.abs(m.prog - 0.5) < 0.08 && !s.touched) { s.autoDone = true; s.auto = now; }
        if (s.auto !== null) {
          /* walk the whole path even if frames are slow, in short segments */
          const u = Math.min(1, (now - s.auto) / 900), u0 = s.autoU || 0;
          const path = (t) => [0.1 + 0.8 * t, 0.5 + 0.03 * Math.sin(t * 6.3)];
          for (let t = u0; t < u; t += 0.05) s.stroke.push([path(t), path(Math.min(u, t + 0.05))]);
          s.autoU = u; if (u >= 1) s.auto = null;
        }
        if (!maskProg.ready()) return;
        const steps = Math.max(1, s.stroke.length);
        for (let i = 0; i < steps; i++) {
          const seg = s.stroke[i];
          const src = s.tex[s.cur], dst = s.tex[1 - s.cur];
          gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, s.w, s.h); gl.disable(gl.SCISSOR_TEST);
          gl.useProgram(maskProg.p);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t);
          gl.uniform1i(maskProg.u('uPrev'), 0);
          gl.uniform2f(maskProg.u('uSize'), s.w, s.h);
          gl.uniform2f(maskProg.u('uA0'), seg ? seg[0][0] : 0, seg ? seg[0][1] : 0);
          gl.uniform2f(maskProg.u('uA1'), seg ? seg[1][0] : 0, seg ? seg[1][1] : 0);
          gl.uniform1f(maskProg.u('uRad'), 0.1);
          gl.uniform1f(maskProg.u('uDt'), i === 0 ? (REDUCED ? dt * 0.3 : dt) : 0);
          gl.uniform1f(maskProg.u('uWipe'), seg ? 1 : 0);
          gl.uniform1f(maskProg.u('uAspect'), r.width / r.height);
          gl.uniform1f(maskProg.u('uReset'), s.reset ? 1 : 0); s.reset = false;
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          s.cur = 1 - s.cur;
        }
        s.stroke.length = 0;
        m.aux = s.tex[s.cur].t;
      }
    },
    water: {
      init(m) {
        const s = m.state; s.rip = new Float32Array(32); s.n = 0; s.lastAdd = 0; s.ambient = 0;
        const add = (e, amp) => {
          const p = localPtr(m, e); const now = performance.now();
          if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
          if (amp < 1 && now - s.lastAdd < 140) return;
          s.lastAdd = now; drop(m, p.px, p.py, amp);
        };
        m.el.addEventListener('pointermove', (e) => add(e, 0.35));
        m.el.addEventListener('pointerdown', (e) => add(e, 1));
      },
      frame(m, dt, now) {
        const s = m.state;
        if (!REDUCED && now > s.ambient) {
          s.ambient = now + 2200 + Math.random() * 2600;
          drop(m, Math.random() * m.rect.width, Math.random() * m.rect.height, 0.3);
        }
      }
    },
    portrait: { frame(m) { m.age = smooth(0.4, 0.8, m.prog); m.a[0] = m.age; } },
    shards: {
      init(m) {
        const s = m.state; s.years = 7; s.ix = 0; s.iy = 0; s.seed = 3.7;
        s.count = m.el.parentElement.querySelector('[data-years]') || document.querySelector('[data-years]');
        m.el.addEventListener('click', (e) => {
          const p = localPtr(m, e);
          s.ix = p.px; s.iy = p.py; s.seed = Math.random() * 50; s.years += 7; s.set = true;
          if (s.count) s.count.textContent = s.years;
          m.el.classList.remove('hit'); void m.el.offsetWidth; m.el.classList.add('hit');
        });
      },
      frame(m) {
        const s = m.state;
        if (!s.set) { s.ix = m.rect.width * 0.62; s.iy = m.rect.height * 0.58; }
        m.a = [s.ix, s.iy, s.seed, 0];
      }
    },
    phone: {
      init(m) { m.state.on = 0; m.state.force = null; m.el.addEventListener('click', () => { m.state.force = m.state.on > 0.5 ? 0 : 1; }); },
      frame(m, dt) {
        const s = m.state;
        if (Math.abs(m.prog - 0.5) > 0.3) s.force = null;
        const target = s.force !== null ? s.force : (m.prog > 0.62 ? 1 : 0);
        s.on += (target - s.on) * (1 - Math.exp(-dt * 6));
        m.a[0] = s.on;
        m.el.style.setProperty('--on', s.on.toFixed(3));
      }
    },
    magic: {
      frame(m) {
        const show = smooth(0.22, 0.42, m.prog), troll = smooth(0.52, 0.74, m.prog);
        m.a[0] = show; m.troll = troll;
        const stage = m.prog < 0.4 ? 0 : m.prog < 0.56 ? 1 : 2;
        if (m.state.stage !== stage) { m.state.stage = stage; m.el.dataset.stage = stage; }
      }
    }
  };
  function drop(m, x, y, amp) {
    const s = m.state, i = (s.n++ % 8) * 4;
    s.rip[i] = x; s.rip[i + 1] = y; s.rip[i + 2] = clock; s.rip[i + 3] = amp;
  }

  /* ---------------- the person's parameters for this scroll position ---------------- */
  const P = new Float32Array(NK), lastP = new Float32Array(NK).fill(NaN);
  const LK = {}; LOOK_KEYS.forEach((k) => (LK[k] = [0, 0, 0]));
  let globalTroll = 0, trollTarget = 0;
  function blend(blink) {
    const base = SK.headBase, lb = SK.lookBase;
    let wsum = 0.03;
    const acc = new Float32Array(NK); KEYS.forEach((k, i) => (acc[i] = base[k] * 0.03));
    const lacc = {}; LOOK_KEYS.forEach((k) => (lacc[k] = lb[k].map((v) => v * 0.03)));
    let follow = 0.03, invert = 0;
    for (const m of mirrors) {
      if (!m.rect) continue;
      const dy = (m.rect.top + m.rect.height / 2 - vh / 2) / vh;
      const w = Math.exp(-dy * dy * 9);
      if (w < 1e-3) continue;
      const v = VARIANTS[m.variant] || VARIANTS.plain;
      const dyn = v.dyn ? v.dyn(m) : null;
      KEYS.forEach((k, i) => {
        let x = base[k];
        if (v.p && k in v.p) x = v.p[k];
        if (dyn && k in dyn) x = dyn[k];
        acc[i] += x * w;
      });
      LOOK_KEYS.forEach((k) => { const src = (v.l && v.l[k]) || lb[k]; for (let j = 0; j < 3; j++) lacc[k][j] += src[j] * w; });
      follow += (v.follow !== undefined ? v.follow : 1) * w;
      invert += (v.invert || 0) * w;
      wsum += w;
    }
    for (let i = 0; i < NK; i++) P[i] = acc[i] / wsum;
    LOOK_KEYS.forEach((k) => { for (let j = 0; j < 3; j++) LK[k][j] = lacc[k][j] / wsum; });
    follow /= wsum; invert /= wsum;
    const I = SK.HEAD_IDX;
    P[I.troll] = Math.max(P[I.troll], globalTroll);
    const t = P[I.troll];
    for (let j = 0; j < 3; j++) { LK.skin[j] += (TROLL_LOOK.skin[j] - LK.skin[j]) * t; LK.iris[j] += (TROLL_LOOK.iris[j] - LK.iris[j]) * t; }
    const sgn = 1 - 2 * invert;
    P[I.yaw] += look.x * 0.42 * follow * sgn;
    P[I.pitch] += look.y * 0.22 * follow * sgn;
    P[I.gazeX] += look.x * 0.85 * sgn;
    P[I.gazeY] += -look.y * 0.75 * sgn;
    P[I.blink] = Math.max(P[I.blink], blink);
    return { troll: t, age: P[I.age], glow: P[I.glow], yaw: P[I.yaw], pitch: P[I.pitch] };
  }

  /* ---------------- camera and photo ---------------- */
  let source = 'sdf', srcTex = null, srcSize = [1, 1], video = null, stream = null;
  let frame = [0.5, 0.45, 1.6];
  function setSource(kind, el, fr) {
    if (stream && kind !== 'cam') { stream.getTracks().forEach((t) => t.stop()); stream = null; video = null; }
    source = kind;
    if (kind !== 'sdf') {
      if (!srcTex) {
        srcTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      if (kind === 'photo') {
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
        srcSize = [el.naturalWidth || el.width, el.naturalHeight || el.height];
      }
      frame = fr || [0.5, 0.45, kind === 'cam' ? 1.75 : 1.3];
    }
    root.dataset.source = kind;
    makeHeadTex(); dirty = true;
    document.dispatchEvent(new CustomEvent('sk-source', { detail: kind }));
  }
  SK.useFigure = () => setSource('sdf');
  SK.usePhoto = (img, fr) => setSource('photo', img, fr);
  SK.useCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('unsupported');
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    stream = s; video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = s;
    await video.play();
    setSource('cam');
  };
  SK.nudgeFrame = (dx, dy, ds) => { frame = [frame[0] + dx, frame[1] + dy, clamp(frame[2] * ds, 0.4, 6)]; dirty = true; };
  /* drag the photo on screen: the shader maps screen offset d to photo x = fx - d.x/(fs*aspect), y = fy - d.y/fs */
  SK.dragFrame = (dx, dy) => {
    const sar = srcSize[0] / srcSize[1];
    frame = [frame[0] + dx / head.h / (frame[2] * sar), frame[1] - dy / head.h / frame[2], frame[2]]; dirty = true;
  };
  SK.setTroll = (on) => { trollTarget = on ? 1 : 0; };

  /* an image named in <html data-face> becomes the reflection, if it exists */
  if (root.dataset.face) {
    const img = new Image();
    img.onload = () => {
      const fr = (root.dataset.faceFrame || '').split(',').map(Number);
      setSource('photo', img, fr.length === 3 && fr.every(isFinite) ? fr : null);
    };
    img.src = root.dataset.face;
  }

  /* ---------------- rendering ---------------- */
  let dirty = true, clock = 0, lastNow = performance.now(), slow = 0, fast = 0;
  function renderHead(info) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, headTex.fb);
    gl.viewport(0, 0, headTex.w, headTex.h); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (source === 'sdf') {
      if (!headProg.ready()) return false;
      const pr = headProg; gl.useProgram(pr.p);
      gl.uniform2f(pr.u('uRes'), headTex.w, headTex.h);
      gl.uniform1fv(pr.u('P'), P);
      gl.uniform1f(pr.u('uTime'), clock);
      const names = { skin: 'uSkin', hair: 'uHair', iris: 'uIris', cloth: 'uCloth', keyDir: 'uKeyDir', keyCol: 'uKeyCol', fillCol: 'uFillCol', rimCol: 'uRimCol', amb: 'uAmb' };
      for (const k in names) gl.uniform3fv(pr.u(names[k]), LK[k]);
    } else {
      if (!photoProg.ready()) return false;
      if (source === 'cam') {
        if (!video || video.readyState < 2) return false;
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        srcSize = [video.videoWidth, video.videoHeight];
      }
      const pr = photoProg; gl.useProgram(pr.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(pr.u('uSrc'), 0);
      gl.uniform2f(pr.u('uRes'), headTex.w, headTex.h);
      gl.uniform2f(pr.u('uSrcSize'), srcSize[0], srcSize[1]);
      gl.uniform3f(pr.u('uFrame'), frame[0], frame[1], frame[2]);
      gl.uniform1f(pr.u('uFlip'), 1);
      gl.uniform1f(pr.u('uTroll'), info.troll); gl.uniform1f(pr.u('uAge'), info.age); gl.uniform1f(pr.u('uGlow'), info.glow);
      gl.uniform1f(pr.u('uYaw'), source === 'cam' ? 0 : info.yaw * 0.8);
      gl.uniform1f(pr.u('uPitch'), source === 'cam' ? 0 : info.pitch * 0.8);
      gl.uniform1f(pr.u('uTime'), REDUCED ? 0 : clock);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, headTex.t); gl.generateMipmap(gl.TEXTURE_2D);
    return true;
  }

  function drawGlass(m) {
    const pr = glassProgs[m.type]; if (!pr || !pr.ready()) return;
    const r = m.rect;
    const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom);
    if (x1 <= x0 || y1 <= y0) return;
    const sx = Math.floor(x0 * DPR), sy = Math.floor(y0 * DPR);
    const sw = Math.min(glc.width - sx, Math.ceil(x1 * DPR) - sx), sh = Math.min(glc.height - sy, Math.ceil(y1 * DPR) - sy);
    if (sw <= 0 || sh <= 0) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, glc.width, glc.height);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(sx, glc.height - sy - sh, sw, sh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(pr.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, headTex.t); gl.uniform1i(pr.u('uHead'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m.aux || emptyTex.t); gl.uniform1i(pr.u('uAux'), 1);
    gl.uniform4f(pr.u('uRect'), r.left * DPR, (vh - r.bottom) * DPR, r.width * DPR, r.height * DPR);
    gl.uniform4f(pr.u('uHeadRect'), head.x * DPR, (vh - head.y - head.h) * DPR, head.w * DPR, head.h * DPR);
    gl.uniform2f(pr.u('uRes'), glc.width, glc.height);
    gl.uniform1f(pr.u('uTime'), clock);
    gl.uniform1f(pr.u('uProg'), m.prog);
    gl.uniform1f(pr.u('uDpr'), DPR);
    gl.uniform1f(pr.u('uIdx'), m.idx);
    gl.uniform4fv(pr.u('uA'), m.a);
    gl.uniform4fv(pr.u('uB'), m.b);
    const inside = ptr.has && ptr.x >= r.left && ptr.x <= r.right && ptr.y >= r.top && ptr.y <= r.bottom;
    gl.uniform2f(pr.u('uPtr'), ptr.x * DPR, (vh - ptr.y) * DPR);
    gl.uniform1f(pr.u('uPtrIn'), inside ? 1 : 0);
    if (m.state.rip) gl.uniform4fv(pr.u('uRip'), m.state.rip);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    m.ctx.clearRect(0, 0, m.canvas.width, m.canvas.height);
    m.ctx.drawImage(glc, sx, sy, sw, sh, sx, sy, sw, sh);
    m.drawn = true;
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
    clock += REDUCED ? dt * 0.35 : dt;
    globalTroll += (trollTarget - globalTroll) * (1 - Math.exp(-dt * 3));
    let any = false;
    for (const m of mirrors) {
      if (!m.near) { m.rect = null; continue; }
      const r = m.el.getBoundingClientRect();
      m.rect = r;
      m.prog = clamp((vh - r.top) / (vh + r.height), 0, 1);
      m.visible = r.bottom > 0 && r.top < vh && r.width > 0;
      if (m.visible) any = true;
    }
    const blink = updateLook(now, dt);
    if (!any) return;
    for (const m of mirrors) if (m.visible && BEHAVIOUR[m.type] && BEHAVIOUR[m.type].frame) BEHAVIOUR[m.type].frame(m, dt, now);
    const info = blend(blink);
    let changed = dirty || source === 'cam' || (source === 'photo' && !REDUCED);
    if (!changed) for (let i = 0; i < NK; i++) if (!(Math.abs(P[i] - lastP[i]) < 2e-4)) { changed = true; break; }
    if (changed) {
      if (renderHead(info)) { lastP.set(P); dirty = false; }
      if (source === 'sdf') {
        if (dt > 0.026) slow++; else slow = Math.max(0, slow - 1);
        if (dt < 0.015) fast++; else fast = 0;
        if (slow > 30 && quality > 0.42 && !qs.has('q')) { quality *= 0.85; slow = 0; makeHeadTex(); }
        else if (fast > 240 && quality < 0.95 && !qs.has('q')) { quality = Math.min(0.95, quality * 1.08); fast = 0; makeHeadTex(); }
      }
    }
    for (const m of mirrors) if (m.visible) drawGlass(m);
  }

  function register() {
  document.querySelectorAll('[data-mirror]').forEach((el) => {
    const c = document.createElement('canvas'); c.className = 'glass'; c.setAttribute('aria-hidden', 'true');
    el.prepend(c);
    const m = { el, canvas: c, ctx: c.getContext('2d'), type: el.dataset.mirror, variant: el.dataset.variant || el.dataset.mirror,
      idx: +(el.dataset.idx || 0), near: false, rect: null, prog: 0.5, a: [0, 0, 0, 0], b: [0, 0, 0, 0], state: {} };
    el.__mirror = m; mirrors.push(m); io.observe(el);
    if (BEHAVIOUR[m.type] && BEHAVIOUR[m.type].init) BEHAVIOUR[m.type].init(m);
  });
  }

  addEventListener('resize', () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 80); });
  register();
  layout();
  requestAnimationFrame(tick);
  SK.ready = true;
  SK._mirrors = mirrors;
})();
