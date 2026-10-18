import * as sinon from "sinon";
import { indexingProgress } from "../../indexing/progress";
import * as config from "../../platform/config";
import { stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    getNotificationLocation: {
      setupForNotificationLocation: () => {
        stubMultiple(
          [
            {
              object: config,
              method: "fetchShouldDisplayNotificationInStatusBar",
              returns: false,
            },
          ],
          sandbox
        );
      },

      setupForWindowLocation: () => {
        stubMultiple(
          [
            {
              object: config,
              method: "fetchShouldDisplayNotificationInStatusBar",
              returns: true,
            },
          ],
          sandbox
        );
      },
    },

    getNotificationTitle: {
      setupForNotificationTitle: () => {
        stubMultiple(
          [
            {
              object: config,
              method: "fetchShouldDisplayNotificationInStatusBar",
              returns: false,
            },
          ],
          sandbox
        );
      },

      setupForStatusBarTitle: () => {
        stubMultiple(
          [
            {
              object: config,
              method: "fetchShouldDisplayNotificationInStatusBar",
              returns: true,
            },
          ],
          sandbox
        );
      },
    },

    handleDidItemIndexed: {
      setupForProgressCalculation: () => {
        indexingProgress.resetProgress();
      },

      setupForProgressReporting: () => {
        stubMultiple(
          [
            {
              object: indexingProgress,
              method: "getProgressStep",
              returns: 20,
            },
            {
              object: indexingProgress,
              method: "getCurrentProgressValue",
              returns: 20,
            },
          ],
          sandbox
        );
      },
    },
  };
};
