# Concord’s as your Tutor

Static multi-page educational quiz app.

## Run
Serve the folder with any static web server, then open `index.html`.

Examples:
- VS Code Live Server
- `python -m http.server 8000`
- Vercel static deployment

## Supported study files
- PDF (text-based PDFs)
- DOCX
- TXT
- MD

The browser uses PDF.js and Mammoth from CDN for document extraction. Internet access is needed for those libraries on the upload page.

## Pages
- index.html — home
- profile.html — student profile
- upload.html — study database upload
- questions.html — question count
- quiz.html — interactive quiz
- results.html — score and 70% success condition
- progress.html — attempt history
- about.html — app information/reset


## Fixed build
This version uses a stable localStorage schema, Fisher-Yates question shuffling, safer answer rendering, guarded page initialization, partial-credit theory scoring, and clearer file-processing errors.


## Two apps: Student and Admin

| | Student app | Admin app |
|---|---|---|
| Who | Learners | Tutors / administrators only |
| Address | `/` | `/admin` |
| Sign-in | None – just their name | **Username + password** |
| Can do | Upload notes, take quizzes, see their own progress | Watch every student live, see uploads, answers, results, and who left a quiz |
| Installs as | “Concord Tutor” (purple **C** icon) | “Tutor Admin” (orange **A** icon) |

Students have no account and can never read any student data, theirs or anyone else's:
every admin route (`/admin`, `/api/state`, `/api/stream`, `/api/clear`) refuses requests
without a signed-in admin session.

### Run (Node 18+, no `npm install`)
```bash
node server.js
```
1. The first start prints a **one-time setup code** in the terminal.
2. Open `http://localhost:3000/admin`, enter that code and choose your admin username and password.
3. From then on, sign in at `/admin`. Students use `http://localhost:3000/`.

Skip the setup page by creating the admin from the environment instead:
```bash
ADMIN_USER=teacher ADMIN_PASSWORD='a long passphrase' node server.js
```
Forgot the password? Run `node server.js --reset-admin`, then start the server again to create a new account.
Signed-in admins can change their password from the dashboard (“Change password”), which also signs out other devices.

### Install as an app
Both apps are installable (Progressive Web Apps):
- **Phone:** open the address in Chrome/Safari → “Add to Home screen” / “Install app”. (The student app also shows an **Install app** button.)
- **Computer:** Chrome / Edge → install icon in the address bar.

The student app keeps working offline for pages already visited (uploading PDF/DOCX still needs
internet for its reader libraries; TXT/MD work offline). The admin app never caches anything: it
always needs a connection and a signed-in admin.
Note: browsers only allow installing from `https://` addresses (or `localhost`).

### What the admin sees, live
- **Student details** – name, school, programme, level, subjects.
- **Uploads** – file name, size and how many questions were generated (file contents are *not* sent).
- **Quiz progress** – quiz started, every answer (correct/wrong, with the question and their answer), current question, score, and the final HURRAY / SHAME result.
- **Leaving a quiz** – flagged in red with the question they stopped at and why (closed the tab, moved to another page, lost connection). Switching to another tab/app mid-quiz is logged too.
- **Presence** – online/offline, current page, device.
- **IP addresses** – each student's IP address (every network their device used), and every admin sign-in attempt with its IP address, in the **IP & sign-in log** panel (live) with CSV downloads. The student name page tells students their IP address is visible. On a host behind a proxy (Railway, Render, …) set `TRUST_PROXY=1`, otherwise only the platform's internal addresses are recorded.

Moving from question 3 to 4 or refreshing the page is *not* treated as leaving.

### Security notes
- Passwords are stored only as salted `scrypt` hashes in `data/admin.json` (file mode 600).
- The session is a random token in an `HttpOnly`, `SameSite=Strict` cookie (12 hours; `Secure` automatically on HTTPS).
- Failed sign-ins are rate limited (5 per address + username, 20 per address, per 10 minutes).
- Admin requests must be JSON from the same site (blocks cross-site form posts).
- Student-supplied text is always shown as plain text in the dashboard.
- When hosting online use HTTPS. Behind a proxy that terminates HTTPS (Render, nginx, …) also set `TRUST_PROXY=1`.
- The web server only serves an explicit list of student files; server code, the admin dashboard file and saved data are never served.
- The student name page tells students that their tutor can see this information.

### Putting it online
See **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions (Render, Railway or your own server).
Quick start on any host: start command `npm start`, and set `TRUST_PROXY=1`, `ADMIN_USER`, `ADMIN_PASSWORD`
(plus `DATA_DIR` pointing at a persistent disk if you want activity history to survive restarts).

### Hosting the student pages somewhere else
If the static pages are hosted separately from the backend, set the backend address in `config.js`:
```js
window.CONCORD_API = 'https://your-backend.example.com';
```
(Student activity reporting works cross-site; the admin app must be opened on the backend's own address.)


## File layout (flat)
Every file sits in one folder, so the project can be uploaded to GitHub from a phone (phone file pickers
cannot upload folders). Student pages: `index`, `student`, `profile`, `upload`, `questions`, `quiz`, `results`,
`progress`, `about` (`.html`) plus `styles.css`, `app.js`, `config.js`, `tracker.js`, `pwa.js`, `sw.js`,
`manifest.webmanifest` and the icon PNGs. Server: `server.js`, `auth.js`. Admin app: `login.html`, `setup.html`,
`admin.html`, `admin.css`, `admin.webmanifest`, `admin-sw.js` and the `admin-*.png` icons.


## Theme & animation
Colours: black `#111111`, orange `#FF4D00`, white `#FFFFFF`, grey `#A3A3A3` (dark mode by default; the sun/moon button switches to a white-and-black light mode with the same orange accent). All colours are CSS variables at the top of `styles.css` (student app) and `admin.css` / the top of `admin.html` (admin app).

`globe.js` draws the animated world globe (no libraries): it turns by itself, glowing arcs fly between cities, a satellite orbits it, and you can drag it to spin. It pauses when off-screen, never runs on the quiz page, and shows one still image if the device asks for reduced motion. The land map is stored as a compact bitmask inside the file.


## Study hub (Learn, Past Questions, Quizzes, Dashboard…)
Built from the "Ghana Student Hub" plan, starting with its Version 1 (Home → Subjects → Past Questions → Quiz → Results → Dashboard).
All quizzes run on the same quiz engine as "My Notes", so students get instant ✓ / ✗ feedback, then the next question, then HURRAY / SHAME.

| Page | What it does |
|---|---|
| `learn.html` | 13 subjects, topic by topic practice |
| `past-questions.html` | Examination → subject → year/paper → practice |
| `smart-quiz.html` | Subject → topic → difficulty → number of questions |
| `dashboard.html` | Overall progress, per-subject %, 🔥 streak, ⭐ XP and level, weakest topic with a revision quiz, recent quizzes |
| `leaderboard.html` | XP ranking, anonymous unless the student opts in to show "Ama M." |
| `search.html` | Searches subjects, topics, questions, scholarships, schools |
| `scholarships.html`, `schools.html` | Verified directories (see below) |
| `ai-tutor.html`, `pricing.html`, `more.html` | Coming-soon AI tutor modes, free/planned plans (no prices), and the "Explore" page |

XP: +5 per answer, +10 per correct answer, +25 per finished quiz, +100 per completed 7-day streak.
On phones a bottom bar (Home · Learn · Quiz · Progress · More) appears; it is hidden during quizzes.

### The questions are practice questions, not official past papers
`bank.js` holds 91 **original** practice questions (13 subjects), written for this app and checked by hand. They are labelled as practice questions on the site.
To add your **real past questions** (with year and paper), edit `bank-extra.js`: the file explains the format at the top. Questions with a year and paper then appear under *Past Questions → Year / Paper*. Invalid entries are ignored. Only add questions you have the right to use.

### Scholarships and schools
`directory.js` lists three verified scholarship programmes (Ghana Scholarships Authority, Chevening, Commonwealth Scholarships) and five public universities with their official websites, checked on 25 November 2026. No deadlines or entry requirements are shown because they change every year. To add an entry, verify it on its official website first, then copy an existing entry.

### Leaderboard privacy
Students appear as "Student 4F2A" unless they tick the box to show their first name and last initial. Names are limited to plain letters and basic punctuation, but they are chosen by the student's browser, so glance at the leaderboard now and then; "Clear data" in the admin dashboard resets it. XP is reported by the student's own browser, so a determined student could fake it: treat it as a motivation tool, not an official ranking.

### Not built yet (from the plan's later versions)
AI Tutor (needs an AI service and key), mock exams, tutors, payments/Premium, school partnerships. Their pages say "Coming soon".
`pagegen.py` can regenerate the pages; copy only the files you need, because `upload.html` there is older than the one in use.
