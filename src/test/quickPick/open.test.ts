import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../platform/config";
import { quickPick } from "../../quickPick/quickPick";
import { opener } from "../../quickPick/open";
import { recentItems } from "../../quickPick/recentItems";
import {
  getQpItems,
  getQpItemWithNamePosition,
} from "../util/qpItemMockFactory";
import { stubControl } from "../util/quickPickStubs";

describe("QuickPick open", () => {
  describe("openToTheSide", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      stubControl(sandbox);
    });
    afterEach(() => sandbox.restore());

    it("should open active item beside and hide control", async () => {
      const qpItem = getQpItems()[0];
      const openItemStub = sandbox.stub(opener, "openItem").resolves();
      const hideStub = sandbox.stub(quickPick.getControl(), "hide");

      await quickPick.openToTheSide(qpItem);

      assert.equal(openItemStub.calledOnce, true);
      assert.equal(openItemStub.firstCall.args[1], vscode.ViewColumn.Beside);
      assert.equal(hideStub.calledOnce, true);
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
});
