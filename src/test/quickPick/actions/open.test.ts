import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/settings/config";
import { quickPick } from "../../../quickPick/quickPick";
import { opener } from "../../../quickPick/actions/open";
import { recentItems } from "../../../quickPick/view/recentItems";
import {
  getQpItems,
  getQpItemWithNamePosition,
} from "../../util/qpItemMockFactory";
import { stubControl } from "../../util/quickPickStubs";
import { getTextDocumentWithLines } from "../../util/stubFactory";

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
    let editor: {
      document: vscode.TextDocument;
      selection?: vscode.Selection;
      revealRange: sinon.SinonStub;
    };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      highlight = false;
      editor = {
        document: getTextDocumentWithLines(200, 10),
        revealRange: sandbox.stub(),
      };
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

    const withLines = (startLine: number, targetEndLine: number) => ({
      ...getQpItemWithNamePosition(),
      targetPosition: new vscode.Position(startLine, 0),
      targetEndLine,
    });

    it("should select whole lines for a :start-end target", async () => {
      await quickPick.openItem(withLines(49, 99));

      assert.isTrue(editor.selection!.anchor.isEqual(new vscode.Position(49, 0)));
      assert.isTrue(editor.selection!.active.isEqual(new vscode.Position(99, 10)));
    });

    it("should clamp a :start-end target past the end of the file to its last line", async () => {
      await quickPick.openItem(withLines(189, 9998));
      assert.isTrue(editor.selection!.start.isEqual(new vscode.Position(189, 0)));
      assert.isTrue(editor.selection!.end.isEqual(new vscode.Position(199, 10)));

      editor.revealRange.resetHistory();
      await quickPick.openItem(withLines(4999, 9998));
      assert.isTrue(editor.selection!.start.isEqual(new vscode.Position(199, 0)));
      assert.isTrue(editor.selection!.end.isEqual(new vscode.Position(199, 10)));
    });

    it("should select a :start-end target with symbol highlighting off", async () => {
      highlight = true;
      await quickPick.openItem(withLines(49, 99));
      const highlighted = editor.selection!;

      highlight = false;
      await quickPick.openItem(withLines(49, 99));

      assert.isTrue(editor.selection!.isEqual(highlighted));
      assert.isTrue(editor.selection!.start.isEqual(new vscode.Position(49, 0)));
    });

    it("should reveal a :start-end target from its start", async () => {
      await quickPick.openItem(withLines(49, 99));

      assert.isTrue(revealed().start.isEqual(new vscode.Position(49, 0)));
      assert.isTrue(revealed().end.isEqual(new vscode.Position(99, 10)));
      assert.equal(
        editor.revealRange.firstCall.args[1],
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
      );
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
