import * as sinon from "sinon";
import * as vscode from "vscode";
import { dataConverter } from "../../../symbols/items/dataConverter";
import { itemsFilter } from "../../../symbols/items/itemsFilter";
import { logger } from "../../../platform/logger";
import { ItemsFilter } from "../../../shared/types";
import { stubMultiple } from "../../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();
  return {
    beforeEach: () => {
      sandbox.stub(logger, "log");
    },
    afterEach: () => {
      sandbox.restore();
    },

    getSymbolsForUri: {
      setupForNestedSymbols: (filter: ItemsFilter = {}) => {
        const range = new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, 0)
        );
        const run = new vscode.DocumentSymbol(
          "run",
          "",
          vscode.SymbolKind.Method,
          range,
          range
        );
        const inner = new vscode.DocumentSymbol(
          "Inner",
          "",
          vscode.SymbolKind.Class,
          range,
          range
        );
        inner.children = [run];
        const outer = new vscode.DocumentSymbol(
          "Outer",
          "",
          vscode.SymbolKind.Class,
          range,
          range
        );
        outer.children = [inner];

        stubMultiple(
          [
            {
              object: vscode.commands,
              method: "executeCommand",
              returns: Promise.resolve([outer]),
            },
            {
              object: dataConverter,
              method: "getSplitter",
              returns: "§&§",
            },
            {
              object: itemsFilter,
              method: "getItemsFilter",
              returns: filter,
            },
          ],
          sandbox
        );
      },
    },
  };
};
