import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { database } from "../../../database";
import { quickPick } from "../../../quickPick/quickPick";
import { quickPickState } from "../../../quickPick/state";
import { getQpItems } from "../../util/qpItemMockFactory";
import { getTestSetups } from "./itemLoader.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("QuickPick item loader", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

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

      assert.equal(quickPickState.getItems().length, 2);
    });

    it("should items have assigned buttons property", () => {
      quickPick.setItems(getQpItems());

      assert.deepEqual(quickPickState.getItems()[0].buttons, [
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

  describe("loadItems with line suffix", () => {
    it("should search without the suffix and attach the target position", () => {
      const control = vscode.window.createQuickPick<any>();
      control.value = "Foo.java:5";
      const item = getQpItems()[0];
      const sandbox = sinon.createSandbox();
      sandbox.stub(quickPickState, "getControl").returns(control);
      sandbox.stub(quickPickState, "getShouldUseItemsFilterPhrases").returns(false);
      sandbox.stub(quickPickState, "getShouldItemsBeSorted").returns(false);
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
      sandbox.stub(quickPickState, "getControl").returns(control);
      sandbox.stub(quickPickState, "getShouldUseItemsFilterPhrases").returns(false);
      sandbox.stub(quickPickState, "getShouldItemsBeSorted").returns(false);
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
      sandbox.stub(quickPickState, "getControl").returns(control);
      sandbox.stub(quickPickState, "getShouldUseItemsFilterPhrases").returns(true);
      sandbox
        .stub(quickPickState, "getItemsFilterPhrases")
        .returns(options.phrases ?? { 4: "@@" });
      sandbox
        .stub(quickPickState, "getCategories")
        .returns(options.categories ?? []);
      sandbox.stub(quickPickState, "getShouldItemsBeSorted").returns(false);
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
});
