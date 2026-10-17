import { assert } from "chai";
import * as vscode from "vscode";
import { getLocation, getReference } from "../../symbols/reference";
import { QuickPickItem } from "../../shared/types";
import {
  getSymbolItem,
  getTestSetups,
} from "./reference.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Reference", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("getReference", () => {
    it("should build package.Class#member for a Java method", async () => {
      setups.setupForJavaFile();
      const item = getSymbolItem(vscode.SymbolKind.Method, 4, "save");

      assert.equal(await getReference(item), "com.acme.user.UserService#save");
    });

    it("should build package.Outer.Inner for a nested Java type", async () => {
      setups.setupForJavaFile();
      const item = getSymbolItem(vscode.SymbolKind.Class, 12, "Builder");

      assert.equal(await getReference(item), "com.acme.user.User.Builder");
    });

    it("should build package.Type.Method for a Go pointer receiver", async () => {
      setups.setupForGoFile();
      const item = getSymbolItem(vscode.SymbolKind.Method, 5, "Start");

      assert.equal(await getReference(item), "api.Server.Start");
    });

    it("should build package.Func for a Go function", async () => {
      setups.setupForGoFile();
      const item = getSymbolItem(vscode.SymbolKind.Function, 3, "NewServer");

      assert.equal(await getReference(item), "api.NewServer");
    });

    it("should build Container.name for a TypeScript method", async () => {
      setups.setupForTypeScriptFile();
      const item = getSymbolItem(vscode.SymbolKind.Method, 1, "save");

      assert.equal(await getReference(item), "UserService.save");
    });

    it("should copy the relative path for a file result", async () => {
      setups.setupForSingleRootWorkspace();
      const item: QuickPickItem = {
        label: "service.ts",
        uri: vscode.Uri.file("/workspace/app/src/user/service.ts"),
        symbolKind: 0,
      };

      assert.equal(await getReference(item), "src/user/service.ts");
    });

    it("should fall back to the label name when the symbol is no longer in the file", async () => {
      setups.setupForChangedFile();
      const item = getSymbolItem(vscode.SymbolKind.Method, 7, "remove");

      assert.equal(await getReference(item), "remove");
    });

    it("should start at the outermost container when there is no package", async () => {
      setups.setupForJavaFileWithoutPackage();
      const item = getSymbolItem(vscode.SymbolKind.Method, 1, "save");

      assert.equal(await getReference(item), "UserService#save");
    });
  });

  describe("getLocation", () => {
    it("should build path:line from the name position", () => {
      setups.setupForSingleRootWorkspace();
      const item = getSymbolItem(
        vscode.SymbolKind.Method,
        39,
        "save",
        "/workspace/app/src/user/service.ts"
      );
      item.namePosition = new vscode.Position(41, 2);

      assert.equal(getLocation(item), "src/user/service.ts:42");
    });

    it("should keep the folder name in a multi-root workspace", () => {
      setups.setupForMultiRootWorkspace();
      const item = getSymbolItem(
        vscode.SymbolKind.Method,
        29,
        "save",
        "/workspace/app/src/user/service.ts"
      );

      assert.equal(getLocation(item), "app/src/user/service.ts:30");
    });
  });
});
