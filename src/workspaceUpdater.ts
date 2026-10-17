import * as vscode from "vscode";
import { database } from "./database";
import { logger } from "./logger";
import {
  ActionTrigger,
  ActionType,
  DetailedActionType,
  QuickPickItem,
} from "./types";
import { utils } from "./utils";
import { workspaceIndexer as indexer } from "./workspaceIndexer";

async function updateUri(uri: vscode.Uri): Promise<number> {
  // Delete old data for this URI, then re-index and insert
  database.deleteByUri(uri.toString());
  try {
    const dataForUri = await indexer.downloadData([uri]);
    if (dataForUri && dataForUri.length) {
      database.insertSymbolsBatch(dataForUri);
    }
    database.schedulePersist();
    return dataForUri
      ? dataForUri.filter((item) => item.symbolKind !== 0).length
      : 0;
  } catch (err: any) {
    if (
      err &&
      err.message &&
      (err.message.includes("nonexistent") ||
        err.message.includes("ENOENT") ||
        err.message.includes("Unable to resolve") ||
        err.message.includes("Unable to read file"))
    ) {
      database.schedulePersist();
      return 0;
    }
    throw err;
  }
}

function updateFolder(uri: vscode.Uri, oldUri: vscode.Uri) {
  // For directory renames, we need to update all URIs with the old prefix.
  // The simplest approach: the old paths were already removed by workspaceRemover.
  // New paths will be indexed via the update action if they are files.
  // For directories, VSCode fires individual file events for each file inside.
  // So this is a no-op; individual file updates handle it.
  database.schedulePersist();
}

export async function updateCacheByPath(
  uri: vscode.Uri,
  detailedActionType: DetailedActionType,
  oldUri?: vscode.Uri
) {
  try {
    const updateFnByDetailedActionType: { [key: string]: Function } = {
      [DetailedActionType.CreateNewFile]: updateUri.bind(null, uri),
      [DetailedActionType.RenameOrMoveFile]: updateUri.bind(null, uri),
      [DetailedActionType.TextChange]: updateUri.bind(null, uri),
      [DetailedActionType.ReloadUnsavedUri]: updateUri.bind(null, uri),
      [DetailedActionType.RenameOrMoveDirectory]: updateFolder.bind(
        null,
        uri,
        oldUri!
      ),
    };

    const updateFn = updateFnByDetailedActionType[detailedActionType];
    updateFn && (await updateFn());
  } catch (error) {
    utils.printErrorMessage(error as Error);
    await indexer.index("on error catch");
  }
}

const RETRY_INTERVAL_MS = 30_000;
const RETRY_WINDOW_MS = 10 * 60_000;

let pendingUris = new Map<string, vscode.Uri>();
let retryTimer: ReturnType<typeof setInterval> | undefined;
let retryDeadline = 0;

function startRetrying(uris: vscode.Uri[]): void {
  stopRetrying();
  if (!uris.length) {
    return;
  }
  pendingUris = new Map(uris.map((uri) => [uri.toString(), uri]));
  retryDeadline = Date.now() + RETRY_WINDOW_MS;
  retryTimer = setInterval(() => retryQueue.retryPending(), RETRY_INTERVAL_MS);
  logger.log(
    `${pendingUris.size} files returned no symbols before their language server was ready; retrying every ${
      RETRY_INTERVAL_MS / 1000
    } s for ${RETRY_WINDOW_MS / 60_000} min.`
  );
}

function stopRetrying(): void {
  retryTimer && clearInterval(retryTimer);
  retryTimer = undefined;
  pendingUris.clear();
}

async function retryPending(): Promise<void> {
  if (!pendingUris.size) {
    return;
  }
  if (Date.now() >= retryDeadline) {
    logger.log(
      `Stopped retrying ${pendingUris.size} files that still return no symbols.`
    );
    stopRetrying();
    return;
  }

  logger.log(`Retrying ${pendingUris.size} files that returned no symbols.`);
  for (const [key, uri] of Array.from(pendingUris.entries())) {
    await indexer.registerAction(
      ActionType.Update,
      retryUri.bind(null, key, uri),
      ActionTrigger.RetryWithoutSymbols,
      uri
    );
  }
}

async function retryUri(key: string, uri: vscode.Uri): Promise<void> {
  if (!pendingUris.has(key)) {
    return;
  }
  const symbolCount = await workspaceUpdater.updateUri(uri).catch(() => 0);
  if (symbolCount > 0) {
    pendingUris.delete(key);
    !pendingUris.size && logger.log("All retried files are indexed.");
    !pendingUris.size && stopRetrying();
  }
}

function getPendingUris(): vscode.Uri[] {
  return Array.from(pendingUris.values());
}

export const workspaceUpdater = {
  updateUri,
};

export const retryQueue = {
  start: startRetrying,
  stop: stopRetrying,
  retryPending,
  getPendingUris,
};
