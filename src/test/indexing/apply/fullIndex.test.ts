import { assert } from "chai";
import * as vscode from "vscode";
import { fullIndex } from "../../../indexing/apply/fullIndex";
import { getTestSetups } from "./fullIndex.testSetup";
import { getProgress } from "../../util/mockFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("WorkspaceIndexer", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("convertMsToSec", () => {
    it("should get value in ms and convert it to seconds", () => {
      assert.equal(fullIndex.convertMsToSec(2000), 2);
    });
  });

  describe("indexWithProgress", () => {
    it("should workspaceFolders.hasWorkspaceAnyFolder method be invoked", async () => {
      const [hasWorkspaceAnyFolderStub] =
        setups.indexWithProgress.setupForWorkspaceFolderCheck();
      await fullIndex.indexWithProgress();

      assert.equal(hasWorkspaceAnyFolderStub.calledOnce, true);
    });

    it("should messages.printNoFolderOpenedMessage method be invoked if workspaceFolders.hasWorkspaceAnyFolder returns false", async () => {
      const [printNoFolderOpenedMessageStub] =
        setups.indexWithProgress.setupForNoFolderMessage();
      await fullIndex.indexWithProgress();

      assert.equal(printNoFolderOpenedMessageStub.calledOnce, true);
    });
  });

  describe("cancelIndexing", () => {
    it("should call dataService.cancel and dataConverter.cancel methods", () => {
      const [dataServiceCancelStub, dataConverterCancelStub] =
        setups.cancelIndexing.setupForCancellation();
      fullIndex.cancelIndexing();

      assert.equal(dataServiceCancelStub.calledOnce, true);
      assert.equal(dataConverterCancelStub.calledOnce, true);
    });
  });

  describe("handleCancellationRequested", () => {
    it("should call cancelIndexing method", () => {
      const [cancelIndexingStub] =
        setups.handleCancellationRequested.setupForCancellationHandling();
      (fullIndex as any).handleCancellationRequested();

      assert.equal(cancelIndexingStub.calledOnce, true);
    });
  });

  describe("indexWithProgressTask", () => {
    it("should invoke token.onCancellationRequested method", async () => {
      const { token } =
        setups.indexWithProgressTask.setupForCancellationToken();
      await fullIndex.indexWithProgressTask(getProgress(), token as any);

      assert.equal(token.onCancellationRequested.calledOnce, true);
    });

    it("should announce files indexed without symbols when the index finishes", async () => {
      const urisToRetry = [vscode.Uri.file("/fake/server.go")];
      const callOrder =
        setups.indexWithProgressTask.setupForRetryQueue(urisToRetry);
      const token = {
        onCancellationRequested: () => ({ dispose: () => {} }),
      };
      await fullIndex.indexWithProgressTask(getProgress(), token as any);

      assert.deepEqual(callOrder, ["will index", "did index"]);
    });

    it("should flush the index to disk when a full index finishes", async () => {
      const { flushPersistStub, schedulePersistStub } =
        setups.indexWithProgressTask.setupForFlushPersist();
      const token = {
        onCancellationRequested: () => ({ dispose: () => {} }),
      };
      await fullIndex.indexWithProgressTask(getProgress(), token as any);

      assert.equal(flushPersistStub.calledOnce, true);
      assert.equal(schedulePersistStub.called, false);
    });

    it("should invoke onDidItemIndexed method", async () => {
      const [onDidItemIndexedStub] =
        setups.indexWithProgressTask.setupForItemIndexedEvent();
      const token = {
        onCancellationRequested: () => ({ dispose: () => {} }),
      };
      await fullIndex.indexWithProgressTask(getProgress(), token as any);

      assert.equal(onDidItemIndexedStub.calledOnce, true);
    });

    it("should invoke performance.now method", async () => {
      const [performanceNowStub] =
        setups.indexWithProgressTask.setupForPerformanceMeasurement();
      const token = {
        onCancellationRequested: () => ({ dispose: () => {} }),
      };
      await fullIndex.indexWithProgressTask(getProgress(), token as any);

      assert.equal(performanceNowStub.calledTwice, true);
    });

    it("should invoke asyncUtils.sleep method", async () => {
      const [sleepStub] = setups.indexWithProgressTask.setupForSleepCall();
      const token = {
        onCancellationRequested: () => ({ dispose: () => {} }),
      };
      await fullIndex.indexWithProgressTask(getProgress(), token as any);

      assert.equal(sleepStub.calledOnce, true);
    });

    it("should invoke messages.printStatsMessage, logger.logScanTime and logger.logStructure methods", async () => {
      const [printStatsMessageStub, logScanTimeStub, logStructureStub] =
        setups.indexWithProgressTask.setupForStatsLogging();
      const token = {
        onCancellationRequested: () => ({ dispose: () => {} }),
      };
      await fullIndex.indexWithProgressTask(getProgress(), token as any);

      assert.equal(printStatsMessageStub.calledOnce, true);
      assert.equal(logScanTimeStub.calledOnce, true);
      assert.equal(logStructureStub.calledOnce, true);
    });
  });
});
