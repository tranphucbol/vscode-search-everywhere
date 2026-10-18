import * as vscode from "vscode";
import { database } from "../../database";
import { lifecycle } from "../../indexing/lifecycle";
import { fetchSearchLanguageServersWhileIndexing } from "../../platform/settings/config";
import { QuickPickItem } from "../../shared/types";
import { liveSymbols } from "../../symbols/liveSymbols";
import { itemDecoration } from "./itemDecoration";
import { quickPickState, session } from "../state";

const LIVE_SYMBOLS_DELAY_MS = 200;
const MIN_LIVE_SYMBOLS_QUERY_LENGTH = 2;
const NOT_INDEXED_SEPARATOR = "Not indexed yet";
const LIBRARIES_SEPARATOR = "Libraries";

let liveSymbolsSequence = 0;
let liveSymbolsTimer: ReturnType<typeof setTimeout> | undefined;
let liveSymbolsPending = false;
let indexBusy = false;

// isEmpty counts every row, so it is only asked when the search itself found nothing.
function isIndexIncomplete(hasIndexResults: boolean): boolean {
  return (
    !database.isReady() ||
    lifecycle.isRebuilding() ||
    (!hasIndexResults && database.isEmpty())
  );
}

function setLiveSymbolsPending(pending: boolean): void {
  liveSymbolsPending = pending;
  const control = quickPickState.getControl();
  if (control) {
    control.busy = indexBusy || pending;
  }
}

function showLoading(value: boolean): void {
  indexBusy = value;
  const control = quickPickState.getControl();
  control.busy = value || liveSymbolsPending;
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
  if (session.fileScopeUri || query.length < MIN_LIVE_SYMBOLS_QUERY_LENGTH) {
    return;
  }
  const includeWorkspace =
    fetchSearchLanguageServersWhileIndexing() &&
    isIndexIncomplete(hasIndexResults);
  if (!includeWorkspace && !session.includeLibraries) {
    return;
  }

  const sequence = liveSymbolsSequence;
  setLiveSymbolsPending(true);
  liveSymbolsTimer = setTimeout(async () => {
    liveSymbolsTimer = undefined;
    const live = await liveSymbols.fetchLiveSymbols({
      query,
      includeWorkspace,
      includeLibraries: session.includeLibraries,
      symbolKinds,
    });
    if (sequence !== liveSymbolsSequence || !session.isVisible) {
      return;
    }
    setLiveSymbolsPending(false);
    const control = quickPickState.getControl();
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
  itemDecoration.reinitQpItemsButton(fresh);

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
  const control = quickPickState.getControl();
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

export const liveResults = {
  showLoading,
  cancelLiveSymbols,
  scheduleLiveSymbols,
  mergeLiveSymbols,
};
