import { assert } from "chai";
import * as vscode from "vscode";
import { ActionTrigger, ActionType, ExcludeMode } from "../../types";
import { workspace } from "../../workspace";
import { getTestSetups } from "../testSetup/workspace.testSetup";
import {
  getConfigurationChangeEvent,
  getFileCreateEvent,
  getFileDeleteEvent,
  getFileRenameEvent,
  getTextDocumentChangeEvent,
  getWorkspaceFoldersChangeEvent,
} from "../util/eventMockFactory";
import { getTextDocumentStub } from "../util/stubFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Workspace", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("init", () => {
    it("should clear an index built with other effective settings", async () => {
      const [clearAllStub] = setups.init.setupForComparingIndexedConfig(
        '{"presets":[]}',
        '{"presets":["go"]}'
      );
      await workspace.init();

      assert.equal(clearAllStub.calledOnce, true);
    });

    it("should keep an index built with the same effective settings", async () => {
      const [clearAllStub] = setups.init.setupForComparingIndexedConfig(
        '{"presets":["go"]}',
        '{"presets":["go"]}'
      );
      await workspace.init();

      assert.equal(clearAllStub.called, false);
    });

    it("should keep an index that has no recorded settings", async () => {
      const [clearAllStub] = setups.init.setupForComparingIndexedConfig(
        undefined,
        '{"presets":["go"]}'
      );
      await workspace.init();

      assert.equal(clearAllStub.called, false);
    });

    it("should workspaceFolders.setWorkspaceFoldersCommonPath method be invoked", async () => {
      const [setWorkspaceFoldersCommonPathStub] =
        setups.init.setupForInvokingSetWorkspaceFoldersCommonPath();
      await workspace.init();

      assert.equal(setWorkspaceFoldersCommonPathStub.calledOnce, true);
    });

    it("should dataService.fetchConfig method be invoked", async () => {
      const [fetchConfigStub] =
        setups.init.setupForInvokingDataServiceFetchConfig();
      await workspace.init();

      assert.equal(fetchConfigStub.calledOnce, true);
    });

    it("should dataConverter.fetchConfig method be invoked", async () => {
      const [fetchConfigStub] =
        setups.init.setupForInvokingDataConverterFetchConfig();
      await workspace.init();

      assert.equal(fetchConfigStub.calledOnce, true);
    });
  });

  describe("index", () => {
    it("should indexer.reindex method be invoked", async () => {
      const [reindexStub] = setups.index.setupForInvokingReindexMethod();
      await workspace.index(ActionTrigger.Search);

      assert.isTrue(reindexStub.calledOnceWith(ActionTrigger.Search));
    });
  });

  describe("removeDataForUnsavedUris", () => {
    it("should common.registerAction be invoked twice for each unsaved uri", async () => {
      const [registerActionStub] =
        setups.removeDataForUnsavedUris.setupForInvokingRegisterActionTwiceForEachUnsavedUri();
      await workspace.removeDataForUnsavedUris();

      assert.equal(registerActionStub.callCount, 4);
    });

    it("should clear array of unsaved uris", async () => {
      setups.removeDataForUnsavedUris.setupForClearingArrayOfUnsavedUris();
      await workspace.removeDataForUnsavedUris();

      assert.equal(workspace.getNotSavedUris().size, 0);
    });
  });

  describe("registerEventListeners", () => {
    it("should register workspace event listeners", () => {
      const [
        onDidChangeConfigurationStub,
        onDidChangeWorkspaceFoldersStub,
        onDidChangeTextDocumentStub,
        onDidSaveTextDocumentStub,
        onWillIndexWorkspaceStub,
        onDidIndexWorkspaceStub,
      ] =
        setups.registerEventListeners.setupForRegisteringWorkspaceEventListeners();

      workspace.registerEventListeners();

      assert.equal(onDidChangeConfigurationStub.calledOnce, true);
      assert.equal(onDidChangeWorkspaceFoldersStub.calledOnce, true);
      assert.equal(onDidChangeTextDocumentStub.calledOnce, true);
      assert.equal(onDidSaveTextDocumentStub.calledOnce, true);
      assert.equal(onWillIndexWorkspaceStub.calledOnce, true);
      assert.equal(onDidIndexWorkspaceStub.calledOnce, true);
    });

    it("should stop the retry queue when an index starts and restart it with the files to retry when it finishes", () => {
      const stubs =
        setups.registerEventListeners.setupForRegisteringWorkspaceEventListeners();
      const { stopStub, startStub } =
        setups.registerEventListeners.setupForRetryQueue();
      const urisToRetry = [vscode.Uri.file("/fake/server.go")];

      workspace.registerEventListeners();
      stubs[4].firstCall.args[0]();
      stubs[5].firstCall.args[0](urisToRetry);

      assert.equal(stopStub.calledOnce, true);
      assert.deepEqual(startStub.firstCall.args[0], urisToRetry);
    });
  });

  describe("getData", () => {
    it("should common.getData method be invoked", () => {
      const [getDataStub] =
        setups.getData.setupForInvokingCommonGetDataMethod();

      workspace.getData();
      assert.equal(getDataStub.calledOnce, true);
    });
  });

  describe("shouldReindexOnConfigurationChange", () => {
    it("should return true if extension configuration has changed and is not excluded from refreshing", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningTrueWhenConfigurationChangedAndNotExcluded();

      assert.equal(
        workspace.shouldReindexOnConfigurationChange(
          getConfigurationChangeEvent(true, true, false)
        ),
        true
      );
    });

    it("should return false if extension configuration has changed but is excluded from refreshing", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningFalseWhenConfigurationChangedButExcluded();

      assert.equal(
        workspace.shouldReindexOnConfigurationChange(
          getConfigurationChangeEvent(false)
        ),
        false
      );
    });

    it("should not reindex when categories change", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningFalseWhenConfigurationChangedButExcluded();
      const changed = ["searchEverywhere", "searchEverywhere.categories"];
      const event = {
        affectsConfiguration: (section: string) => changed.includes(section),
      } as vscode.ConfigurationChangeEvent;

      assert.equal(workspace.shouldReindexOnConfigurationChange(event), false);
    });

    it("should return false if extension configuration has not changed", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningFalseWhenConfigurationNotChanged();

      assert.equal(
        workspace.shouldReindexOnConfigurationChange(
          getConfigurationChangeEvent(false)
        ),
        false
      );
    });

    it("should return true if exclude mode is set to 'files and search', configuration has changed and files.exclude has changed", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningTrueWhenFilesAndSearchModeAndFilesExcludeChanged();

      assert.equal(
        workspace.shouldReindexOnConfigurationChange(
          getConfigurationChangeEvent(
            false,
            false,
            true,
            ExcludeMode.FilesAndSearch,
            true
          )
        ),
        true
      );
    });

    it("should return true if exclude mode is set to 'files and search', configuration has changed and search.exclude has changed", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningTrueWhenFilesAndSearchModeAndSearchExcludeChanged();

      assert.equal(
        workspace.shouldReindexOnConfigurationChange(
          getConfigurationChangeEvent(
            false,
            false,
            true,
            ExcludeMode.FilesAndSearch,
            false,
            true
          )
        ),
        true
      );
    });
  });

  describe("handleDidChangeConfiguration", () => {
    it("should index method be invoked which register rebuild action if extension configuration has changed", async () => {
      const [indexStub] =
        setups.handleDidChangeConfiguration.setupForInvokingIndexWhenExtensionConfigurationChanged();

      await workspace.handleDidChangeConfiguration(
        getConfigurationChangeEvent(true)
      );

      assert.equal(indexStub.calledOnce, true);
    });

    it("should onDidDebounceConfigToggle event be emitted if isDebounceConfigurationToggled is true", async () => {
      const eventEmitter =
        setups.handleDidChangeConfiguration.setupForEmittingDebounceConfigToggleEvent();

      await workspace.handleDidChangeConfiguration(
        getConfigurationChangeEvent(true)
      );

      assert.equal(eventEmitter.fire.calledOnce, true);
    });

    it("should onDidSortingConfigToggle event be emitted if isSortingConfigurationToggled is true", async () => {
      const eventEmitter =
        setups.handleDidChangeConfiguration.setupForEmittingSortingConfigToggleEvent();

      await workspace.handleDidChangeConfiguration(
        getConfigurationChangeEvent(true)
      );

      assert.equal(eventEmitter.fire.calledOnce, true);
    });

    it("should recompute secondary code without reindexing when secondaryCode changes", async () => {
      const [, indexStub, , , , recomputeSecondaryStub] =
        setups.handleDidChangeConfiguration.setupForRecomputingSecondaryCode();

      await workspace.handleDidChangeConfiguration({
        affectsConfiguration: (section: string) =>
          section === "searchEverywhere" || section === "searchEverywhere.secondaryCode",
      });

      assert.equal(indexStub.called, false);
      assert.deepEqual(recomputeSecondaryStub.firstCall.args, [["**/*_test.go"]]);
    });

    it("should do nothing if extension configuration has not changed", async () => {
      const [registerActionStub, onDidDebounceConfigToggleEventEmitterStub] =
        setups.handleDidChangeConfiguration.setupForDoingNothingWhenExtensionConfigurationNotChanged();

      await workspace.handleDidChangeConfiguration(
        getConfigurationChangeEvent(false)
      );

      assert.equal(registerActionStub.calledOnce, false);
      assert.equal(onDidDebounceConfigToggleEventEmitterStub.calledOnce, false);
    });

    it("should cache.clearConfig method be invoked", async () => {
      const [clearConfigStub] =
        setups.handleDidChangeConfiguration.setupForInvokingCacheClearConfigMethod();

      await workspace.handleDidChangeConfiguration(
        getConfigurationChangeEvent(true)
      );

      assert.equal(clearConfigStub.calledOnce, true);
    });
  });

  describe("handleDidChangeWorkspaceFolders", () => {
    it("should index method be invoked which register rebuild action if amount of opened folders in workspace has changed", async () => {
      const [indexStub] =
        setups.handleDidChangeWorkspaceFolders.setupForInvokingIndexWhenWorkspaceFoldersChanged();

      await workspace.handleDidChangeWorkspaceFolders(
        getWorkspaceFoldersChangeEvent(true)
      );

      assert.equal(indexStub.calledOnce, true);
    });

    it("should do nothing if extension configuration has not changed", async () => {
      const [registerActionStub] =
        setups.handleDidChangeWorkspaceFolders.setupForDoingNothingWhenWorkspaceFoldersNotChanged();
      await workspace.handleDidChangeWorkspaceFolders(
        getWorkspaceFoldersChangeEvent(false)
      );

      assert.equal(registerActionStub.calledOnce, false);
    });
  });

  describe("handleDidChangeMarkerFile", () => {
    it("should reindex when a marker file is added", async () => {
      const [indexStub, reloadConfigStub] =
        setups.handleDidChangeMarkerFile.setupForMarkerFile(true, true);

      await workspace.handleDidChangeMarkerFile(vscode.Uri.file("/ws/go.mod"));

      assert.equal(reloadConfigStub.calledOnce, true);
      assert.deepEqual(indexStub.firstCall.args, [
        ActionTrigger.ConfigurationChange,
      ]);
    });

    it("should not reindex when the detected presets did not change", async () => {
      const [indexStub] =
        setups.handleDidChangeMarkerFile.setupForMarkerFile(true, false);

      await workspace.handleDidChangeMarkerFile(vscode.Uri.file("/ws/go.mod"));

      assert.equal(indexStub.called, false);
    });

    it("should ignore marker files below a folder root", async () => {
      const [indexStub, , , refreshPresetsStub] =
        setups.handleDidChangeMarkerFile.setupForMarkerFile(false, true);

      await workspace.handleDidChangeMarkerFile(
        vscode.Uri.file("/ws/tools/go.mod")
      );

      assert.equal(refreshPresetsStub.called, false);
      assert.equal(indexStub.called, false);
    });
  });

  describe("handleDidChangeTextDocument", () => {
    it("should registerAction method be invoked which register update action if text document has changed and exists in workspace", async () => {
      const [registerActionStub] =
        setups.handleDidChangeTextDocument.setupForRegisteringUpdateActionWhenDocumentChangedAndExistsInWorkspace();
      const textDocumentChangeEvent = getTextDocumentChangeEvent(true);
      await workspace.handleDidChangeTextDocument(textDocumentChangeEvent);

      assert.equal(registerActionStub.calledTwice, true);
      assert.equal(registerActionStub.args[0][0], ActionType.Remove);
      assert.equal(registerActionStub.args[1][0], ActionType.Update);
    });

    it("should do nothing if text document does not exist in workspace", async () => {
      const [registerActionStub] =
        setups.handleDidChangeTextDocument.setupForDoingNothingWhenDocumentNotExistInWorkspace();
      const textDocumentChangeEvent = getTextDocumentChangeEvent(true);
      await workspace.handleDidChangeTextDocument(textDocumentChangeEvent);

      assert.equal(registerActionStub.calledOnce, false);
    });

    it("should do nothing if text document has not changed", async () => {
      const [registerActionStub] =
        setups.handleDidChangeTextDocument.setupForDoingNothingWhenDocumentNotChanged();
      const textDocumentChangeEvent = await getTextDocumentChangeEvent();
      await workspace.handleDidChangeTextDocument(textDocumentChangeEvent);

      assert.equal(registerActionStub.calledOnce, false);
    });

    it("should add uri to not saved array if text document has changed and exists in workspace", async () => {
      setups.handleDidChangeTextDocument.setupForAddingUriToNotSavedArrayWhenDocumentChangedAndExistsInWorkspace();
      const textDocumentChangeEvent = getTextDocumentChangeEvent(true);
      await workspace.handleDidChangeTextDocument(textDocumentChangeEvent);

      assert.equal(workspace.getNotSavedUris().size, 1);
    });
  });

  describe("handleDidRenameFiles", () => {
    it("should registerAction method be invoked twice to register remove and update actions for each renamed or moved file", async () => {
      const [registerActionStub] =
        setups.handleDidRenameFiles.setupForRegisteringRemoveAndUpdateActionsForRenamedFiles();

      await workspace.handleDidRenameFiles(getFileRenameEvent());

      assert.equal(registerActionStub.callCount, 4);
      assert.equal(registerActionStub.args[0][0], ActionType.Update);
      assert.equal(registerActionStub.args[1][0], ActionType.Remove);
      assert.equal(registerActionStub.args[2][0], ActionType.Update);
      assert.equal(registerActionStub.args[3][0], ActionType.Remove);
    });

    it("should registerAction method be invoked once to register update action for renamed or moved directory", async () => {
      const [registerActionStub] =
        setups.handleDidRenameFiles.setupForRegisteringUpdateActionForRenamedDirectory();

      await workspace.handleDidRenameFiles(getFileRenameEvent(true));

      assert.equal(registerActionStub.calledOnce, true);
      assert.equal(registerActionStub.args[0][0], ActionType.Update);
    });
  });

  describe("handleDidCreateFiles", () => {
    it("should registerAction method be invoked which register update action when file is created", async () => {
      const [registerActionStub] =
        setups.handleDidCreateFiles.setupForRegisteringUpdateActionWhenFileCreated();
      await workspace.handleDidCreateFiles(getFileCreateEvent());

      assert.equal(registerActionStub.calledOnce, true);
      assert.equal(registerActionStub.args[0][0], ActionType.Update);
    });

    it("should registerAction method be invoked which register update action when directory is created", async () => {
      const [registerActionStub] =
        setups.handleDidCreateFiles.setupForRegisteringUpdateActionWhenDirectoryCreated();
      await workspace.handleDidCreateFiles(getFileCreateEvent());

      assert.equal(registerActionStub.calledOnce, true);
      assert.equal(registerActionStub.args[0][0], ActionType.Update);
    });

    it("should add uri to not saved array", async () => {
      setups.handleDidCreateFiles.setupForAddingUriToNotSavedArray();
      await workspace.handleDidCreateFiles(getFileCreateEvent());

      assert.equal(workspace.getNotSavedUris().size, 1);
    });
  });

  describe("handleDidDeleteFiles", () => {
    it("should registerAction method be invoked which register remove action when file is deleted", async () => {
      const [registerActionStub] =
        setups.handleDidDeleteFiles.setupForRegisteringRemoveActionWhenFileDeleted();
      await workspace.handleDidDeleteFiles(getFileDeleteEvent());

      assert.equal(registerActionStub.calledOnce, true);
      assert.equal(registerActionStub.args[0][0], ActionType.Remove);
    });

    it("should registerAction method be invoked which register remove action when directory is deleted", async () => {
      const [registerActionStub] =
        setups.handleDidDeleteFiles.setupForRegisteringRemoveActionWhenDirectoryDeleted();
      await workspace.handleDidDeleteFiles(getFileDeleteEvent());

      assert.equal(registerActionStub.calledOnce, true);
      assert.equal(registerActionStub.args[0][0], ActionType.Remove);
    });
  });

  describe("handleDidSaveTextDocument", () => {
    it("should remove uri from not saved array", async () => {
      setups.handleDidSaveTextDocument.setupForRemovingUriFromNotSavedArray();
      await workspace.handleDidSaveTextDocument(
        getTextDocumentStub(undefined, "/test/path2")
      );

      assert.equal(workspace.getNotSavedUris().size, 2);
    });
  });
});
