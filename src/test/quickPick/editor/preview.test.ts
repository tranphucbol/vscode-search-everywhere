import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/settings/config";
import { quickPick } from "../../../quickPick/quickPick";
import { quickPickState } from "../../../quickPick/state";
import { itemLoader } from "../../../quickPick/view/itemLoader";
import { recentItems } from "../../../quickPick/view/recentItems";
import {
  getQpItem,
  getQpItemWithNamePosition,
} from "../../util/qpItemMockFactory";
import { getTextDocumentWithLines } from "../../util/stubFactory";

describe("QuickPick preview", () => {
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
      sandbox.stub(quickPickState, "getControl").returns(control);
      sandbox.stub(quickPickState, "getShouldUseItemsFilterPhrases").returns(false);
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
      sandbox.stub(itemLoader, "loadItems");
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

    it("should preview a :start-end target with its lines selected", async () => {
      (vscode.workspace.openTextDocument as sinon.SinonStub).callsFake(
        async () => getTextDocumentWithLines(200, 10)
      );
      quickPick.show();

      await moveTo({
        ...getQpItemWithNamePosition(),
        targetPosition: new vscode.Position(49, 0),
        targetEndLine: 99,
      });

      const options = showTextDocumentStub.firstCall.args[1];
      assert.isTrue(options.selection.start.isEqual(new vscode.Position(49, 0)));
      assert.isTrue(options.selection.end.isEqual(new vscode.Position(99, 10)));
    });
  });
});
