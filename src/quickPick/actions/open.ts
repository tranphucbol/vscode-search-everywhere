import * as vscode from "vscode";
import { fetchShouldHighlightSymbol } from "../../platform/settings/config";
import { ensureUri } from "../../shared/paths";
import { QuickPickItem } from "../../shared/types";
import { handOff } from "../input/handOff";
import { itemLoader } from "../view/itemLoader";
import {
  getRevealRange,
  getSelectionForQpItem,
  getTargetSelection,
} from "../editor/positions";
import { preview } from "../editor/preview";
import { query } from "../input/query";
import { recentItems } from "../view/recentItems";
import { quickPickState } from "../state";

async function openItem(
  qpItem: QuickPickItem,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active
): Promise<void> {
  if (qpItem.kind === vscode.QuickPickItemKind.Separator) {
    return;
  }
  preview.markItemAccepted();
  preview.cancelPendingPreview();
  recentItems.addRecentItem(qpItem);
  const targetUri = ensureUri(qpItem.uri);
  const document = await vscode.workspace.openTextDocument(targetUri);
  const editor = await vscode.window.showTextDocument(document, viewColumn);
  selectQpItem(editor, qpItem);
}

function selectQpItem(editor: vscode.TextEditor, qpItem: QuickPickItem): void {
  const targetSelection = getTargetSelection(editor.document, qpItem);
  if (targetSelection) {
    editor.selection = targetSelection;
    editor.revealRange(
      targetSelection,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
    return;
  }

  editor.selection = getSelectionForQpItem(
    qpItem,
    fetchShouldHighlightSymbol()
  );

  editor.revealRange(
    getRevealRange(qpItem),
    qpItem.namePosition
      ? vscode.TextEditorRevealType.InCenterIfOutsideViewport
      : vscode.TextEditorRevealType.Default
  );
}

async function openSelected(qpItem: QuickPickItem): Promise<void> {
  if (qpItem.kind === vscode.QuickPickItemKind.Separator) {
    return;
  }
  if (qpItem.handOff && qpItem.filterPhrase) {
    await handOff.start(qpItem.handOff, qpItem.filterPhrase, "");
    return;
  }
  shouldLoadItemsForFilterPhrase(qpItem)
    ? loadItemsForFilterPhrase(qpItem)
    : await opener.openItem(qpItem);
}

function shouldLoadItemsForFilterPhrase(qpItem: QuickPickItem): boolean {
  return quickPickState.getShouldUseItemsFilterPhrases() && !!qpItem.isHelp;
}

function loadItemsForFilterPhrase(qpItem: QuickPickItem): void {
  const filterPhrase =
    qpItem.filterPhrase ??
    quickPickState.getItemsFilterPhrases()[qpItem.symbolKind];
  query.setText(filterPhrase);
  itemLoader.loadItems();
}

async function openToTheSide(item?: QuickPickItem): Promise<void> {
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
    targetItem.kind === vscode.QuickPickItemKind.Separator
  ) {
    return;
  }
  await opener.openItem(targetItem, vscode.ViewColumn.Beside);
  control.hide();
}

export const opener = {
  openItem,
  openSelected,
  openToTheSide,
};
