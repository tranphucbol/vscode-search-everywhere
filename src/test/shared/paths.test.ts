import { assert } from "chai";
import * as vscode from "vscode";
import { ensureUri, pathUtils } from "../../shared/paths";
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

  describe("ensureUri", () => {
    it("should return vscode.Uri instance as-is", () => {
      const uri = vscode.Uri.file("/home/user/file.ts");
      assert.equal(ensureUri(uri), uri);
    });

    it("should parse string URI correctly including remote schemes", () => {
      const remoteUriStr = "vscode-remote://ssh-remote%2Bmyserver/home/user/main.cpp";
      const uri = ensureUri(remoteUriStr);
      assert.isTrue(uri instanceof vscode.Uri);
      assert.equal(uri.scheme, "vscode-remote");
      assert.equal(uri.authority, "ssh-remote+myserver");
      assert.equal(uri.path, "/home/user/main.cpp");
    });

    it("should revive serialized URI objects from JSON cache", () => {
      const serialized = {
        scheme: "vscode-remote",
        authority: "ssh-remote+myserver",
        path: "/home/user/main.cpp",
        query: "",
        fragment: "",
      };
      const uri = ensureUri(serialized);
      assert.isTrue(uri instanceof vscode.Uri);
      assert.equal(uri.scheme, "vscode-remote");
      assert.equal(uri.path, "/home/user/main.cpp");
    });
  });
});
