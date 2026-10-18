import * as sinon from "sinon";
import * as vscode from "vscode";
import { changes } from "../../indexing/changes";
import { ActionType, DetailedActionType } from "../../shared/types";

// One stub for both queue functions, so a test can assert the order of updates
// and removals. Each call records (ActionType, uri, detailedActionType, trigger, oldUri?).
export function stubChanges(sandbox: sinon.SinonSandbox): sinon.SinonStub {
  const queued = sandbox.stub();
  sandbox
    .stub(changes, "queueUpdate")
    .callsFake(
      async (
        uri: vscode.Uri,
        type: DetailedActionType,
        trigger: string,
        oldUri?: vscode.Uri
      ) => queued(ActionType.Update, uri, type, trigger, oldUri)
    );
  sandbox
    .stub(changes, "queueRemove")
    .callsFake(async (uri: vscode.Uri, type: DetailedActionType, trigger: string) =>
      queued(ActionType.Remove, uri, type, trigger)
    );
  return queued;
}
