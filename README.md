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
cd backend
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

Moving from question 3 to 4 or refreshing the page is *not* treated as leaving.

### Security notes
- Passwords are stored only as salted `scrypt` hashes in `backend/data/admin.json` (file mode 600).
- The session is a random token in an `HttpOnly`, `SameSite=Strict` cookie (12 hours; `Secure` automatically on HTTPS).
- Failed sign-ins are rate limited (5 per address + username, 20 per address, per 10 minutes).
- Admin requests must be JSON from the same site (blocks cross-site form posts).
- Student-supplied text is always shown as plain text in the dashboard.
- When hosting online use HTTPS. Behind a proxy that terminates HTTPS (Render, nginx, …) also set `TRUST_PROXY=1`.
- The backend folder and saved data are never served by the web server.
- The student name page tells students that their tutor can see this information.

### Hosting the student pages somewhere else
If the static pages are hosted separately from the backend, set the backend address in `assets/config.js`:
```js
window.CONCORD_API = 'https://your-backend.example.com';
```
(Student activity reporting works cross-site; the admin app must be opened on the backend's own address.)
