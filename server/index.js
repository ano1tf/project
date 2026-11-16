/* ============================================================
   KREO — Serveur (server/index.js)
   Sert le site statique + l'API d'authentification reliée à
   Turso (libSQL). Les pages /app/ et /editor/ exigent une
   session valide ; les jeux et la landing restent publics.

   Env :
     TURSO_DATABASE_URL  libsql://xxx.turso.io  (ou file:./data/kreo.db)
     TURSO_AUTH_TOKEN    jeton Turso
     PORT                défaut 8000
     NODE_ENV            production → cookies Secure

   Usage : node server/index.js [--redirect /app/]
   ============================================================ */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDB, dbKind } from './db.js';
import {
  hashPassword, verifyPassword, newSessionToken, hashToken,
  validateEmail, validatePassword, validateName, rateLimit
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT || '8000', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 30;
const COOKIE = 'kreo_sid';

const argv = process.argv.slice(2);
const REDIRECT = argv.includes('--redirect') ? (argv[argv.indexOf('--redirect') + 1] || '') : '';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

/* ---------- Cookies (lecture manuelle, signature inutile :
       le jeton est opaque et vérifié par hash en base) ---------- */
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: SESSION_DAYS * 86400000,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, path: '/' });
}

/* ---------- Sessions en base ---------- */
async function createSession(userId) {
  const token = newSessionToken();
  await db.execute({
    sql: `INSERT INTO sessions (token_hash, user_id, expires_at)
          VALUES (?, ?, datetime('now', '+' || ? || ' days'))`,
    args: [hashToken(token), userId, SESSION_DAYS]
  });
  return token;
}

async function getUserFromReq(req) {
  const sid = parseCookies(req)[COOKIE];
  if (!sid) return null;
  const r = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.created_at
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    args: [hashToken(sid)]
  });
  const row = r.rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

async function destroySession(req) {
  const sid = parseCookies(req)[COOKIE];
  if (!sid) return;
  await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [hashToken(sid)] });
}

/* ---------- En-têtes de sécurité ---------- */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

/* ---------- API : authentification ---------- */
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
}

const GENERIC_CREDS = { error: 'credentials' };

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const ip = req.ip || 'unknown';
    if (!rateLimit('reg:' + ip, 10, 10 * 60000)) {
      return res.status(429).json({ error: 'rate' });
    }
    const { name, email, password } = req.body || {};
    if (!validateName(name)) return res.status(400).json({ error: 'name' });
    if (!validateEmail(email)) return res.status(400).json({ error: 'email' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'password' });

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim();
    let result;
    try {
      result = await db.execute({
        sql: 'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
        args: [cleanEmail, cleanName, hashPassword(password)]
      });
    } catch (e) {
      if (String(e.message || e).toLowerCase().includes('unique')) {
        return res.status(409).json({ error: 'exists' });
      }
      throw e;
    }
    const user = { id: Number(result.lastInsertRowid), email: cleanEmail, name: cleanName, createdAt: null };
    const token = await createSession(user.id);
    setSessionCookie(res, token);
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const ip = req.ip || 'unknown';
    if (!rateLimit('login:' + ip, 15, 5 * 60000)) {
      return res.status(429).json({ error: 'rate' });
    }
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json(GENERIC_CREDS);
    }
    const cleanEmail = email.trim().toLowerCase();
    const r = await db.execute({
      sql: 'SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?',
      args: [cleanEmail]
    });
    const row = r.rows[0];
    // Même réponse si l'e-mail n'existe pas (pas d'énumération)
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json(GENERIC_CREDS);
    }
    const token = await createSession(row.id);
    setSessionCookie(res, token);
    res.json({ user: publicUser({ id: row.id, email: row.email, name: row.name, createdAt: row.created_at }) });
  } catch (e) {
    next(e);
  }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    await destroySession(req);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: dbKind() });
});

/* ---------- Redirection racine (instance espace créateur) ---------- */
if (REDIRECT) {
  app.get('/', (req, res) => res.redirect(302, REDIRECT));
}

/* ---------- Protection des pages privées ---------- */
function needsAuth(p) {
  return p === '/app' || p.startsWith('/app/') ||
         p === '/editor' || p.startsWith('/editor/');
}

app.use(async (req, res, next) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!needsAuth(req.path)) return next();
    const user = await getUserFromReq(req);
    if (user) return next();
    res.redirect(302, '/login/?next=' + encodeURIComponent(req.originalUrl));
  } catch (e) {
    next(e);
  }
});

/* ---------- Fichiers sensibles : jamais servis ---------- */
const BLOCKED = [
  /^\/server(\/|$)/, /^\/data(\/|$)/, /^\/node_modules(\/|$)/,
  /^\/tools(\/|$)/, /^\/\.git(\/|$)/, /^\/\.env/, /^\/package\.json$/, /^\/package-lock\.json$/
];
app.use((req, res, next) => {
  if (BLOCKED.some((re) => re.test(req.path))) return res.status(404).end();
  next();
});

/* ---------- Statique ---------- */
app.use(express.static(ROOT, { index: 'index.html', dotfiles: 'ignore' }));

/* ---------- 404 + erreurs ---------- */
app.use((req, res) => {
  res.status(404).type('text/plain').send('404 — introuvable');
});
app.use((err, req, res, next) => {
  console.error('[kreo]', err.message || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'server' });
});

/* ---------- Démarrage ---------- */
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[kreo] serveur prêt sur http://0.0.0.0:${PORT} (base: ${dbKind()})`);
  });
}).catch((e) => {
  console.error('[kreo] init base impossible :', e.message || e);
  process.exit(1);
});
