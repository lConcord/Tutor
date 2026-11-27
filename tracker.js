/*
 * Live activity reporter for the tutor backend.
 * It only OBSERVES: it never changes how the app behaves, and if the backend
 * is not running every call fails silently and the quiz works exactly as before.
 *
 * Reports: student name, profile, uploaded file (name/size/question count),
 * quiz start, each answer, quiz completion, page views, heartbeats and
 * when a student leaves or switches away from an active quiz.
 */
(function () {
  'use strict';
  try {
    var DB = 'concordTutorDB_v2';
    var API = String(window.CONCORD_API || '').replace(/\/+$/, '');

    function rid() {
      try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, ''); } catch (e) {}
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    }
    function remembered(area, key) {
      try {
        var v = area.getItem(key);
        if (!v) { v = rid(); area.setItem(key, v); }
        return v;
      } catch (e) { return rid(); }
    }
    var sid = remembered(window.localStorage, 'concordTutorSid');   // one id per browser
    var tab = remembered(window.sessionStorage, 'concordTutorTab'); // one id per tab
    var page = (location.pathname.split('/').pop() || 'index.html');

    function cut(v, n) { return String(v == null ? '' : v).slice(0, n); }
    function qParam() { var q = Number(new URLSearchParams(location.search).get('q')); return q > 0 ? q : 0; }

    function post(type, data, beacon) {
      var body = JSON.stringify({ sid: sid, tab: tab, type: type, page: page, data: data || {} });
      try {
        if (beacon && navigator.sendBeacon) {
          if (navigator.sendBeacon(API + '/api/track', new Blob([body], { type: 'text/plain' }))) return;
        }
        // text/plain keeps this a "simple" request: no CORS pre-flight needed.
        fetch(API + '/api/track', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true })
          .catch(function () {});
      } catch (e) {}
    }

    function readDB() {
      try { return JSON.parse(localStorage.getItem(DB) || '{}') || {}; } catch (e) { return {}; }
    }
    function answered(q) { return q && Array.isArray(q.answers) ? q.answers.filter(Boolean).length : 0; }
    function currentMaterial(db) {
      var list = Array.isArray(db.materials) ? db.materials : [];
      for (var i = 0; i < list.length; i++) if (list[i].id === db.currentMaterial) return list[i];
      return null;
    }

    // What the browser already knows, so the backend can catch up on a returning student.
    function summary(db) {
      var m = currentMaterial(db);
      var q = db.quiz && Array.isArray(db.quiz.questions) ? db.quiz : null;
      return {
        student: db.student && db.student.name || '',
        profile: db.profile || null,
        material: m ? { name: m.name, size: m.size, questions: (m.questions || []).length } : null,
        quiz: q ? { total: q.questions.length, answered: answered(q), correct: q.correct || 0, earned: q.earned || 0 } : null
      };
    }

    // Turn a change in the saved app data into named events.
    function diff(p, n) {
      var out = [];
      var pn = p.student && p.student.name, nn = n.student && n.student.name;
      if (nn && nn !== pn) out.push(['student_name', { name: nn }]);

      if (n.profile && JSON.stringify(n.profile) !== JSON.stringify(p.profile)) {
        out.push(['profile_saved', { profile: n.profile }]);
      }
      if (n.currentMaterial && n.currentMaterial !== p.currentMaterial) {
        var m = currentMaterial(n);
        if (m) out.push(['material_uploaded', { name: m.name, size: m.size, questions: (m.questions || []).length }]);
      }

      if (typeof n.xp === 'number' && n.xp !== p.xp) out.push(['xp_update', { xp: n.xp }]);
      var pName = (p.prefs && p.prefs.lbName) || '', nName = (n.prefs && n.prefs.lbName) || '';
      if (pName !== nName) out.push(['leaderboard_prefs', { name: nName }]);

      var pq = p.quiz, nq = n.quiz;
      if (!pq && nq) {
        out.push(['quiz_started', { total: (nq.questions || []).length }]);
      } else if (pq && nq) {
        var pa = answered(pq), na = answered(nq);
        if (na > pa) {
          var a = nq.answers.filter(Boolean)[na - 1] || {};
          out.push(['answer_submitted', {
            n: a.n || na, total: (nq.questions || []).length, q: cut(a.q, 200), user: cut(a.user, 200),
            correct: !!a.correct, score: a.score, type: a.type
          }]);
        }
      } else if (pq && !nq) {
        var pr = (p.results || []).length, nr = (n.results || []).length;
        if (nr > pr) {
          var r = n.results[0] || {};
          out.push(['quiz_completed', { result: { student: r.student, total: r.total, correct: r.correct, percent: r.percent } }]);
        } else {
          out.push(['quiz_discarded', {}]);
        }
      }
      return out;
    }

    var prev = readDB();
    function onState(next) {
      try {
        diff(prev, next).forEach(function (e) { post(e[0], e[1]); });
      } catch (e) {}
      prev = next;
    }

    // Watch the app's own saves (app.js is left untouched).
    var origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      var r = origSet.apply(this, arguments);
      try { if (this === window.localStorage && key === DB) onState(JSON.parse(value) || {}); } catch (e) {}
      return r;
    };
    var origRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      var r = origRemove.apply(this, arguments);
      try { if (this === window.localStorage && key === DB) { post('progress_reset', {}); prev = {}; } } catch (e) {}
      return r;
    };

    // Presence.
    post('hello', { info: summary(prev), q: qParam() });
    setInterval(function () { post('heartbeat', { q: qParam() }); }, 5000);
    // Browsers also flip to "hidden" for a moment while a page is being left for the
    // next one (e.g. question 3 -> 4). Only report "switched away" if the page is still
    // alive and still hidden after a short delay; a normal page change never gets there.
    var hiddenTimer = null, reportedHidden = false;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearTimeout(hiddenTimer);
        hiddenTimer = setTimeout(function () {
          if (document.hidden) { reportedHidden = true; post('visibility', { hidden: true }); }
        }, 1500);
      } else {
        clearTimeout(hiddenTimer);
        if (reportedHidden) { reportedHidden = false; post('visibility', { hidden: false }); }
      }
    });
    window.addEventListener('pagehide', function () { post('leave', {}, true); });
  } catch (e) { /* tracking must never break the app */ }
})();
