import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../platform/cache";
import * as config from "../../platform/settings/config";
import { controller } from "../../commands/controller";
import { database } from "../../database";
import { patternProvider } from "../../platform/settings/patternProvider";
import { quickPick } from "../../quickPick/quickPick";
import { asyncUtils } from "../../shared/async";
import { messages } from "../../shared/messages";
import { workspaceFolders } from "../../shared/workspaceFolders";
import { lifecycle } from "../../indexing/lifecycle";
import * as workspaceEventsEmitter from "../../shared/events";
import { getExtensionContext } from "../util/mockFactory";
import { getQpItems } from "../util/qpItemMockFactory";
import { getTextEditorStub } from "../util/stubFactory";
import { stubMultiple } from "../util/stubHelpers";

function stubComponents(sandbox: sinon.SinonSandbox) {
  return stubMultiple(
    [
      {
        object: cache,
        method: "initCache",
      },
      {
        object: lifecycle,
        method: "init",
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

function stubComponentsForSearch(
  sandbox: sinon.SinonSandbox,
  returnsValues: { [key: string]: any }
) {
  return stubMultiple(
    [
      {
        object: lifecycle,
        method: "prepareQuickPickOpen",
        returns: Promise.resolve(),
      },
      {
        object: quickPick,
        method: "isInitialized",
        returns: returnsValues.isInitialized,
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
              object: lifecycle,
              method: "init",
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
              object: lifecycle,
              method: "init",
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

      setupForLifecycleInitialization: () => {
        return stubMultiple(
          [
            {
              object: lifecycle,
              method: "init",
            },
            {
              object: cache,
              method: "initCache",
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
              object: lifecycle,
              method: "init",
            },
            {
              object: cache,
              method: "initCache",
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

    reload: {
      setupForNoFolderOpenedNotification: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            { object: messages, method: "printNoFolderOpenedMessage" },
            { object: lifecycle, method: "reload" },
            { object: workspaceFolders, method: "hasWorkspaceAnyFolder", returns: false },
          ],
          sandbox
        );
      },

      setupForReloading: () => {
        stubComponents(sandbox);
        return stubMultiple(
          [
            { object: lifecycle, method: "reload" },
            { object: workspaceFolders, method: "hasWorkspaceAnyFolder", returns: true },
          ],
          sandbox
        );
      },
    },

    startup: {
      setupForStartingLifecycle: () => {
        stubComponents(sandbox);
        return stubMultiple([{ object: lifecycle, method: "startup" }], sandbox);
      },
    },

    search: {
      setupForPreparingIndexBeforeShowing: () => {
        stubComponents(sandbox);
        const [prepareStub] = stubComponentsForSearch(sandbox, {
          isInitialized: true,
        });
        return [
          prepareStub,
          ...stubMultiple(
            [
              { object: quickPick, method: "loadItems" },
              { object: quickPick, method: "show" },
              { object: quickPick, method: "setText" },
            ],
            sandbox
          ),
        ];
      },

      setupForShowingQuickPickWhenInitialized: () => {
        stubComponents(sandbox);
        stubComponentsForSearch(sandbox, {
          isInitialized: true,
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

      setupForSettingSelectedTextWhenSearchSelection: () => {
        stubComponents(sandbox);
        stubComponentsForSearch(sandbox, {
          isInitialized: true,
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
              object: database,
              method: "isReady",
              returns: true,
            },
            {
              object: database,
              method: "search",
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
