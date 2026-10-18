import * as sinon from "sinon";
import { actionProcessor } from "../../indexing/actionProcessor";
import { changes } from "../../indexing/changes";
import { workspaceUpdater } from "../../indexing/workspaceUpdater";
import * as cache from "../../platform/cache";
import { database } from "../../database";
import { messages } from "../../shared/messages";
import { Action } from "../../shared/types";
import { stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  const stubQueue = () =>
    stubMultiple(
      [
        {
          object: actionProcessor,
          method: "register",
          returns: Promise.resolve(),
        },
        {
          object: workspaceUpdater,
          method: "updateCacheByPath",
          returns: Promise.resolve(),
        },
        {
          object: workspaceUpdater,
          method: "removeFromCacheByPath",
        },
      ],
      sandbox
    );

  return {
    afterEach: () => {
      sandbox.restore();
    },
    queueFullIndex: {
      setupForRegisteringRebuildAction: stubQueue,
    },
    reindex: {
      setupForClearingAndIndexing: () => {
        return stubMultiple(
          [
            { object: cache, method: "clear" },
            { object: database, method: "clearAll" },
            { object: changes, method: "queueFullIndex" },
          ],
          sandbox
        );
      },
    },
    isRebuilding: {
      setupForQueuedRebuild: (queue: Action[]) => {
        stubMultiple(
          [{ object: actionProcessor, method: "getPreviousAction" }],
          sandbox
        );
        sandbox.replace(actionProcessor, "queue", queue);
      },
    },
    queueUpdate: {
      setupForRegisteringUpdateAction: stubQueue,
      setupForFullIndexWhenUpdateThrows: () => {
        const [registerStub, updateCacheByPathStub] = stubQueue();
        updateCacheByPathStub.rejects(new Error("test error"));
        const [printErrorMessageStub, queueFullIndexStub] = stubMultiple(
          [
            { object: messages, method: "printErrorMessage" },
            { object: changes, method: "queueFullIndex" },
          ],
          sandbox
        );
        return { registerStub, printErrorMessageStub, queueFullIndexStub };
      },
    },
    queueRemove: {
      setupForRegisteringRemoveAction: stubQueue,
    },
    queueRetry: {
      setupForRegisteringRetryAction: stubQueue,
    },
  };
};
