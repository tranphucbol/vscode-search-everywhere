import { assert } from "chai";
import * as vscode from "vscode";
import { itemsFilter } from "../../../symbols/items/itemsFilter";

describe("ItemsFilter", () => {
  describe("isKindAllowed", () => {
    it("should allow every kind when no kinds are configured", () => {
      assert.equal(itemsFilter.isKindAllowed(5, {}), true);
    });

    it("should allow only the configured allowed kinds", () => {
      assert.equal(itemsFilter.isKindAllowed(5, { allowedKinds: [4] }), false);
      assert.equal(itemsFilter.isKindAllowed(4, { allowedKinds: [4] }), true);
    });

    it("should let a filter phrase's kinds replace the allowed kinds", () => {
      const filter = { allowedKinds: [4] };
      assert.equal(itemsFilter.isKindAllowed(5, filter, [5]), true);
      assert.equal(itemsFilter.isKindAllowed(4, filter, [5]), false);
    });

    it("should reject ignored kinds even when a filter phrase names them", () => {
      assert.equal(itemsFilter.isKindAllowed(5, { ignoredKinds: [5] }, [5]), false);
    });
  });

  describe("isNameIgnored", () => {
    it("should ignore names containing an ignored name, whatever the case", () => {
      const filter = { ignoredNames: ["", "Spec"] };
      assert.equal(itemsFilter.isNameIgnored("order.spec.ts", filter), true);
      assert.equal(itemsFilter.isNameIgnored("order.ts", filter), false);
    });
  });

  describe("isUriValid", () => {
    let storedFilter: ReturnType<typeof itemsFilter.getItemsFilter>;
    beforeEach(() => (storedFilter = itemsFilter.getItemsFilter()));
    afterEach(() => itemsFilter.setItemsFilter(storedFilter));

    it("should check files as kind 0 against the stored items filter", () => {
      itemsFilter.setItemsFilter({ allowedKinds: [5] });
      assert.equal(itemsFilter.isUriValid(vscode.Uri.file("/./fake/a.ts")), false);
      itemsFilter.setItemsFilter({ allowedKinds: [0, 5] });
      assert.equal(itemsFilter.isUriValid(vscode.Uri.file("/./fake/a.ts")), true);
    });
  });
});
