import * as path from "path";
import * as vscode from "vscode";
import {
  fetchCategories,
  fetchHelpPhrase,
  fetchItemsFilter,
  fetchItemsFilterPhrases,
  fetchPreviewOnSelect,
  fetchRankRecentItemsHigher,
  fetchRecentItemsLimit,
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
import { recentItems } from "./recentItems";
import { Category, ItemsFilterPhrases, QuickPickItem } from "./types";
import { utils } from "./utils";
const debounce = utils.debounce;

const VIRTUAL_PAGE_SIZE = 500;
const ICON_PREFIX_REGEX = /^\$\([^)]+\)\s+/;

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

  const { category, kinds, rest } = resolveFilterPhrase(control.value || "");
  const query = kinds ? rest : (control.value || "").trim();
  const positions = categories.length + 1;
  const current = category ? categories.indexOf(category) + 1 : 0;
  const next = (current + direction + positions) % positions;
  const phrase = next === 0 ? "" : categories[next - 1].phrase;

  control.value = `${phrase}${query}`;
  quickPick.loadItems();
}

function updateTitle(category?: Category): void {
  const control = quickPick.getControl();
  if (!control || fileScopeUri) {
    return;
  }
  const categories = quickPick.getCategories() || [];
  if (!quickPick.getShouldUseItemsFilterPhrases() || !categories.length) {
    control.title = undefined;
    return;
  }
  const names = [
    category ? "All" : "[All]",
    ...categories.map((item) =>
      item === category ? `[${item.name}]` : item.name
    ),
  ];
  control.title = `${names.join(" · ")}   (Tab)`;
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
    qpItem.range as vscode.Range,
    vscode.TextEditorRevealType.Default
  );
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

  return shouldHighlightSymbol
    ? new vscode.Selection(start, end)
    : new vscode.Selection(start, start);
}

function collectHelpItems(): QuickPickItem[] {
  const items: QuickPickItem[] = [];
  for (const category of quickPick.getCategories() || []) {
    items.push(getHelpItemForCategory(category));
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

function handleDidChangeValue(text: string) {
  shouldLoadHelpItems(text) ? quickPick.loadHelpItems() : quickPick.loadItems();
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
  const start = qpItem.range?.start;
  return start
    ? new vscode.Position(start.line, start.character)
    : new vscode.Position(0, 0);
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
  const control = quickPick.getControl();
  lastQuery = fileScopeUri ? savedWorkspaceSearchText : control?.value || "";
  if (previewShown && !itemAccepted) {
    void restoreEditorBeforeShow(editorBeforeShow);
  }
  isVisible = false;
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
  await quickPick.openItem(qpItem, vscode.ViewColumn.Beside);
}

async function handleDidTriggerButton(button: vscode.QuickInputButton) {
  if (button === vscode.QuickInputButtons.Back) {
    await navigateBack();
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
  if (!database.isReady()) {
    const fallbackItems = quickPick.getItems();
    if (fallbackItems && fallbackItems.length > 0) {
      quickPick.getShouldItemsBeSorted()
        ? loadSortedItemsFromResults(fallbackItems)
        : loadUnsortedItemsFromResults(fallbackItems);
    }
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
  const control = quickPick.getControl();
  control.busy = value;
}

function setText(text: string): void {
  const control = quickPick.getControl();
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
      if (item.symbolKind === 0 && !fileScopeUri) {
        buttons.push({
          iconPath: new vscode.ThemeIcon("arrow-right"),
          tooltip: "Search symbols in this file",
        });
      }
      buttons.push({
        iconPath: new vscode.ThemeIcon("open-preview"),
        tooltip: "Open to the side",
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
  getFileScopeUri,
  resolveFilterPhrase,
  cycleCategory,
  updateTitle,
  disposeOnDidChangeValueEventListeners,
  invalidateSymbolCache,
};
