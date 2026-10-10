/* Page chrome: where you are, the troll switch, the lock-screen clock, camera and photo. */
(function () {
  'use strict';
  const SK = window.SK || {};
  const $ = (s) => document.querySelector(s);

  /* which mirror is nearest the middle of the screen */
  const stations = [...document.querySelectorAll('.station')];
  const no = $('[data-where-no]'), name = $('[data-where-name]');
  let current = -1;
  function where() {
    const mid = innerHeight / 2; let best = 0, bd = Infinity;
    stations.forEach((s, i) => {
      const m = s.querySelector('.mirror-wrap') || s; const r = m.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = i; }
    });
    if (best !== current) { current = best; no.textContent = best; name.textContent = stations[best].dataset.name; }
  }
  addEventListener('scroll', where, { passive: true }); where();

  /* troll switch */
  const tt = $('#troll');
  tt.addEventListener('click', () => {
    const on = tt.getAttribute('aria-pressed') !== 'true';
    tt.setAttribute('aria-pressed', on); if (SK.setTroll) SK.setTroll(on);
  });

  /* lock screen shows the real time */
  const tEl = $('[data-time]'), dEl = $('[data-date]');
  function clock() {
    const d = new Date();
    tEl.textContent = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    dEl.textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  clock(); setInterval(clock, 15000);

  /* camera, photo, back to the figure */
  const status = $('#status'), fig = $('#figure'), align = $('.align');
  const say = (t) => { status.textContent = t; };
  /* texts that talk about the figure get a second version for a photo */
  const swaps = [...document.querySelectorAll('[data-photo-text]')].map((el) => ({ el, fig: el.textContent, photo: el.dataset.photoText }));
  document.addEventListener('sk-source', (e) => {
    const k = e.detail;
    swaps.forEach((w) => { w.el.textContent = k === 'photo' ? w.photo : w.fig; });
    fig.hidden = k === 'sdf'; align.hidden = k !== 'photo';
    say(k === 'cam' ? 'Kamera an. Scroll nach oben, alle Spiegel zeigen jetzt dich.' : k === 'photo' ? 'Foto geladen. Alle Spiegel zeigen jetzt dieses Gesicht.' : '');
  });
  $('#cam').addEventListener('click', async () => {
    if (!SK.useCamera) { say('Dein Browser zeigt hier kein WebGL, deshalb gibt es keine Spiegel.'); return; }
    say('Warte auf die Kamera …');
    try { await SK.useCamera(); }
    catch (err) {
      say(err && err.name === 'NotAllowedError'
        ? 'Die Kamera wurde nicht freigegeben. Erlaube den Zugriff in den Browser-Einstellungen oder wähl ein Foto.'
        : 'Hier ist keine Kamera verfügbar. Wähl stattdessen ein Foto.');
    }
  });
  $('#photo').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; if (!f || !SK.usePhoto) return;
    const img = new Image();
    img.onload = () => { SK.usePhoto(img); URL.revokeObjectURL(img.src); };
    img.onerror = () => say('Dieses Bild lässt sich nicht öffnen. Versuch ein JPG oder PNG.');
    img.src = URL.createObjectURL(f);
  });
  fig.addEventListener('click', () => SK.useFigure && SK.useFigure());
  $('#zoom-in').addEventListener('click', () => SK.nudgeFrame && SK.nudgeFrame(0, 0, 1 / 1.1));
  $('#zoom-out').addEventListener('click', () => SK.nudgeFrame && SK.nudgeFrame(0, 0, 1.1));

  /* drag inside the last mirror to line a photo up */
  const plain = $('[data-mirror="plain"]');
  let drag = null;
  plain.addEventListener('pointerdown', (e) => {
    if (document.documentElement.dataset.source !== 'photo') return;
    drag = { x: e.clientX, y: e.clientY }; plain.setPointerCapture(e.pointerId);
  });
  plain.addEventListener('pointermove', (e) => {
    if (!drag || !SK.dragFrame) return;
    SK.dragFrame(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY };
  });
  plain.addEventListener('pointerup', () => { drag = null; });
})();
