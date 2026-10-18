import * as vscode from "vscode";
import { fetchPreviewOnSelect } from "../../platform/config";
import { ensureUri } from "../../shared/paths";
import { QuickPickItem } from "../../shared/types";
import { getNavigationPosition } from "./positions";
import { session } from "../state";

const PREVIEW_DELAY_MS = 150;

interface EditorState {
  uri: vscode.Uri;
  selection: vscode.Selection;
  viewColumn?: vscode.ViewColumn;
}

let editorBeforeShow: EditorState | undefined;
let previewShown = false;
let itemAccepted = false;
let previewTimer: ReturnType<typeof setTimeout> | undefined;

function rememberActiveEditor(): void {
  const editor = vscode.window.activeTextEditor;
  editorBeforeShow = editor
    ? {
        uri: editor.document.uri,
        selection: editor.selection,
        viewColumn: editor.viewColumn,
      }
    : undefined;
  previewShown = false;
  itemAccepted = false;
}

function markItemAccepted(): void {
  itemAccepted = true;
}

// The editor a preview replaced, when the quick pick is closing without opening an item.
function getEditorToRestore(): EditorState | undefined {
  return previewShown && !itemAccepted ? editorBeforeShow : undefined;
}

function reset(): void {
  previewShown = false;
  itemAccepted = false;
  editorBeforeShow = undefined;
}

function cancelPendingPreview(): void {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = undefined;
  }
}

function handleDidChangeActive(items: readonly QuickPickItem[]): void {
  cancelPendingPreview();
  const item = items[0];
  if (
    !fetchPreviewOnSelect() ||
    !item ||
    !item.uri ||
    item.isHelp ||
    item.kind === vscode.QuickPickItemKind.Separator
  ) {
    return;
  }
  previewTimer = setTimeout(() => {
    previewTimer = undefined;
    void preview.previewItem(item);
  }, PREVIEW_DELAY_MS);
}

function getPreviewPosition(qpItem: QuickPickItem): vscode.Position {
  if (qpItem.targetPosition) {
    return qpItem.targetPosition;
  }
  return getNavigationPosition(qpItem);
}

async function previewItem(qpItem: QuickPickItem): Promise<void> {
  if (!session.isVisible) {
    return;
  }
  const position = getPreviewPosition(qpItem);
  const range = new vscode.Range(position, position);
  try {
    const document = await vscode.workspace.openTextDocument(
      ensureUri(qpItem.uri)
    );
    if (!session.isVisible) {
      return;
    }
    const editor = await vscode.window.showTextDocument(document, {
      preview: true,
      preserveFocus: true,
      selection: range,
      viewColumn: editorBeforeShow?.viewColumn,
    });
    previewShown = true;
    editor.revealRange(
      range,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
  } catch {
    // The file may have been deleted or moved since it was indexed.
  }
}

async function restoreEditor(state: EditorState | undefined): Promise<void> {
  if (!state) {
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(state.uri);
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: state.viewColumn,
      selection: state.selection,
    });
    editor.selection = state.selection;
    editor.revealRange(
      state.selection,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
  } catch {
    // The editor's document may have been closed and deleted meanwhile.
  }
}

export const preview = {
  rememberActiveEditor,
  markItemAccepted,
  getEditorToRestore,
  reset,
  cancelPendingPreview,
  handleDidChangeActive,
  previewItem,
  restoreEditor,
};
