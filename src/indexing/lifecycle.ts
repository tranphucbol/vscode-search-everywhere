import * as vscode from "vscode";
import { clearConfig, getIndexedConfig } from "../platform/cache";
import {
  fetchIndexedConfigSnapshot,
  fetchShouldInitOnStartup,
  fetchShouldWorkspaceDataBeCached,
} from "../platform/config";
import { dataConverter } from "../symbols/dataConverter";
import { dataService } from "../symbols/dataService";
import { database } from "../database";
import { logger } from "../platform/logger";
import { refreshPresets } from "../platform/presets";
import { ActionTrigger } from "../shared/types";
import { workspaceFolders } from "../shared/workspaceFolders";
import { onDidIndexWorkspace, onWillIndexWorkspace } from "../shared/events";
import { changes } from "./queue/changes";
import { editorEvents } from "./sources/editorEvents";
import { fileWatcher } from "./sources/fileWatcher";
import { retryQueue } from "./queue/retryQueue";
import { settingsEvents } from "./sources/settingsEvents";
import { unsavedFiles } from "./sources/unsavedFiles";
import { reconciler } from "./sources/reconciler";
import { worktreeSync } from "./sources/worktreeSync";

export interface QuickPickHandle {
  isInitialized(): boolean;
  init(): void;
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

async function init() {
  workspaceFolders.setWorkspaceFoldersCommonPath();
  clearConfig();
  await refreshPresets();
  clearIndexBuiltWithOtherConfig();
  await dataService.fetchConfig();
  dataConverter.fetchConfig();
  lifecycle.registerEventListeners();
}

function registerEventListeners(): void {
  settingsEvents.register();
  editorEvents.register();

  fileWatcher.startWatching();

  onWillIndexWorkspace(() => retryQueue.stop());
  onDidIndexWorkspace((urisToRetry) => retryQueue.start(urisToRetry));
}

function isDataEmpty() {
  return database.isEmpty();
}

function shouldIndexOnQuickPickOpen(isQuickPickInitialized: boolean) {
  return (
    lifecycle.isInitOnStartupDisabledAndWorkspaceCachingDisabled(isQuickPickInitialized) ||
    lifecycle.isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty(
      isQuickPickInitialized
    )
  );
}

function isInitOnStartupDisabledAndWorkspaceCachingDisabled(isQuickPickInitialized: boolean) {
  return (
    !fetchShouldInitOnStartup() &&
    !isQuickPickInitialized &&
    !fetchShouldWorkspaceDataBeCached()
  );
}

function isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty(
  isQuickPickInitialized: boolean
) {
  return (
    !fetchShouldInitOnStartup() &&
    !isQuickPickInitialized &&
    fetchShouldWorkspaceDataBeCached() &&
    isDataEmpty()
  );
}

function shouldIndexOnStartup(isQuickPickInitialized: boolean) {
  return (
    lifecycle.isInitOnStartupEnabledAndWorkspaceCachingDisabled(isQuickPickInitialized) ||
    lifecycle.isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
      isQuickPickInitialized
    )
  );
}

function isInitOnStartupEnabledAndWorkspaceCachingDisabled(isQuickPickInitialized: boolean) {
  return (
    fetchShouldInitOnStartup() &&
    !isQuickPickInitialized &&
    !fetchShouldWorkspaceDataBeCached()
  );
}

function isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
  isQuickPickInitialized: boolean
) {
  return (
    fetchShouldInitOnStartup() &&
    !isQuickPickInitialized &&
    fetchShouldWorkspaceDataBeCached() &&
    isDataEmpty()
  );
}

function shouldLoadDataFromCacheOnQuickPickOpen(isQuickPickInitialized: boolean) {
  return (
    !fetchShouldInitOnStartup() &&
    !isQuickPickInitialized &&
    fetchShouldWorkspaceDataBeCached()
  );
}

function shouldLoadDataFromCacheOnStartup(isQuickPickInitialized: boolean) {
  return (
    fetchShouldInitOnStartup() &&
    !isQuickPickInitialized &&
    fetchShouldWorkspaceDataBeCached()
  );
}

// The first index can take minutes on a large repository; the quick pick opens at once
// and shows what is indexed so far plus live language server results.
function startIndexOnQuickPickOpen(quickPick: QuickPickHandle): void {
  changes
    .reindex(ActionTrigger.Search)
    .catch((error) => logger.log(`Error indexing the workspace: ${error}`));
  !quickPick.isInitialized() && quickPick.init();
}

async function loadCachedData(quickPick: QuickPickHandle): Promise<void> {
  clearConfig();
  !quickPick.isInitialized() && quickPick.init();
  await unsavedFiles.reloadAll();
}

async function prepareQuickPickOpen(quickPick: QuickPickHandle): Promise<void> {
  if (lifecycle.shouldIndexOnQuickPickOpen(quickPick.isInitialized())) {
    lifecycle.startIndexOnQuickPickOpen(quickPick);
  }

  if (lifecycle.shouldLoadDataFromCacheOnQuickPickOpen(quickPick.isInitialized())) {
    await loadCachedData(quickPick);
  }
}

async function startup(quickPick: QuickPickHandle): Promise<void> {
  if (database.wasSeededFromTemplate()) {
    database.setSeededFromTemplate(false);
    await loadCachedData(quickPick);

    const workspaceFolder =
      vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    if (workspaceFolder && workspaceFolder.uri.scheme === "file") {
      try {
        await worktreeSync.syncSeededWorktree(workspaceFolder.uri.fsPath);
      } catch (error) {
        logger.log(`Error syncing worktree delta: ${error}`);
      }
    }
    return;
  }

  const shouldReconcile = lifecycle.shouldReconcileOnStartup();

  if (lifecycle.shouldIndexOnStartup(quickPick.isInitialized())) {
    await changes.reindex(ActionTrigger.Startup);
  }

  if (lifecycle.shouldLoadDataFromCacheOnStartup(quickPick.isInitialized())) {
    await loadCachedData(quickPick);
  }

  shouldReconcile && reconcileInBackground();
}

async function reload(): Promise<void> {
  unsavedFiles.clear();
  await changes.reindex(ActionTrigger.Reload);
}

function isRebuilding() {
  return changes.isRebuilding();
}

function shouldReconcileOnStartup() {
  return fetchShouldWorkspaceDataBeCached() && !isDataEmpty();
}

function reconcileInBackground() {
  reconciler
    .reconcile(ActionTrigger.Reconcile)
    .catch((error) => logger.log(`Error reconciling the index with disk: ${error}`));
}

export const lifecycle = {
  init,
  registerEventListeners,
  shouldIndexOnQuickPickOpen,
  shouldLoadDataFromCacheOnQuickPickOpen,
  shouldIndexOnStartup,
  shouldLoadDataFromCacheOnStartup,
  shouldReconcileOnStartup,
  isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty,
  isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty,
  isInitOnStartupEnabledAndWorkspaceCachingDisabled,
  isInitOnStartupDisabledAndWorkspaceCachingDisabled,
  startIndexOnQuickPickOpen,
  prepareQuickPickOpen,
  startup,
  reload,
  isRebuilding,
};
