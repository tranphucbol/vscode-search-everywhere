import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { fetchSecondaryCode, fetchShareCacheAcrossWorktrees } from "./config";
import { gitService } from "./gitService";
import { logger } from "./logger";
import { MatchBand, QuickPickItem } from "./types";
import { matchesGlob, utils } from "./utils";

let db: any;
let dbPath: string;
let sqlJs: any;
let persistTimer: NodeJS.Timeout | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let seededFromTemplate: boolean = false;
let seedMeta: SeedMeta | undefined;
let dirty = false;
let persistInFlight: Promise<void> | undefined;
let persistPending = false;
let persistPendingTemplate = false;
// The shared template is written far less often than the index, so it tracks its own changes.
let templateStale = false;
let repoFingerprint: string | undefined;
let repoFingerprintResolved = false;
// Bumped by markDirty; the git state recorded for the template is valid only for the rows it saw.
let changeEpoch = 0;
let templateGitState: TemplateGitState | undefined;
let templateGitStateEpoch = -1;
// Bumped by closeDatabase so a background save that outlives its connection does not rename
// its file over the newer one written on shutdown.
let dbGeneration = 0;

interface TemplateGitState {
  commit?: string;
  dirtyPaths: string[];
}

export interface SeedMeta {
  commit?: string;
  dirtyPaths?: string[];
}

const SEARCH_LIMIT = 500;
const PERSIST_DEBOUNCE_MS = 10000;
const TEMP_SUFFIX = ".tmp";
// The shutdown save may run while a background save still writes TEMP_SUFFIX.
const EXIT_TEMP_SUFFIX = ".exit.tmp";
const CORRUPT_SUFFIX = ".corrupt";
// Worktrees of one repository share a template, and their windows may write it at the same time.
const TEMPLATE_TEMP_SUFFIX = `.${process.pid}${TEMP_SUFFIX}`;
const TEMPLATE_EXIT_TEMP_SUFFIX = `.${process.pid}${EXIT_TEMP_SUFFIX}`;
const SCHEMA_VERSION = 6;

export async function initDatabase(
  context: vscode.ExtensionContext
): Promise<void> {
  const initSqlJs = require("sql.js");

  let locateFileOpt: any = undefined;
  if (context && context.extensionPath) {
    const candidates = [
      path.join(
        context.extensionPath,
        "node_modules",
        "sql.js",
        "dist",
        "sql-wasm.wasm"
      ),
      path.join(
        __dirname,
        "..",
        "node_modules",
        "sql.js",
        "dist",
        "sql-wasm.wasm"
      ),
      path.join(__dirname, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    ];
    const wasmPath = candidates.find((p) => fs.existsSync(p));
    if (wasmPath) {
      locateFileOpt = (file: string) => {
        if (file.endsWith(".wasm")) {
          return wasmPath;
        }
        return file;
      };
    }
  }

  sqlJs = await initSqlJs(
    locateFileOpt ? { locateFile: locateFileOpt } : undefined
  );

  extensionContext = context;
  const storageUri = (context && (context.storageUri || context.globalStorageUri)) || undefined;
  if (storageUri && storageUri.fsPath) {
    const storagePath = storageUri.fsPath;
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    dbPath = path.join(storagePath, "search-everywhere-index.db");
  }

  dirty = false;
  templateStale = false;
  repoFingerprint = undefined;
  repoFingerprintResolved = false;
  templateGitState = undefined;
  templateGitStateEpoch = -1;
  if (dbPath) {
    removeLeftoverTempFiles();
  }
  if (dbPath && fetchShareCacheAcrossWorktrees()) {
    await resolveRepoFingerprint();
  }

  if (dbPath && fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new sqlJs.Database(fileBuffer);
      // SQLite reads the header lazily, so a damaged file only fails on the first query.
      db.exec("SELECT count(*) FROM sqlite_master");
    } catch {
      if (db) {
        try {
          db.close();
        } catch {}
      }
      moveCorruptFileAside();
      db = new sqlJs.Database();
    }
  } else {
    let seeded = false;
    const template = fetchShareCacheAcrossWorktrees() ? getTemplateTarget() : undefined;
    if (dbPath && template) {
      try {
        if (fs.existsSync(template.dbPath) && fs.existsSync(template.metaPath)) {
          const meta = JSON.parse(fs.readFileSync(template.metaPath, "utf8"));
          seedMeta = { commit: meta.commit, dirtyPaths: meta.dirtyPaths };
          const templateRootUriStr = meta.templateRootUri;
          const currentRootUriStr = template.rootUri;

          const fileBuffer = fs.readFileSync(template.dbPath);
          db = new sqlJs.Database(fileBuffer);

          if (templateRootUriStr && templateRootUriStr !== currentRootUriStr) {
            db.run("UPDATE symbols SET uri = replace(uri, ?, ?)", [
              templateRootUriStr,
              currentRootUriStr,
            ]);
            try {
              db.run("UPDATE file_state SET uri = replace(uri, ?, ?)", [
                templateRootUriStr,
                currentRootUriStr,
              ]);
            } catch {
              // Templates written before schema 5 have no file_state table.
            }
          }

          markDirty();
          writeIndexFileSync(false);
          // The template already holds these rows; only later changes make it stale.
          templateStale = false;

          seededFromTemplate = true;
          seeded = true;
          logger.log(
            `Seeded database from shared repository template (fingerprint: ${template.fingerprint})`
          );
        }
      } catch (error) {
        logger.log(`Failed to seed database from template: ${error}`);
      }
    }

    if (!seeded) {
      db = new sqlJs.Database();
    }
  }

  applyConnectionPragmas();

  createTables();
}

function applyConnectionPragmas(): void {
  try {
    db.run("PRAGMA synchronous = OFF;");
    db.run("PRAGMA journal_mode = MEMORY;");
    db.run("PRAGMA temp_store = MEMORY;");
    db.run("PRAGMA cache_size = -64000;"); // Bounded to 64 MB dynamic RAM ceiling per window
  } catch {
    // Ignore PRAGMA errors on in-memory databases
  }
}

// sql.js closes and reopens the connection to export it, which puts every PRAGMA back to its
// default (sql-wasm-debug.js, Database.export); without re-applying them search reads through
// a 2 MB page cache for the rest of the session.
function exportDatabase(): Uint8Array {
  const data = db.export();
  applyConnectionPragmas();
  return data;
}

export function extractName(label: string): string {
  // Strip icon prefix like "$(symbol-class)  ClassName"
  const match = label.match(/^\$\([^)]+\)\s+(.+)$/);
  return match ? match[1] : label;
}

export function extractCleanName(name: string): string {
  if (!name) {
    return "";
  }
  return name.toLowerCase().replace(/[\s.\-_]/g, "");
}

export function extractCleanContainer(container?: string): string {
  if (!container) {
    return "";
  }
  return container
    .split(".")
    .map(extractCleanName)
    .filter((segment) => segment)
    .join(".");
}

const LIKE_ESCAPE = "ESCAPE '\\'";
const LIKE_SPECIAL_CHARS = /[\\%_]/;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

// The three-argument like() made every search about 9% slower in scripts/benchmark.js,
// so the ESCAPE clause is only added when escapeLike actually changed the text.
function likeEscape(value: string): string {
  return LIKE_SPECIAL_CHARS.test(value) ? LIKE_ESCAPE : "";
}

const QUALIFIER_REGEX = /\.|#|::/g;

export interface QualifiedQuery {
  container: string;
  member: string;
}

export function parseQualifiedQuery(query: string): QualifiedQuery | undefined {
  if (!query) {
    return undefined;
  }
  const segments = query.split(QUALIFIER_REGEX);
  if (segments.length < 2) {
    return undefined;
  }
  const member = extractCleanName(segments.pop()!);
  const container = segments
    .map(extractCleanName)
    .filter((segment) => segment)
    .join(".");
  if (!container) {
    return undefined;
  }
  return { container, member };
}

export interface PatternQuery {
  /** Escaped LIKE fragments, one per word, with `*` gaps turned into `%`, e.g. "user%impl". */
  words: string[];
  /** The cleaned words concatenated without escaping, e.g. "userimpl". */
  joined: string;
}

/**
 * Returns undefined unless the query is a pattern query: no `/`, and either a `*` or at
 * least two whitespace-separated words. A query of only `*` yields no words.
 */
export function parsePatternQuery(query: string): PatternQuery | undefined {
  if (!query || query.includes("/")) {
    return undefined;
  }
  const rawWords = query.split(/\s+/).filter((word) => word);
  if (rawWords.length < 2 && !query.includes("*")) {
    return undefined;
  }
  const words: string[] = [];
  let joined = "";
  for (const rawWord of rawWords) {
    const pieces = rawWord
      .split("*")
      .map(extractCleanName)
      .filter((piece) => piece);
    if (pieces.length) {
      words.push(pieces.map(escapeLike).join("%"));
      joined += pieces.join("");
    }
  }
  return { words, joined };
}

export interface PathQuery {
  dir: string;
  leaf: string;
}

export function splitPathQuery(query: string): PathQuery {
  const lastSlash = query.lastIndexOf("/");
  return { dir: query.slice(0, lastSlash), leaf: query.slice(lastSlash + 1) };
}

export function extractCleanStem(name: string, symbolKind?: number): string {
  if (!name) {
    return "";
  }
  let stem = name;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0) {
    stem = name.substring(0, dotIndex);
  }
  return extractCleanName(stem);
}

const enum CharClass {
  Separator,
  Upper,
  Lower,
  Caseless,
  Digit,
}

const UPPER_REGEX = /\p{Lu}/u;
const LOWER_REGEX = /\p{Ll}/u;
const LETTER_REGEX = /\p{L}/u;
const DIGIT_REGEX = /\p{N}/u;

function classifyChar(ch: string): CharClass {
  const code = ch.charCodeAt(0);
  if (code < 128) {
    if (code >= 97 && code <= 122) {
      return CharClass.Lower;
    }
    if (code >= 65 && code <= 90) {
      return CharClass.Upper;
    }
    if (code >= 48 && code <= 57) {
      return CharClass.Digit;
    }
    return CharClass.Separator;
  }
  if (UPPER_REGEX.test(ch)) {
    return CharClass.Upper;
  }
  if (LOWER_REGEX.test(ch)) {
    return CharClass.Lower;
  }
  if (LETTER_REGEX.test(ch)) {
    return CharClass.Caseless;
  }
  return DIGIT_REGEX.test(ch) ? CharClass.Digit : CharClass.Separator;
}

// keepCapitalRuns follows IntelliJ's NameUtil: "HTTPServer" splits into "HTTP" and "Server".
// Without it every capital starts a new piece, which is how a query such as "USImpl" is read.
function splitIntoPieces(text: string, keepCapitalRuns: boolean): string[] {
  const chars = Array.from(text);
  const classes = chars.map(classifyChar);
  const pieces: string[] = [];
  let current = "";
  for (let i = 0; i < chars.length; i++) {
    const cls = classes[i];
    if (cls === CharClass.Separator) {
      if (current) {
        pieces.push(current);
        current = "";
      }
      continue;
    }
    const prev = current ? classes[i - 1] : CharClass.Separator;
    let startsPiece = false;
    if (current) {
      if (cls === CharClass.Digit || prev === CharClass.Digit) {
        startsPiece = cls !== prev;
      } else if (cls === CharClass.Upper) {
        startsPiece =
          prev !== CharClass.Upper ||
          !keepCapitalRuns ||
          (i + 1 < chars.length && classes[i + 1] === CharClass.Lower);
      }
    }
    if (startsPiece) {
      pieces.push(current);
      current = "";
    }
    current += chars[i];
  }
  if (current) {
    pieces.push(current);
  }
  return pieces;
}

export function splitWords(name: string): string[] {
  return name ? splitIntoPieces(name, true) : [];
}

function wordsSource(name: string, symbolKind?: number): string {
  if (symbolKind === 0) {
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex > 0) {
      return name.substring(0, dotIndex);
    }
  }
  return name;
}

function extractWordColumns(name: string, symbolKind?: number): [string, string] {
  const words = name ? splitWords(wordsSource(name, symbolKind)) : [];
  if (!words.length) {
    return ["", ""];
  }
  const cleanWords = " " + words.join(" ").toLowerCase();
  const cleanInitials = words
    .map((word) => Array.from(word)[0])
    .join("")
    .toLowerCase();
  return [cleanWords, cleanInitials];
}

export function extractCleanWords(name: string, symbolKind?: number): string {
  return extractWordColumns(name, symbolKind)[0];
}

export function extractCleanInitials(name: string, symbolKind?: number): string {
  return extractWordColumns(name, symbolKind)[1];
}

export type CamelHumpsQuery =
  | { kind: "initials"; initials: string }
  /** One LIKE pattern per reading, anchored at the first word, e.g. " u% ser% imp%". */
  | { kind: "words"; patterns: string[] };

const INITIALS_QUERY_REGEX = /^[\p{Ll}\p{N}]{2,}$/u;
const CAPITAL_AFTER_FIRST_REGEX = /^.\P{Lu}*\p{Lu}/su;
const JOINED_PIECES_REGEX = /[\p{L}\p{N}][_-][\p{L}\p{N}]/u;

function toWordsPattern(pieces: string[]): string {
  return " " + pieces.map((piece) => piece.toLowerCase()).join("% ") + "%";
}

/**
 * Returns undefined unless the query is a CamelHumps query. An initials query is two or more
 * lowercase letters or digits with at least one letter, matched one letter per word. A words
 * query has a capital after its first character or a `_` or `-` between pieces; each piece
 * matches the start of a word, in order. Qualified, pattern and path queries are neither.
 */
export function parseCamelHumpsQuery(query: string): CamelHumpsQuery | undefined {
  if (!query) {
    return undefined;
  }
  if (INITIALS_QUERY_REGEX.test(query) && LETTER_REGEX.test(query)) {
    return { kind: "initials", initials: query };
  }
  if (
    query.includes("/") ||
    !(CAPITAL_AFTER_FIRST_REGEX.test(query) || JOINED_PIECES_REGEX.test(query)) ||
    parsePatternQuery(query) ||
    parseQualifiedQuery(query)
  ) {
    return undefined;
  }
  // Reading B may be a single piece: "USI" read as "usi" finds parseUSIField.
  const readingA = splitIntoPieces(query, false);
  if (readingA.length < 2) {
    return undefined;
  }
  const patterns = [toWordsPattern(readingA)];
  const readingB = toWordsPattern(splitIntoPieces(query, true));
  if (readingB !== patterns[0]) {
    patterns.push(readingB);
  }
  return { kind: "words", patterns };
}

function createTables(): void {
  if (!db) {
    return;
  }
  db.run(`
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
    db.run("ALTER TABLE symbols ADD COLUMN clean_name TEXT DEFAULT ''");
  } catch {}
  try {
    db.run("ALTER TABLE symbols ADD COLUMN clean_stem TEXT DEFAULT ''");
  } catch {}

  // Backfill clean_name and clean_stem if missing in existing database
  try {
    const unmigrated = db.exec(
      "SELECT COUNT(*) FROM symbols WHERE clean_stem = '' AND name != ''"
    );
    if (unmigrated && unmigrated[0] && unmigrated[0].values[0][0] > 0) {
      const rows = db.exec(
        "SELECT id, name, symbol_kind FROM symbols WHERE clean_stem = '' AND name != ''"
      );
      if (rows && rows[0]) {
        db.run("BEGIN TRANSACTION");
        const stmt = db.prepare(
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
        db.run("COMMIT");
        markDirty();
      }
    }
  } catch {}

  migrateSchema();

  db.run("CREATE INDEX IF NOT EXISTS idx_symbols_uri ON symbols(uri)");
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_uri_line ON symbols(uri, range_start_line, range_start_char)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_uri_nocase ON symbols(uri COLLATE NOCASE)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_uri_line_nocase ON symbols(uri COLLATE NOCASE, range_start_line, range_start_char)"
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(symbol_kind)");
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_name_nocase ON symbols(name COLLATE NOCASE)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_clean_stem ON symbols(clean_stem)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_clean_name ON symbols(clean_name)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_clean_initials ON symbols(clean_initials COLLATE NOCASE)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_symbols_kind_name ON symbols(symbol_kind, name COLLATE NOCASE)"
  );
}

function createFileStateTable(): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS file_state (
      uri TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL
    ) WITHOUT ROWID
  `);
}

function getSchemaVersion(): number {
  const result = db.exec("PRAGMA user_version");
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
      db.run("ALTER TABLE symbols ADD COLUMN clean_container TEXT DEFAULT ''");
    } catch {}
  }
  if (version < 2) {
    try {
      db.run("ALTER TABLE symbols ADD COLUMN clean_words TEXT DEFAULT ''");
    } catch {}
    try {
      db.run("ALTER TABLE symbols ADD COLUMN clean_initials TEXT DEFAULT ''");
    } catch {}
  }
  if (version < 3 && !isEmpty()) {
    db.run("DELETE FROM symbols");
    seededFromTemplate = false;
    logger.log("Index schema upgraded; the workspace will be reindexed.");
  }
  if (version < 4) {
    try {
      db.run("ALTER TABLE symbols ADD COLUMN is_secondary INTEGER DEFAULT 0");
    } catch {}
    updateSecondaryColumn(fetchSecondaryCode());
  }
  if (version < 5) {
    createFileStateTable();
  }
  if (version < 6) {
    try {
      db.run("ALTER TABLE symbols ADD COLUMN name_start_line INTEGER");
    } catch {}
    try {
      db.run("ALTER TABLE symbols ADD COLUMN name_start_char INTEGER");
    } catch {}
  }
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export function insertSymbol(item: QuickPickItem): void {
  if (!db) {
    return;
  }
  clearSearchCache();
  markDirty();
  const name = extractName(item.label);
  const cleanName = extractCleanName(name);
  const cleanStem = extractCleanStem(name, item.symbolKind);
  const [cleanWords, cleanInitials] = extractWordColumns(name, item.symbolKind);
  db.run(
    `INSERT INTO symbols
     (uri, name, clean_name, clean_stem, clean_container, clean_words, clean_initials, symbol_kind,
      label, description, detail, range_start_line, range_start_char, range_end_line, range_end_char,
      is_secondary, name_start_line, name_start_char)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.uri.toString(),
      name,
      cleanName,
      cleanStem,
      extractCleanContainer(item.containerName),
      cleanWords,
      cleanInitials,
      item.symbolKind,
      item.label,
      item.description || "",
      item.detail || "",
      item.range ? item.range.start.line : 0,
      item.range ? item.range.start.character : 0,
      item.range ? item.range.end.line : 0,
      item.range ? item.range.end.character : 0,
      classifySecondary(item.uri.path, fetchSecondaryCode()),
      item.namePosition?.line ?? null,
      item.namePosition?.character ?? null,
    ]
  );
}

export function insertSymbolsBatch(items: QuickPickItem[]): void {
  if (!db || !items || !items.length) {
    return;
  }
  clearSearchCache();
  markDirty();
  db.run("BEGIN TRANSACTION");
  const stmt = db.prepare(`
    INSERT INTO symbols
    (uri, name, clean_name, clean_stem, clean_container, clean_words, clean_initials, symbol_kind,
     label, description, detail, range_start_line, range_start_char, range_end_line, range_end_char,
     is_secondary, name_start_line, name_start_char)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const secondaryGlobs = fetchSecondaryCode();
  const secondaryByUri = new Map<string, number>();
  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const uri = item.uri.toString();
      const name = extractName(item.label);
      let secondary = secondaryByUri.get(uri);
      if (secondary === undefined) {
        secondary = classifySecondary(item.uri.path, secondaryGlobs);
        secondaryByUri.set(uri, secondary);
      }
      const [cleanWords, cleanInitials] = extractWordColumns(name, item.symbolKind);
      stmt.run([
        uri,
        name,
        extractCleanName(name),
        extractCleanStem(name, item.symbolKind),
        extractCleanContainer(item.containerName),
        cleanWords,
        cleanInitials,
        item.symbolKind,
        item.label,
        item.description || "",
        item.detail || "",
        item.range ? item.range.start.line : 0,
        item.range ? item.range.start.character : 0,
        item.range ? item.range.end.line : 0,
        item.range ? item.range.end.character : 0,
        secondary,
        item.namePosition?.line ?? null,
        item.namePosition?.character ?? null,
      ]);
    }
    stmt.free();
    db.run("COMMIT");
  } catch (e) {
    stmt.free();
    db.run("ROLLBACK");
    throw e;
  }
}

export function deleteByUri(uriPath: string): void {
  if (!db) {
    return;
  }
  clearSearchCache();
  const removed =
    runAndCountChanges("DELETE FROM symbols WHERE uri = ?", [uriPath]) +
    runAndCountChanges("DELETE FROM file_state WHERE uri = ?", [uriPath]);
  removed && markDirty();
}

// File events for paths that were never indexed (such as .git/index.lock, which every git
// command creates) must not trigger a save; each save reads git state and would create another.
function runAndCountChanges(sql: string, params: any[]): number {
  db.run(sql, params);
  return db.getRowsModified();
}

export function deleteByUriPrefix(uriPath: string): void {
  if (!db) {
    return;
  }
  clearSearchCache();
  const prefix = [escapeLike(uriPath) + "%"];
  const removed =
    runAndCountChanges(`DELETE FROM symbols WHERE uri LIKE ? ${LIKE_ESCAPE}`, prefix) +
    runAndCountChanges(`DELETE FROM file_state WHERE uri LIKE ? ${LIKE_ESCAPE}`, prefix);
  removed && markDirty();
}

export interface FileState {
  mtime: number;
  size: number;
}

export function upsertFileStates(entries: Array<[uri: string, state: FileState]>): void {
  if (!db || !entries.length) {
    return;
  }
  markDirty();
  db.run("BEGIN TRANSACTION");
  const stmt = db.prepare("INSERT OR REPLACE INTO file_state (uri, mtime, size) VALUES (?, ?, ?)");
  try {
    for (const [uri, state] of entries) {
      stmt.run([uri, state.mtime, state.size]);
    }
    stmt.free();
    db.run("COMMIT");
  } catch (e) {
    stmt.free();
    db.run("ROLLBACK");
    throw e;
  }
}

export function getFileStates(): Map<string, FileState> {
  const states = new Map<string, FileState>();
  if (!db) {
    return states;
  }
  const result = db.exec("SELECT uri, mtime, size FROM file_state");
  if (result && result.length) {
    for (const row of result[0].values) {
      states.set(row[0] as string, { mtime: row[1] as number, size: row[2] as number });
    }
  }
  return states;
}

export function getFileState(uri: string): FileState | undefined {
  if (!db) {
    return undefined;
  }
  const result = db.exec("SELECT mtime, size FROM file_state WHERE uri = ?", [uri]);
  if (!result || !result.length) {
    return undefined;
  }
  const [mtime, size] = result[0].values[0];
  return { mtime: mtime as number, size: size as number };
}

export function getIndexedUris(): string[] {
  if (!db) {
    return [];
  }
  const result = db.exec("SELECT DISTINCT uri FROM symbols");
  return result && result.length ? result[0].values.map((row: any[]) => row[0] as string) : [];
}

export function clearFileStates(): void {
  if (!db) {
    return;
  }
  markDirty();
  db.run("DELETE FROM file_state");
}

export function hasFileStateBaseline(): boolean {
  if (!db) {
    return true;
  }
  const result = db.exec("SELECT EXISTS (SELECT 1 FROM file_state)");
  const hasStates = !!(result && result.length && result[0].values[0][0]);
  return hasStates || isEmpty();
}

const enum Secondary {
  None = 0,
  Test = 1,
  Generated = 2,
}

const TEST_GLOB = /test|spec/i;

function classifySecondary(uriPath: string, globs: string[]): Secondary {
  const relativePath = utils.normalizeUriPath(uriPath);
  let secondary = Secondary.None;
  for (const glob of globs) {
    if (matchesGlob(relativePath, glob)) {
      if (TEST_GLOB.test(glob)) {
        return Secondary.Test;
      }
      secondary = Secondary.Generated;
    }
  }
  return secondary;
}

function updateSecondaryColumn(globs: string[]): void {
  const result = db.exec("SELECT DISTINCT uri FROM symbols");
  const uris: string[] = result && result.length ? result[0].values.map((row: any[]) => row[0]) : [];
  if (!uris.length) {
    return;
  }
  db.run("BEGIN TRANSACTION");
  const stmt = db.prepare(
    "UPDATE symbols SET is_secondary = ? WHERE uri = ? AND is_secondary IS NOT ?"
  );
  try {
    for (const uri of uris) {
      let uriPath: string;
      try {
        uriPath = vscode.Uri.parse(uri).path;
      } catch {
        uriPath = uri;
      }
      const secondary = classifySecondary(uriPath, globs);
      stmt.run([secondary, uri, secondary]);
    }
    stmt.free();
    db.run("COMMIT");
  } catch (e) {
    stmt.free();
    db.run("ROLLBACK");
    throw e;
  }
}

// Runs when searchEverywhere.secondaryCode changes: the column derives from the uri alone, so no
// reindex is needed.
export function recomputeSecondary(globs: string[]): void {
  if (!db) {
    return;
  }
  clearSearchCache();
  markDirty();
  updateSecondaryColumn(globs);
  schedulePersist();
}

export interface SearchOptions {
  symbolKinds?: number[];
  allowedKinds?: number[];
  ignoredKinds?: number[];
  ignoredNames?: string[];
  sortByKind?: boolean;
  fileUri?: string;
  recent?: RecentKey[];
}

// Identifies a recently used item across edits: the line is left out on purpose, so a symbol
// that moves keeps its history.
export interface RecentKey {
  uri: string;
  symbolKind: number;
  name: string;
}

const QUERY_COLUMNS =
  "uri, symbol_kind, label, description, detail, range_start_line, range_start_char, range_end_line, range_end_char, is_secondary, name_start_line, name_start_char";
const SECONDARY_COLUMN = 9;
const NAME_LINE_COLUMN = 10;
const NAME_CHAR_COLUMN = 11;
// The tier or relevance a query selects after QUERY_COLUMNS.
const TIER_COLUMN = 12;
const SECONDARY_LAST = "is_secondary != 0 ASC,";

// Tier 1: exact member under its immediate parent, 2: prefix member under its
// immediate parent, 3: member match anywhere below a container chain containing the query.
function queryQualifiedRows(
  qualified: QualifiedQuery,
  baseWhere: string,
  params: any[],
  kindSort: string,
  limit: number,
  esc: string
): any[][] {
  if (!db || limit <= 0) {
    return [];
  }
  const { container, member } = qualified;
  const matchClause = `symbol_kind != 0 AND clean_container != '' AND clean_name LIKE ? ${esc} AND clean_container LIKE ? ${esc}`;
  const where = baseWhere ? `${baseWhere} AND ${matchClause}` : `WHERE ${matchClause}`;
  const sql = `
    SELECT ${QUERY_COLUMNS},
      CASE
        WHEN (clean_container = ? OR clean_container LIKE ? ${esc}) AND clean_name = ? THEN 1
        WHEN clean_container = ? OR clean_container LIKE ? ${esc} THEN 2
        ELSE 3
      END AS tier
    FROM ${symbolsSource}
    ${where}
    ORDER BY
      ${kindSort}
      tier ASC,
      ${SECONDARY_LAST}
      LENGTH(name) ASC,
      name COLLATE NOCASE ASC
    LIMIT ${limit}
  `;
  const immediateParent = `%.${escapeLike(container)}`;
  const results = db.exec(sql, [
    container,
    immediateParent,
    member,
    container,
    immediateParent,
    ...params,
    `${escapeLike(member)}%`,
    `%${escapeLike(container)}%`,
  ]);
  return results && results.length ? results[0].values : [];
}

// Every word must occur in clean_stem or clean_name. Tier 1: the joined words are the whole
// name, 2: the words appear in order from the start, 3: in order anywhere, 4: any order.
function queryPatternRows(
  pattern: PatternQuery,
  baseWhere: string,
  params: any[],
  kindSort: string,
  limit: number,
  esc: string
): any[][] {
  if (!db || limit <= 0 || !pattern.words.length) {
    return [];
  }
  const { words, joined } = pattern;
  const wordClause = words
    .map(() => `(clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc})`)
    .join(" AND ");
  const where = baseWhere ? `${baseWhere} AND ${wordClause}` : `WHERE ${wordClause}`;
  const ordered = words.join("%");
  const sql = `
    SELECT ${QUERY_COLUMNS},
      CASE
        WHEN clean_stem = ? OR clean_name = ? THEN 1
        WHEN clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc} THEN 2
        WHEN clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc} THEN 3
        ELSE 4
      END AS tier
    FROM ${symbolsSource}
    ${where}
    ORDER BY
      ${kindSort}
      tier ASC,
      ${SECONDARY_LAST}
      CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
      LENGTH(name) ASC,
      name COLLATE NOCASE ASC
    LIMIT ${limit}
  `;
  const wordParams = words.flatMap((word) => [`%${word}%`, `%${word}%`]);
  const results = db.exec(sql, [
    joined,
    joined,
    `${ordered}%`,
    `${ordered}%`,
    `%${ordered}%`,
    `%${ordered}%`,
    ...params,
    ...wordParams,
  ]);
  return results && results.length ? results[0].values : [];
}

// Initials: tier 1 when they are exactly the query, 2 when they start with it. Words: tier 1
// when the first piece matches the first word, 2 when it matches a later one. notPrefixed
// drops the rows stage 1 already returned.
function queryCamelHumpsRows(
  camel: CamelHumpsQuery,
  baseWhere: string,
  params: any[],
  kindSort: string,
  limit: number,
  notPrefixed: string,
  notPrefixedParams: any[]
): any[][] {
  if (!db || limit <= 0) {
    return [];
  }
  let tierClause: string;
  let tierParams: string[];
  let matchClause: string;
  let matchParams: string[];
  if (camel.kind === "initials") {
    tierClause = "clean_initials = ?";
    tierParams = [camel.initials];
    matchClause = "clean_initials LIKE ?";
    matchParams = [`${camel.initials}%`];
  } else {
    const likeAny = `(${camel.patterns.map(() => "clean_words LIKE ?").join(" OR ")})`;
    tierClause = likeAny;
    tierParams = camel.patterns;
    matchClause = likeAny;
    matchParams = camel.patterns.map((pattern) => `%${pattern}`);
  }
  const where = baseWhere
    ? `${baseWhere} AND ${matchClause} AND ${notPrefixed}`
    : `WHERE ${matchClause} AND ${notPrefixed}`;
  const sql = `
    SELECT ${QUERY_COLUMNS},
      CASE WHEN ${tierClause} THEN 1 ELSE 2 END AS tier
    FROM ${symbolsSource}
    ${where}
    ORDER BY
      ${kindSort}
      tier ASC,
      ${SECONDARY_LAST}
      CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
      LENGTH(name) ASC,
      name COLLATE NOCASE ASC
    LIMIT ${limit}
  `;
  const results = db.exec(sql, [...tierParams, ...params, ...matchParams, ...notPrefixedParams]);
  return results && results.length ? results[0].values : [];
}

// Subsequence matches that are not already substring matches of the query. rawQuery also
// excludes substring matches on the raw name; pattern queries have no single raw form.
function queryFuzzyRows(
  cleanQuery: string,
  rawQuery: string | undefined,
  baseWhere: string,
  params: any[],
  kindSort: string,
  limit: number,
  esc: string
): any[][] {
  if (!db || limit <= 0) {
    return [];
  }
  const fuzzyPattern = "%" + cleanQuery.split("").map(escapeLike).join("%") + "%";
  const cleanSubstring = `%${escapeLike(cleanQuery)}%`;
  const exclusions = [`clean_stem NOT LIKE ? ${esc}`, `clean_name NOT LIKE ? ${esc}`];
  const exclusionParams = [cleanSubstring, cleanSubstring];
  if (rawQuery !== undefined) {
    exclusions.push(`name NOT LIKE ? ${esc}`);
    exclusionParams.push(`%${escapeLike(rawQuery)}%`);
  }
  const fuzzyClause = `(clean_stem LIKE ? ${esc} OR name LIKE ? ${esc}) AND ${exclusions.join(" AND ")}`;
  const where = baseWhere ? `${baseWhere} AND ${fuzzyClause}` : `WHERE ${fuzzyClause}`;
  const sql = `
    SELECT ${QUERY_COLUMNS}
    FROM ${symbolsSource}
    ${where}
    ORDER BY
      ${kindSort}
      ${SECONDARY_LAST}
      CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
      LENGTH(name) ASC,
      name COLLATE NOCASE ASC
    LIMIT ${limit}
  `;
  const results = db.exec(sql, [...params, fuzzyPattern, fuzzyPattern, ...exclusionParams]);
  return results && results.length ? results[0].values : [];
}

const SEARCH_CACHE_MAX_SIZE = 50;
const SUBSTRING_MIN_THRESHOLD = 50;
const FUZZY_MIN_THRESHOLD = 10;
// Room for overloads and a symbol plus its file per recent key, while keeping the result small.
const RECENT_ROWS_PER_KEY = 4;
// Without INDEXED BY, SQLite drives the recent-key search through idx_symbols_kind and reads every
// row of those kinds, which is slower than the unrestricted search (scripts/benchmark.js).
const SYMBOLS_BY_URI = "symbols INDEXED BY idx_symbols_uri";
// The FROM source of every search query; search() swaps it only while the synchronous recent-key
// search runs.
let symbolsSource = "symbols";
const searchCache = new Map<string, QuickPickItem[]>();

const bandByTier =
  (...bands: MatchBand[]) =>
  (row: any[]): MatchBand =>
    bands[(row[TIER_COLUMN] as number) - 1] ?? bands[bands.length - 1];

export function clearSearchCache(): void {
  searchCache.clear();
}

// Without recent keys the cached array itself is returned; callers must not reorder it in place.
export function search(
  query: string,
  limit: number = SEARCH_LIMIT,
  options?: SearchOptions
): QuickPickItem[] {
  const main = searchItems(query, limit, options);
  const recent = options?.recent;
  if (!recent || !recent.length) {
    return main;
  }
  // A recent row the main search cut off is only found by searching the recent items alone.
  symbolsSource = SYMBOLS_BY_URI;
  try {
    const recentRows = searchItems(query, recent.length * RECENT_ROWS_PER_KEY, options, recent);
    return boostRecent(main, recentRows, recent, limit);
  } finally {
    symbolsSource = "symbols";
  }
}

function recentKeyString(uri: string, symbolKind: number, name: string): string {
  return `${uri}\u0000${symbolKind}\u0000${name}`;
}

function itemIdentity(item: QuickPickItem): string {
  return `${item.uri.toString()}#${item.symbolKind}#${item.label}#${item.range?.start.line ?? 0}#${item.range?.start.character ?? 0}`;
}

interface RecentEntry {
  item: QuickPickItem;
  rank: number;
}

// Recency only reorders within a match band (docs/decisions/002). Relies on main being in
// non-decreasing band order when it is not sorted by kind.
function boostRecent(
  main: QuickPickItem[],
  recentRows: QuickPickItem[],
  recent: RecentKey[],
  limit: number
): QuickPickItem[] {
  const ranks = new Map<string, number>();
  recent.forEach((key, index) => {
    const id = recentKeyString(key.uri, key.symbolKind, key.name);
    if (!ranks.has(id)) {
      ranks.set(id, index);
    }
  });
  const rankOf = (item: QuickPickItem) =>
    ranks.get(recentKeyString(item.uri.toString(), item.symbolKind, extractName(item.label)));
  const bandIndex = (item: QuickPickItem) => (item.matchBand ?? 3) - 1;

  const recentByBand: RecentEntry[][] = [[], [], [], []];
  const restByBand: QuickPickItem[][] = [[], [], [], []];
  const seen = new Set<string>();
  let recentCount = 0;

  for (const item of main) {
    seen.add(itemIdentity(item));
    const rank = rankOf(item);
    if (rank === undefined) {
      restByBand[bandIndex(item)].push(item);
    } else {
      recentByBand[bandIndex(item)].push({ item, rank });
      recentCount++;
    }
  }
  for (const item of recentRows) {
    // A fuzzy hit is too loose to promote into a list the main search filled.
    if (item.matchBand === 4) {
      continue;
    }
    const id = itemIdentity(item);
    const rank = rankOf(item);
    if (seen.has(id) || rank === undefined) {
      continue;
    }
    seen.add(id);
    recentByBand[bandIndex(item)].push({ item, rank });
    recentCount++;
  }
  if (!recentCount) {
    return main;
  }

  const result: QuickPickItem[] = [];
  for (let band = 0; band < 4; band++) {
    recentByBand[band].sort((a, b) => a.rank - b.rank);
    for (const entry of recentByBand[band]) {
      result.push(entry.item);
    }
    result.push(...restByBand[band]);
  }
  return result.slice(0, limit);
}

// Each stage's SQL already sorts secondary rows last, but a band can span stages (a prefix row
// from stage 1 and a CamelHumps row share band 2), so the bands are regrouped here.
function secondaryLastWithinBand(items: QuickPickItem[]): QuickPickItem[] {
  if (!items.some((item) => item.isSecondary)) {
    return items;
  }
  const result: QuickPickItem[] = [];
  let secondary: QuickPickItem[] = [];
  let band: MatchBand | undefined;
  for (const item of items) {
    if (item.matchBand !== band) {
      result.push(...secondary);
      secondary = [];
      band = item.matchBand;
    }
    (item.isSecondary ? secondary : result).push(item);
  }
  result.push(...secondary);
  return result;
}

function searchItems(
  query: string,
  limit: number,
  options?: SearchOptions,
  onlyKeys?: RecentKey[]
): QuickPickItem[] {
  if (!db) {
    return [];
  }

  // Fast-path: Check LRU search cache
  let cacheKey = `${query}|${limit}|${options?.symbolKinds ? [...options.symbolKinds].sort((a, b) => a - b).join(",") : ""}|${options?.sortByKind ? "1" : "0"}|${options?.fileUri ?? ""}|${options?.allowedKinds?.join(",") ?? ""}|${options?.ignoredKinds?.join(",") ?? ""}|${options?.ignoredNames?.join(",") ?? ""}`;
  if (onlyKeys) {
    cacheKey += `|recent:${onlyKeys.map((key) => recentKeyString(key.uri, key.symbolKind, key.name)).join("\u0001")}`;
  }
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  const conditions: string[] = [];
  const params: any[] = [];

  if (onlyKeys && onlyKeys.length) {
    // The plain uri list lets SQLite read only these files' rows through idx_symbols_uri.
    const uris = [...new Set(onlyKeys.map((key) => key.uri))];
    conditions.push(`uri IN (${uris.map(() => "?").join(", ")})`);
    params.push(...uris);
    conditions.push(
      `(uri, symbol_kind, name) IN (VALUES ${onlyKeys.map(() => "(?, ?, ?)").join(", ")})`
    );
    for (const key of onlyKeys) {
      params.push(key.uri, key.symbolKind, key.name);
    }
  }

  if (options) {
    if (options.fileUri) {
      let fileUriStr = options.fileUri;
      if (!fileUriStr.includes("://")) {
        try {
          fileUriStr = vscode.Uri.file(fileUriStr).toString();
        } catch {}
      }
      conditions.push("uri COLLATE NOCASE = ?");
      params.push(fileUriStr);
      conditions.push("symbol_kind != 0");
    }

    if (options.symbolKinds && options.symbolKinds.length > 0) {
      const placeholders = options.symbolKinds.map(() => "?").join(", ");
      conditions.push(`symbol_kind IN (${placeholders})`);
      params.push(...options.symbolKinds);
    } else if (options.allowedKinds && options.allowedKinds.length > 0) {
      const placeholders = options.allowedKinds.map(() => "?").join(", ");
      conditions.push(`symbol_kind IN (${placeholders})`);
      params.push(...options.allowedKinds);
    }

    if (options.ignoredKinds && options.ignoredKinds.length > 0) {
      const placeholders = options.ignoredKinds.map(() => "?").join(", ");
      conditions.push(`symbol_kind NOT IN (${placeholders})`);
      params.push(...options.ignoredKinds);
    }

    if (options.ignoredNames && options.ignoredNames.length > 0) {
      for (const ign of options.ignoredNames) {
        if (ign) {
          conditions.push(`name NOT LIKE ? ${likeEscape(ign)}`);
          params.push(`%${escapeLike(ign)}%`);
        }
      }
    }
  }

  const baseWhere = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const esc = likeEscape(query);

  let matchedItems: QuickPickItem[] = [];
  const seenKeys = new Set<string>();

  const addItemsFromRows = (rows: any[][], band: MatchBand | ((row: any[]) => MatchBand)) => {
    for (const row of rows) {
      const key = `${row[0]}#${row[1]}#${row[2]}#${row[5]}#${row[6]}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const item = rowToQuickPickItem(row);
        item.matchBand = typeof band === "function" ? band(row) : band;
        matchedItems.push(item);
      }
    }
  };

  const pattern = parsePatternQuery(query);

  if (!query || (pattern && !pattern.words.length)) {
    const sortOrder = options?.fileUri
      ? "range_start_line ASC, range_start_char ASC"
      : options?.sortByKind
      ? "symbol_kind ASC, name COLLATE NOCASE ASC"
      : "name COLLATE NOCASE ASC";
    const results = db.exec(
      `SELECT ${QUERY_COLUMNS} FROM ${symbolsSource} ${baseWhere} ORDER BY ${sortOrder} LIMIT ${limit}`,
      params
    );
    if (results && results.length) {
      addItemsFromRows(results[0].values, 3);
    }
  } else if (pattern) {
    const kindSort = options?.sortByKind ? "symbol_kind ASC, " : "";
    const patternRows = queryPatternRows(pattern, baseWhere, params, kindSort, limit, esc);
    addItemsFromRows(patternRows, bandByTier(1, 2, 3, 3));

    if (
      !patternRows.some((row) => row[TIER_COLUMN] === 1) &&
      matchedItems.length < FUZZY_MIN_THRESHOLD &&
      matchedItems.length < limit &&
      pattern.joined.length >= 2
    ) {
      const remaining = Math.min(
        limit - matchedItems.length,
        SUBSTRING_MIN_THRESHOLD - matchedItems.length
      );
      const cap = matchedItems.length + remaining;
      // Over-fetch: unlike the plain search, ordered matches are not excluded in SQL and
      // only drop out in addItemsFromRows.
      addItemsFromRows(
        queryFuzzyRows(pattern.joined, undefined, baseWhere, params, kindSort, cap, esc),
        4
      );
      matchedItems = matchedItems.slice(0, cap);
    }
  } else if (query.includes("/")) {
    const { dir, leaf } = splitPathQuery(query);
    const kindSort = options?.sortByKind ? "symbol_kind ASC, " : "";

    if (leaf) {
      const dirClause = `uri LIKE ? ${esc}`;
      const dirWhere = baseWhere ? `${baseWhere} AND ${dirClause}` : `WHERE ${dirClause}`;
      const dirParams = [...params, `%${escapeLike(dir)}/%`];
      const cleanLeaf = extractCleanName(leaf);

      if (cleanLeaf) {
        const leafPrefix = `${escapeLike(cleanLeaf)}%`;
        const leafResults = db.exec(
          `SELECT ${QUERY_COLUMNS},
            CASE WHEN clean_stem = ? OR clean_name = ? THEN 1 ELSE 2 END AS tier
          FROM ${symbolsSource} ${dirWhere} AND (clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc})
          ORDER BY
            ${kindSort}
            tier ASC,
            ${SECONDARY_LAST}
            CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
            LENGTH(name) ASC,
            name COLLATE NOCASE ASC
          LIMIT ${limit}`,
          [cleanLeaf, cleanLeaf, ...dirParams, leafPrefix, leafPrefix]
        );
        if (leafResults && leafResults.length) {
          addItemsFromRows(leafResults[0].values, bandByTier(1, 2));
        }
      }

      const qualifiedLeaf = parseQualifiedQuery(leaf);
      if (qualifiedLeaf) {
        addItemsFromRows(
          queryQualifiedRows(qualifiedLeaf, dirWhere, dirParams, kindSort, limit - matchedItems.length, esc),
          2
        );
      }
    }

    if (matchedItems.length < limit) {
      const matchClause = `uri LIKE ? ${esc}`;
      const fullWhere = baseWhere ? `${baseWhere} AND ${matchClause}` : `WHERE ${matchClause}`;
      const results = db.exec(
        `SELECT ${QUERY_COLUMNS} FROM ${symbolsSource} ${fullWhere} ORDER BY ${SECONDARY_LAST} CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC, LENGTH(name) ASC, name COLLATE NOCASE ASC LIMIT ${limit}`,
        [...params, `%${escapeLike(query)}%`]
      );
      if (results && results.length) {
        addItemsFromRows(results[0].values, 3);
      }
      matchedItems = matchedItems.slice(0, limit);
    }
  } else {
    const cleanQuery = extractCleanName(query);
    const cleanLike = escapeLike(cleanQuery);
    const rawLike = escapeLike(query);
    const kindSort = options?.sortByKind ? "symbol_kind ASC, " : "";
    const nameLikeAny = `(clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc} OR name LIKE ? ${esc})`;
    const notPrefixed = `clean_stem NOT LIKE ? ${esc} AND clean_name NOT LIKE ? ${esc} AND name NOT LIKE ? ${esc}`;

    // Stage 1: Exact and Prefix matches on clean_stem, clean_name, or name
    // Ranked by relevance:
    // 1: Exact match on stem / clean_name / raw name
    // 2: Prefix match on stem / clean_name / raw name
    const stage1Where = baseWhere
      ? `${baseWhere} AND ${nameLikeAny}`
      : `WHERE ${nameLikeAny}`;

    const stage1Sql = `
      SELECT ${QUERY_COLUMNS},
        CASE
          WHEN clean_stem = ? OR clean_name = ? OR name = ? COLLATE NOCASE THEN 1
          WHEN ${nameLikeAny} THEN 2
          ELSE 3
        END AS relevance
      FROM ${symbolsSource}
      ${stage1Where}
      ORDER BY
        ${kindSort}
        relevance ASC,
        ${SECONDARY_LAST}
        CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
        LENGTH(name) ASC,
        name COLLATE NOCASE ASC
      LIMIT ${limit}
    `;

    const stage1Params = [
      cleanQuery,
      cleanQuery,
      query,
      `${cleanLike}%`,
      `${cleanLike}%`,
      `${rawLike}%`,
      ...params,
      `${cleanLike}%`,
      `${cleanLike}%`,
      `${rawLike}%`,
    ];

    const stage1Results = db.exec(stage1Sql, stage1Params);
    const stage1Rows: any[][] = stage1Results && stage1Results.length ? stage1Results[0].values : [];
    let hasExactMatch = stage1Rows.some((row) => row[TIER_COLUMN] === 1);

    const qualified = parseQualifiedQuery(query);
    if (qualified) {
      // An exact name match (e.g. the file "user.service.ts") still outranks qualified members.
      addItemsFromRows(stage1Rows.filter((row) => row[TIER_COLUMN] === 1), 1);
      const qualifiedRows = queryQualifiedRows(
        qualified,
        baseWhere,
        params,
        kindSort,
        limit - matchedItems.length,
        esc
      );
      addItemsFromRows(qualifiedRows, bandByTier(1, 2, 2));
      hasExactMatch = hasExactMatch || qualifiedRows.some((row) => row[TIER_COLUMN] === 1);
      addItemsFromRows(stage1Rows.filter((row) => row[TIER_COLUMN] !== 1), 2);
      matchedItems = matchedItems.slice(0, limit);
    }
    const notPrefixedParams = [`${cleanLike}%`, `${cleanLike}%`, `${rawLike}%`];
    let camelRowCount = 0;
    if (!qualified) {
      addItemsFromRows(stage1Rows, bandByTier(1, 2));
      const camel = parseCamelHumpsQuery(query);
      if (camel) {
        const camelRows = queryCamelHumpsRows(
          camel,
          baseWhere,
          params,
          kindSort,
          limit - matchedItems.length,
          notPrefixed,
          notPrefixedParams
        );
        camelRowCount = camelRows.length;
        addItemsFromRows(camelRows, bandByTier(2, 3));
      }
    }

    // Stage 2: Substring matches if we have space left
    if (matchedItems.length < SUBSTRING_MIN_THRESHOLD && matchedItems.length < limit) {
      const remaining = Math.min(
        limit - matchedItems.length,
        SUBSTRING_MIN_THRESHOLD - matchedItems.length
      );
      const cap = matchedItems.length + remaining;

      const stage2Where = baseWhere
        ? `${baseWhere} AND ${nameLikeAny} AND ${notPrefixed}`
        : `WHERE ${nameLikeAny} AND ${notPrefixed}`;

      const stage2Sql = `
        SELECT ${QUERY_COLUMNS}
        FROM ${symbolsSource}
        ${stage2Where}
        ORDER BY
          ${kindSort}
          ${SECONDARY_LAST}
          CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
          LENGTH(name) ASC,
          name COLLATE NOCASE ASC
        LIMIT ${remaining + camelRowCount}
      `;

      const stage2Params = [
        ...params,
        `%${cleanLike}%`,
        `%${cleanLike}%`,
        `%${rawLike}%`,
        ...notPrefixedParams,
      ];

      // Over-fetch by the CamelHumps rows: a row matched there can also be a substring match,
      // and it only drops out in addItemsFromRows.
      const stage2Results = db.exec(stage2Sql, stage2Params);
      if (stage2Results && stage2Results.length) {
        addItemsFromRows(stage2Results[0].values, 3);
      }
      matchedItems = matchedItems.slice(0, cap);
    }

    // Stage 3: Subsequence / fuzzy matches if:
    // - No exact matches were found in Stage 1 (!hasExactMatch)
    // - Direct matches are few (< FUZZY_MIN_THRESHOLD)
    // - Query length >= 2
    if (
      !hasExactMatch &&
      matchedItems.length < FUZZY_MIN_THRESHOLD &&
      matchedItems.length < limit &&
      cleanQuery.length >= 2
    ) {
      const remaining = Math.min(
        limit - matchedItems.length,
        SUBSTRING_MIN_THRESHOLD - matchedItems.length
      );
      addItemsFromRows(
        queryFuzzyRows(cleanQuery, query, baseWhere, params, kindSort, remaining, esc),
        4
      );
    }
  }

  if (query && !options?.sortByKind) {
    matchedItems = secondaryLastWithinBand(matchedItems);
  }

  // Save to LRU cache
  if (searchCache.size >= SEARCH_CACHE_MAX_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) {
      searchCache.delete(oldestKey);
    }
  }
  searchCache.set(cacheKey, matchedItems);

  return matchedItems;
}

function rowToQuickPickItem(row: any[]): QuickPickItem {
  const uriStr = row[0] as string;
  let uri: vscode.Uri;
  try {
    uri = vscode.Uri.parse(uriStr);
  } catch {
    uri = vscode.Uri.file(uriStr);
  }

  const secondary = row[SECONDARY_COLUMN] as Secondary;
  let description = (row[3] as string) || "";
  if (secondary === Secondary.Test) {
    description += " · test";
  } else if (secondary === Secondary.Generated) {
    description += " · generated";
  }

  const nameLine = row[NAME_LINE_COLUMN];
  const nameChar = row[NAME_CHAR_COLUMN];
  const hasNamePosition =
    nameLine !== null && nameLine !== undefined && nameChar !== null && nameChar !== undefined;

  return {
    uri,
    symbolKind: row[1] as number,
    label: row[2] as string,
    description,
    detail: (row[4] as string) || "",
    range: {
      start: new vscode.Position(row[5] as number, row[6] as number),
      end: new vscode.Position(row[7] as number, row[8] as number),
    },
    ...(hasNamePosition
      ? { namePosition: new vscode.Position(nameLine as number, nameChar as number) }
      : {}),
    ...(secondary ? { isSecondary: true } : {}),
  } as QuickPickItem;
}

export function clearAll(): void {
  if (db) {
    clearSearchCache();
    markDirty();
    db.run("DELETE FROM symbols");
    db.run("DELETE FROM file_state");
  }
}

export function getCount(): number {
  if (!db) {
    return 0;
  }
  const result = db.exec("SELECT COUNT(*) as cnt FROM symbols");
  if (!result || !result.length) {
    return 0;
  }
  return result[0].values[0][0] as number;
}

export function isEmpty(): boolean {
  return getCount() === 0;
}

function markDirty(): void {
  dirty = true;
  templateStale = true;
  changeEpoch++;
}

function removeLeftoverTempFiles(): void {
  for (const suffix of [TEMP_SUFFIX, EXIT_TEMP_SUFFIX]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // Usually absent; nothing else to do when it cannot be removed.
    }
  }
}

function moveCorruptFileAside(): void {
  try {
    fs.renameSync(dbPath, dbPath + CORRUPT_SUFFIX);
  } catch (error) {
    try {
      fs.unlinkSync(dbPath);
    } catch {}
    logger.log(`Failed to move the unreadable index file aside: ${error}`);
  }
  logger.log("Index file could not be read; it was moved aside and the workspace will be reindexed.");
}

// Wraps the exported bytes without the second full copy Buffer.from(data) would make.
function exportBuffer(): Buffer {
  const data = exportDatabase();
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function logSaved(buffer: Buffer, startedAt: number): void {
  const megabytes = (buffer.byteLength / 1024 / 1024).toFixed(1);
  logger.log(`Saved index (${megabytes} MB) in ${Date.now() - startedAt} ms`);
}

// Clears dirty before exporting, so writes made while the file is being written mark the next
// save; a failed write sets it again so the next save retries.
async function writeIndexFile(includeTemplate: boolean): Promise<void> {
  if (!db || !dbPath) {
    return;
  }
  if (includeTemplate && templateStale && fetchShareCacheAcrossWorktrees()) {
    await resolveRepoFingerprint();
  }
  const staleTemplate = getStaleTemplateTarget();
  const template = includeTemplate ? staleTemplate : undefined;
  const writeIndex = dirty;
  if (!writeIndex && !template) {
    return;
  }
  const startedAt = Date.now();
  const generation = dbGeneration;
  const exportedEpoch = changeEpoch;
  const targetPath = dbPath;
  dirty = false;
  if (template) {
    templateStale = false;
  }
  let buffer: Buffer;
  let symbolCount = 0;
  try {
    buffer = exportBuffer();
    if (template) {
      symbolCount = getCount();
    }
  } catch (error) {
    dirty = dirty || writeIndex;
    templateStale = templateStale || !!template;
    logger.log(`Failed to save index: ${error}`);
    return;
  }
  if (writeIndex) {
    try {
      if (!(await replaceFile(targetPath, buffer, TEMP_SUFFIX, generation))) {
        return;
      }
    } catch (error) {
      dirty = true;
      templateStale = templateStale || !!template;
      logger.log(`Failed to save index: ${error}`);
      return;
    }
    logSaved(buffer, startedAt);
  }
  if (!staleTemplate) {
    return;
  }
  // Read after the export, so a file changed in between is at worst listed as dirty too.
  const gitState = await captureTemplateGitState();
  if (generation === dbGeneration && exportedEpoch === changeEpoch) {
    templateGitState = gitState;
    templateGitStateEpoch = exportedEpoch;
  }
  if (template) {
    await writeSharedTemplate(buffer, false, template, symbolCount, gitState, generation);
  }
}

// The shutdown save cannot wait for git. It reuses the state read by the last background save,
// and leaves the older, self-consistent template in place when the index changed after it.
function getCurrentTemplateGitState(): TemplateGitState | undefined {
  return templateGitStateEpoch === changeEpoch ? templateGitState : undefined;
}

async function captureTemplateGitState(): Promise<TemplateGitState> {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return { dirtyPaths: [] };
  }
  const rootPath = workspaceFolder.uri.fsPath;
  const [commit, dirtyPaths] = await Promise.all([
    gitService.getHeadCommit(rootPath),
    gitService.getWorkingTreePaths(rootPath),
  ]);
  return { commit, dirtyPaths };
}

function writeIndexFileSync(includeTemplate: boolean): void {
  if (!db || !dbPath) {
    return;
  }
  const staleTemplate = includeTemplate ? getStaleTemplateTarget() : undefined;
  const gitState = staleTemplate && getCurrentTemplateGitState();
  if (staleTemplate && !gitState) {
    logger.log("Shared index template not refreshed on exit: the index changed after the last background save.");
  }
  const template = gitState ? staleTemplate : undefined;
  const writeIndex = dirty;
  if (!writeIndex && !template) {
    return;
  }
  const startedAt = Date.now();
  dirty = false;
  if (template) {
    templateStale = false;
  }
  let buffer: Buffer;
  let symbolCount = 0;
  try {
    buffer = exportBuffer();
    if (template) {
      symbolCount = getCount();
    }
    if (writeIndex) {
      replaceFileSync(dbPath, buffer, EXIT_TEMP_SUFFIX);
    }
  } catch (error) {
    dirty = dirty || writeIndex;
    templateStale = templateStale || !!template;
    logger.log(`Failed to save index: ${error}`);
    return;
  }
  if (writeIndex) {
    logSaved(buffer, startedAt);
  }
  if (template) {
    writeSharedTemplate(buffer, true, template, symbolCount, gitState!, dbGeneration);
  }
}

/**
 * Writes the database, then its meta, each through a temp file, so a worktree seeding from the
 * template never pairs new meta with an old database.
 */
function writeSharedTemplate(
  buffer: Buffer,
  sync: true,
  target: TemplateTarget,
  symbolCount: number,
  gitState: TemplateGitState,
  generation: number
): void;
function writeSharedTemplate(
  buffer: Buffer,
  sync: false,
  target: TemplateTarget,
  symbolCount: number,
  gitState: TemplateGitState,
  generation: number
): Promise<void>;
function writeSharedTemplate(
  buffer: Buffer,
  sync: boolean,
  target: TemplateTarget,
  symbolCount: number,
  gitState: TemplateGitState,
  generation: number
): Promise<void> | void {
  const meta = JSON.stringify({
    fingerprint: target.fingerprint,
    templateRootUri: target.rootUri,
    symbolCount,
    lastUpdated: Date.now(),
    commit: gitState.commit,
    dirtyPaths: gitState.dirtyPaths,
  });
  const onError = (error: unknown) => {
    if (generation === dbGeneration) {
      templateStale = true;
    }
    logger.log(`Failed to save shared index template: ${error}`);
  };
  if (sync) {
    try {
      fs.mkdirSync(target.dir, { recursive: true });
      replaceFileSync(target.dbPath, buffer, TEMPLATE_EXIT_TEMP_SUFFIX);
      replaceFileSync(target.metaPath, meta, TEMPLATE_EXIT_TEMP_SUFFIX);
    } catch (error) {
      onError(error);
    }
    return;
  }
  return (async () => {
    try {
      await fs.promises.mkdir(target.dir, { recursive: true });
      if (await replaceFile(target.dbPath, buffer, TEMPLATE_TEMP_SUFFIX, generation)) {
        await replaceFile(target.metaPath, meta, TEMPLATE_TEMP_SUFFIX, generation);
      }
    } catch (error) {
      onError(error);
    }
  })();
}

// Returns false, leaving the target untouched, when the database was closed during the write:
// the shutdown save has already written newer bytes there.
async function replaceFile(
  targetPath: string,
  data: Buffer | string,
  tempSuffix: string,
  generation: number
): Promise<boolean> {
  const tempPath = targetPath + tempSuffix;
  await fs.promises.writeFile(tempPath, data);
  if (generation !== dbGeneration) {
    await fs.promises.unlink(tempPath).catch(() => undefined);
    return false;
  }
  await fs.promises.rename(tempPath, targetPath);
  return true;
}

function replaceFileSync(targetPath: string, data: Buffer | string, tempSuffix: string): void {
  const tempPath = targetPath + tempSuffix;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, targetPath);
}

interface TemplateTarget {
  fingerprint: string;
  rootUri: string;
  dir: string;
  dbPath: string;
  metaPath: string;
}

function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
}

function getTemplateTarget(): TemplateTarget | undefined {
  const workspaceFolder = getWorkspaceFolder();
  if (
    !repoFingerprint ||
    !workspaceFolder ||
    !extensionContext ||
    !extensionContext.globalStorageUri
  ) {
    return undefined;
  }
  const dir = extensionContext.globalStorageUri.fsPath;
  return {
    fingerprint: repoFingerprint,
    rootUri: workspaceFolder.uri.toString(),
    dir,
    dbPath: path.join(dir, `repo-${repoFingerprint}.db`),
    metaPath: path.join(dir, `repo-${repoFingerprint}.json`),
  };
}

function getStaleTemplateTarget(): TemplateTarget | undefined {
  if (!templateStale || !fetchShareCacheAcrossWorktrees()) {
    return undefined;
  }
  return getTemplateTarget();
}

// Runs git, so at most once per initDatabase; the result cannot change while the window is open.
async function resolveRepoFingerprint(): Promise<void> {
  if (repoFingerprintResolved) {
    return;
  }
  repoFingerprintResolved = true;
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder || !extensionContext || !extensionContext.globalStorageUri) {
    return;
  }
  try {
    repoFingerprint = await gitService.getRepoFingerprint(workspaceFolder.uri.fsPath);
  } catch {
    repoFingerprint = undefined;
  }
}

/**
 * Saves the index in the background when it changed since the last save, and with
 * `includeTemplate` also the shared worktree template when it changed since it was last written.
 * Single-flight: a call made while a save is writing returns that save's promise, which then
 * runs one more save with the options of every call that waited. Never rejects; a failed save
 * is logged and retried by the next call.
 */
export function persistToFile(
  options: { includeTemplate: boolean } = { includeTemplate: false }
): Promise<void> {
  if (persistInFlight) {
    persistPending = true;
    persistPendingTemplate = persistPendingTemplate || options.includeTemplate;
    return persistInFlight;
  }
  const run = async () => {
    let includeTemplate = options.includeTemplate;
    try {
      do {
        persistPending = false;
        await writeIndexFile(includeTemplate);
        includeTemplate = persistPendingTemplate;
        persistPendingTemplate = false;
      } while (persistPending);
    } finally {
      persistInFlight = undefined;
    }
  };
  persistInFlight = run();
  return persistInFlight;
}

/**
 * Saves the index and the shared template synchronously when they changed; only for shutdown,
 * where VS Code does not wait for promises.
 */
export function persistToFileSync(): void {
  writeIndexFileSync(true);
}

/** Cancels a scheduled save and saves now, shared template included; used after a full index. */
export function flushPersist(): Promise<void> {
  cancelScheduledPersist();
  return persistToFile({ includeTemplate: true });
}

function cancelScheduledPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
}

export function wasSeededFromTemplate(): boolean {
  return seededFromTemplate;
}

export function setSeededFromTemplate(value: boolean): void {
  seededFromTemplate = value;
}

export function getSeedMeta(): SeedMeta | undefined {
  return seedMeta;
}

export function clearSharedCache(): void {
  if (extensionContext && extensionContext.globalStorageUri) {
    const globalDir = extensionContext.globalStorageUri.fsPath;
    if (fs.existsSync(globalDir)) {
      const files = fs.readdirSync(globalDir);
      for (const file of files) {
        if (
          file.startsWith("repo-") &&
          (file.endsWith(".db") || file.endsWith(".json") || file.endsWith(TEMP_SUFFIX))
        ) {
          try {
            fs.unlinkSync(path.join(globalDir, file));
          } catch {
            // ignore
          }
        }
      }
      logger.log("Shared repository cache cleared successfully.");
    }
  }
}

export function schedulePersist(): void {
  cancelScheduledPersist();
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    persistToFile();
  }, PERSIST_DEBOUNCE_MS);
}

export function deleteDatabaseFile(): void {
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
}

export function closeDatabase(): void {
  cancelScheduledPersist();
  if (db) {
    persistToFileSync();
    db.close();
    db = undefined;
  }
  dbGeneration++;
  persistPending = false;
  persistPendingTemplate = false;
}

export function isReady(): boolean {
  return !!db;
}

export const database = {
  initDatabase,
  insertSymbol,
  insertSymbolsBatch,
  deleteByUri,
  deleteByUriPrefix,
  upsertFileStates,
  getFileStates,
  getFileState,
  getIndexedUris,
  clearFileStates,
  hasFileStateBaseline,
  recomputeSecondary,
  search,
  clearSearchCache,
  clearAll,
  getCount,
  isEmpty,
  persistToFile,
  persistToFileSync,
  flushPersist,
  schedulePersist,
  deleteDatabaseFile,
  closeDatabase,
  isReady,
  itemIdentity,
  wasSeededFromTemplate,
  setSeededFromTemplate,
  getSeedMeta,
  clearSharedCache,
  extractName,
  extractCleanName,
  extractCleanStem,
  extractCleanContainer,
  escapeLike,
  parseQualifiedQuery,
  parsePatternQuery,
  splitPathQuery,
  splitWords,
  extractCleanWords,
  extractCleanInitials,
  parseCamelHumpsQuery,
};
