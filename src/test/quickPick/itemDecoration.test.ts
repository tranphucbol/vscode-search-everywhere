import { assert } from "chai";
import * as vscode from "vscode";
import { quickPick } from "../../quickPick/quickPick";
import { quickPickState } from "../../quickPick/state";
import { getQpItem } from "../util/qpItemMockFactory";
import { getTestSetups } from "./itemDecoration.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("QuickPick item decoration", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("file icons", () => {
    it("should use file icon theme for file items when enabled", () => {
      setups.fileIcons.setupForFileIconTheme(true);
      const fileItem = getQpItem("/./fake/", 1, false, true);
      quickPick.setItems([fileItem]);

      const item = quickPickState.getItems()[0];
      assert.equal(item.label, "fake-1.ts");
      assert.equal(item.iconPath, vscode.ThemeIcon.File);
      assert.equal(item.resourceUri?.toString(), fileItem.uri.toString());
    });

    it("should keep built-in icon for symbol items when enabled", () => {
      setups.fileIcons.setupForFileIconTheme(true);
      const symbolItem = getQpItem("/./fake/", 1, false, false, false, 4);
      quickPick.setItems([symbolItem]);

      const item = quickPickState.getItems()[0];
      assert.equal(item.label, "$(symbol-class)  fake-1.ts");
      assert.isUndefined(item.iconPath);
      assert.isUndefined(item.resourceUri);
    });

    it("should keep built-in icon for file items when disabled", () => {
      setups.fileIcons.setupForFileIconTheme(false);
      const fileItem = getQpItem("/./fake/", 1, false, true);
      quickPick.setItems([fileItem]);

      const item = quickPickState.getItems()[0];
      assert.equal(item.label, "$(symbol-file)  fake-1.ts");
      assert.isUndefined(item.iconPath);
      assert.isUndefined(item.resourceUri);
    });

    it("should keep built-in icon when VS Code does not support file icon theme in quick pick", () => {
      setups.fileIcons.setupForFileIconTheme(true, false);
      const fileItem = getQpItem("/./fake/", 1, false, true);
      quickPick.setItems([fileItem]);

      const item = quickPickState.getItems()[0];
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

      const item = quickPickState.getItems()[0];
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
        quickPickState.getItems()[0].label,
        "$(symbol-function)  fake-1.ts"
      );
    });

    it("should remove icon for symbol items without a configured icon", () => {
      setups.fileIcons.setupForFileIconTheme(false, true, { 0: "symbol-file" });
      const symbolItem = getQpItem("/./fake/", 1, false, false, false, 11);
      symbolItem.label = "$(variable-group)  fake-1.ts";
      quickPick.setItems([symbolItem]);

      assert.equal(quickPickState.getItems()[0].label, "fake-1.ts");
    });
  });
});
