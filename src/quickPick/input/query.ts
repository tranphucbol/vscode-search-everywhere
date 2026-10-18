import * as vscode from "vscode";
import { Category, HandOffTarget, QuickPickItem } from "../../shared/types";
import { quickPickState, session } from "../state";

export const HAND_OFF_PREFIXES: Record<string, HandOffTarget> = {
  ">": "commands",
  "%": "text",
};
const LINE_SUFFIX_REGEX = /^(.*?\S)\s*:(\d+)(?::(\d+))?$/;

export interface ResolvedFilterPhrase {
  kinds?: number[];
  category?: Category;
  rest: string;
}

export interface ResolvedHandOff {
  target: HandOffTarget;
  prefix: string;
  rest: string;
}

function resolveFilterPhrase(text: string): ResolvedFilterPhrase {
  if (!quickPickState.getShouldUseItemsFilterPhrases()) {
    return { rest: text };
  }

  const candidates: { phrase: string; kinds: number[]; category?: Category }[] =
    [];
  for (const category of quickPickState.getCategories() || []) {
    candidates.push({ phrase: category.phrase, kinds: category.kinds, category });
  }
  const filterPhrases = quickPickState.getItemsFilterPhrases() || {};
  for (const kind of Object.keys(filterPhrases)) {
    const phrase = filterPhrases[parseInt(kind)];
    if (phrase) {
      candidates.push({ phrase, kinds: [parseInt(kind)] });
    }
  }
  // Array.prototype.sort is stable, so categories stay ahead of one-kind phrases of equal length.
  candidates.sort((a, b) => b.phrase.length - a.phrase.length);

  const trimmed = text.trimStart();
  const match = candidates.find((candidate) =>
    trimmed.startsWith(candidate.phrase)
  );
  return match
    ? {
        kinds: match.kinds,
        category: match.category,
        rest: trimmed.slice(match.phrase.length).trim(),
      }
    : { rest: text };
}

export function parseLineSuffix(query: string): {
  query: string;
  position?: vscode.Position;
} {
  const match = query.match(LINE_SUFFIX_REGEX);
  if (!match) {
    return { query };
  }
  const line = Math.max(parseInt(match[2], 10) - 1, 0);
  const character = match[3] ? Math.max(parseInt(match[3], 10) - 1, 0) : 0;
  return { query: match[1], position: new vscode.Position(line, character) };
}

function withQueryOverrides(
  items: QuickPickItem[],
  targetPosition?: vscode.Position
): QuickPickItem[] {
  // Clone so cached database results are not mutated; alwaysShow keeps VS Code
  // from hiding items whose label does not contain the "@@" filter phrase, the
  // ":line" suffix, the "Class." qualifier, the words of a multi-word or "*" query, or the pieces of a
  // CamelHumps words query such as "uSerImp".
  return items.map((item) =>
    item.kind === vscode.QuickPickItemKind.Separator
      ? item
      : targetPosition
      ? { ...item, targetPosition, alwaysShow: true }
      : { ...item, alwaysShow: true }
  );
}

function shouldLoadHelpItems(text: string): boolean {
  const helpPhrase = quickPickState.getHelpPhrase();
  return (
    quickPickState.getShouldUseItemsFilterPhrases() &&
    !!helpPhrase &&
    text === helpPhrase
  );
}

function resolveHandOff(text: string): ResolvedHandOff | undefined {
  if (text === session.lastSetText) {
    return undefined;
  }
  const trimmed = text.trimStart();
  const prefix = trimmed.charAt(0);
  const target = HAND_OFF_PREFIXES[prefix];
  if (
    !target ||
    !quickPickState.getHandOffPrefixes() ||
    shouldLoadHelpItems(text) ||
    resolveFilterPhrase(text).kinds
  ) {
    return undefined;
  }
  return { target, prefix, rest: trimmed.slice(1) };
}

function setText(text: string): void {
  const control = quickPickState.getControl();
  session.lastSetText = text;
  control.value = text;
}

export const query = {
  resolveFilterPhrase,
  withQueryOverrides,
  shouldLoadHelpItems,
  resolveHandOff,
  setText,
};
