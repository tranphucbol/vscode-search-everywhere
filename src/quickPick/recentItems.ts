import * as vscode from "vscode";
import { getRecentItems as getStoredRecentItems, updateRecentItems, clearRecentItems as clearStoredRecentItems } from "../platform/cache";
import { dataConverter } from "../symbols/dataConverter";
import { extractName, RecentKey } from "../database";
import { QuickPickItem } from "../shared/types";
import { pathUtils } from "../shared/paths";

export interface StoredRecentItem {
  uri: string;
  symbolKind: number;
  label: string;
  detail?: string;
  description?: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  namePosition?: { line: number; character: number };
}

const MAX_STORED_ITEMS = 50;
export const RECENT_BOOST_LIMIT = 100;

function getItemKey(
  uri: string,
  symbolKind: number,
  line: number,
  character: number,
  label: string
): string {
  // Labels may or may not carry a "$(icon)  " prefix depending on icon settings.
  return `${uri}#${symbolKind}#${line}#${character}#${extractName(label)}`;
}

export function addRecentItem(item: QuickPickItem): void {
  if (
    !item ||
    item.isHelp ||
    item.kind === vscode.QuickPickItemKind.Separator ||
    !item.uri
  ) {
    return;
  }

  const uriStr = item.uri.toString();
  const startLine = item.range?.start?.line ?? 0;
  const startChar = item.range?.start?.character ?? 0;
  const key = getItemKey(
    uriStr,
    item.symbolKind,
    startLine,
    startChar,
    item.label
  );

  const stored = getStoredRecentItems<StoredRecentItem>();
  const filtered = stored.filter(
    (it) =>
      getItemKey(
        it.uri,
        it.symbolKind,
        it.range?.start?.line ?? 0,
        it.range?.start?.character ?? 0,
        it.label
      ) !== key
  );

  const newItem: StoredRecentItem = {
    uri: uriStr,
    symbolKind: item.symbolKind,
    label: item.label,
    detail: item.detail,
    description: item.description,
    range: item.range
      ? {
          start: {
            line: item.range.start.line,
            character: item.range.start.character,
          },
          end: {
            line: item.range.end.line,
            character: item.range.end.character,
          },
        }
      : undefined,
  };
  if (item.namePosition) {
    newItem.namePosition = {
      line: item.namePosition.line,
      character: item.namePosition.character,
    };
  }

  filtered.unshift(newItem);
  if (filtered.length > MAX_STORED_ITEMS) {
    filtered.length = MAX_STORED_ITEMS;
  }

  updateRecentItems(filtered);
}

export function getRecentItems(limit: number = 10): QuickPickItem[] {
  const result: QuickPickItem[] = [];
  const seenKeys = new Set<string>();

  const stored = getStoredRecentItems<StoredRecentItem>();
  for (const it of stored) {
    if (result.length >= limit) {
      break;
    }
    try {
      const uri = vscode.Uri.parse(it.uri);
      const startLine = it.range?.start?.line ?? 0;
      const startChar = it.range?.start?.character ?? 0;
      const key = getItemKey(
        it.uri,
        it.symbolKind,
        startLine,
        startChar,
        it.label
      );
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const item: QuickPickItem = {
          label: it.label,
          description: it.description,
          detail: it.detail,
          uri,
          symbolKind: it.symbolKind,
          range: it.range
            ? {
                start: new vscode.Position(
                  it.range.start.line,
                  it.range.start.character
                ),
                end: new vscode.Position(
                  it.range.end.line,
                  it.range.end.character
                ),
              }
            : undefined,
        };
        if (it.namePosition) {
          item.namePosition = new vscode.Position(
            it.namePosition.line,
            it.namePosition.character
          );
        }
        result.push(item);
      }
    } catch {}
  }

  // Supplement ONLY with physically open editor tabs (no background LS documents)
  if (result.length < limit) {
    const openUris = getOpenEditorUris();

    for (const uri of openUris) {
      if (result.length >= limit) {
        break;
      }
      const uriStr = uri.toString();
      const fileKey = getItemKey(uriStr, 0, 0, 0, pathUtils.getNameFromUri(uri));
      if (!seenKeys.has(fileKey)) {
        seenKeys.add(fileKey);
        try {
          const item = dataConverter.mapUriToQpItem(uri);
          result.push(item);
        } catch {}
      }
    }
  }

  return result;
}

// Only physically open editor tabs, no background language server documents.
function getOpenEditorUris(): vscode.Uri[] {
  const openUris: vscode.Uri[] = [];
  const isDocumentUri = (u: any): boolean => {
    if (!(u instanceof vscode.Uri)) {
      return false;
    }
    return !["output", "debug", "vscode-terminal", "git", "walkThrough"].includes(u.scheme);
  };

  // tabGroups needs VS Code >= 1.67; older hosts only expose the visible editors.
  const tabGroups = (vscode.window as any).tabGroups;
  if (tabGroups && Array.isArray(tabGroups.all)) {
    for (const group of tabGroups.all) {
      if (group && Array.isArray(group.tabs)) {
        for (const tab of group.tabs) {
          const inputUri = (tab?.input as any)?.uri;
          if (isDocumentUri(inputUri)) {
            openUris.push(inputUri);
          }
        }
      }
    }
  } else if (vscode.window.visibleTextEditors) {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor?.document?.uri && isDocumentUri(editor.document.uri)) {
        openUris.push(editor.document.uri);
      }
    }
  }
  return openUris;
}

// Stored history first (most recent first), then open editor tabs as files.
export function getRecentKeys(limit: number = RECENT_BOOST_LIMIT): RecentKey[] {
  const keys: RecentKey[] = [];
  const seen = new Set<string>();
  const add = (key: RecentKey) => {
    const id = `${key.uri}#${key.symbolKind}#${key.name}`;
    if (keys.length < limit && !seen.has(id)) {
      seen.add(id);
      keys.push(key);
    }
  };

  for (const it of getStoredRecentItems<StoredRecentItem>()) {
    if (keys.length >= limit) {
      return keys;
    }
    add({ uri: it.uri, symbolKind: it.symbolKind, name: extractName(it.label) });
  }
  for (const uri of getOpenEditorUris()) {
    if (keys.length >= limit) {
      break;
    }
    add({ uri: uri.toString(), symbolKind: 0, name: pathUtils.getNameFromUri(uri) });
  }
  return keys;
}

export function clearRecentItems(): void {
  clearStoredRecentItems();
}

export const recentItems = {
  addRecentItem,
  getRecentItems,
  getRecentKeys,
  clearRecentItems,
};
