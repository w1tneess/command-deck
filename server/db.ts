import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, grp TEXT NOT NULL,
  priority INTEGER NOT NULL, exam_date TEXT
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id),
  name TEXT NOT NULL, pos INTEGER NOT NULL,
  introduced_in TEXT NOT NULL DEFAULT 'earlier',
  confirmed INTEGER NOT NULL DEFAULT 0, source TEXT
);
CREATE TABLE IF NOT EXISTS progress (
  chapter_id TEXT PRIMARY KEY REFERENCES chapters(id),
  status TEXT NOT NULL DEFAULT 'not_started',
  confidence INTEGER NOT NULL DEFAULT 1,
  last_revised TEXT, practice_done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
  subject_id TEXT, kind TEXT NOT NULL DEFAULT 'task',
  due TEXT, done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT NOT NULL,
  day TEXT NOT NULL, minutes INTEGER NOT NULL
);`;

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}
