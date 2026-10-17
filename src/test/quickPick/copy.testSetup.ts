import * as sinon from "sinon";
import * as vscode from "vscode";
import { quickPick } from "../../quickPick/quickPick";
import { stubControl } from "../util/quickPickStubs";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    copy: {
      setupForCopying: (activeItems: vscode.QuickPickItem[] = []) => {
        stubControl(sandbox);
        const control = quickPick.getControl();
        sandbox.stub(control, "activeItems").get(() => activeItems);
        const writeTextStub = sandbox.stub().resolves();
        sandbox
          .stub(vscode.env, "clipboard")
          .value({ readText: sandbox.stub(), writeText: writeTextStub });
        return [
          writeTextStub,
          sandbox.stub(vscode.window, "setStatusBarMessage"),
          sandbox.stub(control, "hide"),
        ];
      },
    },
  };
};
