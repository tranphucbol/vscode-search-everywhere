import * as vscode from "vscode";
import {
  fetchIcons,
  fetchItemsFilterPhrases,
  fetchShouldUseItemsFilterPhrases,
} from "../../platform/config";
import {
  Icons,
  Item,
  ItemsFilterPhrases,
  QuickPickItem,
  WorkspaceData,
} from "../../shared/types";
import { pathUtils } from "../../shared/paths";
import { workspaceFolders } from "../../shared/workspaceFolders";

const GO_RECEIVER_METHOD = /^\((\*?)([A-Za-z_]\w*)(\[[^\]]*\])?\)\.(\w+)$/;
// jdtls appends type parameters after the list: "convert(User, Class<T>) <T>".
const TRAILING_PARAMETER_LIST = /^([^(\s][^(]*?)\s*(\(.*\)(?:\s*<.*>)?)$/;
const KINDS_WITH_PARAMETER_LIST = new Set<number>([
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
  vscode.SymbolKind.Function,
]);

export function normalizeSymbolName(
  name: string,
  kind: vscode.SymbolKind
): { name: string; container?: string; qualifier?: string } {
  if (kind === vscode.SymbolKind.Method) {
    const receiver = name.match(GO_RECEIVER_METHOD);
    if (receiver) {
      const [, pointer, type, typeParams = "", method] = receiver;
      return {
        name: method,
        container: type,
        qualifier: `(${pointer}${type}${typeParams})`,
      };
    }
  }
  if (KINDS_WITH_PARAMETER_LIST.has(kind)) {
    const withParams = name.match(TRAILING_PARAMETER_LIST);
    if (withParams) {
      return { name: withParams[1], qualifier: withParams[2] };
    }
  }
  return { name };
}

function getKindName(symbolKind: number): string {
  const kindName = vscode.SymbolKind[symbolKind] || "";
  return kindName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function mapDataToQpData(data: Map<string, Item>): QuickPickItem[] {
  let qpData: QuickPickItem[] = [];

  for (let item of data.values()) {
    if (dataConverter.getIsCancelled()) {
      qpData = [];
      break;
    }

    item.elements.forEach((element: vscode.Uri | vscode.DocumentSymbol) => {
      qpData.push(mapItemElementToQpItem(item.uri, element));
    });
  }
  return qpData;
}

function mapItemElementToQpItem(
  uri: vscode.Uri,
  item: vscode.DocumentSymbol | vscode.Uri
): QuickPickItem {
  return "range" in item || "kind" in item
    ? mapDocumentSymbolToQpItem(uri, item as vscode.DocumentSymbol)
    : mapUriToQpItem(item as vscode.Uri);
}

function mapDocumentSymbolToQpItem(
  uri: vscode.Uri,
  symbol: vscode.DocumentSymbol
): QuickPickItem {
  const splitter = dataConverter.getSplitter();
  const symbolName = symbol.name.split(splitter);
  const splitParent =
    symbolName.length === 2
      ? symbolName[0]
      : (symbol as unknown as vscode.SymbolInformation).containerName || "";
  const normalized = normalizeSymbolName(
    symbolName.length === 2 ? symbolName[1] : symbol.name,
    symbol.kind
  );
  const name = normalized.name;
  const parent = splitParent || normalized.container || "";
  const icons = dataConverter.getIcons();
  const icon = icons[symbol.kind] ? `$(${icons[symbol.kind]})` : "";
  const label = icon ? `${icon}  ${name}` : name;
  const description = getDocumentSymbolToQpItemDescription(
    symbol.kind,
    parent,
    normalized.qualifier,
    normalized.container !== undefined
  );

  const range =
    symbol.range ||
    (symbol as any).location?.range ||
    new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));

  return createQuickPickItem(
    uri,
    symbol.kind,
    range.start,
    range.end,
    label,
    description,
    parent || undefined,
    getNamePosition(symbol, range)
  );
}

// Some providers return a selectionRange outside the symbol's range; that one is not trusted.
function getNamePosition(
  symbol: vscode.DocumentSymbol,
  range: vscode.Range
): vscode.Position | undefined {
  const name = symbol.selectionRange?.start;
  if (!name || isBefore(name, range.start) || isBefore(range.end, name)) {
    return undefined;
  }
  return name;
}

function isBefore(a: vscode.Position, b: vscode.Position): boolean {
  return a.line < b.line || (a.line === b.line && a.character < b.character);
}

function getDocumentSymbolToQpItemDescription(
  symbolKind: number,
  parent: string,
  qualifier: string | undefined,
  isReceiver: boolean
): string {
  const kindName = getKindName(symbolKind);
  if (qualifier && isReceiver) {
    return `${qualifier} · ${kindName}`;
  }
  const description = parent ? `${parent} · ${kindName}` : kindName;
  return qualifier ? `${description} ${qualifier}` : description;
}

function mapSymbolInformationToQpItem(
  symbol: vscode.SymbolInformation
): QuickPickItem {
  return mapDocumentSymbolToQpItem(
    symbol.location.uri,
    symbol as unknown as vscode.DocumentSymbol
  );
}

function mapUriToQpItem(uri: vscode.Uri): QuickPickItem {
  const symbolKind = 0;
  const name = pathUtils.getNameFromUri(uri);
  const icons = dataConverter.getIcons();
  const icon = icons[symbolKind] ? `$(${icons[symbolKind]})` : "";
  const label = icon ? `${icon}  ${name}` : name;
  const start = new vscode.Position(0, 0);
  const end = new vscode.Position(0, 0);

  return createQuickPickItem(uri, symbolKind, start, end, label, "file");
}

function getDetail(
  uri: vscode.Uri,
  symbolKind: number,
  position: vscode.Position
): string {
  const path = workspaceFolders.normalizeUriPath(uri.path);
  return symbolKind === 0 ? path : `${path}:${position.line + 1}`;
}

function createQuickPickItem(
  uri: vscode.Uri,
  symbolKind: number,
  start: vscode.Position,
  end: vscode.Position,
  label: string,
  description: string,
  containerName?: string,
  namePosition?: vscode.Position
): QuickPickItem {
  const item = {
    uri,
    symbolKind,
    range: {
      start,
      end,
    },
    label,
    detail: getDetail(uri, symbolKind, namePosition ?? start),
    description,
    // buttons: [
    //   {
    //     iconPath: new vscode.ThemeIcon("open-preview"),
    //     tooltip: "Open to the side",
    //   },
    // ],
  } as QuickPickItem;
  if (containerName) {
    item.containerName = containerName;
  }
  if (namePosition) {
    item.namePosition = namePosition;
  }
  return item;
}

function reload() {
  dataConverter.fetchConfig();
}

function cancel() {
  dataConverter.setCancelled(true);
}

function convertUriAndSymbolsToQpItems(
  uri: vscode.Uri,
  symbols?: vscode.DocumentSymbol[]
): QuickPickItem[] {
  const qpItems: QuickPickItem[] = [];
  qpItems.push(mapUriToQpItem(uri));
  if (symbols && symbols.length) {
    for (let i = 0; i < symbols.length; i++) {
      qpItems.push(mapDocumentSymbolToQpItem(uri, symbols[i]));
    }
  }
  return qpItems;
}

function convertToQpData(data: WorkspaceData): QuickPickItem[] {
  const qpData = mapDataToQpData(data.items);
  dataConverter.setCancelled(false);
  return qpData;
}

function fetchConfig() {
  const icons = fetchIcons();
  setIcons(icons);
  const shouldUseItemsFilterPhrases = fetchShouldUseItemsFilterPhrases();
  setShouldUseItemsFilterPhrases(shouldUseItemsFilterPhrases);
  const itemsFilterPhrases = fetchItemsFilterPhrases();
  setItemsFilterPhrases(itemsFilterPhrases);
}

function setCancelled(value: boolean) {
  isCancelled = value;
}

function getIsCancelled() {
  return isCancelled;
}

function setIcons(newIcons: Icons) {
  icons = newIcons;
}

function getIcons() {
  return icons;
}

function setShouldUseItemsFilterPhrases(value: boolean) {
  shouldUseItemsFilterPhrases = value;
}

function getShouldUseItemsFilterPhrases() {
  return shouldUseItemsFilterPhrases;
}

function setItemsFilterPhrases(newItemsFilterPhrases: ItemsFilterPhrases) {
  itemsFilterPhrases = newItemsFilterPhrases;
}

function getItemsFilterPhrases() {
  return itemsFilterPhrases;
}

let isCancelled = false;
let icons: Icons = {};
let shouldUseItemsFilterPhrases = false;
let itemsFilterPhrases: ItemsFilterPhrases = {};

function getSplitter(): string {
  return "§&§";
}

export const dataConverter = {
  getSplitter,
  setCancelled,
  getIsCancelled,
  getIcons,
  getShouldUseItemsFilterPhrases,
  getItemsFilterPhrases,
  reload,
  cancel,
  convertToQpData,
  convertUriAndSymbolsToQpItems,
  mapUriToQpItem,
  mapSymbolInformationToQpItem,
  fetchConfig,
};
