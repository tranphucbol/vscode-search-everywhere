import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../../platform/cache";
import * as config from "../../../platform/config";
import { dataConverter } from "../../../symbols/dataConverter";
import { dataService } from "../../../symbols/dataService";
import { database } from "../../../database";
import * as presets from "../../../platform/presets";
import { ExcludeMode } from "../../../shared/types";
import { workspaceFolders } from "../../../shared/workspaceFolders";
import { settingsEvents } from "../../../indexing/sources/settingsEvents";
import * as events from "../../../shared/events";
import { changes } from "../../../indexing/queue/changes";
import { getEventEmitter } from "../../util/mockFactory";
import { getFileSystemWatcherStub } from "../../util/stubFactory";
import { stubChanges } from "../../util/changesStub";
import { stubMultiple } from "../../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
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
              object: changes,
              method: "reindex",
            },
            {
              object: settingsEvents,
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
              object: settingsEvents,
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
              object: settingsEvents,
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
              object: settingsEvents,
              method: "shouldReindexOnConfigurationChange",
              returns: false,
            },
            {
              object: changes,
              method: "reindex",
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
              object: settingsEvents,
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
              object: settingsEvents,
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
              object: changes,
              method: "reindex",
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
              object: settingsEvents,
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
              object: changes,
              method: "reindex",
            },
            {
              object: settingsEvents,
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

    register: {
      setupForRegisteringListeners: () => {
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
              method: "createFileSystemWatcher",
              callsFake: getFileSystemWatcherStub,
            },
          ],
          sandbox
        );
      },
    },
  };
};
