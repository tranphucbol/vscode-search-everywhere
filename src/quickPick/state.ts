import * as vscode from "vscode";
import { Category, ItemsFilterPhrases, QuickPickItem } from "../shared/types";

export const session = {
  isVisible: false,
  includeLibraries: false,
  fileScopeUri: undefined as string | undefined,
  savedWorkspaceSearchText: "",
  // Set while a hand-off hides the quick pick: the query to remember, without its prefix.
  handOffQuery: undefined as string | undefined,
  // A value set by the extension, such as the editor selection or the restored last query,
  // is searched even when it starts with a hand-off prefix; only typing one hands off.
  lastSetText: undefined as string | undefined,
};

let control: vscode.QuickPick<QuickPickItem>;
let shouldUseItemsFilterPhrases: boolean;
let helpPhrase: string;
let shouldItemsBeSorted: boolean;
let itemsFilterPhrases: ItemsFilterPhrases;
let categories: Category[] = [];
let handOffPrefixes = false;
let helpItems: QuickPickItem[];
let storedItems: QuickPickItem[] = [];
let onDidChangeValueEventListeners: vscode.Disposable[] = [];

function getControl() {
  return control;
}

function setControl(newControl: vscode.QuickPick<QuickPickItem>) {
  control = newControl;
}

function getItems() {
  return storedItems;
}

function setStoredItems(newItems: QuickPickItem[]) {
  storedItems = newItems;
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

export const quickPickState = {
  getControl,
  setControl,
  getItems,
  setStoredItems,
  getShouldUseItemsFilterPhrases,
  setShouldUseItemsFilterPhrases,
  getHelpPhrase,
  setHelpPhrase,
  getShouldItemsBeSorted,
  setShouldItemsBeSorted,
  getItemsFilterPhrases,
  setItemsFilterPhrases,
  getCategories,
  setCategories,
  getHandOffPrefixes,
  setHandOffPrefixes,
  getHelpItems,
  setHelpItems,
  getOnDidChangeValueEventListeners,
  setOnDidChangeValueEventListeners,
};
