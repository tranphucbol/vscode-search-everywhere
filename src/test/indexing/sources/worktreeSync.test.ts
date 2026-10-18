import { assert } from "chai";
import * as vscode from "vscode";
import { worktreeSync } from "../../../indexing/sources/worktreeSync";
import { ActionTrigger, ActionType } from "../../../shared/types";
import { getTestSetups } from "./worktreeSync.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("WorktreeSync", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("syncSeededWorktree", () => {
    it("should index the git diff between the template commit and HEAD", async () => {
      const { queuedStub, indexStub, restatAllStub } =
        setups.syncSeededWorktree.setupForTemplateCommit();
      await worktreeSync.syncSeededWorktree("/workspace");

      const updated = queuedStub.args
        .filter((args) => args[0] === ActionType.Update)
        .map((args) => (args[1] as vscode.Uri).fsPath)
        .sort();
      assert.deepEqual(updated, ["/workspace/src/changed.ts", "/workspace/src/edited.ts"]);
      assert.equal(indexStub.called, false);
      assert.equal(restatAllStub.calledOnce, true);
      assert.isTrue(restatAllStub.calledAfter(queuedStub));
    });

    it("should warm up the language servers for the changed files before queuing them", async () => {
      const { queuedStub, warmupStub } =
        setups.syncSeededWorktree.setupForTemplateCommit();
      await worktreeSync.syncSeededWorktree("/workspace");

      const warmedUp = (warmupStub.firstCall.args[0] as vscode.Uri[])
        .map((uri) => uri.fsPath)
        .sort();
      assert.deepEqual(warmedUp, ["/workspace/src/changed.ts", "/workspace/src/edited.ts"]);
      assert.isTrue(warmupStub.calledBefore(queuedStub));
    });

    it("should remove files deleted since the template commit", async () => {
      const { queuedStub } = setups.syncSeededWorktree.setupForDeletedFile();
      await worktreeSync.syncSeededWorktree("/workspace");

      const removed = queuedStub.args
        .filter((args) => args[0] === ActionType.Remove)
        .map((args) => (args[1] as vscode.Uri).fsPath);
      const updated = queuedStub.args
        .filter((args) => args[0] === ActionType.Update)
        .map((args) => (args[1] as vscode.Uri).fsPath);
      assert.deepEqual(removed, ["/workspace/src/deleted.ts"]);
      assert.deepEqual(updated, ["/workspace/src/kept.ts"]);
    });

    it("should fully index a seeded worktree whose template has no commit", async () => {
      const { queuedStub, indexStub } =
        setups.syncSeededWorktree.setupForMissingTemplateCommit();
      await worktreeSync.syncSeededWorktree("/workspace");

      assert.isTrue(indexStub.calledOnceWith(ActionTrigger.Startup));
      assert.equal(queuedStub.called, false);
    });

    it("should fully index a seeded worktree that git cannot diff against the template commit", async () => {
      const { queuedStub, indexStub } = setups.syncSeededWorktree.setupForFailedDiff();
      await worktreeSync.syncSeededWorktree("/workspace");

      assert.isTrue(indexStub.calledOnceWith(ActionTrigger.Startup));
      assert.equal(queuedStub.called, false);
    });
  });
});
