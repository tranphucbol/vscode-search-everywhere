import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../config";
import { dataConverter } from "../../dataConverter";
import { database } from "../../database";
import { quickPick } from "../../quickPick";
import { recentItems } from "../../recentItems";
import { Icons } from "../../types";
import { vscodeVersion } from "../../shared/vscodeVersion";
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

function stubControl(sandbox: sinon.SinonSandbox) {
  const quickPickInner = vscode.window.createQuickPick<vscode.QuickPickItem>();
  stubMultiple(
    [
      {
        object: quickPick,
        method: "getControl",
        returns: quickPickInner,
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
              object: quickPick,
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
              object: quickPick,
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
              object: quickPick,
              method: "getOnDidChangeValueEventListeners",
              callsFake: () => listeners,
            },
            {
              object: quickPick,
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
              object: quickPick,
              method: "getOnDidChangeValueEventListeners",
              callsFake: () => listeners,
            },
            {
              object: quickPick,
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
              object: quickPick,
              method: "getCategories",
              returns: [],
            },
            {
              object: quickPick,
              method: "getHelpPhrase",
              returns: "?",
            },
            {
              object: quickPick,
              method: "getHandOffPrefixes",
              returns: false,
            },
            {
              object: quickPick,
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
              object: quickPick,
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
              object: quickPick,
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
              object: quickPick,
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

    loadItems: {
      setupForLoadingUnsortedItems: () => {
        stubControl(sandbox);
        const items = getQpItems();
        stubMultiple(
          [
            {
              object: quickPick,
              method: "getItems",
              returns: items,
            },
            {
              object: quickPick,
              method: "getShouldItemsBeSorted",
              returns: false,
            },
          ],
          sandbox
        );

        return items;
      },

      setupForLoadingSortedItems: () => {
        stubControl(sandbox);
        const items = [
          getQpItem(undefined, undefined, undefined, undefined, undefined, 1),
          getQpItem(undefined, 2),
          getQpItem(undefined, 3, undefined, undefined, undefined, 4),
          getQpItem(undefined, 4, undefined, undefined, undefined, 0),
        ];
        items.unshift();

        stubMultiple(
          [
            {
              object: quickPick,
              method: "getItems",
              returns: items,
            },
            {
              object: quickPick,
              method: "getShouldItemsBeSorted",
              returns: true,
            },
          ],
          sandbox
        );

        const separatorItems = {
          file: {
            label: "File",
            kind: vscode.QuickPickItemKind.Separator,
            symbolKind: vscode.QuickPickItemKind.Separator,
            uri: vscode.Uri.parse("#"),
          },
          module: {
            label: "Module",
            kind: vscode.QuickPickItemKind.Separator,
            symbolKind: vscode.QuickPickItemKind.Separator,
            uri: vscode.Uri.parse("#"),
          },
          class: {
            label: "Class",
            kind: vscode.QuickPickItemKind.Separator,
            symbolKind: vscode.QuickPickItemKind.Separator,
            uri: vscode.Uri.parse("#"),
          },
        };

        const itemsWithSeparator = [
          separatorItems.file as any,
          getQpItem(undefined, 2),
          getQpItem(undefined, 4),
          separatorItems.module as any,
          getQpItem(undefined, undefined, undefined, undefined, undefined, 1),
          separatorItems.class as any,
          getQpItem(undefined, 3, undefined, undefined, undefined, 4),
        ];

        return itemsWithSeparator;
      },

      setupForRecentKeys: (query: string, rankRecentItemsHigher: boolean) => {
        const control = vscode.window.createQuickPick<vscode.QuickPickItem>();
        control.value = query;
        const recentKeys = [{ uri: "file:///a.ts", symbolKind: 0, name: "a" }];
        const [, , , , , , , searchStub, getRecentKeysStub] = stubMultiple(
          [
            { object: quickPick, method: "getControl", returns: control },
            {
              object: quickPick,
              method: "getShouldUseItemsFilterPhrases",
              returns: false,
            },
            {
              object: quickPick,
              method: "getShouldItemsBeSorted",
              returns: false,
            },
            {
              object: config,
              method: "fetchRankRecentItemsHigher",
              returns: rankRecentItemsHigher,
            },
            {
              object: config,
              method: "fetchShowRecentItemsOnEmptyQuery",
              returns: true,
            },
            {
              object: recentItems,
              method: "getRecentItems",
              returns: [getQpItem()],
            },
            { object: database, method: "isReady", returns: true },
            { object: database, method: "search", returns: [] },
            {
              object: recentItems,
              method: "getRecentKeys",
              returns: recentKeys,
            },
          ],
          sandbox
        );

        return { searchStub, getRecentKeysStub, recentKeys };
      },
    },

    loadHelpItems: {
      setupForLoadingHelpItems: () => {
        stubControl(sandbox);
        const helpItems = getQpHelpItems();
        stubMultiple(
          [
            {
              object: quickPick,
              method: "getHelpItems",
              returns: helpItems,
            },
          ],
          sandbox
        );

        return helpItems;
      },
    },

    showLoading: {
      setupForSettingBusyProperty: () => {
        stubControl(sandbox);
      },
    },

    setText: {
      setupForSettingText: () => {
        stubControl(sandbox);
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
              object: quickPick,
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
              object: quickPick,
              method: "getShouldUseItemsFilterPhrases",
              returns: true,
            },
            {
              object: quickPick,
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
              object: quickPick,
              method: "getShouldUseItemsFilterPhrases",
              returns: true,
            },
            {
              object: quickPick,
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
              object: quickPick,
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
              object: quickPick,
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
              object: quickPick,
              method: "loadHelpItems",
            },
            {
              object: quickPick,
              method: "getShouldUseItemsFilterPhrases",
              returns: true,
            },
            {
              object: quickPick,
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
              object: quickPick,
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
              object: quickPick,
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
              object: quickPick,
              method: "loadItems",
            },
            {
              object: quickPick,
              method: "getShouldUseItemsFilterPhrases",
              returns: true,
            },
            {
              object: quickPick,
              method: "getItemsFilterPhrases",
              returns: { 0: "$$", 1: "@@" },
            },
            {
              object: quickPick,
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

    fileIcons: {
      setupForFileIconTheme: (
        useFileIconTheme: boolean,
        supported: boolean = true,
        icons: Icons = { 0: "symbol-file", 4: "symbol-class" }
      ) => {
        return stubMultiple(
          [
            {
              object: config,
              method: "fetchUseFileIconTheme",
              returns: useFileIconTheme,
            },
            {
              object: vscodeVersion,
              method: "supportsQuickPickFileIconTheme",
              returns: supported,
            },
            {
              object: dataConverter,
              method: "getIcons",
              returns: icons,
            },
          ],
          sandbox
        );
      },
    },

    handOff: {
      setupForHandOff: ({
        handOffPrefixes = true,
        quickTextSearch = true,
      }: { handOffPrefixes?: boolean; quickTextSearch?: boolean } = {}) => {
        const control = vscode.window.createQuickPick<vscode.QuickPickItem>();
        // VS Code fires onDidHide when the quick pick is hidden.
        sandbox.stub(control, "hide").callsFake(() => quickPick.handleDidHide());
        const [executeCommandStub, getCommandsStub, loadItemsStub] =
          stubMultiple(
            [
              {
                object: vscode.commands,
                method: "executeCommand",
                returns: Promise.resolve(),
              },
              {
                object: vscode.commands,
                method: "getCommands",
                returns: Promise.resolve(
                  quickTextSearch ? ["workbench.action.quickTextSearch"] : []
                ),
              },
              { object: quickPick, method: "loadItems" },
              { object: quickPick, method: "loadHelpItems" },
              { object: quickPick, method: "getControl", returns: control },
              {
                object: quickPick,
                method: "getHandOffPrefixes",
                returns: handOffPrefixes,
              },
              {
                object: quickPick,
                method: "supportsQuickTextSearch",
                returns: Promise.resolve(quickTextSearch),
              },
              {
                object: quickPick,
                method: "getShouldUseItemsFilterPhrases",
                returns: true,
              },
              { object: quickPick, method: "getHelpPhrase", returns: "?" },
              {
                object: quickPick,
                method: "getCategories",
                returns: [{ name: "Types", phrase: ">>", kinds: [4] }],
              },
              {
                object: quickPick,
                method: "getItemsFilterPhrases",
                returns: { 11: "ff" },
              },
            ],
            sandbox
          );
        const handOffCalls = () =>
          executeCommandStub
            .getCalls()
            .map((call) => call.args)
            .filter(([command]) => command !== "setContext");

        return {
          control,
          executeCommandStub,
          getCommandsStub,
          loadItemsStub,
          handOffCalls,
        };
      },
    },

    handleDidTriggerItemButton: {
      setupForInvokingOpenItem: () => {
        stubControl(sandbox);
        return stubMultiple(
          [
            {
              object: quickPick,
              method: "openItem",
            },
          ],
          sandbox
        );
      },
    },

    copy: {
      setupForCopying: (activeItems: vscode.QuickPickItem[] = []) => {
        stubControl(sandbox);
        const control = quickPick.getControl();
        sandbox.stub(control, "activeItems").get(() => activeItems);
        const writeTextStub = sandbox.stub().resolves();
        sandbox
          .stub(vscode.env, "clipboard")
          .value({ readText: sandbox.stub(), writeText: writeTextStub });
        return [
          writeTextStub,
          sandbox.stub(vscode.window, "setStatusBarMessage"),
          sandbox.stub(control, "hide"),
        ];
      },
    },
  };
};
