import { assert } from "chai";
import * as vscode from "vscode";
import { files } from "../../../symbols/scan/files";
import { getTestSetups } from "./files.testSetup";
import { getItem } from "../../util/itemMockFactory";

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

  describe("fetchUris", () => {
    it("should list the include and always include files in one findFiles call", async () => {
      const { findFilesStub } = setups.fetchUris.setupForIncludePatterns([
        "**/*.{ts,tsx}",
        "**/*.{yaml,md}",
        "**/{.env,Dockerfile}",
      ]);

      await files.fetchUris();

      assert.equal(findFilesStub.calledOnce, true);
      assert.deepEqual(findFilesStub.firstCall.args, [
        "{**/*.ts,**/*.tsx,**/*.yaml,**/*.md,**/.env,**/Dockerfile}",
        "**/node_modules/**",
      ]);
    });

    it("should pass a single include pattern to findFiles unchanged", async () => {
      const { findFilesStub } = setups.fetchUris.setupForIncludePatterns([
        "**/*.{js,jsx,ts,tsx}",
      ]);

      await files.fetchUris();

      assert.deepEqual(findFilesStub.firstCall.args, [
        "**/*.{js,jsx,ts,tsx}",
        "**/node_modules/**",
      ]);
    });
  });

  describe("isNamesOnly", () => {
    it("should treat a file matched only by an always include pattern as names only", () => {
      setups.isNamesOnly.setupForNamesOnlyGlobs("", true);

      assert.equal(files.isNamesOnly(vscode.Uri.file("/./fake/README.md")), true);
    });

    it("should keep symbols for a file matched by include even when it is always included", () => {
      setups.isNamesOnly.setupForNamesOnlyGlobs("", false);

      assert.equal(files.isNamesOnly(vscode.Uri.file("/./fake/README.md")), false);
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
