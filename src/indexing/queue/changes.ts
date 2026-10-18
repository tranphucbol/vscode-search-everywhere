import * as vscode from "vscode";
import * as cache from "../../platform/cache";
import { database } from "../../database";
import { actionQueue } from "./actionQueue";
import { ActionTrigger, ActionType, DetailedActionType } from "../../shared/types";
import { messages } from "../../shared/messages";
import { fullIndex } from "../apply/fullIndex";
import { fileUpdate } from "../apply/fileUpdate";

async function queueFullIndex(trigger: string): Promise<void> {
  await actionQueue.register({
    type: ActionType.Rebuild,
    fn: fullIndex.indexWithProgress,
    trigger,
  });
}

async function reindex(trigger: string): Promise<void> {
  cache.clear();
  database.clearAll();
  await changes.queueFullIndex(trigger);
}

function isRebuilding(): boolean {
  const current = actionQueue.getPreviousAction();
  return (
    (!!current && current.type === ActionType.Rebuild) ||
    actionQueue.queue.some((action) => action.type === ActionType.Rebuild)
  );
}

async function updateOrIndexInFull(
  uri: vscode.Uri,
  detailedActionType: DetailedActionType,
  oldUri?: vscode.Uri
): Promise<void> {
  try {
    await fileUpdate.updateCacheByPath(uri, detailedActionType, oldUri);
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
  await actionQueue.register({
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
  await actionQueue.register({
    type: ActionType.Remove,
    fn: fileUpdate.removeFromCacheByPath.bind(null, uri, detailedActionType),
    trigger,
    uri,
  });
}

async function queueRetry(
  uri: vscode.Uri,
  retry: () => Promise<void>
): Promise<void> {
  await actionQueue.register({
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
