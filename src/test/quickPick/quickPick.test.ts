import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../platform/config";
import { database } from "../../database";
import { dataConverter } from "../../symbols/dataConverter";
import { liveSymbols } from "../../symbols/liveSymbols";
import { ensureUri, parseLineSuffix, quickPick } from "../../quickPick/quickPick";
import { recentItems } from "../../quickPick/recentItems";
import { CategoryButton, LibraryButton, QuickPickItem } from "../../shared/types";
import { vscodeVersion } from "../../shared/vscodeVersion";
import { workspaceIndexer } from "../../indexing/workspaceIndexer";
import { getTestSetups } from "./quickPick.testSetup";
import {
  getQuickPickItemButtonEvent,
  getQuickPickOnDidChangeValueEventListeners,
} from "../util/eventMockFactory";
import {
  getQpItem,
  getQpItems,
  getQpItemWithNamePosition,
} from "../util/qpItemMockFactory";

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
        {
          iconPath: new vscode.ThemeIcon("copy"),
          tooltip: `Copy reference · ${
            process.platform === "darwin" ? "⌥⇧⌘C" : "Ctrl+Alt+Shift+C"
          }`,
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

  describe("copy", () => {
    const copyButton = {
      iconPath: new vscode.ThemeIcon("copy"),
      tooltip: "Copy reference",
    };

    it("should add a copy reference button as the last row button", () => {
      const symbolItem = getQpItemWithNamePosition();
      quickPick.setItems([getQpItem(), symbolItem]);

      quickPick.getItems().forEach((item) => {
        const buttons = item.buttons!;
        const lastIcon = buttons[buttons.length - 1].iconPath;
        assert.equal((lastIcon as vscode.ThemeIcon).id, "copy");
      });
      assert.equal(quickPick.getItems()[1].buttons!.length, 2);
    });

    it("should copy the reference when the copy button is clicked", async () => {
      const [writeTextStub, setStatusBarMessageStub] =
        setups.copy.setupForCopying();
      const item = getQpItem();

      await quickPick.handleDidTriggerItemButton({ button: copyButton, item });

      assert.equal(writeTextStub.calledOnceWith(item.uri.fsPath), true);
      assert.deepEqual(setStatusBarMessageStub.firstCall.args, [
        `Copied ${item.uri.fsPath}`,
        3000,
      ]);
    });

    it("should keep the quick pick open after copying", async () => {
      const [, , hideStub] = setups.copy.setupForCopying();

      await quickPick.handleDidTriggerItemButton({
        button: copyButton,
        item: getQpItem(),
      });

      assert.equal(hideStub.called, false);
    });

    it("should copy the location of the active item", async () => {
      const item = getQpItemWithNamePosition(12, 10);
      const [writeTextStub] = setups.copy.setupForCopying([item]);

      await quickPick.copyLocation();

      assert.equal(writeTextStub.calledOnceWith(`${item.uri.fsPath}:13`), true);
    });

    it("should ignore copy on a separator", async () => {
      const separator = {
        ...getQpItem(),
        kind: vscode.QuickPickItemKind.Separator,
      };
      const [writeTextStub] = setups.copy.setupForCopying([separator]);

      await quickPick.copyReference();
      await quickPick.copyLocation();

      assert.equal(writeTextStub.called, false);
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

  describe("category buttons", () => {
    const categories = [
      { name: "Types", phrase: "@@", kinds: [4, 9, 10, 22], icon: "symbol-class" },
      { name: "Members", phrase: "!!", kinds: [5, 6, 11] },
      { name: "Files", phrase: "$$", kinds: [0], icon: "files" },
    ];
    let sandbox: sinon.SinonSandbox;
    let control: vscode.QuickPick<any>;

    const open = (
      query: string,
      options: { toggles?: boolean; phrases?: boolean } = {}
    ) => {
      control = vscode.window.createQuickPick<any>();
      control.value = query;
      sandbox = sinon.createSandbox();
      sandbox.stub(quickPick, "getControl").returns(control);
      sandbox
        .stub(quickPick, "getShouldUseItemsFilterPhrases")
        .returns(options.phrases ?? true);
      sandbox.stub(quickPick, "getItemsFilterPhrases").returns({});
      sandbox.stub(quickPick, "getCategories").returns(categories);
      sandbox.stub(quickPick, "getShouldItemsBeSorted").returns(false);
      sandbox
        .stub(vscodeVersion, "supportsQuickInputButtonToggle")
        .returns(options.toggles ?? true);
      sandbox.stub(vscode.commands, "executeCommand").resolves();
      sandbox.stub(database, "isReady").returns(true);
      sandbox.stub(database, "search").returns([{ ...getQpItems()[0] }]);
      quickPick.loadItems();
    };

    const buttons = () =>
      (control.buttons as CategoryButton[]).filter(
        (button) => typeof button.categoryIndex === "number"
      );
    const libraryButton = () =>
      (control.buttons as LibraryButton[]).find(
        (button) => button.includeLibraries
      );
    const buttonFor = (tooltip: string) =>
      buttons().find((button) => button.tooltip === tooltip)!;
    const checked = () =>
      buttons()
        .filter((button) => button.toggle?.checked)
        .map((button) => button.tooltip);
    const iconOf = (button: CategoryButton) =>
      (button.iconPath as vscode.ThemeIcon).id;

    afterEach(async () => {
      await quickPick.navigateBack();
      sandbox.restore();
      control.dispose();
    });

    it("should show one toggle button per category plus All on VS Code 1.109", () => {
      open("order");

      assert.deepEqual(
        buttons().map((button) => button.tooltip),
        [
          "All · Tab",
          "Types (@@) · Tab",
          "Members (!!) · Tab",
          "Files ($$) · Tab",
        ]
      );
      assert.deepEqual(buttons().map(iconOf), [
        "list-flat",
        "symbol-class",
        "filter",
        "files",
      ]);
      assert.isTrue(buttons().every((button) => button.toggle !== undefined));
    });

    it("should check only the active category button", () => {
      open("!!order");

      assert.deepEqual(checked(), ["Members (!!) · Tab"]);
    });

    it("should put the category buttons inline next to the input", () => {
      open("order");

      assert.isTrue(buttons().every((button) => button.location === 2));
    });

    it("should show title bar buttons with a check on the active one before VS Code 1.109", () => {
      open("@@order", { toggles: false });

      assert.isTrue(
        buttons().every(
          (button) => button.location === undefined && button.toggle === undefined
        )
      );
      assert.deepEqual(buttons().map(iconOf), [
        "list-flat",
        "check",
        "filter",
        "files",
      ]);
    });

    it("should switch category when a category button is clicked", async () => {
      open("order");

      await quickPick.handleDidTriggerButton(buttonFor("Types (@@) · Tab"));

      assert.equal(control.value, "@@order");
      assert.equal(control.title, "Search Everywhere · Types");
      assert.deepEqual(checked(), ["Types (@@) · Tab"]);
    });

    it("should keep the query text when switching category by button", async () => {
      open("@@Server.Start:12");

      await quickPick.handleDidTriggerButton(buttonFor("Files ($$) · Tab"));

      assert.equal(control.value, "$$Server.Start:12");
    });

    it("should keep the active category when its button is clicked again", async () => {
      open("!!order");
      const members = buttonFor("Members (!!) · Tab");
      members.toggle = { checked: false };

      await quickPick.handleDidTriggerButton(members);

      assert.equal(control.value, "!!order");
      assert.deepEqual(checked(), ["Members (!!) · Tab"]);
    });

    it("should go back to All when the All button is clicked", async () => {
      open("$$order");

      await quickPick.handleDidTriggerButton(buttonFor("All · Tab"));

      assert.equal(control.value, "order");
      assert.equal(control.title, "Search Everywhere");
      assert.deepEqual(checked(), ["All · Tab"]);
    });

    it("should show no category buttons in file scope", async () => {
      open("@@order");

      await quickPick.navigateIntoFile(getQpItems()[0]);

      assert.deepEqual(control.buttons, [vscode.QuickInputButtons.Back]);
      assert.equal(control.title, "Search in fake-1.ts");
    });

    it("should restore the category buttons after leaving file scope", async () => {
      open("@@order");
      await quickPick.navigateIntoFile(getQpItems()[0]);

      await quickPick.navigateBack();

      assert.equal(control.value, "@@order");
      assert.equal(control.title, "Search Everywhere · Types");
      assert.deepEqual(checked(), ["Types (@@) · Tab"]);
    });

    it("should show the library button when filter phrases are off", () => {
      open("order", { phrases: false });

      assert.equal(control.title, "Search Everywhere");
      assert.deepEqual(buttons(), []);
      assert.match(libraryButton()?.tooltip || "", /^Include libraries · /);
    });

    it("should toggle include libraries from the title button", async () => {
      open("order");

      await quickPick.handleDidTriggerButton(libraryButton()!);

      assert.isTrue(quickPick.getIncludeLibraries());
      assert.equal(control.title, "Search Everywhere · including libraries");
      assert.isTrue(libraryButton()?.toggle?.checked);
      quickPick.toggleIncludeLibraries();
    });
  });

  describe("live symbols", () => {
    let sandbox: sinon.SinonSandbox;
    let clock: sinon.SinonFakeTimers;
    let control: vscode.QuickPick<any>;
    let fetchStub: sinon.SinonStub;
    let isRebuildingStub: sinon.SinonStub;
    let indexItems: QuickPickItem[];

    const liveItem = (
      name: string,
      source: "live" | "library" = "live",
      symbolKind: number = vscode.SymbolKind.Class,
      path: string = "/./fake/live.ts",
      line: number = 4
    ): QuickPickItem => ({
      label: name,
      description: source === "library" ? "class · library" : "class",
      uri: vscode.Uri.file(path),
      symbolKind,
      range: {
        start: new vscode.Position(line, 0),
        end: new vscode.Position(line, 5),
      },
      source,
    });
    const labels = () =>
      (control.items as QuickPickItem[]).map((item) => item.label);
    const type = async (query: string) => {
      control.value = query;
      quickPick.loadItems();
      await clock.tickAsync(200);
    };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      clock = sandbox.useFakeTimers();
      control = vscode.window.createQuickPick<any>();
      sandbox.stub(control, "show");
      sandbox.stub(quickPick, "getControl").returns(control);
      sandbox.stub(quickPick, "getShouldUseItemsFilterPhrases").returns(false);
      sandbox.stub(quickPick, "getShouldItemsBeSorted").returns(false);
      sandbox.stub(vscode.commands, "executeCommand").resolves();
      sandbox
        .stub(config, "fetchSearchLanguageServersWhileIndexing")
        .returns(true);
      sandbox.stub(database, "isReady").returns(true);
      sandbox.stub(database, "isEmpty").returns(false);
      sandbox
        .stub(dataConverter, "getIcons")
        .returns({ [vscode.SymbolKind.Method]: "symbol-method" });
      indexItems = [getQpItemWithNamePosition()];
      sandbox
        .stub(database, "search")
        .callsFake(() => indexItems.map((item) => ({ ...item })));
      isRebuildingStub = sandbox
        .stub(workspaceIndexer, "isRebuilding")
        .returns(true);
      fetchStub = sandbox.stub(liveSymbols, "fetchLiveSymbols").resolves([]);
      quickPick.show();
    });

    afterEach(() => {
      quickPick.handleDidHide();
      sandbox.restore();
      control.dispose();
    });

    it("should not call the workspace symbol provider when the index is complete and libraries are off", async () => {
      isRebuildingStub.returns(false);

      await type("save");

      assert.equal(fetchStub.called, false);
    });

    it("should append live results under Not indexed yet while rebuilding", async () => {
      fetchStub.resolves([liveItem("SaveService")]);

      await type("save");

      assert.deepEqual(fetchStub.firstCall.args[0], {
        query: "save",
        includeWorkspace: true,
        includeLibraries: false,
        symbolKinds: undefined,
      });
      assert.deepEqual(labels(), [
        "$(symbol-method)  save",
        "Not indexed yet",
        "SaveService",
      ]);
    });

    it("should drop live results that duplicate an index result", async () => {
      fetchStub.resolves([
        liveItem(
          "save",
          "live",
          vscode.SymbolKind.Method,
          "/./fake/fake-1.ts",
          12
        ),
      ]);

      await type("save");

      assert.deepEqual(labels(), ["$(symbol-method)  save"]);
    });

    it("should drop a live answer for an older query", async () => {
      let answerOlder: (items: QuickPickItem[]) => void = () => {};
      fetchStub
        .onFirstCall()
        .returns(new Promise((resolve) => (answerOlder = resolve)));

      await type("sav");
      await type("save");
      answerOlder([liveItem("SaveService")]);
      await clock.tickAsync(0);

      assert.equal(fetchStub.callCount, 2);
      assert.notInclude(labels(), "SaveService");
    });

    it("should keep the active item when live results arrive", async () => {
      indexItems = getQpItems(2);
      fetchStub.resolves([liveItem("fake-live")]);
      control.value = "fake";
      quickPick.loadItems();
      const active = control.items[1];
      control.activeItems = [active];

      await clock.tickAsync(200);

      assert.include(labels(), "fake-live");
      assert.equal(
        database.itemIdentity(control.activeItems[0]),
        database.itemIdentity(active)
      );
    });

    it("should not fetch live results for a one-character query", async () => {
      await type("s");

      assert.equal(fetchStub.called, false);
    });

    it("should append library results under Libraries when the toggle is on", async () => {
      isRebuildingStub.returns(false);
      fetchStub.resolves([liveItem("Promise", "library")]);
      control.value = "Prom";

      quickPick.toggleIncludeLibraries();
      await clock.tickAsync(200);

      assert.deepEqual(fetchStub.firstCall.args[0], {
        query: "Prom",
        includeWorkspace: false,
        includeLibraries: true,
        symbolKinds: undefined,
      });
      assert.deepEqual(labels().slice(-2), ["Libraries", "Promise"]);
      assert.equal(control.title, "Search Everywhere · including libraries");
    });

    it("should reset include libraries when the quick pick opens", () => {
      quickPick.toggleIncludeLibraries();
      quickPick.handleDidHide();

      quickPick.show();

      assert.isFalse(quickPick.getIncludeLibraries());
      assert.equal(control.title, "Search Everywhere");
    });

    it("should not offer Search symbols in this file on a library result", async () => {
      isRebuildingStub.returns(false);
      fetchStub.resolves([liveItem("lib.es5.d.ts", "library", 0)]);
      control.value = "lib";

      quickPick.toggleIncludeLibraries();
      await clock.tickAsync(200);

      const library = (control.items as QuickPickItem[]).find(
        (item) => item.source === "library"
      )!;
      const tooltips = (library.buttons ?? []).map(
        (button) => button.tooltip ?? ""
      );
      assert.notInclude(tooltips, "Search symbols in this file");
      assert.include(tooltips, "Open to the side");
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

    it("should preview at the symbol name", async () => {
      quickPick.show();

      await moveTo(getQpItemWithNamePosition());

      const options = showTextDocumentStub.firstCall.args[1];
      assert.isTrue(options.selection.isEmpty);
      assert.isTrue(options.selection.start.isEqual(new vscode.Position(12, 4)));
    });
  });

  describe("opening at the symbol name", () => {
    let sandbox: sinon.SinonSandbox;
    let highlight: boolean;
    let editor: { selection?: vscode.Selection; revealRange: sinon.SinonStub };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      highlight = false;
      editor = { revealRange: sandbox.stub() };
      sandbox
        .stub(config, "fetchShouldHighlightSymbol")
        .callsFake(() => highlight);
      sandbox
        .stub(vscode.workspace, "openTextDocument")
        .callsFake(async (uri: any) => ({ uri } as any));
      sandbox
        .stub(vscode.window, "showTextDocument")
        .callsFake(async () => editor as any);
      sandbox.stub(recentItems, "addRecentItem");
    });

    afterEach(() => {
      sandbox.restore();
    });

    const revealed = () => editor.revealRange.firstCall.args[0] as vscode.Range;

    it("should put the caret on the symbol name when highlighting is off", async () => {
      await quickPick.openItem(getQpItemWithNamePosition());

      assert.isTrue(editor.selection!.isEmpty);
      assert.isTrue(editor.selection!.active.isEqual(new vscode.Position(12, 4)));
    });

    it("should keep selecting the full range when highlighting is on", async () => {
      highlight = true;

      await quickPick.openItem(getQpItemWithNamePosition());

      assert.isTrue(editor.selection!.start.isEqual(new vscode.Position(10, 2)));
      assert.isTrue(editor.selection!.end.isEqual(new vscode.Position(16, 3)));
    });

    it("should reveal from the declaration start to the name", async () => {
      await quickPick.openItem(getQpItemWithNamePosition());

      assert.isTrue(revealed().start.isEqual(new vscode.Position(10, 2)));
      assert.isTrue(revealed().end.isEqual(new vscode.Position(12, 4)));
      assert.equal(
        editor.revealRange.firstCall.args[1],
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
      );
    });

    it("should reveal only the name when the doc comment is longer than 20 lines", async () => {
      await quickPick.openItem(getQpItemWithNamePosition(40, 10));

      assert.isTrue(revealed().isEmpty);
      assert.isTrue(revealed().start.isEqual(new vscode.Position(40, 4)));
    });

    it("should prefer a :line target over the name position", async () => {
      const targetPosition = new vscode.Position(30, 0);

      await quickPick.openItem({ ...getQpItemWithNamePosition(), targetPosition });

      assert.isTrue(editor.selection!.active.isEqual(targetPosition));
      assert.isTrue(revealed().start.isEqual(targetPosition));
    });

    it("should fall back to the range start when there is no name position", async () => {
      const { namePosition, ...item } = getQpItemWithNamePosition();

      await quickPick.openItem(item);

      assert.isTrue(editor.selection!.active.isEqual(new vscode.Position(10, 2)));
      assert.isTrue(revealed().start.isEqual(new vscode.Position(10, 2)));
      assert.isTrue(revealed().end.isEqual(new vscode.Position(16, 3)));
      assert.equal(
        editor.revealRange.firstCall.args[1],
        vscode.TextEditorRevealType.Default
      );
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
      sandbox.stub(quickPick, "getHandOffPrefixes").returns(false);
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

  describe("hand-off prefixes", () => {
    afterEach(() => quickPick.handleDidHide());

    it("should open the command palette with the rest of the query when it starts with >", async () => {
      const { handOffCalls, loadItemsStub, control } =
        setups.handOff.setupForHandOff();

      await quickPick.handleDidChangeValue("  >sort");

      assert.deepEqual(handOffCalls(), [["workbench.action.quickOpen", ">sort"]]);
      assert.equal((control.hide as sinon.SinonStub).calledOnce, true);
      assert.equal(loadItemsStub.called, false);
    });

    it("should open the full command palette for > alone", async () => {
      const { handOffCalls } = setups.handOff.setupForHandOff();

      await quickPick.handleDidChangeValue(">");

      assert.deepEqual(handOffCalls(), [["workbench.action.quickOpen", ">"]]);
    });

    it("should open quick text search when it starts with % and the command exists", async () => {
      const { handOffCalls } = setups.handOff.setupForHandOff();

      await quickPick.handleDidChangeValue("%TODO");

      assert.deepEqual(handOffCalls(), [["workbench.action.quickOpen", "%TODO"]]);
    });

    it("should open the Search view with the query when quick text search is not available", async () => {
      const { handOffCalls } = setups.handOff.setupForHandOff({
        quickTextSearch: false,
      });

      await quickPick.handleDidChangeValue("%TODO");

      assert.deepEqual(handOffCalls(), [
        [
          "workbench.action.findInFiles",
          { query: "TODO", triggerSearch: true },
        ],
      ]);
    });

    it("should search the index when > is not the first character", async () => {
      const { handOffCalls, loadItemsStub } = setups.handOff.setupForHandOff();

      await quickPick.handleDidChangeValue("user>x");
      await quickPick.handleDidChangeValue("a%b");

      assert.deepEqual(handOffCalls(), []);
      assert.equal(loadItemsStub.callCount, 2);
    });

    it("should let a category phrase that starts with > win over the hand-off", async () => {
      const { handOffCalls, loadItemsStub } = setups.handOff.setupForHandOff();

      await quickPick.handleDidChangeValue(">>x");

      assert.deepEqual(handOffCalls(), []);
      assert.equal(loadItemsStub.calledOnce, true);
    });

    it("should not hand off a value set by the extension", async () => {
      const { handOffCalls, loadItemsStub } = setups.handOff.setupForHandOff();

      quickPick.setText(">sort");
      await quickPick.handleDidChangeValue(">sort");

      assert.deepEqual(handOffCalls(), []);
      assert.equal(loadItemsStub.calledOnce, true);
    });

    it("should remember the query without the prefix after a hand-off", async () => {
      setups.handOff.setupForHandOff();

      await quickPick.handleDidChangeValue(">sort");

      assert.equal(quickPick.getLastQuery(), "sort");
    });

    it("should search the index when handOffPrefixes is false", async () => {
      const { handOffCalls, loadItemsStub } = setups.handOff.setupForHandOff({
        handOffPrefixes: false,
      });

      await quickPick.handleDidChangeValue(">sort");
      await quickPick.handleDidChangeValue("%TODO");

      assert.deepEqual(handOffCalls(), []);
      assert.equal(loadItemsStub.callCount, 2);
    });

    it("should list the hand-off prefixes in the help list", () => {
      setups.handOff.setupForHandOff();
      sinon.stub(quickPick, "fetchConfig");

      try {
        quickPick.reload();
      } finally {
        (quickPick.fetchConfig as sinon.SinonStub).restore();
      }
      const labels = quickPick.getHelpItems().map((item) => item.label);

      assert.deepEqual(labels, [
        "? Type >> for limit results to Types only (Tab)",
        "? Type > to search VS Code commands",
        "? Type % to search text in files",
        "? Type ff for limit results to Function only",
      ]);
    });

    it("should hand off when a hand-off help row is accepted", async () => {
      const { control, handOffCalls, loadItemsStub } =
        setups.handOff.setupForHandOff();
      sinon.stub(quickPick, "fetchConfig");
      try {
        quickPick.reload();
      } finally {
        (quickPick.fetchConfig as sinon.SinonStub).restore();
      }
      const row = quickPick
        .getHelpItems()
        .find((item) => item.handOff === "commands");
      sinon.stub(control, "selectedItems").value([row]);

      await quickPick.handleDidAccept();

      assert.deepEqual(handOffCalls(), [["workbench.action.quickOpen", ">"]]);
      assert.equal(loadItemsStub.called, false);
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
