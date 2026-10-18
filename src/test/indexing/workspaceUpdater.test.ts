import { assert } from "chai";
import * as vscode from "vscode";
import { DetailedActionType } from "../../shared/types";
import { workspaceUpdater } from "../../indexing/workspaceUpdater";
import { getTestSetups } from "./workspaceUpdater.testSetup";
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

  describe("downloadData", () => {
    it("should return downloaded qp items", async () => {
      const qpItems = setups.downloadData.setupForDataDownload();
      assert.deepEqual(await workspaceUpdater.downloadData(), getQpItems());
    });
  });

  describe("updateCacheByPath", () => {
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

  describe("removeFromCacheByPath", () => {
    it("should remove given uri from stored data when file is removed ", () => {
      const [deleteByUriStub] =
        setups.removeFromCacheByPath.setupForRemovingGivenUriFromStoredDataWhenFileRemoved();

      workspaceUpdater.removeFromCacheByPath(
        getItem(),
        DetailedActionType.RemoveFile
      );
      assert.equal(
        deleteByUriStub.calledWith(getItem().toString()),
        true
      );
    });

    it("should remove given uri from stored data when file is renamed or moved", () => {
      const [deleteByUriStub] =
        setups.removeFromCacheByPath.setupForRemovingGivenUriFromStoredDataWhenFileRenamedOrMoved();

      workspaceUpdater.removeFromCacheByPath(
        getItem(),
        DetailedActionType.RenameOrMoveFile
      );
      assert.equal(
        deleteByUriStub.calledWith(getItem().toString()),
        true
      );
    });

    it("should remove given uri from stored data when text in file is changed", () => {
      const [deleteByUriStub] =
        setups.removeFromCacheByPath.setupForRemovingGivenUriFromStoredDataWhenTextInFileChanged();

      workspaceUpdater.removeFromCacheByPath(
        getItem(),
        DetailedActionType.TextChange
      );
      assert.equal(
        deleteByUriStub.calledWith(getItem().toString()),
        true
      );
    });

    it("should remove all uris for given folder uri when directory is removed", () => {
      const [deleteByUriPrefixStub] =
        setups.removeFromCacheByPath.setupForRemovingAllUrisForGivenFolderUriWhenDirectoryRemoved();

      workspaceUpdater.removeFromCacheByPath(
        getDirectory("./fake/"),
        DetailedActionType.RemoveDirectory
      );
      assert.equal(
        deleteByUriPrefixStub.calledWith(getDirectory("./fake/").toString()),
        true
      );
    });

    it("should remove all uris for given folder uri when directory is renamed", () => {
      const [deleteByUriPrefixStub] =
        setups.removeFromCacheByPath.setupForRemovingAllUrisForGivenFolderUriWhenDirectoryRenamed();

      workspaceUpdater.removeFromCacheByPath(
        getDirectory("./fake/"),
        DetailedActionType.RenameOrMoveDirectory
      );
      assert.equal(
        deleteByUriPrefixStub.calledWith(getDirectory("./fake/").toString()),
        true
      );
    });

    it("should remove the path and everything under it when a file or directory is removed", () => {
      const [deleteByUriStub, deleteByUriPrefixStub] =
        setups.removeFromCacheByPath.setupForRemovingPathAndChildrenWhenFileOrDirectoryRemoved();
      const uri = getItem();

      workspaceUpdater.removeFromCacheByPath(
        uri,
        DetailedActionType.RemoveFileOrDirectory
      );
      assert.deepEqual(deleteByUriStub.firstCall.args, [uri.toString()]);
      assert.deepEqual(deleteByUriPrefixStub.firstCall.args, [
        uri.with({ path: `${uri.path}/` }).toString(),
      ]);
    });

    it("should remove given uri when file is reloaded if it is unsaved", () => {
      const [deleteByUriStub] =
        setups.removeFromCacheByPath.setupForRemovingGivenUriWhenFileReloadedIfUnsaved();

      workspaceUpdater.removeFromCacheByPath(
        getItem(),
        DetailedActionType.ReloadUnsavedUri
      );
      assert.equal(
        deleteByUriStub.calledWith(getItem().toString()),
        true
      );
    });
  });
});
