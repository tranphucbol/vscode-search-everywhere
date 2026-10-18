import { assert } from "chai";
import * as vscode from "vscode";
import { database } from "../../database";
import { QuickPickItem } from "../../shared/types";
import { item1, item2, item3, useTestDatabase } from "../util/databaseFixtures";

describe("Database store", () => {
  useTestDatabase();

  describe("insertSymbol and getCount", () => {
    it("should insert single symbol into database", () => {
      assert.equal(database.isEmpty(), true);
      database.insertSymbol(item1);
      assert.equal(database.getCount(), 1);
      assert.equal(database.isEmpty(), false);
    });
  });

  describe("insertSymbolsBatch", () => {
    it("should insert multiple symbols in a batch", () => {
      database.insertSymbolsBatch([item1, item2, item3]);
      assert.equal(database.getCount(), 3);
    });
  });

  describe("namePosition", () => {
    it("should round-trip namePosition through insert and search", () => {
      database.insertSymbolsBatch([
        { ...item1, namePosition: new vscode.Position(12, 4) },
        item2,
      ]);
      database.insertSymbol({ ...item3, namePosition: new vscode.Position(3, 7) });

      const [controller] = database.search("UserController");
      assert.deepEqual(controller.namePosition, new vscode.Position(12, 4));
      const [service] = database.search("UserService");
      assert.isFalse("namePosition" in service);
      const user = database.search("User").find((item) => item.symbolKind === vscode.SymbolKind.Interface)!;
      assert.deepEqual(user.namePosition, new vscode.Position(3, 7));
    });
  });

  describe("deleteByUri", () => {
    it("should delete symbol by exact uri", () => {
      database.insertSymbolsBatch([item1, item2, item3]);
      database.deleteByUri(item1.uri.toString());
      assert.equal(database.getCount(), 2);
      const results = database.search("UserController");
      assert.equal(results.length, 0);
    });

    it("should delete file state together with the symbols of a uri", () => {
      database.insertSymbolsBatch([item1, item2]);
      database.upsertFileStates([
        [item1.uri.toString(), { mtime: 1, size: 10 }],
        [item2.uri.toString(), { mtime: 2, size: 20 }],
      ]);

      database.deleteByUri(item1.uri.toString());

      assert.deepEqual([...database.getFileStates().keys()], [item2.uri.toString()]);
    });
  });

  describe("deleteByUriPrefix", () => {
    it("should delete file state under a removed directory prefix", () => {
      database.insertSymbolsBatch([item1, item2, item3]);
      database.upsertFileStates([
        [item1.uri.toString(), { mtime: 1, size: 10 }],
        [item3.uri.toString(), { mtime: 3, size: 30 }],
      ]);

      database.deleteByUriPrefix(vscode.Uri.file("/workspace/src/models").toString());

      assert.deepEqual([...database.getFileStates().keys()], [item1.uri.toString()]);
    });

    it("should delete symbols matching uri prefix for directory removal", () => {
      database.insertSymbolsBatch([item1, item2, item3]);
      database.deleteByUriPrefix(vscode.Uri.file("/workspace/src/models").toString());
      assert.equal(database.getCount(), 2);
      const results = database.search("User");
      assert.equal(results.length, 2);
      assert.isTrue(results.every((r) => !r.uri.toString().includes("/workspace/src/models")));
    });

    it("should not delete siblings whose uri matches an encoded % in the prefix", () => {
      const inSpacedDir: QuickPickItem = {
        ...item1,
        uri: vscode.Uri.file("/workspace/my dir/UserController.ts"),
      };
      const inSibling: QuickPickItem = {
        ...item2,
        uri: vscode.Uri.file("/workspace/myX20dir/UserService.ts"),
      };
      database.insertSymbolsBatch([inSpacedDir, inSibling]);

      const prefix = vscode.Uri.file("/workspace/my dir").toString();
      assert.include(prefix, "my%20dir");
      database.deleteByUriPrefix(prefix);

      const remaining = database.search("").map((r) => r.uri.toString());
      assert.deepEqual(remaining, [inSibling.uri.toString()]);
    });
  });

  describe("clearAll", () => {
    it("should delete all items from database", () => {
      database.insertSymbolsBatch([item1, item2, item3]);
      assert.equal(database.getCount(), 3);
      database.clearAll();
      assert.equal(database.getCount(), 0);
      assert.equal(database.isEmpty(), true);
    });
  });
});
