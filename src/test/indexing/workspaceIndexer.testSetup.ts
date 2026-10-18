import { assert } from "chai";
import { performance } from "perf_hooks";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../platform/cache";
import { dataConverter } from "../../symbols/dataConverter";
import { dataService } from "../../symbols/dataService";
import { database } from "../../database";
import * as dataServiceEventsEmitter from "../../shared/events";
import { logger } from "../../platform/logger";
import { asyncUtils } from "../../shared/async";
import { messages } from "../../shared/messages";
import { workspaceFolders } from "../../shared/workspaceFolders";
import { workspaceIndexer } from "../../indexing/workspaceIndexer";
import * as workspaceEventsEmitter from "../../shared/events";
import { getWorkspaceData } from "../util/mockFactory";
import { getQpItems } from "../util/qpItemMockFactory";
import { stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    getData: {
      setupForReturningData: () => {
        stubMultiple(
          [
            { object: database, method: "isReady", returns: false },
            {
              object: cache,
              method: "getData",
              returns: getQpItems(),
            },
          ],
          sandbox
        );
        return getQpItems();
      },

      setupForEmptyCache: () => {
        stubMultiple(
          [
            { object: database, method: "isReady", returns: false },
            {
              object: cache,
              method: "getData",
              returns: undefined,
            },
          ],
          sandbox
        );
        return [];
      },
    },

    indexWithProgress: {
      setupForWorkspaceFolderCheck: () => {
        return stubMultiple(
          [
            {
              object: workspaceFolders,
              method: "hasWorkspaceAnyFolder",
              returns: true,
            },
            {
              object: vscode.window,
              method: "withProgress",
            },
          ],
          sandbox
        );
      },

      setupForNoFolderMessage: () => {
        return stubMultiple(
          [
            {
              object: workspaceFolders,
              method: "hasWorkspaceAnyFolder",
              returns: false,
            },
            {
              object: messages,
              method: "printNoFolderOpenedMessage",
            },
          ],
          sandbox
        );
      },
    },

    cancelIndexing: {
      setupForCancellation: () => {
        return stubMultiple(
          [
            {
              object: dataService,
              method: "cancel",
            },
            {
              object: dataConverter,
              method: "cancel",
            },
          ],
          sandbox
        );
      },
    },

    handleCancellationRequested: {
      setupForCancellationHandling: () => {
        return stubMultiple(
          [
            {
              object: workspaceIndexer,
              method: "cancelIndexing",
            },
          ],
          sandbox
        );
      },
    },

    indexWithProgressTask: {
      setupForCancellationToken: () => {
        const onCancellationRequestedStub = sinon
          .stub()
          .returns({ dispose: sinon.stub() });
        const token = {
          onCancellationRequested: onCancellationRequestedStub,
          isCancellationRequested: false,
        };

        stubMultiple(
          [
            {
              object: dataServiceEventsEmitter,
              method: "onDidItemIndexed",
              returns: { dispose: sinon.stub() },
            },
            {
              object: dataService,
              method: "fetchData",
              returns: Promise.resolve(getWorkspaceData()),
            },
            {
              object: dataConverter,
              method: "convertToQpData",
              returns: getQpItems(),
            },
            {
              object: cache,
              method: "updateData",
            },
            {
              object: asyncUtils,
              method: "sleep",
            },
            {
              object: workspaceIndexer,
              method: "convertMsToSec",
              returns: 1,
            },
            {
              object: messages,
              method: "printStatsMessage",
            },
            {
              object: logger,
              method: "logScanTime",
            },
            {
              object: logger,
              method: "logStructure",
            },
            {
              object: logger,
              method: "log",
            },
          ],
          sandbox
        );

        return {
          token,
        };
      },

      setupForRetryQueue: (urisToRetry: vscode.Uri[]) => {
        stubMultiple(
          [
            {
              object: dataServiceEventsEmitter,
              method: "onDidItemIndexed",
              returns: { dispose: sinon.stub() },
            },
            {
              object: dataService,
              method: "fetchData",
              returns: Promise.resolve({ ...getWorkspaceData(), urisToRetry }),
            },
            { object: asyncUtils, method: "sleep" },
            { object: messages, method: "printStatsMessage" },
            { object: logger, method: "logScanTime" },
            { object: logger, method: "logStructure" },
            { object: logger, method: "log" },
          ],
          sandbox
        );
        const callOrder: string[] = [];
        sandbox
          .stub(workspaceEventsEmitter.onWillIndexWorkspaceEventEmitter, "fire")
          .callsFake(() => {
            callOrder.push("will index");
          });
        sandbox
          .stub(workspaceEventsEmitter.onDidIndexWorkspaceEventEmitter, "fire")
          .callsFake((uris) => {
            callOrder.push("did index");
            assert.deepEqual(uris, urisToRetry);
          });
        return callOrder;
      },

      setupForFlushPersist: () => {
        const [, flushPersistStub, schedulePersistStub] = stubMultiple(
          [
            {
              object: dataServiceEventsEmitter,
              method: "onDidItemIndexed",
              returns: { dispose: sinon.stub() },
            },
            {
              object: database,
              method: "flushPersist",
              returns: Promise.resolve(),
            },
            { object: database, method: "schedulePersist" },
            {
              object: dataService,
              method: "fetchData",
              returns: Promise.resolve(getWorkspaceData()),
            },
            { object: asyncUtils, method: "sleep" },
            { object: messages, method: "printStatsMessage" },
            { object: logger, method: "logScanTime" },
            { object: logger, method: "logStructure" },
            { object: logger, method: "log" },
          ],
          sandbox
        );
        return { flushPersistStub, schedulePersistStub };
      },

      setupForItemIndexedEvent: () => {
        return stubMultiple(
          [
            {
              object: dataServiceEventsEmitter,
              method: "onDidItemIndexed",
              returns: { dispose: sinon.stub() },
            },
            {
              object: dataService,
              method: "fetchData",
              returns: Promise.resolve(getWorkspaceData()),
            },
            {
              object: dataConverter,
              method: "convertToQpData",
              returns: getQpItems(),
            },
            {
              object: cache,
              method: "updateData",
            },
            {
              object: asyncUtils,
              method: "sleep",
            },
            {
              object: workspaceIndexer,
              method: "convertMsToSec",
              returns: 1,
            },
            {
              object: messages,
              method: "printStatsMessage",
            },
            {
              object: logger,
              method: "logScanTime",
            },
            {
              object: logger,
              method: "logStructure",
            },
            {
              object: logger,
              method: "log",
            },
          ],
          sandbox
        );
      },

      setupForPerformanceMeasurement: () => {
        return stubMultiple(
          [
            {
              object: performance,
              method: "now",
              returns: 1000,
            },
            {
              object: dataServiceEventsEmitter,
              method: "onDidItemIndexed",
              returns: { dispose: sinon.stub() },
            },
            {
              object: dataService,
              method: "fetchData",
              returns: Promise.resolve(getWorkspaceData()),
            },
            {
              object: dataConverter,
              method: "convertToQpData",
              returns: getQpItems(),
            },
            {
              object: cache,
              method: "updateData",
            },
            {
              object: asyncUtils,
              method: "sleep",
            },
            {
              object: workspaceIndexer,
              method: "convertMsToSec",
              returns: 1,
            },
            {
              object: messages,
              method: "printStatsMessage",
            },
            {
              object: logger,
              method: "logScanTime",
            },
            {
              object: logger,
              method: "logStructure",
            },
            {
              object: logger,
              method: "log",
            },
          ],
          sandbox
        );
      },

      setupForSleepCall: () => {
        return stubMultiple(
          [
            {
              object: asyncUtils,
              method: "sleep",
            },
            {
              object: dataServiceEventsEmitter,
              method: "onDidItemIndexed",
              returns: { dispose: sinon.stub() },
            },
            {
              object: dataService,
              method: "fetchData",
              returns: Promise.resolve(getWorkspaceData()),
            },
            {
              object: dataConverter,
              method: "convertToQpData",
              returns: getQpItems(),
            },
            {
              object: cache,
              method: "updateData",
            },
            {
              object: workspaceIndexer,
              method: "convertMsToSec",
              returns: 1,
            },
            {
              object: messages,
              method: "printStatsMessage",
            },
            {
              object: logger,
              method: "logScanTime",
            },
            {
              object: logger,
              method: "logStructure",
            },
            {
              object: logger,
              method: "log",
            },
          ],
          sandbox
        );
      },

      setupForStatsLogging: () => {
        return stubMultiple(
          [
            {
              object: messages,
              method: "printStatsMessage",
            },
            {
              object: logger,
              method: "logScanTime",
            },
            {
              object: logger,
              method: "logStructure",
            },
            {
              object: logger,
              method: "log",
            },
            {
              object: dataServiceEventsEmitter,
              method: "onDidItemIndexed",
              returns: { dispose: sinon.stub() },
            },
            {
              object: dataService,
              method: "fetchData",
              returns: Promise.resolve(getWorkspaceData()),
            },
            {
              object: dataConverter,
              method: "convertToQpData",
              returns: getQpItems(),
            },
            {
              object: cache,
              method: "updateData",
            },
            {
              object: asyncUtils,
              method: "sleep",
            },
            {
              object: workspaceIndexer,
              method: "convertMsToSec",
              returns: 1,
            },
          ],
          sandbox
        );
      },
    },

  };
};
