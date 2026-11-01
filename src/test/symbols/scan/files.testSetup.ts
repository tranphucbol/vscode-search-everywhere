import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/settings/config";
import { patternProvider } from "../../../platform/settings/patternProvider";
import { itemsFilter } from "../../../symbols/items/itemsFilter";
import { messages } from "../../../shared/messages";
import { ItemsFilter } from "../../../shared/types";
import { getItems } from "../../util/itemMockFactory";
import { stubMultiple } from "../../util/stubHelpers";

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

    fetchUris: {
      setupForIncludePatterns: (includePatterns: string[]) => {
        const [findFilesStub, printErrorMessageStub] = stubMultiple(
          [
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: Promise.resolve([]),
            },
            { object: messages, method: "printErrorMessage" },
            {
              object: patternProvider,
              method: "getIncludePatterns",
              returns: includePatterns,
            },
            {
              object: patternProvider,
              method: "getExcludePatterns",
              returns: Promise.resolve("**/node_modules/**"),
            },
          ],
          sandbox
        );
        return { findFilesStub, printErrorMessageStub };
      },
    },

    isNamesOnly: {
      setupForNamesOnlyGlobs: (
        indexNamesOnly: string,
        alwaysIncludedOnly: boolean
      ) => {
        stubMultiple(
          [
            {
              object: config,
              method: "fetchIndexNamesOnly",
              returns: indexNamesOnly,
            },
            {
              object: patternProvider,
              method: "isAlwaysIncludedOnly",
              returns: alwaysIncludedOnly,
            },
          ],
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
