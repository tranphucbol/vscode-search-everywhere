import * as vscode from "vscode";
import {
  clearNotSavedUriPaths,
  getNotSavedUriPaths,
  updateNotSavedUriPaths,
} from "../platform/cache";
import { ActionTrigger, DetailedActionType } from "../shared/types";
import { changes } from "./changes";

function add(uri: vscode.Uri) {
  const notSavedUris = unsavedFiles.getAll();
  notSavedUris.add(uri.path);
  updateNotSavedUriPaths(Array.from(notSavedUris));
}

function remove(uri: vscode.Uri) {
  const notSavedUris = unsavedFiles.getAll();
  notSavedUris.delete(uri.path);
  updateNotSavedUriPaths(Array.from(notSavedUris));
}

function getAll() {
  const array = getNotSavedUriPaths();
  return new Set<string>(array);
}

function clear() {
  clearNotSavedUriPaths();
}

async function reloadAll() {
  const paths = Array.from(unsavedFiles.getAll());
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const uri = vscode.Uri.file(path);

    await changes.queueRemove(
      uri,
      DetailedActionType.ReloadUnsavedUri,
      ActionTrigger.ReloadUnsavedUri
    );
    await changes.queueUpdate(
      uri,
      DetailedActionType.ReloadUnsavedUri,
      ActionTrigger.ReloadUnsavedUri
    );
  }

  unsavedFiles.clear();
}

export const unsavedFiles = {
  add,
  remove,
  getAll,
  clear,
  reloadAll,
};
