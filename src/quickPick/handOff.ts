import * as vscode from "vscode";
import { HandOffTarget } from "../shared/types";
import { preview } from "./preview";
import { quickPickState, session } from "./state";

const QUICK_OPEN_COMMAND = "workbench.action.quickOpen";
// The "%" text search in quick open; VS Code versions without it only have the Search view.
const QUICK_TEXT_SEARCH_COMMAND = "workbench.action.quickTextSearch";
const FIND_IN_FILES_COMMAND = "workbench.action.findInFiles";

let quickTextSearchSupport: Promise<boolean> | undefined;

function supportsQuickTextSearch(): Promise<boolean> {
  quickTextSearchSupport ??= Promise.resolve(
    vscode.commands.getCommands(true)
  ).then(
    (commands) => commands.includes(QUICK_TEXT_SEARCH_COMMAND),
    () => false
  );
  return quickTextSearchSupport;
}

async function start(
  target: HandOffTarget,
  prefix: string,
  rest: string
): Promise<void> {
  preview.cancelPendingPreview();
  const editorToRestore = preview.getEditorToRestore();
  session.handOffQuery = rest.trim();
  // The editor is restored here rather than in handleDidHide: restoring it after the
  // command ran would take focus from, and close, the quick open that the command shows.
  preview.markItemAccepted();
  quickPickState.getControl().hide();
  await preview.restoreEditor(editorToRestore);

  if (target === "text" && !(await handOff.supportsQuickTextSearch())) {
    await vscode.commands.executeCommand(FIND_IN_FILES_COMMAND, {
      query: rest,
      triggerSearch: rest.length > 0,
    });
    return;
  }
  await vscode.commands.executeCommand(QUICK_OPEN_COMMAND, `${prefix}${rest}`);
}

export const handOff = {
  start,
  supportsQuickTextSearch,
};
