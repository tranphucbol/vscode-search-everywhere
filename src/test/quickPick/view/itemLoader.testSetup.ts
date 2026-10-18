import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/settings/config";
import { database } from "../../../database";
import { quickPickState } from "../../../quickPick/state";
import { recentItems } from "../../../quickPick/view/recentItems";
import {
  getQpHelpItems,
  getQpItem,
  getQpItems,
} from "../../util/qpItemMockFactory";
import { stubMultiple } from "../../util/stubHelpers";
import { stubControl } from "../../util/quickPickStubs";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    loadItems: {
      setupForLoadingUnsortedItems: () => {
        stubControl(sandbox);
        const items = getQpItems();
        stubMultiple(
          [
            {
              object: quickPickState,
              method: "getItems",
              returns: items,
            },
            {
              object: quickPickState,
              method: "getShouldItemsBeSorted",
              returns: false,
            },
            { object: database, method: "isReady", returns: false },
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
              object: quickPickState,
              method: "getItems",
              returns: items,
            },
            {
              object: quickPickState,
              method: "getShouldItemsBeSorted",
              returns: true,
            },
            { object: database, method: "isReady", returns: false },
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
            { object: quickPickState, method: "getControl", returns: control },
            {
              object: quickPickState,
              method: "getShouldUseItemsFilterPhrases",
              returns: false,
            },
            {
              object: quickPickState,
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
              object: quickPickState,
              method: "getHelpItems",
              returns: helpItems,
            },
          ],
          sandbox
        );

        return helpItems;
      },
    },
  };
};
