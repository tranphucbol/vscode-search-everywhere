import * as vscode from "vscode";
import { QuickPickItem } from "../shared/types";

// Beyond this many lines between the declaration start and the name, revealing both would
// keep the start in view and could push the name below the viewport.
const MAX_LEADING_LINES = 20;

function toPosition(position: { line: number; character: number }): vscode.Position {
  return new vscode.Position(position.line, position.character);
}

export function getNavigationPosition(qpItem: QuickPickItem): vscode.Position {
  const position = qpItem.namePosition ?? qpItem.range?.start;
  return position ? toPosition(position) : new vscode.Position(0, 0);
}

export function getRevealRange(qpItem: QuickPickItem): vscode.Range {
  const { range, namePosition } = qpItem;
  if (!namePosition) {
    return range as vscode.Range;
  }
  const name = toPosition(namePosition);
  if (!range || name.line - range.start.line > MAX_LEADING_LINES) {
    return new vscode.Range(name, name);
  }
  return new vscode.Range(toPosition(range.start), name);
}

export function getSelectionForQpItem(
  qpItem: QuickPickItem,
  shouldHighlightSymbol: boolean
): vscode.Selection {
  const { range } = qpItem;
  const start = new vscode.Position(range!.start.line, range!.start.character);
  const end = new vscode.Position(range!.end.line, range!.end.character);

  if (shouldHighlightSymbol) {
    return new vscode.Selection(start, end);
  }
  const caret = getNavigationPosition(qpItem);
  return new vscode.Selection(caret, caret);
}
