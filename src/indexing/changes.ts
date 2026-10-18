import * as vscode from "vscode";
import * as cache from "../platform/cache";
import { database } from "../database";
import { actionProcessor } from "./actionProcessor";
import { ActionTrigger, ActionType, DetailedActionType } from "../shared/types";
import { messages } from "../shared/messages";
import { workspaceIndexer } from "./workspaceIndexer";
import { workspaceUpdater } from "./workspaceUpdater";

async function queueFullIndex(trigger: string): Promise<void> {
  await actionProcessor.register({
    type: ActionType.Rebuild,
    fn: workspaceIndexer.indexWithProgress,
    trigger,
  });
}

async function reindex(trigger: string): Promise<void> {
  cache.clear();
  database.clearAll();
  await changes.queueFullIndex(trigger);
}

function isRebuilding(): boolean {
  const current = actionProcessor.getPreviousAction();
  return (
    (!!current && current.type === ActionType.Rebuild) ||
    actionProcessor.queue.some((action) => action.type === ActionType.Rebuild)
  );
}

async function updateOrIndexInFull(
  uri: vscode.Uri,
  detailedActionType: DetailedActionType,
  oldUri?: vscode.Uri
): Promise<void> {
  try {
    await workspaceUpdater.updateCacheByPath(uri, detailedActionType, oldUri);
  } catch (error) {
    messages.printErrorMessage(error as Error);
    await changes.queueFullIndex("on error catch");
  }
}

async function queueUpdate(
  uri: vscode.Uri,
  detailedActionType: DetailedActionType,
  trigger: string,
  oldUri?: vscode.Uri
): Promise<void> {
  await actionProcessor.register({
    type: ActionType.Update,
    fn: updateOrIndexInFull.bind(null, uri, detailedActionType, oldUri),
    trigger,
    uri,
  });
}

async function queueRemove(
  uri: vscode.Uri,
  detailedActionType: DetailedActionType,
  trigger: string
): Promise<void> {
  await actionProcessor.register({
    type: ActionType.Remove,
    fn: workspaceUpdater.removeFromCacheByPath.bind(null, uri, detailedActionType),
    trigger,
    uri,
  });
}

async function queueRetry(
  uri: vscode.Uri,
  retry: () => Promise<void>
): Promise<void> {
  await actionProcessor.register({
    type: ActionType.Update,
    fn: retry,
    trigger: ActionTrigger.RetryWithoutSymbols,
    uri,
  });
}

export const changes = {
  queueFullIndex,
  reindex,
  isRebuilding,
  queueUpdate,
  queueRemove,
  queueRetry,
};
