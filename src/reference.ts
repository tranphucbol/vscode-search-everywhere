import * as vscode from "vscode";
import { dataConverter } from "./dataConverter";
import { dataService } from "./dataService";
import { logger } from "./logger";
import { QuickPickItem } from "./types";

const PACKAGE_DECLARATION = /^\s*package\s+([\w.]+)/m;
const PACKAGE_SEARCH_LINES = 200;
const ICON_PREFIX = /^\$\([^)]+\)\s+/;
// A container may be a Java method ("save(java.util.List)") or a Go receiver ("(*Server[T])").
const CONTAINER_NOISE = /\([^)]*\)|\[[^\]]*\]|<[^>]*>|\*/g;
const JVM_LANGUAGES = new Set(["java", "kotlin"]);
const TYPE_KINDS = new Set<number>([
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Enum,
  vscode.SymbolKind.Struct,
]);

/**
 * The reference of a result: `package.Class#member` for Java and Kotlin, `package.Type.Method`
 * for Go, `Container.name` elsewhere and the relative path for a file. Never rejects: when the
 * file's symbols or text can't be read it falls back to the name shown in the row.
 */
export async function getReference(item: QuickPickItem): Promise<string> {
  if (item.symbolKind === 0) {
    return getLocation(item);
  }
  const [symbol, document] = await Promise.all([
    resolveSymbol(item),
    openDocument(item.uri),
  ]);
  if (!symbol) {
    return getName(item);
  }
  const containers = splitContainer(symbol.containerName);
  const name = getName(symbol);
  const languageId = document?.languageId;
  const packageName = document ? readPackage(document) : undefined;

  if (languageId && JVM_LANGUAGES.has(languageId)) {
    const owner = [packageName, ...containers].filter(Boolean).join(".");
    if (!owner) {
      return name;
    }
    const isMember = containers.length > 0 && !TYPE_KINDS.has(item.symbolKind);
    return `${owner}${isMember ? "#" : "."}${name}`;
  }
  if (languageId === "go") {
    return [packageName, ...containers, name].filter(Boolean).join(".");
  }
  return [...containers, name].join(".");
}

/**
 * `path:line` of a result, the text of its row's detail line, or the path alone for a file.
 * The path is workspace-relative, keeping the folder name in a multi-root workspace.
 */
export function getLocation(item: QuickPickItem): string {
  const path = getPath(item.uri);
  if (item.symbolKind === 0 || !item.range) {
    return path;
  }
  const position = item.namePosition ?? item.range.start;
  return `${path}:${position.line + 1}`;
}

function getPath(uri: vscode.Uri): string {
  if (!vscode.workspace.getWorkspaceFolder(uri)) {
    return uri.scheme === "file" ? uri.fsPath : uri.toString();
  }
  // Passing includeWorkspaceFolder = true would prefix the folder name in a single-root
  // workspace too; the default adds it only when there are several folders.
  return vscode.workspace.asRelativePath(uri);
}

async function resolveSymbol(
  item: QuickPickItem
): Promise<QuickPickItem | undefined> {
  try {
    const symbols = await dataService.getSymbolsForUri(item.uri);
    if (!symbols || !symbols.length) {
      return undefined;
    }
    return findIndexedSymbol(
      item,
      dataConverter.convertUriAndSymbolsToQpItems(item.uri, symbols)
    );
  } catch (error) {
    logger.log(`Could not resolve symbols for ${item.uri.path}: ${error}`);
    return undefined;
  }
}

function findIndexedSymbol(
  item: QuickPickItem,
  symbols: QuickPickItem[]
): QuickPickItem | undefined {
  const start = item.range?.start;
  if (!start) {
    return undefined;
  }
  return symbols.find(
    (symbol) =>
      symbol.symbolKind === item.symbolKind &&
      !!symbol.range &&
      symbol.range.start.line === start.line &&
      symbol.range.start.character === start.character
  );
}

async function openDocument(
  uri: vscode.Uri
): Promise<vscode.TextDocument | undefined> {
  try {
    return await vscode.workspace.openTextDocument(uri);
  } catch (error) {
    logger.log(`Could not open ${uri.path} to read its package: ${error}`);
    return undefined;
  }
}

function readPackage(document: vscode.TextDocument): string | undefined {
  const head = document.getText(
    new vscode.Range(0, 0, Math.min(PACKAGE_SEARCH_LINES, document.lineCount), 0)
  );
  return head.match(PACKAGE_DECLARATION)?.[1];
}

function splitContainer(containerName?: string): string[] {
  if (!containerName) {
    return [];
  }
  return containerName
    .replace(CONTAINER_NOISE, "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getName(item: QuickPickItem): string {
  return item.label.replace(ICON_PREFIX, "").trim();
}
