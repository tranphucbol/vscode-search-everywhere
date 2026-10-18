import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../platform/config";
import { database } from "../../database";
import { dataConverter } from "../../symbols/dataConverter";
import { liveSymbols } from "../../symbols/liveSymbols";
import { quickPick } from "../../quickPick/quickPick";
import { quickPickState } from "../../quickPick/state";
import { QuickPickItem } from "../../shared/types";
import { lifecycle } from "../../indexing/lifecycle";
import {
  getQpItems,
  getQpItemWithNamePosition,
} from "../util/qpItemMockFactory";
import { getTestSetups } from "./liveResults.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("QuickPick live results", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("showLoading", () => {
    it("should vscode.quickPick.busy property be set", () => {
      setups.showLoading.setupForSettingBusyProperty();
      quickPick.showLoading(true);

      assert.equal(quickPick.getControl().busy, true);
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
      sandbox.stub(quickPickState, "getControl").returns(control);
      sandbox.stub(quickPickState, "getShouldUseItemsFilterPhrases").returns(false);
      sandbox.stub(quickPickState, "getShouldItemsBeSorted").returns(false);
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
        .stub(lifecycle, "isRebuilding")
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
});
