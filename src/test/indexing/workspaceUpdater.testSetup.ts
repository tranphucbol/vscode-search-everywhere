import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../platform/config";
import { dataService } from "../../symbols/dataService";
import { database } from "../../database";
import { logger } from "../../platform/logger";
import { asyncUtils } from "../../shared/async";
import { messages } from "../../shared/messages";
import { workspaceIndexer as indexer } from "../../indexing/workspaceIndexer";
import { retryQueue, workspaceUpdater } from "../../indexing/workspaceUpdater";
import { getDocumentSymbolItemSingleLineArray } from "../util/itemMockFactory";
import {
  getQpItems,
  getQpItemsSymbolAndUri,
} from "../util/qpItemMockFactory";
import { stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      retryQueue.stop();
      sandbox.restore();
    },

    updateCacheByPath: {
      setupForInvokingIndexMethodWhenErrorThrown: () => {
        return stubMultiple(
          [
            {
              object: indexer,
              method: "index",
            },
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: indexer,
              method: "downloadData",
              throws: new Error("test error"),
            },
            {
              object: messages,
              method: "printErrorMessage",
            },
          ],
          sandbox
        );
      },

      setupForUpdatingDataWhenFileTextChanged: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: indexer,
              method: "downloadData",
              returns: Promise.resolve(getQpItemsSymbolAndUri("./fake-new/")),
            },
            {
              object: database,
              method: "insertSymbolsBatch",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForUpdatingDataWhenFileCreated: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: indexer,
              method: "downloadData",
              returns: Promise.resolve(getQpItems(1)),
            },
            {
              object: database,
              method: "insertSymbolsBatch",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForUpdatingDataWhenFileRenamedOrMoved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: indexer,
              method: "downloadData",
              returns: Promise.resolve(getQpItems(1)),
            },
            {
              object: database,
              method: "insertSymbolsBatch",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForUpdatingDataForAllUrisWhenFolderRenamedOrMoved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForUpdatingDataWhenFileReloadedIfUnsaved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: indexer,
              method: "downloadData",
              returns: Promise.resolve(getQpItemsSymbolAndUri("./fake-new/")),
            },
            {
              object: database,
              method: "insertSymbolsBatch",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },
    },
    retryQueue: {
      setupForRetrying: (symbolCountsByPath: {
        [path: string]: number[];
      }) => {
        const clock = sandbox.useFakeTimers({ now: 0 });
        const updateUriStub = sandbox
          .stub(workspaceUpdater, "updateUri")
          .callsFake(async (uri: vscode.Uri) => {
            const counts = symbolCountsByPath[uri.path];
            return counts.length > 1 ? counts.shift()! : counts[0];
          });
        sandbox
          .stub(indexer, "registerAction")
          .callsFake(async (_type, fn) => {
            await fn();
          });
        sandbox.stub(logger, "log");
        return { clock, updateUriStub };
      },

      setupForLanguagesWarmedUp: (readyExtensions: string[]) => {
        dataService.resetLanguageWarmup();
        dataService.setIsCancelled(false);
        stubMultiple(
          [
            {
              object: vscode.commands,
              method: "executeCommand",
              callsFake: async (_command: string, uri: vscode.Uri) =>
                readyExtensions.includes(uri.path.split(".").pop()!) &&
                !uri.path.includes("empty")
                  ? getDocumentSymbolItemSingleLineArray(1)
                  : [],
            },
            { object: vscode.workspace, method: "openTextDocument" },
            { object: asyncUtils, method: "sleep" },
            { object: config, method: "fetchIndexNamesOnly", returns: "" },
            { object: dataService, method: "getItemsFilter", returns: {} },
            { object: logger, method: "log" },
          ],
          sandbox
        );
      },
    },
  };
};
