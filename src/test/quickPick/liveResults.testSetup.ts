import * as sinon from "sinon";
import { stubControl } from "../util/quickPickStubs";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    showLoading: {
      setupForSettingBusyProperty: () => {
        stubControl(sandbox);
      },
    },
  };
};
