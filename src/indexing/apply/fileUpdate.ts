import * as vscode from "vscode";
import { database, FileState } from "../../database";
import { dataConverter } from "../../symbols/dataConverter";
import { dataService } from "../../symbols/dataService";
import { DetailedActionType, QuickPickItem } from "../../shared/types";

async function downloadData(
  uris?: vscode.Uri[],
  fileStates?: Array<[string, FileState]>
): Promise<QuickPickItem[]> {
  const items: QuickPickItem[] = [];
  const workspaceData = await dataService.fetchData(uris, undefined, (batch, fileState) => {
    items.push(...batch);
    fileStates && fileState && fileStates.push(fileState);
  });
  if (items.length === 0 && workspaceData && workspaceData.items) {
    return dataConverter.convertToQpData(workspaceData);
  }
  return items;
}

async function updateUri(uri: vscode.Uri): Promise<number> {
  // Delete old data for this URI, then re-index and insert
  database.deleteByUri(uri.toString());
  try {
    const fileStates: Array<[string, FileState]> = [];
    const dataForUri = await fileUpdate.downloadData([uri], fileStates);
    if (dataForUri && dataForUri.length) {
      database.insertSymbolsBatch(dataForUri);
    }
    database.upsertFileStates(fileStates);
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
  // The simplest approach: the old paths were already removed by removeFromCacheByPath.
  // New paths will be indexed via the update action if they are files.
  // For directories, VSCode fires individual file events for each file inside.
  // So this is a no-op; individual file updates handle it.
  database.schedulePersist();
}

async function updateCacheByPath(
  uri: vscode.Uri,
  detailedActionType: DetailedActionType,
  oldUri?: vscode.Uri
) {
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
}

function removeUri(uri: vscode.Uri): void {
  database.deleteByUri(uri.toString());
}

function removeFolder(uri: vscode.Uri): void {
  database.deleteByUriPrefix(uri.toString());
}

// A path deleted on disk can no longer be stat-ed to tell a file from a folder.
function removeFileOrFolder(uri: vscode.Uri): void {
  removeUri(uri);
  removeFolder(uri.with({ path: `${uri.path}/` }));
}

function removeFromCacheByPath(
  uri: vscode.Uri,
  detailedActionType: DetailedActionType
) {
  const removeFnByDetailedActionType: { [key: string]: Function } = {
    [DetailedActionType.RenameOrMoveFile]: removeUri.bind(null, uri),
    [DetailedActionType.RemoveFile]: removeUri.bind(null, uri),
    [DetailedActionType.RemoveFileOrDirectory]: removeFileOrFolder.bind(null, uri),
    [DetailedActionType.TextChange]: removeUri.bind(null, uri),
    [DetailedActionType.ReloadUnsavedUri]: removeUri.bind(null, uri),
    [DetailedActionType.RemoveDirectory]: removeFolder.bind(null, uri),
    [DetailedActionType.RenameOrMoveDirectory]: removeFolder.bind(null, uri),
  };
  removeFnByDetailedActionType[detailedActionType]();
  database.schedulePersist();
}

export const fileUpdate = {
  downloadData,
  updateUri,
  updateCacheByPath,
  removeFromCacheByPath,
};
