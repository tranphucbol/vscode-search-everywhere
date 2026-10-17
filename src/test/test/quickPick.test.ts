import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../config";
import { database } from "../../database";
import { ensureUri, parseLineSuffix, quickPick } from "../../quickPick";
import { recentItems } from "../../recentItems";
import { getTestSetups } from "../testSetup/quickPick.testSetup";
import {
  getQuickPickItemButtonEvent,
  getQuickPickOnDidChangeValueEventListeners,
} from "../util/eventMockFactory";
import { getQpItem, getQpItems } from "../util/qpItemMockFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("QuickPick", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("init", () => {
    it("should vscode quick pick be created", () => {
      const [createQuickPickStub] =
        setups.init.setupForCreatingVscodeQuickPick();
      quickPick.init();

      assert.equal(createQuickPickStub.calledOnce, true);
    });

    it("should register one event listener if shouldUseDebounce returns true", () => {
      setups.init.setupForRegisteringTwoEventListenersWhenDebounceEnabled();
      quickPick.init();

      assert.equal(quickPick.getOnDidChangeValueEventListeners().length, 1);
    });

    it("should register one event listener if shouldUseDebounce returns false", () => {
      setups.init.setupForRegisteringOneEventListenerWhenDebounceDisabled();
      quickPick.init();

      assert.equal(quickPick.getOnDidChangeValueEventListeners().length, 1);
    });
  });

  describe("reloadSortingSettings", () => {
    it("should set that items should be sorted", () => {
      setups.reloadSortingSettings.setupForSettingSortingEnabled();
      quickPick.reloadSortingSettings();

      assert.equal(quickPick.getShouldItemsBeSorted(), true);
    });

    it("should set sortByLabel on quickPick control to have separators between items", () => {
      setups.reloadSortingSettings.setupForSettingSortByLabelToFalseForSeparators();
      quickPick.reloadSortingSettings();

      assert.equal((quickPick.getControl() as any).sortByLabel, false);
    });
  });

  describe("reloadOnDidChangeValueEventListener", () => {
    it("should dispose existing event listeners and register one event listener if shouldUseDebounce returns false", () => {
      setups.reloadOnDidChangeValueEventListener.setupForRegisteringOneListenerWhenDebounceDisabled();
      quickPick.reloadOnDidChangeValueEventListener();

      assert.equal(quickPick.getOnDidChangeValueEventListeners().length, 1);
    });

    it("should dispose existing event listeners and register one event listener if shouldUseDebounce returns true", () => {
      setups.reloadOnDidChangeValueEventListener.setupForRegisteringTwoListenersWhenDebounceEnabled();
      quickPick.reloadOnDidChangeValueEventListener();

      assert.equal(quickPick.getOnDidChangeValueEventListeners().length, 1);
    });
  });

  describe("reload", () => {
    it("should fetch configuration from config component", () => {
      const [
        shouldUseItemsFilterPhrasesStub,
        getHelpPhraseStub,
        getItemsFilterPhrasesStub,
      ] = setups.reload.setupForFetchingConfigurationFromConfig();
      quickPick.reload();

      assert.equal(shouldUseItemsFilterPhrasesStub.calledOnce, true);
      assert.equal(getHelpPhraseStub.calledOnce, true);
      assert.equal(getItemsFilterPhrasesStub.calledOnce, true);
    });

    it("should fetch help data", () => {
      const qpHelpItems = setups.reload.setupForFetchingHelpData();
      quickPick.reload();

      assert.deepEqual(quickPick.getHelpItems(), qpHelpItems);
    });
  });

  describe("isInitialized", () => {
    it("should return true if vscode quick pick is initialized", () => {
      setups.isInitialized.setupForReturningTrueWhenQuickPickInitialized();
      assert.equal(quickPick.isInitialized(), true);
    });

    it("should return false if vscode quick pick is not initialized", () => {
      setups.isInitialized.setupForReturningFalseWhenQuickPickNotInitialized();
      assert.equal(quickPick.isInitialized(), false);
    });
  });

  describe("show", () => {
    it("should vscode.quickPick.show method be invoked if quick pick is initialized", () => {
      const [showStub] =
        setups.show.setupForInvokingShowWhenQuickPickInitialized();
      quickPick.show();

      assert.equal(showStub.calledOnce, true);
    });
  });

  describe("loadItems", () => {
    it("should unsorted items be loaded", () => {
      const items = setups.loadItems.setupForLoadingUnsortedItems();
      quickPick.loadItems();

      assert.deepEqual(quickPick.getControl().items, items);
    });

    it("should sorted items be loaded", () => {
      const items = setups.loadItems.setupForLoadingSortedItems();
      quickPick.loadItems();

      assert.deepEqual(quickPick.getControl().items, items);
    });

    it("should pass recent keys to the database search when rankRecentItemsHigher is on", () => {
      const { searchStub, recentKeys } = setups.loadItems.setupForRecentKeys(
        "index",
        true
      );
      quickPick.loadItems();

      assert.equal(searchStub.calledOnce, true);
      assert.deepEqual(searchStub.firstCall.args[2].recent, recentKeys);
    });

    it("should not pass recent keys when rankRecentItemsHigher is off", () => {
      const { searchStub, getRecentKeysStub } =
        setups.loadItems.setupForRecentKeys("index", false);
      quickPick.loadItems();

      assert.equal(searchStub.calledOnce, true);
      assert.isUndefined(searchStub.firstCall.args[2].recent);
      assert.equal(getRecentKeysStub.called, false);
    });

    it("should not pass recent keys for the empty-query recent list", () => {
      const { searchStub, getRecentKeysStub } =
        setups.loadItems.setupForRecentKeys("", true);
      quickPick.loadItems();

      assert.equal(searchStub.called, false);
      assert.equal(getRecentKeysStub.called, false);
    });
  });

  describe("loadHelpItems", () => {
    it("should help items be loaded", () => {
      const helpItems = setups.loadHelpItems.setupForLoadingHelpItems();
      quickPick.loadHelpItems();

      assert.deepEqual(quickPick.getControl().items, helpItems);
    });
  });

  describe("setItems", () => {
    it("should items be set", () => {
      quickPick.setItems(getQpItems());

      assert.equal(quickPick.getItems().length, 2);
    });

    it("should items have assigned buttons property", () => {
      quickPick.setItems(getQpItems());

      assert.deepEqual(quickPick.getItems()[0].buttons, [
        {
          iconPath: new vscode.ThemeIcon("arrow-right"),
          tooltip: "Search symbols in this file",
        },
        {
          iconPath: new vscode.ThemeIcon("open-preview"),
          tooltip: "Open to the side",
        },
      ]);
    });
  });

  describe("file icons", () => {
    it("should use file icon theme for file items when enabled", () => {
      setups.fileIcons.setupForFileIconTheme(true);
      const fileItem = getQpItem("/./fake/", 1, false, true);
      quickPick.setItems([fileItem]);

      const item = quickPick.getItems()[0];
      assert.equal(item.label, "fake-1.ts");
      assert.equal(item.iconPath, vscode.ThemeIcon.File);
      assert.equal(item.resourceUri?.toString(), fileItem.uri.toString());
    });

    it("should keep built-in icon for symbol items when enabled", () => {
      setups.fileIcons.setupForFileIconTheme(true);
      const symbolItem = getQpItem("/./fake/", 1, false, false, false, 4);
      quickPick.setItems([symbolItem]);

      const item = quickPick.getItems()[0];
      assert.equal(item.label, "$(symbol-class)  fake-1.ts");
      assert.isUndefined(item.iconPath);
      assert.isUndefined(item.resourceUri);
    });

    it("should keep built-in icon for file items when disabled", () => {
      setups.fileIcons.setupForFileIconTheme(false);
      const fileItem = getQpItem("/./fake/", 1, false, true);
      quickPick.setItems([fileItem]);

      const item = quickPick.getItems()[0];
      assert.equal(item.label, "$(symbol-file)  fake-1.ts");
      assert.isUndefined(item.iconPath);
      assert.isUndefined(item.resourceUri);
    });

    it("should keep built-in icon when VS Code does not support file icon theme in quick pick", () => {
      setups.fileIcons.setupForFileIconTheme(true, false);
      const fileItem = getQpItem("/./fake/", 1, false, true);
      quickPick.setItems([fileItem]);

      const item = quickPick.getItems()[0];
      assert.equal(item.label, "$(symbol-file)  fake-1.ts");
      assert.isUndefined(item.iconPath);
      assert.isUndefined(item.resourceUri);
    });

    it("should restore built-in icon for previously decorated file items when disabled", () => {
      const [fetchUseFileIconThemeStub] =
        setups.fileIcons.setupForFileIconTheme(true);
      const fileItem = getQpItem("/./fake/", 1, false, true);
      quickPick.setItems([fileItem]);
      fetchUseFileIconThemeStub.returns(false);
      quickPick.setItems([fileItem]);

      const item = quickPick.getItems()[0];
      assert.equal(item.label, "$(symbol-file)  fake-1.ts");
      assert.isUndefined(item.iconPath);
      assert.isUndefined(item.resourceUri);
    });

    it("should replace stale icon from the index with the current icon for symbol items", () => {
      setups.fileIcons.setupForFileIconTheme(false, true, {
        0: "symbol-file",
        11: "symbol-function",
      });
      const symbolItem = getQpItem("/./fake/", 1, false, false, false, 11);
      symbolItem.label = "$(variable-group)  fake-1.ts";
      quickPick.setItems([symbolItem]);

      assert.equal(
        quickPick.getItems()[0].label,
        "$(symbol-function)  fake-1.ts"
      );
    });

    it("should remove icon for symbol items without a configured icon", () => {
      setups.fileIcons.setupForFileIconTheme(false, true, { 0: "symbol-file" });
      const symbolItem = getQpItem("/./fake/", 1, false, false, false, 11);
      symbolItem.label = "$(variable-group)  fake-1.ts";
      quickPick.setItems([symbolItem]);

      assert.equal(quickPick.getItems()[0].label, "fake-1.ts");
    });
  });

  describe("showLoading", () => {
    it("should vscode.quickPick.busy property be set", () => {
      setups.showLoading.setupForSettingBusyProperty();
      quickPick.showLoading(true);

      assert.equal(quickPick.getControl().busy, true);
    });
  });

  describe("setText", () => {
    it("should text be set", () => {
      setups.setText.setupForSettingText();
      const text = "test text";
      quickPick.setText(text);

      assert.equal(quickPick.getControl().value, text);
    });
  });

  describe("setPlaceholder", () => {
    it("should set placeholder to loading text", () => {
      setups.setPlaceholder.setupForSettingLoadingPlaceholder();
      quickPick.setPlaceholder(true);
      assert.equal(
        quickPick.getControl().placeholder,
        "Please wait, loading..."
      );
    });

    it("should set placeholder to searching text if shouldUseItemsFilterPhrase is false", () => {
      setups.setPlaceholder.setupForSettingSearchingPlaceholderWhenFilterPhrasesDisabled();
      quickPick.setPlaceholder(false);

      assert.equal(
        quickPick.getControl().placeholder,
        "Start typing file or symbol name..."
      );
    });

    it("should set placeholder to help text if shouldUseItemsFilterPhrase is true", () => {
      setups.setPlaceholder.setupForSettingHelpPlaceholderWhenFilterPhrasesEnabled();
      quickPick.setPlaceholder(false);

      assert.equal(
        quickPick.getControl().placeholder,
        "Type ? for help or start typing file or symbol name..."
      );
    });

    it("should change quick pick placeholder to help text with not set help phrase if shouldUseItemsFilterPhrase is true", () => {
      setups.setPlaceholder.setupForSettingNotSetHelpPlaceholderWhenHelpPhraseEmpty();
      quickPick.setPlaceholder(false);

      assert.equal(
        quickPick.getControl().placeholder,
        "Help phrase not set. Start typing file or symbol name..."
      );
    });
  });

  describe("setOnDidChangeValueEventListeners", () => {
    it("should set new array of onDidChangeValueEventListeners", () => {
      quickPick.setOnDidChangeValueEventListeners(
        getQuickPickOnDidChangeValueEventListeners(2)
      );
      assert.equal(quickPick.getOnDidChangeValueEventListeners().length, 2);
    });
  });

  describe("handleDidChangeValueClearing", () => {
    it("should clear quick pick items", () => {
      setups.handleDidChangeValueClearing.setupForClearingQuickPickItems();
      quickPick.handleDidChangeValueClearing();

      assert.equal(quickPick.getControl().items.length, 0);
    });
  });

  describe("handleDidChangeValue", () => {
    it("should load workspace items", async () => {
      const [loadItemsStub] =
        setups.handleDidChangeValue.setupForLoadingWorkspaceItems();
      await quickPick.handleDidChangeValue("test text");

      assert.equal(loadItemsStub.calledOnce, true);
    });

    it("should load help items", async () => {
      const [loadItemsStub] =
        setups.handleDidChangeValue.setupForLoadingHelpItems();
      await quickPick.handleDidChangeValue("?");

      assert.equal(loadItemsStub.calledOnce, true);
    });
  });

  describe("handleDidAccept", () => {
    it("should open selected qpItem with uri scheme equals to 'file'", async () => {
      const [revealRangeStub] =
        setups.handleDidAccept.setupForOpeningFileSchemeItem();
      await quickPick.handleDidAccept();
      assert.equal(revealRangeStub.calledOnce, true);
    });

    it("should open selected qpItem with uri scheme equals to 'untitled'", async () => {
      const [revealRangeStub] =
        setups.handleDidAccept.setupForOpeningUntitledSchemeItem();
      await quickPick.handleDidAccept();

      assert.equal(revealRangeStub.calledOnce, true);
    });

    it("should open selected qpItem which is help item", async () => {
      const [loadItemsStub] = setups.handleDidAccept.setupForOpeningHelpItem();
      await quickPick.handleDidAccept();

      assert.equal(loadItemsStub.calledOnce, true);
    });
  });

  describe("handleDidHide", () => {
    it("should setText method be invoked with empty string as argument", () => {
      setups.handleDidHide.setupForSettingEmptyText();
      quickPick.handleDidHide();

      assert.equal(quickPick.getControl().value, "");
    });
  });

  describe("handleDidTriggerItemButton", () => {
    it("should openItem method be invoked", async () => {
      const [openItemStub] =
        setups.handleDidTriggerItemButton.setupForInvokingOpenItem();
      await quickPick.handleDidTriggerItemButton(getQuickPickItemButtonEvent());

      assert.equal(openItemStub.calledOnce, true);
    });
  });

  describe("file scope navigation", () => {
    it("should navigate into file and update control state", async () => {
      const qpItem = getQpItems()[0];
      await quickPick.navigateIntoFile(qpItem);

      assert.equal(quickPick.getFileScopeUri(), qpItem.uri.toString());
      assert.isTrue(quickPick.getControl().title?.includes("fake-1.ts"));
      assert.equal(quickPick.getControl().buttons.length, 1);
      assert.equal(
        quickPick.getControl().buttons[0],
        vscode.QuickInputButtons.Back
      );
    });

    it("should navigate back to workspace and reset control state", async () => {
      const qpItem = getQpItems()[0];
      await quickPick.navigateIntoFile(qpItem);
      assert.isDefined(quickPick.getFileScopeUri());

      await quickPick.navigateBack();
      assert.isUndefined(quickPick.getFileScopeUri());
      assert.isUndefined(quickPick.getControl().title);
      assert.equal(quickPick.getControl().buttons.length, 0);
    });

    it("should handle handleDidTriggerButton with Back button", async () => {
      const qpItem = getQpItems()[0];
      await quickPick.navigateIntoFile(qpItem);
      assert.isDefined(quickPick.getFileScopeUri());

      await quickPick.handleDidTriggerButton(vscode.QuickInputButtons.Back);
      assert.isUndefined(quickPick.getFileScopeUri());
    });

    it("should navigateIntoFile when handleDidTriggerItemButton is triggered with arrow-right", async () => {
      const qpItem = getQpItems()[0];
      await quickPick.handleDidTriggerItemButton({
        button: {
          iconPath: new vscode.ThemeIcon("arrow-right"),
          tooltip: "Search symbols in this file",
        },
        item: qpItem,
      });

      assert.equal(quickPick.getFileScopeUri(), qpItem.uri.toString());
      await quickPick.navigateBack();
    });

    it("should call loadItems immediately upon navigateIntoFile without waiting for background indexing", async () => {
      const qpItem = getQpItems()[0];
      const loadItemsSpy = sinon.spy(quickPick, "loadItems");

      await quickPick.navigateIntoFile(qpItem);
      assert.isTrue(loadItemsSpy.called);

      loadItemsSpy.restore();
      await quickPick.navigateBack();
    });
  });

  describe("openToTheSide", () => {
    it("should open active item beside and hide control", async () => {
      const qpItem = getQpItems()[0];
      const openItemStub = sinon.stub(quickPick, "openItem").resolves();
      const hideStub = sinon.stub(quickPick.getControl(), "hide");

      await quickPick.openToTheSide(qpItem);

      assert.equal(openItemStub.calledOnce, true);
      assert.equal(openItemStub.firstCall.args[1], vscode.ViewColumn.Beside);
      assert.equal(hideStub.calledOnce, true);

      openItemStub.restore();
      hideStub.restore();
    });
  });

  describe("parseLineSuffix", () => {
    it("should return query unchanged when there is no line suffix", () => {
      assert.deepEqual(parseLineSuffix("Foo.java"), { query: "Foo.java" });
    });

    it("should extract a 1-based line number as a 0-based position", () => {
      const result = parseLineSuffix("ForwardRecoveryRejectedException.java:5");
      assert.equal(result.query, "ForwardRecoveryRejectedException.java");
      assert.equal(result.position!.line, 4);
      assert.equal(result.position!.character, 0);
    });

    it("should extract line and column", () => {
      const result = parseLineSuffix("src/Foo.java:12:7");
      assert.equal(result.query, "src/Foo.java");
      assert.equal(result.position!.line, 11);
      assert.equal(result.position!.character, 6);
    });

    it("should not treat a bare line suffix as a query", () => {
      assert.deepEqual(parseLineSuffix(":5"), { query: ":5" });
    });
  });

  describe("loadItems with line suffix", () => {
    it("should search without the suffix and attach the target position", () => {
      const control = vscode.window.createQuickPick<any>();
      control.value = "Foo.java:5";
      const item = getQpItems()[0];
      const sandbox = sinon.createSandbox();
      sandbox.stub(quickPick, "getControl").returns(control);
      sandbox.stub(quickPick, "getShouldUseItemsFilterPhrases").returns(false);
      sandbox.stub(quickPick, "getShouldItemsBeSorted").returns(false);
      sandbox.stub(database, "isReady").returns(true);
      const searchStub = sandbox.stub(database, "search").returns([item]);

      quickPick.loadItems();

      assert.equal(searchStub.firstCall.args[0], "Foo.java");
      const loaded = control.items[0];
      assert.equal(loaded.targetPosition.line, 4);
      assert.isTrue(loaded.alwaysShow);
      assert.isUndefined(item.targetPosition);
      sandbox.restore();
      control.dispose();
    });
  });

  describe("loadItems with a qualified query", () => {
    const loadWithQuery = (query: string) => {
      const control = vscode.window.createQuickPick<any>();
      control.value = query;
      const item = { ...getQpItems()[0] };
      delete item.alwaysShow;
      const sandbox = sinon.createSandbox();
      sandbox.stub(quickPick, "getControl").returns(control);
      sandbox.stub(quickPick, "getShouldUseItemsFilterPhrases").returns(false);
      sandbox.stub(quickPick, "getShouldItemsBeSorted").returns(false);
      sandbox.stub(database, "isReady").returns(true);
      const searchStub = sandbox.stub(database, "search").returns([item]);

      quickPick.loadItems();

      const loaded = control.items[0];
      sandbox.restore();
      control.dispose();
      return { item, loaded, searchStub };
    };

    it("should set alwaysShow on results for a qualified query", () => {
      const { item, loaded, searchStub } = loadWithQuery("UserService.save");

      assert.equal(searchStub.firstCall.args[0], "UserService.save");
      assert.isTrue(loaded.alwaysShow);
      assert.isUndefined(loaded.targetPosition);
      assert.isUndefined(item.alwaysShow);
    });

    it("should not set alwaysShow for an unqualified query", () => {
      const { loaded } = loadWithQuery("User");

      assert.isUndefined(loaded.alwaysShow);
    });

    it("should keep CamelHumps results visible with alwaysShow", () => {
      const { loaded, searchStub } = loadWithQuery("uSerImp");

      assert.equal(searchStub.firstCall.args[0], "uSerImp");
      assert.isTrue(loaded.alwaysShow);
      assert.isTrue(loadWithQuery("max_v").loaded.alwaysShow);
    });

    it("should not set alwaysShow for an initials query", () => {
      assert.isUndefined(loadWithQuery("usi").loaded.alwaysShow);
    });

    it("should combine a qualified query with a line suffix", () => {
      const { loaded, searchStub } = loadWithQuery("UserService#save:12");

      assert.equal(searchStub.firstCall.args[0], "UserService#save");
      assert.isTrue(loaded.alwaysShow);
      assert.equal(loaded.targetPosition.line, 11);
    });

    it("should set alwaysShow only when the leaf of a path query is qualified", () => {
      assert.isTrue(loadWithQuery("src/models/User.find").loaded.alwaysShow);
      assert.isUndefined(loadWithQuery("src.models/User").loaded.alwaysShow);
    });

    it("should set alwaysShow on results for a multi-word query", () => {
      const { loaded, searchStub } = loadWithQuery("user impl");

      assert.equal(searchStub.firstCall.args[0], "user impl");
      assert.isTrue(loaded.alwaysShow);
    });

    it("should set alwaysShow on results for a * query", () => {
      assert.isTrue(loadWithQuery("User*Impl").loaded.alwaysShow);
    });

    it("should not set alwaysShow for a single word with trailing space", () => {
      assert.isUndefined(loadWithQuery("User ").loaded.alwaysShow);
    });
  });

  describe("loadItems with a filter phrase", () => {
    const defaultCategories = [
      { name: "Types", phrase: "@@", kinds: [4, 9, 10, 22] },
      { name: "Members", phrase: "!!", kinds: [5, 6, 11] },
      { name: "Files", phrase: "$$", kinds: [0] },
    ];

    const loadWithQuery = (
      query: string,
      options: {
        phrases?: { [kind: number]: string };
        categories?: typeof defaultCategories;
        description?: string;
      } = {}
    ) => {
      const control = vscode.window.createQuickPick<any>();
      control.value = query;
      const item = { ...getQpItems()[0] };
      delete item.alwaysShow;
      if (options.description !== undefined) {
        item.description = options.description;
      }
      const sandbox = sinon.createSandbox();
      sandbox.stub(quickPick, "getControl").returns(control);
      sandbox.stub(quickPick, "getShouldUseItemsFilterPhrases").returns(true);
      sandbox
        .stub(quickPick, "getItemsFilterPhrases")
        .returns(options.phrases ?? { 4: "@@" });
      sandbox
        .stub(quickPick, "getCategories")
        .returns(options.categories ?? []);
      sandbox.stub(quickPick, "getShouldItemsBeSorted").returns(false);
      sandbox.stub(database, "isReady").returns(true);
      const searchStub = sandbox.stub(database, "search").returns([item]);

      quickPick.loadItems();

      const loaded = control.items[0];
      const title = control.title;
      sandbox.restore();
      control.dispose();
      return { item, loaded, searchStub, title };
    };

    it("should search the given kind without the phrase and keep results visible", () => {
      const { item, loaded, searchStub } = loadWithQuery("@@order");

      assert.equal(searchStub.firstCall.args[0], "order");
      assert.deepEqual(searchStub.firstCall.args[2]?.symbolKinds, [4]);
      assert.isTrue(loaded.alwaysShow);
      assert.isUndefined(item.alwaysShow);
    });

    it("should keep results visible for a bare filter phrase", () => {
      assert.isTrue(loadWithQuery("@@").loaded.alwaysShow);
    });

    it("should not set alwaysShow for a query without a filter phrase", () => {
      assert.isUndefined(loadWithQuery("order").loaded.alwaysShow);
    });

    it("should search every kind of a category typed as a phrase", () => {
      const { searchStub } = loadWithQuery("@@server", {
        phrases: {},
        categories: defaultCategories,
      });

      assert.equal(searchStub.firstCall.args[0], "server");
      assert.deepEqual(searchStub.firstCall.args[2]?.symbolKinds, [4, 9, 10, 22]);
    });

    it("should prefer a category over a one-kind phrase with the same text", () => {
      const { searchStub, title } = loadWithQuery("!!save", {
        phrases: { 11: "!!" },
        categories: defaultCategories,
      });

      assert.deepEqual(searchStub.firstCall.args[2]?.symbolKinds, [5, 6, 11]);
      assert.equal(title, "Search Everywhere · Members");
    });

    it("should match the longest phrase first", () => {
      const { searchStub, title } = loadWithQuery("@@@srv", {
        phrases: { 22: "@@@" },
        categories: defaultCategories,
      });

      assert.equal(searchStub.firstCall.args[0], "srv");
      assert.deepEqual(searchStub.firstCall.args[2]?.symbolKinds, [22]);
      assert.equal(title, "Search Everywhere");
    });

    it("should use a one-kind phrase without selecting a category", () => {
      const { searchStub, title } = loadWithQuery("s srv", {
        phrases: { 22: "s " },
        categories: defaultCategories,
      });

      assert.equal(searchStub.firstCall.args[0], "srv");
      assert.deepEqual(searchStub.firstCall.args[2]?.symbolKinds, [22]);
      assert.equal(title, "Search Everywhere");
    });

    it("should name the active category in the title", () => {
      assert.equal(
        loadWithQuery("server", { phrases: {}, categories: defaultCategories })
          .title,
        "Search Everywhere"
      );
      assert.equal(
        loadWithQuery("@@server", { phrases: {}, categories: defaultCategories })
          .title,
        "Search Everywhere · Types"
      );
    });

    it("should not add the phrase tag to row descriptions", () => {
      const { loaded } = loadWithQuery("@@order", {
        phrases: {},
        categories: defaultCategories,
        description: "[@@order] Class",
      });

      assert.equal(loaded.description, "Class");
    });
  });

  describe("cycleCategory", () => {
    const categories = [
      { name: "Types", phrase: "@@", kinds: [4, 9, 10, 22] },
      { name: "Members", phrase: "!!", kinds: [5, 6, 11] },
      { name: "Files", phrase: "$$", kinds: [0] },
    ];

    const cycle = (query: string, direction: 1 | -1) => {
      const control = vscode.window.createQuickPick<any>();
      control.value = query;
      const sandbox = sinon.createSandbox();
      sandbox.stub(quickPick, "getControl").returns(control);
      sandbox.stub(quickPick, "getShouldUseItemsFilterPhrases").returns(true);
      sandbox.stub(quickPick, "getItemsFilterPhrases").returns({});
      sandbox.stub(quickPick, "getCategories").returns(categories);
      sandbox.stub(quickPick, "getShouldItemsBeSorted").returns(false);
      sandbox.stub(database, "isReady").returns(true);
      const searchStub = sandbox.stub(database, "search").returns([]);

      quickPick.cycleCategory(direction);

      const result = { value: control.value, title: control.title, searchStub };
      sandbox.restore();
      control.dispose();
      return result;
    };

    it("should cycle to the next category on Tab and wrap to All", () => {
      assert.equal(cycle("server", 1).value, "@@server");
      assert.equal(cycle("!!server", 1).value, "$$server");
      assert.equal(cycle("$$server", 1).value, "server");
    });

    it("should cycle to the previous category on Shift+Tab", () => {
      assert.equal(cycle("$$server", -1).value, "!!server");
      assert.equal(cycle("!!server", -1).value, "@@server");
      assert.equal(cycle("server", -1).value, "$$server");
    });

    it("should keep the query when switching categories", () => {
      const { value, title, searchStub } = cycle("@@Server.Start", 1);

      assert.equal(value, "!!Server.Start");
      assert.equal(searchStub.firstCall.args[0], "Server.Start");
      assert.deepEqual(searchStub.firstCall.args[2]?.symbolKinds, [5, 6, 11]);
      assert.equal(title, "Search Everywhere · Members");
    });
  });

  describe("preview on select", () => {
    const previousUri = vscode.Uri.file("/previous.ts");
    const previousSelection = new vscode.Selection(4, 2, 4, 9);
    let sandbox: sinon.SinonSandbox;
    let clock: sinon.SinonFakeTimers;
    let control: vscode.QuickPick<any>;
    let showTextDocumentStub: sinon.SinonStub;
    let previewOnSelect: boolean;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      clock = sandbox.useFakeTimers();
      previewOnSelect = true;
      control = vscode.window.createQuickPick<any>();
      sandbox.stub(control, "show");
      sandbox.stub(quickPick, "getControl").returns(control);
      sandbox.stub(quickPick, "getShouldUseItemsFilterPhrases").returns(false);
      sandbox
        .stub(config, "fetchPreviewOnSelect")
        .callsFake(() => previewOnSelect);
      sandbox.stub(vscode.window, "activeTextEditor").get(() => ({
        document: { uri: previousUri },
        selection: previousSelection,
        viewColumn: vscode.ViewColumn.One,
      }));
      sandbox
        .stub(vscode.workspace, "openTextDocument")
        .callsFake(async (uri: any) => ({ uri } as any));
      showTextDocumentStub = sandbox
        .stub(vscode.window, "showTextDocument")
        .callsFake(async () => ({ revealRange: sinon.stub() } as any));
      sandbox.stub(recentItems, "addRecentItem");
      sandbox.stub(vscode.commands, "executeCommand").resolves();
    });

    afterEach(() => {
      quickPick.handleDidHide();
      sandbox.restore();
      control.dispose();
    });

    const moveTo = async (item: any) => {
      quickPick.handleDidChangeActive([item]);
      await clock.tickAsync(150);
    };

    it("should preview the active item without taking focus", async () => {
      const item = getQpItem();
      quickPick.show();

      quickPick.handleDidChangeActive([item]);
      await clock.tickAsync(149);
      assert.equal(showTextDocumentStub.called, false);
      await clock.tickAsync(1);

      assert.equal(showTextDocumentStub.calledOnce, true);
      const options = showTextDocumentStub.firstCall.args[1];
      assert.equal(options.preview, true);
      assert.equal(options.preserveFocus, true);
      assert.equal(options.viewColumn, vscode.ViewColumn.One);
      assert.equal(options.selection.isEmpty, true);
      assert.equal(options.selection.start.line, item.range!.start.line);
    });

    it("should not preview separators or help items", async () => {
      quickPick.show();

      await moveTo({ label: "", kind: vscode.QuickPickItemKind.Separator });
      await moveTo({ ...getQpItem(), isHelp: true });

      assert.equal(showTextDocumentStub.called, false);
    });

    it("should not preview when previewOnSelect is off", async () => {
      previewOnSelect = false;
      quickPick.show();

      await moveTo(getQpItem());

      assert.equal(showTextDocumentStub.called, false);
    });

    it("should restore the previous editor when hidden without accepting", async () => {
      quickPick.show();
      await moveTo(getQpItem());

      quickPick.handleDidHide();
      await clock.tickAsync(0);

      assert.equal(showTextDocumentStub.callCount, 2);
      const [document, options] = showTextDocumentStub.lastCall.args;
      assert.equal(document.uri, previousUri);
      assert.equal(options.viewColumn, vscode.ViewColumn.One);
      assert.isTrue(options.selection.isEqual(previousSelection));
    });

    it("should keep the opened editor when an item is accepted", async () => {
      quickPick.show();
      await moveTo(getQpItem());

      await quickPick.openItem(getQpItem());
      quickPick.handleDidHide();
      await clock.tickAsync(0);

      const openedUris = showTextDocumentStub
        .getCalls()
        .map((call) => call.args[0].uri);
      assert.notInclude(openedUris, previousUri);
    });

    it("should remember the workspace query when hidden from a file scope", async () => {
      sandbox.stub(quickPick, "loadItems");
      quickPick.show();
      control.value = "Server.Start";

      await quickPick.navigateIntoFile(getQpItem());
      control.value = "Sta";
      quickPick.handleDidHide();

      assert.equal(quickPick.getLastQuery(), "Server.Start");
    });
  });

  describe("help items", () => {
    it("should list categories before one-kind phrases in help", () => {
      const sandbox = sinon.createSandbox();
      sandbox.stub(quickPick, "getHelpPhrase").returns("?");
      sandbox
        .stub(quickPick, "getCategories")
        .returns([{ name: "Types", phrase: "@@", kinds: [4, 10] }]);
      sandbox.stub(quickPick, "getItemsFilterPhrases").returns({ 11: "ff" });
      sandbox.stub(quickPick, "getShouldUseItemsFilterPhrases").returns(true);
      sandbox.stub(quickPick, "getShouldItemsBeSorted").returns(false);
      sandbox.stub(quickPick, "fetchConfig");

      quickPick.reload();
      const labels = quickPick.getHelpItems().map((item) => item.label);
      sandbox.restore();

      assert.deepEqual(labels, [
        "? Type @@ for limit results to Types only (Tab)",
        "? Type ff for limit results to Function only",
      ]);
    });
  });

  describe("ensureUri", () => {
    it("should return vscode.Uri instance as-is", () => {
      const uri = vscode.Uri.file("/home/user/file.ts");
      assert.equal(ensureUri(uri), uri);
    });

    it("should parse string URI correctly including remote schemes", () => {
      const remoteUriStr = "vscode-remote://ssh-remote%2Bmyserver/home/user/main.cpp";
      const uri = ensureUri(remoteUriStr);
      assert.isTrue(uri instanceof vscode.Uri);
      assert.equal(uri.scheme, "vscode-remote");
      assert.equal(uri.authority, "ssh-remote+myserver");
      assert.equal(uri.path, "/home/user/main.cpp");
    });

    it("should revive serialized URI objects from JSON cache", () => {
      const serialized = {
        scheme: "vscode-remote",
        authority: "ssh-remote+myserver",
        path: "/home/user/main.cpp",
        query: "",
        fragment: "",
      };
      const uri = ensureUri(serialized);
      assert.isTrue(uri instanceof vscode.Uri);
      assert.equal(uri.scheme, "vscode-remote");
      assert.equal(uri.path, "/home/user/main.cpp");
    });
  });
});
