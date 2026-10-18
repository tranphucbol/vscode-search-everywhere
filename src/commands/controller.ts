import * as vscode from "vscode";
import { initCache } from "../platform/cache";
import { fetchRestoreLastQuery, fetchShouldSearchSelection } from "../platform/config";
import { database } from "../database";
import { logger } from "../platform/logger";
import { quickPick } from "../quickPick/quickPick";
import { Action, ActionType } from "../shared/types";
import { asyncUtils } from "../shared/async";
import { messages } from "../shared/messages";
import { workspaceFolders } from "../shared/workspaceFolders";
import { lifecycle } from "../indexing/lifecycle";
import {
  onDidDebounceConfigToggle,
  onDidProcessing,
  onDidSortingConfigToggle,
  onWillExecuteAction,
  onWillProcessing,
  onWillReindexOnConfigurationChange,
} from "../shared/events";

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

function shouldSearchSelection(editor: vscode.TextEditor | undefined) {
  return quickPick.isInitialized() && fetchShouldSearchSelection() && !!editor;
}

function handleWillProcessing() {
  controller.setBusy(true);
  !quickPick.isInitialized() && quickPick.init();
}

function setQuickPickData() {
  !quickPick.isInitialized() && quickPick.init();
  quickPick.setItems(database.isReady() ? database.search("") : []);
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
  await lifecycle.prepareQuickPickOpen(quickPick);

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

    await asyncUtils.sleepAndExecute(timeInMsToAvoidListFlashing, () =>
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
  workspaceFolders.hasWorkspaceAnyFolder()
    ? await lifecycle.reload()
    : messages.printNoFolderOpenedMessage();
}

async function startup(): Promise<void> {
  await lifecycle.startup(quickPick);
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
  await lifecycle.init();
  registerWorkspaceEventListeners();

  logger.log(`Extension "vscode-search-everywhere" has been activated.`);
}

async function searchCurrentFile(): Promise<void> {
  await lifecycle.prepareQuickPickOpen(quickPick);

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

function toggleIncludeLibraries(): void {
  quickPick.isInitialized() && quickPick.toggleIncludeLibraries();
}

export const controller = {
  shouldSearchSelection,
  restoreOnDidChangeValueEventListener,
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
  toggleIncludeLibraries,
  startup,
  reload,
  handleWillProcessing,
  handleDidProcessing,
  handleWillExecuteAction,
  handleDidDebounceConfigToggle,
  handleDidSortingConfigToggle,
  handleWillReindexOnConfigurationChange,
};
