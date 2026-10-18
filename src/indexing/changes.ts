import * as vscode from "vscode";
import { actionProcessor } from "./actionProcessor";
import { ActionType, DetailedActionType } from "../shared/types";
import { removeFromCacheByPath } from "./workspaceRemover";
import { updateCacheByPath } from "./workspaceUpdater";

async function queueUpdate(
  uri: vscode.Uri,
  detailedActionType: DetailedActionType,
  trigger: string,
  oldUri?: vscode.Uri
): Promise<void> {
  await actionProcessor.register({
    type: ActionType.Update,
    fn: updateCacheByPath.bind(null, uri, detailedActionType, oldUri),
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
    fn: removeFromCacheByPath.bind(null, uri, detailedActionType),
    trigger,
    uri,
  });
}

export const changes = {
  queueUpdate,
  queueRemove,
};
