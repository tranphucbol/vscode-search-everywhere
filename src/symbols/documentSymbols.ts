import * as vscode from "vscode";
import { dataConverter } from "./dataConverter";
import { itemsFilter } from "./itemsFilter";
import { logger } from "../platform/logger";

const CONTAINER_SEPARATOR = ".";

async function getSymbolsForUri(
  uri: vscode.Uri
): Promise<vscode.DocumentSymbol[] | undefined> {
  const allSymbols = await documentSymbols.loadAllSymbolsForUri(uri);
  const symbols = allSymbols
    ? reduceAndFlatSymbolsArrayForUri(allSymbols)
    : undefined;
  return symbols
    ? symbols.filter((symbol) => itemsFilter.isSymbolValid(symbol))
    : undefined;
}

async function loadAllSymbolsForUri(
  uri: vscode.Uri
): Promise<vscode.DocumentSymbol[] | undefined> {
  try {
    return await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      uri
    );
  } catch (error) {
    logger.log(`Could not load symbols for ${uri.path}: ${error}`);
    return undefined;
  }
}

function reduceAndFlatSymbolsArrayForUri(
  symbols: vscode.DocumentSymbol[],
  parentName?: string
): vscode.DocumentSymbol[] {
  const flatArrayOfSymbols: vscode.DocumentSymbol[] = [];

  symbols.forEach((symbol: vscode.DocumentSymbol) => {
    prepareSymbolNameIfHasParent(symbol, parentName);
    flatArrayOfSymbols.push(symbol);

    if (hasSymbolChildren(symbol)) {
      flatArrayOfSymbols.push(
        ...reduceAndFlatSymbolsArrayForUri(symbol.children, symbol.name)
      );
    }
    if (symbol.children) {
      symbol.children = [];
    }
  });

  return flatArrayOfSymbols;
}

function prepareSymbolNameIfHasParent(
  symbol: vscode.DocumentSymbol,
  parentName?: string
) {
  const splitter = dataConverter.getSplitter();
  if (parentName) {
    parentName = parentName.split(splitter).join(CONTAINER_SEPARATOR);
    symbol.name = `${parentName}${splitter}${symbol.name}`;
  }
}

function hasSymbolChildren(symbol: vscode.DocumentSymbol): boolean {
  return symbol.children && symbol.children.length ? true : false;
}

export const documentSymbols = {
  getSymbolsForUri,
  loadAllSymbolsForUri,
};
