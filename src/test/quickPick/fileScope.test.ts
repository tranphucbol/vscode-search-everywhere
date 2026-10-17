import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { database } from "../../database";
import { quickPick } from "../../quickPick/quickPick";
import { itemLoader } from "../../quickPick/itemLoader";
import { getQpItems } from "../util/qpItemMockFactory";
import { stubControl } from "../util/quickPickStubs";

describe("QuickPick file scope", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    stubControl(sandbox);
    sandbox.stub(database, "isReady").returns(false);
  });
  afterEach(async () => {
    await quickPick.navigateBack();
    sandbox.restore();
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
      const loadItemsSpy = sinon.spy(itemLoader, "loadItems");

      await quickPick.navigateIntoFile(qpItem);
      assert.isTrue(loadItemsSpy.called);

      loadItemsSpy.restore();
      await quickPick.navigateBack();
    });
  });
});
