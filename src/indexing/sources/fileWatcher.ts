import * as vscode from "vscode";
import { fetchWatchFileSystem } from "../../platform/settings/config";
import { files } from "../../symbols/scan/files";
import { database } from "../../database";
import { logger } from "../../platform/logger";
import { patternProvider } from "../../platform/settings/patternProvider";
import { ActionTrigger, DetailedActionType } from "../../shared/types";
import { changes } from "../queue/changes";
import { reconciler } from "./reconciler";

const WATCH_BATCH_DELAY_MS = 500;
const WATCH_BURST_THRESHOLD = 1000;
const STAT_CONCURRENCY = 32;

export type WatchEventKind = "create" | "change" | "delete";

interface WatchEvent {
  kind: WatchEventKind;
  uri: vscode.Uri;
}

let disposables: vscode.Disposable[] = [];
let pending = new Map<string, WatchEvent>();
let batchTimer: NodeJS.Timeout | undefined;

function startWatching(): void {
  fileWatcher.stopWatching();
  if (!fetchWatchFileSystem()) {
    return;
  }

  const contentWatcher = vscode.workspace.createFileSystemWatcher(
    patternProvider.getIncludePatterns() || "**/*",
    false,
    false,
    true
  );
  // A deleted directory produces a single event for the directory itself,
  // which the include glob never matches.
  const deleteWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*",
    true,
    true,
    false
  );

  disposables = [
    contentWatcher,
    deleteWatcher,
    contentWatcher.onDidCreate((uri) => fileWatcher.enqueue("create", uri)),
    contentWatcher.onDidChange((uri) => fileWatcher.enqueue("change", uri)),
    deleteWatcher.onDidDelete((uri) => fileWatcher.enqueue("delete", uri)),
  ];
}

function stopWatching(): void {
  disposables.forEach((disposable) => disposable.dispose());
  disposables = [];
  batchTimer && clearTimeout(batchTimer);
  batchTimer = undefined;
  pending = new Map();
}

function canQueue(): boolean {
  return database.isReady() && !database.isEmpty() && !changes.isRebuilding();
}

function enqueue(kind: WatchEventKind, uri: vscode.Uri): void {
  if (!canQueue()) {
    return;
  }
  pending.set(uri.toString(), { kind, uri });
  batchTimer && clearTimeout(batchTimer);
  batchTimer = setTimeout(() => {
    fileWatcher.processBatch().catch((error) =>
      logger.log(`Error processing file system changes: ${error}`)
    );
  }, WATCH_BATCH_DELAY_MS);
}

function isInWorkspace(uri: vscode.Uri): boolean {
  return !!vscode.workspace.getWorkspaceFolder(uri);
}

function getRelativePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false);
}

async function isStateUnchanged(uri: vscode.Uri): Promise<boolean> {
  const stored = database.getFileState(uri.toString());
  if (!stored) {
    return false;
  }
  const current = await files.statUri(uri);
  return !!current && current.mtime === stored.mtime && current.size === stored.size;
}

async function shouldKeep(
  event: WatchEvent,
  openUris: Set<string>
): Promise<boolean> {
  const { kind, uri } = event;
  if (!isInWorkspace(uri)) {
    return false;
  }
  const relativePath = getRelativePath(uri);
  // A deleted directory never matches the include glob, so deletes only skip
  // excluded paths: nothing under one of those is indexed.
  if (kind === "delete") {
    return !patternProvider.isExcluded(relativePath);
  }
  if (!patternProvider.isIncluded(relativePath) || openUris.has(uri.toString())) {
    return false;
  }
  return kind === "create" || !(await isStateUnchanged(uri));
}

async function filterEvents(events: WatchEvent[]): Promise<WatchEvent[]> {
  const openUris = new Set(
    vscode.workspace.textDocuments.map((document) => document.uri.toString())
  );
  const keep: boolean[] = new Array(events.length);
  let next = 0;
  const worker = async () => {
    while (next < events.length) {
      const i = next++;
      keep[i] = await shouldKeep(events[i], openUris);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(STAT_CONCURRENCY, events.length) }, worker)
  );
  return events.filter((_, i) => keep[i]);
}

function queueChanges(event: WatchEvent): Promise<void>[] {
  const { kind, uri } = event;
  const trigger = ActionTrigger.DidChangeFileSystem;

  if (kind === "create") {
    return [changes.queueUpdate(uri, DetailedActionType.CreateNewFile, trigger)];
  }
  if (kind === "change") {
    return [
      changes.queueRemove(uri, DetailedActionType.TextChange, trigger),
      changes.queueUpdate(uri, DetailedActionType.TextChange, trigger),
    ];
  }
  return [
    changes.queueRemove(uri, DetailedActionType.RemoveFileOrDirectory, trigger),
  ];
}

async function processBatch(): Promise<void> {
  batchTimer = undefined;
  const events = [...pending.values()];
  pending = new Map();

  // A full index that started after these events lists the files itself.
  if (!events.length || !canQueue()) {
    return;
  }

  const kept = await filterEvents(events);
  if (!kept.length) {
    return;
  }

  if (kept.length > WATCH_BURST_THRESHOLD) {
    logger.log(
      `${kept.length} files changed on disk; reconciling the index instead of updating each file.`
    );
    await reconciler.reconcile(ActionTrigger.Reconcile);
    return;
  }

  await Promise.all(kept.flatMap(queueChanges));
}

export const fileWatcher = {
  startWatching,
  stopWatching,
  enqueue,
  processBatch,
};
