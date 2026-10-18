import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/settings/config";
import { documentSymbols } from "../../../symbols/scan/documentSymbols";
import { itemsFilter } from "../../../symbols/items/itemsFilter";
import { scan } from "../../../symbols/scan/scan";
import { files } from "../../../symbols/scan/files";
import { warmup } from "../../../symbols/scan/warmup";
import { logger } from "../../../platform/logger";
import { patternProvider } from "../../../platform/settings/patternProvider";
import { ItemsFilter } from "../../../shared/types";
import { asyncUtils } from "../../../shared/async";
import { dataConverter } from "../../../symbols/items/dataConverter";
import { messages } from "../../../shared/messages";
import { workspaceFolders } from "../../../shared/workspaceFolders";
import {
  getDocumentSymbolItemSingleLineArray,
  getItems,
} from "../../util/itemMockFactory";
import {
  getConfiguration,
  getItemsFilter,
  getWorkspaceData,
} from "../../util/mockFactory";
import { stubMultiple } from "../../util/stubHelpers";

const stubConfig = (
  sandbox: sinon.SinonSandbox,
  filter: ItemsFilter = {},
  isCancelled: boolean = false
) => {
  stubMultiple(
    [
      {
        object: itemsFilter,
        method: "getItemsFilter",
        returns: filter,
      },
      {
        object: scan,
        method: "getIsCancelled",
        returns: isCancelled,
      },
      {
        object: patternProvider,
        method: "getExcludePatterns",
        returns: Promise.resolve(["**/.history/**", "**/.vscode/**"]),
      },
      {
        object: patternProvider,
        method: "getIncludePatterns",
        returns: Promise.resolve(["**/**/*"]),
      },
      {
        object: dataConverter,
        method: "getSplitter",
        returns: "§&§",
      },
    ],
    sandbox
  );
};

const stubFetchingItems = (sandbox: sinon.SinonSandbox) => {
  stubMultiple(
    [
      {
        object: scan,
        method: "createWorkspaceData",
        returns: getWorkspaceData(),
      },
      {
        object: vscode.workspace,
        method: "findFiles",
        returns: Promise.resolve(getItems()),
      },
      {
        object: vscode.commands,
        method: "executeCommand",
        returns: Promise.resolve(getDocumentSymbolItemSingleLineArray(1)),
      },
      {
        object: vscode.workspace,
        method: "openTextDocument",
        returns: Promise.resolve({ languageId: "typescript" }),
      },
    ],
    sandbox
  );
};

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();
  return {
    beforeEach: () => {
      sandbox.stub(logger, "log");
    },
    afterEach: () => {
      sandbox.restore();
    },

    clearWorkspaceData: {
      setupForClearingWorkspaceDataObject: () => {
        const workspaceDataItems = [
          {
            uri: vscode.Uri.file("/./fake/fake-1.ts"),
            get elements() {
              return [
                this.uri,
                {
                  name: "fake-1.ts§&§test name",
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
                },
              ];
            },
          },
        ];

        return getWorkspaceData(workspaceDataItems);
      },
    },

    reload: {
      setupForFetchingConfig: () => {
        return stubMultiple(
          [{ object: scan, method: "fetchConfig" }],
          sandbox
        );
      },
    },

    cancel: {
      setupForSettingCancelledFlag: () => {
        return stubMultiple(
          [{ object: scan, method: "setIsCancelled" }],
          sandbox
        );
      },
    },

    fetchData: {
      setupForReturningWorkspaceDataWithEmptyExcludePatterns: () => {
        stubConfig(sandbox);
        stubFetchingItems(sandbox);
      },

      setupForReturningWorkspaceDataWithSingleExcludePattern: () => {
        stubConfig(sandbox);
        stubFetchingItems(sandbox);
      },

      setupForReturningWorkspaceDataWithMultipleExcludePatterns: () => {
        stubConfig(sandbox);
        stubFetchingItems(sandbox);
      },

      setupForPrintingErrorMessageWhenErrorThrown: () => {
        stubConfig(sandbox);
        return stubMultiple(
          [
            {
              object: messages,
              method: "printErrorMessage",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              throws: "test error",
            },
            {
              object: vscode.commands,
              method: "executeCommand",
            },
            {
              object: scan,
              method: "createWorkspaceData",
            },
          ],
          sandbox
        );
      },

      setupForReturningUriItemsWhenUrisParamProvided: () => {
        stubConfig(sandbox);
        stubFetchingItems(sandbox);
      },

      setupForRetryingSymbolsFetchWhenUndefinedReturned: () => {
        stubConfig(sandbox);
        return stubMultiple(
          [
            {
              object: documentSymbols,
              method: "getSymbolsForUri",
              returns: Promise.resolve(undefined),
            },
            {
              object: asyncUtils,
              method: "sleep",
            },
            {
              object: scan,
              method: "createWorkspaceData",
              returns: getWorkspaceData(),
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: Promise.resolve(getItems(1)),
            },
            {
              object: vscode.commands,
              method: "executeCommand",
              returns: Promise.resolve(getDocumentSymbolItemSingleLineArray(1)),
            },
          ],
          sandbox
        );
      },

      setupForReturningEmptyArrayWhenFetchingCancelled: () => {
        stubConfig(sandbox, undefined, true);
        stubMultiple(
          [
            {
              object: scan,
              method: "clearWorkspaceData",
            },
          ],
          sandbox
        );
        stubFetchingItems(sandbox);
      },

      setupForFilteringItemsByAllowedKinds: () => {
        stubConfig(sandbox, getItemsFilter([0]));
        stubMultiple(
          [
            {
              object: scan,
              method: "createWorkspaceData",
              returns: getWorkspaceData(),
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: Promise.resolve(getItems(1)),
            },
            {
              object: vscode.commands,
              method: "executeCommand",
              returns: Promise.resolve(
                getDocumentSymbolItemSingleLineArray(1, true)
              ),
            },
          ],
          sandbox
        );
      },

      setupForFilteringItemsByIgnoredKinds: () => {
        stubConfig(sandbox, getItemsFilter([], [0]));
        stubMultiple(
          [
            {
              object: scan,
              method: "createWorkspaceData",
              returns: getWorkspaceData(),
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: Promise.resolve(getItems(1)),
            },
            {
              object: vscode.commands,
              method: "executeCommand",
              returns: Promise.resolve(getDocumentSymbolItemSingleLineArray(1)),
            },
          ],
          sandbox
        );
      },

      setupForFilteringItemsByIgnoredNames: () => {
        stubConfig(sandbox, getItemsFilter([], [], ["fake"]));
        stubMultiple(
          [
            {
              object: scan,
              method: "createWorkspaceData",
              returns: getWorkspaceData(),
            },
            {
              object: asyncUtils,
              method: "sleep",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: Promise.resolve(getItems(2)),
            },
            {
              object: vscode.commands,
              method: "executeCommand",
              returns: Promise.resolve(),
            },
          ],
          sandbox
        );
      },

      setupForExcludingExistingUrisFromElements: () => {
        stubConfig(sandbox);

        const workspaceDataItems = [
          {
            uri: vscode.Uri.file("/./fake/fake-1.ts"),
            get elements() {
              return [
                this.uri,
                {
                  name: "fake-1.ts§&§test name",
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
                },
              ];
            },
          },
        ];

        stubMultiple(
          [
            {
              object: scan,
              method: "createWorkspaceData",
              returns: getWorkspaceData(workspaceDataItems),
            },
            {
              object: asyncUtils,
              method: "sleep",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: Promise.resolve(getItems(2)),
            },
            {
              object: vscode.commands,
              method: "executeCommand",
              returns: Promise.resolve(),
            },
          ],
          sandbox
        );
      },
    },

    indexNamesOnly: {
      setupForNamesOnlyFiles: (namesOnlyGlob: string) => {
        stubConfig(sandbox);
        const uris = [
          vscode.Uri.file("/./fake/config.json"),
          vscode.Uri.file("/./fake/fake-1.ts"),
        ];
        const [getSymbolsForUriStub] = stubMultiple(
          [
            {
              object: documentSymbols,
              method: "getSymbolsForUri",
              returns: Promise.resolve(getDocumentSymbolItemSingleLineArray(1)),
            },
            {
              object: config,
              method: "fetchIndexNamesOnly",
              returns: namesOnlyGlob,
            },
            {
              object: workspaceFolders,
              method: "normalizeUriPath",
              callsFake: (path: string) => path.replace("/./fake", ""),
            },
            {
              object: scan,
              method: "createWorkspaceData",
              returns: getWorkspaceData(),
            },
            {
              object: asyncUtils,
              method: "sleep",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: Promise.resolve(uris),
            },
            {
              object: vscode.workspace,
              method: "openTextDocument",
            },
            {
              object: vscode.commands,
              method: "executeCommand",
            },
          ],
          sandbox
        );
        return { getSymbolsForUriStub, uris };
      },
    },

    urisToRetry: {
      setupForTimedOutLanguages: (timedOutLanguages: string[]) => {
        stubConfig(sandbox);
        const [warmupStub] = stubMultiple(
          [
            {
              object: warmup,
              method: "warmupLanguageServers",
              returns: Promise.resolve(new Set(timedOutLanguages)),
            },
            {
              object: documentSymbols,
              method: "getSymbolsForUri",
              returns: Promise.resolve(undefined),
            },
            {
              object: files,
              method: "statUri",
              returns: Promise.resolve(undefined),
            },
            {
              object: config,
              method: "fetchIndexNamesOnly",
              returns: "",
            },
          ],
          sandbox
        );
        return warmupStub;
      },
    },

    fetchConfig: {
      setupForFetchingItemsFilter: () => {
        const configuration = getConfiguration().searchEverywhere;
        const expected = configuration.itemsFilter;
        stubMultiple(
          [
            {
              object: config,
              method: "fetchItemsFilter",
              returns: expected,
            },
            {
              object: patternProvider,
              method: "fetchConfig",
            },
          ],
          sandbox
        );
        return expected;
      },

      setupForInvokingPatternProviderFetchConfig: () => {
        return stubMultiple(
          [
            {
              object: patternProvider,
              method: "fetchConfig",
            },
            {
              object: config,
              method: "fetchItemsFilter",
            },
          ],
          sandbox
        );
      },
    },
  };
};
