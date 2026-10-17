import * as sinon from "sinon";
import * as vscode from "vscode";
import { stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  const stubShowInformationMessage = () =>
    stubMultiple(
      [
        {
          object: vscode.window,
          method: "showInformationMessage",
        },
      ],
      sandbox
    );

  return {
    afterEach: () => {
      sandbox.restore();
    },

    printNoFolderOpenedMessage: {
      setupForDisplayingNotification: stubShowInformationMessage,
    },

    printErrorMessage: {
      setupForDisplayingNotification: stubShowInformationMessage,
    },

    printStatsMessage: {
      setupForDisplayingStatsNotification: stubShowInformationMessage,
    },
  };
};
