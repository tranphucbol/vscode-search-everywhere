import * as vscode from "vscode";

function getNameFromUri(uri: vscode.Uri): string {
  return uri.path.split("/").pop() as string;
}

function isDirectory(uri: vscode.Uri): boolean {
  const name = pathUtils.getNameFromUri(uri);
  return !name.includes(".");
}

export const pathUtils = {
  getNameFromUri,
  isDirectory,
};
