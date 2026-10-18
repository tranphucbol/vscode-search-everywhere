import * as vscode from "vscode";
import { IndexStats } from "./types";

function printNoFolderOpenedMessage(): void {
  vscode.window.showInformationMessage(
    "Workspace doesn't contain any folder opened"
  );
}

function printErrorMessage(error: Error): void {
  vscode.window.showInformationMessage(
    `Something went wrong...
    Extension encountered the following error: ${error.stack}`
  );
}

function printStatsMessage(indexStats: IndexStats): void {
  vscode.window.showInformationMessage(
    `Elapsed time: ${indexStats.ElapsedTimeInSeconds}s
     Scanned files: ${indexStats.ScannedUrisCount}
     Indexed items: ${indexStats.IndexedItemsCount}`
  );
}

export const messages = {
  printNoFolderOpenedMessage,
  printErrorMessage,
  printStatsMessage,
};
