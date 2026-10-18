import { fetchSecondaryCode } from "../platform/config";
import { QuickPickItem } from "../shared/types";
import {
  escapeLike,
  extractCleanContainer,
  extractCleanName,
  extractCleanStem,
  extractName,
  extractWordColumns,
  LIKE_ESCAPE,
} from "./queryText";
import { clearSearchCache } from "./searchCache";
import { classifySecondary, updateSecondaryColumn } from "./secondary";
import { markDirty, state } from "./state";

export function insertSymbol(item: QuickPickItem): void {
  if (!state.db) {
    return;
  }
  clearSearchCache();
  markDirty();
  const name = extractName(item.label);
  const cleanName = extractCleanName(name);
  const cleanStem = extractCleanStem(name, item.symbolKind);
  const [cleanWords, cleanInitials] = extractWordColumns(name, item.symbolKind);
  state.db.run(
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
  if (!state.db || !items || !items.length) {
    return;
  }
  clearSearchCache();
  markDirty();
  state.db.run("BEGIN TRANSACTION");
  const stmt = state.db.prepare(`
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
    state.db.run("COMMIT");
  } catch (e) {
    stmt.free();
    state.db.run("ROLLBACK");
    throw e;
  }
}

export function deleteByUri(uriPath: string): void {
  if (!state.db) {
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
  state.db.run(sql, params);
  return state.db.getRowsModified();
}

export function deleteByUriPrefix(uriPath: string): void {
  if (!state.db) {
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
  if (!state.db || !entries.length) {
    return;
  }
  markDirty();
  state.db.run("BEGIN TRANSACTION");
  const stmt = state.db.prepare("INSERT OR REPLACE INTO file_state (uri, mtime, size) VALUES (?, ?, ?)");
  try {
    for (const [uri, fileState] of entries) {
      stmt.run([uri, fileState.mtime, fileState.size]);
    }
    stmt.free();
    state.db.run("COMMIT");
  } catch (e) {
    stmt.free();
    state.db.run("ROLLBACK");
    throw e;
  }
}

export function getFileStates(): Map<string, FileState> {
  const states = new Map<string, FileState>();
  if (!state.db) {
    return states;
  }
  const result = state.db.exec("SELECT uri, mtime, size FROM file_state");
  if (result && result.length) {
    for (const row of result[0].values) {
      states.set(row[0] as string, { mtime: row[1] as number, size: row[2] as number });
    }
  }
  return states;
}

export function getFileState(uri: string): FileState | undefined {
  if (!state.db) {
    return undefined;
  }
  const result = state.db.exec("SELECT mtime, size FROM file_state WHERE uri = ?", [uri]);
  if (!result || !result.length) {
    return undefined;
  }
  const [mtime, size] = result[0].values[0];
  return { mtime: mtime as number, size: size as number };
}

export function getIndexedUris(): string[] {
  if (!state.db) {
    return [];
  }
  const result = state.db.exec("SELECT DISTINCT uri FROM symbols");
  return result && result.length ? result[0].values.map((row: any[]) => row[0] as string) : [];
}

export function clearFileStates(): void {
  if (!state.db) {
    return;
  }
  markDirty();
  state.db.run("DELETE FROM file_state");
}

export function hasFileStateBaseline(): boolean {
  if (!state.db) {
    return true;
  }
  const result = state.db.exec("SELECT EXISTS (SELECT 1 FROM file_state)");
  const hasStates = !!(result && result.length && result[0].values[0][0]);
  return hasStates || isEmpty();
}

// Runs when searchEverywhere.secondaryCode changes: the column derives from the uri alone, so no
// reindex is needed.
export function recomputeSecondary(globs: string[]): void {
  if (!state.db) {
    return;
  }
  clearSearchCache();
  markDirty();
  updateSecondaryColumn(globs);
}

export function clearAll(): void {
  if (state.db) {
    clearSearchCache();
    markDirty();
    state.db.run("DELETE FROM symbols");
    state.db.run("DELETE FROM file_state");
  }
}

export function getCount(): number {
  if (!state.db) {
    return 0;
  }
  const result = state.db.exec("SELECT COUNT(*) as cnt FROM symbols");
  if (!result || !result.length) {
    return 0;
  }
  return result[0].values[0][0] as number;
}

export function isEmpty(): boolean {
  return getCount() === 0;
}
