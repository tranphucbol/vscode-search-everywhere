import { assert } from "chai";
import { vscodeVersion } from "../../shared/vscodeVersion";

describe("VscodeVersion", () => {
  describe("isVscodeVersionAtLeast", () => {
    it("should compare major and minor versions", () => {
      assert.equal(vscodeVersion.isVscodeVersionAtLeast(1, 108, "1.108.0"), true);
      assert.equal(
        vscodeVersion.isVscodeVersionAtLeast(1, 108, "1.141.0-insider"),
        true
      );
      assert.equal(vscodeVersion.isVscodeVersionAtLeast(1, 108, "2.0.0"), true);
      assert.equal(vscodeVersion.isVscodeVersionAtLeast(1, 108, "1.107.1"), false);
      assert.equal(vscodeVersion.isVscodeVersionAtLeast(1, 108, "0.200.0"), false);
      assert.equal(vscodeVersion.isVscodeVersionAtLeast(1, 108, "invalid"), false);
    });
  });

  describe("supportsQuickInputButtonToggle", () => {
    it("should support quick input button toggles from VS Code 1.109", () => {
      assert.equal(vscodeVersion.supportsQuickInputButtonToggle("1.109.0"), true);
      assert.equal(vscodeVersion.supportsQuickInputButtonToggle("1.142.0"), true);
      assert.equal(vscodeVersion.supportsQuickInputButtonToggle("1.108.2"), false);
      assert.equal(vscodeVersion.supportsQuickInputButtonToggle("1.64.0"), false);
    });
  });
});
