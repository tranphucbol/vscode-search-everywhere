import { assert } from "chai";
import { quickPick } from "../../quickPick/quickPick";
import { parseLineSuffix } from "../../quickPick/query";
import { getTestSetups } from "./query.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("QuickPick query", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("setText", () => {
    it("should text be set", () => {
      setups.setText.setupForSettingText();
      const text = "test text";
      quickPick.setText(text);

      assert.equal(quickPick.getControl().value, text);
    });
  });

  describe("parseLineSuffix", () => {
    it("should return query unchanged when there is no line suffix", () => {
      assert.deepEqual(parseLineSuffix("Foo.java"), { query: "Foo.java" });
    });

    it("should extract a 1-based line number as a 0-based position", () => {
      const result = parseLineSuffix("ForwardRecoveryRejectedException.java:5");
      assert.equal(result.query, "ForwardRecoveryRejectedException.java");
      assert.equal(result.position!.line, 4);
      assert.equal(result.position!.character, 0);
    });

    it("should extract line and column", () => {
      const result = parseLineSuffix("src/Foo.java:12:7");
      assert.equal(result.query, "src/Foo.java");
      assert.equal(result.position!.line, 11);
      assert.equal(result.position!.character, 6);
    });

    it("should not treat a bare line suffix as a query", () => {
      assert.deepEqual(parseLineSuffix(":5"), { query: ":5" });
    });
  });
});
