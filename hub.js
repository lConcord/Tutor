/*!
 * Concord study hub — Learn, Past Questions, Smart Quiz, Dashboard, Leaderboard, Search, Question of the Day,
 * and the phone bottom navigation. Quizzes run on the same quiz engine as "My Notes" (app.js), so students get
 * the same instant ✓ / ✗ feedback, results and progress tracking.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  function h(tag, a) {
    var el = document.createElement(tag);
    if (a) Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function file() { return location.pathname.split('/').pop() || 'index.html'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /* ---------------------------------------------------------------- question bank */
  var BANK = null;
  function bank() {
    if (BANK) return BANK;
    var b = window.CONCORD_BANK || { subjects: [], questions: [], exams: [] };
    var extra = Array.isArray(window.CONCORD_BANK_EXTRA) ? window.CONCORD_BANK_EXTRA : [];
    var sids = {}, seen = {}, qs = b.questions.slice();
    b.subjects.forEach(function (s) { sids[s.id] = true; });
    qs.forEach(function (q) { seen[q.id] = true; });
    extra.forEach(function (q) {
      var ok = q && typeof q.id === 'string' && !seen[q.id] && sids[q.s] && typeof q.q === 'string' && q.q &&
        Array.isArray(q.o) && q.o.length === 4 && q.o.every(function (x) { return typeof x === 'string' && x; }) &&
        new Set(q.o).size === 4 && q.a === Math.floor(q.a) && q.a >= 0 && q.a <= 3;
      if (!ok) { if (q) console.warn('bank-extra.js: skipped an invalid question', q && q.id); return; }
      seen[q.id] = true;
      qs.push({ id: q.id, s: q.s, t: String(q.t || 'General'), l: String(q.l || 'WASSCE'),
        d: ['Easy', 'Medium', 'Hard'].indexOf(q.d) >= 0 ? q.d : 'Medium', y: q.y || null, p: q.p ? String(q.p) : '',
        q: q.q, o: q.o.slice(), a: q.a, e: String(q.e || '') });
    });
    var subs = b.subjects.map(function (s) {
      var topics = [], counts = {}, total = 0;
      qs.forEach(function (q) {
        if (q.s !== s.id) return;
        total++;
        if (!counts[q.t]) { counts[q.t] = 0; topics.push(q.t); }
        counts[q.t]++;
      });
      return { id: s.id, name: s.name, icon: s.icon, count: total, topics: topics.map(function (t) { return { name: t, count: counts[t] }; }) };
    });
    BANK = { exams: b.exams || [], subjects: subs, questions: qs, subject: {} };
    subs.forEach(function (s) { BANK.subject[s.id] = s; });
    return BANK;
  }
  function pick(o) {
    var list = bank().questions.filter(function (q) {
      return (!o.subject || q.s === o.subject) && (!o.topic || q.t === o.topic) && (!o.difficulty || q.d === o.difficulty) &&
        (!o.level || q.l === o.level) && (o.year == null || o.year === '' || String(q.y || '') === String(o.year)) &&
        (o.paper == null || o.paper === '' || (q.p || '') === o.paper);
    });
    list = randomize(list);
    return o.count ? list.slice(0, o.count) : list;
  }
  function engineQ(q) {
    return { type: 'mcq', question: q.q, options: q.o.slice(), answer: q.o[q.a], explanation: q.e || 'Check your notes or ask your tutor.',
      qid: q.id, subject: q.s, topic: q.t, difficulty: q.d };
  }
  function startQuiz(list, meta) {
    if (!list.length) { toast('No questions match those choices yet.'); return; }
    var d = getDB();
    d.quiz = { materialId: 'bank', meta: meta || {}, questions: list.map(engineQ), index: 0, correct: 0, earned: 0, answers: [], startedAt: Date.now() };
    saveDB(d);
    go('quiz.html?q=1');
  }
  // Students enter their name once; after the profile step they come straight back to the page they wanted.
  function ensureReady() {
    var d = getDB();
    if (!d.student || !d.student.name) { go('student.html?next=' + encodeURIComponent(file())); return false; }
    if (!d.profile) { try { sessionStorage.setItem('concordNext', file()); } catch (e) {} go('profile.html'); return false; }
    return true;
  }

  /* -------------------------------------------------------------------- progress */
  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function stats(d, name) {
    var res = (d.results || []).filter(function (r) { return !name || r.student === name; });
    var subj = {}, topics = {}, answered = 0, correct = 0, days = {};
    res.forEach(function (r) {
      days[dayKey(r.date)] = 1;
      (r.answers || []).forEach(function (a) {
        answered++;
        if (a.correct) correct++;
        if (!a.subject) return;
        var s = subj[a.subject] || (subj[a.subject] = { answered: 0, correct: 0 });
        s.answered++; if (a.correct) s.correct++;
        var key = a.subject + '|' + a.topic;
        var t = topics[key] || (topics[key] = { subject: a.subject, topic: a.topic, answered: 0, correct: 0 });
        t.answered++; if (a.correct) t.correct++;
      });
    });
    // streak = consecutive days with a finished quiz, counting back from today (or yesterday)
    var one = 86400000, now = new Date(), streak = 0, cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!days[dayKey(cursor)]) cursor = new Date(cursor.getTime() - one);
    while (days[dayKey(cursor)]) { streak++; cursor = new Date(cursor.getTime() - one); }
    // +100 XP for every completed 7-day run
    var keys = Object.keys(days).sort(), run = 0, bonus = 0, prev = null;
    keys.forEach(function (k) {
      var parts = k.split('-'), cur = new Date(+parts[0], +parts[1] - 1, +parts[2]).getTime();
      run = prev !== null && Math.round((cur - prev) / one) === 1 ? run + 1 : 1;
      if (run % 7 === 0) bonus += 100;
      prev = cur;
    });
    var xp = answered * 5 + correct * 10 + res.length * 25 + bonus;
    return { results: res, answered: answered, correct: correct, quizzes: res.length, subj: subj, topics: topics,
      streak: streak, xp: xp, level: Math.floor(xp / 200) + 1, levelPct: (xp % 200) / 2,
      pct: answered ? Math.round(100 * correct / answered) : 0 };
  }
  // Keep the student's XP in the saved data so the leaderboard (and the tutor's dashboard) can see it.
  function syncXp(name) {
    var d = getDB();
    var who = name || (d.student && d.student.name) || (d.results && d.results[0] && d.results[0].student) || '';
    if (!who) return;
    var xp = stats(d, who).xp;
    if (d.xp !== xp) { d.xp = xp; saveDB(d); }
  }

  /* ---------------------------------------------------------------- home page */
  function home(root) {
    var qs = bank().questions, box = $('#qotdBox', root);
    if (!qs.length || !box) return;
    var today = dayKey(Date.now()), n = 0, i;
    for (i = 0; i < today.length; i++) n = (n * 31 + today.charCodeAt(i)) >>> 0;
    var q = qs[n % qs.length], store = null;
    try { store = JSON.parse(localStorage.getItem('concordQotd') || 'null'); } catch (e) {}
    var done = store && store.date === today ? store.pick : -1, btns = [];
    var fb = h('div', { class: 'small muted', style: 'margin-top:12px' });
    var subj = bank().subject[q.s];
    function reveal(i2) {
      btns.forEach(function (b, j) { b.disabled = true; if (j === q.a) b.classList.add('right'); else if (j === i2) b.classList.add('wrong'); });
      fb.textContent = (i2 === q.a ? '✓ Correct! ' : '✗ Not quite. The answer is “' + q.o[q.a] + '”. ') + (q.e || '');
    }
    q.o.forEach(function (o, j) {
      btns.push(h('button', { class: 'opt', type: 'button', text: o, onclick: function () {
        try { localStorage.setItem('concordQotd', JSON.stringify({ date: today, pick: j })); } catch (e) {}
        reveal(j);
      } }));
    });
    clear(box);
    add(box, [h('span', { class: 'eyebrow', text: 'Question of the day' }),
      h('h3', { style: 'margin:8px 0 2px', text: q.q }),
      h('div', { class: 'small muted', text: (subj ? subj.name + ' · ' : '') + q.t + ' · ' + q.d }),
      h('div', { class: 'opts' }, btns), fb]);
    if (done >= 0) reveal(done);
  }

  /* ----------------------------------------------------------------------- learn */
  function learn(root) {
    if (!ensureReady()) return;
    var view = $('#hubView', root);
    function render() {
      var id = decodeURIComponent((location.hash || '').slice(1)), s = bank().subject[id];
      clear(view);
      if (!s) {
        view.appendChild(h('div', { class: 'subject-grid' }, bank().subjects.map(function (x) {
          return h('a', { class: 'subject-card', href: 'learn.html#' + x.id },
            h('span', { class: 'ico', text: x.icon }), h('b', { text: x.name }),
            h('span', { class: 'meta', text: plural(x.count, 'question') + ' · ' + plural(x.topics.length, 'topic') }));
        })));
        return;
      }
      add(view, [h('a', { class: 'back', href: 'learn.html#', text: '← All subjects' }),
        h('div', { class: 'card' },
          h('h2', { style: 'margin:0 0 4px', text: s.icon + ' ' + s.name }),
          h('p', { class: 'muted', style: 'margin:0 0 14px', text: plural(s.count, 'practice question') + ' across ' + plural(s.topics.length, 'topic') + '.' }),
          h('button', { class: 'btn primary', type: 'button', text: 'Practice this subject (' + Math.min(10, s.count) + ' questions)',
            onclick: function () { startQuiz(pick({ subject: s.id, count: 10 }), { kind: 'learn', subject: s.id, label: s.name }); } })),
        h('div', { class: 'card', style: 'margin-top:16px' }, s.topics.map(function (t) {
          var n = Math.min(10, t.count);
          return h('div', { class: 'topic-row' },
            h('div', { class: 'grow' }, h('b', { text: t.name }), h('span', { class: 'meta', text: plural(t.count, 'question') })),
            h('button', { class: 'btn secondary', type: 'button', text: 'Practice ' + n,
              onclick: function () { startQuiz(pick({ subject: s.id, topic: t.name, count: 10 }), { kind: 'learn', subject: s.id, topic: t.name, label: s.name + ' · ' + t.name }); } }));
        }))]);
      window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', render);
    render();
  }

  /* ------------------------------------------------------------- past questions */
  function past(root) {
    if (!ensureReady()) return;
    var view = $('#hubView', root), st = { exam: 'WASSCE', subject: '', sheet: '', count: 10 };
    function qsFor(o) { return bank().questions.filter(function (q) { return (!o.exam || q.l === o.exam) && (!o.subject || q.s === o.subject); }); }
    function sheetKey(q) { return (q.y ? q.y : '') + '|' + (q.p || ''); }
    function sheetLabel(k) { var p = k.split('|'); return k === '|' ? 'Practice set' : (p[0] + (p[1] ? ' · ' + p[1] : '')); }
    function render() {
      var exams = bank().exams.length ? bank().exams : ['BECE', 'WASSCE', 'University', 'Entrance'];
      var avail = qsFor({ exam: st.exam }), subjectIds = [];
      avail.forEach(function (q) { if (subjectIds.indexOf(q.s) < 0) subjectIds.push(q.s); });
      if (st.subject && subjectIds.indexOf(st.subject) < 0) st.subject = '';
      var pool = qsFor({ exam: st.exam, subject: st.subject }), sheets = [];
      pool.forEach(function (q) { var k = sheetKey(q); if (sheets.indexOf(k) < 0) sheets.push(k); });
      if (st.sheet && sheets.indexOf(st.sheet) < 0) st.sheet = '';
      var final = pool.filter(function (q) { return !st.sheet || sheetKey(q) === st.sheet; });
      var counts = [5, 10, 20].filter(function (n) { return n < final.length; }).concat(final.length ? [final.length] : []);
      if (counts.indexOf(st.count) < 0) st.count = counts[Math.min(1, counts.length - 1)] || 0;
      clear(view);
      add(view, [
        h('div', { class: 'notice warn', style: 'margin-bottom:16px' },
          h('b', { text: 'About these questions. ' }),
          'These are original practice questions written in the style of each exam. They are not official past papers. Real past papers with their year and paper number appear in this section when your tutor adds them.'),
        h('div', { class: 'card' },
          h('div', { class: 'filters' },
            h('div', null, h('label', { class: 'lbl', text: 'EXAMINATION' }),
              h('div', { class: 'chips' }, exams.map(function (ex) {
                var n = qsFor({ exam: ex }).length;
                return h('button', { type: 'button', class: 'chip' + (st.exam === ex ? ' active' : '') + (n ? '' : ' disabled'), text: ex + (n ? '' : ' · soon'),
                  onclick: function () { st.exam = ex; st.subject = ''; st.sheet = ''; render(); } });
              }))),
            h('div', null, h('label', { class: 'lbl', for: 'selSub', text: 'SUBJECT' }),
              h('select', { id: 'selSub', onchange: function () { st.subject = this.value; st.sheet = ''; render(); } },
                [h('option', { value: '', text: 'All subjects' })].concat(subjectIds.map(function (id) {
                  var s = bank().subject[id]; return h('option', { value: id, text: s.icon + ' ' + s.name, selected: st.subject === id });
                })))),
            h('div', null, h('label', { class: 'lbl', for: 'selSheet', text: 'YEAR / PAPER' }),
              h('select', { id: 'selSheet', onchange: function () { st.sheet = this.value; render(); } },
                [h('option', { value: '', text: 'All available' })].concat(sheets.map(function (k) { return h('option', { value: k, text: sheetLabel(k), selected: st.sheet === k }); })))),
            h('div', null, h('label', { class: 'lbl', for: 'selCount', text: 'NUMBER OF QUESTIONS' }),
              h('select', { id: 'selCount', onchange: function () { st.count = Number(this.value); } },
                counts.map(function (n) { return h('option', { value: n, text: n === final.length && [5, 10, 20].indexOf(n) < 0 ? 'All (' + n + ')' : String(n), selected: st.count === n }); })))),
          h('p', { class: 'avail' }, h('b', { text: String(final.length) }), ' question' + (final.length === 1 ? '' : 's') + ' available'),
          h('button', { class: 'btn primary', type: 'button', text: 'Start practice →', disabled: !final.length,
            onclick: function () {
              var count = Math.min(st.count || 10, final.length);
              var list = randomize(final).slice(0, count);
              startQuiz(list, { kind: 'past', exam: st.exam, subject: st.subject, label: st.exam + (st.subject ? ' · ' + bank().subject[st.subject].name : '') });
            } }))]);
    }
    render();
  }

  /* ----------------------------------------------------------------- smart quiz */
  function smart(root) {
    if (!ensureReady()) return;
    var view = $('#hubView', root), st = { subject: '', topic: '', difficulty: '', count: 10 };
    function render() {
      var subs = bank().subjects.filter(function (s) { return s.count; }), s = bank().subject[st.subject];
      var avail = pick({ subject: st.subject, topic: st.topic, difficulty: st.difficulty }).length;
      var counts = [5, 10, 15, 20].filter(function (n) { return n < avail; }).concat(avail ? [avail] : []);
      if (counts.indexOf(st.count) < 0) st.count = counts[Math.min(1, counts.length - 1)] || 0;
      function field(label, id, select) { return h('div', { class: 'field' }, h('label', { class: 'lbl', for: id, text: label }), select); }
      clear(view);
      add(view, h('div', { class: 'card' },
        h('div', { class: 'filters' },
          field('SUBJECT', 'qSub', h('select', { id: 'qSub', onchange: function () { st.subject = this.value; st.topic = ''; render(); } },
            [h('option', { value: '', text: 'Any subject' })].concat(subs.map(function (x) { return h('option', { value: x.id, text: x.icon + ' ' + x.name, selected: st.subject === x.id }); })))),
          field('TOPIC', 'qTopic', h('select', { id: 'qTopic', disabled: !s, onchange: function () { st.topic = this.value; render(); } },
            [h('option', { value: '', text: s ? 'All topics' : 'Choose a subject first' })].concat(s ? s.topics.map(function (t) { return h('option', { value: t.name, text: t.name, selected: st.topic === t.name }); }) : []))),
          field('DIFFICULTY', 'qDiff', h('select', { id: 'qDiff', onchange: function () { st.difficulty = this.value; render(); } },
            ['', 'Easy', 'Medium', 'Hard'].map(function (x) { return h('option', { value: x, text: x || 'Any difficulty', selected: st.difficulty === x }); }))),
          field('NUMBER OF QUESTIONS', 'qCount', h('select', { id: 'qCount', onchange: function () { st.count = Number(this.value); } },
            counts.map(function (n) { return h('option', { value: n, text: n === avail && counts.length > 1 && [5, 10, 15, 20].indexOf(n) < 0 ? 'All (' + n + ')' : String(n), selected: st.count === n }); })))),
        h('p', { class: 'avail' }, h('b', { text: String(avail) }), ' question' + (avail === 1 ? '' : 's') + ' match' + (avail === 1 ? 'es' : '') + ' your choices'),
        h('button', { class: 'btn primary', type: 'button', text: 'Start quiz →', disabled: !avail,
          onclick: function () {
            startQuiz(pick({ subject: st.subject, topic: st.topic, difficulty: st.difficulty, count: st.count }),
              { kind: 'smart', subject: st.subject, topic: st.topic, difficulty: st.difficulty, label: s ? s.name + (st.topic ? ' · ' + st.topic : '') : 'Mixed subjects' });
          } })));
    }
    render();
  }

  /* ------------------------------------------------------------------ dashboard */
  function dashboard(root) {
    if (!ensureReady()) return;
    var d = getDB(), name = d.student.name, s = stats(d, name), view = $('#hubView', root);
    syncXp(name);
    var first = String(name).split(/\s+/)[0];
    clear(view);
    add(view, h('h1', { class: 'title', style: 'font-size:clamp(1.8rem,4vw,2.6rem);margin:0 0 4px', text: 'Welcome, ' + first + ' 👋' }));
    if (!s.answered) {
      add(view, h('div', { class: 'card empty' }, h('p', { text: 'No practice yet. Take your first quiz and this dashboard will fill up with your progress, streak and weak topics.' }),
        h('a', { class: 'btn primary', href: 'smart-quiz.html', text: 'Start a quiz →' })));
      return;
    }
    // overall progress
    add(view, h('div', { class: 'card' }, h('div', { style: 'display:flex;justify-content:space-between;font-weight:800;margin-bottom:8px' },
      h('span', { text: 'Overall progress' }), h('span', { text: s.pct + '%' })), h('div', { class: 'meter' }, h('i', { style: 'width:' + s.pct + '%' })),
      h('p', { class: 'small muted', style: 'margin:8px 0 0', text: s.correct + ' correct out of ' + s.answered + ' questions answered, across ' + plural(s.quizzes, 'quiz') + '.' })));
    // KPIs
    add(view, h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('b', { text: '🔥 ' + s.streak }), h('span', { text: s.streak === 1 ? 'day streak' : 'day streak' })),
      h('div', { class: 'kpi' }, h('b', { text: '⭐ ' + s.xp }), h('span', { text: 'XP · level ' + s.level }), h('div', { class: 'meter', style: 'margin-top:8px' }, h('i', { style: 'width:' + s.levelPct + '%' }))),
      h('div', { class: 'kpi' }, h('b', { text: String(s.quizzes) }), h('span', { text: 'quizzes finished' })),
      h('div', { class: 'kpi' }, h('b', { text: String(s.answered) }), h('span', { text: 'questions answered' }))));
    // subjects
    var rows = Object.keys(s.subj).map(function (id) { var x = s.subj[id]; return { id: id, a: x.answered, p: Math.round(100 * x.correct / x.answered) }; })
      .sort(function (a, b) { return b.a - a.a; });
    if (rows.length) add(view, h('div', { class: 'card bars', style: 'margin-top:16px' }, h('h3', { style: 'margin:0 0 6px', text: 'By subject' }),
      rows.map(function (r) {
        var sub = bank().subject[r.id];
        return h('div', { class: 'brow' }, h('span', { text: (sub ? sub.icon + ' ' + sub.name : r.id) }), h('div', { class: 'meter' }, h('i', { style: 'width:' + r.p + '%' })), h('em', { text: r.p + '%' }));
      })));
    // weakest topic + recommendation
    var weak = null;
    Object.keys(s.topics).forEach(function (k) {
      var t = s.topics[k]; if (t.answered < 2) return;
      t.p = t.correct / t.answered;
      if (!weak || t.p < weak.p || (t.p === weak.p && t.answered > weak.answered)) weak = t;
    });
    if (weak) {
      var sub2 = bank().subject[weak.subject], n = Math.min(15, pick({ subject: weak.subject, topic: weak.topic }).length);
      add(view, h('div', { class: 'callout' }, h('h3', { text: 'Weakest topic: ' + weak.topic }),
        h('p', { text: (sub2 ? sub2.name + ' · ' : '') + Math.round(weak.p * 100) + '% correct (' + weak.correct + ' of ' + weak.answered + '). A little extra practice here will lift your score most.' }),
        n ? h('button', { class: 'btn primary', type: 'button', text: 'Practice ' + n + ' ' + weak.topic + ' questions →',
          onclick: function () { startQuiz(pick({ subject: weak.subject, topic: weak.topic, count: 15 }), { kind: 'revision', subject: weak.subject, topic: weak.topic, label: 'Revision · ' + weak.topic }); } }) : null));
    } else {
      add(view, h('div', { class: 'callout' }, h('h3', { text: 'Finding your weak topics…' }), h('p', { text: 'Answer a few more questions in each subject and your weakest topic will show up here, with a revision quiz ready to go.' }),
        h('a', { class: 'btn primary', href: 'smart-quiz.html', text: 'Practise more →' })));
    }
    // recent results
    add(view, h('div', { class: 'card reslist', style: 'margin-top:16px' }, h('h3', { style: 'margin:0 0 6px', text: 'Recent quizzes' }),
      s.results.slice(0, 5).map(function (r) {
        var label = r.meta && r.meta.label ? r.meta.label : 'My notes quiz';
        return h('div', { class: 'rrow' }, h('span', { text: label }), h('b', { text: r.correct + '/' + r.total + ' · ' + Math.round(r.percent) + '%' }));
      })));
    add(view, h('p', { style: 'margin-top:18px' }, h('a', { class: 'btn secondary', href: 'leaderboard.html', text: '🏆 See the leaderboard' })));
  }

  /* ---------------------------------------------------------------- leaderboard */
  function leaderboard(root) {
    if (!ensureReady()) return;
    var view = $('#hubView', root), d = getDB(), name = d.student.name;
    syncXp(name);
    function shortName(n) { var p = String(n).trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.' : p[0]; }
    var on = !!(d.prefs && d.prefs.lbName);
    var box = h('div', { class: 'card lb' }, h('div', { class: 'empty', text: 'Loading…' }));
    var toggle = h('label', { class: 'small', style: 'display:flex;gap:10px;align-items:flex-start;margin:14px 0' },
      h('input', { type: 'checkbox', checked: on, style: 'margin-top:3px', onchange: function () {
        var db = getDB(); db.prefs = db.prefs || {}; db.prefs.lbName = this.checked ? shortName(name) : ''; saveDB(db); setTimeout(load, 600);
      } }),
      h('span', null, 'Show my name on the leaderboard as “', h('b', { text: shortName(name) }), '”. ', h('span', { class: 'muted', text: 'Off by default: other students then see you as an anonymous “Student” code.' })));
    clear(view);
    add(view, [h('p', { class: 'muted', text: 'Earn XP: +5 for each answer, +10 for each correct answer, +25 for finishing a quiz and +100 for a 7-day streak.' }), toggle, box]);
    function load() {
      var sid = ''; try { sid = localStorage.getItem('concordTutorSid') || ''; } catch (e) {}
      fetch('/api/leaderboard?sid=' + encodeURIComponent(sid), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
        clear(box);
        if (!j.top.length) { add(box, h('div', { class: 'empty', text: 'No one is on the board yet. Finish a quiz to get the first spot!' })); return; }
        j.top.forEach(function (r) {
          add(box, h('div', { class: 'lrow' + (r.you ? ' you' : '') }, h('span', { class: 'rank', text: '#' + r.rank }), h('span', { text: r.label + (r.you ? ' (you)' : '') }), h('span', { class: 'xp', text: r.xp + ' XP' })));
        });
        if (j.me && j.me.rank > j.top.length) add(box, h('div', { class: 'lrow you' }, h('span', { class: 'rank', text: '#' + j.me.rank }), h('span', { text: j.me.label + ' (you)' }), h('span', { class: 'xp', text: j.me.xp + ' XP' })));
      }).catch(function () {
        clear(box); add(box, h('div', { class: 'empty', text: 'The leaderboard needs the live server. Try again in a moment.' }));
      });
    }
    setTimeout(load, 700);
  }

  /* --------------------------------------------------------------------- search */
  var PAGES = [
    { t: 'Learn by subject', u: 'learn.html', k: 'learn subjects topics study' }, { t: 'Past Questions', u: 'past-questions.html', k: 'past questions wassce bece exam practice papers' },
    { t: 'Smart Quiz', u: 'smart-quiz.html', k: 'quiz test practice questions' }, { t: 'My Notes (upload your material)', u: 'upload.html', k: 'notes upload material pdf document' },
    { t: 'My Dashboard', u: 'dashboard.html', k: 'dashboard progress streak xp weak topics' }, { t: 'Leaderboard', u: 'leaderboard.html', k: 'leaderboard ranking xp' },
    { t: 'Scholarships', u: 'scholarships.html', k: 'scholarships funding bursary' }, { t: 'Schools directory', u: 'schools.html', k: 'schools universities admission colleges' },
    { t: 'AI Tutor (coming soon)', u: 'ai-tutor.html', k: 'ai tutor explain solve homework' }, { t: 'Pricing', u: 'pricing.html', k: 'pricing free premium cost' }
  ];
  function search(root) {
    var q = (new URLSearchParams(location.search).get('q') || '').trim(), view = $('#hubView', root);
    var input = $('#q', root); if (input) input.value = q;
    clear(view);
    if (!q) { add(view, h('div', { class: 'empty', text: 'Type a subject, topic, school or question above.' })); return; }
    var toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    function hit(text) { var t = String(text).toLowerCase(); return toks.every(function (k) { return t.indexOf(k) >= 0; }); }
    var groups = [], dir = window.CONCORD_DIR || { scholarships: [], schools: [] };
    var subs = bank().subjects.filter(function (s) { return hit(s.name); });
    var topics = []; bank().subjects.forEach(function (s) { s.topics.forEach(function (t) { if (hit(t.name + ' ' + s.name)) topics.push({ s: s, t: t }); }); });
    var questions = bank().questions.filter(function (x) { return hit(x.q + ' ' + x.t); }).slice(0, 8);
    var sch = dir.scholarships.filter(function (x) { return hit(x.name + ' ' + x.blurb + ' ' + x.type); });
    var schools = dir.schools.filter(function (x) { return hit(x.name + ' ' + x.short + ' ' + x.city + ' ' + x.region); });
    var pages = PAGES.filter(function (x) { return hit(x.t + ' ' + x.k); });
    function group(title, items) { if (items.length) groups.push(h('div', { class: 'res-group' }, h('h3', { text: title }), items)); }
    group('Subjects', subs.map(function (s) { return h('a', { class: 'res-hit', href: 'learn.html#' + s.id }, h('b', { text: s.icon + ' ' + s.name }), h('small', { text: plural(s.count, 'question') })); }));
    group('Topics', topics.slice(0, 10).map(function (x) { return h('a', { class: 'res-hit', href: 'learn.html#' + x.s.id }, h('b', { text: x.t.name }), h('small', { text: x.s.name + ' · ' + plural(x.t.count, 'question') })); }));
    group('Past questions', questions.map(function (x) { return h('a', { class: 'res-hit', href: 'learn.html#' + x.s }, h('b', { text: x.q }), h('small', { text: bank().subject[x.s].name + ' · ' + x.t + ' · ' + x.l })); }));
    group('Scholarships', sch.map(function (x) { return h('a', { class: 'res-hit', href: 'scholarships.html' }, h('b', { text: x.name }), h('small', { text: x.type + ' · ' + x.level })); }));
    group('Schools', schools.map(function (x) { return h('a', { class: 'res-hit', href: 'schools.html' }, h('b', { text: x.name + ' (' + x.short + ')' }), h('small', { text: x.city + ', ' + x.region })); }));
    group('Pages', pages.map(function (x) { return h('a', { class: 'res-hit', href: x.u }, h('b', { text: x.t })); }));
    if (!groups.length) add(view, h('div', { class: 'empty', text: 'Nothing found for “' + q + '”. Try a subject name like “physics”, or a school like “KNUST”.' }));
    else add(view, groups);
  }

  /* ------------------------------------------------------ scholarships / schools */
  function directoryPage(kind) {
    return function (root) {
      var dir = window.CONCORD_DIR || { scholarships: [], schools: [] }, view = $('#hubView', root), list = dir[kind];
      var input = $('#dirFilter', root);
      function render() {
        var f = (input && input.value || '').toLowerCase().trim(); clear(view);
        var items = list.filter(function (x) { return !f || JSON.stringify(x).toLowerCase().indexOf(f) >= 0; });
        if (!items.length) { add(view, h('div', { class: 'empty', text: 'No matches. Try a different word.' })); return; }
        items.forEach(function (x) {
          if (kind === 'scholarships') {
            add(view, h('div', { class: 'card dir-card' }, h('h3', { text: x.name }),
              h('div', { class: 'meta' }, [x.formerly ? x.formerly + ' · ' : '', h('span', { class: 'pill ok', text: x.type }), ' ', x.level]),
              h('p', { style: 'margin:0 0 8px', text: x.blurb }), h('p', { class: 'small muted', style: 'margin:0', text: x.note }),
              h('div', { class: 'links' }, [h('a', { class: 'btn secondary', href: x.site, target: '_blank', rel: 'noopener noreferrer', text: 'Official website ↗' }),
                x.apply ? h('a', { class: 'btn secondary', href: x.apply, target: '_blank', rel: 'noopener noreferrer', text: 'Application portal ↗' }) : null])));
          } else {
            add(view, h('div', { class: 'card dir-card' }, h('h3', { text: x.name + ' (' + x.short + ')' }),
              h('div', { class: 'meta', text: x.type + ' · ' + x.city + ', ' + x.region + ' Region' }),
              h('div', { class: 'links' }, [h('a', { class: 'btn secondary', href: x.site, target: '_blank', rel: 'noopener noreferrer', text: 'Official website ↗' }),
                x.apply ? h('a', { class: 'btn secondary', href: x.apply, target: '_blank', rel: 'noopener noreferrer', text: 'Admissions portal ↗' }) : null])));
          }
        });
      }
      if (input) input.addEventListener('input', render);
      render();
    };
  }

  /* ---------------------------------------------------------------- shared bits */
  function bottomNav() {
    var here = file();
    if (here === 'quiz.html') return;                                   // keep the quiz distraction-free
    var items = [['index.html', '🏠', 'Home'], ['learn.html', '📚', 'Learn'], ['smart-quiz.html', '🧠', 'Quiz'], ['dashboard.html', '📊', 'Progress'], ['more.html', '☰', 'More']];
    var nav = h('nav', { class: 'bottomnav', 'aria-label': 'Main' }, items.map(function (x) {
      return h('a', { href: x[0], class: x[0] === here ? 'active' : '' }, h('span', { class: 'ico', text: x[1] }), x[2]);
    }));
    document.body.appendChild(nav);
    document.body.classList.add('has-bottomnav');
  }
  function resultsHook() {
    var act = $('.result .actions');
    if (act) act.appendChild(h('a', { class: 'btn secondary', href: 'dashboard.html', text: '📊 My dashboard' }));
    var d = getDB(), id = Number(new URLSearchParams(location.search).get('id'));
    var r = (d.results || []).filter(function (x) { return x.id === id; })[0] || (d.results || [])[0];
    if (r) syncXp(r.student);
  }

  var REG = { home: home, learn: learn, past: past, smart: smart, dashboard: dashboard, leaderboard: leaderboard, search: search,
    scholarships: directoryPage('scholarships'), schools: directoryPage('schools') };

  window.addEventListener('DOMContentLoaded', function () {
    try {
      bottomNav();
      if (file() === 'results.html') resultsHook();
      var m = $('[data-hub]');
      if (m && REG[m.getAttribute('data-hub')]) REG[m.getAttribute('data-hub')](m);
    } catch (e) { console.error('hub:', e); }
  });
  window.ConcordHub = { bank: bank, pick: pick, stats: stats, startQuiz: startQuiz };
})();
