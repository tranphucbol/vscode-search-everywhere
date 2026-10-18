import * as sinon from "sinon";
import { actionProcessor } from "../../indexing/actionProcessor";
import * as workspaceRemover from "../../indexing/workspaceRemover";
import * as workspaceUpdater from "../../indexing/workspaceUpdater";
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
          object: workspaceRemover,
          method: "removeFromCacheByPath",
        },
      ],
      sandbox
    );

  return {
    afterEach: () => {
      sandbox.restore();
    },
    queueUpdate: {
      setupForRegisteringUpdateAction: stubQueue,
    },
    queueRemove: {
      setupForRegisteringRemoveAction: stubQueue,
    },
  };
};
