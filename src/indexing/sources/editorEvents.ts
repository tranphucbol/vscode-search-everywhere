import * as vscode from "vscode";
import { dataService } from "../../symbols/dataService";
import { ActionTrigger, DetailedActionType } from "../../shared/types";
import { asyncUtils } from "../../shared/async";
import { pathUtils } from "../../shared/paths";
import { changes } from "../queue/changes";
import { unsavedFiles } from "./unsavedFiles";

async function handleDidChangeTextDocument(
  event: vscode.TextDocumentChangeEvent
) {
  const uri = event.document.uri;
  const isUriExistingInWorkspace = await dataService.isUriExistingInWorkspace(
    uri
  );
  const hasContentChanged = event.contentChanges.length;

  const actionType = DetailedActionType.TextChange;

  if (isUriExistingInWorkspace && hasContentChanged) {
    unsavedFiles.add(uri);

    await changes.queueRemove(uri, actionType, ActionTrigger.DidChangeTextDocument);
    await changes.queueUpdate(uri, actionType, ActionTrigger.DidChangeTextDocument);
  }
}

async function handleDidRenameFiles(event: vscode.FileRenameEvent) {
  const firstFile = event.files[0];
  const actionType = pathUtils.isDirectory(firstFile.oldUri)
    ? DetailedActionType.RenameOrMoveDirectory
    : DetailedActionType.RenameOrMoveFile;

  for (let i = 0; i < event.files.length; i++) {
    const file = event.files[i];

    await changes.queueUpdate(
      file.newUri,
      actionType,
      ActionTrigger.DidRenameFiles,
      file.oldUri
    );

    actionType === DetailedActionType.RenameOrMoveFile &&
      (await changes.queueRemove(
        file.oldUri,
        actionType,
        ActionTrigger.DidRenameFiles
      ));
  }
}

async function handleDidCreateFiles(event: vscode.FileCreateEvent) {
  const uri = event.files[0];
  const actionType = pathUtils.isDirectory(uri)
    ? DetailedActionType.CreateNewDirectory
    : DetailedActionType.CreateNewFile;

  unsavedFiles.add(uri);

  await changes.queueUpdate(uri, actionType, ActionTrigger.DidCreateFiles);
}

async function handleDidDeleteFiles(event: vscode.FileDeleteEvent) {
  const uri = event.files[0];
  const actionType = pathUtils.isDirectory(uri)
    ? DetailedActionType.RemoveDirectory
    : DetailedActionType.RemoveFile;

  await changes.queueRemove(uri, actionType, ActionTrigger.DidDeleteFiles);
}

function handleDidSaveTextDocument(textDocument: vscode.TextDocument) {
  unsavedFiles.remove(textDocument.uri);
}

function register(): void {
  vscode.workspace.onDidChangeTextDocument(
    asyncUtils.debounce(editorEvents.handleDidChangeTextDocument, 300)
  );
  vscode.workspace.onDidRenameFiles(editorEvents.handleDidRenameFiles);
  vscode.workspace.onDidCreateFiles(editorEvents.handleDidCreateFiles);
  vscode.workspace.onDidDeleteFiles(editorEvents.handleDidDeleteFiles);

  vscode.workspace.onDidSaveTextDocument(editorEvents.handleDidSaveTextDocument);
}

export const editorEvents = {
  handleDidChangeTextDocument,
  handleDidRenameFiles,
  handleDidCreateFiles,
  handleDidDeleteFiles,
  handleDidSaveTextDocument,
  register,
};
