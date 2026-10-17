import * as path from "path";
import * as vscode from "vscode";
import {
  fetchCategories,
  fetchHandOffPrefixes,
  fetchHelpPhrase,
  fetchItemsFilter,
  fetchItemsFilterPhrases,
  fetchPreviewOnSelect,
  fetchRankRecentItemsHigher,
  fetchRecentItemsLimit,
  fetchSearchLanguageServersWhileIndexing,
  fetchShouldHighlightSymbol,
  fetchShouldItemsBeSorted,
  fetchShouldUseDebounce,
  fetchShouldUseItemsFilterPhrases,
  fetchShowRecentItemsOnEmptyQuery,
  fetchUseFileIconTheme,
} from "./config";
import { dataConverter } from "./dataConverter";
import { dataService } from "./dataService";
import { database } from "./database";
import { liveSymbols } from "./liveSymbols";
import { recentItems } from "./recentItems";
import { getLocation, getReference } from "./reference";
import {
  Category,
  CategoryButton,
  HandOffTarget,
  ItemsFilterPhrases,
  LibraryButton,
  QuickPickItem,
} from "./types";
import { utils } from "./utils";
import { workspaceIndexer } from "./workspaceIndexer";
const debounce = utils.debounce;

const VIRTUAL_PAGE_SIZE = 500;
const ICON_PREFIX_REGEX = /^\$\([^)]+\)\s+/;
const ALL_ICON = "list-flat";
const FALLBACK_CATEGORY_ICON = "filter";
const ACTIVE_ICON = "check";
// vscode.QuickInputButtonLocation.Inline, added after the pinned @types/vscode.
const INLINE_BUTTON_LOCATION = 2;
const FOCUS_QUICK_INPUT_COMMAND = "workbench.action.focusQuickOpen";
const HAND_OFF_PREFIXES: Record<string, HandOffTarget> = {
  ">": "commands",
  "%": "text",
};
const QUICK_OPEN_COMMAND = "workbench.action.quickOpen";
// The "%" text search in quick open; VS Code versions without it only have the Search view.
const QUICK_TEXT_SEARCH_COMMAND = "workbench.action.quickTextSearch";
const FIND_IN_FILES_COMMAND = "workbench.action.findInFiles";
const COPY_ICON = "copy";
const COPY_REFERENCE_TOOLTIP = `Copy reference · ${
  process.platform === "darwin" ? "⌥⇧⌘C" : "Ctrl+Alt+Shift+C"
}`;
const COPIED_MESSAGE_TIMEOUT_MS = 3000;
const LIVE_SYMBOLS_DELAY_MS = 200;
const MIN_LIVE_SYMBOLS_QUERY_LENGTH = 2;
const NOT_INDEXED_SEPARATOR = "Not indexed yet";
const LIBRARIES_SEPARATOR = "Libraries";
const LIBRARY_ICON = "library";
const INCLUDE_LIBRARIES_SHORTCUT =
  process.platform === "darwin" ? "⌥⌘P" : "Ctrl+Alt+P";

let includeLibraries = false;
let liveSymbolsSequence = 0;
let liveSymbolsTimer: ReturnType<typeof setTimeout> | undefined;
let liveSymbolsPending = false;
let indexBusy = false;

function disposeOnDidChangeValueEventListeners(): void {
  quickPick
    .getOnDidChangeValueEventListeners()
    .forEach((eventListener: vscode.Disposable) => eventListener.dispose());
  quickPick.setOnDidChangeValueEventListeners([]);
}

function registerOnDidChangeValueEventListeners(): void {
  fetchShouldUseDebounce()
    ? registerOnDidChangeValueWithDebounceEventListeners()
    : registerOnDidChangeValueWithoutDebounceEventListeners();
}

function registerOnDidChangeValueWithDebounceEventListeners(): void {
  const control = quickPick.getControl();
  const onDidChangeValueEventListener = control.onDidChangeValue(
    debounce(handleDidChangeValue, 50)
  );
  const onDidChangeValueEventListeners =
    quickPick.getOnDidChangeValueEventListeners();

  onDidChangeValueEventListeners.push(onDidChangeValueEventListener);
}

function registerOnDidChangeValueWithoutDebounceEventListeners(): void {
  const control = quickPick.getControl();
  const onDidChangeValueEventListener =
    control.onDidChangeValue(handleDidChangeValue);

  quickPick
    .getOnDidChangeValueEventListeners()
    .push(onDidChangeValueEventListener);
}

async function openSelected(qpItem: QuickPickItem): Promise<void> {
  if (qpItem.kind === vscode.QuickPickItemKind.Separator) {
    return;
  }
  if (qpItem.handOff && qpItem.filterPhrase) {
    await handOff(qpItem.handOff, qpItem.filterPhrase, "");
    return;
  }
  shouldLoadItemsForFilterPhrase(qpItem)
    ? loadItemsForFilterPhrase(qpItem)
    : await quickPick.openItem(qpItem);
}

function shouldLoadItemsForFilterPhrase(qpItem: QuickPickItem): boolean {
  return quickPick.getShouldUseItemsFilterPhrases() && !!qpItem.isHelp;
}

function loadItemsForFilterPhrase(qpItem: QuickPickItem): void {
  const filterPhrase =
    qpItem.filterPhrase ??
    quickPick.getItemsFilterPhrases()[qpItem.symbolKind];
  quickPick.setText(filterPhrase);
  quickPick.loadItems();
}

interface ResolvedFilterPhrase {
  kinds?: number[];
  category?: Category;
  rest: string;
}

function resolveFilterPhrase(text: string): ResolvedFilterPhrase {
  if (!quickPick.getShouldUseItemsFilterPhrases()) {
    return { rest: text };
  }

  const candidates: { phrase: string; kinds: number[]; category?: Category }[] =
    [];
  for (const category of quickPick.getCategories() || []) {
    candidates.push({ phrase: category.phrase, kinds: category.kinds, category });
  }
  const filterPhrases = quickPick.getItemsFilterPhrases() || {};
  for (const kind of Object.keys(filterPhrases)) {
    const phrase = filterPhrases[parseInt(kind)];
    if (phrase) {
      candidates.push({ phrase, kinds: [parseInt(kind)] });
    }
  }
  // Array.prototype.sort is stable, so categories stay ahead of one-kind phrases of equal length.
  candidates.sort((a, b) => b.phrase.length - a.phrase.length);

  const trimmed = text.trimStart();
  const match = candidates.find((candidate) =>
    trimmed.startsWith(candidate.phrase)
  );
  return match
    ? {
        kinds: match.kinds,
        category: match.category,
        rest: trimmed.slice(match.phrase.length).trim(),
      }
    : { rest: text };
}

function cycleCategory(direction: 1 | -1): void {
  const control = quickPick.getControl();
  const categories = quickPick.getCategories() || [];
  if (!control || fileScopeUri || !categories.length) {
    return;
  }

  const { category } = resolveFilterPhrase(control.value || "");
  const positions = categories.length + 1;
  const current = category ? categories.indexOf(category) + 1 : 0;
  const next = (current + direction + positions) % positions;
  selectCategory(next - 1);
}

function selectCategory(index: number): void {
  const control = quickPick.getControl();
  const categories = quickPick.getCategories() || [];
  if (!control || fileScopeUri || !categories.length) {
    return;
  }

  const { kinds, rest } = resolveFilterPhrase(control.value || "");
  const query = kinds ? rest : (control.value || "").trim();
  const phrase = categories[index] ? categories[index].phrase : "";

  control.value = `${phrase}${query}`;
  quickPick.loadItems();
}

function buildCategoryButtons(active?: Category): CategoryButton[] {
  const categories = quickPick.getCategories() || [];
  const toggles = utils.supportsQuickInputButtonToggle();
  const entries = [
    { categoryIndex: -1, icon: ALL_ICON, tooltip: "All · Tab" },
    ...categories.map((category, categoryIndex) => ({
      categoryIndex,
      icon: category.icon || FALLBACK_CATEGORY_ICON,
      tooltip: `${category.name} (${category.phrase}) · Tab`,
    })),
  ];
  const activeIndex = active ? categories.indexOf(active) : -1;

  return entries.map(({ categoryIndex, icon, tooltip }) => {
    const checked = categoryIndex === activeIndex;
    return toggles
      ? {
          categoryIndex,
          iconPath: new vscode.ThemeIcon(icon),
          tooltip,
          location: INLINE_BUTTON_LOCATION,
          toggle: { checked },
        }
      : {
          categoryIndex,
          iconPath: new vscode.ThemeIcon(checked ? ACTIVE_ICON : icon),
          tooltip,
        };
  });
}

function buildLibraryButton(checked: boolean): LibraryButton {
  const tooltip = `Include libraries · ${INCLUDE_LIBRARIES_SHORTCUT}`;
  return utils.supportsQuickInputButtonToggle()
    ? {
        includeLibraries: true,
        iconPath: new vscode.ThemeIcon(LIBRARY_ICON),
        tooltip,
        location: INLINE_BUTTON_LOCATION,
        toggle: { checked },
      }
    : {
        includeLibraries: true,
        iconPath: new vscode.ThemeIcon(checked ? ACTIVE_ICON : LIBRARY_ICON),
        tooltip,
      };
}

function updateTitle(category?: Category, forceButtons = false): void {
  const control = quickPick.getControl();
  if (!control || fileScopeUri) {
    return;
  }
  const categories = quickPick.getCategories() || [];
  const showCategories =
    quickPick.getShouldUseItemsFilterPhrases() && categories.length > 0;
  const title = [
    "Search Everywhere",
    showCategories && category ? category.name : "",
    includeLibraries ? "including libraries" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  // loadItems runs on every keystroke; redrawing unchanged buttons there is wasted work.
  if (control.title === title && !forceButtons) {
    return;
  }
  control.title = title;
  control.buttons = [
    ...(showCategories ? buildCategoryButtons(category) : []),
    buildLibraryButton(includeLibraries),
  ];
}

function getIncludeLibraries(): boolean {
  return includeLibraries;
}

function toggleIncludeLibraries(): void {
  const control = quickPick.getControl();
  if (!control || fileScopeUri) {
    return;
  }
  includeLibraries = !includeLibraries;
  updateTitle(resolveFilterPhrase(control.value || "").category, true);
  quickPick.loadItems();
}

export function ensureUri(uri: any): vscode.Uri {
  if (uri instanceof vscode.Uri) {
    return uri;
  }
  if (typeof uri === "string") {
    try {
      return vscode.Uri.parse(uri);
    } catch {
      return vscode.Uri.file(uri);
    }
  }
  if (uri && typeof uri === "object") {
    if (uri.external) {
      try {
        return vscode.Uri.parse(uri.external);
      } catch {}
    }
    if (uri.scheme || uri.path) {
      try {
        return vscode.Uri.from({
          scheme: uri.scheme || "file",
          authority: uri.authority || "",
          path: uri.path || "",
          query: uri.query || "",
          fragment: uri.fragment || "",
        });
      } catch {
        return vscode.Uri.file(uri.path || uri.fsPath || "");
      }
    }
  }
  return vscode.Uri.file(String(uri));
}

async function openItem(
  qpItem: QuickPickItem,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active
): Promise<void> {
  if (qpItem.kind === vscode.QuickPickItemKind.Separator) {
    return;
  }
  itemAccepted = true;
  cancelPendingPreview();
  recentItems.addRecentItem(qpItem);
  const targetUri = ensureUri(qpItem.uri);
  const document = await vscode.workspace.openTextDocument(targetUri);
  const editor = await vscode.window.showTextDocument(document, viewColumn);
  selectQpItem(editor, qpItem);
}

function selectQpItem(editor: vscode.TextEditor, qpItem: QuickPickItem): void {
  if (qpItem.targetPosition) {
    const position = qpItem.targetPosition;
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
    return;
  }

  editor.selection = getSelectionForQpItem(
    qpItem,
    fetchShouldHighlightSymbol()
  );

  editor.revealRange(
    getRevealRange(qpItem),
    qpItem.namePosition
      ? vscode.TextEditorRevealType.InCenterIfOutsideViewport
      : vscode.TextEditorRevealType.Default
  );
}

// Beyond this many lines between the declaration start and the name, revealing both would
// keep the start in view and could push the name below the viewport.
const MAX_LEADING_LINES = 20;

function toPosition(position: { line: number; character: number }): vscode.Position {
  return new vscode.Position(position.line, position.character);
}

function getNavigationPosition(qpItem: QuickPickItem): vscode.Position {
  const position = qpItem.namePosition ?? qpItem.range?.start;
  return position ? toPosition(position) : new vscode.Position(0, 0);
}

function getRevealRange(qpItem: QuickPickItem): vscode.Range {
  const { range, namePosition } = qpItem;
  if (!namePosition) {
    return range as vscode.Range;
  }
  const name = toPosition(namePosition);
  if (!range || name.line - range.start.line > MAX_LEADING_LINES) {
    return new vscode.Range(name, name);
  }
  return new vscode.Range(toPosition(range.start), name);
}

const LINE_SUFFIX_REGEX = /^(.*?\S)\s*:(\d+)(?::(\d+))?$/;

export function parseLineSuffix(query: string): {
  query: string;
  position?: vscode.Position;
} {
  const match = query.match(LINE_SUFFIX_REGEX);
  if (!match) {
    return { query };
  }
  const line = Math.max(parseInt(match[2], 10) - 1, 0);
  const character = match[3] ? Math.max(parseInt(match[3], 10) - 1, 0) : 0;
  return { query: match[1], position: new vscode.Position(line, character) };
}

function withQueryOverrides(
  items: QuickPickItem[],
  targetPosition?: vscode.Position
): QuickPickItem[] {
  // Clone so cached database results are not mutated; alwaysShow keeps VS Code
  // from hiding items whose label does not contain the "@@" filter phrase, the
  // ":line" suffix, the "Class." qualifier, the words of a multi-word or "*" query, or the pieces of a
  // CamelHumps words query such as "uSerImp".
  return items.map((item) =>
    item.kind === vscode.QuickPickItemKind.Separator
      ? item
      : targetPosition
      ? { ...item, targetPosition, alwaysShow: true }
      : { ...item, alwaysShow: true }
  );
}

function getSelectionForQpItem(
  qpItem: QuickPickItem,
  shouldHighlightSymbol: boolean
): vscode.Selection {
  const { range } = qpItem;
  const start = new vscode.Position(range!.start.line, range!.start.character);
  const end = new vscode.Position(range!.end.line, range!.end.character);

  if (shouldHighlightSymbol) {
    return new vscode.Selection(start, end);
  }
  const caret = getNavigationPosition(qpItem);
  return new vscode.Selection(caret, caret);
}

function collectHelpItems(): QuickPickItem[] {
  const items: QuickPickItem[] = [];
  for (const category of quickPick.getCategories() || []) {
    items.push(getHelpItemForCategory(category));
  }
  if (quickPick.getHandOffPrefixes()) {
    items.push(
      getHelpItemForHandOff(">", "search VS Code commands"),
      getHelpItemForHandOff("%", "search text in files")
    );
  }
  const itemsFilterPhrases = quickPick.getItemsFilterPhrases();
  for (const kind in itemsFilterPhrases) {
    const filterPhrase = itemsFilterPhrases[kind];
    const item: QuickPickItem = getHelpItemForKind(kind, filterPhrase);
    items.push(item);
  }
  return items;
}

function getHelpItemForCategory(category: Category): QuickPickItem {
  return {
    label: `${quickPick.getHelpPhrase()} Type ${category.phrase} for limit results to ${category.name} only (Tab)`,
    symbolKind: category.kinds[0],
    filterPhrase: category.phrase,
    isHelp: true,
    uri: vscode.Uri.parse("#"),
  } as QuickPickItem;
}

function getHelpItemForHandOff(prefix: string, action: string): QuickPickItem {
  return {
    label: `${quickPick.getHelpPhrase()} Type ${prefix} to ${action}`,
    symbolKind: vscode.SymbolKind.File,
    filterPhrase: prefix,
    handOff: HAND_OFF_PREFIXES[prefix],
    isHelp: true,
    uri: vscode.Uri.parse("#"),
  } as QuickPickItem;
}

function getHelpItemForKind(
  symbolKind: string,
  itemFilterPhrase: string
): QuickPickItem {
  return {
    label: `${quickPick.getHelpPhrase()} Type ${itemFilterPhrase} for limit results to ${
      vscode.SymbolKind[parseInt(symbolKind)]
    } only`,
    symbolKind: Number(symbolKind),
    isHelp: true,
    uri: vscode.Uri.parse("#"),
  } as QuickPickItem;
}

function fetchConfig(): void {
  const shouldUseItemsFilterPhrases = fetchShouldUseItemsFilterPhrases();
  setShouldUseItemsFilterPhrases(shouldUseItemsFilterPhrases);

  const helpPhrase = fetchHelpPhrase();
  setHelpPhrase(helpPhrase);

  const itemsFilterPhrases = fetchItemsFilterPhrases();
  setItemsFilterPhrases(itemsFilterPhrases);

  setCategories(fetchCategories());
  setHandOffPrefixes(fetchHandOffPrefixes());

  const shouldItemsBeSorted = fetchShouldItemsBeSorted();
  setShouldItemsBeSorted(shouldItemsBeSorted);
  toggleKeepingSeparatorsVisibleOnFiltering();
}

function reloadSortingSettings() {
  const shouldItemsBeSorted = fetchShouldItemsBeSorted();
  setShouldItemsBeSorted(shouldItemsBeSorted);
  toggleKeepingSeparatorsVisibleOnFiltering();
}

function fetchHelpData(): void {
  const helpItems = collectHelpItems();
  setHelpItems(helpItems);
}

function handleDidChangeValueClearing() {
  const control = quickPick.getControl();
  control.items = [];
}

async function handleDidChangeValue(text: string): Promise<void> {
  const resolved = text !== lastSetText ? resolveHandOff(text) : undefined;
  if (resolved) {
    await handOff(resolved.target, resolved.prefix, resolved.rest);
    return;
  }
  shouldLoadHelpItems(text) ? quickPick.loadHelpItems() : quickPick.loadItems();
}

interface ResolvedHandOff {
  target: HandOffTarget;
  prefix: string;
  rest: string;
}

function resolveHandOff(text: string): ResolvedHandOff | undefined {
  const trimmed = text.trimStart();
  const prefix = trimmed.charAt(0);
  const target = HAND_OFF_PREFIXES[prefix];
  if (
    !target ||
    !quickPick.getHandOffPrefixes() ||
    shouldLoadHelpItems(text) ||
    resolveFilterPhrase(text).kinds
  ) {
    return undefined;
  }
  return { target, prefix, rest: trimmed.slice(1) };
}

let quickTextSearchSupport: Promise<boolean> | undefined;

function supportsQuickTextSearch(): Promise<boolean> {
  quickTextSearchSupport ??= Promise.resolve(
    vscode.commands.getCommands(true)
  ).then(
    (commands) => commands.includes(QUICK_TEXT_SEARCH_COMMAND),
    () => false
  );
  return quickTextSearchSupport;
}

async function handOff(
  target: HandOffTarget,
  prefix: string,
  rest: string
): Promise<void> {
  cancelPendingPreview();
  const editorToRestore =
    previewShown && !itemAccepted ? editorBeforeShow : undefined;
  handOffQuery = rest.trim();
  // The editor is restored here rather than in handleDidHide: restoring it after the
  // command ran would take focus from, and close, the quick open that the command shows.
  itemAccepted = true;
  quickPick.getControl().hide();
  await restoreEditorBeforeShow(editorToRestore);

  if (target === "text" && !(await quickPick.supportsQuickTextSearch())) {
    await vscode.commands.executeCommand(FIND_IN_FILES_COMMAND, {
      query: rest,
      triggerSearch: rest.length > 0,
    });
    return;
  }
  await vscode.commands.executeCommand(QUICK_OPEN_COMMAND, `${prefix}${rest}`);
}

function shouldLoadHelpItems(text: string): boolean {
  const helpPhrase = quickPick.getHelpPhrase();
  return (
    quickPick.getShouldUseItemsFilterPhrases() &&
    !!helpPhrase &&
    text === helpPhrase
  );
}

async function handleDidAccept() {
  const control = quickPick.getControl();
  const selectedItem = control.selectedItems[0];
  selectedItem && (await openSelected(selectedItem));
}

let fileScopeUri: string | undefined = undefined;
let savedWorkspaceSearchText: string = "";

function getFileScopeUri(): string | undefined {
  return fileScopeUri;
}

const PREVIEW_DELAY_MS = 150;

interface EditorState {
  uri: vscode.Uri;
  selection: vscode.Selection;
  viewColumn?: vscode.ViewColumn;
}

let isVisible = false;
let editorBeforeShow: EditorState | undefined;
let previewShown = false;
let itemAccepted = false;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let lastQuery = "";
// Set while a hand-off hides the quick pick: the query to remember, without its prefix.
let handOffQuery: string | undefined;

function getLastQuery(): string {
  return lastQuery;
}

function rememberActiveEditor(): void {
  const editor = vscode.window.activeTextEditor;
  editorBeforeShow = editor
    ? {
        uri: editor.document.uri,
        selection: editor.selection,
        viewColumn: editor.viewColumn,
      }
    : undefined;
  previewShown = false;
  itemAccepted = false;
}

function cancelPendingPreview(): void {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = undefined;
  }
}

function handleDidChangeActive(items: readonly QuickPickItem[]): void {
  cancelPendingPreview();
  const item = items[0];
  if (
    !fetchPreviewOnSelect() ||
    !item ||
    !item.uri ||
    item.isHelp ||
    item.kind === vscode.QuickPickItemKind.Separator
  ) {
    return;
  }
  previewTimer = setTimeout(() => {
    previewTimer = undefined;
    void quickPick.previewItem(item);
  }, PREVIEW_DELAY_MS);
}

function getPreviewPosition(qpItem: QuickPickItem): vscode.Position {
  if (qpItem.targetPosition) {
    return qpItem.targetPosition;
  }
  return getNavigationPosition(qpItem);
}

async function previewItem(qpItem: QuickPickItem): Promise<void> {
  if (!isVisible) {
    return;
  }
  const position = getPreviewPosition(qpItem);
  const range = new vscode.Range(position, position);
  try {
    const document = await vscode.workspace.openTextDocument(
      ensureUri(qpItem.uri)
    );
    if (!isVisible) {
      return;
    }
    const editor = await vscode.window.showTextDocument(document, {
      preview: true,
      preserveFocus: true,
      selection: range,
      viewColumn: editorBeforeShow?.viewColumn,
    });
    previewShown = true;
    editor.revealRange(
      range,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
  } catch {
    // The file may have been deleted or moved since it was indexed.
  }
}

async function restoreEditorBeforeShow(
  state: EditorState | undefined
): Promise<void> {
  if (!state) {
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(state.uri);
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: state.viewColumn,
      selection: state.selection,
    });
    editor.selection = state.selection;
    editor.revealRange(
      state.selection,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
  } catch {
    // The editor's document may have been closed and deleted meanwhile.
  }
}

function handleDidHide() {
  cancelPendingPreview();
  cancelLiveSymbols();
  const control = quickPick.getControl();
  lastQuery =
    handOffQuery ??
    (fileScopeUri ? savedWorkspaceSearchText : control?.value || "");
  handOffQuery = undefined;
  if (previewShown && !itemAccepted) {
    void restoreEditorBeforeShow(editorBeforeShow);
  }
  isVisible = false;
  includeLibraries = false;
  previewShown = false;
  itemAccepted = false;
  editorBeforeShow = undefined;

  quickPick.setText("");
  fileScopeUri = undefined;
  savedWorkspaceSearchText = "";
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
    await navigateIntoFile(qpItem);
    return;
  }
  if (iconId === COPY_ICON) {
    await copyReference(qpItem);
    return;
  }
  await quickPick.openItem(qpItem, vscode.ViewColumn.Beside);
}

async function handleDidTriggerButton(button: vscode.QuickInputButton) {
  if (button === vscode.QuickInputButtons.Back) {
    await navigateBack();
    return;
  }
  const categoryIndex = (button as CategoryButton).categoryIndex;
  if ((button as LibraryButton).includeLibraries) {
    toggleIncludeLibraries();
  } else if (typeof categoryIndex !== "number") {
    return;
  } else {
    const control = quickPick.getControl();
    const categories = quickPick.getCategories() || [];
    const { category } = resolveFilterPhrase(control?.value || "");
    const activeIndex = category ? categories.indexOf(category) : -1;
    if (categoryIndex === activeIndex) {
      // VS Code has already unchecked the toggle that was clicked.
      updateTitle(category, true);
    } else {
      selectCategory(categoryIndex);
    }
  }
  if (utils.supportsQuickInputButtonToggle()) {
    // A clicked inline toggle keeps keyboard focus, and the extension API cannot focus the
    // input; the list is the closest place where arrows, Enter and Alt+Arrow keys still work.
    void vscode.commands.executeCommand(FOCUS_QUICK_INPUT_COMMAND);
  }
}

const checkedSymbolUris = new Set<string>();

export function invalidateSymbolCache(uriStr?: string): void {
  if (uriStr) {
    checkedSymbolUris.delete(uriStr);
  } else {
    checkedSymbolUris.clear();
  }
}

async function ensureFileSymbolsIndexed(
  targetUri: vscode.Uri,
  forceRefresh: boolean = false
): Promise<boolean> {
  const uriStr = targetUri.toString();
  if (!forceRefresh && checkedSymbolUris.has(uriStr)) {
    return false;
  }

  const existing = database.search("", 1, { fileUri: uriStr });
  if (existing.length > 0 && !forceRefresh) {
    checkedSymbolUris.add(uriStr);
    return false;
  }

  checkedSymbolUris.add(uriStr);
  try {
    const symbols = await dataService.getSymbolsForUri(targetUri);
    if (symbols && symbols.length) {
      if (forceRefresh) {
        database.deleteByUri(uriStr);
      }
      const qpItems = dataConverter.convertUriAndSymbolsToQpItems(
        targetUri,
        symbols
      );
      database.insertSymbolsBatch(qpItems);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function navigateIntoFile(item?: QuickPickItem): Promise<void> {
  const control = quickPick.getControl();
  if (!control) {
    return;
  }
  const targetItem =
    item ||
    (control.activeItems && control.activeItems.length > 0
      ? control.activeItems[0]
      : undefined);
  if (
    !targetItem ||
    !targetItem.uri ||
    targetItem.kind === vscode.QuickPickItemKind.Separator
  ) {
    return;
  }

  if (!fileScopeUri) {
    savedWorkspaceSearchText = control.value || "";
  }

  fileScopeUri = targetItem.uri.toString();
  const filename = path.basename(targetItem.uri.fsPath);
  control.title = `Search in ${filename}`;
  control.placeholder = `Search symbols in ${filename}...`;
  control.buttons = [vscode.QuickInputButtons.Back];
  control.value = "";

  // Render items immediately from local database cache
  quickPick.loadItems();

  void vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereInFileScope",
    true
  );

  void ensureFileSymbolsIndexed(targetItem.uri, false).then((hasNewSymbols) => {
    if (hasNewSymbols && fileScopeUri === targetItem.uri.toString()) {
      quickPick.loadItems();
    }
  });
}

async function navigateBack(): Promise<void> {
  if (!fileScopeUri) {
    return;
  }

  const control = quickPick.getControl();
  if (!control) {
    return;
  }

  fileScopeUri = undefined;
  control.title = undefined;
  control.placeholder = undefined;
  control.buttons = [];
  control.value = savedWorkspaceSearchText;
  savedWorkspaceSearchText = "";

  quickPick.loadItems();

  void vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereInFileScope",
    false
  );
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
  fileScopeUri = targetUri.toString();
  savedWorkspaceSearchText = "";

  const control = quickPick.getControl();
  const filename = path.basename(targetUri.fsPath);
  control.title = `Search in ${filename}`;
  control.placeholder = `Search symbols in ${filename}...`;
  control.buttons = [vscode.QuickInputButtons.Back];
  control.value = "";

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
  quickPick.loadItems();

  void ensureFileSymbolsIndexed(targetUri, true).then((hasNewSymbols) => {
    if (hasNewSymbols && fileScopeUri === targetUri.toString()) {
      quickPick.loadItems();
    }
  });
}

async function openToTheSide(item?: QuickPickItem): Promise<void> {
  const control = quickPick.getControl();
  if (!control) {
    return;
  }
  const targetItem =
    item ||
    (control.activeItems && control.activeItems.length > 0
      ? control.activeItems[0]
      : undefined);
  if (
    !targetItem ||
    targetItem.kind === vscode.QuickPickItemKind.Separator
  ) {
    return;
  }
  await quickPick.openItem(targetItem, vscode.ViewColumn.Beside);
  control.hide();
}

async function copyReference(item?: QuickPickItem): Promise<void> {
  const targetItem = getCopyTarget(item);
  if (targetItem) {
    await copyToClipboard(() => getReference(targetItem));
  }
}

async function copyLocation(item?: QuickPickItem): Promise<void> {
  const targetItem = getCopyTarget(item);
  if (targetItem) {
    await copyToClipboard(async () => getLocation(targetItem));
  }
}

function getCopyTarget(item?: QuickPickItem): QuickPickItem | undefined {
  const control = quickPick.getControl();
  const targetItem =
    item || (control?.activeItems?.length ? control.activeItems[0] : undefined);
  if (
    !targetItem ||
    !targetItem.uri ||
    targetItem.isHelp ||
    targetItem.kind === vscode.QuickPickItemKind.Separator
  ) {
    return undefined;
  }
  return targetItem;
}

async function copyToClipboard(getText: () => Promise<string>): Promise<void> {
  try {
    const text = await getText();
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(`Copied ${text}`, COPIED_MESSAGE_TIMEOUT_MS);
  } catch (error) {
    vscode.window.showErrorMessage(`Search everywhere: Could not copy: ${error}`);
  }
}

function init(): void {
  const control = vscode.window.createQuickPick<QuickPickItem>();
  setControl(control);
  control.matchOnDetail = true;
  control.matchOnDescription = false;

  quickPick.fetchConfig();
  fetchHelpData();
  toggleKeepingSeparatorsVisibleOnFiltering();
  registerEventListeners();
}

function toggleKeepingSeparatorsVisibleOnFiltering() {
  const control = quickPick.getControl();

  if (control) {
    // Always preserve database relevance ranking; do not let VS Code sort alphabetically
    (control as any).sortByLabel = false;
  }
}

function registerEventListeners() {
  const control = quickPick.getControl();
  control.onDidHide(handleDidHide);
  control.onDidAccept(handleDidAccept);
  control.onDidChangeActive(handleDidChangeActive);
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
  return !!quickPick.getControl();
}

function show(): void {
  const control = quickPick.getControl();
  if (!isVisible) {
    rememberActiveEditor();
    isVisible = true;
    includeLibraries = false;
  }
  updateTitle(resolveFilterPhrase(control.value || "").category);
  control.show();
  vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereOpen",
    true
  );
}

function loadItems() {
  cancelLiveSymbols();
  if (!database.isReady()) {
    const fallbackItems = quickPick.getItems();
    if (fallbackItems && fallbackItems.length > 0) {
      quickPick.getShouldItemsBeSorted()
        ? loadSortedItemsFromResults(fallbackItems)
        : loadUnsortedItemsFromResults(fallbackItems);
    }
    const fallbackControl = quickPick.getControl();
    const fallbackFilter = resolveFilterPhrase(fallbackControl?.value || "");
    scheduleLiveSymbols(
      parseLineSuffix(fallbackFilter.rest).query,
      fallbackFilter.kinds,
      false
    );
    return;
  }

  const control = quickPick.getControl();
  const rawQuery = control.value || "";

  const filter = resolveFilterPhrase(rawQuery);
  const symbolKinds = filter.kinds;
  let cleanQuery = filter.rest;
  updateTitle(filter.category);

  const lineSuffix = parseLineSuffix(cleanQuery);
  cleanQuery = lineSuffix.query;

  if (
    !fileScopeUri &&
    cleanQuery === "" &&
    symbolKinds === undefined &&
    fetchShowRecentItemsOnEmptyQuery()
  ) {
    const recent = recentItems.getRecentItems(fetchRecentItemsLimit());
    if (recent.length > 0) {
      reinitQpItemsButton(recent);
      syncItemsFilterPhrases(recent);
      const separator: QuickPickItem = {
        label: "Recent",
        kind: vscode.QuickPickItemKind.Separator,
        symbolKind: vscode.QuickPickItemKind.Separator,
        uri: vscode.Uri.parse("#"),
      };
      loadUnsortedItemsFromResults([separator, ...recent]);
      return;
    }
  }

  const itemsFilter = fetchItemsFilter();

  // Query SQLite with clean search text, symbol kind, sorting and itemsFilter
  const searchResults = database.search(cleanQuery, VIRTUAL_PAGE_SIZE, {
    symbolKinds,
    sortByKind: quickPick.getShouldItemsBeSorted(),
    allowedKinds: itemsFilter.allowedKinds,
    ignoredKinds: itemsFilter.ignoredKinds,
    ignoredNames: itemsFilter.ignoredNames,
    fileUri: fileScopeUri,
    recent: fetchRankRecentItemsHigher()
      ? recentItems.getRecentKeys()
      : undefined,
  });
  const nameQuery = cleanQuery.includes("/")
    ? database.splitPathQuery(cleanQuery).leaf
    : cleanQuery;
  const needsOverrides =
    symbolKinds !== undefined ||
    !!lineSuffix.position ||
    !!database.parseQualifiedQuery(nameQuery) ||
    !!database.parsePatternQuery(cleanQuery) ||
    database.parseCamelHumpsQuery(cleanQuery)?.kind === "words";
  const dbResults = needsOverrides
    ? withQueryOverrides(searchResults, lineSuffix.position)
    : searchResults;
  reinitQpItemsButton(dbResults);
  syncItemsFilterPhrases(dbResults);

  quickPick.getShouldItemsBeSorted()
    ? loadSortedItemsFromResults(dbResults)
    : loadUnsortedItemsFromResults(dbResults);
  scheduleLiveSymbols(nameQuery, symbolKinds, dbResults.length > 0);
}

// isEmpty counts every row, so it is only asked when the search itself found nothing.
function isIndexIncomplete(hasIndexResults: boolean): boolean {
  return (
    !database.isReady() ||
    workspaceIndexer.isRebuilding() ||
    (!hasIndexResults && database.isEmpty())
  );
}

function setLiveSymbolsPending(pending: boolean): void {
  liveSymbolsPending = pending;
  const control = quickPick.getControl();
  if (control) {
    control.busy = indexBusy || pending;
  }
}

function cancelLiveSymbols(): void {
  liveSymbolsSequence++;
  if (liveSymbolsTimer) {
    clearTimeout(liveSymbolsTimer);
    liveSymbolsTimer = undefined;
  }
  liveSymbolsPending && setLiveSymbolsPending(false);
}

function scheduleLiveSymbols(
  cleanQuery: string,
  symbolKinds: number[] | undefined,
  hasIndexResults: boolean
): void {
  const query = cleanQuery.trim();
  if (fileScopeUri || query.length < MIN_LIVE_SYMBOLS_QUERY_LENGTH) {
    return;
  }
  const includeWorkspace =
    fetchSearchLanguageServersWhileIndexing() &&
    isIndexIncomplete(hasIndexResults);
  if (!includeWorkspace && !includeLibraries) {
    return;
  }

  const sequence = liveSymbolsSequence;
  setLiveSymbolsPending(true);
  liveSymbolsTimer = setTimeout(async () => {
    liveSymbolsTimer = undefined;
    const live = await liveSymbols.fetchLiveSymbols({
      query,
      includeWorkspace,
      includeLibraries,
      symbolKinds,
    });
    if (sequence !== liveSymbolsSequence || !isVisible) {
      return;
    }
    setLiveSymbolsPending(false);
    const control = quickPick.getControl();
    const merged = mergeLiveSymbols([...control.items], live);
    if (merged.length !== control.items.length) {
      showItemsKeepingActive(merged);
    }
  }, LIVE_SYMBOLS_DELAY_MS);
}

function isSameSymbol(indexItem: QuickPickItem, live: QuickPickItem): boolean {
  if (
    indexItem.symbolKind !== live.symbolKind ||
    indexItem.uri.toString() !== live.uri.toString() ||
    liveSymbols.getName(indexItem) !== liveSymbols.getName(live)
  ) {
    return false;
  }
  const line = live.range?.start.line ?? 0;
  const range = indexItem.range;
  return range ? range.start.line <= line && line <= range.end.line : true;
}

function liveSeparator(label: string): QuickPickItem {
  return {
    label,
    kind: vscode.QuickPickItemKind.Separator,
    symbolKind: vscode.QuickPickItemKind.Separator,
    uri: vscode.Uri.parse("#"),
  };
}

function mergeLiveSymbols(
  indexItems: QuickPickItem[],
  live: QuickPickItem[]
): QuickPickItem[] {
  const indexed = indexItems.filter(
    (item) => item.kind !== vscode.QuickPickItemKind.Separator
  );
  const fresh = live.filter(
    (item) => !indexed.some((indexItem) => isSameSymbol(indexItem, item))
  );
  // The providers match on their own terms; VS Code's label filter would hide fuzzy hits.
  fresh.forEach((item) => (item.alwaysShow = true));
  reinitQpItemsButton(fresh);

  const workspace = fresh.filter((item) => item.source === "live");
  const libraries = fresh.filter((item) => item.source === "library");
  return [
    ...indexItems,
    ...(workspace.length
      ? [liveSeparator(NOT_INDEXED_SEPARATOR), ...workspace]
      : []),
    ...(libraries.length
      ? [liveSeparator(LIBRARIES_SEPARATOR), ...libraries]
      : []),
  ];
}

function showItemsKeepingActive(items: QuickPickItem[]): void {
  const control = quickPick.getControl();
  const active = control.activeItems?.[0];
  const activeIdentity = active && database.itemIdentity(active);
  control.items = items;
  const restored =
    activeIdentity &&
    items.find(
      (item) =>
        item.kind !== vscode.QuickPickItemKind.Separator &&
        database.itemIdentity(item) === activeIdentity
    );
  if (restored) {
    control.activeItems = [restored];
  }
}

// Indexes built before categories stored a "[phrase name]" tag at the start of the description.
function syncItemsFilterPhrases(items: QuickPickItem[]): void {
  for (const item of items) {
    if (item.kind !== vscode.QuickPickItemKind.Separator) {
      item.description = item.description?.replace(/^\[[^\]]+\]\s*/, "");
    }
  }
}

function loadUnsortedItemsFromResults(results: QuickPickItem[]): void {
  const control = quickPick.getControl();
  control.items = results;
}

function loadSortedItemsFromResults(results: QuickPickItem[]): void {
  const control = quickPick.getControl();
  const items = [...results];
  items.sort((firstItem, secondItem) => {
    if (firstItem.symbolKind > secondItem.symbolKind) {
      return 1;
    }
    if (firstItem.symbolKind < secondItem.symbolKind) {
      return -1;
    }
    return 0;
  });

  const itemsWithSeparators = addSeparatorItemForEachSymbolKind(items);
  control.items = itemsWithSeparators;
}

function loadHelpItems() {
  cancelLiveSymbols();
  const control = quickPick.getControl();
  control.items = quickPick.getHelpItems();
}

function addSeparatorItemForEachSymbolKind(items: QuickPickItem[]) {
  const sortedItems = utils.groupBy(items, (item: QuickPickItem) =>
    item.symbolKind.toString()
  );
  const sortedItemsEntries = sortedItems.entries();

  for (const entry of sortedItemsEntries) {
    const symbolKind = parseInt(entry[0]);
    const items = entry[1];
    items.unshift({
      label: `${vscode.SymbolKind[symbolKind]}`,
      kind: vscode.QuickPickItemKind.Separator,
      symbolKind: vscode.QuickPickItemKind.Separator,
      uri: vscode.Uri.parse("#"),
    });
  }

  return Array.from(sortedItems.values()).flat();
}

function showLoading(value: boolean): void {
  indexBusy = value;
  const control = quickPick.getControl();
  control.busy = value || liveSymbolsPending;
}

// A value set by the extension, such as the editor selection or the restored last query,
// is searched even when it starts with a hand-off prefix; only typing one hands off.
let lastSetText: string | undefined;

function setText(text: string): void {
  const control = quickPick.getControl();
  lastSetText = text;
  control.value = text;
}

function setPlaceholder(isBusy: boolean): void {
  const control = quickPick.getControl();
  if (fileScopeUri) {
    const filename = path.basename(vscode.Uri.parse(fileScopeUri).fsPath);
    control.placeholder = `Search symbols in ${filename}...`;
    return;
  }
  const helpPhrase = quickPick.getHelpPhrase();
  control.placeholder = isBusy
    ? "Please wait, loading..."
    : quickPick.getShouldUseItemsFilterPhrases()
    ? `${
        helpPhrase
          ? `Type ${helpPhrase} for help or start typing file or symbol name...`
          : `Help phrase not set. Start typing file or symbol name...`
      }`
    : "Start typing file or symbol name...";
}

let control: vscode.QuickPick<QuickPickItem>;
let shouldUseItemsFilterPhrases: boolean;
let helpPhrase: string;
let shouldItemsBeSorted: boolean;
let itemsFilterPhrases: ItemsFilterPhrases;
let categories: Category[] = [];
let handOffPrefixes = false;
let helpItems: QuickPickItem[];
let onDidChangeValueEventListeners: vscode.Disposable[] = [];

function getControl() {
  return control;
}

function setControl(newControl: vscode.QuickPick<QuickPickItem>) {
  control = newControl;
}

let storedItems: QuickPickItem[] = [];

function getItems() {
  return storedItems;
}

function setItems(newItems: QuickPickItem[]): void {
  storedItems = newItems;
  reinitQpItemsButton(storedItems);
}

function shouldUseFileIconTheme(): boolean {
  return fetchUseFileIconTheme() && utils.supportsQuickPickFileIconTheme();
}

function applyItemIcon(item: QuickPickItem, useFileIconTheme: boolean): void {
  if (item.isHelp || typeof item.symbolKind !== "number") {
    return;
  }

  const isFile = item.symbolKind === vscode.SymbolKind.File;
  if (isFile && useFileIconTheme) {
    item.label = item.label.replace(ICON_PREFIX_REGEX, "");
    item.iconPath = vscode.ThemeIcon.File;
    item.resourceUri = ensureUri(item.uri);
    return;
  }

  if (isFile) {
    // Revert items decorated while the setting was on (e.g. reused or recent items).
    delete item.iconPath;
    delete item.resourceUri;
  }

  // Labels stored in the index keep the icon from indexing time, so rebuild the
  // prefix from the current icon map to pick up changed defaults without a reindex.
  const icons = dataConverter.getIcons();
  if (!icons) {
    return;
  }
  const icon = icons[item.symbolKind];
  const name = item.label.replace(ICON_PREFIX_REGEX, "");
  item.label = icon ? `$(${icon})  ${name}` : name;
}

function reinitQpItemsButton(data: QuickPickItem[]) {
  const useFileIconTheme = shouldUseFileIconTheme();
  data.forEach((item) => {
    if (item.kind !== vscode.QuickPickItemKind.Separator) {
      applyItemIcon(item, useFileIconTheme);
      const buttons: vscode.QuickInputButton[] = [];
      if (
        item.symbolKind === 0 &&
        !fileScopeUri &&
        item.source !== "library"
      ) {
        buttons.push({
          iconPath: new vscode.ThemeIcon("arrow-right"),
          tooltip: "Search symbols in this file",
        });
      }
      buttons.push({
        iconPath: new vscode.ThemeIcon("open-preview"),
        tooltip: "Open to the side",
      });
      buttons.push({
        iconPath: new vscode.ThemeIcon(COPY_ICON),
        tooltip: COPY_REFERENCE_TOOLTIP,
      });
      item.buttons = buttons;
    }
  });
}

function getShouldUseItemsFilterPhrases() {
  return shouldUseItemsFilterPhrases;
}

function setShouldUseItemsFilterPhrases(
  newShouldUseItemsFilterPhrases: boolean
) {
  shouldUseItemsFilterPhrases = newShouldUseItemsFilterPhrases;
}

function getHelpPhrase() {
  return helpPhrase;
}

function setHelpPhrase(newHelpPhrase: string) {
  helpPhrase = newHelpPhrase;
}

function getShouldItemsBeSorted() {
  return shouldItemsBeSorted;
}

function setShouldItemsBeSorted(newshouldItemsBeSorted: boolean) {
  shouldItemsBeSorted = newshouldItemsBeSorted;
}

function getItemsFilterPhrases() {
  return itemsFilterPhrases;
}

function setItemsFilterPhrases(newItemsFilterPhrases: ItemsFilterPhrases) {
  itemsFilterPhrases = newItemsFilterPhrases;
}

function getCategories() {
  return categories;
}

function setCategories(newCategories: Category[]) {
  categories = newCategories;
}

function getHandOffPrefixes() {
  return handOffPrefixes;
}

function setHandOffPrefixes(newHandOffPrefixes: boolean) {
  handOffPrefixes = newHandOffPrefixes;
}

function getHelpItems() {
  return helpItems;
}

function setHelpItems(newHelpItems: QuickPickItem[]) {
  helpItems = newHelpItems;
}

function getOnDidChangeValueEventListeners() {
  return onDidChangeValueEventListeners;
}

function setOnDidChangeValueEventListeners(
  newOnDidChangeValueEventListeners: vscode.Disposable[]
) {
  onDidChangeValueEventListeners = newOnDidChangeValueEventListeners;
}

export const quickPick = {
  getControl,
  getItems,
  setItems,
  getShouldUseItemsFilterPhrases,
  getHelpPhrase,
  getShouldItemsBeSorted,
  toggleKeepingSeparatorsVisibleOnFiltering,
  getItemsFilterPhrases,
  getCategories,
  getHandOffPrefixes,
  supportsQuickTextSearch,
  getHelpItems,
  getOnDidChangeValueEventListeners,
  setOnDidChangeValueEventListeners,
  init,
  reloadOnDidChangeValueEventListener,
  reloadSortingSettings,
  reload,
  isInitialized,
  show,
  loadItems,
  loadHelpItems,
  showLoading,
  setText,
  setPlaceholder,
  fetchConfig,
  openItem,
  handleDidChangeValueClearing,
  handleDidChangeValue,
  handleDidAccept,
  handleDidHide,
  handleDidChangeActive,
  previewItem,
  getLastQuery,
  handleDidTriggerItemButton,
  handleDidTriggerButton,
  navigateIntoFile,
  navigateBack,
  searchCurrentFile,
  openToTheSide,
  copyReference,
  copyLocation,
  getFileScopeUri,
  resolveFilterPhrase,
  cycleCategory,
  selectCategory,
  buildCategoryButtons,
  buildLibraryButton,
  updateTitle,
  toggleIncludeLibraries,
  getIncludeLibraries,
  disposeOnDidChangeValueEventListeners,
  invalidateSymbolCache,
  mergeLiveSymbols,
};
