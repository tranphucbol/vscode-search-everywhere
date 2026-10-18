import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { database } from "../../database";
import { quickPick } from "../../quickPick/quickPick";
import { quickPickState } from "../../quickPick/state";
import { CategoryButton, LibraryButton } from "../../shared/types";
import { vscodeVersion } from "../../shared/vscodeVersion";
import { getQpItems } from "../util/qpItemMockFactory";

describe("QuickPick categories", () => {
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
      sandbox.stub(quickPickState, "getControl").returns(control);
      sandbox.stub(quickPickState, "getShouldUseItemsFilterPhrases").returns(true);
      sandbox.stub(quickPickState, "getItemsFilterPhrases").returns({});
      sandbox.stub(quickPickState, "getCategories").returns(categories);
      sandbox.stub(quickPickState, "getShouldItemsBeSorted").returns(false);
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
      sandbox.stub(quickPickState, "getControl").returns(control);
      sandbox
        .stub(quickPickState, "getShouldUseItemsFilterPhrases")
        .returns(options.phrases ?? true);
      sandbox.stub(quickPickState, "getItemsFilterPhrases").returns({});
      sandbox.stub(quickPickState, "getCategories").returns(categories);
      sandbox.stub(quickPickState, "getShouldItemsBeSorted").returns(false);
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
});
