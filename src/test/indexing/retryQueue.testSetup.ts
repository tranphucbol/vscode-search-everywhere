import * as sinon from "sinon";
import * as vscode from "vscode";
import { changes } from "../../indexing/changes";
import { retryQueue } from "../../indexing/retryQueue";
import { workspaceUpdater } from "../../indexing/workspaceUpdater";
import * as config from "../../platform/config";
import { dataService } from "../../symbols/dataService";
import { logger } from "../../platform/logger";
import { asyncUtils } from "../../shared/async";
import { getDocumentSymbolItemSingleLineArray } from "../util/itemMockFactory";
import { stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      retryQueue.stop();
      sandbox.restore();
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
          .stub(changes, "queueRetry")
          .callsFake(async (_uri, retry) => {
            await retry();
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
