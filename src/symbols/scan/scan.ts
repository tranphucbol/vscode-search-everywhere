import * as vscode from "vscode";
import { fetchItemsFilter } from "../../platform/settings/config";
import { dataConverter } from "../items/dataConverter";
import { documentSymbols } from "./documentSymbols";
import { FileState } from "../../database";
import { files } from "./files";
import { itemsFilter } from "../items/itemsFilter";
import { onDidItemIndexedEventEmitter } from "../../shared/events";
import { logger } from "../../platform/logger";
import { patternProvider } from "../../platform/settings/patternProvider";
import { Item, QuickPickItem, WorkspaceData } from "../../shared/types";
import { warmup } from "./warmup";

export type OnBatch = (items: QuickPickItem[], fileState?: [string, FileState]) => void;

async function getUrisOrFetchIfEmpty(
  uris?: vscode.Uri[]
): Promise<vscode.Uri[]> {
  return uris && uris.length ? uris : await files.fetchUris();
}

async function includeSymbols(
  workspaceData: WorkspaceData,
  uris: vscode.Uri[],
  progress?: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>,
  onBatch?: OnBatch
): Promise<void> {
  if (!uris.length || scan.getIsCancelled()) {
    return;
  }

  const timedOutLanguages = await warmup.warmupLanguageServers(
    uris,
    scan.getIsCancelled,
    progress
  );
  const urisToRetry: vscode.Uri[] = [];

  const CONCURRENCY = 20;
  let currentIndex = 0;

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, uris.length) },
    async () => {
      while (currentIndex < uris.length) {
        if (scan.getIsCancelled()) {
          break;
        }
        const i = currentIndex++;
        const uri = uris[i];

        const [symbolsForUri, fileState] = await Promise.all([
          tryToGetSymbolsForUri(uri),
          files.statUri(uri),
        ]);
        if (
          !symbolsForUri?.length &&
          timedOutLanguages.has(warmup.getLanguage(uri) || "") &&
          !files.isNonSymbolFile(uri) &&
          !files.isNamesOnly(uri)
        ) {
          urisToRetry.push(uri);
        }
        if (onBatch) {
          const qpItems = dataConverter.convertUriAndSymbolsToQpItems(
            uri,
            symbolsForUri
          );
          onBatch(qpItems, fileState && [uri.toString(), fileState]);
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

  if (scan.getIsCancelled()) {
    scan.clearWorkspaceData(workspaceData);
  } else if (urisToRetry.length) {
    workspaceData.urisToRetry = urisToRetry;
  }
}

async function tryToGetSymbolsForUri(
  uri: vscode.Uri
): Promise<vscode.DocumentSymbol[] | undefined> {
  if (files.isNonSymbolFile(uri) || files.isNamesOnly(uri)) {
    return undefined;
  }

  try {
    return await documentSymbols.getSymbolsForUri(uri);
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
  const validUris = files.filterUris(uris);
  for (let i = 0; i < validUris.length; i++) {
    const uri = validUris[i];
    if (scan.getIsCancelled()) {
      scan.clearWorkspaceData(workspaceData);
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

async function fetchData(
  uris?: vscode.Uri[],
  progress?: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>,
  onBatch?: OnBatch
): Promise<WorkspaceData> {
  const workspaceData: WorkspaceData = scan.createWorkspaceData();
  const uriItems = await getUrisOrFetchIfEmpty(uris);

  await includeSymbols(workspaceData, uriItems, progress, onBatch);
  if (!onBatch) {
    includeUris(workspaceData, uriItems);
  }

  scan.setIsCancelled(false);

  return workspaceData;
}

async function fetchConfig() {
  itemsFilter.setItemsFilter(fetchItemsFilter());
  await patternProvider.fetchConfig();
}

function reload() {
  scan.fetchConfig();
}

function cancel() {
  scan.setIsCancelled(true);
}

function setIsCancelled(value: boolean) {
  isCancelled = value;
}

function getIsCancelled() {
  return isCancelled;
}

let isCancelled = false;

function createWorkspaceData(): WorkspaceData {
  return {
    items: new Map<string, Item>(),
    count: 0,
  };
}

function clearWorkspaceData(workspaceData: WorkspaceData) {
  workspaceData.items.clear();
  workspaceData.count = 0;
}

export const scan = {
  createWorkspaceData,
  clearWorkspaceData,
  setIsCancelled,
  getIsCancelled,
  fetchConfig,
  reload,
  cancel,
  fetchData,
};
