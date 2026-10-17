import * as vscode from "vscode";

export const getDirectory = (path: string): vscode.Uri => {
  return vscode.Uri.file(path);
};

export const getUntitledItem = (): vscode.Uri => {
  const itemUntitledUri = vscode.Uri.file("./fake/fake-1.ts");
  (itemUntitledUri as any).scheme = "untitled";
  return itemUntitledUri;
};

export const getItem = (
  path: string = "/./fake/",
  suffix: string | number = 1,
  fixPrivateFsPathProperty: boolean = false
): vscode.Uri => {
  const item = vscode.Uri.file(`${path}fake-${suffix ? `${suffix}` : ""}.ts`);
  fixPrivateFsPathProperty && ((item as any)._fsPath = item.path);
  return item;
};

export const getItems = (
  count: number = 2,
  path: string = "/./fake/",
  suffixStartOffset: number = 0,
  fixPrivateFsPathProperty: boolean = false
): vscode.Uri[] => {
  const array: vscode.Uri[] = [];
  for (let i = 1; i <= count; i++) {
    array.push(getItem(path, i + suffixStartOffset, fixPrivateFsPathProperty));
  }
  return array;
};

export const getDocumentSymbolItemSingleLine = (
  suffix?: string | number,
  withChild: boolean = false,
  kind: number = 1
): vscode.DocumentSymbol => {
  return {
    name: `test name${suffix ? ` ${suffix}` : ""}`,
    detail: `test details${suffix ? ` ${suffix}` : ""}`,
    kind,
    range: new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 0)
    ),
    selectionRange: new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 0)
    ),
    children: withChild
      ? [
          {
            name: `test child name${suffix ? ` ${suffix}` : ""}`,
            detail: `test child details${suffix ? ` ${suffix}` : ""}`,
            kind,
            range: new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(0, 0)
            ),
            selectionRange: new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(0, 0)
            ),
            children: [],
          },
        ]
      : [],
  };
};

export const getDocumentSymbolItemSingleLineArray = (
  count: number = 0,
  withChild: boolean = false,
  kind: number = 1,
  kindsFromFirstItem: number[] = []
): vscode.DocumentSymbol[] => {
  const array: vscode.DocumentSymbol[] = [];
  for (let i = 0; i < count; i++) {
    array.push(
      getDocumentSymbolItemSingleLine(
        i + 1,
        withChild,
        kindsFromFirstItem[i] ? kindsFromFirstItem[i] : kind
      )
    );
  }
  return array;
};

export const getDocumentSymbolItemMultiLine = (
  withParent: boolean = false
): vscode.DocumentSymbol => {
  return {
    name: `${withParent ? "test parent§&§" : ""}test name`,
    detail: "test details",
    kind: 1,
    range: new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(3, 0)
    ),
    selectionRange: new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(3, 0)
    ),
    children: [],
  };
};

export const getDocumentSymbolItemWithDocComment = (): vscode.DocumentSymbol => {
  return {
    name: "test name",
    detail: "test details",
    kind: vscode.SymbolKind.Method,
    range: new vscode.Range(
      new vscode.Position(10, 2),
      new vscode.Position(16, 3)
    ),
    selectionRange: new vscode.Range(
      new vscode.Position(12, 4),
      new vscode.Position(12, 13)
    ),
    children: [],
  };
};

export const getDocumentSymbolItemWithSelectionOutsideRange =
  (): vscode.DocumentSymbol => {
    return {
      name: "test name",
      detail: "test details",
      kind: vscode.SymbolKind.Method,
      range: new vscode.Range(
        new vscode.Position(10, 2),
        new vscode.Position(16, 3)
      ),
      selectionRange: new vscode.Range(
        new vscode.Position(20, 4),
        new vscode.Position(20, 13)
      ),
      children: [],
    };
  };

export const getSymbolInformation = (
  name: string,
  uri: vscode.Uri,
  kind: vscode.SymbolKind = vscode.SymbolKind.Class,
  containerName: string = "",
  line: number = 4
): vscode.SymbolInformation =>
  new vscode.SymbolInformation(
    name,
    kind,
    containerName,
    new vscode.Location(
      uri,
      new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line + 2, 1))
    )
  );

export const getWorkspaceSymbolInformation = (
  name: string = "UserService",
  kind: vscode.SymbolKind = vscode.SymbolKind.Class
): vscode.SymbolInformation =>
  getSymbolInformation(name, vscode.Uri.file("/workspace/src/user.ts"), kind);

export const getExcludedSymbolInformation = (
  name: string = "Promise",
  kind: vscode.SymbolKind = vscode.SymbolKind.Interface
): vscode.SymbolInformation =>
  getSymbolInformation(
    name,
    vscode.Uri.file("/workspace/node_modules/typescript/lib/lib.es5.d.ts"),
    kind
  );

export const getOutsideSymbolInformation = (
  name: string = "ArrayList",
  kind: vscode.SymbolKind = vscode.SymbolKind.Class
): vscode.SymbolInformation =>
  getSymbolInformation(
    name,
    vscode.Uri.parse("jdt://contents/java.base/java.util/ArrayList.class"),
    kind,
    "java.util"
  );
