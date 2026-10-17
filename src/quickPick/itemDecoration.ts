import * as vscode from "vscode";
import { fetchUseFileIconTheme } from "../platform/config";
import { ensureUri } from "../shared/paths";
import { QuickPickItem } from "../shared/types";
import { vscodeVersion } from "../shared/vscodeVersion";
import { dataConverter } from "../symbols/dataConverter";
import { COPY_ICON, COPY_REFERENCE_TOOLTIP } from "./copy";
import { session } from "./state";

const ICON_PREFIX_REGEX = /^\$\([^)]+\)\s+/;

function shouldUseFileIconTheme(): boolean {
  return fetchUseFileIconTheme() && vscodeVersion.supportsQuickPickFileIconTheme();
}

function applyItemIcon(item: QuickPickItem, useFileIconTheme: boolean): void {
  if (item.isHelp || typeof item.symbolKind !== "number") {
    return;
  }

  const isFile = item.symbolKind === vscode.SymbolKind.File;
  if (isFile && useFileIconTheme) {
    item.label = item.label.replace(ICON_PREFIX_REGEX, "");
    item.iconPath = vscode.ThemeIcon.File;
    item.resourceUri = ensureUri(item.uri);
    return;
  }

  if (isFile) {
    // Revert items decorated while the setting was on (e.g. reused or recent items).
    delete item.iconPath;
    delete item.resourceUri;
  }

  // Labels stored in the index keep the icon from indexing time, so rebuild the
  // prefix from the current icon map to pick up changed defaults without a reindex.
  const icons = dataConverter.getIcons();
  if (!icons) {
    return;
  }
  const icon = icons[item.symbolKind];
  const name = item.label.replace(ICON_PREFIX_REGEX, "");
  item.label = icon ? `$(${icon})  ${name}` : name;
}

function reinitQpItemsButton(data: QuickPickItem[]) {
  const useFileIconTheme = shouldUseFileIconTheme();
  data.forEach((item) => {
    if (item.kind !== vscode.QuickPickItemKind.Separator) {
      applyItemIcon(item, useFileIconTheme);
      const buttons: vscode.QuickInputButton[] = [];
      if (
        item.symbolKind === 0 &&
        !session.fileScopeUri &&
        item.source !== "library"
      ) {
        buttons.push({
          iconPath: new vscode.ThemeIcon("arrow-right"),
          tooltip: "Search symbols in this file",
        });
      }
      buttons.push({
        iconPath: new vscode.ThemeIcon("open-preview"),
        tooltip: "Open to the side",
      });
      buttons.push({
        iconPath: new vscode.ThemeIcon(COPY_ICON),
        tooltip: COPY_REFERENCE_TOOLTIP,
      });
      item.buttons = buttons;
    }
  });
}

// Indexes built before categories stored a "[phrase name]" tag at the start of the description.
function syncItemsFilterPhrases(items: QuickPickItem[]): void {
  for (const item of items) {
    if (item.kind !== vscode.QuickPickItemKind.Separator) {
      item.description = item.description?.replace(/^\[[^\]]+\]\s*/, "");
    }
  }
}

export const itemDecoration = {
  reinitQpItemsButton,
  syncItemsFilterPhrases,
};
