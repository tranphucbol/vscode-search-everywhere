import { assert } from "chai";
import * as vscode from "vscode";
import { files } from "../../symbols/files";
import { getTestSetups } from "./files.testSetup";
import { getItem } from "../util/itemMockFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Files", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("filterUris", () => {
    it("should leave out files whose name the items filter ignores", () => {
      setups.filterUris.setupForItemsFilter({ ignoredNames: ["spec"] });
      const kept = vscode.Uri.file("/./fake/order.ts");
      const ignored = vscode.Uri.file("/./fake/order.spec.ts");

      assert.deepEqual(files.filterUris([kept, ignored]), [kept]);
    });
  });

  describe("isNonSymbolFile", () => {
    it("should tell binary and asset files from source files", () => {
      assert.equal(files.isNonSymbolFile(vscode.Uri.file("/./fake/logo.PNG")), true);
      assert.equal(files.isNonSymbolFile(vscode.Uri.file("/./fake/app.ts")), false);
    });
  });

  describe("isUriExistingInWorkspace", () => {
    it("should return true if uri exists in workspace", async () => {
      setups.isUriExistingInWorkspace.setupForReturningTrueWhenUriExists();

      const item = getItem();
      assert.equal(await files.isUriExistingInWorkspace(item), true);
    });

    it("should return false if uri does not exist in workspace", async () => {
      setups.isUriExistingInWorkspace.setupForReturningFalseWhenUriDoesNotExist();

      const item = getItem("./test/path/to/workspace");
      assert.equal(await files.isUriExistingInWorkspace(item), false);
    });
  });
});
