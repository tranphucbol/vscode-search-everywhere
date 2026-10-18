import * as sinon from "sinon";
import { actionQueue } from "../../../indexing/queue/actionQueue";
import { changes } from "../../../indexing/queue/changes";
import { fileUpdate } from "../../../indexing/apply/fileUpdate";
import * as cache from "../../../platform/cache";
import { database } from "../../../database";
import { messages } from "../../../shared/messages";
import { Action } from "../../../shared/types";
import { stubMultiple } from "../../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  const stubQueue = () =>
    stubMultiple(
      [
        {
          object: actionQueue,
          method: "register",
          returns: Promise.resolve(),
        },
        {
          object: fileUpdate,
          method: "updateCacheByPath",
          returns: Promise.resolve(),
        },
        {
          object: fileUpdate,
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
          [{ object: actionQueue, method: "getPreviousAction" }],
          sandbox
        );
        sandbox.replace(actionQueue, "queue", queue);
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
