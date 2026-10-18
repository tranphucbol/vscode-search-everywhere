import * as path from "path";
import * as vscode from "vscode";
import {
  fetchCategories,
  fetchHandOffPrefixes,
  fetchHelpPhrase,
  fetchItemsFilterPhrases,
  fetchShouldItemsBeSorted,
  fetchShouldUseDebounce,
  fetchShouldUseItemsFilterPhrases,
} from "../platform/config";
import { asyncUtils } from "../shared/async";
import { CategoryButton, LibraryButton, QuickPickItem } from "../shared/types";
import { vscodeVersion } from "../shared/vscodeVersion";
import { categories } from "./actions/categories";
import { copy } from "./actions/copy";
import { fileScope } from "./actions/fileScope";
import { handOff } from "./input/handOff";
import { help } from "./input/help";
import { COPY_ICON } from "./view/itemDecoration";
import { itemLoader } from "./view/itemLoader";
import { liveResults } from "./view/liveResults";
import { opener } from "./actions/open";
import { preview } from "./editor/preview";
import { query } from "./input/query";
import { quickPickState, session } from "./state";
import { title } from "./view/title";
const debounce = asyncUtils.debounce;

const FOCUS_QUICK_INPUT_COMMAND = "workbench.action.focusQuickOpen";

let lastQuery = "";

function disposeOnDidChangeValueEventListeners(): void {
  quickPickState
    .getOnDidChangeValueEventListeners()
    .forEach((eventListener: vscode.Disposable) => eventListener.dispose());
  quickPickState.setOnDidChangeValueEventListeners([]);
}

function registerOnDidChangeValueEventListeners(): void {
  fetchShouldUseDebounce()
    ? registerOnDidChangeValueWithDebounceEventListeners()
    : registerOnDidChangeValueWithoutDebounceEventListeners();
}

function registerOnDidChangeValueWithDebounceEventListeners(): void {
  const control = quickPickState.getControl();
  const onDidChangeValueEventListener = control.onDidChangeValue(
    debounce(handleDidChangeValue, 50)
  );
  const onDidChangeValueEventListeners =
    quickPickState.getOnDidChangeValueEventListeners();

  onDidChangeValueEventListeners.push(onDidChangeValueEventListener);
}

function registerOnDidChangeValueWithoutDebounceEventListeners(): void {
  const control = quickPickState.getControl();
  const onDidChangeValueEventListener =
    control.onDidChangeValue(handleDidChangeValue);

  quickPickState
    .getOnDidChangeValueEventListeners()
    .push(onDidChangeValueEventListener);
}

function fetchConfig(): void {
  quickPickState.setShouldUseItemsFilterPhrases(
    fetchShouldUseItemsFilterPhrases()
  );
  quickPickState.setHelpPhrase(fetchHelpPhrase());
  quickPickState.setItemsFilterPhrases(fetchItemsFilterPhrases());
  quickPickState.setCategories(fetchCategories());
  quickPickState.setHandOffPrefixes(fetchHandOffPrefixes());
  quickPickState.setShouldItemsBeSorted(fetchShouldItemsBeSorted());
  toggleKeepingSeparatorsVisibleOnFiltering();
}

function reloadSortingSettings() {
  quickPickState.setShouldItemsBeSorted(fetchShouldItemsBeSorted());
  toggleKeepingSeparatorsVisibleOnFiltering();
}

function fetchHelpData(): void {
  quickPickState.setHelpItems(help.collectHelpItems());
}

function handleDidChangeValueClearing() {
  const control = quickPickState.getControl();
  control.items = [];
}

async function handleDidChangeValue(text: string): Promise<void> {
  const resolved = query.resolveHandOff(text);
  if (resolved) {
    await handOff.start(resolved.target, resolved.prefix, resolved.rest);
    return;
  }
  query.shouldLoadHelpItems(text)
    ? itemLoader.loadHelpItems()
    : itemLoader.loadItems();
}

async function handleDidAccept() {
  const control = quickPickState.getControl();
  const selectedItem = control.selectedItems[0];
  selectedItem && (await opener.openSelected(selectedItem));
}

function getLastQuery(): string {
  return lastQuery;
}

function handleDidHide() {
  preview.cancelPendingPreview();
  liveResults.cancelLiveSymbols();
  const control = quickPickState.getControl();
  lastQuery =
    session.handOffQuery ??
    (session.fileScopeUri
      ? session.savedWorkspaceSearchText
      : control?.value || "");
  session.handOffQuery = undefined;
  const editorToRestore = preview.getEditorToRestore();
  if (editorToRestore) {
    void preview.restoreEditor(editorToRestore);
  }
  preview.reset();
  session.isVisible = false;
  session.includeLibraries = false;

  query.setText("");
  session.fileScopeUri = undefined;
  session.savedWorkspaceSearchText = "";
  if (control) {
    control.title = undefined;
    control.placeholder = undefined;
    control.buttons = [];
  }
  vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereInFileScope",
    false
  );
  vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereOpen",
    false
  );
}

async function handleDidTriggerItemButton({
  item: qpItem,
  button,
}: vscode.QuickPickItemButtonEvent<QuickPickItem>) {
  if (qpItem.kind === vscode.QuickPickItemKind.Separator) {
    return;
  }
  const iconId = (button?.iconPath as vscode.ThemeIcon)?.id;
  if (iconId === "arrow-right") {
    await fileScope.navigateIntoFile(qpItem);
    return;
  }
  if (iconId === COPY_ICON) {
    await copy.copyReference(qpItem);
    return;
  }
  await opener.openItem(qpItem, vscode.ViewColumn.Beside);
}

async function handleDidTriggerButton(button: vscode.QuickInputButton) {
  if (button === vscode.QuickInputButtons.Back) {
    await fileScope.navigateBack();
    return;
  }
  const categoryIndex = (button as CategoryButton).categoryIndex;
  if ((button as LibraryButton).includeLibraries) {
    categories.toggleIncludeLibraries();
  } else if (typeof categoryIndex !== "number") {
    return;
  } else {
    categories.clickCategory(categoryIndex);
  }
  if (vscodeVersion.supportsQuickInputButtonToggle()) {
    // A clicked inline toggle keeps keyboard focus, and the extension API cannot focus the
    // input; the list is the closest place where arrows, Enter and Alt+Arrow keys still work.
    void vscode.commands.executeCommand(FOCUS_QUICK_INPUT_COMMAND);
  }
}

async function searchCurrentFile(): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor || !activeEditor.document || !activeEditor.document.uri) {
    vscode.window.showInformationMessage(
      "Search everywhere: No active file in editor to search in."
    );
    return;
  }

  if (!quickPick.isInitialized()) {
    quickPick.init();
  }

  const targetUri = activeEditor.document.uri;
  session.savedWorkspaceSearchText = "";
  fileScope.showFileScope(quickPickState.getControl(), targetUri);

  void vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereOpen",
    true
  );
  void vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereInFileScope",
    true
  );

  quickPick.show();
  itemLoader.loadItems();

  fileScope.reloadWhenSymbolsIndexed(targetUri, true);
}

function init(): void {
  const control = vscode.window.createQuickPick<QuickPickItem>();
  quickPickState.setControl(control);
  control.matchOnDetail = true;
  control.matchOnDescription = false;

  quickPick.fetchConfig();
  fetchHelpData();
  toggleKeepingSeparatorsVisibleOnFiltering();
  registerEventListeners();
}

function toggleKeepingSeparatorsVisibleOnFiltering() {
  const control = quickPickState.getControl();

  if (control) {
    // Always preserve database relevance ranking; do not let VS Code sort alphabetically
    (control as any).sortByLabel = false;
  }
}

function registerEventListeners() {
  const control = quickPickState.getControl();
  control.onDidHide(handleDidHide);
  control.onDidAccept(handleDidAccept);
  control.onDidChangeActive(preview.handleDidChangeActive);
  control.onDidTriggerItemButton(handleDidTriggerItemButton);
  control.onDidTriggerButton(handleDidTriggerButton);

  registerOnDidChangeValueEventListeners();
}

function reloadOnDidChangeValueEventListener(): void {
  disposeOnDidChangeValueEventListeners();
  registerOnDidChangeValueEventListeners();
}

function reload(): void {
  quickPick.fetchConfig();
  fetchHelpData();
}

function isInitialized(): boolean {
  return !!quickPickState.getControl();
}

function show(): void {
  const control = quickPickState.getControl();
  if (!session.isVisible) {
    preview.rememberActiveEditor();
    session.isVisible = true;
    session.includeLibraries = false;
  }
  title.updateTitle(query.resolveFilterPhrase(control.value || "").category);
  control.show();
  vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereOpen",
    true
  );
}

function setPlaceholder(isBusy: boolean): void {
  const control = quickPickState.getControl();
  if (session.fileScopeUri) {
    const filename = path.basename(vscode.Uri.parse(session.fileScopeUri).fsPath);
    control.placeholder = `Search symbols in ${filename}...`;
    return;
  }
  const helpPhrase = quickPickState.getHelpPhrase();
  control.placeholder = isBusy
    ? "Please wait, loading..."
    : quickPickState.getShouldUseItemsFilterPhrases()
    ? `${
        helpPhrase
          ? `Type ${helpPhrase} for help or start typing file or symbol name...`
          : `Help phrase not set. Start typing file or symbol name...`
      }`
    : "Start typing file or symbol name...";
}

export const quickPick = {
  getControl: () => quickPickState.getControl(),
  getFileScopeUri: () => session.fileScopeUri,
  getIncludeLibraries: () => session.includeLibraries,
  getLastQuery,
  init,
  isInitialized,
  reload,
  reloadSortingSettings,
  reloadOnDidChangeValueEventListener,
  disposeOnDidChangeValueEventListeners,
  fetchConfig,
  show,
  setText: query.setText,
  setPlaceholder,
  setItems: itemLoader.setItems,
  loadItems: itemLoader.loadItems,
  loadHelpItems: itemLoader.loadHelpItems,
  showLoading: liveResults.showLoading,
  handleDidChangeValueClearing,
  handleDidChangeValue,
  handleDidAccept,
  handleDidHide,
  handleDidChangeActive: preview.handleDidChangeActive,
  handleDidTriggerItemButton,
  handleDidTriggerButton,
  openItem: opener.openItem,
  openToTheSide: opener.openToTheSide,
  navigateIntoFile: fileScope.navigateIntoFile,
  navigateBack: fileScope.navigateBack,
  searchCurrentFile,
  copyReference: copy.copyReference,
  copyLocation: copy.copyLocation,
  cycleCategory: categories.cycleCategory,
  toggleIncludeLibraries: categories.toggleIncludeLibraries,
};
