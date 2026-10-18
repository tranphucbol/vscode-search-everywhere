import * as sinon from "sinon";
import * as vscode from "vscode";
import { quickPickState } from "../../quickPick/state";
import { stubMultiple } from "./stubHelpers";

export function stubControl(sandbox: sinon.SinonSandbox) {
  const quickPickInner = vscode.window.createQuickPick<vscode.QuickPickItem>();
  stubMultiple(
    [
      {
        object: quickPickState,
        method: "getControl",
        returns: quickPickInner,
      },
    ],
    sandbox
  );
}
