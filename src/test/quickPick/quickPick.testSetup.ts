import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../platform/config";
import { quickPick } from "../../quickPick/quickPick";
import { quickPickState } from "../../quickPick/state";
import { itemLoader } from "../../quickPick/view/itemLoader";
import { opener } from "../../quickPick/actions/open";
import { getQuickPickOnDidChangeValueEventListeners } from "../util/eventMockFactory";
import {
  getQpHelpItem,
  getQpHelpItems,
  getQpItem,
  getQpItems,
  getUntitledQpItem,
} from "../util/qpItemMockFactory";
import { getTextEditorStub } from "../util/stubFactory";
import { stubMultiple } from "../util/stubHelpers";
import { stubControl } from "../util/quickPickStubs";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    init: {
      setupForCreatingVscodeQuickPick: () => {
        const quickPickInner =
          vscode.window.createQuickPick<vscode.QuickPickItem>();
        return stubMultiple(
          [
            {
              object: vscode.window,
              method: "createQuickPick",
              returns: quickPickInner,
            },
            {
              object: config,
              method: "fetchShouldUseItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchHelpPhrase",
            },
            {
              object: config,
              method: "fetchItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchShouldUseDebounce",
            },
            {
              object: config,
              method: "fetchShouldItemsBeSorted",
            },
          ],
          sandbox
        );
      },

      setupForRegisteringTwoEventListenersWhenDebounceEnabled: () => {
        const quickPickInner =
          vscode.window.createQuickPick<vscode.QuickPickItem>();
        stubMultiple(
          [
            {
              object: vscode.window,
              method: "createQuickPick",
              returns: quickPickInner,
            },
            {
              object: config,
              method: "fetchShouldUseDebounce",
              returns: true,
            },
            {
              object: quickPickState,
              method: "getOnDidChangeValueEventListeners",
              returns: [],
            },
            {
              object: config,
              method: "fetchShouldUseItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchHelpPhrase",
            },
            {
              object: config,
              method: "fetchItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchShouldItemsBeSorted",
            },
          ],
          sandbox
        );
      },

      setupForRegisteringOneEventListenerWhenDebounceDisabled: () => {
        const quickPickInner =
          vscode.window.createQuickPick<vscode.QuickPickItem>();
        stubMultiple(
          [
            {
              object: vscode.window,
              method: "createQuickPick",
              returns: quickPickInner,
            },
            {
              object: config,
              method: "fetchShouldUseDebounce",
              returns: false,
            },
            {
              object: quickPickState,
              method: "getOnDidChangeValueEventListeners",
              returns: [],
            },
            {
              object: config,
              method: "fetchShouldUseItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchHelpPhrase",
            },
            {
              object: config,
              method: "fetchItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchShouldItemsBeSorted",
            },
          ],
          sandbox
        );
      },
    },

    reloadSortingSettings: {
      setupForSettingSortingEnabled: () => {
        return stubMultiple(
          [
            {
              object: config,
              method: "fetchShouldItemsBeSorted",
              returns: true,
            },
          ],
          sandbox
        );
      },

      setupForSettingSortByLabelToFalseForSeparators: () => {
        return stubMultiple(
          [
            {
              object: config,
              method: "fetchShouldItemsBeSorted",
              returns: true,
            },
          ],
          sandbox
        );
      },
    },

    reloadOnDidChangeValueEventListener: {
      setupForRegisteringOneListenerWhenDebounceDisabled: () => {
        stubControl(sandbox);
        let listeners: vscode.Disposable[] = [];
        stubMultiple(
          [
            {
              object: quickPickState,
              method: "getOnDidChangeValueEventListeners",
              callsFake: () => listeners,
            },
            {
              object: quickPickState,
              method: "setOnDidChangeValueEventListeners",
              callsFake: (
                newOnDidChangeValueEventListeners: vscode.Disposable[]
              ) => (listeners = newOnDidChangeValueEventListeners),
            },
            {
              object: config,
              method: "fetchShouldUseDebounce",
              returns: false,
            },
          ],
          sandbox
        );
        listeners.push(...getQuickPickOnDidChangeValueEventListeners());
        return listeners;
      },

      setupForRegisteringTwoListenersWhenDebounceEnabled: () => {
        stubControl(sandbox);
        let listeners: vscode.Disposable[] = [];
        stubMultiple(
          [
            {
              object: quickPickState,
              method: "getOnDidChangeValueEventListeners",
              callsFake: () => listeners,
            },
            {
              object: quickPickState,
              method: "setOnDidChangeValueEventListeners",
              callsFake: (
                newOnDidChangeValueEventListeners: vscode.Disposable[]
              ) => (listeners = newOnDidChangeValueEventListeners),
            },
            {
              object: config,
              method: "fetchShouldUseDebounce",
              returns: true,
            },
          ],
          sandbox
        );
        listeners.push(...getQuickPickOnDidChangeValueEventListeners(1));
        return listeners;
      },
    },

    reload: {
      setupForFetchingConfigurationFromConfig: () => {
        return stubMultiple(
          [
            {
              object: config,
              method: "fetchShouldUseItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchHelpPhrase",
            },
            {
              object: config,
              method: "fetchItemsFilterPhrases",
            },
            {
              object: config,
              method: "fetchShouldItemsBeSorted",
            },
          ],
          sandbox
        );
      },

      setupForFetchingHelpData: () => {
        stubMultiple(
          [
            {
              object: quickPick,
              method: "fetchConfig",
            },
            {
              object: quickPickState,
              method: "getCategories",
              returns: [],
            },
            {
              object: quickPickState,
              method: "getHelpPhrase",
              returns: "?",
            },
            {
              object: quickPickState,
              method: "getHandOffPrefixes",
              returns: false,
            },
            {
              object: quickPickState,
              method: "getItemsFilterPhrases",
              returns: {
                "0": "$$",
                "1": "^^",
                "4": "@@",
              },
            },
            {
              object: config,
              method: "fetchShouldItemsBeSorted",
            },
          ],
          sandbox
        );

        return getQpHelpItems("?", {
          "0": "$$",
          "1": "^^",
          "4": "@@",
        });
      },
    },

    isInitialized: {
      setupForReturningTrueWhenQuickPickInitialized: () => {
        const quickPickInner =
          vscode.window.createQuickPick<vscode.QuickPickItem>();
        stubMultiple(
          [
            {
              object: quickPickState,
              method: "getControl",
              returns: quickPickInner,
            },
          ],
          sandbox
        );
      },

      setupForReturningFalseWhenQuickPickNotInitialized: () => {
        stubMultiple(
          [
            {
              object: quickPickState,
              method: "getControl",
              returns: undefined,
              returnsIsUndefined: true,
            },
          ],
          sandbox
        );
      },
    },

    show: {
      setupForInvokingShowWhenQuickPickInitialized: () => {
        const quickPickInner =
          vscode.window.createQuickPick<vscode.QuickPickItem>();
        return stubMultiple(
          [
            {
              object: quickPickInner,
              method: "show",
            },
            {
              object: quickPickState,
              method: "getControl",
              returns: quickPickInner,
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
    },

    setPlaceholder: {
      setupForSettingLoadingPlaceholder: () => {
        stubControl(sandbox);
      },

      setupForSettingSearchingPlaceholderWhenFilterPhrasesDisabled: () => {
        stubControl(sandbox);
        stubMultiple(
          [
            {
              object: quickPickState,
              method: "getShouldUseItemsFilterPhrases",
              returns: false,
            },
          ],
          sandbox
        );
      },

      setupForSettingHelpPlaceholderWhenFilterPhrasesEnabled: () => {
        stubControl(sandbox);
        stubMultiple(
          [
            {
              object: quickPickState,
              method: "getShouldUseItemsFilterPhrases",
              returns: true,
            },
            {
              object: quickPickState,
              method: "getHelpPhrase",
              returns: "?",
            },
          ],
          sandbox
        );
      },

      setupForSettingNotSetHelpPlaceholderWhenHelpPhraseEmpty: () => {
        stubControl(sandbox);
        stubMultiple(
          [
            {
              object: quickPickState,
              method: "getShouldUseItemsFilterPhrases",
              returns: true,
            },
            {
              object: quickPickState,
              method: "getHelpPhrase",
              returns: "",
            },
          ],
          sandbox
        );
      },
    },

    handleDidChangeValueClearing: {
      setupForClearingQuickPickItems: () => {
        stubControl(sandbox);
        stubMultiple(
          [
            {
              object: quickPickState,
              method: "getItems",
              returns: getQpItems(),
            },
          ],
          sandbox
        );
      },
    },

    handleDidChangeValue: {
      setupForLoadingWorkspaceItems: () => {
        return stubMultiple(
          [
            {
              object: itemLoader,
              method: "loadItems",
            },
          ],
          sandbox
        );
      },

      setupForLoadingHelpItems: () => {
        return stubMultiple(
          [
            {
              object: itemLoader,
              method: "loadHelpItems",
            },
            {
              object: quickPickState,
              method: "getShouldUseItemsFilterPhrases",
              returns: true,
            },
            {
              object: quickPickState,
              method: "getHelpPhrase",
              returns: "?",
            },
          ],
          sandbox
        );
      },
    },

    handleDidAccept: {
      setupForOpeningFileSchemeItem: () => {
        const editor = getTextEditorStub();
        const quickPickInner =
          vscode.window.createQuickPick<vscode.QuickPickItem>();

        return stubMultiple(
          [
            {
              object: editor,
              method: "revealRange",
            },
            {
              object: vscode.window,
              method: "showTextDocument",
              returns: editor,
            },
            {
              object: vscode.workspace,
              method: "openTextDocument",
            },
            {
              object: quickPickState,
              method: "getControl",
              returns: quickPickInner,
            },
            {
              object: quickPickInner,
              method: "selectedItems",
              returns: [getQpItem()],
              isNotMethod: true,
            },
            {
              object: config,
              method: "fetchShouldHighlightSymbol",
            },
          ],
          sandbox
        );
      },

      setupForOpeningUntitledSchemeItem: () => {
        const editor = getTextEditorStub();
        const quickPickInner =
          vscode.window.createQuickPick<vscode.QuickPickItem>();

        return stubMultiple(
          [
            {
              object: editor,
              method: "revealRange",
            },
            {
              object: vscode.window,
              method: "showTextDocument",
              returns: editor,
            },
            {
              object: vscode.workspace,
              method: "openTextDocument",
            },
            {
              object: config,
              method: "fetchShouldHighlightSymbol",
              returns: true,
            },
            {
              object: quickPickState,
              method: "getControl",
              returns: quickPickInner,
            },
            {
              object: quickPickInner,
              method: "selectedItems",
              returns: [getUntitledQpItem()],
              isNotMethod: true,
            },
          ],
          sandbox
        );
      },

      setupForOpeningHelpItem: () => {
        const quickPickInner =
          vscode.window.createQuickPick<vscode.QuickPickItem>();

        return stubMultiple(
          [
            {
              object: itemLoader,
              method: "loadItems",
            },
            {
              object: quickPickState,
              method: "getShouldUseItemsFilterPhrases",
              returns: true,
            },
            {
              object: quickPickState,
              method: "getItemsFilterPhrases",
              returns: { 0: "$$", 1: "@@" },
            },
            {
              object: quickPickState,
              method: "getControl",
              returns: quickPickInner,
            },
            {
              object: quickPickInner,
              method: "selectedItems",
              returns: [getQpHelpItem("?", "0", "$$")],
              isNotMethod: true,
            },
          ],
          sandbox
        );
      },
    },

    handleDidHide: {
      setupForSettingEmptyText: () => {
        stubControl(sandbox);
      },
    },

    handleDidTriggerItemButton: {
      setupForInvokingOpenItem: () => {
        stubControl(sandbox);
        return stubMultiple(
          [
            {
              object: opener,
              method: "openItem",
            },
          ],
          sandbox
        );
      },
    },
  };
};
