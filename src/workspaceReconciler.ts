import * as vscode from "vscode";
import { dataService } from "./dataService";
import { database, FileState } from "./database";
import { logger } from "./logger";
import { ActionTrigger, ActionType, DetailedActionType } from "./types";
import { workspace } from "./workspace";
import { workspaceIndexer as indexer } from "./workspaceIndexer";
import { removeFromCacheByPath } from "./workspaceRemover";
import { updateCacheByPath } from "./workspaceUpdater";

const STAT_CONCURRENCY = 32;
const FULL_INDEX_MIN_FILES = 2000;
const FULL_INDEX_RATIO = 0.25;

export interface ReconcileResult {
  added: number;
  changed: number;
  removed: number;
  fullIndex: boolean;
  baseline: boolean;
}

async function statAll(
  uris: vscode.Uri[]
): Promise<Array<FileState | undefined>> {
  const states: Array<FileState | undefined> = new Array(uris.length);
  let next = 0;
  const worker = async () => {
    while (next < uris.length) {
      const i = next++;
      states[i] = await dataService.statUri(uris[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(STAT_CONCURRENCY, uris.length) }, worker)
  );
  return states;
}

async function recordBaseline(uris: vscode.Uri[]): Promise<number> {
  const indexed = new Set(database.getIndexedUris());
  const indexedUris = uris.filter((uri) => indexed.has(uri.toString()));
  const states = await statAll(indexedUris);
  const entries: Array<[string, FileState]> = [];
  indexedUris.forEach((uri, i) => {
    const state = states[i];
    state && entries.push([uri.toString(), state]);
  });
  database.upsertFileStates(entries);
  database.schedulePersist();
  return entries.length;
}

function isSameState(stored: FileState, current: FileState): boolean {
  return stored.mtime === current.mtime && stored.size === current.size;
}

export async function reconcile(trigger: ActionTrigger): Promise<ReconcileResult> {
  const startedAt = Date.now();
  const result: ReconcileResult = {
    added: 0,
    changed: 0,
    removed: 0,
    fullIndex: false,
    baseline: false,
  };
  const uris = await dataService.fetchUris();

  if (!database.hasFileStateBaseline()) {
    const recorded = await recordBaseline(uris);
    logger.log(
      `Recorded file state for ${recorded} files; changes made before this version are picked up when the file changes again.`
    );
    return { ...result, baseline: true };
  }

  const stored = database.getFileStates();
  const states = await statAll(uris);
  const toUpdate: vscode.Uri[] = [];
  const listed = new Set<string>();

  uris.forEach((uri, i) => {
    const key = uri.toString();
    listed.add(key);
    const storedState = stored.get(key);
    const current = states[i];
    if (!storedState) {
      result.added++;
      toUpdate.push(uri);
    } else if (!current || !isSameState(storedState, current)) {
      result.changed++;
      toUpdate.push(uri);
    }
  });

  const toRemove = [...stored.keys()].filter((key) => !listed.has(key));
  result.removed = toRemove.length;

  const threshold = Math.max(FULL_INDEX_MIN_FILES, stored.size * FULL_INDEX_RATIO);
  if (result.added + result.changed > threshold) {
    result.fullIndex = true;
    logger.log(`Reconciled with disk: full index in ${Date.now() - startedAt} ms`);
    await workspace.index(trigger);
    return result;
  }

  logger.log(
    `Reconciled with disk: +${result.added} ~${result.changed} -${result.removed} in ${
      Date.now() - startedAt
    } ms`
  );

  // Registering without awaiting each one lets the processor drain them in a
  // single run instead of one processing cycle per file.
  const removals = toRemove.map((key) => {
    const uri = vscode.Uri.parse(key);
    return indexer.registerAction(
      ActionType.Remove,
      removeFromCacheByPath.bind(null, uri, DetailedActionType.RemoveFile),
      trigger,
      uri
    );
  });
  const updates = toUpdate.map((uri) =>
    indexer.registerAction(
      ActionType.Update,
      updateCacheByPath.bind(null, uri, DetailedActionType.TextChange),
      trigger,
      uri
    )
  );
  await Promise.all([...removals, ...updates]);
  return result;
}

export async function restatAll(): Promise<number> {
  const uris = await dataService.fetchUris();
  database.clearFileStates();
  return recordBaseline(uris);
}

export const workspaceReconciler = {
  reconcile,
  restatAll,
};
