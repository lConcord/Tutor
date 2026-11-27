const DB = 'concordTutorDB_v2';
const defaults = {
  profile: null,
  student: null,
  materials: [],
  results: [],
  currentMaterial: null,
  quiz: null,
  theme: 'dark'
};

function getDB() {
  try {
    const saved = JSON.parse(localStorage.getItem(DB) || '{}');
    return { ...defaults, ...saved };
  } catch {
    return { ...defaults };
  }
}

function saveDB(d) {
  localStorage.setItem(DB, JSON.stringify(d));
}

function go(url) {
  window.location.href = url;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function applyTheme() {
  const d = getDB();
  document.documentElement.dataset.theme = d.theme || 'dark';
  const b = document.querySelector('#themeBtn');
  if (b) b.textContent = d.theme === 'light' ? '☀️' : '🌙';
}

function toggleTheme() {
  const d = getDB();
  d.theme = d.theme === 'light' ? 'dark' : 'light';
  saveDB(d);
  applyTheme();
}

function nav() {
  const el = document.querySelector('#nav');
  if (!el) return;

  el.innerHTML = `
    <div class="nav">
      <div class="container navin">
        <a class="brand" href="index.html">Concord’s <span>as your Tutor</span></a>
        <button class="iconbtn" id="menuBtn" aria-label="Open menu">☰</button>
        <div class="navlinks" id="navlinks">
          <a href="index.html">Home</a>
          <a href="learn.html">Learn</a>
          <a href="past-questions.html">Past Questions</a>
          <a href="smart-quiz.html">Quizzes</a>
          <a href="upload.html">My Notes</a>
          <a href="dashboard.html">Dashboard</a>
          <a href="more.html">More</a>
        </div>
        <button class="iconbtn" id="themeBtn" aria-label="Toggle theme">🌙</button>
      </div>
    </div>`;

  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#navlinks a').forEach(a => {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });

  document.querySelector('#themeBtn').onclick = toggleTheme;
  document.querySelector('#menuBtn').onclick = () =>
    document.querySelector('#navlinks').classList.toggle('open');

  applyTheme();
}

// Pages a student may be sent back to after entering their name / profile.
function safeNext(v) {
  return /^(learn|past-questions|smart-quiz|dashboard|leaderboard)\.html$/.test(v || '') ? v : '';
}

function requireProfile() {
  if (!getDB().profile) {
    go('profile.html');
    return false;
  }
  return true;
}

// The student currently taking the quiz. It is entered on student.html before
// every quiz, so the name is never tied to whoever filled in the profile first.
function studentName(d) {
  return (d.student && d.student.name) || (d.profile && d.profile.name) || 'Student';
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0];
}

function requireStudent() {
  const d = getDB();
  if (!d.student || !d.student.name) {
    go('student.html');
    return false;
  }
  return true;
}

function randomize(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordSet(s) {
  const stop = new Set(
    'the a an and or of to in on for from is are was were by with as this that it be has have had their his her its into at which what when where why how who'.split(' ')
  );
  return [...new Set(
    normalize(s).split(' ').filter(w => w.length > 3 && !stop.has(w))
  )].slice(0, 12);
}

function splitSentences(text) {
  return text
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 45);
}

function makeQuestions(text) {
  const sentences = splitSentences(text);
  const pool = [];
  const seen = new Set();

  const add = q => {
    const key = normalize(q.question);
    if (key && !seen.has(key)) {
      seen.add(key);
      pool.push(q);
    }
  };

  sentences.forEach((s, i) => {
    const words = s.match(/\b[A-Za-z][A-Za-z-]{4,}\b/g) || [];

    if (words.length >= 5) {
      const candidates = [...new Set(words)];
      const target = [...candidates].sort((a, b) => b.length - a.length)[0];
      const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`\\b${escapedTarget}\\b`, 'i');
      const distractors = randomize(
        candidates.filter(w => w.toLowerCase() !== target.toLowerCase())
      ).slice(0, 3);

      // Only make an MCQ when there are enough distinct choices.
      if (distractors.length >= 3) {
        add({
          type: 'mcq',
          question: `According to the study material, which term best completes this statement? “${s.replace(rx, '_____')}”`,
          options: [target, ...distractors],
          answer: target,
          explanation: s,
          source: s
        });
      }
    }

    if (i % 2 === 0) {
      const keys = keywordSet(s);
      if (keys.length >= 2) {
        add({
          type: 'theory',
          question: `Explain the main idea in this statement from the study material: “${s}”`,
          answer: s,
          keywords: keys,
          explanation: `A strong answer should cover the key ideas: ${keys.join(', ')}.`,
          source: s
        });
      }
    }
  });

  // Fallback: create theory questions from readable chunks if the material
  // contains too few complete sentences.
  if (pool.length < 4 && text.length > 80) {
    const chunks = text.match(/.{1,260}(?:\s|$)/g) || [];
    chunks.forEach(c => {
      const keys = keywordSet(c);
      if (keys.length >= 2) {
        add({
          type: 'theory',
          question: 'Summarise the following idea from the uploaded material in your own words.',
          answer: c.trim(),
          keywords: keys,
          explanation: `Your response should reflect the main concepts: ${keys.join(', ')}.`,
          source: c.trim()
        });
      }
    });
  }

  return pool;
}

function evaluate(q, user) {
  if (q.type === 'mcq') {
    return normalize(user) === normalize(q.answer) ? 1 : 0;
  }

  const answer = normalize(user);
  if (answer.length < 8) return 0;

  const userWords = new Set(keywordSet(user));
  const keys = q.keywords || keywordSet(q.answer);
  if (!keys.length) return 0;

  const hits = keys.filter(k => userWords.has(k)).length;
  return Math.min(1, hits / Math.max(3, Math.ceil(keys.length * 0.6)));
}

async function extractFile(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return await file.text();
  }

  if (name.endsWith('.pdf')) {
    if (!window.pdfjsLib) {
      throw new Error('PDF reader is still loading. Please wait a moment and try again.');
    }

    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      out += content.items.map(x => x.str || '').join(' ') + '\n';
    }

    return out;
  }

  if (name.endsWith('.docx')) {
    if (!window.mammoth) {
      throw new Error('DOCX reader is still loading. Please wait a moment and try again.');
    }

    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return result.value;
  }

  throw new Error('Unsupported file. Please use PDF, DOCX, TXT or MD.');
}

function initIndex() {
  const d = getDB();
  const welcome = document.querySelector('#welcome');
  if (!welcome) return;

  if (d.profile) {
    welcome.innerHTML = `
      <span class="eyebrow">Welcome back</span>
      <h1 class="title">Ready to <span class="gradient">learn?</span></h1>
      <p class="lead">Your profile is saved. Upload fresh notes or start another randomized quiz without repeating setup.</p>
      <div class="actions">
        <a class="btn primary" href="student.html">Start another quiz →</a>
        <a class="btn secondary" href="progress.html">View progress</a>
      </div>`;
  }
}

function initStudent() {
  const f = document.querySelector('#studentForm');
  if (!f) return;

  const d = getDB();
  const input = f.elements.studentName;
  const previous =
    (d.student && d.student.name) ||
    (d.results[0] && d.results[0].student) ||
    '';

  const next = () => {
    const want = safeNext(new URLSearchParams(location.search).get('next'));
    if (!getDB().profile) {
      if (want) { try { sessionStorage.setItem('concordNext', want); } catch (e) {} }
      go('profile.html');
    } else {
      go(want || 'upload.html');
    }
  };

  // Offer the last student's name as an optional shortcut, never pre-filled.
  const again = document.querySelector('#continueAs');
  if (again && previous) {
    again.textContent = `Continue as ${previous} →`;
    again.classList.remove('hidden');
    again.onclick = () => {
      const db = getDB();
      db.student = { name: previous };
      saveDB(db);
      next();
    };
  }

  f.onsubmit = e => {
    e.preventDefault();
    const name = String(input.value || '').trim().replace(/\s+/g, ' ');

    if (name.length < 2) {
      toast('Please enter the student’s name.');
      return;
    }

    const db = getDB();
    db.student = { name };
    saveDB(db);
    next();
  };

  input.focus();
}

function initProfile() {
  const f = document.querySelector('#profileForm');
  if (!f) return;

  const saved = getDB();
  const p = saved.profile;
  if (!p && saved.student && f.elements.name) f.elements.name.value = saved.student.name;
  if (p) {
    for (const [k, v] of Object.entries(p)) {
      const el = f.elements[k];
      if (el) el.value = v;
    }
  }

  f.onsubmit = e => {
    e.preventDefault();

    const fd = new FormData(f);
    const profile = {
      name: String(fd.get('name') || '').trim(),
      school: String(fd.get('school') || '').trim(),
      programme: String(fd.get('programme') || '').trim(),
      level: String(fd.get('level') || '').trim(),
      subjects: String(fd.get('subjects') || '').trim()
    };

    if (Object.values(profile).some(v => !v)) {
      toast('Please complete every profile field.');
      return;
    }

    const d = getDB();
    d.profile = profile;
    saveDB(d);
    let back = '';
    try { back = safeNext(sessionStorage.getItem('concordNext')); sessionStorage.removeItem('concordNext'); } catch (e) {}
    go(back || 'upload.html');
  };
}

function initUpload() {
  if (!document.querySelector('#file')) return;
  if (!requireStudent()) return;
  if (!requireProfile()) return;

  const input = document.querySelector('#file');
  const selected = document.querySelector('#selected');
  const status = document.querySelector('#status');
  const btn = document.querySelector('#continue');

  input.onchange = () => {
    const f = input.files[0];
    selected.textContent = f
      ? `${f.name} • ${(f.size / 1024 / 1024).toFixed(2)} MB`
      : '';
  };

  btn.onclick = async () => {
    const f = input.files[0];

    if (!f) {
      toast('Choose a study file first.');
      return;
    }

    status.classList.remove('hidden');
    status.innerHTML = `
      <div class="loading">
        <span class="spinner"></span>
        Reading your study material…
      </div>`;
    btn.disabled = true;

    try {
      const text = await extractFile(f);

      if (!text || text.trim().length < 100) {
        throw new Error('The file contains too little readable text. Scanned image-only PDFs may need OCR.');
      }

      const questions = makeQuestions(text);

      if (!questions.length) {
        throw new Error('We could not create question templates from this material.');
      }

      const d = getDB();
      const material = {
        id: Date.now(),
        name: f.name,
        size: f.size,
        text: text.slice(0, 100000),
        questions,
        createdAt: new Date().toISOString()
      };

      d.materials.unshift(material);
      d.currentMaterial = material.id;
      d.quiz = null;
      saveDB(d);

      status.innerHTML = `
        <strong>✓ Material ready.</strong><br>
        ${questions.length} unique question templates created from your notes.`;

      setTimeout(() => go('questions.html'), 500);
    } catch (err) {
      status.innerHTML = `<strong>Couldn’t read this file.</strong><br>${esc(err.message)}`;
    } finally {
      btn.disabled = false;
    }
  };
}

function initQuestions() {
  const available = document.querySelector('#available');
  if (!available) return;
  if (!requireStudent()) return;
  if (!requireProfile()) return;

  const d = getDB();

  if (!d.currentMaterial) {
    go('upload.html');
    return;
  }

  const m = d.materials.find(x => x.id === d.currentMaterial);

  if (!m || !Array.isArray(m.questions) || !m.questions.length) {
    toast('No question database is available. Upload your study material again.');
    go('upload.html');
    return;
  }

  available.textContent =
    `${m.questions.length} unique question templates available from ${m.name}`;

  const start = document.querySelector('#start');
  const counts = document.querySelectorAll('.count');

  counts.forEach(btn => {
    btn.onclick = () => {
      counts.forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      start.dataset.count = btn.dataset.count;
    };
  });

  // Make 20 the visible default while still allowing the user to change it.
  counts[0]?.click();

  start.onclick = () => {
    const requested = Number(start.dataset.count || 20);
    const actual = Math.min(requested, m.questions.length);

    if (actual < 1) {
      toast('No questions are available.');
      return;
    }

    const quiz = {
      materialId: m.id,
      questions: randomize(m.questions).slice(0, actual),
      index: 0,
      correct: 0,
      earned: 0,
      answers: [],
      startedAt: Date.now()
    };

    d.quiz = quiz;
    saveDB(d);
    go('quiz.html');
  };
}

function initQuiz() {
  if (!document.querySelector('#question')) return;
  if (!requireProfile()) return;

  const d = getDB();

  if (!d.quiz || !Array.isArray(d.quiz.questions) || !d.quiz.questions.length) {
    go('questions.html');
    return;
  }

  // Each question has its own linked address: quiz.html?q=1, ?q=2, ?q=3 …
  // Skipping ahead (or going back) via the URL always lands on the question
  // that is actually next, so every question is answered exactly once, in order.
  const current = d.quiz.index + 1;
  const requested = Number(new URLSearchParams(location.search).get('q'));
  if (requested !== current) {
    location.replace(`quiz.html?q=${current}`);
    return;
  }

  // The Submit button was never connected to submitAnswer(), which is why no
  // result was shown after answering.
  document.querySelector('#submit').onclick = submitAnswer;

  renderQuestion();
}

function renderQuestion() {
  const d = getDB();
  const q = d.quiz.questions[d.quiz.index];
  const total = d.quiz.questions.length;
  const idx = d.quiz.index;

  if (!q) {
    finishQuiz();
    return;
  }

  // Keep the quiz strictly sequential: 1 → 2 → 3 → … → final question.
  document.querySelector('#qnum').textContent = `Question ${idx + 1} of ${total}`;
  document.querySelector('#score').textContent = `Score: ${d.quiz.correct}`;
  document.querySelector('#bar').style.width = `${(idx / total) * 100}%`;
  document.querySelector('#question').textContent = q.question;

  const box = document.querySelector('#answerBox');
  box.innerHTML = '';

  if (q.type === 'mcq') {
    // Remember the shuffled order so a page refresh does not rearrange options.
    if (!Array.isArray(q.shuffled)) {
      q.shuffled = randomize(q.options);
      saveDB(d);
    }

    q.shuffled.forEach(o => {
      const lab = document.createElement('label');
      lab.className = 'option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'ans';
      radio.value = o;

      lab.appendChild(radio);
      lab.appendChild(document.createTextNode(` ${o}`));
      box.appendChild(lab);
    });
  } else {
    const ta = document.createElement('textarea');
    ta.id = 'theoryAnswer';
    ta.rows = 6;
    ta.placeholder = 'Write your answer in your own words…';
    box.appendChild(ta);
  }

  document.querySelector('#submit').classList.remove('hidden');
  document.querySelector('#submit').disabled = false;
  document.querySelector('#next').classList.add('hidden');
  document.querySelector('#feedback').classList.add('hidden');

  const review = document.querySelector('#answerReview');
  if (review) {
    review.classList.add('hidden');
    review.innerHTML = '';
  }

  // If this question was already answered (e.g. the page was refreshed after
  // submitting), show the saved result again instead of asking a second time.
  const saved = d.quiz.answers[idx];
  if (saved) {
    if (q.type === 'mcq') {
      box.querySelectorAll('input[name="ans"]').forEach(r => {
        r.checked = r.value === saved.user;
      });
    } else {
      box.querySelector('#theoryAnswer').value = saved.user;
    }
    showResult(d, q, saved);
  }
}

function submitAnswer() {
  const d = getDB();
  const idx = d.quiz.index;
  const q = d.quiz.questions[idx];

  // One answer per question: ignore repeat clicks once it has been recorded.
  if (d.quiz.answers[idx]) return;

  let user = '';

  if (q.type === 'mcq') {
    const el = document.querySelector('input[name="ans"]:checked');
    if (!el) {
      toast('Select an answer first.');
      return;
    }
    user = el.value;
  } else {
    user = document.querySelector('#theoryAnswer')?.value.trim() || '';
    if (!user) {
      toast('Write an answer first.');
      return;
    }
  }

  const score = evaluate(q, user);
  const correct = score >= 0.75;

  d.quiz.earned += score;
  d.quiz.correct += correct ? 1 : 0;

  const entry = {
    n: idx + 1,
    q: q.question,
    type: q.type,
    user,
    correctAnswer: q.answer,
    correct,
    score,
    subject: q.subject || '',
    topic: q.topic || '',
    qid: q.qid || '',
    difficulty: q.difficulty || ''
  };
  d.quiz.answers[idx] = entry;

  saveDB(d);
  showResult(d, q, entry);
}

// Shows whether the submitted answer was correct or incorrect, what the
// student wrote, and the "Next question" button that moves to question N+1.
function showResult(d, q, entry) {
  const { user, correct, score } = entry;
  const idx = d.quiz.index;
  const total = d.quiz.questions.length;

  // Lock the answer so it can't be edited after it has been marked.
  document.querySelectorAll('input[name="ans"]').forEach(r => { r.disabled = true; });
  const ta = document.querySelector('#theoryAnswer');
  if (ta) ta.disabled = true;

  document.querySelector('#score').textContent = `Score: ${d.quiz.correct}`;
  document.querySelector('#bar').style.width = `${((idx + 1) / total) * 100}%`;

  const submitBtn = document.querySelector('#submit');
  submitBtn.disabled = true;
  submitBtn.classList.add('hidden');

  const feedback = document.querySelector('#feedback');
  feedback.className = `feedback ${correct ? 'good' : 'bad'}`;

  if (correct) {
    feedback.innerHTML = `
      <strong>✓ Correct! Well done, ${esc(firstName(studentName(d)))}!</strong>
      <p>Your answer was accepted based on the uploaded study material.</p>
      <p>${esc(q.explanation)}</p>`;
  } else {
    feedback.innerHTML = `
      <strong>✗ Wrong answer</strong>
      <p><b>The answer from the study material:</b> ${esc(q.answer)}</p>
      <p>${esc(q.explanation)}</p>`;
  }

  feedback.classList.remove('hidden');

  // Always show exactly what the student submitted and how it was evaluated.
  const review = document.querySelector('#answerReview');
  if (review) {
    const pct = Math.round(score * 100);
    review.innerHTML = `
      <div class="card" style="margin-top:14px">
        <div><b>Your answer</b></div>
        <div class="small" style="margin-top:8px;white-space:pre-wrap">${esc(user)}</div>
        <div style="margin-top:12px"><b>Question result:</b> ${correct ? 'Correct' : 'Incorrect'} (${pct}%)</div>
      </div>`;
    review.classList.remove('hidden');
  }

  const nextBtn = document.querySelector('#next');
  nextBtn.classList.remove('hidden');
  nextBtn.textContent =
    idx + 1 >= total ? 'Finish quiz →' : `Next question →`;

  // Question N+1 opens only after question N has been answered and marked.
  nextBtn.onclick = () => {
    const current = getDB();

    if (current.quiz.index + 1 >= current.quiz.questions.length) {
      finishQuiz();
    } else {
      current.quiz.index++;
      saveDB(current);
      go(`quiz.html?q=${current.quiz.index + 1}`);
    }
  };
}

function finishQuiz() {
  const d = getDB();

  if (!d.quiz) {
    go('questions.html');
    return;
  }

  const q = d.quiz;
  const total = q.questions.length;

  // Theory answers can receive partial credit. Therefore the final percentage
  // uses earned points, while "correct" still means a substantially correct answer.
  const percent = Math.round((q.earned / total) * 10000) / 100;

  const result = {
    id: Date.now(),
    student: studentName(d),
    date: new Date().toISOString(),
    materialId: q.materialId,
    meta: q.meta || null,
    total,
    correct: q.correct,
    wrong: total - q.correct,
    earned: Math.round(q.earned * 100) / 100,
    percent,
    answers: (q.answers || []).filter(Boolean)
  };

  d.results.unshift(result);
  d.quiz = null;
  d.student = null; // the next quiz asks for a student name again
  saveDB(d);

  go(`results.html?id=${result.id}`);
}

function initResults() {
  if (!document.querySelector('#headline')) return;
  if (!requireProfile()) return;

  const d = getDB();
  const id = new URLSearchParams(location.search).get('id');
  const r = d.results.find(x => String(x.id) === String(id)) || d.results[0];

  if (!r) {
    go('index.html');
    return;
  }

  // results.html has no #name element; setting it unguarded threw an error
  // and stopped the score from ever being filled in.
  const nameEl = document.querySelector('#name');
  if (nameEl) nameEl.textContent = r.student || d.profile.name;
  document.querySelector('#percent').textContent = `${r.percent}%`;
  document.querySelector('#total').textContent = r.total;
  document.querySelector('#correct').textContent = r.correct;
  document.querySelector('#wrong').textContent = r.wrong;
  // Pass mark: correct answers are 70% or more of the questions given.
  const passed = r.total > 0 && r.correct / r.total >= 0.7;

  document.querySelector('#level').textContent =
    passed ? 'Excellent performance' : 'Keep practicing';

  document.querySelector('#headline').innerHTML =
    passed
      ? `🎉 HURRAY, ${esc(r.student || d.profile.name)}! 🎉`
      : `SHAME, ${esc(r.student || d.profile.name)}.`;

  document.querySelector('#message').textContent =
    passed
      ? 'Excellent work! Keep it up.'
      : 'Review the weak areas and try again.';

  // Question-by-question review (1, 2, 3 …) of what was answered.
  const review = document.querySelector('#review');
  if (review && Array.isArray(r.answers) && r.answers.length) {
    review.innerHTML = `
      <h2 style="margin:34px 0 14px">Your answers, question by question</h2>
      ${r.answers.map((a, i) => `
        <div class="card" style="margin:12px 0;text-align:left">
          <div class="small muted">Question ${a.n || i + 1} of ${r.total}</div>
          <div style="margin:6px 0 10px"><b>${esc(a.q)}</b></div>
          <div class="small" style="white-space:pre-wrap"><b>Your answer:</b> ${esc(a.user)}</div>
          <div class="feedback ${a.correct ? 'good' : 'bad'}" style="margin-top:10px">
            <strong>${a.correct ? '✓ Correct' : '✗ Incorrect'}</strong> (${Math.round(a.score * 100)}%)
            ${a.correct ? '' : `<p class="small"><b>Answer from the study material:</b> ${esc(a.correctAnswer)}</p>`}
          </div>
        </div>`).join('')}`;
  }
}

function initProgress() {
  const nameEl = document.querySelector('#name');
  if (!nameEl) return;
  if (!requireProfile()) return;

  const d = getDB();
  const latest = Array.isArray(d.results) && d.results[0];
  nameEl.textContent = (latest && latest.student) || d.profile.name;

  const arr = Array.isArray(d.results) ? d.results : [];
  const avg = arr.length
    ? Math.round(arr.reduce((a, b) => a + Number(b.percent || 0), 0) / arr.length * 10) / 10
    : 0;
  const best = arr.length ? Math.max(...arr.map(x => Number(x.percent || 0))) : 0;

  document.querySelector('#avg').textContent = `${avg}%`;
  document.querySelector('#best').textContent = `${best}%`;

  const attempts = document.querySelector('#attempts');
  if (attempts) attempts.textContent = arr.length;

  const list = document.querySelector('#list');

  if (!arr.length) {
    list.innerHTML = '<p class="muted">No quiz attempts yet.</p>';
    return;
  }

  list.innerHTML = arr.slice(0, 10).map((r, i) => `
    <div class="card" style="margin:12px 0">
      <div class="stat">
        <div>
          <b>Quiz ${arr.length - i}${r.student ? ` · ${esc(r.student)}` : ''}</b>
          <div class="small muted">${new Date(r.date).toLocaleString()}</div>
        </div>
        <strong style="margin-left:auto">${r.percent}%</strong>
      </div>
      <div class="chartbar" style="margin-top:12px">
        <span style="width:${Math.max(0, Math.min(100, Number(r.percent || 0)))}%"></span>
      </div>
    </div>`).join('');
}

function initAbout() {
  document.querySelector('#reset')?.addEventListener('click', () => {
    if (confirm('Reset profile and local progress?')) {
      localStorage.removeItem(DB);
      go('profile.html');
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  nav();
  initIndex();
  initStudent();
  initProfile();
  initUpload();
  initQuestions();
  initQuiz();
  initResults();
  initProgress();
  initAbout();
});
