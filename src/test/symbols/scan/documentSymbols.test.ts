import { assert } from "chai";
import * as vscode from "vscode";
import { documentSymbols } from "../../../symbols/scan/documentSymbols";
import { getTestSetups } from "./documentSymbols.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("DocumentSymbols", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  beforeEach(() => setups.beforeEach());
  afterEach(() => setups.afterEach());

  describe("getSymbolsForUri", () => {
    it("should keep the full ancestor chain in nested symbol names", async () => {
      setups.getSymbolsForUri.setupForNestedSymbols();
      const symbols = await documentSymbols.getSymbolsForUri(
        vscode.Uri.file("/./fake/outer.ts")
      );

      assert.deepEqual(
        symbols!.map((symbol) => symbol.name),
        ["Outer", "Outer§&§Inner", "Outer.Inner§&§run"]
      );
    });

    it("should leave out symbols the items filter ignores", async () => {
      setups.getSymbolsForUri.setupForNestedSymbols({
        ignoredKinds: [vscode.SymbolKind.Method],
      });
      const symbols = await documentSymbols.getSymbolsForUri(
        vscode.Uri.file("/./fake/outer.ts")
      );

      assert.deepEqual(
        symbols!.map((symbol) => symbol.name),
        ["Outer", "Outer§&§Inner"]
      );
    });
  });
});
