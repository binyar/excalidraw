import { DatabaseSync } from "node:sqlite";

const WORKSPACE_SCHEMA = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id),
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    folder_id TEXT REFERENCES folders(id),
    storage_name TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
  CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at DESC);
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_threads (
    id TEXT PRIMARY KEY,
    workspace_file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    transcript_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ai_threads_workspace
    ON ai_threads(workspace_file_id, username, updated_at DESC);
  CREATE TABLE IF NOT EXISTS asset_pack_installations (
    username TEXT NOT NULL,
    pack_id TEXT NOT NULL,
    source TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    PRIMARY KEY (username, pack_id)
  );
  CREATE INDEX IF NOT EXISTS idx_asset_pack_installations_user
    ON asset_pack_installations(username, installed_at DESC);
  CREATE TABLE IF NOT EXISTS asset_pack_settings (
    pack_id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    builtin INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_skill_settings (
    username TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (username, skill_id)
  );
`;

export const createWorkspaceDatabase = (databasePath: string) => {
  const database = new DatabaseSync(databasePath);
  database.exec(WORKSPACE_SCHEMA);
  return database;
};
