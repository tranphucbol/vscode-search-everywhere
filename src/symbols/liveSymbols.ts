import * as vscode from "vscode";
import { fetchItemsFilter } from "../platform/config";
import { dataConverter } from "./dataConverter";
import { logger } from "../platform/logger";
import { patternProvider } from "../platform/patternProvider";
import { itemsFilter } from "./itemsFilter";
import { QuickPickItem } from "../shared/types";

export interface LiveSymbolsQuery {
  query: string;
  includeWorkspace: boolean;
  includeLibraries: boolean;
  symbolKinds?: number[];
}

export const LIVE_SYMBOLS_TIMEOUT_MS = 3000;
export const LIVE_SYMBOLS_LIMIT = 200;
const LIBRARY_SUFFIX = " · library";
const ICON_PREFIX_REGEX = /^\$\([^)]+\)\s+/;

let timeoutLogged = false;

function classify(uri: vscode.Uri): "live" | "library" {
  if (uri.scheme !== "file" || !vscode.workspace.getWorkspaceFolder(uri)) {
    return "library";
  }
  return patternProvider.isIncluded(vscode.workspace.asRelativePath(uri, false))
    ? "live"
    : "library";
}

async function fetchLiveSymbols(
  request: LiveSymbolsQuery
): Promise<QuickPickItem[]> {
  const symbols = await executeWithTimeout(request.query);
  if (!symbols) {
    return [];
  }

  const filter = fetchItemsFilter();
  const items: QuickPickItem[] = [];
  for (const symbol of symbols) {
    if (!symbol || !symbol.location || !symbol.location.uri) {
      continue;
    }
    if (!itemsFilter.isKindAllowed(symbol.kind, filter, request.symbolKinds)) {
      continue;
    }
    const source = liveSymbols.classify(symbol.location.uri);
    if (source === "live" ? !request.includeWorkspace : !request.includeLibraries) {
      continue;
    }
    const item = dataConverter.mapSymbolInformationToQpItem(symbol);
    if (itemsFilter.isNameIgnored(getName(item), filter)) {
      continue;
    }
    item.source = source;
    if (source === "library") {
      item.description = `${item.description || ""}${LIBRARY_SUFFIX}`;
    }
    items.push(item);
  }

  return rank(items, request.query).slice(0, LIVE_SYMBOLS_LIMIT);
}

async function executeWithTimeout(
  query: string
): Promise<vscode.SymbolInformation[] | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), LIVE_SYMBOLS_TIMEOUT_MS);
  });
  const request = Promise.resolve(
    vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      "vscode.executeWorkspaceSymbolProvider",
      query
    )
  ).then(
    (symbols) => symbols || [],
    (error) => {
      logger.log(`Workspace symbol providers failed: ${error}`);
      return [] as vscode.SymbolInformation[];
    }
  );

  const symbols = await Promise.race([request, timeout]);
  timer && clearTimeout(timer);
  if (!symbols && !timeoutLogged) {
    timeoutLogged = true;
    logger.log(
      "Workspace symbol providers did not answer within 3 s; showing indexed results only."
    );
  }
  return symbols;
}

function getName(item: QuickPickItem): string {
  return item.label.replace(ICON_PREFIX_REGEX, "");
}

function rank(items: QuickPickItem[], query: string): QuickPickItem[] {
  const lowerQuery = query.trim().toLowerCase();
  const tier = (item: QuickPickItem) => {
    const name = getName(item).toLowerCase();
    return name === lowerQuery ? 0 : name.startsWith(lowerQuery) ? 1 : 2;
  };
  // Array.prototype.sort is stable, so each tier keeps the providers' order.
  return items
    .map((item) => ({ item, tier: tier(item) }))
    .sort((a, b) => a.tier - b.tier)
    .map(({ item }) => item);
}

function resetTimeoutLog(): void {
  timeoutLogged = false;
}

export const liveSymbols = {
  classify,
  fetchLiveSymbols,
  getName,
  resetTimeoutLog,
};

export { fetchLiveSymbols };
