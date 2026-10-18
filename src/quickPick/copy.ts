import * as vscode from "vscode";
import { QuickPickItem } from "../shared/types";
import { getLocation, getReference } from "../symbols/reference";
import { quickPickState } from "./state";

export const COPY_ICON = "copy";
export const COPY_REFERENCE_TOOLTIP = `Copy reference · ${
  process.platform === "darwin" ? "⌥⇧⌘C" : "Ctrl+Alt+Shift+C"
}`;
const COPIED_MESSAGE_TIMEOUT_MS = 3000;

async function copyReference(item?: QuickPickItem): Promise<void> {
  const targetItem = getCopyTarget(item);
  if (targetItem) {
    await copyToClipboard(() => getReference(targetItem));
  }
}

async function copyLocation(item?: QuickPickItem): Promise<void> {
  const targetItem = getCopyTarget(item);
  if (targetItem) {
    await copyToClipboard(async () => getLocation(targetItem));
  }
}

function getCopyTarget(item?: QuickPickItem): QuickPickItem | undefined {
  const control = quickPickState.getControl();
  const targetItem =
    item || (control?.activeItems?.length ? control.activeItems[0] : undefined);
  if (
    !targetItem ||
    !targetItem.uri ||
    targetItem.isHelp ||
    targetItem.kind === vscode.QuickPickItemKind.Separator
  ) {
    return undefined;
  }
  return targetItem;
}

async function copyToClipboard(getText: () => Promise<string>): Promise<void> {
  try {
    const text = await getText();
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(`Copied ${text}`, COPIED_MESSAGE_TIMEOUT_MS);
  } catch (error) {
    vscode.window.showErrorMessage(`Search everywhere: Could not copy: ${error}`);
  }
}

export const copy = {
  copyReference,
  copyLocation,
};
