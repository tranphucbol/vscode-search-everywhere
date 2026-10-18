import * as path from "path";
import * as vscode from "vscode";
import { database } from "../../database";
import { QuickPickItem } from "../../shared/types";
import { dataConverter } from "../../symbols/items/dataConverter";
import { documentSymbols } from "../../symbols/scan/documentSymbols";
import { itemLoader } from "../view/itemLoader";
import { quickPickState, session } from "../state";

const checkedSymbolUris = new Set<string>();

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
    const symbols = await documentSymbols.getSymbolsForUri(targetUri);
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

function showFileScope(
  control: vscode.QuickPick<QuickPickItem>,
  uri: vscode.Uri
): void {
  session.fileScopeUri = uri.toString();
  const filename = path.basename(uri.fsPath);
  control.title = `Search in ${filename}`;
  control.placeholder = `Search symbols in ${filename}...`;
  control.buttons = [vscode.QuickInputButtons.Back];
  control.value = "";
}

function reloadWhenSymbolsIndexed(uri: vscode.Uri, forceRefresh: boolean) {
  void ensureFileSymbolsIndexed(uri, forceRefresh).then((hasNewSymbols) => {
    if (hasNewSymbols && session.fileScopeUri === uri.toString()) {
      itemLoader.loadItems();
    }
  });
}

async function navigateIntoFile(item?: QuickPickItem): Promise<void> {
  const control = quickPickState.getControl();
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

  if (!session.fileScopeUri) {
    session.savedWorkspaceSearchText = control.value || "";
  }

  showFileScope(control, targetItem.uri);
  itemLoader.loadItems();

  void vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereInFileScope",
    true
  );

  reloadWhenSymbolsIndexed(targetItem.uri, false);
}

async function navigateBack(): Promise<void> {
  if (!session.fileScopeUri) {
    return;
  }

  const control = quickPickState.getControl();
  if (!control) {
    return;
  }

  session.fileScopeUri = undefined;
  control.title = undefined;
  control.placeholder = undefined;
  control.buttons = [];
  control.value = session.savedWorkspaceSearchText;
  session.savedWorkspaceSearchText = "";

  itemLoader.loadItems();

  void vscode.commands.executeCommand(
    "setContext",
    "searchEverywhereInFileScope",
    false
  );
}

export const fileScope = {
  showFileScope,
  reloadWhenSymbolsIndexed,
  navigateIntoFile,
  navigateBack,
};
