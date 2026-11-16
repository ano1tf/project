/* ============================================================
   KREO — Authentification (crypto + sessions)
   Mots de passe : scrypt (sel aléatoire, comparaison à temps
   constant). Sessions : jeton aléatoire 256 bits, stocké
   HACHÉ (sha256) en base — une fuite de la table sessions
   ne expose aucun jeton valide.
   ============================================================ */
import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/* ---------- Mots de passe ---------- */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return 's1$' + salt.toString('base64url') + '$' + hash.toString('base64url');
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 3 || parts[0] !== 's1') return false;
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    const actual = crypto.scryptSync(password, salt, 64, SCRYPT);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ---------- Sessions ---------- */
export function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('base64url');
}

/* ---------- Validation ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

export function validatePassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 200;
}

export function validateName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 60;
}

/* ---------- Limitation de débit (en mémoire) ---------- */
const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { n: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.n += 1;
  // nettoyage doux pour éviter la croissance mémoire
  if (buckets.size > 4000) {
    for (const [k, v] of buckets) {
      if (now > v.reset) buckets.delete(k);
    }
  }
  return b.n <= max;
}
