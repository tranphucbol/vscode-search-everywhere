import { assert } from "chai";
import * as sinon from "sinon";
import { ActionTrigger, ActionType } from "../../shared/types";
import { workspaceReconciler } from "../../indexing/workspaceReconciler";
import { fileUri, getTestSetups } from "./workspaceReconciler.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("WorkspaceReconciler", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  const queued = (queuedStub: sinon.SinonStub, type: ActionType) =>
    queuedStub
      .getCalls()
      .filter((call) => call.args[0] === type)
      .map((call) => call.args[1].toString());

  describe("reconcile", () => {
    it("should queue nothing when every file matches its stored state", async () => {
      const { queuedStub, indexStub } = setups.reconcile.setupForUnchangedFiles();

      const result = await workspaceReconciler.reconcile(ActionTrigger.Reconcile);

      assert.equal(queuedStub.callCount, 0);
      assert.equal(indexStub.callCount, 0);
      assert.deepInclude(result, { added: 0, changed: 0, removed: 0, fullIndex: false });
    });

    it("should queue an update for a file whose mtime changed", async () => {
      const { queuedStub } = setups.reconcile.setupForMtimeChange();

      const result = await workspaceReconciler.reconcile(ActionTrigger.Reconcile);

      assert.deepEqual(queued(queuedStub, ActionType.Update), [
        fileUri("a.ts").toString(),
      ]);
      assert.equal(queuedStub.firstCall.args[3], ActionTrigger.Reconcile);
      assert.equal(result.changed, 1);
    });

    it("should queue an update for a file whose size changed", async () => {
      const { queuedStub } = setups.reconcile.setupForSizeChange();

      const result = await workspaceReconciler.reconcile(ActionTrigger.Reconcile);

      assert.deepEqual(queued(queuedStub, ActionType.Update), [
        fileUri("a.ts").toString(),
      ]);
      assert.equal(result.changed, 1);
    });

    it("should queue an update for a file that is not indexed yet", async () => {
      const { queuedStub } = setups.reconcile.setupForNewFile();

      const result = await workspaceReconciler.reconcile(ActionTrigger.Reconcile);

      assert.deepEqual(queued(queuedStub, ActionType.Update), [
        fileUri("b.ts").toString(),
      ]);
      assert.equal(result.added, 1);
    });

    it("should queue a remove for an indexed file that is no longer listed", async () => {
      const { queuedStub } = setups.reconcile.setupForRemovedFile();

      const result = await workspaceReconciler.reconcile(ActionTrigger.Reconcile);

      assert.deepEqual(queued(queuedStub, ActionType.Remove), [
        fileUri("b.ts").toString(),
      ]);
      assert.deepEqual(queued(queuedStub, ActionType.Update), []);
      assert.equal(result.removed, 1);
    });

    it("should run a full index when more than a quarter of the files changed", async () => {
      const { queuedStub, indexStub } =
        setups.reconcile.setupForQuarterOfFilesChanged();

      const result = await workspaceReconciler.reconcile(ActionTrigger.Reconcile);

      assert.isTrue(indexStub.calledOnceWith(ActionTrigger.Reconcile));
      assert.equal(queuedStub.callCount, 0);
      assert.isTrue(result.fullIndex);
    });

    it("should record a baseline without queuing updates when file_state is empty", async () => {
      const { queuedStub, indexStub, upsertFileStatesStub } =
        setups.reconcile.setupForBaseline();

      const result = await workspaceReconciler.reconcile(ActionTrigger.Reconcile);

      assert.equal(queuedStub.callCount, 0);
      assert.equal(indexStub.callCount, 0);
      assert.isTrue(result.baseline);
      assert.deepEqual(upsertFileStatesStub.firstCall.args[0], [
        [fileUri("a.ts").toString(), { mtime: 1, size: 10 }],
        [fileUri("b.ts").toString(), { mtime: 2, size: 20 }],
      ]);
    });
  });
});
