import * as sinon from "sinon";
import * as cache from "../../platform/cache";
import { stubChanges } from "../util/changesStub";
import { stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    reloadAll: {
      setupForQueueingTwiceForEachUnsavedUri: () => {
        let notSavedUris: string[] = ["/test/path1", "/test/path2"];

        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: cache,
              method: "getNotSavedUriPaths",
              callsFake: () => notSavedUris,
            },
            {
              object: cache,
              method: "updateNotSavedUriPaths",
              callsFake: (paths: string[]) => (notSavedUris = paths),
            },
          ],
          sandbox
        )];
      },

      setupForClearingArrayOfUnsavedUris: () => {
        let notSavedUris: string[] = ["/test/path1", "/test/path2"];

        [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: cache,
              method: "getNotSavedUriPaths",
              callsFake: () => notSavedUris,
            },
            {
              object: cache,
              method: "updateNotSavedUriPaths",
              callsFake: (paths: string[]) => (notSavedUris = paths),
            },
            {
              object: cache,
              method: "clearNotSavedUriPaths",
              callsFake: () => (notSavedUris = []),
            },
          ],
          sandbox
        )];
      },
    },
  };
};
