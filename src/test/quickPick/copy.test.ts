import { assert } from "chai";
import * as vscode from "vscode";
import { quickPick } from "../../quickPick/quickPick";
import { quickPickState } from "../../quickPick/state";
import {
  getQpItem,
  getQpItemWithNamePosition,
} from "../util/qpItemMockFactory";
import { getTestSetups } from "./copy.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("QuickPick copy", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("copy", () => {
    const copyButton = {
      iconPath: new vscode.ThemeIcon("copy"),
      tooltip: "Copy reference",
    };

    it("should add a copy reference button as the last row button", () => {
      const symbolItem = getQpItemWithNamePosition();
      quickPick.setItems([getQpItem(), symbolItem]);

      quickPickState.getItems().forEach((item) => {
        const buttons = item.buttons!;
        const lastIcon = buttons[buttons.length - 1].iconPath;
        assert.equal((lastIcon as vscode.ThemeIcon).id, "copy");
      });
      assert.equal(quickPickState.getItems()[1].buttons!.length, 2);
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
});
