/*!
 * Concord globe — a dependency-free, self-animating dotted world globe (canvas 2D).
 *  - turns by itself; drag to spin it
 *  - glowing arcs fly between world cities, with ripples where they land
 *  - a satellite orbits it, stars twinkle
 *  - pauses when off-screen or in a hidden tab; shows one still frame if the visitor prefers reduced motion
 * Mounts on <canvas data-globe="hero">; on other pages it adds a faint ambient globe in the corner.
 */
(function () {
  'use strict';
  var STEP = 2.2;
  var MASK = '///////////////////4////P/h/+P//D/x/8P///8D/H/z///8DAAADAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAACAAQAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAQAAAAADgAAAAAAAAAABAgAAAAAOAAAAAAAAAAAAAABAAAAAB8AAAAAAAAAACAAAQAAAAB+AAAAAAAAAACABwAAAAAAgD8AAAAGAAAAwOAHAAAAAAAA/wAAAHwAAAAA3z8AAAAAAADwHwAAgA8AAADg/w8AAAAAAAD4DwAAwB8AAADA/x8AAAAAAADgfwAAAP8AAAAA/v8BAAAAAAAA/D8AAMA/DAAAgP9/AAAAAAAAAPw/AADgPwwAAAD+fwAAAAAAAAD4/wEAgP9xAAAAwP8BAAAAAAAAwP8fAAD4fwYAAAD4GQAAAAAAAAD8/wMAAP4fAwAAAOgEAAAAAAAAAP7/AwAA/h8AAAAAYAQAAAAAAAAA/v8PAAD+HwAAAAAAIAAAAAAAAAD+/x8AAPh/AAAA4AD4AAAAAAAAAPj/fwAA4P8BAAAAAOADAAAAAAAAwP//AACA/x8AAABjwgcAAAAAAAAA/v8AAAD8zwEAABgHBAAAAAAAAADA/wcAAMD/PwAAgPAGAAAAAAAAAAD8PwAAAPz/BwAACgYAAAAAAAAAAOD/AADw/f8/AABAIAAAAAAAAAAAwP8AAOD///8DgIAADAAAAAAAAABA/AEAwP///wfAAAgAAAAAAAAAAMAAAADA////AMABHAAAAAAAAAAAcAAAAPD//78DYIAPAgAAAAAAAMAHAAAA/P//9wEc+EAAAAAAAAAAzsAAAID//78/4MMXAAAAAAAAADhCAAAA//9//+CfXwAAAAAAAAA4AAAAAP7/v//w//8CAAAAAACADwAAAMD///vx//8fAAAAAAAA/SAAAAD+/+/7//9/AAAAAAAA/TcAAAD8///9//8/AAAAAADg/wcAAID/D/////8BAAAAAID/fwAAAP4A/v///2AAAAAA8P8fAAAAHPD///+fGAAAAID//wAAAAf0z///HwEAAADA//8AAMBB+/P//z8CAAAA/l8GAIBPD/P//z8CAAAA/9cDAID3ff///wcAAAD8398AAP//////HwAAAP//EQDg/////z8AAAD+/x8A2P////8fAQDw//0AUPr///8PAhD4Px4ACP3///8wgOE/HADI/f//PwT8/8MAAPf///8f/P9DDMD+////5//PGYP//////n/mAf7//z9+w3zg4P8/ACMeAP0TAAI+gHgAAPoAIgDAHwEA4AcAAAUAAAAA';           // 1 bit per grid cell: is there land here?
  var TAU = Math.PI * 2;

  // ---------- land points ----------
  var LAND = null;
  function buildLand() {
    if (LAND) return LAND;
    var bin = atob(MASK), bytes = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var pts = [], idx = 0;
    for (var lat = -90 + STEP / 2; lat < 90; lat += STEP) {
      var n = Math.max(1, Math.round(360 * Math.cos(lat * Math.PI / 180) / STEP));
      for (var k = 0; k < n; k++, idx++) {
        if (bytes[idx >> 3] & (1 << (idx & 7))) {
          var lon = -180 + (k + 0.5) * 360 / n, la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
          pts.push(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
        }
      }
    }
    LAND = new Float32Array(pts);
    return LAND;
  }
  function vec(lat, lon) {
    var la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  }
  var CITIES = [[51.5, -0.1], [40.7, -74], [-23.5, -46.6], [6.5, 3.4], [5.6, -0.2], [-1.3, 36.8], [30, 31.2],
    [25.2, 55.3], [19, 72.8], [1.3, 103.8], [35.7, 139.7], [-33.9, 151.2], [34, -118], [43.7, -79.4], [48.9, 2.4],
    [-26.2, 28], [39.9, 116.4], [19.4, -99.1], [-33.9, 18.4], [-34.6, -58.4], [55.8, 37.6], [41, 29], [28.6, 77.2], [37.6, 127]]
    .map(function (c) { return vec(c[0], c[1]); });

  function theme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  var PAL = {
    dark: {
      land: ['rgba(163,163,163,.22)', 'rgba(163,163,163,.42)', 'rgba(163,163,163,.68)', 'rgba(255,255,255,.72)', 'rgba(255,255,255,.9)', 'rgba(255,255,255,1)'],
      back: 'rgba(163,163,163,.07)', grid: 'rgba(255,255,255,.07)', ring: 'rgba(163,163,163,.28)',
      sphere: ['#262626', '#171717', '#0f0f0f'], glow: 'rgba(255,77,0,.30)', rim: 'rgba(255,77,0,.65)', star: '255,255,255'
    },
    light: {
      land: ['rgba(163,163,163,.32)', 'rgba(163,163,163,.5)', 'rgba(140,140,140,.8)', 'rgba(17,17,17,.6)', 'rgba(17,17,17,.82)', 'rgba(17,17,17,1)'],
      back: 'rgba(163,163,163,.12)', grid: 'rgba(17,17,17,.08)', ring: 'rgba(163,163,163,.5)',
      sphere: ['#ffffff', '#f3f3f3', '#e6e6e6'], glow: 'rgba(255,77,0,.20)', rim: 'rgba(255,77,0,.7)', star: '163,163,163'
    }
  };
  var ORANGE = '255,77,0';

  function mount(canvas, o) {
    o = o || {};
    var opt = {
      tilt: o.tilt == null ? 0.4 : o.tilt, speed: o.speed == null ? 0.17 : o.speed, arcs: o.arcs !== false,
      orbit: !!o.orbit, stars: !!o.stars, fps: o.fps || 60, drag: o.drag !== false, maxArcs: o.maxArcs || 5, dpr: o.dpr || 2
    };
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    var land = buildLand(), nLand = land.length / 3;
    var bufs = [], lv;
    for (lv = 0; lv < 6; lv++) bufs.push(new Float32Array(nLand * 3));
    var counts = [0, 0, 0, 0, 0, 0];
    var backBuf = new Float32Array(nLand * 3), orangeBuf = new Float32Array(nLand * 3);

    var rot = 0.25, vel = 0, W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1;
    var arcs = [], ripples = [], nextArc = 400, simT = 0, last = 0, lastDraw = 0, raf = 0;
    var running = false, onScreen = true, reduce = false, dragging = false, lastX = 0, lastMoveT = 0;
    var stars = [];
    for (lv = 0; lv < 46; lv++) stars.push([Math.random(), Math.random(), Math.random() * TAU, 0.5 + Math.random()]);
    var P = { x: 0, y: 0, z: 0 };

    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, opt.dpr);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      W = w; H = h; cx = w / 2; cy = h / 2;
      R = Math.min(w, h) * (opt.orbit || opt.stars ? 0.36 : 0.42);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) draw(simT);
    }

    var cr = 1, sr = 0, ct = 1, st = 0;
    function setView() { cr = Math.cos(rot); sr = Math.sin(rot); ct = Math.cos(opt.tilt); st = Math.sin(opt.tilt); }
    function proj(X, Y, Z, s) {
      var x1 = X * cr - Z * sr, z1 = X * sr + Z * cr;
      P.x = cx + x1 * R * s; P.y = cy - (Y * ct - z1 * st) * R * s; P.z = Y * st + z1 * ct;
      return P;
    }

    function spawnArc() {
      var a = Math.floor(Math.random() * CITIES.length), b, tries = 0, A, B, dot;
      do { b = Math.floor(Math.random() * CITIES.length); A = CITIES[a]; B = CITIES[b]; dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2]; tries++; }
      while ((a === b || dot > 0.9) && tries < 12);
      var om = Math.acos(Math.max(-1, Math.min(1, dot)));
      arcs.push({ A: A, B: B, om: om, h: 0.10 + 0.2 * om / Math.PI, t0: simT, dur: 2600 + om * 900 });
    }
    function arcPoint(arc, s) {   // great-circle point, lifted off the surface
      var so = Math.sin(arc.om) || 1e-6, k1 = Math.sin((1 - s) * arc.om) / so, k2 = Math.sin(s * arc.om) / so, lift = 1 + arc.h * Math.sin(Math.PI * s);
      return [(k1 * arc.A[0] + k2 * arc.B[0]) * lift, (k1 * arc.A[1] + k2 * arc.B[1]) * lift, (k1 * arc.A[2] + k2 * arc.B[2]) * lift];
    }
    function ripple(v, t) { ripples.push({ v: v, t0: t }); }

    function draw(t) {
      if (!W) return;
      var pal = PAL[theme()], i, p;
      ctx.clearRect(0, 0, W, H);
      setView();

      if (opt.stars && theme() === 'dark') {
        for (i = 0; i < stars.length; i++) {
          var s = stars[i], a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t / 700 * s[3] + s[2]));
          ctx.fillStyle = 'rgba(' + pal.star + ',' + a.toFixed(2) + ')';
          ctx.fillRect(s[0] * W, s[1] * H, 1.4, 1.4);
        }
      }

      // atmosphere glow
      var g = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.32);
      g.addColorStop(0, pal.glow); g.addColorStop(1, 'rgba(' + ORANGE + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.32, 0, TAU); ctx.fill();

      // orbit: back half first (the globe covers it)
      var orb = null;
      if (opt.orbit) orb = drawOrbit(t, pal, false);

      // globe body
      var body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
      body.addColorStop(0, pal.sphere[0]); body.addColorStop(0.62, pal.sphere[1]); body.addColorStop(1, pal.sphere[2]);
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.3; ctx.stroke();

      // graticule (front side only)
      ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.beginPath();
      var lat, lon, pen;
      for (lat = -60; lat <= 60; lat += 30) {
        pen = false;
        for (lon = -180; lon <= 180; lon += 6) {
          var v = vec(lat, lon); p = proj(v[0], v[1], v[2], 1);
          if (p.z > 0) { if (pen) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); pen = true; } } else pen = false;
        }
      }
      for (lon = -180; lon < 180; lon += 30) {
        pen = false;
        for (lat = -90; lat <= 90; lat += 6) {
          var w2 = vec(lat, lon); p = proj(w2[0], w2[1], w2[2], 1);
          if (p.z > 0) { if (pen) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); pen = true; } } else pen = false;
        }
      }
      ctx.stroke();

      // land dots
      var rr = R * 0.0108, nb = 0, no = 0;
      for (lv = 0; lv < 6; lv++) counts[lv] = 0;
      for (i = 0; i < nLand; i++) {
        var X = land[i * 3], Y = land[i * 3 + 1], Z = land[i * 3 + 2];
        var x1 = X * cr - Z * sr, z1 = X * sr + Z * cr, y2 = Y * ct - z1 * st, z2 = Y * st + z1 * ct;
        var px = cx + x1 * R, py = cy - y2 * R;
        if (z2 <= 0) { backBuf[nb++] = px; backBuf[nb++] = py; continue; }
        var light = 0.6 + 0.4 * (0.5 + 0.5 * (-0.45 * x1 + 0.4 * y2 + 0.8 * z2));
        var level = Math.min(5, Math.floor(Math.pow(z2, 0.7) * light * 5.999));
        var c = counts[level]; bufs[level][c] = px; bufs[level][c + 1] = py; bufs[level][c + 2] = rr * (0.55 + 0.45 * z2); counts[level] = c + 3;
        if (z2 > 0.12 && ((i * 2654435761) >>> 0) % 29 === 0) { orangeBuf[no++] = px; orangeBuf[no++] = py; orangeBuf[no++] = i; }
      }
      ctx.fillStyle = pal.back; ctx.beginPath();
      for (i = 0; i < nb; i += 2) { ctx.moveTo(backBuf[i] + rr * 0.7, backBuf[i + 1]); ctx.arc(backBuf[i], backBuf[i + 1], rr * 0.7, 0, TAU); }
      ctx.fill();
      for (lv = 0; lv < 6; lv++) {
        var b = bufs[lv], n = counts[lv];
        if (!n) continue;
        ctx.fillStyle = pal.land[lv]; ctx.beginPath();
        for (i = 0; i < n; i += 3) { ctx.moveTo(b[i] + b[i + 2], b[i + 1]); ctx.arc(b[i], b[i + 1], b[i + 2], 0, TAU); }
        ctx.fill();
      }
      // twinkling "learners online" dots
      for (i = 0; i < no; i += 3) {
        var al = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t / 520 + orangeBuf[i + 2]));
        ctx.fillStyle = 'rgba(' + ORANGE + ',' + al.toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(orangeBuf[i], orangeBuf[i + 1], rr * 1.3, 0, TAU); ctx.fill();
      }

      if (opt.arcs) drawArcs(t);
      if (opt.orbit) drawOrbit(t, pal, true);
    }

    function drawArcs(t) {
      var i, j, arc, e, p, s;
      ctx.lineCap = 'round';
      for (i = 0; i < arcs.length; i++) {
        arc = arcs[i];
        var prog = Math.min(1, (t - arc.t0) / arc.dur), age = t - arc.t0;
        e = prog < 1 ? 1 - Math.pow(1 - prog, 2) : 1;          // ease-out
        var tail = Math.max(0, e - 0.4), fade = age > arc.dur ? Math.max(0, 1 - (age - arc.dur) / 1400) : 1;
        // faint full path
        ctx.strokeStyle = 'rgba(' + ORANGE + ',' + (0.14 * fade).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.beginPath();
        var pen = false;
        for (j = 0; j <= 28; j++) {
          s = j / 28 * Math.min(1, e + 0.0001);
          var q = arcPoint(arc, s); p = proj(q[0], q[1], q[2], 1);
          if (p.z > 0) { if (pen) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); pen = true; } } else pen = false;
        }
        ctx.stroke();
        // bright comet tail
        if (prog < 1 || fade > 0.5) {
          var prev = null;
          for (j = 0; j <= 16; j++) {
            s = tail + (e - tail) * j / 16;
            var q2 = arcPoint(arc, s); p = proj(q2[0], q2[1], q2[2], 1);
            if (prev && p.z > 0 && prev.z > 0) {
              ctx.strokeStyle = 'rgba(' + ORANGE + ',' + (0.9 * (j / 16) * fade).toFixed(3) + ')'; ctx.lineWidth = 1.2 + 1.4 * (j / 16);
              ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            }
            prev = { x: p.x, y: p.y, z: p.z };
          }
          if (prog < 1 && prev && prev.z > 0) {
            var hg = ctx.createRadialGradient(prev.x, prev.y, 0, prev.x, prev.y, 9);
            hg.addColorStop(0, 'rgba(255,255,255,.95)'); hg.addColorStop(0.35, 'rgba(' + ORANGE + ',.8)'); hg.addColorStop(1, 'rgba(' + ORANGE + ',0)');
            ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(prev.x, prev.y, 9, 0, TAU); ctx.fill();
          }
        }
        if (!arc.landed && prog >= 1) { arc.landed = true; ripple(arc.B, t); }
        if (!arc.started) { arc.started = true; ripple(arc.A, t); }
      }
      // ripples where arcs start/land
      for (i = ripples.length - 1; i >= 0; i--) {
        var r = ripples[i], k = (t - r.t0) / 1300;
        if (k >= 1) { ripples.splice(i, 1); continue; }
        p = proj(r.v[0], r.v[1], r.v[2], 1);
        if (p.z <= 0.05) continue;
        ctx.strokeStyle = 'rgba(' + ORANGE + ',' + ((1 - k) * 0.85).toFixed(3) + ')'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 + k * R * 0.07, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(' + ORANGE + ',' + (1 - k * 0.6).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, TAU); ctx.fill();
      }
    }

    var oCos = Math.cos(-0.42), oSin = Math.sin(-0.42), oK = 1.05;
    function orbitPt(phi, rad) {
      var x = Math.cos(phi), y = Math.sin(phi) * Math.cos(oK), z = Math.sin(phi) * Math.sin(oK);
      return { x: cx + (x * oCos - y * oSin) * R * rad, y: cy - (x * oSin + y * oCos) * R * rad, z: z };
    }
    function drawOrbit(t, pal, front) {
      var rad = 1.34, phi, p, pen = false;
      ctx.strokeStyle = pal.ring; ctx.lineWidth = 1; ctx.beginPath();
      for (phi = 0; phi <= TAU + 0.07; phi += 0.07) {
        p = orbitPt(phi, rad);
        if ((front && p.z >= 0) || (!front && p.z < 0)) { if (pen) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); pen = true; } } else pen = false;
      }
      ctx.stroke();
      var sat = t / 1000 * 0.55, sp = orbitPt(sat, rad), isFront = sp.z >= 0;
      if (isFront !== front) return;
      for (var k = 1; k <= 8; k++) {                               // short fading tail
        var tp = orbitPt(sat - k * 0.05, rad);
        ctx.fillStyle = 'rgba(' + ORANGE + ',' + (0.5 * (1 - k / 9)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(tp.x, tp.y, 2.4 * (1 - k / 10), 0, TAU); ctx.fill();
      }
      var hg = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 11);
      hg.addColorStop(0, 'rgba(255,255,255,1)'); hg.addColorStop(0.3, 'rgba(' + ORANGE + ',.9)'); hg.addColorStop(1, 'rgba(' + ORANGE + ',0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(sp.x, sp.y, 11, 0, TAU); ctx.fill();
    }

    function frame(now) {
      raf = 0;
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (now - lastDraw < 1000 / opt.fps - 2) return;
      var dt = Math.min(100, last ? now - last : 16); last = now; lastDraw = now;
      simT += dt;
      if (!dragging) {
        rot -= (opt.speed + vel) * dt / 1000;
        vel *= Math.pow(0.12, dt / 1000);                          // drag momentum fades out
      }
      if (opt.arcs) {
        for (var i = arcs.length - 1; i >= 0; i--) if (simT - arcs[i].t0 > arcs[i].dur + 1400) arcs.splice(i, 1);
        if (simT >= nextArc && arcs.length < opt.maxArcs) { spawnArc(); nextArc = simT + 700 + Math.random() * 1100; }
      }
      draw(simT);
    }
    function start() {
      if (running || reduce || !onScreen || document.hidden) return;
      running = true; last = 0; raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    // reduced motion: one still frame, no loop
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function applyMotion() {
      reduce = !!(mq && mq.matches);
      if (reduce) {
        stop(); arcs = []; ripples = []; simT = 6000;
        if (opt.arcs) for (var k = 0; k < 3; k++) { spawnArc(); var a = arcs[arcs.length - 1]; a.t0 = simT - a.dur - 200; a.landed = a.started = true; }
        draw(simT);
      } else start();
    }
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', applyMotion); else if (mq.addListener) mq.addListener(applyMotion); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; if (onScreen) start(); else stop(); }).observe(canvas);
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);

    // drag to spin
    if (opt.drag) {
      canvas.addEventListener('pointerdown', function (e) {
        dragging = true; lastX = e.clientX; lastMoveT = performance.now(); vel = 0;
        try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var now = performance.now(), dx = e.clientX - lastX, dts = Math.max(1, now - lastMoveT);
        rot -= dx / (R || 200);
        vel = (dx / (R || 200)) / (dts / 1000);
        lastX = e.clientX; lastMoveT = now;
        if (reduce) draw(simT);
      });
      var end = function () { dragging = false; vel = Math.max(-2.5, Math.min(2.5, vel)); };
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    }

    resize();
    applyMotion();
    return { start: start, stop: stop, redraw: function () { draw(simT); } };
  }

  function init() {
    var heroes = document.querySelectorAll('canvas[data-globe]');
    Array.prototype.forEach.call(heroes, function (c) { mount(c, { stars: true, orbit: true }); });
    var path = location.pathname;
    if (!heroes.length && !/quiz\.html$/.test(path) && document.body && document.body.getAttribute('data-globe') !== 'off') {
      var c = document.createElement('canvas');                      // faint ambient globe in the corner
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:fixed;right:-16vmin;bottom:-16vmin;width:86vmin;height:86vmin;opacity:.22;pointer-events:none;z-index:-1';
      document.body.appendChild(c);
      mount(c, { fps: 30, orbit: false, maxArcs: 3, dpr: 1.5, drag: false, speed: 0.1 });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ConcordGlobe = { mount: mount };
})();
