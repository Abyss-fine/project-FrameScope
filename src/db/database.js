import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { databasePath } from '../config.js';
import { normalizeName } from '../services/normalize.js';

export function openDatabase(filename = databasePath) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.function('normalize_name', { deterministic: true }, normalizeName);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

// Каждая SQL-миграция применяется один раз и целиком, в транзакции.
export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const directory = new URL('./migrations/', import.meta.url);
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name)) continue;
    db.transaction(() => {
      db.exec(readFileSync(new URL(name, directory), 'utf8'));
      db.prepare('INSERT INTO schema_migrations(name) VALUES (?)').run(name);
    })();
  }
}
