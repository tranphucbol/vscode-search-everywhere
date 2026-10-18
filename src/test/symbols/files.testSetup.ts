import * as sinon from "sinon";
import * as vscode from "vscode";
import { itemsFilter } from "../../symbols/itemsFilter";
import { ItemsFilter } from "../../shared/types";
import { getItems } from "../util/itemMockFactory";
import { stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();
  return {
    afterEach: () => {
      sandbox.restore();
    },

    filterUris: {
      setupForItemsFilter: (filter: ItemsFilter) => {
        stubMultiple(
          [{ object: itemsFilter, method: "getItemsFilter", returns: filter }],
          sandbox
        );
      },
    },

    isUriExistingInWorkspace: {
      setupForReturningTrueWhenUriExists: () => {
        stubMultiple(
          [
            {
              object: vscode.workspace,
              method: "getWorkspaceFolder",
              returns: { uri: getItems()[0] },
            },
          ],
          sandbox
        );
      },

      setupForReturningFalseWhenUriDoesNotExist: () => {
        stubMultiple(
          [
            {
              object: vscode.workspace,
              method: "getWorkspaceFolder",
              returns: undefined,
              returnsIsUndefined: true,
            },
          ],
          sandbox
        );
      },
    },
  };
};
