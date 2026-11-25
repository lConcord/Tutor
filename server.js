'use strict';
/*
 * Concord's as your Tutor — live activity backend
 * -----------------------------------------------
 * Zero dependencies (Node 18+). It does three things:
 *   1. Serves the tutor app itself (the folder above /backend).
 *   2. Receives activity events from tracker.js  (POST /api/track).
 *   3. Streams everything to the admin app in real time (GET /admin).
 *
 * Two kinds of people, kept strictly apart:
 *   STUDENT  – no account. Can use the student app and report their own activity.
 *   ADMIN    – signs in with a username + password at /admin/login. Only an admin
 *              session can read student data (/api/state, /api/stream, /api/clear).
 *
 * Run:    node server.js        (first run prints a one-time setup code)
 * Admin:  http://localhost:3000/admin
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const auth = require('./auth');

const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';   // set when behind nginx/Render/etc. that terminates HTTPS

// Flat layout: every file lives in this one folder. Only the files in STUDENT_FILES below are ever
// served to the public; server code, the admin dashboard and saved data never are.
const APP_ROOT = __dirname;
const PUBLIC_DIR = __dirname;
const STUDENT_FILES = new Set([
  'index.html', 'student.html', 'profile.html', 'upload.html', 'questions.html', 'quiz.html',
  'results.html', 'progress.html', 'about.html',
  'styles.css', 'app.js', 'config.js', 'tracker.js', 'pwa.js', 'globe.js', 'sw.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'
]);
// Where student activity is saved. On hosts that wipe files on restart, point DATA_DIR at a persistent volume.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'activity.json');

const STALE_VISIBLE_MS = 15000;   // no heartbeat for 15 s while the tab is visible  -> offline
const STALE_HIDDEN_MS = 120000;   // tab in background (phone locked, other tab)     -> 2 min
const AWAY_GRACE_MS = 6000;       // wait before deciding a student really left a quiz
const MAX_EVENTS = 1000;
const MAX_SESSIONS = 5000;

/* ------------------------------------------------------------------ state */
const sessions = new Map();   // sid -> session
let events = [];              // newest last
let signins = [];             // admin sign-in attempts (newest last), kept with their IP address
const MAX_SIGNINS = 500;
let seq = 0;
const clients = new Set();    // SSE connections

const PAGE_LABEL = {
  'index.html': 'Home', 'student.html': 'Student name page', 'profile.html': 'Profile page',
  'upload.html': 'Upload page', 'questions.html': 'Question-count page', 'quiz.html': 'Quiz',
  'results.html': 'Results page', 'progress.html': 'Progress page', 'about.html': 'About page'
};

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
}
function num(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min == null ? -1e9 : min, Math.min(max == null ? 1e9 : max, n));
}
function label(page) { return PAGE_LABEL[page] || page || 'the app'; }

function newSession(sid, ua) {
  return {
    sid, name: '', names: [], profile: null, material: null, quiz: null, results: [],
    ips: [], online: false, visible: true, page: '', question: 0,
    firstSeen: Date.now(), lastSeen: Date.now(), device: deviceOf(ua)
  };
}
function deviceOf(ua) {
  ua = String(ua || '');
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua) ? 'Mobile' : 'Desktop';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${mobile} · ${br}`;
}
function who(s) { return s.name || 'A student (name not entered yet)'; }

function pub(s) {   // what the dashboard is allowed to see
  return {
    sid: s.sid, name: s.name, names: s.names, profile: s.profile, material: s.material,
    quiz: s.quiz, results: s.results.slice(0, 20), online: s.online, visible: s.visible,
    page: s.page, question: s.question, firstSeen: s.firstSeen, lastSeen: s.lastSeen, device: s.device,
    ips: Array.isArray(s.ips) ? s.ips : []
  };
}

/* ------------------------------------------------------------ persistence */
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ seq, events, signins, sessions: [...sessions.values()] }));
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) { console.error('Could not save data:', e.message); }
  }, 800);
}
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    seq = d.seq || 0;
    events = Array.isArray(d.events) ? d.events.slice(-MAX_EVENTS) : [];
    signins = Array.isArray(d.signins) ? d.signins.slice(-MAX_SIGNINS) : [];
    (d.sessions || []).forEach(s => { s.online = false; s.visible = true; sessions.set(s.sid, s); });
    console.log(`Loaded ${sessions.size} saved student session(s).`);
  } catch { /* first run */ }
}

/* -------------------------------------------------------------- broadcast */
function send(res, name, data) {
  try { res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* closed */ }
}
function broadcast(name, data) { clients.forEach(c => send(c, name, data)); }

function emit(s, type, text, level, extra) {
  const ev = { id: ++seq, t: Date.now(), sid: s.sid, name: s.name, type, text, level: level || 'info' };
  if (extra) ev.data = extra;
  events.push(ev);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  broadcast('update', { session: pub(s), event: ev });
  scheduleSave();
  return ev;
}
function touch(s) { broadcast('update', { session: pub(s) }); scheduleSave(); }

/* ------------------------------------------------------------ quiz states */
function quizLeft(s, reason) {
  const q = s.quiz;
  if (!q || q.status !== 'in_progress') return;
  q.status = 'left';
  q.leftAt = Date.now();
  q.leftReason = reason;
  q.leftAtQuestion = s.question || q.answered + 1;
  emit(s, 'quiz_left',
    `${who(s)} LEFT the quiz at question ${q.leftAtQuestion} of ${q.total} (${reason}). ` +
    `Answered ${q.answered}, ${q.correct} correct.`, 'bad');
}
function markOffline(s) {
  if (!s.online) return;
  s.online = false;
  emit(s, 'offline', `${who(s)} went offline.`, 'warn');
}
function checkResume(s) {
  const q = s.quiz;
  if (q && q.status === 'left' && s.page === 'quiz.html') {
    q.status = 'in_progress';
    delete q.leftAt; delete q.leftReason;
    emit(s, 'quiz_resumed', `${who(s)} came back to the quiz (question ${s.question || q.answered + 1} of ${q.total}).`, 'good');
  }
}
// Decide, after a short grace period, whether the student really left the quiz.
// Moving from question 3 to question 4 (or a refresh) is NOT leaving: the next
// quiz page reports in within the grace period and cancels the decision.
function scheduleAwayCheck(s, leaveAt, reasonIfMoved) {
  setTimeout(() => {
    const closed = leaveAt && s.lastSeen <= leaveAt;      // nothing heard since they left
    if (closed) {
      markOffline(s);
      quizLeft(s, 'closed the page or lost connection');
    } else if (s.page !== 'quiz.html') {
      quizLeft(s, reasonIfMoved || `went to the ${label(s.page)}`);
    }
  }, AWAY_GRACE_MS);
}

/* ------------------------------------------------------------ event intake */
const TYPES = new Set(['hello', 'heartbeat', 'leave', 'visibility', 'student_name', 'profile_saved',
  'material_uploaded', 'quiz_started', 'answer_submitted', 'quiz_completed', 'quiz_discarded', 'progress_reset']);
const rate = new Map();
function allowed(sid) {
  const now = Date.now();
  let r = rate.get(sid);
  if (!r || now - r.t > 10000) { r = { t: now, n: 0 }; rate.set(sid, r); }
  return ++r.n <= 150;
}

function applyInfo(s, info) {
  if (!info || typeof info !== 'object') return;
  const p = info.profile;
  if (p && !s.profile) {
    s.profile = { school: clean(p.school, 120), programme: clean(p.programme, 120), level: clean(p.level, 60), subjects: clean(p.subjects, 200) };
    setName(s, clean(p.name, 80));
  }
  if (info.student && !s.name) setName(s, clean(info.student, 80));
  const m = info.material;
  if (m && !s.material) s.material = { name: clean(m.name, 160), size: num(m.size, 0), questions: num(m.questions, 0), at: Date.now() };
  const q = info.quiz;
  if (q && !s.quiz && q.total) {
    s.quiz = { status: 'in_progress', total: num(q.total, 0, 500), answered: num(q.answered, 0, 500), correct: num(q.correct, 0, 500),
      earned: num(q.earned, 0, 500), startedAt: Date.now(), answers: [] };
  }
}
function setName(s, name) {
  if (!name) return;
  s.name = name;
  if (!s.names.includes(name)) s.names.push(name);
  if (s.names.length > 10) s.names.shift();
}

// Remember which IP addresses a student's device has connected from (a visit = one page load).
function noteIp(s, ip, now, isVisit) {
  if (!ip || ip === 'unknown') return;
  if (!Array.isArray(s.ips)) s.ips = [];
  let e = s.ips.find(x => x.ip === ip);
  if (!e) {
    e = { ip, first: now, last: now, count: 0 };
    s.ips.push(e);
    if (s.ips.length > 10) s.ips.shift();
  }
  e.last = now;
  if (isVisit) e.count++;
}

// Every admin sign-in attempt is recorded with the IP address it came from.
// A wrong username is stored as "(other name)" so a password typed into the wrong box is never kept.
function logSignin(req, ip, username, result) {
  const real = auth.getUsername();
  const entry = {
    id: ++seq, t: Date.now(), result,
    username: real && String(username || '') === real ? real : '(other name)',
    ip, device: deviceOf(req.headers['user-agent'])
  };
  signins.push(entry);
  if (signins.length > MAX_SIGNINS) signins = signins.slice(-MAX_SIGNINS);
  broadcast('signin', entry);
  scheduleSave();
  return entry;
}

function track(raw, req) {
  let b;
  try { b = JSON.parse(raw); } catch { return; }
  if (!b || typeof b !== 'object') return;
  const sid = String(b.sid || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sid) || !TYPES.has(b.type) || !allowed(sid)) return;

  let s = sessions.get(sid);
  if (!s) {
    if (sessions.size >= MAX_SESSIONS) return;
    s = newSession(sid, req.headers['user-agent']);
    sessions.set(sid, s);
  }
  const d = b.data && typeof b.data === 'object' ? b.data : {};
  const page = clean(b.page, 40);
  const now = Date.now();
  const wasOnline = s.online;
  const ip = clientIp(req);
  s.lastSeen = now;
  s.device = deviceOf(req.headers['user-agent']) || s.device;
  noteIp(s, ip, now, b.type === 'hello');

  switch (b.type) {
    case 'hello': {
      s.online = true;
      s.visible = true;
      s.page = page;
      applyInfo(s, d.info);
      const qn = num(d.q, 0, 500);
      if (qn) s.question = qn;
      const quizTxt = page === 'quiz.html' && qn ? ` — question ${qn}${s.quiz ? ' of ' + s.quiz.total : ''}` : '';
      emit(s, 'page_view', `${who(s)} ${wasOnline ? 'opened' : 'is online and opened'} the ${label(page)}${quizTxt}${wasOnline ? '' : ` (IP ${ip})`}.`, 'info');
      checkResume(s);
      if (s.quiz && s.quiz.status === 'in_progress' && page !== 'quiz.html') {
        scheduleAwayCheck(s, null, `went to the ${label(page)}`);
      }
      break;
    }
    case 'heartbeat': {
      s.page = page;
      const qn = num(d.q, 0, 500);
      if (qn) s.question = qn;
      if (!wasOnline) {
        s.online = true;
        emit(s, 'online', `${who(s)} is back online.`, 'info');
      }
      checkResume(s);
      touch(s);
      break;
    }
    case 'leave': {
      scheduleAwayCheck(s, now, null);
      touch(s);
      break;
    }
    case 'visibility': {
      s.visible = !d.hidden;
      if (s.page === 'quiz.html' && s.quiz && s.quiz.status === 'in_progress') {
        emit(s, 'visibility', d.hidden
          ? `${who(s)} switched away from the quiz tab (question ${s.question || s.quiz.answered + 1}).`
          : `${who(s)} returned to the quiz tab.`, d.hidden ? 'warn' : 'info');
      } else touch(s);
      break;
    }
    case 'student_name': {
      const name = clean(d.name, 80);
      if (!name) return;
      setName(s, name);
      emit(s, 'student_name', `${name} entered their student name (IP ${ip}).`, 'good');
      break;
    }
    case 'profile_saved': {
      const p = d.profile || {};
      s.profile = { school: clean(p.school, 120), programme: clean(p.programme, 120), level: clean(p.level, 60), subjects: clean(p.subjects, 200) };
      setName(s, clean(p.name, 80));
      emit(s, 'profile_saved',
        `${who(s)} saved their profile — ${s.profile.school}, ${s.profile.programme}, ${s.profile.level}.`, 'good');
      break;
    }
    case 'material_uploaded': {
      s.material = { name: clean(d.name, 160), size: num(d.size, 0), questions: num(d.questions, 0, 100000), at: now };
      emit(s, 'material_uploaded',
        `${who(s)} uploaded “${s.material.name}” (${(s.material.size / 1024).toFixed(1)} KB) — ${s.material.questions} questions generated.`, 'good');
      break;
    }
    case 'quiz_started': {
      s.quiz = { status: 'in_progress', total: num(d.total, 0, 500), answered: 0, correct: 0, earned: 0, startedAt: now, answers: [] };
      s.question = 1;
      emit(s, 'quiz_started', `${who(s)} started a quiz of ${s.quiz.total} questions.`, 'good');
      break;
    }
    case 'answer_submitted': {
      if (!s.quiz) s.quiz = { status: 'in_progress', total: num(d.total, 0, 500), answered: 0, correct: 0, earned: 0, startedAt: now, answers: [] };
      const q = s.quiz;
      const n = num(d.n, 1, 500);
      if (q.answers.some(a => a.n === n)) return;               // already counted
      const correct = !!d.correct;
      q.status = q.status === 'left' ? 'in_progress' : q.status;
      q.answered += 1;
      q.correct += correct ? 1 : 0;
      q.earned = Math.round((q.earned + num(d.score, 0, 1)) * 100) / 100;
      if (q.answers.length < 200) q.answers.push({ n, q: clean(d.q, 200), user: clean(d.user, 200), correct, type: clean(d.type, 10), score: num(d.score, 0, 1) });
      s.question = Math.min(n + 1, q.total);
      emit(s, 'answer_submitted',
        `${who(s)} answered question ${n} of ${q.total}: ${correct ? 'CORRECT ✓' : 'WRONG ✗'} (${q.correct}/${q.answered} correct so far).`,
        correct ? 'good' : 'warn');
      break;
    }
    case 'quiz_completed': {
      const r = d.result || {};
      const total = num(r.total, 0, 500), correct = num(r.correct, 0, total);
      const passed = total > 0 && correct / total >= 0.7;
      if (s.quiz) { s.quiz.status = 'completed'; s.quiz.finishedAt = now; }
      s.results.unshift({ at: now, student: clean(r.student, 80) || s.name, total, correct, wrong: total - correct, percent: num(r.percent, 0, 100), passed });
      s.results = s.results.slice(0, 50);
      emit(s, 'quiz_completed',
        `${who(s)} FINISHED the quiz: ${correct}/${total} correct (${num(r.percent, 0, 100)}%) — ${passed ? 'HURRAY 🎉' : 'SHAME'}.`,
        passed ? 'good' : 'bad');
      break;
    }
    case 'quiz_discarded': {
      if (s.quiz && s.quiz.status !== 'completed') {
        s.quiz.status = 'abandoned';
        emit(s, 'quiz_abandoned', `${who(s)} dropped their unfinished quiz (started over or uploaded new material).`, 'warn');
      }
      break;
    }
    case 'progress_reset': {
      if (s.quiz && s.quiz.status !== 'completed') s.quiz.status = 'abandoned';
      emit(s, 'progress_reset', `${who(s)} reset their profile and progress on their device.`, 'warn');
      break;
    }
  }
}

// Sweep: turn silent browsers into "offline" and unfinished quizzes into "left".
setInterval(() => {
  const now = Date.now();
  sessions.forEach(s => {
    const stale = now - s.lastSeen > (s.visible ? STALE_VISIBLE_MS : STALE_HIDDEN_MS);
    if (!stale) return;
    if (s.online) markOffline(s);
    if (s.quiz && s.quiz.status === 'in_progress') quizLeft(s, 'connection lost or browser closed');
  });
}, 3000);

/* --------------------------------------------------------------- http util */
/* ----------------------------------------------------------- admin session */
function isSecure(req) {
  return !!req.socket.encrypted || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
}
function clientIp(req) {
  let ip = req.socket.remoteAddress || 'unknown';
  if (TRUST_PROXY) {   // the host's edge overwrites these headers, so a visitor cannot fake them
    const real = String(req.headers['x-real-ip'] || '').trim();
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    ip = real || fwd || ip;
  }
  return clean(ip, 64).replace(/^::ffff:/i, '');
}
function adminOf(req) { return auth.sessionOf(req); }      // null when not signed in as admin
function json(res, code, obj, headers) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(JSON.stringify(obj));
}
function redirect(res, to) { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); res.end(); }
// Admin POSTs must be JSON sent from our own pages: blocks cross-site form posts (CSRF).
function sameSiteJson(req) {
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return false;
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return false; } catch { return false; } }
  return true;
}
function readJson(req, res, cb) {
  if (!sameSiteJson(req)) return json(res, 403, { error: 'Blocked request.' });
  readBody(req, 4096, (err, body) => {
    if (err) return json(res, 413, { error: 'Request too large.' });
    let o; try { o = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid request.' }); }
    cb(o && typeof o === 'object' ? o : {});
  });
}
let setupCode = '';   // one-time code printed in the terminal; proves you control the server

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function readBody(req, limit, cb) {
  let size = 0, done = false; const chunks = [];
  req.on('data', c => {
    size += c.length;
    if (size > limit && !done) { done = true; cb(new Error('too large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => { if (!done) { done = true; cb(null, Buffer.concat(chunks).toString('utf8')); } });
  req.on('error', () => { if (!done) { done = true; cb(new Error('read')); } });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};
function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': res.getHeader('Cache-Control') || 'no-cache' });
    res.end(buf);
  });
}
// CSV safety: a cell that starts with = + - @ could run as a spreadsheet formula, so it is defused.
function csvCell(v) {
  let t = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}
function studentRows() {
  const rows = [['Student name', 'IP address', 'First seen', 'Last seen', 'Visits', 'Device', 'School', 'Programme', 'Level']];
  [...sessions.values()].sort((a, b) => b.lastSeen - a.lastSeen).forEach(s => {
    const name = (s.names && s.names.length ? s.names.join(' / ') : s.name) || '(no name yet)';
    const p = s.profile || {};
    const ips = Array.isArray(s.ips) && s.ips.length ? s.ips : [{ ip: '', first: s.firstSeen, last: s.lastSeen, count: '' }];
    ips.forEach(e => rows.push([name, e.ip, new Date(e.first).toISOString(), new Date(e.last).toISOString(), e.count, s.device, p.school || '', p.programme || '', p.level || '']));
  });
  return rows;
}
function signinRows() {
  const rows = [['Time', 'Username', 'Result', 'IP address', 'Device']];
  signins.slice().reverse().forEach(e => rows.push([new Date(e.t).toISOString(), e.username, e.result, e.ip, e.device]));
  return rows;
}

function snapshot() {
  return { now: Date.now(), sessions: [...sessions.values()].map(pub), events: events.slice(-300), signins: signins.slice(-200) };
}

/* ------------------------------------------------------------------ routes */
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;

    if (p === '/api/track') {
      cors(res);
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
      return readBody(req, 16384, (err, body) => {
        if (err) { res.writeHead(413); return res.end(); }
        res.writeHead(204); res.end();
        try { track(body, req); } catch (e) { console.error('track error:', e.message); }
      });
    }

    /* ---- admin-only data (needs a signed-in admin session) ---- */
    if (p === '/api/state' || p === '/api/stream' || p === '/api/clear') {
      if (!adminOf(req)) return json(res, 401, { error: 'Admin sign-in required.' });
      if (p === '/api/state') return json(res, 200, snapshot());
      if (p === '/api/clear') {
        if (req.method !== 'POST' || !sameSiteJson(req)) return json(res, 403, { error: 'Blocked request.' });
        sessions.clear(); events = []; signins = []; scheduleSave();
        broadcast('snapshot', snapshot());
        res.writeHead(204); return res.end();
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
        'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
      });
      res.write('retry: 2000\n\n');
      send(res, 'snapshot', snapshot());
      clients.add(res);
      const ka = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch { /* closed */ } }, 20000);
      req.on('close', () => { clearInterval(ka); clients.delete(res); });
      return;
    }

    /* ---- admin account endpoints ---- */
    if (p.startsWith('/admin/api/')) {
      const secure = isSecure(req);
      const ip = clientIp(req);
      if (req.method === 'GET' && (p === '/admin/api/students.csv' || p === '/admin/api/signins.csv')) {
        if (!adminOf(req)) return json(res, 401, { error: 'Admin sign-in required.' });
        const students = p.endsWith('students.csv');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="${students ? 'student-ip-log' : 'admin-signins'}.csv"`
        });
        return res.end('\ufeff' + (students ? studentRows() : signinRows()).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
      }
      if (req.method !== 'POST' && p !== '/admin/api/me') return json(res, 405, { error: 'Method not allowed.' });

      if (p === '/admin/api/me') {
        const me = adminOf(req);
        return me ? json(res, 200, { username: me.username }) : json(res, 401, { error: 'Not signed in.' });
      }

      if (p === '/admin/api/login') {
        return readJson(req, res, body => {
          const pair = 'pair:' + ip + '|' + String(body.username || '').toLowerCase().slice(0, 40);
          const keys = ['ip:' + ip, pair];
          const wait = auth.lockedFor(keys);
          if (wait) {
            logSignin(req, ip, body.username, 'blocked');
            return json(res, 429, { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).` }, { 'Retry-After': String(Math.ceil(wait / 1000)) });
          }
          if (!auth.hasAdmin()) return json(res, 409, { error: 'No admin account exists yet.', setup: true });
          if (!auth.checkPassword(body.username, body.password)) {
            auth.recordFail(keys);
            logSignin(req, ip, body.username, 'failed');
            return json(res, 401, { error: 'Wrong username or password.' });
          }
          auth.clearFails([pair]);
          logSignin(req, ip, body.username, 'success');
          const token = auth.createSession(auth.getUsername());
          json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(token, secure) });
        });
      }

      if (p === '/admin/api/logout') {
        if (!sameSiteJson(req)) return json(res, 403, { error: 'Blocked request.' });
        const me = adminOf(req);
        if (me) auth.destroySession(me.token);
        return json(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookieHeader(secure) });
      }

      if (p === '/admin/api/setup') {
        return readJson(req, res, body => {
          if (auth.hasAdmin()) return json(res, 409, { error: 'An admin account already exists.' });
          const keys = ['ip:' + ip, 'pair:' + ip + '|setup'];
          const wait = auth.lockedFor(keys);
          if (wait) return json(res, 429, { error: 'Too many failed attempts. Try again later.' });
          const given = String(body.code || '').trim().toUpperCase();
          const okCode = given.length === setupCode.length &&
            crypto.timingSafeEqual(Buffer.from(given), Buffer.from(setupCode));
          if (!okCode) { auth.recordFail(keys); return json(res, 403, { error: 'That setup code is not correct. It is printed in the terminal where the server was started.' }); }
          if (!auth.validUsername(body.username)) return json(res, 400, { error: 'Username: 3–40 letters, numbers, dot, dash or underscore.' });
          const problem = auth.passwordProblem(body.password);
          if (problem) return json(res, 400, { error: problem });
          auth.saveAccount(String(body.username), String(body.password));
          setupCode = '';
          const token = auth.createSession(auth.getUsername());
          logSignin(req, ip, body.username, 'account_created');
          console.log(`  Admin account “${auth.getUsername()}” created.`);
          json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(token, secure) });
        });
      }

      if (p === '/admin/api/password') {
        const me = adminOf(req);
        if (!me) return json(res, 401, { error: 'Admin sign-in required.' });
        return readJson(req, res, body => {
          const keys = ['ip:' + ip, 'pair:' + ip + '|' + me.username.toLowerCase()];
          if (auth.lockedFor(keys)) return json(res, 429, { error: 'Too many failed attempts. Try again later.' });
          if (!auth.checkPassword(me.username, body.current)) { auth.recordFail(keys); return json(res, 403, { error: 'Your current password is not correct.' }); }
          const problem = auth.passwordProblem(body.next);
          if (problem) return json(res, 400, { error: problem });
          logSignin(req, ip, me.username, 'password_changed');
          auth.saveAccount(me.username, String(body.next));
          auth.destroyAllSessions();                              // sign out everywhere, including old cookies
          const token = auth.createSession(me.username);
          json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(token, secure) });
        });
      }
      return json(res, 404, { error: 'Not found.' });
    }

    /* ---- admin pages ---- */
    if (p === '/admin' || p === '/admin/') {
      if (!auth.hasAdmin()) return redirect(res, '/admin/setup');
      if (!adminOf(req)) return redirect(res, '/admin/login');
      res.setHeader('Cache-Control', 'no-store');
      return serveFile(res, path.join(PUBLIC_DIR, 'admin.html'));
    }
    if (p === '/admin/login') {
      if (!auth.hasAdmin()) return redirect(res, '/admin/setup');
      if (adminOf(req)) return redirect(res, '/admin');
      return serveFile(res, path.join(PUBLIC_DIR, 'login.html'));
    }
    if (p === '/admin/setup') {
      if (auth.hasAdmin()) return redirect(res, adminOf(req) ? '/admin' : '/admin/login');
      return serveFile(res, path.join(PUBLIC_DIR, 'setup.html'));
    }
    // Public admin-app assets (styles, icons, installable-app files). The dashboard itself is never listed here.
    const ADMIN_PUBLIC = {
      '/admin/admin.css': 'admin.css', '/admin/manifest.webmanifest': 'admin.webmanifest', '/admin/sw.js': 'admin-sw.js',
      '/admin/icon-192.png': 'admin-192.png', '/admin/icon-512.png': 'admin-512.png',
      '/admin/icon-maskable-512.png': 'admin-maskable-512.png', '/admin/apple-touch-icon.png': 'admin-apple-touch-icon.png'
    };
    if (ADMIN_PUBLIC[p]) return serveFile(res, path.join(PUBLIC_DIR, ADMIN_PUBLIC[p]));

    if (p === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }

    // Student app files: only names on the allow-list, directly in the root.
    let rel = decodeURIComponent(p);
    if (rel === '/') rel = '/index.html';
    const name = rel.slice(1);
    if (!rel.startsWith('/') || !STUDENT_FILES.has(name)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const file = path.join(APP_ROOT, name);
    serveFile(res, file);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

/* ------------------------------------------------------------------ start */
if (process.argv.includes('--reset-admin')) {
  auth.removeAccountFile();
  console.log('\n  Admin account removed. Start the server again to create a new one.\n');
  process.exit(0);
}

load();
auth.loadAccount();

// Optional: create the first admin from environment variables (handy for hosting).
//   ADMIN_USER=teacher ADMIN_PASSWORD='a long passphrase' node server.js
if (!auth.hasAdmin()) {
  const envPass = process.env.ADMIN_PASSWORD || process.env.ADMIN_KEY;   // ADMIN_KEY: older name, still accepted
  if (envPass) {
    const user = process.env.ADMIN_USER || 'admin';
    const problem = !auth.validUsername(user) ? 'ADMIN_USER must be 3–40 letters/numbers/. - _' : auth.passwordProblem(envPass);
    if (problem) console.log(`  Could not create the admin from the environment: ${problem}`);
    else { auth.saveAccount(user, envPass); console.log(`  Admin account “${user}” created from environment variables.`); }
  }
}
if (!auth.hasAdmin()) setupCode = crypto.randomBytes(5).toString('hex').toUpperCase();

server.listen(PORT, () => {
  console.log('\n  Concord’s as your Tutor — live backend running');
  console.log(`  Student app:  http://localhost:${PORT}/`);
  console.log(`  Admin app:    http://localhost:${PORT}/admin`);
  if (auth.hasAdmin()) {
    console.log(`  Admin user:   ${auth.getUsername()}   (forgot the password?  node server.js --reset-admin)\n`);
  } else {
    console.log('\n  No admin account yet. Open the admin app and create one with this one-time setup code:');
    console.log(`  Setup code:   ${setupCode}\n`);
  }
});
