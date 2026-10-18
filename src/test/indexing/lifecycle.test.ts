import { assert } from "chai";
import * as vscode from "vscode";
import { lifecycle } from "../../indexing/lifecycle";
import { ActionTrigger } from "../../shared/types";
import { getTestSetups } from "./lifecycle.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Lifecycle", () => {
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
      await lifecycle.init();

      assert.equal(clearAllStub.calledOnce, true);
    });

    it("should keep an index built with the same effective settings", async () => {
      const [clearAllStub] = setups.init.setupForComparingIndexedConfig(
        '{"presets":["go"]}',
        '{"presets":["go"]}'
      );
      await lifecycle.init();

      assert.equal(clearAllStub.called, false);
    });

    it("should keep an index that has no recorded settings", async () => {
      const [clearAllStub] = setups.init.setupForComparingIndexedConfig(
        undefined,
        '{"presets":["go"]}'
      );
      await lifecycle.init();

      assert.equal(clearAllStub.called, false);
    });

    it("should workspaceFolders.setWorkspaceFoldersCommonPath method be invoked", async () => {
      const [setWorkspaceFoldersCommonPathStub] =
        setups.init.setupForInvokingSetWorkspaceFoldersCommonPath();
      await lifecycle.init();

      assert.equal(setWorkspaceFoldersCommonPathStub.calledOnce, true);
    });

    it("should dataService.fetchConfig method be invoked", async () => {
      const [fetchConfigStub] =
        setups.init.setupForInvokingDataServiceFetchConfig();
      await lifecycle.init();

      assert.equal(fetchConfigStub.calledOnce, true);
    });

    it("should dataConverter.fetchConfig method be invoked", async () => {
      const [fetchConfigStub] =
        setups.init.setupForInvokingDataConverterFetchConfig();
      await lifecycle.init();

      assert.equal(fetchConfigStub.calledOnce, true);
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

      lifecycle.registerEventListeners();

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

      lifecycle.registerEventListeners();
      stubs[4].firstCall.args[0]();
      stubs[5].firstCall.args[0](urisToRetry);

      assert.equal(stopStub.calledOnce, true);
      assert.deepEqual(startStub.firstCall.args[0], urisToRetry);
    });
  });

  describe("prepareQuickPickOpen", () => {
    it("should changes.reindex method be invoked with the search trigger if shouldIndexOnQuickPickOpen method returns true", async () => {
      const { quickPick, reindexStub } =
        setups.prepareQuickPickOpen.setupForIndexingOnOpen();
      await lifecycle.prepareQuickPickOpen(quickPick);

      assert.isTrue(reindexStub.calledOnceWith(ActionTrigger.Search));
    });

    it("should init quickPick when it starts indexing on open", async () => {
      const { quickPick, initStub } =
        setups.prepareQuickPickOpen.setupForIndexingOnOpen();
      await lifecycle.prepareQuickPickOpen(quickPick);

      assert.equal(initStub.calledOnce, true);
    });

    it("should not wait for the first index to finish", async () => {
      const { quickPick, reindexStub } =
        setups.prepareQuickPickOpen.setupForIndexingOnOpen(new Promise(() => {}));
      await lifecycle.prepareQuickPickOpen(quickPick);

      assert.equal(reindexStub.calledOnce, true);
    });

    it("should clear config, init quickPick and reload unsaved files if shouldLoadDataFromCacheOnQuickPickOpen method returns true", async () => {
      const { quickPick, initStub, reindexStub, clearConfigStub, reloadAllStub } =
        setups.prepareQuickPickOpen.setupForLoadingFromCache();
      await lifecycle.prepareQuickPickOpen(quickPick);

      assert.equal(clearConfigStub.calledOnce, true);
      assert.equal(initStub.calledOnce, true);
      assert.equal(reloadAllStub.calledOnce, true);
      assert.equal(reindexStub.called, false);
    });

    it("should not load cached data when it starts indexing an empty cache", async () => {
      const { quickPick, reindexStub, clearConfigStub, reloadAllStub } =
        setups.prepareQuickPickOpen.setupForIndexingAnEmptyCache();
      await lifecycle.prepareQuickPickOpen(quickPick);

      assert.equal(reindexStub.calledOnce, true);
      assert.equal(clearConfigStub.called, false);
      assert.equal(reloadAllStub.called, false);
    });

    it("should do nothing if shouldIndexOnQuickPickOpen and shouldLoadDataFromCacheOnQuickPickOpen methods return false", async () => {
      const { quickPick, initStub, reindexStub, clearConfigStub, reloadAllStub } =
        setups.prepareQuickPickOpen.setupForDoingNothing();
      await lifecycle.prepareQuickPickOpen(quickPick);

      assert.equal(reindexStub.called, false);
      assert.equal(clearConfigStub.called, false);
      assert.equal(initStub.called, false);
      assert.equal(reloadAllStub.called, false);
    });
  });

  describe("reload", () => {
    it("should clear unsaved files and reindex with the reload trigger", async () => {
      const [clearStub, reindexStub] = setups.reload.setupForReindexing();
      await lifecycle.reload();

      assert.equal(clearStub.calledOnce, true);
      assert.isTrue(reindexStub.calledOnceWith(ActionTrigger.Reload));
    });
  });

  describe("startup", () => {
    it("should changes.reindex method be invoked if shouldIndexOnStartup method returns true", async () => {
      const { quickPick, reindexStub } =
        setups.startup.setupForIndexingWhenEnabledOnStartup();
      await lifecycle.startup(quickPick);

      assert.isTrue(reindexStub.calledOnceWith(ActionTrigger.Startup));
    });

    it("should do nothing if shouldIndexOnStartup and shouldLoadDataFromCacheOnStartup methods return false", async () => {
      const { quickPick, initStub, reindexStub, clearConfigStub, reloadAllStub, reconcileStub } =
        setups.startup.setupForDoingNothingWhenConditionsFalse();
      await lifecycle.startup(quickPick);

      assert.equal(reindexStub.called, false);
      assert.equal(clearConfigStub.called, false);
      assert.equal(initStub.called, false);
      assert.equal(reloadAllStub.called, false);
      assert.equal(reconcileStub.called, false);
    });

    it("should clear config in cache if shouldLoadDataFromCacheOnStartup method returns true", async () => {
      const { quickPick, clearConfigStub } =
        setups.startup.setupForLoadingFromCacheOnStartup();
      await lifecycle.startup(quickPick);

      assert.equal(clearConfigStub.calledOnce, true);
    });

    it("should init quickPick if shouldLoadDataFromCacheOnStartup method returns true and quickPick is not already initialized", async () => {
      const { quickPick, initStub } =
        setups.startup.setupForLoadingFromCacheOnStartup();
      await lifecycle.startup(quickPick);

      assert.equal(initStub.calledOnce, true);
    });

    it("should reload unsaved files if shouldLoadDataFromCacheOnStartup method returns true", async () => {
      const { quickPick, reloadAllStub } =
        setups.startup.setupForLoadingFromCacheOnStartup();
      await lifecycle.startup(quickPick);

      assert.equal(reloadAllStub.calledOnce, true);
    });

    it("should reconcile a cached index on startup", async () => {
      const { quickPick, reconcileStub, reindexStub } =
        setups.startup.setupForReconcilingCachedIndex();
      await lifecycle.startup(quickPick);

      assert.isTrue(reconcileStub.calledOnceWith(ActionTrigger.Reconcile));
      assert.equal(reindexStub.called, false);
    });

    it("should sync the opened worktree instead of indexing or reconciling when seeded from the template", async () => {
      const { quickPick, initStub, reloadAllStub, syncSeededWorktreeStub, reindexStub, reconcileStub } =
        setups.startup.setupForSeededWorktree();
      await lifecycle.startup(quickPick);

      assert.equal(initStub.calledOnce, true);
      assert.equal(reloadAllStub.calledOnce, true);
      assert.isTrue(syncSeededWorktreeStub.calledOnceWith("/workspace"));
      assert.equal(reindexStub.called, false);
      assert.equal(reconcileStub.called, false);
    });

    it("should log a failed worktree sync", async () => {
      const { quickPick, logStub } = setups.startup.setupForSeededWorktree(
        Promise.reject(new Error("git failed"))
      );
      await lifecycle.startup(quickPick);

      assert.isTrue(
        logStub.calledWith("Error syncing worktree delta: Error: git failed")
      );
    });
  });

  describe("shouldIndexOnQuickPickOpen", () => {
    it("should return true if isInitOnStartupDisabledAndWorkspaceCachingDisabled method returns false and isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty method returns true", () => {
      setups.shouldIndexOnQuickPickOpen.setupForConditions(false, true);

      assert.equal(lifecycle.shouldIndexOnQuickPickOpen(false), true);
    });

    it("should return true if isInitOnStartupDisabledAndWorkspaceCachingDisabled method returns true and isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty method returns false", () => {
      setups.shouldIndexOnQuickPickOpen.setupForConditions(true, false);

      assert.equal(lifecycle.shouldIndexOnQuickPickOpen(false), true);
    });

    it("should return true if isInitOnStartupDisabledAndWorkspaceCachingDisabled and isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty methods return true", () => {
      setups.shouldIndexOnQuickPickOpen.setupForConditions(true, true);

      assert.equal(lifecycle.shouldIndexOnQuickPickOpen(false), true);
    });

    it("should return false if isInitOnStartupDisabledAndWorkspaceCachingDisabled and isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty methods return false", () => {
      setups.shouldIndexOnQuickPickOpen.setupForConditions(false, false);

      assert.equal(lifecycle.shouldIndexOnQuickPickOpen(false), false);
    });
  });

  describe("shouldIndexOnStartup", () => {
    it("should return true if isInitOnStartupEnabledAndWorkspaceCachingDisabled method returns false and isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty method returns true", () => {
      setups.shouldIndexOnStartup.setupForConditions(false, true);

      assert.equal(lifecycle.shouldIndexOnStartup(false), true);
    });

    it("should return true if isInitOnStartupEnabledAndWorkspaceCachingDisabled method returns true and isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty method returns false", () => {
      setups.shouldIndexOnStartup.setupForConditions(true, false);

      assert.equal(lifecycle.shouldIndexOnStartup(false), true);
    });

    it("should return true if isInitOnStartupEnabledAndWorkspaceCachingDisabled and isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty methods return true", () => {
      setups.shouldIndexOnStartup.setupForConditions(true, true);

      assert.equal(lifecycle.shouldIndexOnStartup(false), true);
    });

    it("should return false if isInitOnStartupEnabledAndWorkspaceCachingDisabled and isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty methods return false", () => {
      setups.shouldIndexOnStartup.setupForConditions(false, false);

      assert.equal(lifecycle.shouldIndexOnStartup(false), false);
    });
  });

  describe("isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty", () => {
    const predicate = (isQuickPickInitialized: boolean) =>
      lifecycle.isInitOnStartupDisabledAndWorkspaceCachingEnabledButDataIsEmpty(
        isQuickPickInitialized
      );

    it("should return false if quickPick is already initialized", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(predicate(true), false);
    });

    it("should return false if fetchShouldInitOnStartup method returns true", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(predicate(false), false);
    });

    it("should return false if fetchShouldWorkspaceDataBeCached method returns false", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(predicate(false), false);
    });

    it("should return false if data is not empty", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: true,
        isEmpty: false,
      });

      assert.equal(predicate(false), false);
    });

    it("should return true if quickPick is not initialized, fetchShouldInitOnStartup method returns false and fetchShouldWorkspaceDataBeCached method returns true and data is empty", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(predicate(false), true);
    });
  });

  describe("isInitOnStartupDisabledAndWorkspaceCachingDisabled", () => {
    const predicate = (isQuickPickInitialized: boolean) =>
      lifecycle.isInitOnStartupDisabledAndWorkspaceCachingDisabled(isQuickPickInitialized);

    it("should return false if quickPick is already initialized", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(predicate(true), false);
    });

    it("should return false if fetchShouldInitOnStartup method returns true", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(predicate(false), false);
    });

    it("should return false if fetchShouldWorkspaceDataBeCached method returns true", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(predicate(false), false);
    });

    it("should return true if quickPick is not initialized, fetchShouldInitOnStartup method returns false and fetchShouldWorkspaceDataBeCached method returns false", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(predicate(false), true);
    });
  });

  describe("isInitOnStartupEnabledAndWorkspaceCachingDisabled", () => {
    const predicate = (isQuickPickInitialized: boolean) =>
      lifecycle.isInitOnStartupEnabledAndWorkspaceCachingDisabled(isQuickPickInitialized);

    it("should return false if quickPick is already initialized", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(predicate(true), false);
    });

    it("should return false if fetchShouldInitOnStartup method returns false", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(predicate(false), false);
    });

    it("should return false if fetchShouldWorkspaceDataBeCached method returns true", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(predicate(false), false);
    });

    it("should return true if quickPick is not initialized, fetchShouldInitOnStartup method returns true and fetchShouldWorkspaceDataBeCached method returns false", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(predicate(false), true);
    });
  });

  describe("isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty", () => {
    const predicate = (isQuickPickInitialized: boolean) =>
      lifecycle.isInitOnStartupEnabledAndWorkspaceCachingEnabledButDataIsEmpty(
        isQuickPickInitialized
      );

    it("should return false if quickPick is already initialized", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(predicate(true), false);
    });

    it("should return false if fetchShouldInitOnStartup method returns false", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(predicate(false), false);
    });

    it("should return false if fetchShouldWorkspaceDataBeCached method returns false", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(predicate(false), false);
    });

    it("should return false if data is not empty", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: true,
        isEmpty: false,
      });

      assert.equal(predicate(false), false);
    });

    it("should return true if quickPick is not initialized, fetchShouldInitOnStartup method returns true and fetchShouldWorkspaceDataBeCached method returns true and data is empty", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(predicate(false), true);
    });
  });

  describe("shouldLoadDataFromCacheOnQuickPickOpen", () => {
    it("should return false if quickPick is already initialized", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(lifecycle.shouldLoadDataFromCacheOnQuickPickOpen(true), false);
    });

    it("should return false if fetchShouldInitOnStartup method returns true", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(lifecycle.shouldLoadDataFromCacheOnQuickPickOpen(false), false);
    });

    it("should return false if fetchShouldWorkspaceDataBeCached method returns false", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(lifecycle.shouldLoadDataFromCacheOnQuickPickOpen(false), false);
    });

    it("should return true if quickPick is not initialized, fetchShouldInitOnStartup method returns false and fetchShouldWorkspaceDataBeCached method returns true", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(lifecycle.shouldLoadDataFromCacheOnQuickPickOpen(false), true);
    });
  });

  describe("shouldLoadDataFromCacheOnStartup", () => {
    it("should return false if quickPick is already initialized", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(lifecycle.shouldLoadDataFromCacheOnStartup(true), false);
    });

    it("should return false if fetchShouldInitOnStartup method returns false", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(lifecycle.shouldLoadDataFromCacheOnStartup(false), false);
    });

    it("should return false if fetchShouldWorkspaceDataBeCached method returns false", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: false,
      });

      assert.equal(lifecycle.shouldLoadDataFromCacheOnStartup(false), false);
    });

    it("should return true if quickPick is not initialized, fetchShouldInitOnStartup and fetchShouldWorkspaceDataBeCached methods return true", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: true,
        fetchShouldWorkspaceDataBeCached: true,
      });

      assert.equal(lifecycle.shouldLoadDataFromCacheOnStartup(false), true);
    });
  });

  describe("shouldReconcileOnStartup", () => {
    it("should return true for a cached index that is not empty", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: true,
        isEmpty: false,
      });

      assert.equal(lifecycle.shouldReconcileOnStartup(), true);
    });

    it("should return false when workspace data is not cached", () => {
      setups.settings.setupForSettings({
        fetchShouldInitOnStartup: false,
        fetchShouldWorkspaceDataBeCached: false,
        isEmpty: false,
      });

      assert.equal(lifecycle.shouldReconcileOnStartup(), false);
    });
  });
});
