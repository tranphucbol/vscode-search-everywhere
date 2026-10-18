import { assert } from "chai";
import * as vscode from "vscode";
import { changes } from "../../../indexing/queue/changes";
import { Action, ActionTrigger, ActionType, DetailedActionType } from "../../../shared/types";
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

  describe("queueFullIndex", () => {
    it("should register a rebuild action", async () => {
      const [registerStub] =
        setups.queueFullIndex.setupForRegisteringRebuildAction();
      await changes.queueFullIndex("test comment");

      const action: Action = registerStub.firstCall.args[0];
      assert.equal(action.type, ActionType.Rebuild);
      assert.equal(action.trigger, "test comment");
    });
  });

  describe("reindex", () => {
    it("should clear the cache and the database before registering a rebuild", async () => {
      const [clearStub, clearAllStub, queueFullIndexStub] =
        setups.reindex.setupForClearingAndIndexing();
      await changes.reindex("test comment");

      assert.equal(clearStub.calledOnce, true);
      assert.equal(clearAllStub.calledOnce, true);
      assert.isTrue(queueFullIndexStub.calledOnceWith("test comment"));
      assert.isTrue(clearAllStub.calledBefore(queueFullIndexStub));
    });
  });

  describe("isRebuilding", () => {
    it("should return true if a rebuild action is queued", () => {
      setups.isRebuilding.setupForQueuedRebuild([
        { type: ActionType.Rebuild, fn: () => {}, trigger: "test" },
      ]);
      assert.isTrue(changes.isRebuilding());
    });

    it("should return false if only updates are queued", () => {
      setups.isRebuilding.setupForQueuedRebuild([
        { type: ActionType.Update, fn: () => {}, trigger: "test", uri },
      ]);
      assert.isFalse(changes.isRebuilding());
    });
  });

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

    it("should print the error and queue a full index if the update throws", async () => {
      const { registerStub, printErrorMessageStub, queueFullIndexStub } =
        setups.queueUpdate.setupForFullIndexWhenUpdateThrows();

      await changes.queueUpdate(
        uri,
        DetailedActionType.TextChange,
        ActionTrigger.DidChangeTextDocument
      );
      const action: Action = registerStub.firstCall.args[0];
      await action.fn();

      assert.equal(printErrorMessageStub.calledOnce, true);
      assert.isTrue(queueFullIndexStub.calledOnceWith("on error catch"));
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

  describe("queueRetry", () => {
    it("should register the retry as an update action", async () => {
      const [registerStub] = setups.queueRetry.setupForRegisteringRetryAction();
      const retry = async () => {};

      await changes.queueRetry(uri, retry);

      const action: Action = registerStub.firstCall.args[0];
      assert.equal(action.type, ActionType.Update);
      assert.equal(action.trigger, ActionTrigger.RetryWithoutSymbols);
      assert.equal(action.uri, uri);
      assert.equal(action.fn, retry);
    });
  });
});
