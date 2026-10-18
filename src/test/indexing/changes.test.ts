import { assert } from "chai";
import * as vscode from "vscode";
import { changes } from "../../indexing/changes";
import { Action, ActionTrigger, ActionType, DetailedActionType } from "../../shared/types";
import { getTestSetups } from "./changes.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Changes", () => {
  let setups: SetupsType;
  const uri = vscode.Uri.file("/workspace/src/a.ts");
  const oldUri = vscode.Uri.file("/workspace/src/old.ts");

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("queueUpdate", () => {
    it("should register an update action that updates the given uri", async () => {
      const [registerStub, updateCacheByPathStub] =
        setups.queueUpdate.setupForRegisteringUpdateAction();

      await changes.queueUpdate(
        uri,
        DetailedActionType.RenameOrMoveFile,
        ActionTrigger.DidRenameFiles,
        oldUri
      );

      const action: Action = registerStub.firstCall.args[0];
      assert.equal(action.type, ActionType.Update);
      assert.equal(action.trigger, ActionTrigger.DidRenameFiles);
      assert.equal(action.uri, uri);
      await action.fn();
      assert.deepEqual(updateCacheByPathStub.firstCall.args, [
        uri,
        DetailedActionType.RenameOrMoveFile,
        oldUri,
      ]);
    });
  });

  describe("queueRemove", () => {
    it("should register a remove action that removes the given uri", async () => {
      const [registerStub, , removeFromCacheByPathStub] =
        setups.queueRemove.setupForRegisteringRemoveAction();

      await changes.queueRemove(
        uri,
        DetailedActionType.RemoveFile,
        ActionTrigger.DidDeleteFiles
      );

      const action: Action = registerStub.firstCall.args[0];
      assert.equal(action.type, ActionType.Remove);
      assert.equal(action.trigger, ActionTrigger.DidDeleteFiles);
      assert.equal(action.uri, uri);
      action.fn();
      assert.deepEqual(removeFromCacheByPathStub.firstCall.args, [
        uri,
        DetailedActionType.RemoveFile,
      ]);
    });
  });
});
