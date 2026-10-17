import { assert } from "chai";
import * as path from "path";
import * as vscode from "vscode";
import * as config from "../../platform/config";
import { database, RecentKey } from "../../database";
import { QuickPickItem } from "../../shared/types";
import { useTestDatabase } from "../util/databaseFixtures";

describe("Database secondary code", () => {
  useTestDatabase();

  describe("secondary code", () => {
    const fileItem = (path: string): QuickPickItem => ({
      uri: vscode.Uri.file(path),
      symbolKind: vscode.SymbolKind.File,
      label: `$(file) ${path.slice(path.lastIndexOf("/") + 1)}`,
      description: "file",
    });
    const method = (name: string, path: string, container: string): QuickPickItem => ({
      uri: vscode.Uri.file(path),
      symbolKind: vscode.SymbolKind.Method,
      label: `$(symbol-method) ${name}`,
      description: `${container} · method`,
      containerName: container,
      range: new vscode.Range(new vscode.Position(3, 0), new vscode.Position(5, 0)),
    });
    const paths = (results: QuickPickItem[]) => results.map((item) => item.uri.path);

    it("should rank a test file below a source file of the same band", () => {
      database.insertSymbolsBatch([
        fileItem("/workspace/server_test.go"),
        fileItem("/workspace/server_tools.go"),
      ]);

      assert.deepEqual(paths(database.search("server")), [
        "/workspace/server_tools.go",
        "/workspace/server_test.go",
      ]);
    });

    it("should keep an exact secondary match above a prefix source match", () => {
      database.insertSymbolsBatch([
        method("Start", "/workspace/mocks/server.go", "MockServer"),
        method("StartAll", "/workspace/server.go", "Server"),
      ]);

      assert.deepEqual(paths(database.search("Start")), [
        "/workspace/mocks/server.go",
        "/workspace/server.go",
      ]);
    });

    it("should keep a recent secondary item above other items of its band", () => {
      const secondary = method("Start", "/workspace/mocks/server.go", "MockServer");
      const source = method("Start", "/workspace/server.go", "Server");
      database.insertSymbolsBatch([secondary, source]);

      assert.deepEqual(paths(database.search("Start")), [
        "/workspace/server.go",
        "/workspace/mocks/server.go",
      ]);
      const recent: RecentKey = {
        uri: secondary.uri.toString(),
        symbolKind: secondary.symbolKind,
        name: "Start",
      };
      assert.deepEqual(paths(database.search("Start", 500, { recent: [recent] })), [
        "/workspace/mocks/server.go",
        "/workspace/server.go",
      ]);
    });

    it("should tag test and generated rows in the description", () => {
      database.insertSymbolsBatch([
        fileItem("/workspace/api/user.pb.go"),
        fileItem("/workspace/api/user_test.go"),
        fileItem("/workspace/api/user.go"),
      ]);

      const descriptions = Object.fromEntries(
        database.search("user").map((item) => [item.uri.path, item.description])
      );
      assert.deepEqual(descriptions, {
        "/workspace/api/user.go": "file",
        "/workspace/api/user_test.go": "file · test",
        "/workspace/api/user.pb.go": "file · generated",
      });
    });

    it("should recompute is_secondary without reindexing", () => {
      database.insertSymbolsBatch([
        fileItem("/workspace/fixtures/order.go"),
        fileItem("/workspace/order_test.go"),
      ]);

      database.recomputeSecondary(["**/fixtures/**"]);

      const descriptions = database.search("order").map((item) => item.description);
      assert.deepEqual(descriptions, ["file · generated", "file"]);
      assert.equal(database.getCount(), 2);
      database.recomputeSecondary(config.fetchSecondaryCode());
    });
  });
});
