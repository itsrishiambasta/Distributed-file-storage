import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { config } from '../config/index.js';

mkdirSync('./data', { recursive: true });

const db = new Database('./data/metadata.db');

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    quota_bytes INTEGER NOT NULL DEFAULT ${100 * 1024 * 1024}
  );

  CREATE TABLE IF NOT EXISTS files (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL REFERENCES users(id),
    name         TEXT NOT NULL,
    size_bytes   INTEGER NOT NULL,
    mime_type    TEXT,
    checksum     TEXT NOT NULL,
    version      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id           TEXT PRIMARY KEY,
    file_id      TEXT NOT NULL REFERENCES files(id),
    chunk_index  INTEGER NOT NULL,
    size_bytes   INTEGER NOT NULL,
    checksum     TEXT NOT NULL,
    UNIQUE(file_id, chunk_index)
  );

  CREATE TABLE IF NOT EXISTS chunk_locations (
    chunk_id   TEXT NOT NULL REFERENCES chunks(id),
    node_id    TEXT NOT NULL,
    stored_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (chunk_id, node_id)
  );

  CREATE TABLE IF NOT EXISTS file_versions (
    id           TEXT PRIMARY KEY,
    file_id      TEXT NOT NULL REFERENCES files(id),
    version      INTEGER NOT NULL,
    size_bytes   INTEGER NOT NULL,
    checksum     TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_files_owner   ON files(owner_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_file   ON chunks(file_id);
  CREATE INDEX IF NOT EXISTS idx_locs_chunk    ON chunk_locations(chunk_id);
  CREATE INDEX IF NOT EXISTS idx_locs_node     ON chunk_locations(node_id);
`);

export default db;
