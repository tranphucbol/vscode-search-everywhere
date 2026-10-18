import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../platform/cache";
import * as config from "../../platform/config";
import { database } from "../../database";
import { logger } from "../../platform/logger";
import * as presets from "../../platform/presets";
import { dataConverter } from "../../symbols/items/dataConverter";
import { scan } from "../../symbols/scan/scan";
import { workspaceFolders } from "../../shared/workspaceFolders";
import * as events from "../../shared/events";
import { retryQueue } from "../../indexing/queue/retryQueue";
import { getFileSystemWatcherStub } from "../util/stubFactory";
import { changes } from "../../indexing/queue/changes";
import { lifecycle, QuickPickHandle } from "../../indexing/lifecycle";
import { unsavedFiles } from "../../indexing/sources/unsavedFiles";
import { reconciler } from "../../indexing/sources/reconciler";
import { worktreeSync } from "../../indexing/sources/worktreeSync";
import { stubMultiple } from "../util/stubHelpers";

const emptyReconcileResult = {
  added: 0,
  changed: 0,
  removed: 0,
  fullIndex: false,
  baseline: false,
};

function getQuickPickHandle(isInitialized: boolean) {
  const handle: QuickPickHandle = {
    isInitialized: () => isInitialized,
    init: () => {},
  };
  const initStub = sinon.stub(handle, "init");
  return { handle, initStub };
}

function stubSettings(
  sandbox: sinon.SinonSandbox,
  values: {
    fetchShouldInitOnStartup: boolean;
    fetchShouldWorkspaceDataBeCached: boolean;
    isEmpty?: boolean;
  }
) {
  return stubMultiple(
    [
      {
        object: config,
        method: "fetchShouldInitOnStartup",
        returns: values.fetchShouldInitOnStartup,
      },
      {
        object: config,
        method: "fetchShouldWorkspaceDataBeCached",
        returns: values.fetchShouldWorkspaceDataBeCached,
      },
      {
        object: database,
        method: "isEmpty",
        returns: values.isEmpty ?? true,
      },
    ],
    sandbox
  );
}

function stubPair(
  sandbox: sinon.SinonSandbox,
  first: keyof typeof lifecycle,
  second: keyof typeof lifecycle,
  firstReturns: boolean,
  secondReturns: boolean
) {
  stubMultiple(
    [
      { object: lifecycle, method: first, returns: firstReturns },
      { object: lifecycle, method: second, returns: secondReturns },
    ],
    sandbox
  );
}

function stubComponentsForQuickPickOpen(
  sandbox: sinon.SinonSandbox,
  values: {
    shouldIndexOnQuickPickOpen: boolean;
    shouldLoadDataFromCacheOnQuickPickOpen: boolean;
    reindex?: Promise<void>;
  }
) {
  const quickPick = getQuickPickHandle(false);
  sandbox.stub(quickPick.handle, "isInitialized").callsFake(
    () => quickPick.initStub.called
  );
  const [reindexStub, clearConfigStub, reloadAllStub] = stubMultiple(
    [
      {
        object: changes,
        method: "reindex",
        returns: values.reindex ?? Promise.resolve(),
      },
      { object: cache, method: "clearConfig" },
      { object: unsavedFiles, method: "reloadAll" },
      {
        object: lifecycle,
        method: "shouldIndexOnQuickPickOpen",
        returns: values.shouldIndexOnQuickPickOpen,
      },
      {
        object: lifecycle,
        method: "shouldLoadDataFromCacheOnQuickPickOpen",
        callsFake: (isQuickPickInitialized: boolean) =>
          values.shouldLoadDataFromCacheOnQuickPickOpen && !isQuickPickInitialized,
      },
    ],
    sandbox
  );
  return {
    quickPick: quickPick.handle,
    initStub: quickPick.initStub,
    reindexStub,
    clearConfigStub,
    reloadAllStub,
  };
}

function stubComponentsForStartup(
  sandbox: sinon.SinonSandbox,
  values: {
    shouldIndexOnStartup?: boolean;
    shouldLoadDataFromCacheOnStartup?: boolean;
    shouldReconcileOnStartup?: boolean;
    wasSeededFromTemplate?: boolean;
    syncSeededWorktree?: Promise<void>;
    workspaceFolders?: vscode.WorkspaceFolder[];
  }
) {
  const quickPick = getQuickPickHandle(false);
  const [
    reindexStub,
    clearConfigStub,
    reloadAllStub,
    reconcileStub,
    syncSeededWorktreeStub,
    logStub,
  ] = stubMultiple(
    [
      { object: changes, method: "reindex" },
      { object: cache, method: "clearConfig" },
      { object: unsavedFiles, method: "reloadAll" },
      {
        object: reconciler,
        method: "reconcile",
        returns: Promise.resolve(emptyReconcileResult),
      },
      {
        object: worktreeSync,
        method: "syncSeededWorktree",
        returns: values.syncSeededWorktree ?? Promise.resolve(),
      },
      { object: logger, method: "log" },
      {
        object: database,
        method: "wasSeededFromTemplate",
        returns: !!values.wasSeededFromTemplate,
      },
      { object: database, method: "setSeededFromTemplate" },
      {
        object: vscode.workspace,
        method: "workspaceFolders",
        isNotMethod: true,
        returns: values.workspaceFolders,
      },
      {
        object: lifecycle,
        method: "shouldIndexOnStartup",
        returns: !!values.shouldIndexOnStartup,
      },
      {
        object: lifecycle,
        method: "shouldLoadDataFromCacheOnStartup",
        returns: !!values.shouldLoadDataFromCacheOnStartup,
      },
      {
        object: lifecycle,
        method: "shouldReconcileOnStartup",
        returns: !!values.shouldReconcileOnStartup,
      },
    ],
    sandbox
  );
  return {
    quickPick: quickPick.handle,
    initStub: quickPick.initStub,
    reindexStub,
    clearConfigStub,
    reloadAllStub,
    reconcileStub,
    syncSeededWorktreeStub,
    logStub,
  };
}

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
              object: scan,
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
              object: scan,
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

      setupForInvokingScanFetchConfig: () => {
        return stubMultiple(
          [
            {
              object: scan,
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
              object: scan,
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

    prepareQuickPickOpen: {
      setupForIndexingOnOpen: (reindex?: Promise<void>) =>
        stubComponentsForQuickPickOpen(sandbox, {
          shouldIndexOnQuickPickOpen: true,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
          reindex,
        }),

      setupForLoadingFromCache: () =>
        stubComponentsForQuickPickOpen(sandbox, {
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: true,
        }),

      setupForIndexingAnEmptyCache: () =>
        stubComponentsForQuickPickOpen(sandbox, {
          shouldIndexOnQuickPickOpen: true,
          shouldLoadDataFromCacheOnQuickPickOpen: true,
        }),

      setupForDoingNothing: () =>
        stubComponentsForQuickPickOpen(sandbox, {
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
        }),
    },

    reload: {
      setupForReindexing: () =>
        stubMultiple(
          [
            { object: unsavedFiles, method: "clear" },
            { object: changes, method: "reindex" },
          ],
          sandbox
        ),
    },

    isRebuilding: {
      setupForRebuilding: () =>
        stubMultiple([{ object: changes, method: "isRebuilding", returns: true }], sandbox),
    },

    startup: {
      setupForIndexingWhenEnabledOnStartup: () =>
        stubComponentsForStartup(sandbox, { shouldIndexOnStartup: true }),

      setupForDoingNothingWhenConditionsFalse: () =>
        stubComponentsForStartup(sandbox, {}),

      setupForLoadingFromCacheOnStartup: () =>
        stubComponentsForStartup(sandbox, {
          shouldLoadDataFromCacheOnStartup: true,
        }),

      setupForReconcilingCachedIndex: () =>
        stubComponentsForStartup(sandbox, { shouldReconcileOnStartup: true }),

      setupForSeededWorktree: (syncSeededWorktree?: Promise<void>) =>
        stubComponentsForStartup(sandbox, {
          wasSeededFromTemplate: true,
          shouldIndexOnStartup: true,
          shouldReconcileOnStartup: true,
          syncSeededWorktree,
          workspaceFolders: [
            { uri: vscode.Uri.file("/workspace"), name: "workspace", index: 0 },
          ],
        }),
    },

    shouldIndexOnQuickPickOpen: {
      setupForConditions: (cachingDisabled: boolean, cacheEmpty: boolean) =>
        stubPair(
          sandbox,
          "isInitOnStartupDisabledAndWorkspaceCachingDisabled",
          "isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty",
          cachingDisabled,
          cacheEmpty
        ),
    },

    shouldIndexOnStartup: {
      setupForConditions: (cachingDisabled: boolean, cacheEmpty: boolean) =>
        stubPair(
          sandbox,
          "isInitOnStartupEnabledAndWorkspaceCachingDisabled",
          "isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty",
          cachingDisabled,
          cacheEmpty
        ),
    },

    settings: {
      setupForSettings: (values: {
        fetchShouldInitOnStartup: boolean;
        fetchShouldWorkspaceDataBeCached: boolean;
        isEmpty?: boolean;
      }) => stubSettings(sandbox, values),
    },
  };
};
