import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/config";
import { dataConverter } from "../../../symbols/items/dataConverter";
import { Icons, ItemsFilterPhrases } from "../../../shared/types";
import { pathUtils } from "../../../shared/paths";
import { workspaceFolders } from "../../../shared/workspaceFolders";
import { mocks } from "../../util/dataConverter.mock";
import { getConfiguration, getWorkspaceData } from "../../util/mockFactory";
import { stubMultiple } from "../../util/stubHelpers";

const stubConfig = (
  sandbox: sinon.SinonSandbox,
  icons: Icons = {},
  shouldUseItemsFilterPhrases: boolean = false,
  itemsFilterPhrases: ItemsFilterPhrases = {},
  workspaceFolders: vscode.WorkspaceFolder[] | null = mocks.workspaceFolders
) => {
  stubMultiple(
    [
      {
        object: dataConverter,
        method: "getIcons",
        returns: icons,
      },
      {
        object: dataConverter,
        method: "getShouldUseItemsFilterPhrases",
        returns: shouldUseItemsFilterPhrases,
      },
      {
        object: dataConverter,
        method: "getItemsFilterPhrases",
        returns: itemsFilterPhrases,
      },
      {
        object: vscode.workspace,
        method: "workspaceFolders",
        returns: workspaceFolders,
        isNotMethod: true,
        returnsIsUndefined: !!workspaceFolders,
      },
    ],
    sandbox
  );
};

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    reload: {
      setupForFetchingConfig: () => {
        return stubMultiple(
          [{ object: dataConverter, method: "fetchConfig" }],
          sandbox
        );
      },
    },

    cancel: {
      setupForSettingCancelledFlag: () => {
        return stubMultiple(
          [{ object: dataConverter, method: "setCancelled" }],
          sandbox
        );
      },
    },

    convertToQpData: {
      setupForConvertingWithoutIconsAndFilterPhrases: () => {
        stubConfig(sandbox);
        stubMultiple(
          [
            {
              object: pathUtils,
              method: "getNameFromUri",
              returns: "fake-1.ts",
            },
            {
              object: workspaceFolders,
              method: "normalizeUriPath",
              returns: "/./fake/fake-1.ts",
            },
            {
              object: dataConverter,
              method: "getSplitter",
              returns: "§&§",
            },
          ],
          sandbox
        );

        const { workspaceData, qpItems } = mocks.convertToQpData1();

        return {
          workspaceData,
          qpItems,
        };
      },

      setupForConvertingWithIconsAndFilterPhrases: () => {
        const configuration = getConfiguration().searchEverywhere;
        stubConfig(
          sandbox,
          configuration.icons,
          true,
          configuration.itemsFilterPhrases,
          null
        );
        stubMultiple(
          [
            {
              object: pathUtils,
              method: "getNameFromUri",
              returns: "fake-1.ts",
            },
            {
              object: workspaceFolders,
              method: "normalizeUriPath",
              returns: "/./fake/fake-1.ts",
            },
            {
              object: dataConverter,
              method: "getSplitter",
              returns: "§&§",
            },
          ],
          sandbox
        );

        const { workspaceData, qpItems } = mocks.convertToQpData2();

        return {
          workspaceData,
          qpItems,
        };
      },

      setupForReturningEmptyArray: () => {
        return {
          workspaceData: getWorkspaceData(),
          qpItems: [],
        };
      },

      setupForReturningEmptyArrayWhenCancelled: () => {
        stubMultiple(
          [
            {
              object: dataConverter,
              method: "getIsCancelled",
              returns: true,
            },
          ],
          sandbox
        );

        const { workspaceData } = mocks.convertToQpData4();

        return {
          workspaceData,
          qpItems: [],
        };
      },
    },

    convertUriAndSymbolsToQpItems: {
      setupForConvertingSymbols: () => {
        stubConfig(sandbox);
        stubMultiple(
          [
            {
              object: pathUtils,
              method: "getNameFromUri",
              returns: "user.ts",
            },
            {
              object: workspaceFolders,
              method: "normalizeUriPath",
              returns: "/./fake/user.ts",
            },
            {
              object: dataConverter,
              method: "getSplitter",
              returns: "§&§",
            },
          ],
          sandbox
        );

        const range = new vscode.Range(
          new vscode.Position(3, 0),
          new vscode.Position(3, 0)
        );
        const nestedSymbol = {
          name: "Outer.Inner§&§run",
          detail: "",
          kind: vscode.SymbolKind.Method,
          range,
          selectionRange: range,
          children: [],
        } as vscode.DocumentSymbol;
        const symbolInformation = {
          name: "save",
          containerName: "UserService",
          kind: vscode.SymbolKind.Method,
          location: new vscode.Location(vscode.Uri.file("/./fake/user.ts"), range),
        } as unknown as vscode.DocumentSymbol;

        return {
          uri: vscode.Uri.file("/./fake/user.ts"),
          nestedSymbol,
          symbolInformation,
        };
      },
    },

    fetchConfig: {
      setupForFetchingIcons: () => {
        const configuration = getConfiguration().searchEverywhere;
        const expected = configuration.icons;
        stubMultiple(
          [
            {
              object: config,
              method: "fetchIcons",
              returns: expected,
            },
            {
              object: config,
              method: "fetchShouldUseItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchItemsFilterPhrases",
            },
          ],
          sandbox
        );
        return expected;
      },

      setupForFetchingShouldUseItemsFilterPhrasesFlag: () => {
        const configuration = getConfiguration().searchEverywhere;
        const expected = configuration.shouldUseItemsFilterPhrases;
        stubMultiple(
          [
            {
              object: config,
              method: "fetchShouldUseItemsFilterPhrases",
              returns: expected,
            },
            {
              object: config,
              method: "fetchIcons",
            },
            {
              object: config,
              method: "fetchItemsFilterPhrases",
            },
          ],
          sandbox
        );
        return expected;
      },

      setupForFetchingItemsFilterPhrases: () => {
        const configuration = getConfiguration().searchEverywhere;
        const expected = configuration.itemsFilterPhrases;
        stubMultiple(
          [
            {
              object: config,
              method: "fetchItemsFilterPhrases",
              returns: expected,
            },
            {
              object: config,
              method: "fetchShouldUseItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchIcons",
            },
          ],
          sandbox
        );
        return expected;
      },
    },
  };
};
