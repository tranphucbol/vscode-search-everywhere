import { assert } from "chai";
import * as vscode from "vscode";
import { dataService } from "../../../symbols/dataService";
import { retryQueue } from "../../../indexing/queue/retryQueue";
import { getTestSetups } from "./retryQueue.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("RetryQueue", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("retryQueue", () => {
    const RETRY_INTERVAL_MS = 30_000;
    const goFile = vscode.Uri.file("/fake/server.go");
    const otherGoFile = vscode.Uri.file("/fake/client.go");

    it("should retry files indexed while their language server was not ready", async () => {
      const { clock, updateUriStub } = setups.retryQueue.setupForRetrying({
        [goFile.path]: [0],
        [otherGoFile.path]: [0],
      });
      retryQueue.start([goFile, otherGoFile]);

      await clock.tickAsync(RETRY_INTERVAL_MS - 1);
      assert.equal(updateUriStub.callCount, 0);
      await clock.tickAsync(1);
      assert.deepEqual(
        updateUriStub.getCalls().map((call) => call.args[0]),
        [goFile, otherGoFile]
      );
    });

    it("should stop retrying a file once it returns symbols", async () => {
      const { clock, updateUriStub } = setups.retryQueue.setupForRetrying({
        [goFile.path]: [3],
        [otherGoFile.path]: [0],
      });
      retryQueue.start([goFile, otherGoFile]);

      await clock.tickAsync(RETRY_INTERVAL_MS * 2);
      const retried = updateUriStub.getCalls().map((call) => call.args[0]);
      assert.deepEqual(retried, [goFile, otherGoFile, otherGoFile]);
      assert.deepEqual(retryQueue.getPendingUris(), [
        otherGoFile,
      ]);
    });

    it("should stop retrying after ten minutes", async () => {
      const { clock, updateUriStub } = setups.retryQueue.setupForRetrying({
        [goFile.path]: [0],
      });
      retryQueue.start([goFile]);

      await clock.tickAsync(10 * 60_000);
      const callCount = updateUriStub.callCount;
      await clock.tickAsync(RETRY_INTERVAL_MS * 4);

      assert.equal(callCount, 19);
      assert.equal(updateUriStub.callCount, callCount);
      assert.deepEqual(retryQueue.getPendingUris(), []);
    });

    it("should not retry files of a language that warmed up", async () => {
      const tsFiles = [
        vscode.Uri.file("/fake/empty.ts"),
        vscode.Uri.file("/fake/app.ts"),
      ];
      setups.retryQueue.setupForLanguagesWarmedUp(["ts"]);
      const workspaceData = await dataService.fetchData([
        goFile,
        otherGoFile,
        ...tsFiles,
      ]);
      retryQueue.start(workspaceData.urisToRetry || []);

      assert.deepEqual(retryQueue.getPendingUris(), [
        goFile,
        otherGoFile,
      ]);
    });
  });
});
