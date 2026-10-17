import * as vscode from "vscode";

function getNameFromUri(uri: vscode.Uri): string {
  return uri.path.split("/").pop() as string;
}

function isDirectory(uri: vscode.Uri): boolean {
  const name = pathUtils.getNameFromUri(uri);
  return !name.includes(".");
}

export function ensureUri(uri: any): vscode.Uri {
  if (uri instanceof vscode.Uri) {
    return uri;
  }
  if (typeof uri === "string") {
    try {
      return vscode.Uri.parse(uri);
    } catch {
      return vscode.Uri.file(uri);
    }
  }
  if (uri && typeof uri === "object") {
    if (uri.external) {
      try {
        return vscode.Uri.parse(uri.external);
      } catch {}
    }
    if (uri.scheme || uri.path) {
      try {
        return vscode.Uri.from({
          scheme: uri.scheme || "file",
          authority: uri.authority || "",
          path: uri.path || "",
          query: uri.query || "",
          fragment: uri.fragment || "",
        });
      } catch {
        return vscode.Uri.file(uri.path || uri.fsPath || "");
      }
    }
  }
  return vscode.Uri.file(String(uri));
}

export const pathUtils = {
  getNameFromUri,
  isDirectory,
};
