import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { clear, clearConfig, clearNotSavedUriPaths, initCache } from "./cache";
import {
  fetchRestoreLastQuery,
  fetchShouldInitOnStartup,
  fetchShouldSearchSelection,
  fetchShouldWorkspaceDataBeCached,
} from "./config";
import { database } from "./database";
import { gitService } from "./gitService";
import { logger } from "./logger";
import { patternProvider } from "./patternProvider";
import { quickPick } from "./quickPick";
import { Action, ActionTrigger, ActionType, DetailedActionType } from "./types";
import { utils } from "./utils";
import { workspace } from "./workspace";
import { workspaceIndexer } from "./workspaceIndexer";
import { workspaceReconciler } from "./workspaceReconciler";
import { removeFromCacheByPath } from "./workspaceRemover";
import { updateCacheByPath } from "./workspaceUpdater";
import {
  onDidDebounceConfigToggle,
  onDidProcessing,
  onDidSortingConfigToggle,
  onWillExecuteAction,
  onWillProcessing,
  onWillReindexOnConfigurationChange,
} from "./workspaceEventsEmitter";

function loadItemsAndShowQuickPick() {
  quickPick.reload();

  const activeEditorOrUndefined = vscode.window.activeTextEditor;
  const selectedText = controller.shouldSearchSelection(activeEditorOrUndefined)
    ? getSelectedText(activeEditorOrUndefined as vscode.TextEditor)
    : "";

  // Set before show() so VS Code selects the restored query and typing
  // replaces it; QuickPick.valueSelection does not exist in VS Code 1.64.
  if (!selectedText && fetchRestoreLastQuery() && quickPick.getLastQuery()) {
    quickPick.setText(quickPick.getLastQuery());
  }

  quickPick.loadItems();
  quickPick.show();

  if (selectedText) {
    quickPick.setText(selectedText);
  }
}

function getSelectedText(editor: vscode.TextEditor): string {
  const { start, end } = editor.selection;
  return editor.document.getText(new vscode.Range(start, end));
}

function setBusy(isBusy: boolean) {
  if (quickPick.isInitialized()) {
    setQuickPickLoading(isBusy);
    setQuickPickPlaceholder(isBusy);
  }
}

function setQuickPickLoading(isBusy: boolean) {
  quickPick.showLoading(isBusy);
}

function setQuickPickPlaceholder(isBusy: boolean) {
  quickPick.setPlaceholder(isBusy);
}

function isDataEmpty() {
  return database.isEmpty();
}

function shouldIndexOnQuickPickOpen() {
  return (
    controller.isInitOnStartupDisabledAndWorkspaceCachingDisabled() ||
    controller.isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty()
  );
}

function isInitOnStartupDisabledAndWorkspaceCachingDisabled() {
  return (
    !fetchShouldInitOnStartup() &&
    !quickPick.isInitialized() &&
    !fetchShouldWorkspaceDataBeCached()
  );
}

function isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty() {
  return (
    !fetchShouldInitOnStartup() &&
    !quickPick.isInitialized() &&
    fetchShouldWorkspaceDataBeCached() &&
    isDataEmpty()
  );
}

function shouldIndexOnStartup() {
  return (
    controller.isInitOnStartupEnabledAndWorkspaceCachingDisabled() ||
    controller.isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty()
  );
}

function isInitOnStartupEnabledAndWorkspaceCachingDisabled() {
  return (
    fetchShouldInitOnStartup() &&
    !quickPick.isInitialized() &&
    !fetchShouldWorkspaceDataBeCached()
  );
}

function isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty() {
  return (
    fetchShouldInitOnStartup() &&
    !quickPick.isInitialized() &&
    fetchShouldWorkspaceDataBeCached() &&
    isDataEmpty()
  );
}

function shouldLoadDataFromCacheOnQuickPickOpen() {
  return (
    !fetchShouldInitOnStartup() &&
    !quickPick.isInitialized() &&
    fetchShouldWorkspaceDataBeCached()
  );
}

function shouldLoadDataFromCacheOnStartup() {
  return (
    fetchShouldInitOnStartup() &&
    !quickPick.isInitialized() &&
    fetchShouldWorkspaceDataBeCached()
  );
}

function shouldSearchSelection(editor: vscode.TextEditor | undefined) {
  return quickPick.isInitialized() && fetchShouldSearchSelection() && !!editor;
}

function handleWillProcessing() {
  controller.setBusy(true);
  !quickPick.isInitialized() && quickPick.init();
}

function setQuickPickData() {
  !quickPick.isInitialized() && quickPick.init();
  quickPick.setItems(workspace.getData());
}

function handleDidProcessing() {
  controller.setQuickPickData();
  quickPick.loadItems();
  controller.setBusy(false);
}

function handleWillExecuteAction(action: Action) {
  if (action.type === ActionType.Rebuild) {
    if (quickPick.isInitialized()) {
      quickPick.setItems([]);
      quickPick.loadItems();
    }
  }
  logger.logAction(action);
}

function handleDidDebounceConfigToggle() {
  controller.setBusy(true);
  quickPick.reloadOnDidChangeValueEventListener();
  controller.setBusy(false);
}

function handleDidSortingConfigToggle() {
  controller.setBusy(true);
  quickPick.reloadSortingSettings();
  if (quickPick.isInitialized()) {
    quickPick.loadItems();
  }
  controller.setBusy(false);
}

function handleWillReindexOnConfigurationChange() {
  quickPick.reload();
}

async function search(): Promise<void> {
  if (controller.shouldIndexOnQuickPickOpen()) {
    clear();
    database.clearAll();
    await workspace.index(ActionTrigger.Search);
  }

  if (controller.shouldLoadDataFromCacheOnQuickPickOpen()) {
    clearConfig();
    !quickPick.isInitialized() && quickPick.init();
    await workspace.removeDataForUnsavedUris();
    // Data is already in SQLite — no need to setQuickPickData
  }

  const activeEditorOrUndefined = vscode.window.activeTextEditor;

  if (controller.shouldSearchSelection(activeEditorOrUndefined)) {
    const timeInMsToAvoidListFlashing = 380;
    const activeEditor = activeEditorOrUndefined as vscode.TextEditor;
    quickPick.disposeOnDidChangeValueEventListeners();

    const { start, end } = activeEditor.selection;
    const selectedText = activeEditor.document.getText(
      new vscode.Range(start, end)
    );
    quickPick.setText(selectedText);

    await utils.sleepAndExecute(timeInMsToAvoidListFlashing, () =>
      controller.restoreOnDidChangeValueEventListener(selectedText)
    );
  }
  quickPick.isInitialized() && loadItemsAndShowQuickPick();
}

// The quick pick is already visible while the listeners are detached, so a
// value entered in that window (e.g. a paste) fires no event and must be
// loaded here.
function restoreOnDidChangeValueEventListener(expectedText: string) {
  quickPick.reloadOnDidChangeValueEventListener();

  const value = quickPick.getControl().value;
  if (value !== expectedText) {
    quickPick.handleDidChangeValue(value);
  }
}

async function reload(): Promise<void> {
  clear();
  database.clearAll();
  clearNotSavedUriPaths();

  utils.hasWorkspaceAnyFolder()
    ? await workspace.index(ActionTrigger.Reload)
    : utils.printNoFolderOpenedMessage();
}

async function startup(): Promise<void> {
  if (database.wasSeededFromTemplate()) {
    database.setSeededFromTemplate(false);
    clearConfig();
    !quickPick.isInitialized() && quickPick.init();
    await workspace.removeDataForUnsavedUris();

    const workspaceFolder =
      vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    if (workspaceFolder && workspaceFolder.uri.scheme === "file") {
      try {
        await controller.syncSeededWorktree(workspaceFolder.uri.fsPath);
      } catch (error) {
        logger.log(`Error syncing worktree delta: ${error}`);
      }
    }
    return;
  }

  const shouldReconcile = controller.shouldReconcileOnStartup();

  if (controller.shouldIndexOnStartup()) {
    await workspace.index(ActionTrigger.Startup);
  }

  if (controller.shouldLoadDataFromCacheOnStartup()) {
    clearConfig();
    !quickPick.isInitialized() && quickPick.init();
    await workspace.removeDataForUnsavedUris();
    // Data is already in SQLite — no need to setQuickPickData
  }

  shouldReconcile && reconcileInBackground();
}

async function syncSeededWorktree(rootPath: string): Promise<void> {
  const meta = database.getSeedMeta();
  const commit = meta && meta.commit;
  if (!commit) {
    logger.log(
      "The shared cache template records no commit; indexing the seeded worktree in full."
    );
    await indexSeededWorktreeInFull();
    return;
  }

  const [changedPaths, workingTreePaths, repoRoot] = await Promise.all([
    gitService.getChangedPathsBetween(rootPath, commit),
    gitService.getWorkingTreePaths(rootPath),
    gitService.getRepoRoot(rootPath),
  ]);
  if (!changedPaths || !repoRoot) {
    logger.log(
      `Could not diff the seeded worktree against template commit ${commit}; indexing it in full.`
    );
    await indexSeededWorktreeInFull();
    return;
  }

  const relativePaths = new Set([
    ...changedPaths,
    ...workingTreePaths,
    ...((meta && meta.dirtyPaths) || []),
  ]);
  logger.log(
    `Syncing ${relativePaths.size} files changed since template commit ${commit} for seeded worktree...`
  );

  const uris = [...relativePaths]
    .map((relativePath) => vscode.Uri.file(path.join(repoRoot, relativePath)))
    .filter((uri) => vscode.workspace.getWorkspaceFolder(uri));
  const actions = uris.map((uri) => {
    return controller.isIndexableFile(uri)
      ? workspaceIndexer.registerAction(
          ActionType.Update,
          updateCacheByPath.bind(null, uri, DetailedActionType.TextChange),
          ActionTrigger.Startup,
          uri
        )
      : workspaceIndexer.registerAction(
          ActionType.Remove,
          removeFromCacheByPath.bind(null, uri, DetailedActionType.RemoveFile),
          ActionTrigger.Startup,
          uri
        );
  });
  await Promise.all(actions);
  // The template's mtimes come from another checkout, so they say nothing about this one.
  await workspaceReconciler.restatAll();
}

function isIndexableFile(uri: vscode.Uri): boolean {
  try {
    if (!fs.statSync(uri.fsPath).isFile()) {
      return false;
    }
  } catch {
    return false;
  }
  return patternProvider.isIncluded(vscode.workspace.asRelativePath(uri, false));
}

async function indexSeededWorktreeInFull(): Promise<void> {
  database.clearAll();
  await workspace.index(ActionTrigger.Startup);
}

function shouldReconcileOnStartup() {
  return fetchShouldWorkspaceDataBeCached() && !isDataEmpty();
}

function reconcileInBackground() {
  workspaceReconciler
    .reconcile(ActionTrigger.Reconcile)
    .catch((error) => logger.log(`Error reconciling the index with disk: ${error}`));
}

let extensionContext: vscode.ExtensionContext;

function getExtensionContext() {
  return extensionContext;
}

function setExtensionContext(newExtensionContext: vscode.ExtensionContext) {
  extensionContext = newExtensionContext;
}

function registerWorkspaceEventListeners() {
  onWillProcessing(handleWillProcessing);
  onDidProcessing(handleDidProcessing);
  onWillExecuteAction(handleWillExecuteAction);
  onDidDebounceConfigToggle(handleDidDebounceConfigToggle);
  onDidSortingConfigToggle(handleDidSortingConfigToggle);
  onWillReindexOnConfigurationChange(handleWillReindexOnConfigurationChange);
}

async function init(newExtensionContext: vscode.ExtensionContext) {
  logger.init();
  setExtensionContext(newExtensionContext);
  initCache(controller.getExtensionContext());
  await database.initDatabase(newExtensionContext);
  await workspace.init();
  registerWorkspaceEventListeners();

  logger.log(`Extension "vscode-search-everywhere" has been activated.`);
}

async function searchCurrentFile(): Promise<void> {
  if (controller.shouldIndexOnQuickPickOpen()) {
    clear();
    database.clearAll();
    await workspace.index(ActionTrigger.Search);
  }

  if (controller.shouldLoadDataFromCacheOnQuickPickOpen()) {
    clearConfig();
    !quickPick.isInitialized() && quickPick.init();
    await workspace.removeDataForUnsavedUris();
  }

  await quickPick.searchCurrentFile();
}

async function navigateIntoFile(): Promise<void> {
  await quickPick.navigateIntoFile();
}

async function navigateBack(): Promise<void> {
  await quickPick.navigateBack();
}

async function openToTheSide(): Promise<void> {
  await quickPick.openToTheSide();
}

async function copyReference(): Promise<void> {
  await quickPick.copyReference();
}

async function copyLocation(): Promise<void> {
  await quickPick.copyLocation();
}

function nextCategory(): void {
  quickPick.isInitialized() && quickPick.cycleCategory(1);
}

function previousCategory(): void {
  quickPick.isInitialized() && quickPick.cycleCategory(-1);
}

export const controller = {
  shouldIndexOnQuickPickOpen,
  shouldLoadDataFromCacheOnQuickPickOpen,
  shouldIndexOnStartup,
  shouldLoadDataFromCacheOnStartup,
  shouldReconcileOnStartup,
  syncSeededWorktree,
  isIndexableFile,
  shouldSearchSelection,
  restoreOnDidChangeValueEventListener,
  isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty,
  isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty,
  isInitOnStartupEnabledAndWorkspaceCachingDisabled,
  isInitOnStartupDisabledAndWorkspaceCachingDisabled,
  setBusy,
  setQuickPickData,
  getExtensionContext,
  init,
  search,
  searchCurrentFile,
  navigateIntoFile,
  navigateBack,
  openToTheSide,
  copyReference,
  copyLocation,
  nextCategory,
  previousCategory,
  startup,
  reload,
  handleWillProcessing,
  handleDidProcessing,
  handleWillExecuteAction,
  handleDidDebounceConfigToggle,
  handleDidSortingConfigToggle,
  handleWillReindexOnConfigurationChange,
};
