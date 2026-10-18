import { fetchSecondaryCode } from "../../platform/config";
import { logger } from "../../platform/logger";
import { extractCleanName, extractCleanStem } from "../queryText";
import { updateSecondaryColumn } from "../secondary";
import { markDirty, state } from "../state";
import { isEmpty } from "./store";

const SCHEMA_VERSION = 6;

export function createTables(): void {
  if (!state.db) {
    return;
  }
  state.db.run(`
    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uri TEXT NOT NULL,
      name TEXT NOT NULL,
      clean_name TEXT DEFAULT '',
      clean_stem TEXT DEFAULT '',
      clean_container TEXT DEFAULT '',
      clean_words TEXT DEFAULT '',
      clean_initials TEXT DEFAULT '',
      symbol_kind INTEGER NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      detail TEXT,
      range_start_line INTEGER DEFAULT 0,
      range_start_char INTEGER DEFAULT 0,
      range_end_line INTEGER DEFAULT 0,
      range_end_char INTEGER DEFAULT 0,
      is_secondary INTEGER DEFAULT 0,
      name_start_line INTEGER,
      name_start_char INTEGER
    )
  `);
  createFileStateTable();

  // Migrations for existing databases from earlier versions
  try {
    state.db.run("ALTER TABLE symbols ADD COLUMN clean_name TEXT DEFAULT ''");
  } catch {}
  try {
    state.db.run("ALTER TABLE symbols ADD COLUMN clean_stem TEXT DEFAULT ''");
  } catch {}

  // Backfill clean_name and clean_stem if missing in existing database
  try {
    const unmigrated = state.db.exec(
      "SELECT COUNT(*) FROM symbols WHERE clean_stem = '' AND name != ''"
    );
    if (unmigrated && unmigrated[0] && unmigrated[0].values[0][0] > 0) {
      const rows = state.db.exec(
        "SELECT id, name, symbol_kind FROM symbols WHERE clean_stem = '' AND name != ''"
      );
      if (rows && rows[0]) {
        state.db.run("BEGIN TRANSACTION");
        const stmt = state.db.prepare(
          "UPDATE symbols SET clean_name = ?, clean_stem = ? WHERE id = ?"
        );
        for (const row of rows[0].values) {
          const id = row[0];
          const name = row[1] as string;
          const kind = row[2] as number;
          stmt.run([
            extractCleanName(name),
            extractCleanStem(name, kind),
            id,
          ]);
        }
        stmt.free();
        state.db.run("COMMIT");
        markDirty();
      }
    }
  } catch {}

  migrateSchema();

  state.db.run("CREATE INDEX IF NOT EXISTS idx_symbols_uri ON symbols(uri)");
  state.db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_uri_line ON symbols(uri, range_start_line, range_start_char)"
  );
  state.db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_uri_nocase ON symbols(uri COLLATE NOCASE)"
  );
  state.db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_uri_line_nocase ON symbols(uri COLLATE NOCASE, range_start_line, range_start_char)"
  );
  state.db.run("CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(symbol_kind)");
  state.db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_name_nocase ON symbols(name COLLATE NOCASE)"
  );
  state.db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_clean_stem ON symbols(clean_stem)"
  );
  state.db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_clean_name ON symbols(clean_name)"
  );
  state.db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_clean_initials ON symbols(clean_initials COLLATE NOCASE)"
  );
  state.db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_kind_name ON symbols(symbol_kind, name COLLATE NOCASE)"
  );
}

function createFileStateTable(): void {
  state.db.run(`
    CREATE TABLE IF NOT EXISTS file_state (
      uri TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL
    ) WITHOUT ROWID
  `);
}

function getSchemaVersion(): number {
  const result = state.db.exec("PRAGMA user_version");
  return result && result.length ? (result[0].values[0][0] as number) : 0;
}

// clean_container cannot be backfilled: the container chain is not stored
// anywhere in the table, so a version 0 index is emptied and rebuilt instead.
// The word columns derive from name and symbol_kind, so version 1 is backfilled in place.
// Version 3 changed how names, containers and descriptions are built from the language
// server's output (Go receivers, Java parameter lists), which needs the raw symbol names, so
// anything older is emptied and rebuilt. Version 4 added is_secondary, which derives from the uri
// alone and is backfilled in place. Version 5 added the file_state table and keeps every symbol:
// the first reconcile records a baseline instead of reindexing (docs/decisions/006).
// Version 6 added name_start_line and name_start_char; existing rows keep NULL and open at the
// range start until their file is re-indexed, so nothing is deleted.
function migrateSchema(): void {
  const version = getSchemaVersion();
  if (version >= SCHEMA_VERSION) {
    return;
  }
  markDirty();
  if (version < 1) {
    try {
      state.db.run("ALTER TABLE symbols ADD COLUMN clean_container TEXT DEFAULT ''");
    } catch {}
  }
  if (version < 2) {
    try {
      state.db.run("ALTER TABLE symbols ADD COLUMN clean_words TEXT DEFAULT ''");
    } catch {}
    try {
      state.db.run("ALTER TABLE symbols ADD COLUMN clean_initials TEXT DEFAULT ''");
    } catch {}
  }
  if (version < 3 && !isEmpty()) {
    state.db.run("DELETE FROM symbols");
    state.seededFromTemplate = false;
    logger.log("Index schema upgraded; the workspace will be reindexed.");
  }
  if (version < 4) {
    try {
      state.db.run("ALTER TABLE symbols ADD COLUMN is_secondary INTEGER DEFAULT 0");
    } catch {}
    updateSecondaryColumn(fetchSecondaryCode());
  }
  if (version < 5) {
    createFileStateTable();
  }
  if (version < 6) {
    try {
      state.db.run("ALTER TABLE symbols ADD COLUMN name_start_line INTEGER");
    } catch {}
    try {
      state.db.run("ALTER TABLE symbols ADD COLUMN name_start_char INTEGER");
    } catch {}
  }
  state.db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

