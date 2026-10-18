import * as vscode from "vscode";
import { database } from "../database";
import {
  fetchItemsFilter,
  fetchRankRecentItemsHigher,
  fetchRecentItemsLimit,
  fetchShowRecentItemsOnEmptyQuery,
} from "../platform/config";
import { collections } from "../shared/collections";
import { QuickPickItem } from "../shared/types";
import { itemDecoration } from "./itemDecoration";
import { liveResults } from "./liveResults";
import { parseLineSuffix, query } from "./query";
import { recentItems } from "./recentItems";
import { quickPickState, session } from "./state";
import { title } from "./title";

const VIRTUAL_PAGE_SIZE = 500;

function loadItems() {
  liveResults.cancelLiveSymbols();
  if (!database.isReady()) {
    const fallbackItems = quickPickState.getItems();
    if (fallbackItems && fallbackItems.length > 0) {
      quickPickState.getShouldItemsBeSorted()
        ? loadSortedItemsFromResults(fallbackItems)
        : loadUnsortedItemsFromResults(fallbackItems);
    }
    const fallbackControl = quickPickState.getControl();
    const fallbackFilter = query.resolveFilterPhrase(
      fallbackControl?.value || ""
    );
    liveResults.scheduleLiveSymbols(
      parseLineSuffix(fallbackFilter.rest).query,
      fallbackFilter.kinds,
      false
    );
    return;
  }

  const control = quickPickState.getControl();
  const rawQuery = control.value || "";

  const filter = query.resolveFilterPhrase(rawQuery);
  const symbolKinds = filter.kinds;
  let cleanQuery = filter.rest;
  title.updateTitle(filter.category);

  const lineSuffix = parseLineSuffix(cleanQuery);
  cleanQuery = lineSuffix.query;

  if (
    !session.fileScopeUri &&
    cleanQuery === "" &&
    symbolKinds === undefined &&
    fetchShowRecentItemsOnEmptyQuery()
  ) {
    const recent = recentItems.getRecentItems(fetchRecentItemsLimit());
    if (recent.length > 0) {
      itemDecoration.reinitQpItemsButton(recent);
      itemDecoration.syncItemsFilterPhrases(recent);
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

  const searchResults = database.search(cleanQuery, VIRTUAL_PAGE_SIZE, {
    symbolKinds,
    sortByKind: quickPickState.getShouldItemsBeSorted(),
    allowedKinds: itemsFilter.allowedKinds,
    ignoredKinds: itemsFilter.ignoredKinds,
    ignoredNames: itemsFilter.ignoredNames,
    fileUri: session.fileScopeUri,
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
    ? query.withQueryOverrides(searchResults, lineSuffix.position)
    : searchResults;
  itemDecoration.reinitQpItemsButton(dbResults);
  itemDecoration.syncItemsFilterPhrases(dbResults);

  quickPickState.getShouldItemsBeSorted()
    ? loadSortedItemsFromResults(dbResults)
    : loadUnsortedItemsFromResults(dbResults);
  liveResults.scheduleLiveSymbols(nameQuery, symbolKinds, dbResults.length > 0);
}

function loadUnsortedItemsFromResults(results: QuickPickItem[]): void {
  const control = quickPickState.getControl();
  control.items = results;
}

function loadSortedItemsFromResults(results: QuickPickItem[]): void {
  const control = quickPickState.getControl();
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

function addSeparatorItemForEachSymbolKind(items: QuickPickItem[]) {
  const sortedItems = collections.groupBy(items, (item: QuickPickItem) =>
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

function loadHelpItems() {
  liveResults.cancelLiveSymbols();
  const control = quickPickState.getControl();
  control.items = quickPickState.getHelpItems();
}

function setItems(newItems: QuickPickItem[]): void {
  quickPickState.setStoredItems(newItems);
  itemDecoration.reinitQpItemsButton(newItems);
}

export const itemLoader = {
  loadItems,
  loadHelpItems,
  setItems,
};
