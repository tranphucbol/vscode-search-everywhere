import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../platform/cache";
import * as config from "../../platform/config";
import { dataConverter } from "../../symbols/dataConverter";
import { dataService } from "../../symbols/dataService";
import { database } from "../../database";
import { logger } from "../../platform/logger";
import * as presets from "../../platform/presets";
import { ExcludeMode } from "../../shared/types";
import { pathUtils } from "../../shared/paths";
import { workspaceFolders } from "../../shared/workspaceFolders";
import { workspace } from "../../indexing/workspace";
import * as events from "../../shared/events";
import { workspaceIndexer as indexer } from "../../indexing/workspaceIndexer";
import { retryQueue } from "../../indexing/workspaceUpdater";
import { getItems } from "../util/itemMockFactory";
import { getEventEmitter } from "../util/mockFactory";
import { getFileSystemWatcherStub } from "../util/stubFactory";
import { stubChanges } from "../util/changesStub";
import { insertAt, stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    init: {
      setupForComparingIndexedConfig: (
        indexedConfig: string | undefined,
        currentConfig: string
      ) => {
        return stubMultiple(
          [
            {
              object: database,
              method: "clearAll",
            },
            {
              object: logger,
              method: "log",
            },
            {
              object: cache,
              method: "getIndexedConfig",
              returns: indexedConfig,
            },
            {
              object: config,
              method: "fetchIndexedConfigSnapshot",
              returns: currentConfig,
            },
            {
              object: cache,
              method: "clearConfig",
            },
            {
              object: presets,
              method: "refreshPresets",
              returns: Promise.resolve(false),
            },
            {
              object: workspaceFolders,
              method: "setWorkspaceFoldersCommonPath",
            },
            {
              object: dataService,
              method: "fetchConfig",
            },
            {
              object: dataConverter,
              method: "fetchConfig",
            },
          ],
          sandbox
        );
      },

      setupForInvokingSetWorkspaceFoldersCommonPath: () => {
        return stubMultiple(
          [
            {
              object: workspaceFolders,
              method: "setWorkspaceFoldersCommonPath",
            },
            {
              object: dataService,
              method: "fetchConfig",
            },
            {
              object: dataConverter,
              method: "fetchConfig",
            },
          ],
          sandbox
        );
      },

      setupForInvokingDataServiceFetchConfig: () => {
        return stubMultiple(
          [
            {
              object: dataService,
              method: "fetchConfig",
            },
            {
              object: workspaceFolders,
              method: "setWorkspaceFoldersCommonPath",
            },
            {
              object: dataConverter,
              method: "fetchConfig",
            },
          ],
          sandbox
        );
      },

      setupForInvokingDataConverterFetchConfig: () => {
        return stubMultiple(
          [
            {
              object: dataConverter,
              method: "fetchConfig",
            },
            {
              object: dataService,
              method: "fetchConfig",
            },
            {
              object: workspaceFolders,
              method: "setWorkspaceFoldersCommonPath",
            },
          ],
          sandbox
        );
      },
    },

    index: {
      setupForInvokingReindexMethod: () => {
        return stubMultiple(
          [
            {
              object: indexer,
              method: "reindex",
            },
          ],
          sandbox
        );
      },
    },

    removeDataForUnsavedUris: {
      setupForInvokingRegisterActionTwiceForEachUnsavedUri: () => {
        let notSavedUris: string[] = ["/test/path1", "/test/path2"];

        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: cache,
              method: "getNotSavedUriPaths",
              callsFake: () => notSavedUris,
            },
            {
              object: cache,
              method: "updateNotSavedUriPaths",
              callsFake: (paths: string[]) => (notSavedUris = paths),
            },
          ],
          sandbox
        )];
      },

      setupForClearingArrayOfUnsavedUris: () => {
        let notSavedUris: string[] = ["/test/path1", "/test/path2"];

        [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: cache,
              method: "getNotSavedUriPaths",
              callsFake: () => notSavedUris,
            },
            {
              object: cache,
              method: "updateNotSavedUriPaths",
              callsFake: (paths: string[]) => (notSavedUris = paths),
            },
            {
              object: cache,
              method: "clearNotSavedUriPaths",
              callsFake: () => (notSavedUris = []),
            },
          ],
          sandbox
        )];
      },
    },

    registerEventListeners: {
      setupForRegisteringWorkspaceEventListeners: () => {
        return stubMultiple(
          [
            {
              object: vscode.workspace,
              method: "onDidChangeConfiguration",
            },
            {
              object: vscode.workspace,
              method: "onDidChangeWorkspaceFolders",
            },
            {
              object: vscode.workspace,
              method: "onDidChangeTextDocument",
            },
            {
              object: vscode.workspace,
              method: "onDidSaveTextDocument",
            },
            {
              object: events,
              method: "onWillIndexWorkspace",
            },
            {
              object: events,
              method: "onDidIndexWorkspace",
            },
            {
              object: vscode.workspace,
              method: "createFileSystemWatcher",
              callsFake: getFileSystemWatcherStub,
            },
            {
              object: config,
              method: "fetchWatchFileSystem",
              returns: true,
            },
          ],
          sandbox
        );
      },
      setupForRetryQueue: () => ({
        stopStub: sandbox.stub(retryQueue, "stop"),
        startStub: sandbox.stub(retryQueue, "start"),
      }),
    },

    getData: {
      setupForInvokingCommonGetDataMethod: () => {
        return stubMultiple(
          [
            {
              object: indexer,
              method: "getData",
              returns: getItems(),
            },
          ],
          sandbox
        );
      },
    },

    shouldReindexOnConfigurationChange: {
      setupForReturningTrueWhenConfigurationChangedAndNotExcluded: () => {
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
              returns: ExcludeMode.SearchEverywhere,
            },
          ],
          sandbox
        );
      },

      setupForReturningFalseWhenConfigurationChangedButExcluded: () => {
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
              returns: ExcludeMode.SearchEverywhere,
            },
          ],
          sandbox
        );
      },

      setupForReturningFalseWhenConfigurationNotChanged: () => {
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
              returns: ExcludeMode.SearchEverywhere,
            },
          ],
          sandbox
        );
      },

      setupForReturningTrueWhenFilesAndSearchModeAndFilesExcludeChanged: () => {
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
              returns: ExcludeMode.FilesAndSearch,
            },
          ],
          sandbox
        );
      },

      setupForReturningTrueWhenFilesAndSearchModeAndSearchExcludeChanged:
        () => {
          stubMultiple(
            [
              {
                object: config,
                method: "fetchExcludeMode",
                returns: ExcludeMode.FilesAndSearch,
              },
            ],
            sandbox
          );
        },
    },

    handleDidChangeConfiguration: {
      setupForInvokingIndexWhenExtensionConfigurationChanged: () => {
        return stubMultiple(
          [
            {
              object: workspace,
              method: "index",
            },
            {
              object: workspace,
              method: "shouldReindexOnConfigurationChange",
              returns: true,
            },
            {
              object: cache,
              method: "clearConfig",
            },
            {
              object: dataConverter,
              method: "fetchConfig",
            },
            {
              object: dataConverter,
              method: "reload",
            },
            {
              object: dataService,
              method: "fetchConfig",
            },
            {
              object: dataService,
              method: "reload",
            },
            {
              object: config,
              method: "fetchExcludeMode",
            },
          ],
          sandbox
        );
      },

      setupForEmittingDebounceConfigToggleEvent: () => {
        const eventEmitter = getEventEmitter();

        stubMultiple(
          [
            {
              object: workspace,
              method: "shouldReindexOnConfigurationChange",
              returns: false,
            },
            {
              object: config,
              method: "isDebounceConfigurationToggled",
              returns: true,
            },
            {
              object: events,
              method: "onDidDebounceConfigToggleEventEmitter",
              returns: eventEmitter,
              isNotMethod: true,
            },
            {
              object: cache,
              method: "clearConfig",
            },
          ],
          sandbox
        );

        return eventEmitter;
      },

      setupForEmittingSortingConfigToggleEvent: () => {
        const eventEmitter = getEventEmitter();

        stubMultiple(
          [
            {
              object: workspace,
              method: "shouldReindexOnConfigurationChange",
              returns: false,
            },
            {
              object: config,
              method: "isDebounceConfigurationToggled",
              returns: false,
            },
            {
              object: config,
              method: "isSortingConfigurationToggled",
              returns: true,
            },
            {
              object: events,
              method: "onDidSortingConfigToggleEventEmitter",
              returns: eventEmitter,
              isNotMethod: true,
            },
            {
              object: cache,
              method: "clearConfig",
            },
          ],
          sandbox
        );

        return eventEmitter;
      },

      setupForRecomputingSecondaryCode: () => {
        return stubMultiple(
          [
            {
              object: workspace,
              method: "shouldReindexOnConfigurationChange",
              returns: false,
            },
            {
              object: workspace,
              method: "index",
            },
            {
              object: config,
              method: "isDebounceConfigurationToggled",
              returns: false,
            },
            {
              object: config,
              method: "isSortingConfigurationToggled",
              returns: false,
            },
            {
              object: config,
              method: "fetchSecondaryCode",
              returns: ["**/*_test.go"],
            },
            {
              object: database,
              method: "recomputeSecondary",
            },
            {
              object: cache,
              method: "clearConfig",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForDoingNothingWhenExtensionConfigurationNotChanged: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: events,
              method: "onDidDebounceConfigToggleEventEmitter",
            },
            {
              object: workspace,
              method: "shouldReindexOnConfigurationChange",
              returns: false,
            },
            {
              object: config,
              method: "isDebounceConfigurationToggled",
              returns: false,
            },
            {
              object: config,
              method: "isSortingConfigurationToggled",
              returns: false,
            },
            {
              object: cache,
              method: "clearConfig",
            },
          ],
          sandbox
        )];
      },

      setupForInvokingCacheClearConfigMethod: () => {
        return stubMultiple(
          [
            {
              object: cache,
              method: "clearConfig",
            },
            {
              object: config,
              method: "fetchExcludeMode",
            },
            {
              object: workspace,
              method: "shouldReindexOnConfigurationChange",
              returns: false,
            },
            {
              object: config,
              method: "isDebounceConfigurationToggled",
            },
            {
              object: config,
              method: "isSortingConfigurationToggled",
              returns: false,
            },
          ],
          sandbox
        );
      },
    },

    handleDidChangeWorkspaceFolders: {
      setupForInvokingIndexWhenWorkspaceFoldersChanged: () => {
        return stubMultiple(
          [
            {
              object: workspace,
              method: "index",
            },
            {
              object: workspaceFolders,
              method: "hasWorkspaceChanged",
              returns: true,
            },
            {
              object: presets,
              method: "refreshPresets",
              returns: Promise.resolve(false),
            },
            {
              object: workspace,
              method: "reloadConfig",
            },
          ],
          sandbox
        );
      },

      setupForDoingNothingWhenWorkspaceFoldersNotChanged: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: workspaceFolders,
              method: "hasWorkspaceChanged",
              returns: false,
            },
          ],
          sandbox
        )];
      },
    },

    handleDidChangeMarkerFile: {
      setupForMarkerFile: (isRootMarker: boolean, presetsChanged: boolean) => {
        return stubMultiple(
          [
            {
              object: workspace,
              method: "index",
            },
            {
              object: workspace,
              method: "reloadConfig",
            },
            {
              object: presets,
              method: "isRootMarker",
              returns: isRootMarker,
            },
            {
              object: presets,
              method: "refreshPresets",
              returns: Promise.resolve(presetsChanged),
            },
          ],
          sandbox
        );
      },
    },

    handleDidChangeTextDocument: {
      setupForRegisteringUpdateActionWhenDocumentChangedAndExistsInWorkspace:
        () => {
          return [stubChanges(sandbox), ...stubMultiple(
            [
              {
                object: dataService,
                method: "isUriExistingInWorkspace",
                returns: Promise.resolve(true),
              },
            ],
            sandbox
          )];
        },

      setupForDoingNothingWhenDocumentNotExistInWorkspace: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: dataService,
              method: "isUriExistingInWorkspace",
              returns: Promise.resolve(false),
            },
          ],
          sandbox
        )];
      },

      setupForDoingNothingWhenDocumentNotChanged: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: dataService,
              method: "isUriExistingInWorkspace",
              returns: Promise.resolve(true),
            },
          ],
          sandbox
        )];
      },

      setupForAddingUriToNotSavedArrayWhenDocumentChangedAndExistsInWorkspace:
        () => {
          let notSavedUris: string[] = [];

          insertAt(stubMultiple(
            [
              {
                object: cache,
                method: "getNotSavedUriPaths",
                callsFake: () => notSavedUris,
              },
              {
                object: cache,
                method: "updateNotSavedUriPaths",
                callsFake: (paths: string[]) => (notSavedUris = paths),
              },
              {
                object: dataService,
                method: "isUriExistingInWorkspace",
                returns: Promise.resolve(true),
              },
            ],
            sandbox
          ), 2, stubChanges(sandbox));
        },
    },

    handleDidRenameFiles: {
      setupForRegisteringRemoveAndUpdateActionsForRenamedFiles: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: false,
            },
          ],
          sandbox
        )];
      },

      setupForRegisteringUpdateActionForRenamedDirectory: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: true,
            },
          ],
          sandbox
        )];
      },
    },

    handleDidCreateFiles: {
      setupForRegisteringUpdateActionWhenFileCreated: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: false,
            },
          ],
          sandbox
        )];
      },

      setupForRegisteringUpdateActionWhenDirectoryCreated: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: true,
            },
          ],
          sandbox
        )];
      },

      setupForAddingUriToNotSavedArray: () => {
        let notSavedUris: string[] = [];

        return insertAt(stubMultiple(
          [
            {
              object: cache,
              method: "getNotSavedUriPaths",
              callsFake: () => notSavedUris,
            },
            {
              object: cache,
              method: "updateNotSavedUriPaths",
              callsFake: (paths: string[]) => (notSavedUris = paths),
            },
            {
              object: pathUtils,
              method: "isDirectory",
              returns: true,
            },
          ],
          sandbox
        ), 2, stubChanges(sandbox));
      },
    },

    handleDidDeleteFiles: {
      setupForRegisteringRemoveActionWhenFileDeleted: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: false,
            },
          ],
          sandbox
        )];
      },

      setupForRegisteringRemoveActionWhenDirectoryDeleted: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: true,
            },
          ],
          sandbox
        )];
      },
    },

    handleDidSaveTextDocument: {
      setupForRemovingUriFromNotSavedArray: () => {
        let notSavedUris: string[] = [
          "/test/path1",
          "/test/path2",
          "/test/path3",
        ];

        return stubMultiple(
          [
            {
              object: cache,
              method: "getNotSavedUriPaths",
              callsFake: () => notSavedUris,
            },
            {
              object: cache,
              method: "updateNotSavedUriPaths",
              callsFake: (paths: string[]) => (notSavedUris = paths),
            },
          ],
          sandbox
        );
      },
    },

  };
};
