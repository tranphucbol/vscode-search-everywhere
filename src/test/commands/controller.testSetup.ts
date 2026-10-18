import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../platform/cache";
import * as config from "../../platform/config";
import { controller } from "../../commands/controller";
import { database } from "../../database";
import { gitService } from "../../platform/gitService";
import { logger } from "../../platform/logger";
import { patternProvider } from "../../platform/patternProvider";
import { quickPick } from "../../quickPick/quickPick";
import { asyncUtils } from "../../shared/async";
import { messages } from "../../shared/messages";
import { workspaceFolders } from "../../shared/workspaceFolders";
import { unsavedFiles } from "../../indexing/unsavedFiles";
import { workspace } from "../../indexing/workspace";
import { changes } from "../../indexing/changes";
import { workspaceIndexer } from "../../indexing/workspaceIndexer";
import * as workspaceEventsEmitter from "../../shared/events";
import { workspaceReconciler } from "../../indexing/workspaceReconciler";
import { getExtensionContext } from "../util/mockFactory";
import { getQpItem, getQpItems } from "../util/qpItemMockFactory";
import { getTextEditorStub } from "../util/stubFactory";
import { stubChanges } from "../util/changesStub";
import { stubMultiple } from "../util/stubHelpers";

function stubComponents(sandbox: sinon.SinonSandbox) {
  return stubMultiple(
    [
      {
        object: cache,
        method: "initCache",
      },
      {
        object: workspace,
        method: "init",
      },
      {
        object: workspace,
        method: "registerEventListeners",
      },
      {
        object: workspaceEventsEmitter,
        method: "onWillProcessing",
      },
      {
        object: workspaceEventsEmitter,
        method: "onDidProcessing",
      },
      {
        object: workspaceEventsEmitter,
        method: "onWillExecuteAction",
      },
      {
        object: workspaceEventsEmitter,
        method: "onDidDebounceConfigToggle",
      },
      {
        object: workspaceEventsEmitter,
        method: "onWillReindexOnConfigurationChange",
      },
    ],
    sandbox
  );
}

function stubComponentsForStartup(
  sandbox: sinon.SinonSandbox,
  returnsValues: { [key: string]: any }
) {
  return stubMultiple(
    [
      {
        object: unsavedFiles,
        method: "reloadAll",
        returns: returnsValues.removeDataForUnsavedUris,
      },
      {
        object: quickPick,
        method: "init",
        returns: returnsValues.init,
      },
      {
        object: cache,
        method: "clearConfig",
        returns: returnsValues.clearConfig,
      },
      {
        object: workspaceIndexer,
        method: "getData",
        returns: returnsValues.getData,
      },
      {
        object: quickPick,
        method: "setItems",
        returns: returnsValues.setItems,
      },
      {
        object: changes,
        method: "reindex",
        returns: returnsValues.index,
      },
      {
        object: quickPick,
        method: "isInitialized",
        returns: returnsValues.isInitialized,
      },
      {
        object: controller,
        method: "shouldIndexOnStartup",
        returns: returnsValues.shouldIndexOnStartup,
      },
      {
        object: controller,
        method: "shouldLoadDataFromCacheOnStartup",
        returns: returnsValues.shouldLoadDataFromCacheOnStartup,
      },
      {
        object: controller,
        method: "shouldReconcileOnStartup",
        returns: !!returnsValues.shouldReconcileOnStartup,
      },
      {
        object: workspaceReconciler,
        method: "reconcile",
        returns: Promise.resolve(emptyReconcileResult),
      },
    ],
    sandbox
  );
}

const emptyReconcileResult = {
  added: 0,
  changed: 0,
  removed: 0,
  fullIndex: false,
  baseline: false,
};

const seededRoot = vscode.Uri.file("/workspace");

function stubSeededStartup(
  sandbox: sinon.SinonSandbox,
  options: {
    commit?: string;
    changedPaths?: string[];
    workingTreePaths?: string[];
    existingPaths?: string[];
  }
) {
  const folder = { uri: seededRoot, name: "workspace", index: 0 };
  const existingPaths = options.existingPaths || [];
  const [queuedStub, indexStub, clearAllStub, restatAllStub] = [stubChanges(sandbox), ...stubMultiple(
    [
      {
        object: changes,
        method: "reindex",
      },
      {
        object: database,
        method: "clearAll",
      },
      {
        object: workspaceReconciler,
        method: "restatAll",
        returns: Promise.resolve(0),
      },
      {
        object: database,
        method: "wasSeededFromTemplate",
        returns: true,
      },
      {
        object: database,
        method: "setSeededFromTemplate",
      },
      {
        object: database,
        method: "getSeedMeta",
        returns: { commit: options.commit },
      },
      {
        object: cache,
        method: "clearConfig",
      },
      {
        object: quickPick,
        method: "isInitialized",
        returns: true,
      },
      {
        object: unsavedFiles,
        method: "reloadAll",
      },
      {
        object: vscode.workspace,
        method: "workspaceFolders",
        isNotMethod: true,
        returns: [folder],
      },
      {
        object: vscode.workspace,
        method: "getWorkspaceFolder",
        callsFake: (uri: vscode.Uri) =>
          uri.fsPath.startsWith(seededRoot.fsPath) ? folder : undefined,
      },
      {
        object: gitService,
        method: "getChangedPathsBetween",
        returns: Promise.resolve(options.changedPaths),
      },
      {
        object: gitService,
        method: "getWorkingTreePaths",
        returns: Promise.resolve(options.workingTreePaths || []),
      },
      {
        object: gitService,
        method: "getRepoRoot",
        returns: Promise.resolve(seededRoot.fsPath),
      },
      {
        object: controller,
        method: "isIndexableFile",
        callsFake: (uri: vscode.Uri) => existingPaths.includes(uri.fsPath),
      },
      {
        object: logger,
        method: "log",
      },
    ],
    sandbox
  )];
  return { queuedStub, indexStub, clearAllStub, restatAllStub };
}

function stubComponentsForSearch(
  sandbox: sinon.SinonSandbox,
  returnsValues: { [key: string]: any }
) {
  return stubMultiple(
    [
      {
        object: changes,
        method: "reindex",
        returns: returnsValues.index ?? Promise.resolve(),
      },
      {
        object: cache,
        method: "clear",
        returns: returnsValues.clear,
      },
      {
        object: cache,
        method: "clearConfig",
        returns: returnsValues.clearConfig,
      },
      {
        object: quickPick,
        method: "init",
        returns: returnsValues.init,
      },
      {
        object: unsavedFiles,
        method: "reloadAll",
        returns: returnsValues.removeDataForUnsavedUris,
      },
      {
        object: workspaceIndexer,
        method: "getData",
        returns: returnsValues.getData,
      },
      {
        object: quickPick,
        method: "setItems",
        returns: returnsValues.setItems,
      },
      {
        object: quickPick,
        method: "isInitialized",
        returns: returnsValues.isInitialized,
      },
      {
        object: controller,
        method: "shouldIndexOnQuickPickOpen",
        returns: returnsValues.shouldIndexOnQuickPickOpen,
      },
      {
        object: controller,
        method: "shouldLoadDataFromCacheOnQuickPickOpen",
        returns: returnsValues.shouldIndexOnQuickPickOpen,
      },
      {
        object: controller,
        method: "shouldSearchSelection",
        returns: returnsValues.shouldSearchSelection,
      },
    ],
    sandbox
  );
}

function stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
  sandbox: sinon.SinonSandbox,
  returnsValues: { [key: string]: any }
) {
  return stubMultiple(
    [
      {
        object: quickPick,
        method: "isInitialized",
        returns: returnsValues.isInitialized,
      },
      {
        object: config,
        method: "fetchShouldInitOnStartup",
        returns: returnsValues.fetchShouldInitOnStartup,
      },
      {
        object: config,
        method: "fetchShouldWorkspaceDataBeCached",
        returns: returnsValues.fetchShouldWorkspaceDataBeCached,
      },
      {
        object: workspaceIndexer,
        method: "getData",
        returns: returnsValues.getData,
      },
      {
        object: database,
        method: "isEmpty",
        returns: !(returnsValues.getData && returnsValues.getData.length),
      },
    ],
    sandbox
  );
}

function stubComponentsForShouldLoadDataFromCacheOnQuickPickOpen(
  sandbox: sinon.SinonSandbox,
  returnsValues: { [key: string]: any }
) {
  return stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
    sandbox,
    returnsValues
  );
}

function stubComponentsForShouldLoadDataFromCacheOnStartup(
  sandbox: sinon.SinonSandbox,
  returnsValues: { [key: string]: any }
) {
  return stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
    sandbox,
    returnsValues
  );
}

function stubComponentsForShouldSearchSelection(
  sandbox: sinon.SinonSandbox,
  returnsValues: { [key: string]: any }
) {
  return stubMultiple(
    [
      {
        object: quickPick,
        method: "isInitialized",
        returns: returnsValues.isInitialized,
      },
      {
        object: config,
        method: "fetchShouldSearchSelection",
        returns: returnsValues.fetchShouldSearchSelection,
      },
    ],
    sandbox
  );
}

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    init: {
      setupForExtensionContextAssignment: () => {
        stubMultiple(
          [
            {
              object: cache,
              method: "initCache",
            },
            {
              object: workspace,
              method: "init",
            },
            {
              object: workspace,
              method: "registerEventListeners",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillProcessing",
            },
            {
              object: workspaceEventsEmitter,
              method: "onDidProcessing",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillExecuteAction",
            },
            {
              object: workspaceEventsEmitter,
              method: "onDidDebounceConfigToggle",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillReindexOnConfigurationChange",
            },
          ],
          sandbox
        );
        return getExtensionContext();
      },

      setupForCacheInitialization: () => {
        return stubMultiple(
          [
            {
              object: cache,
              method: "initCache",
            },
            {
              object: workspace,
              method: "init",
            },
            {
              object: workspace,
              method: "registerEventListeners",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillProcessing",
            },
            {
              object: workspaceEventsEmitter,
              method: "onDidProcessing",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillExecuteAction",
            },
            {
              object: workspaceEventsEmitter,
              method: "onDidDebounceConfigToggle",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillReindexOnConfigurationChange",
            },
          ],
          sandbox
        );
      },

      setupForWorkspaceInitialization: () => {
        return stubMultiple(
          [
            {
              object: workspace,
              method: "init",
            },
            {
              object: cache,
              method: "initCache",
            },
            {
              object: workspace,
              method: "registerEventListeners",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillProcessing",
            },
            {
              object: workspaceEventsEmitter,
              method: "onDidProcessing",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillExecuteAction",
            },
            {
              object: workspaceEventsEmitter,
              method: "onDidDebounceConfigToggle",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillReindexOnConfigurationChange",
            },
          ],
          sandbox
        );
      },

      setupForEventListenerRegistration: () => {
        return stubMultiple(
          [
            {
              object: workspaceEventsEmitter,
              method: "onWillProcessing",
            },
            {
              object: workspaceEventsEmitter,
              method: "onDidProcessing",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillExecuteAction",
            },
            {
              object: workspaceEventsEmitter,
              method: "onDidDebounceConfigToggle",
            },
            {
              object: workspaceEventsEmitter,
              method: "onWillReindexOnConfigurationChange",
            },
            {
              object: workspace,
              method: "init",
            },
            {
              object: cache,
              method: "initCache",
            },
            {
              object: workspace,
              method: "registerEventListeners",
            },
          ],
          sandbox
        );
      },
    },

    toggleIncludeLibraries: {
      setupForTogglingIncludeLibraries: () => {
        return stubMultiple(
          [
            { object: quickPick, method: "isInitialized", returns: true },
            { object: quickPick, method: "toggleIncludeLibraries" },
          ],
          sandbox
        );
      },
    },

    search: {
      setupForClearingCacheWhenIndexingOnOpen: () => {
        stubComponents(sandbox);
        return stubComponentsForSearch(sandbox, {
          isInitialized: false,
          shouldIndexOnQuickPickOpen: true,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
        });
      },

      setupForWorkspaceIndexingWhenIndexingOnOpen: () => {
        stubComponents(sandbox);
        return stubComponentsForSearch(sandbox, {
          isInitialized: false,
          shouldIndexOnQuickPickOpen: true,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
        });
      },

      setupForShowingQuickPickBeforeTheFirstIndexFinishes: () => {
        stubComponents(sandbox);
        const [indexStub] = stubComponentsForSearch(sandbox, {
          index: new Promise(() => {}),
          isInitialized: true,
          shouldIndexOnQuickPickOpen: true,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
        });
        const [showStub] = stubMultiple(
          [
            { object: quickPick, method: "show" },
            { object: quickPick, method: "loadItems" },
            { object: quickPick, method: "setText" },
          ],
          sandbox
        );
        return [indexStub, showStub];
      },

      setupForClearingConfigWhenLoadingFromCache: () => {
        stubComponents(sandbox);
        return stubComponentsForSearch(sandbox, {
          isInitialized: false,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: true,
        });
      },

      setupForInitializingQuickPickWhenLoadingFromCache: () => {
        stubComponents(sandbox);
        return stubComponentsForSearch(sandbox, {
          isInitialized: false,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: true,
        });
      },

      setupForRemovingUnsavedUrisWhenLoadingFromCache: () => {
        stubComponents(sandbox);
        return stubComponentsForSearch(sandbox, {
          isInitialized: false,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: true,
        });
      },

      setupForGettingAndSettingDataWhenLoadingFromCache: () => {
        stubComponents(sandbox);
        return stubComponentsForSearch(sandbox, {
          isInitialized: false,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: true,
        });
      },

      setupForShowingQuickPickWhenInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForSearch(sandbox, {
          isInitialized: true,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
        });
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "loadItems",
            },
            {
              object: quickPick,
              method: "show",
            },
            {
              object: quickPick,
              method: "setText",
            },
          ],
          sandbox
        );
      },

      setupForNotShowingQuickPickWhenNotInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForSearch(sandbox, {
          isInitialized: false,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
        });
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "loadItems",
            },
            {
              object: quickPick,
              method: "show",
            },
            {
              object: patternProvider,
              method: "getExcludePatterns",
              returns: Promise.resolve(["**/.history/**", "**/.vscode/**"]),
            },
          ],
          sandbox
        );
      },

      setupForDoingNothingWhenConditionsFalse: () => {
        stubComponents(sandbox);
        return stubComponentsForSearch(sandbox, {
          isInitialized: false,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
        });
      },

      setupForSettingSelectedTextWhenSearchSelection: () => {
        stubComponents(sandbox);
        stubComponentsForSearch(sandbox, {
          isInitialized: true,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
          shouldSearchSelection: true,
        });
        const editor = getTextEditorStub(true, "test text");

        return stubMultiple(
          [
            {
              object: quickPick,
              method: "setText",
            },
            {
              object: quickPick,
              method: "loadItems",
            },
            {
              object: quickPick,
              method: "show",
            },
            {
              object: asyncUtils,
              method: "sleepAndExecute",
            },
            {
              object: vscode.window,
              method: "activeTextEditor",
              isNotMethod: true,
              returns: editor,
            },
          ],
          sandbox
        );
      },

      setupForNotSettingTextWhenSearchSelectionFalse: () => {
        stubComponents(sandbox);
        stubComponentsForSearch(sandbox, {
          isInitialized: true,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
          shouldSearchSelection: false,
        });

        return stubMultiple(
          [
            {
              object: quickPick,
              method: "setText",
            },
            {
              object: quickPick,
              method: "loadItems",
            },
            {
              object: quickPick,
              method: "show",
            },
            {
              object: quickPick,
              method: "getLastQuery",
              returns: "",
            },
          ],
          sandbox
        );
      },

      setupForRestoringLastQuery: (
        lastQuery: string,
        selectedText: string,
        restoreLastQuery: boolean = true
      ) => {
        stubComponents(sandbox);
        stubComponentsForSearch(sandbox, {
          isInitialized: true,
          shouldIndexOnQuickPickOpen: false,
          shouldLoadDataFromCacheOnQuickPickOpen: false,
          shouldSearchSelection: true,
        });
        const editor = getTextEditorStub(true, selectedText);

        return stubMultiple(
          [
            {
              object: quickPick,
              method: "setText",
            },
            {
              object: quickPick,
              method: "loadItems",
            },
            {
              object: quickPick,
              method: "show",
            },
            {
              object: quickPick,
              method: "getLastQuery",
              returns: lastQuery,
            },
            {
              object: config,
              method: "fetchRestoreLastQuery",
              returns: restoreLastQuery,
            },
            {
              object: asyncUtils,
              method: "sleepAndExecute",
            },
            {
              object: vscode.window,
              method: "activeTextEditor",
              isNotMethod: true,
              returns: editor,
            },
          ],
          sandbox
        );
      },
    },

    reload: {
      setupForNoFolderOpenedNotification: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: messages,
              method: "printNoFolderOpenedMessage",
            },
            {
              object: cache,
              method: "clear",
            },
            {
              object: cache,
              method: "clearNotSavedUriPaths",
            },
            {
              object: workspaceFolders,
              method: "hasWorkspaceAnyFolder",
              returns: false,
            },
          ],
          sandbox
        );
      },

      setupForWorkspaceIndexing: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: changes,
              method: "reindex",
            },
            {
              object: cache,
              method: "clear",
            },
            {
              object: cache,
              method: "clearNotSavedUriPaths",
            },
            {
              object: workspaceFolders,
              method: "hasWorkspaceAnyFolder",
              returns: true,
            },
          ],
          sandbox
        );
      },

      setupForCacheClearing: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: cache,
              method: "clear",
            },
            {
              object: cache,
              method: "clearNotSavedUriPaths",
            },
            {
              object: changes,
              method: "reindex",
            },
            {
              object: workspaceFolders,
              method: "hasWorkspaceAnyFolder",
              returns: true,
            },
          ],
          sandbox
        );
      },
    },

    startup: {
      setupForIndexingWhenEnabledOnStartup: () => {
        stubComponents(sandbox);
        return stubComponentsForStartup(sandbox, {
          shouldIndexOnStartup: true,
          shouldLoadDataFromCacheOnStartup: false,
        });
      },

      setupForDoingNothingWhenConditionsFalse: () => {
        stubComponents(sandbox);
        return stubComponentsForStartup(sandbox, {
          isInitialized: false,
          shouldIndexOnStartup: false,
          shouldLoadDataFromCacheOnStartup: false,
        });
      },

      setupForClearingConfigWhenLoadingFromCacheOnStartup: () => {
        stubComponents(sandbox);
        return stubComponentsForStartup(sandbox, {
          isInitialized: false,
          shouldIndexOnStartup: false,
          shouldLoadDataFromCacheOnStartup: true,
        });
      },

      setupForInitializingQuickPickWhenLoadingFromCacheOnStartup: () => {
        stubComponents(sandbox);
        return stubComponentsForStartup(sandbox, {
          isInitialized: false,
          shouldIndexOnStartup: false,
          shouldLoadDataFromCacheOnStartup: true,
        });
      },

      setupForRemovingUnsavedUrisWhenLoadingFromCacheOnStartup: () => {
        stubComponents(sandbox);
        return stubComponentsForStartup(sandbox, {
          isInitialized: false,
          shouldIndexOnStartup: false,
          shouldLoadDataFromCacheOnStartup: true,
        });
      },

      setupForGettingAndSettingDataWhenLoadingFromCacheOnStartup: () => {
        stubComponents(sandbox);
        return stubComponentsForStartup(sandbox, {
          isInitialized: false,
          shouldIndexOnStartup: false,
          shouldLoadDataFromCacheOnStartup: true,
        });
      },

      setupForReconcilingCachedIndexWhenInitOnStartupDisabled: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: workspaceReconciler,
              method: "reconcile",
              returns: Promise.resolve(emptyReconcileResult),
            },
            {
              object: changes,
              method: "reindex",
            },
            {
              object: config,
              method: "fetchShouldInitOnStartup",
              returns: false,
            },
            {
              object: config,
              method: "fetchShouldWorkspaceDataBeCached",
              returns: true,
            },
            {
              object: database,
              method: "isEmpty",
              returns: false,
            },
            {
              object: database,
              method: "wasSeededFromTemplate",
              returns: false,
            },
            {
              object: quickPick,
              method: "isInitialized",
              returns: false,
            },
          ],
          sandbox
        );
      },

      setupForSeededWorktreeWithTemplateCommit: () => {
        stubComponents(sandbox);
        return stubSeededStartup(sandbox, {
          commit: "abc123",
          changedPaths: ["src/changed.ts"],
          workingTreePaths: ["src/edited.ts"],
          existingPaths: ["/workspace/src/changed.ts", "/workspace/src/edited.ts"],
        });
      },

      setupForSeededWorktreeWithDeletedFile: () => {
        stubComponents(sandbox);
        return stubSeededStartup(sandbox, {
          commit: "abc123",
          changedPaths: ["src/deleted.ts", "src/kept.ts"],
          existingPaths: ["/workspace/src/kept.ts"],
        });
      },

      setupForSeededWorktreeWithoutTemplateCommit: () => {
        stubComponents(sandbox);
        return stubSeededStartup(sandbox, {});
      },
    },

    shouldIndexOnQuickPickOpen: {
      setupForTrueWhenDisabledCachingDisabledAndDataEmpty: () => {
        stubComponents(sandbox);
        stubMultiple(
          [
            {
              object: controller,
              method: "isInitOnStartupDisabledAndWorkspaceCachingDisabled",
              returns: false,
            },
            {
              object: controller,
              method:
                "isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty",
              returns: true,
            },
          ],
          sandbox
        );
      },

      setupForTrueWhenDisabledCachingDisabledAndDataNotEmpty: () => {
        stubComponents(sandbox);
        stubMultiple(
          [
            {
              object: controller,
              method: "isInitOnStartupDisabledAndWorkspaceCachingDisabled",
              returns: true,
            },
            {
              object: controller,
              method:
                "isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty",
              returns: false,
            },
          ],
          sandbox
        );
      },

      setupForTrueWhenBothConditionsTrue: () => {
        stubComponents(sandbox);
        stubMultiple(
          [
            {
              object: controller,
              method: "isInitOnStartupDisabledAndWorkspaceCachingDisabled",
              returns: true,
            },
            {
              object: controller,
              method:
                "isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty",
              returns: true,
            },
          ],
          sandbox
        );
      },

      setupForFalseWhenBothConditionsFalse: () => {
        stubComponents(sandbox);
        stubMultiple(
          [
            {
              object: controller,
              method: "isInitOnStartupDisabledAndWorkspaceCachingDisabled",
              returns: false,
            },
            {
              object: controller,
              method:
                "isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty",
              returns: false,
            },
          ],
          sandbox
        );
      },
    },

    shouldIndexOnStartup: {
      setupForTrueWhenEnabledCachingDisabledAndDataEmpty: () => {
        stubComponents(sandbox);
        stubMultiple(
          [
            {
              object: controller,
              method: "isInitOnStartupEnabledAndWorkspaceCachingDisabled",
              returns: false,
            },
            {
              object: controller,
              method:
                "isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty",
              returns: true,
            },
          ],
          sandbox
        );
      },

      setupForTrueWhenEnabledCachingDisabledAndDataNotEmpty: () => {
        stubComponents(sandbox);
        stubMultiple(
          [
            {
              object: controller,
              method: "isInitOnStartupEnabledAndWorkspaceCachingDisabled",
              returns: true,
            },
            {
              object: controller,
              method:
                "isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty",
              returns: false,
            },
          ],
          sandbox
        );
      },

      setupForTrueWhenBothConditionsTrue: () => {
        stubComponents(sandbox);
        stubMultiple(
          [
            {
              object: controller,
              method: "isInitOnStartupEnabledAndWorkspaceCachingDisabled",
              returns: true,
            },
            {
              object: controller,
              method:
                "isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty",
              returns: true,
            },
          ],
          sandbox
        );
      },

      setupForFalseWhenBothConditionsFalse: () => {
        stubComponents(sandbox);
        stubMultiple(
          [
            {
              object: controller,
              method: "isInitOnStartupEnabledAndWorkspaceCachingDisabled",
              returns: false,
            },
            {
              object: controller,
              method:
                "isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty",
              returns: false,
            },
          ],
          sandbox
        );
      },
    },

    isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty: {
      setupForFalseWhenQuickPickInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: true,
            fetchShouldInitOnStartup: false,
            fetchShouldWorkspaceDataBeCached: true,
            getData: [],
          }
        );
      },

      setupForFalseWhenInitOnStartupTrue: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: true,
            fetchShouldWorkspaceDataBeCached: true,
            getData: [],
          }
        );
      },

      setupForFalseWhenWorkspaceCachingFalse: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: false,
            fetchShouldWorkspaceDataBeCached: false,
            getData: [],
          }
        );
      },

      setupForFalseWhenDataNotEmpty: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: false,
            fetchShouldWorkspaceDataBeCached: true,
            getData: [getQpItem()],
          }
        );
      },

      setupForTrueWhenAllConditionsMet: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: false,
            fetchShouldWorkspaceDataBeCached: true,
            getData: [],
          }
        );
      },
    },

    isInitOnStartupDisabledAndWorkspaceCachingDisabled: {
      setupForFalseWhenQuickPickInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: true,
            fetchShouldInitOnStartup: false,
            fetchShouldWorkspaceDataBeCached: false,
          }
        );
      },

      setupForFalseWhenInitOnStartupTrue: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: true,
            fetchShouldWorkspaceDataBeCached: false,
          }
        );
      },

      setupForFalseWhenWorkspaceCachingTrue: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: false,
            fetchShouldWorkspaceDataBeCached: true,
          }
        );
      },

      setupForTrueWhenAllConditionsMet: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: false,
            fetchShouldWorkspaceDataBeCached: false,
          }
        );
      },
    },

    isInitOnStartupEnabledAndWorkspaceCachingDisabled: {
      setupForFalseWhenQuickPickInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: true,
            fetchShouldInitOnStartup: true,
            fetchShouldWorkspaceDataBeCached: false,
          }
        );
      },

      setupForFalseWhenInitOnStartupFalse: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: false,
            fetchShouldWorkspaceDataBeCached: false,
          }
        );
      },

      setupForFalseWhenWorkspaceCachingTrue: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: true,
            fetchShouldWorkspaceDataBeCached: true,
          }
        );
      },

      setupForTrueWhenAllConditionsMet: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: true,
            fetchShouldWorkspaceDataBeCached: false,
          }
        );
      },
    },

    isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty: {
      setupForFalseWhenQuickPickInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: true,
            fetchShouldInitOnStartup: true,
            fetchShouldWorkspaceDataBeCached: true,
            getData: [],
          }
        );
      },

      setupForFalseWhenInitOnStartupFalse: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: false,
            fetchShouldWorkspaceDataBeCached: true,
            getData: [],
          }
        );
      },

      setupForFalseWhenWorkspaceCachingFalse: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: true,
            fetchShouldWorkspaceDataBeCached: false,
            getData: [],
          }
        );
      },

      setupForFalseWhenDataNotEmpty: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: true,
            fetchShouldWorkspaceDataBeCached: true,
            getData: [getQpItem()],
          }
        );
      },

      setupForTrueWhenAllConditionsMet: () => {
        stubComponents(sandbox);
        stubComponentsForIsInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
          sandbox,
          {
            isInitialized: false,
            fetchShouldInitOnStartup: true,
            fetchShouldWorkspaceDataBeCached: true,
            getData: [],
          }
        );
      },
    },

    shouldSearchSelection: {
      setupForFalseWhenQuickPickNotInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForShouldSearchSelection(sandbox, {
          isInitialized: false,
          fetchShouldSearchSelection: true,
        });
        const editor = getTextEditorStub(true, "test text");

        return editor;
      },

      setupForFalseWhenSearchSelectionDisabled: () => {
        stubComponents(sandbox);
        stubComponentsForShouldSearchSelection(sandbox, {
          isInitialized: true,
          fetchShouldSearchSelection: false,
        });
        const editor = getTextEditorStub(true, "test text");

        return editor;
      },

      setupForFalseWhenEditorNotExists: () => {
        stubComponents(sandbox);
        stubComponentsForShouldSearchSelection(sandbox, {
          isInitialized: true,
          fetchShouldSearchSelection: true,
        });
        const editor = undefined;

        return editor;
      },

      setupForTrueWhenAllConditionsMet: () => {
        stubComponents(sandbox);
        stubComponentsForShouldSearchSelection(sandbox, {
          isInitialized: true,
          fetchShouldSearchSelection: true,
        });
        const editor = getTextEditorStub(true, "test text");

        return editor;
      },
    },

    restoreOnDidChangeValueEventListener: {
      setupForControlValue: (value: string) => {
        stubComponents(sandbox);

        return stubMultiple(
          [
            {
              object: quickPick,
              method: "reloadOnDidChangeValueEventListener",
            },
            {
              object: quickPick,
              method: "handleDidChangeValue",
            },
            {
              object: quickPick,
              method: "getControl",
              returns: { value },
            },
          ],
          sandbox
        );
      },
    },

    shouldLoadDataFromCacheOnQuickPickOpen: {
      setupForFalseWhenQuickPickInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForShouldLoadDataFromCacheOnQuickPickOpen(sandbox, {
          isInitialized: true,
          fetchShouldInitOnStartup: true,
          fetchShouldWorkspaceDataBeCached: true,
        });
      },

      setupForFalseWhenInitOnStartupTrue: () => {
        stubComponents(sandbox);
        stubComponentsForShouldLoadDataFromCacheOnQuickPickOpen(sandbox, {
          isInitialized: false,
          fetchShouldInitOnStartup: true,
          fetchShouldWorkspaceDataBeCached: true,
        });
      },

      setupForFalseWhenWorkspaceCachingFalse: () => {
        stubComponents(sandbox);
        stubComponentsForShouldLoadDataFromCacheOnQuickPickOpen(sandbox, {
          isInitialized: false,
          fetchShouldInitOnStartup: false,
          fetchShouldWorkspaceDataBeCached: false,
        });
      },

      setupForTrueWhenAllConditionsMet: () => {
        stubComponents(sandbox);
        stubComponentsForShouldLoadDataFromCacheOnQuickPickOpen(sandbox, {
          isInitialized: false,
          fetchShouldInitOnStartup: false,
          fetchShouldWorkspaceDataBeCached: true,
        });
      },
    },

    shouldLoadDataFromCacheOnStartup: {
      setupForFalseWhenQuickPickInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForShouldLoadDataFromCacheOnStartup(sandbox, {
          isInitialized: true,
          fetchShouldInitOnStartup: true,
          fetchShouldWorkspaceDataBeCached: true,
        });
      },

      setupForFalseWhenInitOnStartupFalse: () => {
        stubComponents(sandbox);
        stubComponentsForShouldLoadDataFromCacheOnStartup(sandbox, {
          isInitialized: false,
          fetchShouldInitOnStartup: false,
          fetchShouldWorkspaceDataBeCached: true,
        });
      },

      setupForFalseWhenWorkspaceCachingFalse: () => {
        stubComponents(sandbox);
        stubComponentsForShouldLoadDataFromCacheOnStartup(sandbox, {
          isInitialized: false,
          fetchShouldInitOnStartup: true,
          fetchShouldWorkspaceDataBeCached: false,
        });
      },

      setupForTrueWhenAllConditionsMet: () => {
        stubComponents(sandbox);
        stubComponentsForShouldLoadDataFromCacheOnStartup(sandbox, {
          isInitialized: false,
          fetchShouldInitOnStartup: true,
          fetchShouldWorkspaceDataBeCached: true,
        });
      },
    },

    handleWillProcessing: {
      setupForShowingLoadingWhenQuickPickInitialized: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "showLoading",
            },
            {
              object: quickPick,
              method: "setPlaceholder",
            },
            {
              object: quickPick,
              method: "isInitialized",
              returns: true,
            },
          ],
          sandbox
        );
      },

      setupForNotShowingLoadingWhenQuickPickNotInitialized: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "showLoading",
            },
            {
              object: quickPick,
              method: "setPlaceholder",
            },
            {
              object: quickPick,
              method: "fetchConfig",
            },
            {
              object: quickPick,
              method: "isInitialized",
              returns: false,
            },
            {
              object: quickPick,
              method: "init",
            },
          ],
          sandbox
        );
      },

      setupForInitializingQuickPickWhenNotInitialized: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "init",
            },
            {
              object: quickPick,
              method: "isInitialized",
              returns: false,
            },
          ],
          sandbox
        );
      },
    },

    handleDidProcessing: {
      setupForSettingQuickPickDataAndLoading: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: controller,
              method: "setQuickPickData",
            },
            {
              object: quickPick,
              method: "init",
            },
            {
              object: quickPick,
              method: "loadItems",
            },
            {
              object: controller,
              method: "setBusy",
            },
            {
              object: quickPick,
              method: "isInitialized",
              returns: true,
            },
          ],
          sandbox
        );
      },

      setupForSettingItemsFromWorkspaceData: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "setItems",
            },
            {
              object: workspaceIndexer,
              method: "getData",
              returns: getQpItems(),
            },
            {
              object: quickPick,
              method: "loadItems",
            },
            {
              object: quickPick,
              method: "isInitialized",
            },
          ],
          sandbox
        );
      },
    },

    handleWillExecuteAction: {
      setupForClearingItemsWhenRebuildAction: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "setItems",
            },
            {
              object: quickPick,
              method: "loadItems",
            },
          ],
          sandbox
        );
      },

      setupForDoingNothingWhenNonRebuildAction: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "setItems",
            },
            {
              object: quickPick,
              method: "loadItems",
            },
          ],
          sandbox
        );
      },
    },

    handleDidDebounceConfigToggle: {
      setupForReloadingEventListener: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: controller,
              method: "setBusy",
            },
            {
              object: quickPick,
              method: "reloadOnDidChangeValueEventListener",
            },
          ],
          sandbox
        );
      },
    },

    handleDidSortingConfigToggle: {
      setupForReloadingSortingSettings: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: controller,
              method: "setBusy",
            },
            {
              object: quickPick,
              method: "reloadSortingSettings",
            },
          ],
          sandbox
        );
      },
    },

    handleWillReindexOnConfigurationChange: {
      setupForReloadingQuickPick: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "reload",
            },
          ],
          sandbox
        );
      },
    },

    copy: {
      setupForCopyingReference: () =>
        stubMultiple([{ object: quickPick, method: "copyReference" }], sandbox),
      setupForCopyingLocation: () =>
        stubMultiple([{ object: quickPick, method: "copyLocation" }], sandbox),
    },
  };
};
