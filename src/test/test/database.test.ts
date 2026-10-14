import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { database } from "../../database";
import { logger } from "../../logger";
import { QuickPickItem } from "../../types";

describe("Database", () => {
  const fakeContext: any = {
    extensionPath: path.resolve(__dirname, "../../../"),
    storageUri: vscode.Uri.file("/tmp/vscode-search-everywhere-test"),
    globalStorageUri: vscode.Uri.file("/tmp/vscode-search-everywhere-test"),
  };

  const item1: QuickPickItem = {
    uri: vscode.Uri.file("/workspace/src/UserController.ts"),
    symbolKind: vscode.SymbolKind.Class,
    label: "$(symbol-class) UserController",
    description: "src/UserController.ts",
    detail: "class UserController",
    range: new vscode.Range(new vscode.Position(10, 0), new vscode.Position(20, 0)),
  };

  const item2: QuickPickItem = {
    uri: vscode.Uri.file("/workspace/src/UserService.ts"),
    symbolKind: vscode.SymbolKind.Class,
    label: "$(symbol-class) UserService",
    description: "src/UserService.ts",
    detail: "class UserService",
    range: new vscode.Range(new vscode.Position(5, 0), new vscode.Position(15, 0)),
  };

  const item3: QuickPickItem = {
    uri: vscode.Uri.file("/workspace/src/models/User.ts"),
    symbolKind: vscode.SymbolKind.Interface,
    label: "$(symbol-interface) User",
    description: "src/models/User.ts",
    detail: "interface User",
    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(8, 0)),
  };

  before(async () => {
    await database.initDatabase(fakeContext);
  });

  beforeEach(() => {
    database.clearAll();
  });

  after(() => {
    database.closeDatabase();
  });

  describe("initDatabase", () => {
    it("should initialize database and report isReady true", () => {
      assert.equal(database.isReady(), true);
    });
  });

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

  describe("search", () => {
    beforeEach(() => {
      database.insertSymbolsBatch([item1, item2, item3]);
    });

    it("should return all items when query is empty", () => {
      const results = database.search("");
      assert.equal(results.length, 3);
    });

    it("should return matching items for exact query with proper ranking", () => {
      const results = database.search("User");
      assert.equal(results.length, 3);
      assert.equal(results[0].label, "$(symbol-interface) User");
    });

    it("should support fuzzy search", () => {
      const results = database.search("UsrCtrl");
      assert.equal(results.length, 1);
      assert.equal(results[0].label, "$(symbol-class) UserController");
    });

    it("should return empty array when no item matches", () => {
      const results = database.search("nonexistentxyz");
      assert.equal(results.length, 0);
    });

    it("should respect limit parameter", () => {
      const results = database.search("User", 2);
      assert.equal(results.length, 2);
    });

    it("should filter by symbolKind", () => {
      const results = database.search("", 500, { symbolKind: vscode.SymbolKind.Class });
      assert.equal(results.length, 2);
      assert.isTrue(results.every((r) => r.symbolKind === vscode.SymbolKind.Class));
    });

    it("should filter by allowedKinds", () => {
      const results = database.search("", 500, { allowedKinds: [vscode.SymbolKind.Interface] });
      assert.equal(results.length, 1);
      assert.equal(results[0].symbolKind, vscode.SymbolKind.Interface);
    });

    it("should filter by ignoredNames", () => {
      const results = database.search("", 500, { ignoredNames: ["Controller"] });
      assert.equal(results.length, 2);
      assert.isFalse(results.some((r) => r.label.includes("Controller")));
    });

    it("should prioritize exact stem matches like MapService and map.service.ts on top (Issue #49)", () => {
      const mapClass: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/MapService.ts"),
        symbolKind: vscode.SymbolKind.Class,
        label: "$(symbol-class) MapService",
      };
      const mapFile: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/map.service.ts"),
        symbolKind: vscode.SymbolKind.File,
        label: "$(symbol-file) map.service.ts",
      };
      const mapAdapter: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/MapServiceAdapter.ts"),
        symbolKind: vscode.SymbolKind.Class,
        label: "$(symbol-class) MapServiceAdapter",
      };
      const mapSpec: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/map.service.spec.ts"),
        symbolKind: vscode.SymbolKind.File,
        label: "$(symbol-file) map.service.spec.ts",
      };
      const bitmap: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/BitmapService.ts"),
        symbolKind: vscode.SymbolKind.Class,
        label: "$(symbol-class) BitmapService",
      };

      database.clearAll();
      database.insertSymbolsBatch([bitmap, mapAdapter, mapSpec, mapFile, mapClass]);

      // When searching "mapservice", map.service.ts (File) is #1 and MapService (Class) is #2
      const results1 = database.search("mapservice");
      assert.isAtLeast(results1.length, 2);
      assert.equal(results1[0].label, "$(symbol-file) map.service.ts");
      assert.equal(results1[1].label, "$(symbol-class) MapService");
      // BitmapService must be after exact & prefix matches
      const bitmapIdx = results1.findIndex((r) => r.label.includes("BitmapService"));
      assert.isAbove(bitmapIdx, 1);

      // When searching "map.service", same top 2 results
      const results2 = database.search("map.service");
      assert.isAtLeast(results2.length, 2);
      assert.equal(results2[0].label, "$(symbol-file) map.service.ts");
      assert.equal(results2[1].label, "$(symbol-class) MapService");

      // When searching "map-service", same top 2 results
      const results3 = database.search("map-service");
      assert.isAtLeast(results3.length, 2);
      assert.equal(results3[0].label, "$(symbol-file) map.service.ts");
      assert.equal(results3[1].label, "$(symbol-class) MapService");
    });

    it("should not return loose fuzzy matches when exact matches are present", () => {
      const exactClass: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/MapService.ts"),
        symbolKind: vscode.SymbolKind.Class,
        label: "$(symbol-class) MapService",
      };
      const exactFile: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/map.service.ts"),
        symbolKind: vscode.SymbolKind.File,
        label: "$(symbol-file) map.service.ts",
      };
      const fuzzyNoiseFile: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/mainProcessService.ts"),
        symbolKind: vscode.SymbolKind.File,
        label: "$(symbol-file) mainProcessService.ts",
      };

      database.clearAll();
      database.insertSymbolsBatch([fuzzyNoiseFile, exactFile, exactClass]);

      const results = database.search("mapservice");
      assert.equal(results.length, 2);
      assert.isFalse(results.some((r) => r.label.includes("mainProcessService")));
    });

    describe("qualified names", () => {
      const member = (
        name: string,
        containerName: string,
        file: string,
        line: number,
        symbolKind = vscode.SymbolKind.Method
      ): QuickPickItem => ({
        uri: vscode.Uri.file(file),
        symbolKind,
        label: `$(symbol-method) ${name}`,
        containerName,
        range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line + 1, 0)),
      });

      const save = member("save", "UserService", "/workspace/src/UserService.ts", 6);
      const saveAll = member("saveAll", "UserService", "/workspace/src/UserService.ts", 8);
      const load = member("load", "UserService", "/workspace/src/UserService.ts", 10);
      const otherSave = member("save", "UserController", "/workspace/src/UserController.ts", 12);
      const innerRun = member("run", "Outer.Inner", "/workspace/src/Outer.ts", 3);
      const outerRun = member("run", "Outer", "/workspace/src/Outer.ts", 9);
      const chainSave = member("save", "UserServiceImpl.Helper", "/workspace/src/Impl.ts", 4);
      const find = member("find", "User", "/workspace/src/models/User.ts", 2);

      beforeEach(() => {
        database.insertSymbolsBatch([
          save,
          saveAll,
          load,
          otherSave,
          innerRun,
          outerRun,
          chainSave,
          find,
        ]);
      });

      const keyOf = (item: QuickPickItem) =>
        `${item.label}@${item.uri.path}:${item.range?.start.line ?? 0}`;

      it("should parse qualified queries with dot, hash and double colon", () => {
        const expected = { container: "userservice", member: "save" };
        assert.deepEqual(database.parseQualifiedQuery("UserService.save"), expected);
        assert.deepEqual(database.parseQualifiedQuery("UserService#save"), expected);
        assert.deepEqual(database.parseQualifiedQuery("UserService::save"), expected);
        assert.deepEqual(database.parseQualifiedQuery("Outer::Inner::run"), {
          container: "outer.inner",
          member: "run",
        });
        assert.deepEqual(database.parseQualifiedQuery("user.service.ts"), {
          container: "user.service",
          member: "ts",
        });
        assert.deepEqual(database.parseQualifiedQuery("a..b"), { container: "a", member: "b" });
        assert.deepEqual(database.parseQualifiedQuery("UserService."), {
          container: "userservice",
          member: "",
        });
      });

      it("should not treat a leading dot as a qualifier", () => {
        assert.isUndefined(database.parseQualifiedQuery(".env"));
        assert.isUndefined(database.parseQualifiedQuery("save"));
        assert.isUndefined(database.parseQualifiedQuery(""));
      });

      it("should find a member by Class.method", () => {
        const results = database.search("UserService.save");
        assert.equal(keyOf(results[0]), keyOf(save));
        assert.isFalse(results.some((r) => keyOf(r) === keyOf(otherSave)));
      });

      it("should find a member by Class#method and Class::method", () => {
        assert.equal(keyOf(database.search("UserService#save")[0]), keyOf(save));
        assert.equal(keyOf(database.search("UserService::save")[0]), keyOf(save));
      });

      it("should match a nested member by its immediate parent", () => {
        const byParent = database.search("Inner.run");
        assert.equal(keyOf(byParent[0]), keyOf(innerRun));

        const byChain = database.search("Outer::Inner::run");
        assert.equal(keyOf(byChain[0]), keyOf(innerRun));

        const byOuter = database.search("Outer.run");
        assert.equal(keyOf(byOuter[0]), keyOf(outerRun));
      });

      it("should list every member for a trailing separator", () => {
        const results = database.search("UserService.").map(keyOf);
        for (const item of [save, saveAll, load]) {
          assert.include(results, keyOf(item));
        }
        assert.notInclude(results, keyOf(otherSave));
      });

      it("should rank an exact file stem above qualified matches", () => {
        const file: QuickPickItem = {
          uri: vscode.Uri.file("/workspace/src/user.service.ts"),
          symbolKind: vscode.SymbolKind.File,
          label: "$(symbol-file) user.service.ts",
        };
        const tsMember = member("ts", "User.Service", "/workspace/src/Other.ts", 1);
        database.insertSymbolsBatch([file, tsMember]);

        const results = database.search("user.service.ts");
        assert.equal(keyOf(results[0]), keyOf(file));
        assert.include(results.map(keyOf), keyOf(tsMember));
      });

      it("should rank exact parent and member above chain-contains matches", () => {
        const results = database.search("UserService.save").map(keyOf);
        const exactIdx = results.indexOf(keyOf(save));
        const prefixIdx = results.indexOf(keyOf(saveAll));
        const chainIdx = results.indexOf(keyOf(chainSave));
        assert.equal(exactIdx, 0);
        assert.isAbove(prefixIdx, exactIdx);
        assert.isAbove(chainIdx, prefixIdx);
      });

      it("should apply symbolKind and fileUri filters to qualified matches", () => {
        const prop = member(
          "saveCount",
          "UserService",
          "/workspace/src/UserService.ts",
          12,
          vscode.SymbolKind.Property
        );
        database.insertSymbol(prop);

        const byKind = database.search("UserService.save", 500, {
          symbolKind: vscode.SymbolKind.Property,
        });
        assert.deepEqual(byKind.map(keyOf), [keyOf(prop)]);

        const byFile = database.search("UserService.save", 500, {
          fileUri: "/workspace/src/Impl.ts",
        });
        assert.deepEqual(byFile.map(keyOf), [keyOf(chainSave)]);
      });
    });
  });

  describe("extractCleanName and extractCleanStem", () => {
    it("should extract normalized clean name without punctuation", () => {
      assert.equal(database.extractCleanName("MapService"), "mapservice");
      assert.equal(database.extractCleanName("map.service.ts"), "mapservicets");
      assert.equal(database.extractCleanName("map-service_worker"), "mapserviceworker");
    });

    it("should extract clean stem stripping extension for files", () => {
      assert.equal(database.extractCleanStem("MapService"), "mapservice");
      assert.equal(database.extractCleanStem("map.service.ts"), "mapservice");
      assert.equal(database.extractCleanStem("map-service.js"), "mapservice");
      assert.equal(database.extractCleanStem("map_service.py"), "mapservice");
      assert.equal(database.extractCleanStem(".gitignore"), "gitignore");
      assert.equal(database.extractCleanStem("map.service.spec.ts"), "mapservicespec");
    });
  });

  describe("extractCleanContainer", () => {
    it("should store the cleaned container chain", () => {
      assert.equal(database.extractCleanContainer("Outer.Inner"), "outer.inner");
      assert.equal(database.extractCleanContainer("My_Mod.Sub-Cls"), "mymod.subcls");
      assert.equal(database.extractCleanContainer("a..b"), "a.b");
      assert.equal(database.extractCleanContainer(undefined), "");
    });
  });

  describe("schema migration", () => {
    const dbFile = path.join(fakeContext.storageUri.fsPath, "search-everywhere-index.db");

    const writeVersion0Database = async () => {
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs({
        locateFile: () =>
          path.join(fakeContext.extensionPath, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
      });
      const legacy = new SQL.Database();
      legacy.run(`CREATE TABLE symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT, uri TEXT NOT NULL, name TEXT NOT NULL,
        clean_name TEXT DEFAULT '', clean_stem TEXT DEFAULT '', symbol_kind INTEGER NOT NULL,
        label TEXT NOT NULL, description TEXT, detail TEXT,
        range_start_line INTEGER DEFAULT 0, range_start_char INTEGER DEFAULT 0,
        range_end_line INTEGER DEFAULT 0, range_end_char INTEGER DEFAULT 0)`);
      legacy.run(
        "INSERT INTO symbols (uri, name, clean_name, clean_stem, symbol_kind, label) VALUES (?, ?, ?, ?, ?, ?)",
        ["file:///workspace/src/User.ts", "save", "save", "save", 5, "save"]
      );
      fs.writeFileSync(dbFile, Buffer.from(legacy.export()));
      legacy.close();
    };

    it("should empty a version-0 database on open", async () => {
      const logStub = sinon.stub(logger, "log");
      try {
        database.closeDatabase();
        await writeVersion0Database();
        database.setSeededFromTemplate(true);

        await database.initDatabase(fakeContext);

        assert.isTrue(database.isEmpty());
        assert.isFalse(database.wasSeededFromTemplate());
        database.insertSymbol({ ...item1, containerName: "Outer.Inner" });
        assert.equal(database.getCount(), 1);
      } finally {
        logStub.restore();
      }
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
  });

  describe("deleteByUriPrefix", () => {
    it("should delete symbols matching uri prefix for directory removal", () => {
      database.insertSymbolsBatch([item1, item2, item3]);
      database.deleteByUriPrefix(vscode.Uri.file("/workspace/src/models").toString());
      assert.equal(database.getCount(), 2);
      const results = database.search("User");
      assert.equal(results.length, 2);
      assert.isTrue(results.every((r) => !r.uri.toString().includes("/workspace/src/models")));
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

  describe("worktree shared cache helpers", () => {
    it("should allow getting and setting wasSeededFromTemplate flag", () => {
      assert.isFalse(database.wasSeededFromTemplate());
      database.setSeededFromTemplate(true);
      assert.isTrue(database.wasSeededFromTemplate());
      database.setSeededFromTemplate(false);
      assert.isFalse(database.wasSeededFromTemplate());
    });

    it("should execute clearSharedCache safely without throwing", () => {
      assert.doesNotThrow(() => {
        database.clearSharedCache();
      });
    });
  });

  describe("search with fileUri", () => {
    const fileItem: QuickPickItem = {
      uri: vscode.Uri.file("/workspace/src/UserController.ts"),
      symbolKind: vscode.SymbolKind.File,
      label: "$(symbol-file) UserController.ts",
      description: "src/UserController.ts",
      detail: "src/UserController.ts",
      range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
    };
    const method1: QuickPickItem = {
      uri: vscode.Uri.file("/workspace/src/UserController.ts"),
      symbolKind: vscode.SymbolKind.Method,
      label: "$(symbol-method) getUser",
      description: "src/UserController.ts",
      detail: "getUser(): void",
      range: new vscode.Range(new vscode.Position(15, 0), new vscode.Position(18, 0)),
    };
    const method2: QuickPickItem = {
      uri: vscode.Uri.file("/workspace/src/UserController.ts"),
      symbolKind: vscode.SymbolKind.Method,
      label: "$(symbol-method) createUser",
      description: "src/UserController.ts",
      detail: "createUser(): void",
      range: new vscode.Range(new vscode.Position(20, 0), new vscode.Position(25, 0)),
    };

    it("should filter symbols scoped to given fileUri and exclude file itself", () => {
      database.insertSymbolsBatch([fileItem, item1, method1, method2, item2]);
      const results = database.search("", 100, {
        fileUri: vscode.Uri.file("/workspace/src/UserController.ts").toString(),
      });
      assert.equal(results.length, 3);
      assert.isFalse(results.some((r) => r.symbolKind === vscode.SymbolKind.File));
      assert.isFalse(results.some((r) => r.uri.toString().includes("UserService.ts")));
      assert.equal(results[0].label, item1.label);
      assert.equal(results[1].label, method1.label);
      assert.equal(results[2].label, method2.label);
    });

    it("should search matching query within fileUri", () => {
      database.insertSymbolsBatch([fileItem, item1, method1, method2, item2]);
      const results = database.search("create", 100, {
        fileUri: vscode.Uri.file("/workspace/src/UserController.ts").toString(),
      });
      assert.equal(results.length, 1);
      assert.equal(results[0].label, method2.label);
    });

    it("should match fileUri case-insensitively or by path", () => {
      database.insertSymbolsBatch([fileItem, item1, method1, method2, item2]);
      const results = database.search("", 100, {
        fileUri: vscode.Uri.file("/workspace/src/usercontroller.ts").toString(),
      });
      assert.equal(results.length, 3);
    });
  });
});

