import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../platform/cache";
import * as config from "../../platform/config";
import { dataConverter } from "../../symbols/dataConverter";
import { dataService } from "../../symbols/dataService";
import { database } from "../../database";
import { logger } from "../../platform/logger";
import * as presets from "../../platform/presets";
import { workspaceFolders } from "../../shared/workspaceFolders";
import * as events from "../../shared/events";
import { retryQueue } from "../../indexing/retryQueue";
import { getFileSystemWatcherStub } from "../util/stubFactory";
import { stubMultiple } from "../util/stubHelpers";

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
  };
};
