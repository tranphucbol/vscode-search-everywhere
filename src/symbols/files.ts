import * as fs from "fs";
import * as vscode from "vscode";
import { fetchIndexNamesOnly } from "../platform/config";
import { FileState } from "../database";
import { itemsFilter } from "./itemsFilter";
import { logger } from "../platform/logger";
import { patternProvider } from "../platform/patternProvider";
import { matchesGlob } from "../shared/glob";
import { messages } from "../shared/messages";
import { workspaceFolders } from "../shared/workspaceFolders";

const NON_SYMBOL_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "ico", "svg", "bmp", "webp",
  "woff", "woff2", "ttf", "eot", "otf",
  "zip", "tar", "gz", "map", "lock", "pdf", "exe", "dll",
  "mp3", "mp4", "wav", "avi"
]);

async function fetchUris(): Promise<vscode.Uri[]> {
  const includePatterns = patternProvider.getIncludePatterns();
  const excludePatterns = await patternProvider.getExcludePatterns();
  try {
    return await vscode.workspace.findFiles(includePatterns, excludePatterns);
  } catch (error) {
    messages.printErrorMessage(error as Error);
    return Promise.resolve([]);
  }
}

function filterUris(uris: vscode.Uri[]): vscode.Uri[] {
  return uris.filter((uri) => itemsFilter.isUriValid(uri));
}

function isNonSymbolFile(uri: vscode.Uri): boolean {
  const ext = uri.path.split(".").pop()?.toLowerCase();
  return !!ext && NON_SYMBOL_EXTENSIONS.has(ext);
}

function isNamesOnly(uri: vscode.Uri): boolean {
  return matchesGlob(workspaceFolders.normalizeUriPath(uri.path), fetchIndexNamesOnly());
}

const statFailuresLogged = new Set<string>();

async function statUri(uri: vscode.Uri): Promise<FileState | undefined> {
  try {
    if (uri.scheme === "file") {
      const stat = await fs.promises.stat(uri.fsPath);
      return { mtime: Math.floor(stat.mtimeMs), size: stat.size };
    }
    const stat = await vscode.workspace.fs.stat(uri);
    return { mtime: Math.floor(stat.mtime), size: stat.size };
  } catch (error) {
    const key = uri.toString();
    if (!statFailuresLogged.has(key)) {
      statFailuresLogged.add(key);
      logger.log(`Could not stat ${uri.path}: ${error}`);
    }
    return undefined;
  }
}

async function isUriExistingInWorkspace(uri: vscode.Uri): Promise<boolean> {
  return !!vscode.workspace.getWorkspaceFolder(uri);
}

export const files = {
  fetchUris,
  filterUris,
  isNonSymbolFile,
  isNamesOnly,
  statUri,
  isUriExistingInWorkspace,
};
