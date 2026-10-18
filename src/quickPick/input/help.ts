import * as vscode from "vscode";
import { Category, QuickPickItem } from "../../shared/types";
import { HAND_OFF_PREFIXES } from "./query";
import { quickPickState } from "../state";

function collectHelpItems(): QuickPickItem[] {
  const items: QuickPickItem[] = [];
  for (const category of quickPickState.getCategories() || []) {
    items.push(getHelpItemForCategory(category));
  }
  if (quickPickState.getHandOffPrefixes()) {
    items.push(
      getHelpItemForHandOff(">", "search VS Code commands"),
      getHelpItemForHandOff("%", "search text in files")
    );
  }
  const itemsFilterPhrases = quickPickState.getItemsFilterPhrases();
  for (const kind in itemsFilterPhrases) {
    const filterPhrase = itemsFilterPhrases[kind];
    const item: QuickPickItem = getHelpItemForKind(kind, filterPhrase);
    items.push(item);
  }
  return items;
}

function getHelpItemForCategory(category: Category): QuickPickItem {
  return {
    label: `${quickPickState.getHelpPhrase()} Type ${category.phrase} for limit results to ${category.name} only (Tab)`,
    symbolKind: category.kinds[0],
    filterPhrase: category.phrase,
    isHelp: true,
    uri: vscode.Uri.parse("#"),
  } as QuickPickItem;
}

function getHelpItemForHandOff(prefix: string, action: string): QuickPickItem {
  return {
    label: `${quickPickState.getHelpPhrase()} Type ${prefix} to ${action}`,
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
    label: `${quickPickState.getHelpPhrase()} Type ${itemFilterPhrase} for limit results to ${
      vscode.SymbolKind[parseInt(symbolKind)]
    } only`,
    symbolKind: Number(symbolKind),
    isHelp: true,
    uri: vscode.Uri.parse("#"),
  } as QuickPickItem;
}

export const help = {
  collectHelpItems,
};
