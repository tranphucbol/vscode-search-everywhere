import { assert } from "chai";
import * as sinon from "sinon";
import { quickPick } from "../../../quickPick/quickPick";
import { quickPickState } from "../../../quickPick/state";
import { getTestSetups } from "./handOff.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("QuickPick hand-off", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

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
      const labels = quickPickState.getHelpItems().map((item) => item.label);

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
      const row = quickPickState
        .getHelpItems()
        .find((item) => item.handOff === "commands");
      sinon.stub(control, "selectedItems").value([row]);

      await quickPick.handleDidAccept();

      assert.deepEqual(handOffCalls(), [["workbench.action.quickOpen", ">"]]);
      assert.equal(loadItemsStub.called, false);
    });
  });
});
