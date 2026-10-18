import * as vscode from "vscode";
import { logger } from "../../platform/logger";
import { changes } from "./changes";
import { fileUpdate } from "../apply/fileUpdate";

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
    await changes.queueRetry(uri, retryUri.bind(null, key, uri));
  }
}

async function retryUri(key: string, uri: vscode.Uri): Promise<void> {
  if (!pendingUris.has(key)) {
    return;
  }
  const symbolCount = await fileUpdate.updateUri(uri).catch(() => 0);
  if (symbolCount > 0) {
    pendingUris.delete(key);
    !pendingUris.size && logger.log("All retried files are indexed.");
    !pendingUris.size && stopRetrying();
  }
}

function getPendingUris(): vscode.Uri[] {
  return Array.from(pendingUris.values());
}

export const retryQueue = {
  start: startRetrying,
  stop: stopRetrying,
  retryPending,
  getPendingUris,
};
