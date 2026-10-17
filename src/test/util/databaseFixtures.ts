import * as path from "path";
import * as vscode from "vscode";
import { database } from "../../database";
import { QuickPickItem } from "../../shared/types";

export const fakeContext: any = {
  extensionPath: path.resolve(__dirname, "../../../"),
  storageUri: vscode.Uri.file("/tmp/vscode-search-everywhere-test"),
  globalStorageUri: vscode.Uri.file("/tmp/vscode-search-everywhere-test"),
};

export const item1: QuickPickItem = {
  uri: vscode.Uri.file("/workspace/src/UserController.ts"),
  symbolKind: vscode.SymbolKind.Class,
  label: "$(symbol-class) UserController",
  description: "src/UserController.ts",
  detail: "class UserController",
  range: new vscode.Range(new vscode.Position(10, 0), new vscode.Position(20, 0)),
};

export const item2: QuickPickItem = {
  uri: vscode.Uri.file("/workspace/src/UserService.ts"),
  symbolKind: vscode.SymbolKind.Class,
  label: "$(symbol-class) UserService",
  description: "src/UserService.ts",
  detail: "class UserService",
  range: new vscode.Range(new vscode.Position(5, 0), new vscode.Position(15, 0)),
};

export const item3: QuickPickItem = {
  uri: vscode.Uri.file("/workspace/src/models/User.ts"),
  symbolKind: vscode.SymbolKind.Interface,
  label: "$(symbol-interface) User",
  description: "src/models/User.ts",
  detail: "interface User",
  range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(8, 0)),
};

/** Opens the database for the enclosing suite and empties it before each test. */
export const useTestDatabase = () => {
  before(async () => {
    await database.initDatabase(fakeContext);
  });

  beforeEach(() => {
    database.clearAll();
  });

  after(() => {
    database.closeDatabase();
  });
};
