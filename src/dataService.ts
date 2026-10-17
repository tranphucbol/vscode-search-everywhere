import * as vscode from "vscode";
import { fetchIndexNamesOnly, fetchItemsFilter } from "./config";
import { dataConverter } from "./dataConverter";
import { onDidItemIndexedEventEmitter } from "./dataServiceEventsEmitter";
import { logger } from "./logger";
import { patternProvider } from "./patternProvider";
import { Item, ItemsFilter, QuickPickItem, WorkspaceData } from "./types";
import { matchesGlob, utils } from "./utils";

const CONTAINER_SEPARATOR = ".";

async function fetchUris(): Promise<vscode.Uri[]> {
  const includePatterns = patternProvider.getIncludePatterns();
  const excludePatterns = await patternProvider.getExcludePatterns();
  try {
    return await vscode.workspace.findFiles(includePatterns, excludePatterns);
  } catch (error) {
    utils.printErrorMessage(error as Error);
    return Promise.resolve([]);
  }
}

async function getUrisOrFetchIfEmpty(
  uris?: vscode.Uri[]
): Promise<vscode.Uri[]> {
  return uris && uris.length ? uris : await dataService.fetchUris();
}

const WARMUP_POLL_MS = 500;
const WARMUP_TIMEOUT_MS = 15_000;
// jdtls imports the Maven/Gradle build before it answers; 15 s is not enough on a cold start.
const SLOW_WARMUP_TIMEOUT_MS = 120_000;
const SLOW_LANGUAGES = new Set(["java", "kt"]);
const SCRIPT_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx"]);
const LANGUAGE_NAMES: { [language: string]: string } = {
  typescript: "TypeScript",
  go: "Go",
  java: "Java",
  kt: "Kotlin",
  py: "Python",
  cs: "C#",
  rs: "Rust",
};

const readyLanguages = new Set<string>();

function getLanguage(uri: vscode.Uri): string | undefined {
  const fileName = uri.path.split("/").pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return undefined;
  }
  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  return SCRIPT_EXTENSIONS.has(extension) ? "typescript" : extension;
}

function getLanguageName(language: string): string {
  return LANGUAGE_NAMES[language] || `.${language}`;
}

function isWarmupSample(uri: vscode.Uri): boolean {
  const path = uri.path.toLowerCase();
  return (
    !isNonSymbolFile(uri) &&
    !isNamesOnly(uri) &&
    !path.endsWith(".d.ts") &&
    !path.includes("test") &&
    !path.includes("fixtures")
  );
}

function pickWarmupSamples(uris: vscode.Uri[]): Map<string, vscode.Uri> {
  const urisByLanguage = new Map<string, vscode.Uri[]>();
  for (const uri of uris) {
    const language = getLanguage(uri);
    if (!language || readyLanguages.has(language) || !isWarmupSample(uri)) {
      continue;
    }
    const languageUris = urisByLanguage.get(language) || [];
    languageUris.push(uri);
    urisByLanguage.set(language, languageUris);
  }

  const samples = new Map<string, vscode.Uri>();
  urisByLanguage.forEach((languageUris, language) =>
    samples.set(language, languageUris[Math.floor(languageUris.length / 2)])
  );
  return samples;
}

async function warmupLanguageServers(
  uris: vscode.Uri[],
  progress?: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>
): Promise<Set<string>> {
  const timedOut = new Set<string>();
  if (uris.length <= 1) {
    return timedOut;
  }

  const samples = pickWarmupSamples(uris);
  await Promise.all(
    Array.from(samples.entries()).map(async ([language, sampleUri]) => {
      const isReady = await warmupLanguageServer(language, sampleUri, progress);
      isReady ? readyLanguages.add(language) : timedOut.add(language);
    })
  );

  timedOut.size &&
    logger.log(
      `Language servers not ready after warm-up: ${Array.from(timedOut)
        .map(getLanguageName)
        .join(", ")}`
    );
  return timedOut;
}

async function warmupLanguageServer(
  language: string,
  sampleUri: vscode.Uri,
  progress?: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>
): Promise<boolean> {
  const languageName = getLanguageName(language);
  const timeoutMs = SLOW_LANGUAGES.has(language)
    ? SLOW_WARMUP_TIMEOUT_MS
    : WARMUP_TIMEOUT_MS;
  const maxAttempts = Math.ceil(timeoutMs / WARMUP_POLL_MS);
  const startedAt = Date.now();

  logger.log(`Waiting for the ${languageName} language server: ${sampleUri.path}`);
  try {
    await vscode.workspace.openTextDocument(sampleUri);
  } catch (e) {
    logger.log(`Failed to open sample document ${sampleUri.path}: ${e}`);
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const elapsedMs = Date.now() - startedAt;
    if (dataService.getIsCancelled() || elapsedMs >= timeoutMs) {
      break;
    }

    progress?.report({
      message: `Waiting for the ${languageName} language server (${Math.round(
        elapsedMs / 1000
      )} s)…`,
    });

    const rawSymbols = await loadAllSymbolsForUri(sampleUri);
    if (rawSymbols && rawSymbols.length > 0) {
      logger.log(
        `The ${languageName} language server is ready after ${elapsedMs} ms.`
      );
      return true;
    }

    await utils.sleep(WARMUP_POLL_MS);
  }

  logger.log(
    `The ${languageName} language server returned no symbols within ${
      timeoutMs / 1000
    } s.`
  );
  return false;
}

async function includeSymbols(
  workspaceData: WorkspaceData,
  uris: vscode.Uri[],
  progress?: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>,
  onBatch?: (items: QuickPickItem[]) => void
): Promise<void> {
  if (!uris.length || dataService.getIsCancelled()) {
    return;
  }

  const timedOutLanguages = await warmupLanguageServers(uris, progress);
  const urisToRetry: vscode.Uri[] = [];

  const CONCURRENCY = 20;
  let currentIndex = 0;

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, uris.length) },
    async () => {
      while (currentIndex < uris.length) {
        if (dataService.getIsCancelled()) {
          break;
        }
        const i = currentIndex++;
        const uri = uris[i];

        const symbolsForUri = await tryToGetSymbolsForUri(uri);
        if (
          !symbolsForUri?.length &&
          timedOutLanguages.has(getLanguage(uri) || "") &&
          !isNonSymbolFile(uri) &&
          !isNamesOnly(uri)
        ) {
          urisToRetry.push(uri);
        }
        if (onBatch) {
          const qpItems = dataConverter.convertUriAndSymbolsToQpItems(
            uri,
            symbolsForUri
          );
          onBatch(qpItems);
          workspaceData.items.set(uri.path, { uri, elements: [] });
          workspaceData.count += qpItems.length;
        } else {
          addSymbolsForUriToWorkspaceData(workspaceData, uri, symbolsForUri);
        }
        onDidItemIndexedEventEmitter.fire(uris.length);
      }
    }
  );

  await Promise.all(workers);

  if (dataService.getIsCancelled()) {
    utils.clearWorkspaceData(workspaceData);
  } else if (urisToRetry.length) {
    workspaceData.urisToRetry = urisToRetry;
  }
}

const NON_SYMBOL_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "ico", "svg", "bmp", "webp",
  "woff", "woff2", "ttf", "eot", "otf",
  "zip", "tar", "gz", "map", "lock", "pdf", "exe", "dll",
  "mp3", "mp4", "wav", "avi"
]);

function isNonSymbolFile(uri: vscode.Uri): boolean {
  const ext = uri.path.split(".").pop()?.toLowerCase();
  return !!ext && NON_SYMBOL_EXTENSIONS.has(ext);
}

function isNamesOnly(uri: vscode.Uri): boolean {
  return matchesGlob(utils.normalizeUriPath(uri.path), fetchIndexNamesOnly());
}

async function tryToGetSymbolsForUri(
  uri: vscode.Uri
): Promise<vscode.DocumentSymbol[] | undefined> {
  if (isNonSymbolFile(uri) || isNamesOnly(uri)) {
    return undefined;
  }

  try {
    return await dataService.getSymbolsForUri(uri);
  } catch (error) {
    logger.log(`Could not get symbols for ${uri.path}: ${error}`);
    return undefined;
  }
}

function addSymbolsForUriToWorkspaceData(
  workspaceData: WorkspaceData,
  uri: vscode.Uri,
  symbolsForUri: vscode.DocumentSymbol[] | undefined
) {
  symbolsForUri &&
    symbolsForUri.length &&
    workspaceData.items.set(uri.path, {
      uri,
      elements: symbolsForUri,
    });

  workspaceData.count += symbolsForUri ? symbolsForUri.length : 0;
}

function includeUris(workspaceData: WorkspaceData, uris: vscode.Uri[]): void {
  const validUris = filterUris(uris);
  for (let i = 0; i < validUris.length; i++) {
    const uri = validUris[i];
    if (dataService.getIsCancelled()) {
      utils.clearWorkspaceData(workspaceData);
      break;
    }
    addUriToWorkspaceData(workspaceData, uri);
  }
}

function addUriToWorkspaceData(workspaceData: WorkspaceData, uri: vscode.Uri) {
  const item = workspaceData.items.get(uri.path);
  if (item) {
    !ifUriExistsInArray(item.elements, uri) &&
      addUriToExistingArrayOfElements(workspaceData, uri, item);
  } else {
    createItemWithArrayOfElementsForUri(workspaceData, uri);
  }
}

function addUriToExistingArrayOfElements(
  workspaceData: WorkspaceData,
  uri: vscode.Uri,
  item: Item
) {
  item.elements.push(uri);
  workspaceData.count++;
}

function createItemWithArrayOfElementsForUri(
  workspaceData: WorkspaceData,
  uri: vscode.Uri
) {
  workspaceData.items.set(uri.path, {
    uri,
    elements: [uri],
  });
  workspaceData.count++;
}

function ifUriExistsInArray(
  array: Array<vscode.Uri | vscode.DocumentSymbol>,
  uri: vscode.Uri
) {
  return array.some((uriInArray: vscode.Uri | vscode.DocumentSymbol) => {
    if (!("range" in uriInArray || "kind" in uriInArray)) {
      const uriElement = uriInArray as vscode.Uri;
      return uriElement.path === uri.path;
    }
    return false;
  });
}

async function getSymbolsForUri(
  uri: vscode.Uri
): Promise<vscode.DocumentSymbol[] | undefined> {
  const allSymbols = await loadAllSymbolsForUri(uri);
  const symbols = allSymbols
    ? reduceAndFlatSymbolsArrayForUri(allSymbols)
    : undefined;
  return symbols ? filterSymbols(symbols) : undefined;
}

async function loadAllSymbolsForUri(
  uri: vscode.Uri
): Promise<vscode.DocumentSymbol[] | undefined> {
  try {
    return await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      uri
    );
  } catch (error) {
    logger.log(`Could not load symbols for ${uri.path}: ${error}`);
    return undefined;
  }
}

function reduceAndFlatSymbolsArrayForUri(
  symbols: vscode.DocumentSymbol[],
  parentName?: string
): vscode.DocumentSymbol[] {
  const flatArrayOfSymbols: vscode.DocumentSymbol[] = [];

  symbols.forEach((symbol: vscode.DocumentSymbol) => {
    prepareSymbolNameIfHasParent(symbol, parentName);
    flatArrayOfSymbols.push(symbol);

    if (hasSymbolChildren(symbol)) {
      flatArrayOfSymbols.push(
        ...reduceAndFlatSymbolsArrayForUri(symbol.children, symbol.name)
      );
    }
    if (symbol.children) {
      symbol.children = [];
    }
  });

  return flatArrayOfSymbols;
}

function prepareSymbolNameIfHasParent(
  symbol: vscode.DocumentSymbol,
  parentName?: string
) {
  const splitter = utils.getSplitter();
  if (parentName) {
    parentName = parentName.split(splitter).join(CONTAINER_SEPARATOR);
    symbol.name = `${parentName}${splitter}${symbol.name}`;
  }
}

function hasSymbolChildren(symbol: vscode.DocumentSymbol): boolean {
  return symbol.children && symbol.children.length ? true : false;
}

function filterUris(uris: vscode.Uri[]): vscode.Uri[] {
  return uris.filter((uri) => isUriValid(uri));
}

function filterSymbols(
  symbols: vscode.DocumentSymbol[]
): vscode.DocumentSymbol[] {
  return symbols.filter((symbol) => isSymbolValid(symbol));
}

function isUriValid(uri: vscode.Uri): boolean {
  return isItemValid(uri);
}

function isSymbolValid(symbol: vscode.DocumentSymbol): boolean {
  return isItemValid(symbol);
}

function isItemValid(item: vscode.Uri | vscode.DocumentSymbol): boolean {
  let symbolKind: number;
  let name: string | undefined;
  const isUri = !("kind" in item);

  if (isUri) {
    symbolKind = 0;
    name = (item as vscode.Uri).path.split("/").pop();
  } else {
    const documentSymbol = item as vscode.DocumentSymbol;
    symbolKind = documentSymbol.kind;
    name = documentSymbol.name;
  }

  const itemsFilter = dataService.getItemsFilter();

  return (
    isInAllowedKinds(itemsFilter, symbolKind) &&
    isNotInIgnoredKinds(itemsFilter, symbolKind) &&
    isNotInIgnoredNames(itemsFilter, name)
  );
}

function isInAllowedKinds(
  itemsFilter: ItemsFilter,
  symbolKind: number
): boolean {
  return (
    !(itemsFilter.allowedKinds && itemsFilter.allowedKinds.length) ||
    itemsFilter.allowedKinds.includes(symbolKind)
  );
}

function isNotInIgnoredKinds(
  itemsFilter: ItemsFilter,
  symbolKind: number
): boolean {
  return (
    !(itemsFilter.ignoredKinds && itemsFilter.ignoredKinds.length) ||
    !itemsFilter.ignoredKinds.includes(symbolKind)
  );
}

function isNotInIgnoredNames(
  itemsFilter: ItemsFilter,
  name: string | undefined
): boolean {
  return (
    !(itemsFilter.ignoredNames && itemsFilter.ignoredNames.length) ||
    !itemsFilter.ignoredNames.some(
      (ignoreEl) =>
        ignoreEl && name && name.toLowerCase().includes(ignoreEl.toLowerCase())
    )
  );
}

async function fetchData(
  uris?: vscode.Uri[],
  progress?: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>,
  onBatch?: (items: QuickPickItem[]) => void
): Promise<WorkspaceData> {
  const workspaceData: WorkspaceData = utils.createWorkspaceData();
  const uriItems = await getUrisOrFetchIfEmpty(uris);

  await includeSymbols(workspaceData, uriItems, progress, onBatch);
  if (!onBatch) {
    includeUris(workspaceData, uriItems);
  }

  dataService.setIsCancelled(false);

  return workspaceData;
}

async function isUriExistingInWorkspace(uri: vscode.Uri): Promise<boolean> {
  return !!vscode.workspace.getWorkspaceFolder(uri);
}

async function fetchConfig() {
  const itemsFilter = fetchItemsFilter();
  setItemsFilter(itemsFilter);
  await patternProvider.fetchConfig();
}

function reload() {
  dataService.fetchConfig();
}

function cancel() {
  dataService.setIsCancelled(true);
}

function setIsCancelled(value: boolean) {
  isCancelled = value;
}

function getIsCancelled() {
  return isCancelled;
}

function resetLanguageWarmup() {
  readyLanguages.clear();
}

function setItemsFilter(newItemsFilter: ItemsFilter) {
  itemsFilter = newItemsFilter;
}

function getItemsFilter() {
  return itemsFilter;
}

let isCancelled = false;
let itemsFilter: ItemsFilter = {};

export const dataService = {
  setIsCancelled,
  getIsCancelled,
  getItemsFilter,
  fetchConfig,
  reload,
  cancel,
  fetchData,
  isUriExistingInWorkspace,
  fetchUris,
  getSymbolsForUri,
  resetLanguageWarmup,
};
