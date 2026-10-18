import { assert } from "chai";
import * as vscode from "vscode";
import { DetailedActionType } from "../../../shared/types";
import { fileUpdate } from "../../../indexing/apply/fileUpdate";
import { getTestSetups } from "./fileUpdate.testSetup";
import { getDirectory, getItem } from "../../util/itemMockFactory";
import {
  getQpItems,
  getQpItemsSymbolAndUriExt,
} from "../../util/qpItemMockFactory";

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
      assert.deepEqual(await fileUpdate.downloadData(), getQpItems());
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
      await fileUpdate.updateCacheByPath(
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
      await fileUpdate.updateCacheByPath(
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
      await fileUpdate.updateCacheByPath(
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
      await fileUpdate.updateCacheByPath(
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
      await fileUpdate.updateCacheByPath(
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

      fileUpdate.removeFromCacheByPath(
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

      fileUpdate.removeFromCacheByPath(
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

      fileUpdate.removeFromCacheByPath(
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

      fileUpdate.removeFromCacheByPath(
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

      fileUpdate.removeFromCacheByPath(
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

      fileUpdate.removeFromCacheByPath(
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

      fileUpdate.removeFromCacheByPath(
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
