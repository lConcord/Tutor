'use strict';
/*
 * Admin accounts and sign-in sessions.
 *
 * Students never log in and have no account: they can only reach the student app
 * and POST their own activity. Everything that READS student data requires an
 * admin session created here.
 *
 *  - Passwords are stored as salted scrypt hashes (never in plain text).
 *  - Sessions are random 256-bit tokens in an HttpOnly, SameSite=Strict cookie.
 *  - Failed sign-ins are rate limited per address and per username.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

const COOKIE = 'concord_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;     // 12 hours
const MIN_PASSWORD = 8;
const FAIL_WINDOW_MS = 10 * 60 * 1000;      // failures are remembered for 10 minutes
// A given address + username may fail 5 times; one address may fail 20 times in total.
// Lockouts are per address on purpose: if they were per username, a stranger could lock the
// real admin out of their own account just by guessing wrong passwords.
const limitFor = key => (key.startsWith('ip:') ? 20 : 5);

/* ---------------------------------------------------------------- accounts */
let account = null;   // { username, salt, hash }

function loadAccount() {
  try { account = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8')); } catch { account = null; }
  return account;
}
function hasAdmin() { return !!account; }

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}
function saveAccount(username, password) {
  const { salt, hash } = hashPassword(password);
  account = { username, salt, hash, updated: Date.now() };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = ADMIN_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(account), { mode: 0o600 });
  fs.renameSync(tmp, ADMIN_FILE);
}
function removeAccountFile() {
  try { fs.unlinkSync(ADMIN_FILE); } catch { /* nothing to remove */ }
  account = null;
}
function validUsername(u) { return /^[A-Za-z0-9._-]{3,40}$/.test(String(u || '')); }
function passwordProblem(p) {
  p = String(p || '');
  if (p.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (p.length > 200) return 'Password is too long.';
  if (/^(.)\1+$/.test(p)) return 'Choose a less predictable password.';
  return '';
}

const DUMMY = hashPassword('not-a-real-password');
function checkPassword(username, password) {
  // Always run a hash so the response time does not reveal whether the username exists.
  const a = account && String(username) === account.username ? account : null;
  const { hash } = hashPassword(password, (a || DUMMY).salt);
  const ok = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from((a || DUMMY).hash, 'hex'));
  return !!a && ok;
}

/* ------------------------------------------------------------ rate limiting */
// keys look like  'ip:1.2.3.4'  and  'pair:1.2.3.4|teacher'
const fails = new Map();   // key -> [timestamps]
function recent(key) {
  const now = Date.now();
  const list = (fails.get(key) || []).filter(t => now - t < FAIL_WINDOW_MS);
  fails.set(key, list);
  return list;
}
function lockedFor(keys) {
  let wait = 0;
  keys.forEach(k => {
    const l = recent(k);
    if (l.length >= limitFor(k)) wait = Math.max(wait, FAIL_WINDOW_MS - (Date.now() - l[0]));
  });
  return wait;   // ms, 0 = allowed
}
function recordFail(keys) { keys.forEach(k => recent(k).push(Date.now())); }
function clearFails(keys) { keys.forEach(k => fails.delete(k)); }
setInterval(() => { for (const k of [...fails.keys()]) if (!recent(k).length) fails.delete(k); }, 60000).unref();

/* ----------------------------------------------------------------- sessions */
const sessions = new Map();   // sha256(token) -> { username, expires }
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

function createSession(username) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(sha(token), { username, expires: Date.now() + SESSION_MS });
  return token;
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function sessionOf(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const s = sessions.get(sha(token));
  if (!s) return null;
  if (s.expires < Date.now() || !account || s.username !== account.username) { sessions.delete(sha(token)); return null; }
  return { username: s.username, token };
}
function destroySession(token) { if (token) sessions.delete(sha(token)); }
function destroyAllSessions(exceptToken) {
  const keep = exceptToken ? sha(exceptToken) : null;
  for (const k of [...sessions.keys()]) if (k !== keep) sessions.delete(k);
}
setInterval(() => { const now = Date.now(); sessions.forEach((s, k) => { if (s.expires < now) sessions.delete(k); }); }, 60000).unref();

function cookieHeader(token, secure) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
}
function clearCookieHeader(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

module.exports = {
  loadAccount, hasAdmin, saveAccount, removeAccountFile, validUsername, passwordProblem,
  checkPassword, lockedFor, recordFail, clearFails,
  createSession, sessionOf, destroySession, destroyAllSessions, cookieHeader, clearCookieHeader,
  getUsername: () => (account ? account.username : ''), MIN_PASSWORD
};
