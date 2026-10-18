import { assert } from "chai";
import { controller } from "../../commands/controller";
import { quickPick } from "../../quickPick/quickPick";
import { ActionType } from "../../shared/types";
import { getTestSetups } from "./controller.testSetup";
import { getAction, getExtensionContext } from "../util/mockFactory";
import { getQpItems } from "../util/qpItemMockFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Controller", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("init", () => {
    it("should set extensionContext", async () => {
      const extensionContext = setups.init.setupForExtensionContextAssignment();
      await controller.init(extensionContext);

      assert.equal(extensionContext, controller.getExtensionContext());
    });

    it("should init cache", async () => {
      const [initCacheStub] = setups.init.setupForCacheInitialization();
      await controller.init(getExtensionContext());

      assert.equal(initCacheStub.calledOnce, true);
    });

    it("should init lifecycle", async () => {
      const [initLifecycleStub] = setups.init.setupForLifecycleInitialization();
      await controller.init(getExtensionContext());

      assert.equal(initLifecycleStub.calledOnce, true);
    });

    it("should register event listeners", async () => {
      const [
        onWillProcessingStub,
        onDidProcessingStub,
        onWillExecuteActionStub,
        onDidDebounceConfigToggleStub,
        onWillReindexOnConfigurationChangeStub,
      ] = setups.init.setupForEventListenerRegistration();
      await controller.init(getExtensionContext());

      assert.equal(onWillProcessingStub.calledOnce, true);
      assert.equal(onDidProcessingStub.calledOnce, true);
      assert.equal(onWillExecuteActionStub.calledOnce, true);
      assert.equal(onDidDebounceConfigToggleStub.calledOnce, true);
      assert.equal(onWillReindexOnConfigurationChangeStub.calledOnce, true);
    });
  });

  describe("toggleIncludeLibraries", () => {
    it("should toggle include libraries through the command", () => {
      const [, toggleStub] =
        setups.toggleIncludeLibraries.setupForTogglingIncludeLibraries();
      controller.toggleIncludeLibraries();

      assert.equal(toggleStub.calledOnce, true);
    });
  });

  describe("search", () => {
    it("should let lifecycle prepare the index before showing the quick pick", async () => {
      const [prepareStub, , showStub] =
        setups.search.setupForPreparingIndexBeforeShowing();
      await controller.search();

      assert.isTrue(prepareStub.calledOnceWith(quickPick));
      assert.isTrue(prepareStub.calledBefore(showStub));
    });

    it("should quickPick.show and quickPick.loadUnsortedItems methods be invoked if quickPick is initialized", async () => {
      const [loadItemsStub, showStub] =
        setups.search.setupForShowingQuickPickWhenInitialized();
      await controller.search();

      assert.equal(loadItemsStub.calledOnce, true);
      assert.equal(showStub.calledOnce, true);
    });

    it("should quickPick.show and quickPick.loadUnsortedItems methods not be invoked if quickPick is not initialized", async () => {
      const [loadItemsStub, showStub] =
        setups.search.setupForNotShowingQuickPickWhenNotInitialized();
      await controller.search();

      assert.equal(loadItemsStub.calledOnce, false);
      assert.equal(showStub.calledOnce, false);
    });

    it("should set selected text as quickPick text if shouldSearchSelection returns true", async () => {
      const [setTextStub] =
        setups.search.setupForSettingSelectedTextWhenSearchSelection();
      await controller.search();

      assert.equal(setTextStub.calledWith("test text"), true);
    });

    it("should not invoke quickPick.setText method if shouldSearchSelection returns false", async () => {
      const [setTextStub] =
        setups.search.setupForNotSettingTextWhenSearchSelectionFalse();
      await controller.search();

      assert.equal(setTextStub.calledOnce, false);
    });

    it("should restore the last query on show", async () => {
      const [setTextStub, , showStub] =
        setups.search.setupForRestoringLastQuery("Server.Start", "");
      await controller.search();

      assert.equal(setTextStub.lastCall.args[0], "Server.Start");
      assert.equal(setTextStub.lastCall.calledBefore(showStub.firstCall), true);
    });

    it("should prefer the editor selection over the last query", async () => {
      const [setTextStub] = setups.search.setupForRestoringLastQuery(
        "Server.Start",
        "selected"
      );
      await controller.search();

      assert.equal(setTextStub.calledWith("Server.Start"), false);
      assert.equal(setTextStub.lastCall.args[0], "selected");
    });

    it("should not restore the last query when restoreLastQuery is off", async () => {
      const [setTextStub] = setups.search.setupForRestoringLastQuery(
        "Server.Start",
        "",
        false
      );
      await controller.search();

      assert.equal(setTextStub.calledWith("Server.Start"), false);
    });
  });

  describe("reload", () => {
    it("should display notification if workspace contains does not contain any folder opened", async () => {
      const [printNoFolderOpenedMessageStub, reloadStub] =
        setups.reload.setupForNoFolderOpenedNotification();
      await controller.reload();

      assert.equal(printNoFolderOpenedMessageStub.calledOnce, true);
      assert.equal(reloadStub.called, false);
    });

    it("should lifecycle.reload method be invoked", async () => {
      const [reloadStub] = setups.reload.setupForReloading();
      await controller.reload();

      assert.equal(reloadStub.calledOnce, true);
    });
  });

  describe("startup", () => {
    it("should start lifecycle with the quick pick", async () => {
      const [startupStub] = setups.startup.setupForStartingLifecycle();
      await controller.startup();

      assert.isTrue(startupStub.calledOnceWith(quickPick));
    });
  });

  describe("shouldSearchSelection", () => {
    it("should return false if quickPick is not initialized", () => {
      const editor =
        setups.shouldSearchSelection.setupForFalseWhenQuickPickNotInitialized();
      assert.equal(controller.shouldSearchSelection(editor), false);
    });

    it("should return false if fetchShouldSearchSelection returns false", () => {
      const editor =
        setups.shouldSearchSelection.setupForFalseWhenSearchSelectionDisabled();
      assert.equal(controller.shouldSearchSelection(editor), false);
    });

    it("should return false if editor doesn't exist", () => {
      const editor =
        setups.shouldSearchSelection.setupForFalseWhenEditorNotExists();
      assert.equal(controller.shouldSearchSelection(editor), false);
    });

    it("should return true if quickPick is initialized, fetchShouldSearchSelection returns true and editor exists", () => {
      const editor =
        setups.shouldSearchSelection.setupForTrueWhenAllConditionsMet();
      assert.equal(controller.shouldSearchSelection(editor), true);
    });
  });

  describe("restoreOnDidChangeValueEventListener", () => {
    it("should reload listeners and load items for a value changed while listeners were detached", () => {
      const [reloadStub, handleDidChangeValueStub] =
        setups.restoreOnDidChangeValueEventListener.setupForControlValue(
          "OrderMeta"
        );
      controller.restoreOnDidChangeValueEventListener("");

      assert.equal(reloadStub.calledOnce, true);
      assert.equal(handleDidChangeValueStub.calledOnceWith("OrderMeta"), true);
    });

    it("should only reload listeners if the value has not changed", () => {
      const [reloadStub, handleDidChangeValueStub] =
        setups.restoreOnDidChangeValueEventListener.setupForControlValue(
          "test text"
        );
      controller.restoreOnDidChangeValueEventListener("test text");

      assert.equal(reloadStub.calledOnce, true);
      assert.equal(handleDidChangeValueStub.called, false);
    });
  });

  describe("handleWillProcessing", () => {
    it("should quickPick.showLoading and quickPick.setQuickPickPlaceholder methods be invoked with true as parameter", () => {
      const [showLoadingStub, setPlaceholderStub] =
        setups.handleWillProcessing.setupForShowingLoadingWhenQuickPickInitialized();
      controller.handleWillProcessing();

      assert.equal(showLoadingStub.calledWith(true), true);
      assert.equal(setPlaceholderStub.calledWith(true), true);
    });

    it("should quickPick.showLoading and quickPick.setQuickPickPlaceholder methods not be invoked", () => {
      const [showLoadingStub, setPlaceholderStub] =
        setups.handleWillProcessing.setupForNotShowingLoadingWhenQuickPickNotInitialized();
      controller.handleWillProcessing();

      assert.equal(showLoadingStub.calledWith(false), false);
      assert.equal(setPlaceholderStub.calledWith(false), false);
    });

    it("should quickPick.init method be invoked if quickPick is not initialized", async () => {
      const [initStub] =
        setups.handleWillProcessing.setupForInitializingQuickPickWhenNotInitialized();
      await controller.handleWillProcessing();

      assert.equal(initStub.calledOnce, true);
    });
  });

  describe("handleDidProcessing", () => {
    it("should setQuickPickData, loadItemsStub methods be invoked and and setBusy method with false as parameter", () => {
      const [setQuickPickDataStub, initStub, loadItemsStub, setBusyStub] =
        setups.handleDidProcessing.setupForSettingQuickPickDataAndLoading();

      controller.handleDidProcessing();

      assert.equal(setQuickPickDataStub.calledOnce, true);
      assert.equal(initStub.calledOnce, false);
      assert.equal(loadItemsStub.calledOnce, true);
      assert.equal(setBusyStub.calledWith(false), true);
    });

    it("should quickPick.setItems method be invoked with data from database.search method as a parameter", () => {
      const [setItemsStub] =
        setups.handleDidProcessing.setupForSettingItemsFromWorkspaceData();
      controller.handleDidProcessing();

      assert.equal(setItemsStub.calledWith(getQpItems()), true);
    });
  });

  describe("handleWillExecuteAction", () => {
    it("should quickPick.setItems be invoked with empty array if action type is rebuild", async () => {
      const [setItemsStub, loadItemsStub] =
        setups.handleWillExecuteAction.setupForClearingItemsWhenRebuildAction();
      controller.handleWillExecuteAction(getAction(ActionType.Rebuild));

      assert.equal(setItemsStub.calledWith([]), true);
      assert.equal(loadItemsStub.calledOnce, true);
    });

    it("should do nothing if action type is different than rebuild", async () => {
      const [setItemsStub, loadItemsStub] =
        setups.handleWillExecuteAction.setupForDoingNothingWhenNonRebuildAction();
      controller.handleWillExecuteAction(getAction(ActionType.Update));

      assert.equal(setItemsStub.calledOnce, false);
      assert.equal(loadItemsStub.calledOnce, false);
    });
  });

  describe("handleDidDebounceConfigToggle", () => {
    it("should setBusy and reloadOnDidChangeValueEventListener methods be invoked", () => {
      const [setBusyStub, reloadOnDidChangeValueEventListenerStub] =
        setups.handleDidDebounceConfigToggle.setupForReloadingEventListener();

      controller.handleDidDebounceConfigToggle();

      assert.equal(setBusyStub.calledWith(true), true);
      assert.equal(reloadOnDidChangeValueEventListenerStub.calledOnce, true);
      assert.equal(setBusyStub.calledWith(false), true);
    });
  });

  describe("handleDidSortingConfigToggle", () => {
    it("should setBusy and reloadSortingSettings methods be invoked", () => {
      const [setBusyStub, reloadSortingSettingsStub] =
        setups.handleDidSortingConfigToggle.setupForReloadingSortingSettings();

      controller.handleDidSortingConfigToggle();

      assert.equal(setBusyStub.calledWith(true), true);
      assert.equal(reloadSortingSettingsStub.calledOnce, true);
      assert.equal(setBusyStub.calledWith(false), true);
    });
  });

  describe("handleWillReindexOnConfigurationChange", () => {
    it("should quickPick.reload method be invoked", () => {
      const [reloadStub] =
        setups.handleWillReindexOnConfigurationChange.setupForReloadingQuickPick();
      controller.handleWillReindexOnConfigurationChange();

      assert.equal(reloadStub.calledOnce, true);
    });
  });

  describe("copy", () => {
    it("should copy the reference through the command", async () => {
      const [copyReferenceStub] = setups.copy.setupForCopyingReference();
      await controller.copyReference();

      assert.equal(copyReferenceStub.calledOnce, true);
    });

    it("should copy the location through the command", async () => {
      const [copyLocationStub] = setups.copy.setupForCopyingLocation();
      await controller.copyLocation();

      assert.equal(copyLocationStub.calledOnce, true);
    });
  });
});
