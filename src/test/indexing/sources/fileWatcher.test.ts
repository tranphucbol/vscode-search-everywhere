import * as assert from "assert";
import { fileWatcher } from "../../../indexing/sources/fileWatcher";
import { ActionTrigger, ActionType, DetailedActionType } from "../../../shared/types";
import {
  fileUri,
  getTestSetups,
} from "./fileWatcher.testSetup";

describe("FileWatcher", () => {
  let setups = getTestSetups();

  beforeEach(() => {
    setups = getTestSetups();
  });

  afterEach(() => {
    setups.afterEach();
  });

  describe("processBatch", () => {
    it("should queue an update when an included file is created outside VS Code", async () => {
      const { fire, queuedStub } = setups.processBatch.setupForIncludedFile();
      const uri = fileUri("src/NewService.ts");

      fire("create", uri);
      await fileWatcher.processBatch();

      assert.equal(queuedStub.calledOnce, true);
      const [type, actionUri, , trigger] = queuedStub.firstCall.args;
      assert.equal(type, ActionType.Update);
      assert.equal(trigger, ActionTrigger.DidChangeFileSystem);
      assert.equal(actionUri.toString(), uri.toString());
    });

    it("should ignore a created file that the exclude patterns match", async () => {
      const { fire, queuedStub } = setups.processBatch.setupForIncludedFile();

      fire("create", fileUri("node_modules/lib/index.ts"));
      fire("create", fileUri("src/generated/api.ts"));
      await fileWatcher.processBatch();

      assert.equal(queuedStub.called, false);
    });

    it("should ignore a change to a file that is open in an editor", async () => {
      const uri = fileUri("src/Open.ts");
      const { fire, queuedStub } = setups.processBatch.setupForOpenFile(uri);

      fire("change", uri);
      await fileWatcher.processBatch();

      assert.equal(queuedStub.called, false);
    });

    it("should ignore a change whose mtime and size equal the stored state", async () => {
      const uri = fileUri("src/Saved.ts");
      const { fire, queuedStub } =
        setups.processBatch.setupForUnchangedState(uri);

      fire("change", uri);
      await fileWatcher.processBatch();

      assert.equal(queuedStub.called, false);
    });

    it("should remove a deleted path and everything under it", async () => {
      const { fire, queuedStub } = setups.processBatch.setupForIncludedFile();
      const uri = fileUri("src/feature");

      fire("delete", uri);
      await fileWatcher.processBatch();

      assert.equal(queuedStub.calledOnce, true);
      const [type, actionUri, detailedType] = queuedStub.firstCall.args;
      assert.equal(type, ActionType.Remove);
      assert.equal(actionUri.toString(), uri.toString());
      assert.equal(detailedType, DetailedActionType.RemoveFileOrDirectory);
    });

    it("should reconcile instead of queuing when a batch exceeds the burst threshold", async () => {
      const { fire, queuedStub, reconcileStub } =
        setups.processBatch.setupForIncludedFile();

      for (let i = 0; i <= 1000; i++) {
        fire("create", fileUri(`src/File${i}.ts`));
      }
      await fileWatcher.processBatch();

      assert.equal(reconcileStub.calledOnceWith(ActionTrigger.Reconcile), true);
      assert.equal(queuedStub.called, false);
    });
  });

  describe("startWatching", () => {
    it("should not create watchers when watchFileSystem is false", () => {
      const { createFileSystemWatcherStub } =
        setups.startWatching.setupForDisabledWatching();

      assert.equal(createFileSystemWatcherStub.called, false);
    });
  });
});
