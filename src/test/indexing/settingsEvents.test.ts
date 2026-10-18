import { assert } from "chai";
import * as vscode from "vscode";
import { ActionTrigger, ExcludeMode } from "../../shared/types";
import { settingsEvents } from "../../indexing/settingsEvents";
import {
  getConfigurationChangeEvent,
  getWorkspaceFoldersChangeEvent,
} from "../util/eventMockFactory";
import { getTestSetups } from "./settingsEvents.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("SettingsEvents", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("shouldReindexOnConfigurationChange", () => {
    it("should return true if extension configuration has changed and is not excluded from refreshing", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningTrueWhenConfigurationChangedAndNotExcluded();

      assert.equal(
        settingsEvents.shouldReindexOnConfigurationChange(
          getConfigurationChangeEvent(true, true, false)
        ),
        true
      );
    });

    it("should return false if extension configuration has changed but is excluded from refreshing", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningFalseWhenConfigurationChangedButExcluded();

      assert.equal(
        settingsEvents.shouldReindexOnConfigurationChange(
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

      assert.equal(settingsEvents.shouldReindexOnConfigurationChange(event), false);
    });

    it("should return false if extension configuration has not changed", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningFalseWhenConfigurationNotChanged();

      assert.equal(
        settingsEvents.shouldReindexOnConfigurationChange(
          getConfigurationChangeEvent(false)
        ),
        false
      );
    });

    it("should return true if exclude mode is set to 'files and search', configuration has changed and files.exclude has changed", () => {
      setups.shouldReindexOnConfigurationChange.setupForReturningTrueWhenFilesAndSearchModeAndFilesExcludeChanged();

      assert.equal(
        settingsEvents.shouldReindexOnConfigurationChange(
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
        settingsEvents.shouldReindexOnConfigurationChange(
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

      await settingsEvents.handleDidChangeConfiguration(
        getConfigurationChangeEvent(true)
      );

      assert.equal(indexStub.calledOnce, true);
    });

    it("should onDidDebounceConfigToggle event be emitted if isDebounceConfigurationToggled is true", async () => {
      const eventEmitter =
        setups.handleDidChangeConfiguration.setupForEmittingDebounceConfigToggleEvent();

      await settingsEvents.handleDidChangeConfiguration(
        getConfigurationChangeEvent(true)
      );

      assert.equal(eventEmitter.fire.calledOnce, true);
    });

    it("should onDidSortingConfigToggle event be emitted if isSortingConfigurationToggled is true", async () => {
      const eventEmitter =
        setups.handleDidChangeConfiguration.setupForEmittingSortingConfigToggleEvent();

      await settingsEvents.handleDidChangeConfiguration(
        getConfigurationChangeEvent(true)
      );

      assert.equal(eventEmitter.fire.calledOnce, true);
    });

    it("should recompute secondary code and schedule a save without reindexing when secondaryCode changes", async () => {
      const [, indexStub, , , , recomputeSecondaryStub, , schedulePersistStub] =
        setups.handleDidChangeConfiguration.setupForRecomputingSecondaryCode();

      await settingsEvents.handleDidChangeConfiguration({
        affectsConfiguration: (section: string) =>
          section === "searchEverywhere" || section === "searchEverywhere.secondaryCode",
      });

      assert.equal(indexStub.called, false);
      assert.deepEqual(recomputeSecondaryStub.firstCall.args, [["**/*_test.go"]]);
      assert.equal(schedulePersistStub.calledOnce, true);
    });

    it("should do nothing if extension configuration has not changed", async () => {
      const [queuedStub, onDidDebounceConfigToggleEventEmitterStub] =
        setups.handleDidChangeConfiguration.setupForDoingNothingWhenExtensionConfigurationNotChanged();

      await settingsEvents.handleDidChangeConfiguration(
        getConfigurationChangeEvent(false)
      );

      assert.equal(queuedStub.calledOnce, false);
      assert.equal(onDidDebounceConfigToggleEventEmitterStub.calledOnce, false);
    });

    it("should cache.clearConfig method be invoked", async () => {
      const [clearConfigStub] =
        setups.handleDidChangeConfiguration.setupForInvokingCacheClearConfigMethod();

      await settingsEvents.handleDidChangeConfiguration(
        getConfigurationChangeEvent(true)
      );

      assert.equal(clearConfigStub.calledOnce, true);
    });
  });

  describe("handleDidChangeWorkspaceFolders", () => {
    it("should index method be invoked which register rebuild action if amount of opened folders in workspace has changed", async () => {
      const [indexStub] =
        setups.handleDidChangeWorkspaceFolders.setupForInvokingIndexWhenWorkspaceFoldersChanged();

      await settingsEvents.handleDidChangeWorkspaceFolders(
        getWorkspaceFoldersChangeEvent(true)
      );

      assert.equal(indexStub.calledOnce, true);
    });

    it("should do nothing if extension configuration has not changed", async () => {
      const [queuedStub] =
        setups.handleDidChangeWorkspaceFolders.setupForDoingNothingWhenWorkspaceFoldersNotChanged();
      await settingsEvents.handleDidChangeWorkspaceFolders(
        getWorkspaceFoldersChangeEvent(false)
      );

      assert.equal(queuedStub.calledOnce, false);
    });
  });

  describe("handleDidChangeMarkerFile", () => {
    it("should reindex when a marker file is added", async () => {
      const [indexStub, reloadConfigStub] =
        setups.handleDidChangeMarkerFile.setupForMarkerFile(true, true);

      await settingsEvents.handleDidChangeMarkerFile(vscode.Uri.file("/ws/go.mod"));

      assert.equal(reloadConfigStub.calledOnce, true);
      assert.deepEqual(indexStub.firstCall.args, [
        ActionTrigger.ConfigurationChange,
      ]);
    });

    it("should not reindex when the detected presets did not change", async () => {
      const [indexStub] =
        setups.handleDidChangeMarkerFile.setupForMarkerFile(true, false);

      await settingsEvents.handleDidChangeMarkerFile(vscode.Uri.file("/ws/go.mod"));

      assert.equal(indexStub.called, false);
    });

    it("should ignore marker files below a folder root", async () => {
      const [indexStub, , , refreshPresetsStub] =
        setups.handleDidChangeMarkerFile.setupForMarkerFile(false, true);

      await settingsEvents.handleDidChangeMarkerFile(
        vscode.Uri.file("/ws/tools/go.mod")
      );

      assert.equal(refreshPresetsStub.called, false);
      assert.equal(indexStub.called, false);
    });
  });

  describe("register", () => {
    it("should listen to settings, workspace folders and preset marker files", () => {
      const [
        onDidChangeConfigurationStub,
        onDidChangeWorkspaceFoldersStub,
        createFileSystemWatcherStub,
      ] = setups.register.setupForRegisteringListeners();

      settingsEvents.register();

      assert.equal(onDidChangeConfigurationStub.calledOnce, true);
      assert.equal(onDidChangeWorkspaceFoldersStub.calledOnce, true);
      assert.equal(createFileSystemWatcherStub.calledOnce, true);
    });
  });
});
