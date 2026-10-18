import * as sinon from "sinon";
import * as config from "../../../platform/config";
import { dataConverter } from "../../../symbols/items/dataConverter";
import { Icons } from "../../../shared/types";
import { vscodeVersion } from "../../../shared/vscodeVersion";
import { stubMultiple } from "../../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    fileIcons: {
      setupForFileIconTheme: (
        useFileIconTheme: boolean,
        supported: boolean = true,
        icons: Icons = { 0: "symbol-file", 4: "symbol-class" }
      ) => {
        return stubMultiple(
          [
            {
              object: config,
              method: "fetchUseFileIconTheme",
              returns: useFileIconTheme,
            },
            {
              object: vscodeVersion,
              method: "supportsQuickPickFileIconTheme",
              returns: supported,
            },
            {
              object: dataConverter,
              method: "getIcons",
              returns: icons,
            },
          ],
          sandbox
        );
      },
    },
  };
};
