import { assert } from "chai";
import * as sinon from "sinon";
import { quickPick } from "../../quickPick/quickPick";
import { quickPickState } from "../../quickPick/state";

describe("QuickPick help", () => {
  describe("help items", () => {
    it("should list categories before one-kind phrases in help", () => {
      const sandbox = sinon.createSandbox();
      sandbox.stub(quickPickState, "getHelpPhrase").returns("?");
      sandbox
        .stub(quickPickState, "getCategories")
        .returns([{ name: "Types", phrase: "@@", kinds: [4, 10] }]);
      sandbox.stub(quickPickState, "getItemsFilterPhrases").returns({ 11: "ff" });
      sandbox.stub(quickPickState, "getHandOffPrefixes").returns(false);
      sandbox.stub(quickPickState, "getShouldUseItemsFilterPhrases").returns(true);
      sandbox.stub(quickPickState, "getShouldItemsBeSorted").returns(false);
      sandbox.stub(quickPick, "fetchConfig");

      quickPick.reload();
      const labels = quickPickState.getHelpItems().map((item) => item.label);
      sandbox.restore();

      assert.deepEqual(labels, [
        "? Type @@ for limit results to Types only (Tab)",
        "? Type ff for limit results to Function only",
      ]);
    });
  });
});
