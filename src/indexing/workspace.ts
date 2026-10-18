import * as vscode from "vscode";
import {
  clearConfig,
  clearNotSavedUriPaths as clearNotSavedUriPathsFromCache,
  getIndexedConfig,
  getNotSavedUriPaths as getNotSavedUriPathsFromCache,
  updateNotSavedUriPaths,
} from "../platform/cache";
import {
  fetchExcludeMode,
  fetchIndexedConfigSnapshot,
  fetchSecondaryCode,
  isDebounceConfigurationToggled,
  isSortingConfigurationToggled,
} from "../platform/config";
import { dataConverter } from "../symbols/dataConverter";
import { dataService } from "../symbols/dataService";
import { database } from "../database";
import { fileWatcher } from "./fileWatcher";
import { logger } from "../platform/logger";
import { isRootMarker, markerFileGlob, refreshPresets } from "../platform/presets";
import {
  ActionTrigger,
  DetailedActionType,
  ExcludeMode,
  QuickPickItem,
} from "../shared/types";
import { asyncUtils } from "../shared/async";
import { pathUtils } from "../shared/paths";
import { workspaceFolders } from "../shared/workspaceFolders";
import {
  onDidDebounceConfigToggleEventEmitter,
  onDidIndexWorkspace,
  onDidSortingConfigToggleEventEmitter,
  onWillIndexWorkspace,
  onWillReindexOnConfigurationChangeEventEmitter,
} from "../shared/events";
import { changes } from "./changes";
import { workspaceIndexer as indexer } from "./workspaceIndexer";
import { retryQueue } from "./workspaceUpdater";

const debounce = asyncUtils.debounce;

function reloadComponents() {
  dataConverter.reload();
  dataService.reload();
}

async function handleDidChangeConfiguration(
  event: vscode.ConfigurationChangeEvent
) {
  clearConfig();
  if (workspace.shouldReindexOnConfigurationChange(event)) {
    reloadComponents();
    workspace.shouldRestartFileWatcher(event) && fileWatcher.startWatching();
    onWillReindexOnConfigurationChangeEventEmitter.fire();
    await workspace.index(ActionTrigger.ConfigurationChange);
  } else if (isDebounceConfigurationToggled(event)) {
    onDidDebounceConfigToggleEventEmitter.fire();
  } else if (isSortingConfigurationToggled(event)) {
    onDidSortingConfigToggleEventEmitter.fire();
  } else if (event.affectsConfiguration(`${defaultSection}.secondaryCode`)) {
    database.recomputeSecondary(fetchSecondaryCode());
    database.schedulePersist();
  } else if (workspace.shouldRestartFileWatcher(event)) {
    fileWatcher.startWatching();
  }
}

function shouldRestartFileWatcher(
  event: vscode.ConfigurationChangeEvent
): boolean {
  return ["include", "exclude", "excludeMode", "watchFileSystem"].some(
    (config: string) => event.affectsConfiguration(`${defaultSection}.${config}`)
  );
}

async function handleDidChangeWorkspaceFolders(
  event: vscode.WorkspaceFoldersChangeEvent
) {
  if (workspaceFolders.hasWorkspaceChanged(event)) {
    workspaceFolders.setWorkspaceFoldersCommonPath();
    await refreshPresets();
    await workspace.reloadConfig();
    await workspace.index(ActionTrigger.WorkspaceFoldersChange);
  }
}

async function handleDidChangeMarkerFile(uri: vscode.Uri) {
  if (isRootMarker(uri) && (await refreshPresets())) {
    await workspace.reloadConfig();
    onWillReindexOnConfigurationChangeEventEmitter.fire();
    await workspace.index(ActionTrigger.ConfigurationChange);
  }
}

async function reloadConfig() {
  clearConfig();
  await dataService.fetchConfig();
  dataConverter.fetchConfig();
}

function clearIndexBuiltWithOtherConfig() {
  const indexedConfig = getIndexedConfig();
  if (indexedConfig && indexedConfig !== fetchIndexedConfigSnapshot()) {
    logger.log(
      "Language presets or index settings changed since the last index; the workspace will be reindexed."
    );
    database.clearAll();
  }
}

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
    workspace.addNotSavedUri(uri);

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

  workspace.addNotSavedUri(uri);

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
  workspace.removeFromNotSavedUri(textDocument.uri);
}

function shouldReindexOnConfigurationChange(
  event: vscode.ConfigurationChangeEvent
): boolean {
  const excludeMode = fetchExcludeMode();
  const excluded: string[] = [
    "shouldDisplayNotificationInStatusBar",
    "shouldInitOnStartup",
    "shouldHighlightSymbol",
    "shouldUseDebounce",
    "shouldItemsBeSorted",
    "shouldWorkspaceDataBeCached",
    "shouldSearchSelection",
    "useFileIconTheme",
    "categories",
    "itemsFilterPhrases",
    "helpPhrase",
    "previewOnSelect",
    "restoreLastQuery",
    "searchLanguageServersWhileIndexing",
    "secondaryCode",
    "watchFileSystem",
  ].map((config: string) => `${defaultSection}.${config}`);

  return (
    (event.affectsConfiguration("searchEverywhere") &&
      !excluded.some((config: string) => event.affectsConfiguration(config))) ||
    (excludeMode === ExcludeMode.FilesAndSearch &&
      (event.affectsConfiguration("files.exclude") ||
        event.affectsConfiguration("search.exclude")))
  );
}

async function init() {
  workspaceFolders.setWorkspaceFoldersCommonPath();
  clearConfig();
  await refreshPresets();
  clearIndexBuiltWithOtherConfig();
  await dataService.fetchConfig();
  dataConverter.fetchConfig();
  workspace.registerEventListeners();
}

async function index(indexActionType: ActionTrigger): Promise<void> {
  await indexer.reindex(indexActionType);
}

async function removeDataForUnsavedUris() {
  const paths = Array.from(workspace.getNotSavedUris());
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

  workspace.clearNotSavedUris();
}

function registerEventListeners(): void {
  vscode.workspace.onDidChangeConfiguration(
    debounce(handleDidChangeConfiguration, 250)
  );
  vscode.workspace.onDidChangeWorkspaceFolders(
    debounce(handleDidChangeWorkspaceFolders, 250)
  );
  vscode.workspace.onDidChangeTextDocument(
    debounce(handleDidChangeTextDocument, 300)
  );
  vscode.workspace.onDidRenameFiles(handleDidRenameFiles);
  vscode.workspace.onDidCreateFiles(handleDidCreateFiles);
  vscode.workspace.onDidDeleteFiles(handleDidDeleteFiles);

  vscode.workspace.onDidSaveTextDocument(handleDidSaveTextDocument);

  const markerWatcher = vscode.workspace.createFileSystemWatcher(
    markerFileGlob,
    false,
    true,
    false
  );
  markerWatcher.onDidCreate(workspace.handleDidChangeMarkerFile);
  markerWatcher.onDidDelete(workspace.handleDidChangeMarkerFile);

  fileWatcher.startWatching();

  onWillIndexWorkspace(() => retryQueue.stop());
  onDidIndexWorkspace((urisToRetry) => retryQueue.start(urisToRetry));
}

function getData(): QuickPickItem[] {
  return indexer.getData();
}

function addNotSavedUri(uri: vscode.Uri) {
  const notSavedUris = workspace.getNotSavedUris();
  notSavedUris.add(uri.path);
  updateNotSavedUriPaths(Array.from(notSavedUris));
}

function removeFromNotSavedUri(uri: vscode.Uri) {
  const notSavedUris = workspace.getNotSavedUris();
  notSavedUris.delete(uri.path);
  updateNotSavedUriPaths(Array.from(notSavedUris));
}

function getNotSavedUris() {
  const array = getNotSavedUriPathsFromCache();
  return new Set<string>(array);
}

function clearNotSavedUris() {
  clearNotSavedUriPathsFromCache();
}

const defaultSection = "searchEverywhere";

export const workspace = {
  init,
  index,
  reloadConfig,
  handleDidChangeMarkerFile,
  registerEventListeners,
  getData,
  getNotSavedUris,
  addNotSavedUri,
  removeFromNotSavedUri,
  clearNotSavedUris,
  removeDataForUnsavedUris,
  shouldReindexOnConfigurationChange,
  shouldRestartFileWatcher,
  handleDidChangeConfiguration,
  handleDidChangeWorkspaceFolders,
  handleDidChangeTextDocument,
  handleDidSaveTextDocument,
  handleDidRenameFiles,
  handleDidCreateFiles,
  handleDidDeleteFiles,
};
