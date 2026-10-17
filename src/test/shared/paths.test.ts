import { assert } from "chai";
import { pathUtils } from "../../shared/paths";
import { getDirectory, getItem } from "../util/itemMockFactory";

describe("Paths", () => {
  describe("isDirectory", () => {
    it("should return true if passed uri is a directory", () => {
      assert.equal(pathUtils.isDirectory(getDirectory("./fake/")), true);
    });
    it("should return false if passed uri is a file", () => {
      assert.equal(pathUtils.isDirectory(getItem()), false);
    });
  });
});
