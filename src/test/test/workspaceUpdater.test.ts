import { assert } from "chai";
import * as vscode from "vscode";
import { dataService } from "../../dataService";
import { DetailedActionType } from "../../types";
import * as workspaceUpdater from "../../workspaceUpdater";
import { getTestSetups } from "../testSetup/workspaceUpdater.testSetup";
import { getDirectory, getItem } from "../util/itemMockFactory";
import {
  getQpItems,
  getQpItemsSymbolAndUriExt,
} from "../util/qpItemMockFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("WorkspaceUpdater", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("updateCacheByPath", () => {
    it("should index method be invoked which register rebuild action if error is thrown", async () => {
      const [indexStub] =
        setups.updateCacheByPath.setupForInvokingIndexMethodWhenErrorThrown();
      await workspaceUpdater.updateCacheByPath(
        getItem(),
        DetailedActionType.TextChange
      );
      assert.equal(indexStub.calledOnce, true);
    });

    it("should update data for given uri when file text is changed", async () => {
      const [
        deleteByUriStub,
        downloadDataStub,
        insertSymbolsBatchStub,
        schedulePersistStub,
      ] = setups.updateCacheByPath.setupForUpdatingDataWhenFileTextChanged();
      await workspaceUpdater.updateCacheByPath(
        getItem(),
        DetailedActionType.TextChange
      );
      assert.equal(deleteByUriStub.calledWith(getItem().toString()), true);
      assert.equal(
        insertSymbolsBatchStub.calledWith(
          getQpItemsSymbolAndUriExt("./fake-new/")
        ),
        true
      );
      assert.equal(schedulePersistStub.calledOnce, true);
    });

    it("should update data for given uri when file is created", async () => {
      const [
        deleteByUriStub,
        downloadDataStub,
        insertSymbolsBatchStub,
        schedulePersistStub,
      ] = setups.updateCacheByPath.setupForUpdatingDataWhenFileCreated();
      await workspaceUpdater.updateCacheByPath(
        getItem(),
        DetailedActionType.CreateNewFile
      );
      assert.equal(deleteByUriStub.calledWith(getItem().toString()), true);
      assert.equal(insertSymbolsBatchStub.calledWith(getQpItems(1)), true);
      assert.equal(schedulePersistStub.calledOnce, true);
    });

    it("should update data for given uri when file is renamed or moved", async () => {
      const [
        deleteByUriStub,
        downloadDataStub,
        insertSymbolsBatchStub,
        schedulePersistStub,
      ] = setups.updateCacheByPath.setupForUpdatingDataWhenFileRenamedOrMoved();
      await workspaceUpdater.updateCacheByPath(
        getItem(),
        DetailedActionType.RenameOrMoveFile
      );
      assert.equal(deleteByUriStub.calledWith(getItem().toString()), true);
      assert.equal(insertSymbolsBatchStub.calledWith(getQpItems(1)), true);
      assert.equal(schedulePersistStub.calledOnce, true);
    });

    it("should update data for all uris for given folder uri when folder renamed or moved", async () => {
      const [schedulePersistStub] =
        setups.updateCacheByPath.setupForUpdatingDataForAllUrisWhenFolderRenamedOrMoved();
      await workspaceUpdater.updateCacheByPath(
        getDirectory("./fake-new/"),
        DetailedActionType.RenameOrMoveDirectory
      );
      assert.equal(schedulePersistStub.calledOnce, true);
    });

    it("should update data for given uri when file is reloaded if it is unsaved", async () => {
      const [
        deleteByUriStub,
        downloadDataStub,
        insertSymbolsBatchStub,
        schedulePersistStub,
      ] = setups.updateCacheByPath.setupForUpdatingDataWhenFileReloadedIfUnsaved();
      await workspaceUpdater.updateCacheByPath(
        getItem(),
        DetailedActionType.ReloadUnsavedUri
      );
      assert.equal(deleteByUriStub.calledWith(getItem().toString()), true);
      assert.equal(
        insertSymbolsBatchStub.calledWith(
          getQpItemsSymbolAndUriExt("./fake-new/")
        ),
        true
      );
      assert.equal(schedulePersistStub.calledOnce, true);
    });
  });

  describe("retryQueue", () => {
    const RETRY_INTERVAL_MS = 30_000;
    const goFile = vscode.Uri.file("/fake/server.go");
    const otherGoFile = vscode.Uri.file("/fake/client.go");

    it("should retry files indexed while their language server was not ready", async () => {
      const { clock, updateUriStub } = setups.retryQueue.setupForRetrying({
        [goFile.path]: [0],
        [otherGoFile.path]: [0],
      });
      workspaceUpdater.retryQueue.start([goFile, otherGoFile]);

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
      workspaceUpdater.retryQueue.start([goFile, otherGoFile]);

      await clock.tickAsync(RETRY_INTERVAL_MS * 2);
      const retried = updateUriStub.getCalls().map((call) => call.args[0]);
      assert.deepEqual(retried, [goFile, otherGoFile, otherGoFile]);
      assert.deepEqual(workspaceUpdater.retryQueue.getPendingUris(), [
        otherGoFile,
      ]);
    });

    it("should stop retrying after ten minutes", async () => {
      const { clock, updateUriStub } = setups.retryQueue.setupForRetrying({
        [goFile.path]: [0],
      });
      workspaceUpdater.retryQueue.start([goFile]);

      await clock.tickAsync(10 * 60_000);
      const callCount = updateUriStub.callCount;
      await clock.tickAsync(RETRY_INTERVAL_MS * 4);

      assert.equal(callCount, 19);
      assert.equal(updateUriStub.callCount, callCount);
      assert.deepEqual(workspaceUpdater.retryQueue.getPendingUris(), []);
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
      workspaceUpdater.retryQueue.start(workspaceData.urisToRetry || []);

      assert.deepEqual(workspaceUpdater.retryQueue.getPendingUris(), [
        goFile,
        otherGoFile,
      ]);
    });
  });
});
