/**
 * SQLite database layer — sync JSON transcripts, query, stats.
 * Uses better-sqlite3 for synchronous, fast access.
 */

import Database from "better-sqlite3";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, basename } from "path";
import { getConfig } from "./config.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    audio_path TEXT,
    date DATE,
    time TIME,
    datetime DATETIME,
    year INTEGER,
    month INTEGER,
    day INTEGER,
    duration_seconds REAL,
    transcript TEXT,
    title TEXT,
    summary TEXT,
    sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral', 'mixed', NULL)),
    json_path TEXT,
    transcribed_at DATETIME,
    enriched_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_people (
    note_id TEXT NOT NULL,
    person_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, person_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_topics (
    note_id TEXT NOT NULL,
    topic_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, topic_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_keywords (
    note_id TEXT NOT NULL,
    keyword_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, keyword_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id TEXT NOT NULL,
    content TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date);
CREATE INDEX IF NOT EXISTS idx_notes_sentiment ON notes(sentiment);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    id, title, summary, transcript,
    content='notes', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, id, title, summary, transcript)
    VALUES (NEW.rowid, NEW.id, NEW.title, NEW.summary, NEW.transcript);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, id, title, summary, transcript)
    VALUES('delete', OLD.rowid, OLD.id, OLD.title, OLD.summary, OLD.transcript);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, id, title, summary, transcript)
    VALUES('delete', OLD.rowid, OLD.id, OLD.title, OLD.summary, OLD.transcript);
    INSERT INTO notes_fts(rowid, id, title, summary, transcript)
    VALUES (NEW.rowid, NEW.id, NEW.title, NEW.summary, NEW.transcript);
END;

CREATE VIEW IF NOT EXISTS v_notes_with_tags AS
SELECT n.*, GROUP_CONCAT(t.name, ', ') as tags_list
FROM notes n
LEFT JOIN note_tags nt ON n.id = nt.note_id
LEFT JOIN tags t ON nt.tag_id = t.id
GROUP BY n.id;
`;

function getDb(): Database.Database {
  const cfg = getConfig();
  const db = new Database(cfg.db_path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

function getOrCreate(db: Database.Database, table: string, name: string): number {
  const row = db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name) as { id: number } | undefined;
  if (row) return row.id;
  return db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(name).lastInsertRowid as number;
}

function findJsonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(d, entry.name));
      else if (entry.name.endsWith(".json") && !entry.name.startsWith("_")) {
        results.push(join(d, entry.name));
      }
    }
  }
  walk(dir);
  return results.sort();
}

function syncNote(db: Database.Database, jsonPath: string) {
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const id = data.id || basename(jsonPath, ".json");

  db.prepare(`
    INSERT INTO notes (id, filename, audio_path, date, time, datetime, year, month, day,
      duration_seconds, transcript, title, summary, sentiment,
      transcribed_at, enriched_at, json_path, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      filename=excluded.filename, audio_path=excluded.audio_path, date=excluded.date,
      time=excluded.time, datetime=excluded.datetime, year=excluded.year,
      month=excluded.month, day=excluded.day, duration_seconds=excluded.duration_seconds,
      transcript=excluded.transcript, title=excluded.title, summary=excluded.summary,
      sentiment=excluded.sentiment, transcribed_at=excluded.transcribed_at,
      enriched_at=excluded.enriched_at, json_path=excluded.json_path,
      updated_at=datetime('now')
  `).run(
    id, data.filename, data.audio_path, data.date, data.time, data.datetime,
    data.year ? +data.year : null, data.month ? +data.month : null, data.day ? +data.day : null,
    data.duration_seconds, data.transcript, data.title, data.summary, data.sentiment,
    data.transcribed_at, data.enriched_at, jsonPath,
  );

  // Clear and re-insert relationships
  for (const t of ["note_tags", "note_people", "note_topics", "note_keywords", "action_items"]) {
    db.prepare(`DELETE FROM ${t} WHERE note_id = ?`).run(id);
  }

  for (const tag of data.tags || []) {
    const tid = getOrCreate(db, "tags", tag);
    db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)").run(id, tid);
  }
  for (const name of data.people || []) {
    const pid = getOrCreate(db, "people", name);
    db.prepare("INSERT OR IGNORE INTO note_people (note_id, person_id) VALUES (?, ?)").run(id, pid);
  }
  for (const name of data.topics || []) {
    const tid = getOrCreate(db, "topics", name);
    db.prepare("INSERT OR IGNORE INTO note_topics (note_id, topic_id) VALUES (?, ?)").run(id, tid);
  }
  for (const name of data.keywords || []) {
    const kid = getOrCreate(db, "keywords", name);
    db.prepare("INSERT OR IGNORE INTO note_keywords (note_id, keyword_id) VALUES (?, ?)").run(id, kid);
  }
  for (const item of data.action_items || []) {
    db.prepare("INSERT INTO action_items (note_id, content) VALUES (?, ?)").run(id, item);
  }
}

export async function sync(): Promise<string> {
  const cfg = getConfig();
  const db = getDb();

  // Drop and rebuild
  const jsonFiles = findJsonFiles(cfg.output_dir);

  const tx = db.transaction(() => {
    for (const f of jsonFiles) {
      syncNote(db, f);
    }
  });
  tx();

  db.close();
  return `Synced ${jsonFiles.length} files to ${cfg.db_path}`;
}

export async function stats(): Promise<string> {
  const cfg = getConfig();
  if (!existsSync(cfg.db_path)) return "Database not found. Run audio_sync first.";

  const db = getDb();
  const lines: string[] = ["DATABASE STATISTICS", "=" .repeat(40)];

  for (const table of ["notes", "tags", "people", "topics", "keywords"]) {
    const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
    lines.push(`  ${table}: ${row.c}`);
  }

  lines.push("");
  const tags = db.prepare("SELECT t.name, COUNT(nt.note_id) as c FROM tags t LEFT JOIN note_tags nt ON t.id = nt.tag_id GROUP BY t.id ORDER BY c DESC LIMIT 10").all() as { name: string; c: number }[];
  if (tags.length) {
    lines.push("TOP TAGS:");
    for (const t of tags) lines.push(`  ${t.name}: ${t.c} notes`);
  }

  lines.push("");
  const sentiments = db.prepare("SELECT sentiment, COUNT(*) as c FROM notes WHERE sentiment IS NOT NULL GROUP BY sentiment").all() as { sentiment: string; c: number }[];
  if (sentiments.length) {
    lines.push("SENTIMENT:");
    for (const s of sentiments) lines.push(`  ${s.sentiment}: ${s.c}`);
  }

  db.close();
  return lines.join("\n");
}

export async function query(sql: string): Promise<string> {
  const cfg = getConfig();
  if (!existsSync(cfg.db_path)) return "Database not found. Run audio_sync first.";

  const db = getDb();
  try {
    const rows = db.prepare(sql).all() as Record<string, any>[];
    if (!rows.length) return "(no results)";

    const cols = Object.keys(rows[0]);
    const lines = [cols.join(" | "), "-".repeat(cols.join(" | ").length)];
    for (const row of rows) {
      lines.push(cols.map(c => row[c] ?? "NULL").join(" | "));
    }
    lines.push(`\n(${rows.length} rows)`);
    return lines.join("\n");
  } finally {
    db.close();
  }
}
