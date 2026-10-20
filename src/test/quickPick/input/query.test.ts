import { assert } from "chai";
import { quickPick } from "../../../quickPick/quickPick";
import { parseLineSuffix } from "../../../quickPick/input/query";
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

    it("should extract a line range as a 0-based start position and end line", () => {
      const result = parseLineSuffix("User.ts:50-100");
      assert.equal(result.query, "User.ts");
      assert.equal(result.position!.line, 49);
      assert.equal(result.position!.character, 0);
      assert.equal(result.endLine, 99);
    });

    it("should swap a reversed line range", () => {
      const result = parseLineSuffix("User.ts:100-50");
      assert.equal(result.position!.line, 49);
      assert.equal(result.endLine, 99);
    });

    it("should treat a range with no end line as a single line", () => {
      const result = parseLineSuffix("User.ts:50-");
      assert.equal(result.query, "User.ts");
      assert.equal(result.position!.line, 49);
      assert.isUndefined(result.endLine);
    });

    it("should not treat a bare line range as a query", () => {
      assert.deepEqual(parseLineSuffix(":5-9"), { query: ":5-9" });
    });
  });
});
