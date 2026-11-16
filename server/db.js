/* ============================================================
   KREO — Base de données (Turso / libSQL)
   Turso en production (libsql://… + token), fichier local
   en développement (file:./data/kreo.db).
   ============================================================ */
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.TURSO_DATABASE_URL || 'file:./data/kreo.db';
const TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;

// Le driver fichier a besoin du dossier parent
if (URL.startsWith('file:')) {
  const p = URL.slice('file:'.length);
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
}

export const db = createClient({ url: URL, authToken: TOKEN });

export function dbKind() {
  return URL.startsWith('libsql:') || URL.startsWith('https:') ? 'turso' : 'local';
}

export async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)
  `);
}
