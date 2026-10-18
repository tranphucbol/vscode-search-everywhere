import * as vscode from "vscode";
import { ItemsFilter } from "../shared/types";

let currentItemsFilter: ItemsFilter = {};

function setItemsFilter(newItemsFilter: ItemsFilter) {
  currentItemsFilter = newItemsFilter;
}

function getItemsFilter() {
  return currentItemsFilter;
}

function isUriValid(uri: vscode.Uri): boolean {
  return isItemValid(0, uri.path.split("/").pop());
}

function isSymbolValid(symbol: vscode.DocumentSymbol): boolean {
  return isItemValid(symbol.kind, symbol.name);
}

function isItemValid(kind: number, name: string | undefined): boolean {
  const filter = itemsFilter.getItemsFilter();
  return (
    itemsFilter.isKindAllowed(kind, filter) &&
    !itemsFilter.isNameIgnored(name || "", filter)
  );
}

// Mirrors database.search: a filter phrase's kinds replace allowedKinds.
function isKindAllowed(
  kind: number,
  filter: ItemsFilter,
  symbolKinds?: number[]
): boolean {
  if (symbolKinds && symbolKinds.length) {
    if (!symbolKinds.includes(kind)) {
      return false;
    }
  } else if (
    filter.allowedKinds &&
    filter.allowedKinds.length &&
    !filter.allowedKinds.includes(kind)
  ) {
    return false;
  }
  return !(filter.ignoredKinds || []).includes(kind);
}

function isNameIgnored(name: string, filter: ItemsFilter): boolean {
  const lowerName = name.toLowerCase();
  return (filter.ignoredNames || []).some(
    (ignored) => !!ignored && lowerName.includes(ignored.toLowerCase())
  );
}

export const itemsFilter = {
  getItemsFilter,
  setItemsFilter,
  isUriValid,
  isSymbolValid,
  isKindAllowed,
  isNameIgnored,
};
