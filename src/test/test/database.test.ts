import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { dataConverter } from "../../dataConverter";
import * as config from "../../config";
import { database, RecentKey } from "../../database";
import { logger } from "../../logger";
import { QuickPickItem } from "../../types";
import {
  DIRTY_PATHS,
  FINGERPRINT,
  getPersistenceTestSetups,
  HEAD_COMMIT,
} from "../testSetup/database.testSetup";
import { flattenSymbols, loadSymbolFixture } from "../util/symbolFixtures";

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
      const results = database.search("", 500, { symbolKinds: [vscode.SymbolKind.Class] });
      assert.equal(results.length, 2);
      assert.isTrue(results.every((r) => r.symbolKind === vscode.SymbolKind.Class));
    });

    it("should restrict results to a list of symbol kinds", () => {
      const results = database.search("", 500, {
        symbolKinds: [vscode.SymbolKind.Interface, vscode.SymbolKind.Class],
      });
      assert.equal(results.length, 3);

      const interfaces = database.search("", 500, {
        symbolKinds: [vscode.SymbolKind.Interface, vscode.SymbolKind.Struct],
      });
      assert.deepEqual(
        interfaces.map((r) => r.label),
        ["$(symbol-interface) User"]
      );
    });

    it("should cache searches for different kind lists separately", () => {
      const classes = database.search("User", 500, {
        symbolKinds: [vscode.SymbolKind.Class],
      });
      const interfaces = database.search("User", 500, {
        symbolKinds: [vscode.SymbolKind.Interface],
      });
      const both = database.search("User", 500, {
        symbolKinds: [vscode.SymbolKind.Interface, vscode.SymbolKind.Class],
      });
      const bothReordered = database.search("User", 500, {
        symbolKinds: [vscode.SymbolKind.Class, vscode.SymbolKind.Interface],
      });
      assert.equal(classes.length, 2);
      assert.equal(interfaces.length, 1);
      assert.equal(both.length, 3);
      assert.strictEqual(bothReordered, both);
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

    it("should escape %, _ and backslash in like patterns", () => {
      assert.equal(database.escapeLike("a_b%"), "a\\_b\\%");
      assert.equal(database.escapeLike("c:\\dir"), "c:\\\\dir");
      assert.equal(database.escapeLike("plain"), "plain");
    });

    it("should treat _ in a query as a literal character", () => {
      const symbol = (name: string): QuickPickItem => ({
        uri: vscode.Uri.file(`/workspace/src/${name}.ts`),
        symbolKind: vscode.SymbolKind.Variable,
        label: `$(symbol-variable) ${name}`,
      });
      database.clearAll();
      database.insertSymbolsBatch([symbol("Item_1234"), symbol("Item11234")]);

      const results = database.search("Item_1234").map((r) => r.label);
      assert.include(results, "$(symbol-variable) Item_1234");
      assert.notInclude(results, "$(symbol-variable) Item11234");
    });

    it("should treat % in a query as a literal character", () => {
      const percent: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/progress.ts"),
        symbolKind: vscode.SymbolKind.Constant,
        label: "$(symbol-constant) 100%",
      };
      database.insertSymbol(percent);

      const results = database.search("%");
      assert.deepEqual(
        results.map((r) => r.label),
        ["$(symbol-constant) 100%"]
      );
    });

    it("should treat _ in ignoredNames as a literal character", () => {
      const underscored: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/user_model.ts"),
        symbolKind: vscode.SymbolKind.Class,
        label: "$(symbol-class) User_Model",
      };
      const plain: QuickPickItem = {
        uri: vscode.Uri.file("/workspace/src/UserXModel.ts"),
        symbolKind: vscode.SymbolKind.Class,
        label: "$(symbol-class) UserXModel",
      };
      database.insertSymbolsBatch([underscored, plain]);

      const results = database
        .search("", 500, { ignoredNames: ["User_Model"] })
        .map((r) => r.label);
      assert.notInclude(results, underscored.label);
      assert.include(results, plain.label);
    });

    it("should parse words and * gaps into pattern queries", () => {
      assert.deepEqual(database.parsePatternQuery("user impl"), {
        words: ["user", "impl"],
        joined: "userimpl",
      });
      assert.deepEqual(database.parsePatternQuery("User*Impl"), {
        words: ["user%impl"],
        joined: "userimpl",
      });
      assert.deepEqual(database.parsePatternQuery("  get_user  *  svc* "), {
        words: ["getuser", "svc"],
        joined: "getusersvc",
      });
      assert.deepEqual(database.parsePatternQuery("100% done"), {
        words: ["100\\%", "done"],
        joined: "100%done",
      });
      assert.deepEqual(database.parsePatternQuery("*"), { words: [], joined: "" });
    });

    it("should not treat a single word or a path query as a pattern query", () => {
      assert.isUndefined(database.parsePatternQuery(""));
      assert.isUndefined(database.parsePatternQuery("UserService"));
      assert.isUndefined(database.parsePatternQuery("UserService "));
      assert.isUndefined(database.parsePatternQuery("src/user service"));
      assert.isUndefined(database.parsePatternQuery("src/User*"));
    });

    describe("pattern queries", () => {
      const symbol = (name: string, kind = vscode.SymbolKind.Class): QuickPickItem => ({
        uri: vscode.Uri.file(`/workspace/src/${name}.ts`),
        symbolKind: kind,
        label: `$(symbol-class) ${name}`,
      });
      const labels = (results: QuickPickItem[]) => results.map((r) => r.label);

      it("should match words in any order", () => {
        database.insertSymbol(symbol("UserServiceImpl"));

        assert.include(labels(database.search("impl user")), "$(symbol-class) UserServiceImpl");
        assert.include(labels(database.search("service impl")), "$(symbol-class) UserServiceImpl");
      });

      it("should require every word to match", () => {
        database.insertSymbol(symbol("UserServiceImpl"));

        const results = labels(database.search("user repository"));
        assert.notInclude(results, "$(symbol-class) UserServiceImpl");
        assert.notInclude(results, "$(symbol-class) UserService");
      });

      it("should treat * as an ordered gap", () => {
        database.insertSymbol(symbol("UserServiceImpl"));

        assert.include(labels(database.search("user*impl")), "$(symbol-class) UserServiceImpl");
        assert.notInclude(labels(database.search("impl*user")), "$(symbol-class) UserServiceImpl");
      });

      it("should rank exact, anchored, ordered, then any-order matches", () => {
        database.clearAll();
        database.insertSymbolsBatch([
          symbol("ImplOfUser"),
          symbol("AdminUserImpl"),
          symbol("UserServiceImpl"),
          symbol("UserImpl"),
        ]);

        assert.deepEqual(labels(database.search("user impl")), [
          "$(symbol-class) UserImpl",
          "$(symbol-class) UserServiceImpl",
          "$(symbol-class) AdminUserImpl",
          "$(symbol-class) ImplOfUser",
        ]);
      });

      it("should fall back to subsequence matching for pattern queries", () => {
        assert.deepEqual(labels(database.search("user ctrl")), [
          "$(symbol-class) UserController",
        ]);
      });

      it("should list everything for a query of only *", () => {
        assert.equal(database.search("*").length, 3);
        assert.equal(database.search(" * ").length, 3);
      });

      it("should apply symbolKind and fileUri filters to pattern matches", () => {
        const method = (file: string): QuickPickItem => ({
          uri: vscode.Uri.file(`/workspace/src/${file}`),
          symbolKind: vscode.SymbolKind.Method,
          label: "$(symbol-method) getUserService",
        });
        database.insertSymbolsBatch([method("a.ts"), method("b.ts")]);

        const classes = database.search("user service", 500, {
          symbolKinds: [vscode.SymbolKind.Class],
        });
        assert.deepEqual(labels(classes), ["$(symbol-class) UserService"]);

        const inFile = database.search("user service", 500, { fileUri: "/workspace/src/a.ts" });
        assert.equal(inFile.length, 1);
        assert.equal(inFile[0].uri.path, "/workspace/src/a.ts");
      });
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
          symbolKinds: [vscode.SymbolKind.Property],
        });
        assert.deepEqual(byKind.map(keyOf), [keyOf(prop)]);

        const byFile = database.search("UserService.save", 500, {
          fileUri: "/workspace/src/Impl.ts",
        });
        assert.deepEqual(byFile.map(keyOf), [keyOf(chainSave)]);
      });

      describe("path queries", () => {
        const fileItem = (path: string): QuickPickItem => ({
          uri: vscode.Uri.file(path),
          symbolKind: 0,
          label: `$(file) ${path.slice(path.lastIndexOf("/") + 1)}`,
        });
        const modelsUser = fileItem("/workspace/src/models/User.ts");
        const modelsUserProfile = fileItem("/workspace/src/models/UserProfile.ts");
        const libUser = fileItem("/workspace/lib/User.ts");
        const libFind = member("find", "User", "/workspace/lib/User.ts", 2);

        beforeEach(() => {
          database.insertSymbolsBatch([modelsUser, modelsUserProfile, libUser, libFind]);
        });

        it("should split a path query at the last slash", () => {
          assert.deepEqual(database.splitPathQuery("src/models/User"), {
            dir: "src/models",
            leaf: "User",
          });
          assert.deepEqual(database.splitPathQuery("src/"), { dir: "src", leaf: "" });
        });

        it("should match the leaf name inside the directory for path queries", () => {
          const results = database.search("src/models/User").map(keyOf);
          assert.equal(results[0], keyOf(modelsUser));
          assert.isAbove(results.indexOf(keyOf(modelsUserProfile)), 0);
          assert.notInclude(results, keyOf(libUser));
        });

        it("should match a qualified leaf inside the directory for path queries", () => {
          const results = database.search("models/User.find").map(keyOf);
          assert.equal(results[0], keyOf(find));
          assert.notInclude(results, keyOf(libFind));
        });

        it("should fall back to uri substring for path queries", () => {
          const emptyLeaf = database.search("src/models/").map(keyOf);
          assert.include(emptyLeaf, keyOf(modelsUser));
          assert.include(emptyLeaf, keyOf(find));
          assert.notInclude(emptyLeaf, keyOf(libUser));

          const noLeafMatch = database.search("workspace/src/Outer").map(keyOf);
          assert.include(noLeafMatch, keyOf(innerRun));
          assert.include(noLeafMatch, keyOf(outerRun));
        });
      });
    });
  });

  describe("CamelHumps", () => {
    const symbol = (name: string, kind = vscode.SymbolKind.Class): QuickPickItem => ({
      uri: vscode.Uri.file(`/workspace/src/${name}.ts`),
      symbolKind: kind,
      label: `$(symbol-class) ${name}`,
    });
    const file = (name: string): QuickPickItem => ({
      uri: vscode.Uri.file(`/workspace/src/${name}`),
      symbolKind: vscode.SymbolKind.File,
      label: `$(symbol-file) ${name}`,
    });
    const labels = (results: QuickPickItem[]) => results.map((r) => r.label);
    const words = (name: string, kind?: number) => [
      database.extractCleanWords(name, kind),
      database.extractCleanInitials(name, kind),
    ];

    it("should split names into words at case, digit and separator boundaries", () => {
      assert.deepEqual(database.splitWords("UserServiceImpl"), ["User", "Service", "Impl"]);
      assert.deepEqual(database.splitWords("MAX_VALUE"), ["MAX", "VALUE"]);
      assert.deepEqual(database.splitWords("user-service"), ["user", "service"]);
      assert.deepEqual(database.splitWords("__init__"), ["init"]);
      assert.deepEqual(words("UserServiceImpl"), [" user service impl", "usi"]);
      assert.deepEqual(words("MAX_VALUE"), [" max value", "mv"]);
      assert.deepEqual(words("Item_1234_ServiceHandler42"), [
        " item 1234 service handler 42",
        "i1sh4",
      ]);
      assert.deepEqual(words("__init__"), [" init", "i"]);
      assert.deepEqual(database.splitWords("ÄrgerÖl"), ["Ärger", "Öl"]);
      assert.deepEqual(database.splitWords("数据Service"), ["数据", "Service"]);
    });

    it("should split a capital run before its last capital when a lowercase letter follows", () => {
      assert.deepEqual(words("HTTPServer"), [" http server", "hs"]);
      assert.deepEqual(words("getHTTPResponse"), [" get http response", "ghr"]);
      assert.deepEqual(words("XMLHttpRequest"), [" xml http request", "xhr"]);
      assert.deepEqual(database.splitWords("parseUSI"), ["parse", "USI"]);
    });

    it("should split files on their stem and drop the extension", () => {
      assert.deepEqual(words("user-service.ts", vscode.SymbolKind.File), [" user service", "us"]);
      assert.deepEqual(words("user.service.ts", vscode.SymbolKind.File), [" user service", "us"]);
      assert.deepEqual(words("user.service", vscode.SymbolKind.Method), [" user service", "us"]);
      assert.deepEqual(words(".gitignore", vscode.SymbolKind.File), [" gitignore", "g"]);
    });

    it("should store empty words and initials for a name without letters or digits", () => {
      assert.deepEqual(words("$"), ["", ""]);
      assert.deepEqual(words(""), ["", ""]);
    });

    it("should parse an all-lowercase query of two or more characters as an initials query", () => {
      for (const query of ["usi", "npe", "i1s"]) {
        assert.deepEqual(database.parseCamelHumpsQuery(query), {
          kind: "initials",
          initials: query,
        });
      }
    });

    it("should not parse single characters, digits only or mixed-case queries as initials", () => {
      for (const query of ["", "u", "12", "USI", "uSer", "max_v", "usi.x", "src/usi", "us i"]) {
        assert.notEqual(database.parseCamelHumpsQuery(query)?.kind, "initials");
      }
    });

    it("should find a name by the initials of its words", () => {
      database.insertSymbolsBatch([symbol("UserServiceImpl"), symbol("NullPointerException")]);

      assert.deepEqual(labels(database.search("usi")), ["$(symbol-class) UserServiceImpl"]);
      assert.deepEqual(labels(database.search("npe")), ["$(symbol-class) NullPointerException"]);
    });

    it("should rank an exact initials match above an initials prefix match", () => {
      database.insertSymbolsBatch([symbol("UserServiceImplFactory"), symbol("UserServiceImpl")]);
      database.insertSymbol(file("user-service-impl-factory.ts"));

      assert.deepEqual(labels(database.search("usi")), [
        "$(symbol-class) UserServiceImpl",
        "$(symbol-file) user-service-impl-factory.ts",
        "$(symbol-class) UserServiceImplFactory",
      ]);
    });

    it("should rank initials matches after prefix matches and before substring matches", () => {
      database.insertSymbolsBatch([
        symbol("BusinessService"),
        symbol("UserServiceImpl"),
        symbol("UsingResolver"),
      ]);

      assert.deepEqual(labels(database.search("usi")), [
        "$(symbol-class) UsingResolver",
        "$(symbol-class) UserServiceImpl",
        "$(symbol-class) BusinessService",
      ]);
    });

    it("should not repeat a stage-1 match in the initials results", () => {
      database.insertSymbolsBatch([symbol("UsiServiceImpl"), symbol("UserServiceImpl")]);

      assert.deepEqual(labels(database.search("usi")), [
        "$(symbol-class) UsiServiceImpl",
        "$(symbol-class) UserServiceImpl",
      ]);
    });

    it("should apply symbol kind and ignored-name filters to initials matches", () => {
      database.insertSymbolsBatch([
        symbol("UserServiceImpl"),
        symbol("UserSettingsItem", vscode.SymbolKind.Method),
        symbol("UnusedSecretInfo"),
      ]);

      assert.deepEqual(
        labels(database.search("usi", 500, { symbolKinds: [vscode.SymbolKind.Method] })),
        ["$(symbol-class) UserSettingsItem"]
      );
      const unignored = labels(database.search("usi", 500, { ignoredNames: ["Secret"] }));
      assert.include(unignored, "$(symbol-class) UserServiceImpl");
      assert.notInclude(unignored, "$(symbol-class) UnusedSecretInfo");
    });

    it("should parse a query with a capital after its first character as a words query", () => {
      assert.deepEqual(database.parseCamelHumpsQuery("uSerImp"), {
        kind: "words",
        patterns: [" u% ser% imp%"],
      });
      assert.deepEqual(database.parseCamelHumpsQuery("SerImp"), {
        kind: "words",
        patterns: [" ser% imp%"],
      });
      assert.deepEqual(database.parseCamelHumpsQuery("MV"), {
        kind: "words",
        patterns: [" m% v%", " mv%"],
      });
      for (const query of ["User", "usi", "item12", "U"]) {
        assert.notEqual(database.parseCamelHumpsQuery(query)?.kind, "words");
      }
    });

    it("should parse a lowercase query with _ or - between pieces as a words query", () => {
      assert.deepEqual(database.parseCamelHumpsQuery("max_v"), {
        kind: "words",
        patterns: [" max% v%"],
      });
      assert.deepEqual(database.parseCamelHumpsQuery("user-serv"), {
        kind: "words",
        patterns: [" user% serv%"],
      });
      assert.deepEqual(database.parseCamelHumpsQuery("MAX_V"), {
        kind: "words",
        patterns: [" m% a% x% v%", " max% v%"],
      });
      assert.isUndefined(database.parseCamelHumpsQuery("_max"));
    });

    it("should build a second reading that keeps a capital run together", () => {
      const patterns = (query: string) =>
        (database.parseCamelHumpsQuery(query) as { patterns: string[] }).patterns;

      assert.deepEqual(patterns("USI"), [" u% s% i%", " usi%"]);
      assert.deepEqual(patterns("USImpl"), [" u% s% impl%", " us% impl%"]);
      assert.deepEqual(patterns("HTTPSrv"), [" h% t% t% p% srv%", " http% srv%"]);
      assert.deepEqual(patterns("getHTTP"), [" get% h% t% t% p%", " get% http%"]);
      assert.deepEqual(patterns("uSerImp"), [" u% ser% imp%"]);
    });

    it("should not parse qualified, pattern or path queries as words queries", () => {
      for (const query of ["User.SerImp", "User#SerImp", "User::SerImp", "Ser Imp", "Ser*Imp", "src/SerImp"]) {
        assert.isUndefined(database.parseCamelHumpsQuery(query));
      }
    });

    it("should match each piece at the start of a word in order", () => {
      database.insertSymbolsBatch([symbol("UserServiceImpl"), symbol("NullPointerException")]);

      assert.deepEqual(labels(database.search("uSerImp")), ["$(symbol-class) UserServiceImpl"]);
      assert.deepEqual(labels(database.search("USImpl")), ["$(symbol-class) UserServiceImpl"]);
      assert.deepEqual(labels(database.search("NPE")), ["$(symbol-class) NullPointerException"]);
      assert.notInclude(labels(database.search("SerUImp")), "$(symbol-class) UserServiceImpl");
    });

    it("should skip words between pieces", () => {
      database.insertSymbolsBatch([symbol("UImp"), symbol("UserServiceImpl"), symbol("MAX_VALUE"), symbol("remove")]);

      assert.deepEqual(labels(database.search("uImp")), [
        "$(symbol-class) UImp",
        "$(symbol-class) UserServiceImpl",
      ]);
      // "remove" still follows as a subsequence match, but not through the words stage.
      assert.deepEqual(labels(database.search("MV")), [
        "$(symbol-class) MAX_VALUE",
        "$(symbol-class) remove",
      ]);
      assert.deepEqual(labels(database.search("max_v")), ["$(symbol-class) MAX_VALUE"]);
    });

    it("should not match pieces that fall inside a word", () => {
      database.insertSymbolsBatch([symbol("SerImp"), symbol("UserxImportant"), symbol("UserServiceImpl")]);

      assert.deepEqual(labels(database.search("SerImp")), [
        "$(symbol-class) SerImp",
        "$(symbol-class) UserServiceImpl",
      ]);
    });

    it("should match an acronym through the capital-run reading", () => {
      database.insertSymbolsBatch([
        symbol("HTTPResp"),
        symbol("getHTTPAsyncResponse"),
        symbol("XMLHttpRequest"),
        symbol("parseUSIField"),
      ]);

      assert.deepEqual(labels(database.search("HTTPResp")), [
        "$(symbol-class) HTTPResp",
        "$(symbol-class) getHTTPAsyncResponse",
      ]);
      assert.deepEqual(labels(database.search("XHR")), ["$(symbol-class) XMLHttpRequest"]);
      assert.include(labels(database.search("USI")), "$(symbol-class) parseUSIField");
    });

    it("should rank matches from the first word above matches from a later word", () => {
      database.insertSymbolsBatch([symbol("UserServiceImpl"), symbol("SerializerImplementation")]);

      assert.deepEqual(labels(database.search("SerImp")), [
        "$(symbol-class) SerializerImplementation",
        "$(symbol-class) UserServiceImpl",
      ]);
    });

    it("should rank words matches after prefix matches and before substring matches", () => {
      database.insertSymbolsBatch([symbol("ParseUser"), symbol("UnusedService"), symbol("UserService")]);

      assert.deepEqual(labels(database.search("uSer")), [
        "$(symbol-class) UserService",
        "$(symbol-class) UnusedService",
        "$(symbol-class) ParseUser",
      ]);
    });

    it("should not run the words stage for a qualified query", () => {
      database.insertSymbolsBatch([symbol("UserServiceImpl")]);

      assert.notInclude(labels(database.search("Foo.SerImp")), "$(symbol-class) UserServiceImpl");
    });
  });

  describe("match bands", () => {
    const symbol = (
      name: string,
      file = `/workspace/src/${name}.ts`,
      containerName?: string,
      line = 0,
      kind: number = vscode.SymbolKind.Class
    ): QuickPickItem => ({
      uri: vscode.Uri.file(file),
      symbolKind: kind,
      label: `$(symbol-class) ${name}`,
      containerName,
      range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line + 1, 0)),
    });
    const file = (path: string): QuickPickItem => ({
      uri: vscode.Uri.file(path),
      symbolKind: vscode.SymbolKind.File,
      label: `$(file) ${path.slice(path.lastIndexOf("/") + 1)}`,
    });
    const bandsOf = (results: QuickPickItem[]) =>
      Object.fromEntries(results.map((r) => [r.label.replace(/^\$\([^)]*\)\s*/, ""), r.matchBand]));
    const assertNonDecreasingBands = (query: string) => {
      const results = database.search(query);
      assert.isNotEmpty(results, query);
      for (let i = 0; i < results.length; i++) {
        assert.isDefined(results[i].matchBand, `${query}: ${results[i].label}`);
        if (i > 0) {
          assert.isAtLeast(results[i].matchBand!, results[i - 1].matchBand!, `${query}: ${results[i].label}`);
        }
      }
    };

    const save = symbol("save", "/workspace/src/UserService.ts", "UserService", 6, vscode.SymbolKind.Method);
    const saveAll = symbol("saveAll", "/workspace/src/UserService.ts", "UserService", 8, vscode.SymbolKind.Method);
    const chainSave = symbol("save", "/workspace/src/Impl.ts", "UserServiceImpl.Helper", 4, vscode.SymbolKind.Method);
    const find = symbol("find", "/workspace/src/models/User.ts", "User", 2, vscode.SymbolKind.Method);

    beforeEach(() => {
      database.insertSymbolsBatch([
        symbol("Handler"),
        symbol("HandlerFactory"),
        symbol("myhandlerx"),
        symbol("UserServiceImpl"),
        symbol("userservice"),
        symbol("MyUserService"),
        symbol("ServiceUser"),
        save,
        saveAll,
        chainSave,
        find,
        file("/workspace/src/models/User.ts"),
        file("/workspace/src/models/UserProfile.ts"),
        file("/workspace/src/user.service.ts"),
      ]);
    });

    it("should tag exact, prefix, substring and fuzzy matches with bands 1 to 4", () => {
      const handler = bandsOf(database.search("handler"));
      assert.equal(handler["Handler"], 1);
      assert.equal(handler["HandlerFactory"], 2);
      assert.equal(handler["myhandlerx"], 3);
      assert.equal(bandsOf(database.search("hndlr"))["Handler"], 4);
      assert.equal(bandsOf(database.search("usi"))["UserServiceImpl"], 2);
      assert.equal(bandsOf(database.search("ServImpl"))["UserServiceImpl"], 3);
    });

    it("should tag qualified members with bands 1 and 2", () => {
      const results = database.search("UserService.save");
      const bandOf = (item: QuickPickItem) =>
        results.find(
          (r) => r.uri.path === item.uri.path && r.range?.start.line === item.range?.start.line
        )?.matchBand;
      assert.equal(bandOf(save), 1);
      assert.equal(bandOf(saveAll), 2);
      assert.equal(bandOf(chainSave), 2);
      assert.equal(bandsOf(database.search("user.service.ts"))["user.service.ts"], 1);
    });

    it("should tag pattern matches by their tier", () => {
      const results = bandsOf(database.search("user service"));
      assert.equal(results["userservice"], 1);
      assert.equal(results["UserServiceImpl"], 2);
      assert.equal(results["MyUserService"], 3);
      assert.equal(results["ServiceUser"], 3);
      assert.equal(bandsOf(database.search("usr svc"))["userservice"], 4);
    });

    it("should tag path query matches by leaf match", () => {
      const leaf = bandsOf(database.search("src/models/User"));
      assert.equal(leaf["User.ts"], 1);
      assert.equal(leaf["UserProfile.ts"], 2);
      assert.equal(leaf["find"], 3);
      assert.equal(bandsOf(database.search("models/User.find"))["find"], 2);
      assert.equal(bandsOf(database.search("src/models/"))["find"], 3);
    });

    it("should tag empty query listings with band 3", () => {
      assert.isTrue(database.search("").every((r) => r.matchBand === 3));
    });

    it("should return plain query results in non-decreasing band order", () => {
      for (const query of ["handler", "hndlr", "usi", "us", "ServImpl", "user", "save"]) {
        assertNonDecreasingBands(query);
      }
    });

    it("should return qualified query results in non-decreasing band order", () => {
      for (const query of ["UserService.save", "UserService.", "user.service.ts", "User.find"]) {
        assertNonDecreasingBands(query);
      }
    });

    it("should return pattern query results in non-decreasing band order", () => {
      for (const query of ["user service", "service user", "usr svc", "user*impl"]) {
        assertNonDecreasingBands(query);
      }
    });

    it("should return path query results in non-decreasing band order", () => {
      for (const query of ["src/models/User", "models/User.find", "src/models/", "workspace/src"]) {
        assertNonDecreasingBands(query);
      }
    });
  });

  describe("recent ranking", () => {
    const sym = (
      name: string,
      file: string,
      kind: number = vscode.SymbolKind.Function,
      line = 0,
      containerName?: string
    ): QuickPickItem => ({
      uri: vscode.Uri.file(file),
      symbolKind: kind,
      label: `$(symbol-function) ${name}`,
      containerName,
      range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line + 1, 0)),
    });
    const fileItem = (path: string): QuickPickItem => ({
      uri: vscode.Uri.file(path),
      symbolKind: vscode.SymbolKind.File,
      label: `$(file) ${path.slice(path.lastIndexOf("/") + 1)}`,
    });
    const keyFor = (item: QuickPickItem): RecentKey => ({
      uri: item.uri.toString(),
      symbolKind: item.symbolKind,
      name: database.extractName(item.label),
    });
    const id = (item: QuickPickItem) => `${item.uri.path}:${item.range?.start.line ?? 0}`;
    const ids = (results: QuickPickItem[]) => results.map(id);

    const aIndex = fileItem("/workspace/a/index.ts");
    const bIndex = fileItem("/workspace/b/index.ts");
    const cIndex = fileItem("/workspace/c/index.ts");

    it("should return a recently used item before other items of the same band", () => {
      database.insertSymbolsBatch([aIndex, bIndex, cIndex]);
      const main = ids(database.search("index"));
      const boosted = ids(database.search("index", 500, { recent: [keyFor(bIndex)] }));
      assert.deepEqual(boosted, [id(bIndex), ...main.filter((it) => it !== id(bIndex))]);
    });

    it("should keep an exact match above a recently used prefix match", () => {
      const user = fileItem("/workspace/src/user.ts");
      const impl = fileItem("/workspace/src/UserServiceImpl.ts");
      database.insertSymbolsBatch([
        user,
        fileItem("/workspace/src/users.ts"),
        fileItem("/workspace/src/userApi.ts"),
        impl,
      ]);
      const results = ids(database.search("user", 500, { recent: [keyFor(impl)] }));
      assert.deepEqual(results.slice(0, 2), [id(user), id(impl)]);
    });

    it("should order several recently used items by recency within a band", () => {
      database.insertSymbolsBatch([aIndex, bIndex, cIndex]);
      const results = database.search("index", 500, {
        recent: [keyFor(cIndex), keyFor(aIndex)],
      });
      assert.deepEqual(ids(results), [id(cIndex), id(aIndex), id(bIndex)]);
    });

    it("should include a recently used match the result limit would cut off", () => {
      const user = fileItem("/workspace/src/user.ts");
      const impl = fileItem("/workspace/src/UserServiceImpl.ts");
      database.insertSymbolsBatch([
        user,
        fileItem("/workspace/src/users.ts"),
        fileItem("/workspace/src/userA.ts"),
        fileItem("/workspace/src/userApi.ts"),
        impl,
      ]);
      assert.notInclude(ids(database.search("user", 3)), id(impl));

      const results = ids(database.search("user", 3, { recent: [keyFor(impl)] }));
      assert.deepEqual(results.slice(0, 2), [id(user), id(impl)]);
      assert.lengthOf(results, 3);
    });

    it("should include a recently used substring match after the substring cap", () => {
      const handler = fileItem("/workspace/src/handler.ts");
      const requestHandler = sym("requestHandler", "/workspace/src/request.ts");
      const fillers = Array.from({ length: 60 }, (_, i) =>
        sym(`ahandler${i}`, `/workspace/src/fill${i}.ts`)
      );
      database.insertSymbolsBatch([handler, requestHandler, ...fillers]);
      assert.notInclude(ids(database.search("handler")), id(requestHandler));

      const results = database.search("handler", 500, { recent: [keyFor(requestHandler)] });
      assert.deepEqual(ids(results).slice(0, 2), [id(handler), id(requestHandler)]);
      assert.equal(results[1].matchBand, 3);
    });

    it("should not pull in a recently used item that only matches by subsequence", () => {
      const rmv = fileItem("/workspace/src/rmv.ts");
      const remove = sym("remove", "/workspace/src/list.ts");
      database.insertSymbolsBatch([rmv, remove]);
      const results = database.search("rmv", 500, { recent: [keyFor(remove)] });
      assert.deepEqual(ids(results), [id(rmv)]);
    });

    it("should reorder a recently used fuzzy match the main search already returned", () => {
      const remove = sym("remove", "/workspace/src/list.ts", vscode.SymbolKind.Function, 1);
      const removeAll = sym("removeAll", "/workspace/src/list.ts", vscode.SymbolKind.Function, 5);
      database.insertSymbolsBatch([remove, removeAll]);
      assert.deepEqual(ids(database.search("rmv")), [id(remove), id(removeAll)]);

      const results = database.search("rmv", 500, { recent: [keyFor(removeAll)] });
      assert.deepEqual(ids(results), [id(removeAll), id(remove)]);
    });

    it("should match recent items by uri, kind and name regardless of line", () => {
      const runA1 = sym("run", "/workspace/src/z.ts", vscode.SymbolKind.Function, 3);
      const runA2 = sym("run", "/workspace/src/z.ts", vscode.SymbolKind.Function, 9);
      const runB = sym("run", "/workspace/src/a.ts", vscode.SymbolKind.Function, 1);
      database.insertSymbolsBatch([runB, runA1, runA2]);
      const movedKey = keyFor(sym("run", "/workspace/src/z.ts", vscode.SymbolKind.Function, 40));

      const results = ids(database.search("run", 500, { recent: [movedKey] }));
      assert.sameMembers(results.slice(0, 2), [id(runA1), id(runA2)]);
      assert.equal(results[2], id(runB));
    });

    it("should boost recently used members in qualified, pattern and path queries", () => {
      const find = sym("find", "/workspace/src/UserService.ts", vscode.SymbolKind.Method, 2, "UserService");
      const filter = sym("filter", "/workspace/src/UserService.ts", vscode.SymbolKind.Method, 6, "UserService");
      const api = sym("UserServiceApi", "/workspace/src/api.ts", vscode.SymbolKind.Class);
      const impl = sym("UserServiceImpl", "/workspace/src/impl.ts", vscode.SymbolKind.Class);
      const modelsUser = fileItem("/workspace/src/models/User.ts");
      const userA = fileItem("/workspace/src/models/UserA.ts");
      const profile = fileItem("/workspace/src/models/UserProfile.ts");
      database.insertSymbolsBatch([find, filter, api, impl, modelsUser, userA, profile]);

      assert.deepEqual(ids(database.search("UserService.f")).slice(0, 2), [id(find), id(filter)]);
      assert.deepEqual(
        ids(database.search("UserService.f", 500, { recent: [keyFor(filter)] })).slice(0, 2),
        [id(filter), id(find)]
      );

      assert.deepEqual(ids(database.search("user service")).slice(0, 2), [id(api), id(impl)]);
      assert.deepEqual(
        ids(database.search("user service", 500, { recent: [keyFor(impl)] })).slice(0, 2),
        [id(impl), id(api)]
      );

      assert.deepEqual(ids(database.search("src/models/User")).slice(0, 3), [
        id(modelsUser),
        id(userA),
        id(profile),
      ]);
      assert.deepEqual(
        ids(database.search("src/models/User", 500, { recent: [keyFor(profile)] })).slice(0, 3),
        [id(modelsUser), id(profile), id(userA)]
      );
    });

    it("should apply symbol kind and file scope filters to recently used items", () => {
      const impl = sym("UserServiceImpl", "/workspace/src/impl.ts", vscode.SymbolKind.Class);
      const userFn = sym("user", "/workspace/src/fn.ts");
      const runA = sym("run", "/workspace/src/a.ts", vscode.SymbolKind.Function, 1);
      const runB = sym("run", "/workspace/src/b.ts", vscode.SymbolKind.Function, 1);
      database.insertSymbolsBatch([impl, userFn, runA, runB]);

      const byKind = database.search("user", 500, {
        symbolKinds: [vscode.SymbolKind.Function],
        recent: [keyFor(impl)],
      });
      assert.deepEqual(ids(byKind), [id(userFn)]);

      const byFile = database.search("run", 500, {
        fileUri: "/workspace/src/b.ts",
        recent: [keyFor(runA)],
      });
      assert.deepEqual(ids(byFile), [id(runB)]);
    });

    it("should not exceed the limit after pulling in recent items", () => {
      const recent = Array.from({ length: 6 }, (_, i) =>
        fileItem(`/workspace/src/userLongRecentName${i}.ts`)
      );
      database.insertSymbolsBatch([
        fileItem("/workspace/src/user.ts"),
        fileItem("/workspace/src/users.ts"),
        fileItem("/workspace/src/userA.ts"),
        ...recent,
      ]);
      const results = database.search("user", 4, { recent: recent.map(keyFor) });
      assert.lengthOf(results, 4);
      assert.deepEqual(ids(results).slice(1), recent.slice(0, 3).map(id));
    });

    it("should return the cached result unchanged when no recent items are given", () => {
      database.insertSymbolsBatch([aIndex, bIndex, cIndex]);
      const main = database.search("index");
      assert.strictEqual(database.search("index", 500, { recent: [] }), main);
      assert.strictEqual(database.search("index", 500, {}), main);
    });

    it("should not modify the cached main result when boosting", () => {
      database.insertSymbolsBatch([aIndex, bIndex, cIndex]);
      const main = database.search("index");
      const before = ids(main);
      const last = main[main.length - 1];

      const boosted = database.search("index", 500, { recent: [keyFor(last)] });
      assert.notStrictEqual(boosted, main);
      assert.equal(id(boosted[0]), id(last));
      assert.deepEqual(ids(main), before);
      assert.strictEqual(database.search("index"), main);
    });

    it("should reflect a changed recent list without clearing the search cache", () => {
      database.insertSymbolsBatch([aIndex, bIndex, cIndex]);
      const main = database.search("index");
      assert.equal(id(database.search("index", 500, { recent: [keyFor(bIndex)] })[0]), id(bIndex));
      assert.equal(id(database.search("index", 500, { recent: [keyFor(cIndex)] })[0]), id(cIndex));
      assert.equal(id(database.search("index", 500, { recent: [keyFor(bIndex)] })[0]), id(bIndex));
      assert.strictEqual(database.search("index"), main);
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

  describe("Go symbols", () => {
    const serverGo = vscode.Uri.file("/workspace/server.go");
    const nameOf = (item: QuickPickItem) => database.extractName(item.label);

    beforeEach(() => {
      database.insertSymbolsBatch(
        dataConverter.convertUriAndSymbolsToQpItems(
          serverGo,
          flattenSymbols(loadSymbolFixture("gopls-server.json"))
        )
      );
    });

    it("should find a Go method by Type.method", () => {
      const [first] = database.search("Server.Start");
      assert.equal(nameOf(first), "Start");
      assert.equal(first.description, "(*Server) · method");
    });

    it("should list Go methods with Type.", () => {
      const members = database
        .search("Config.")
        .map((item) => `${nameOf(item)} ${item.symbolKind}`);
      assert.includeMembers(members, [
        `Validate ${vscode.SymbolKind.Method}`,
        `Admin ${vscode.SymbolKind.Field}`,
        `Port ${vscode.SymbolKind.Field}`,
      ]);
    });
  });

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

    const writeVersion2Database = async (
      version = 2,
      rows: [string, string, number][] = [
        ["file:///workspace/server.go", "(*Server).Start", 5],
        ["file:///workspace/server.go", "server.go", 0],
      ]
    ) => {
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs({
        locateFile: () =>
          path.join(fakeContext.extensionPath, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
      });
      const legacy = new SQL.Database();
      legacy.run(`CREATE TABLE symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT, uri TEXT NOT NULL, name TEXT NOT NULL,
        clean_name TEXT DEFAULT '', clean_stem TEXT DEFAULT '', clean_container TEXT DEFAULT '',
        clean_words TEXT DEFAULT '', clean_initials TEXT DEFAULT '',
        symbol_kind INTEGER NOT NULL, label TEXT NOT NULL, description TEXT, detail TEXT,
        range_start_line INTEGER DEFAULT 0, range_start_char INTEGER DEFAULT 0,
        range_end_line INTEGER DEFAULT 0, range_end_char INTEGER DEFAULT 0
        ${version >= 4 ? ", is_secondary INTEGER DEFAULT 0" : ""})`);
      for (const [uri, name, kind] of rows) {
        legacy.run(
          "INSERT INTO symbols (uri, name, clean_name, clean_stem, symbol_kind, label, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [uri, name, database.extractCleanName(name as string),
            database.extractCleanStem(name as string), kind, name, kind === 0 ? "file" : "method"]
        );
      }
      legacy.run(`PRAGMA user_version = ${version}`);
      fs.writeFileSync(dbFile, Buffer.from(legacy.export()));
      legacy.close();
    };

    const reopenVersion2Database = async () => {
      database.closeDatabase();
      await writeVersion2Database();
      await database.initDatabase(fakeContext);
    };

    const readSchemaVersion = async () => {
      database.closeDatabase();
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs({
        locateFile: () =>
          path.join(fakeContext.extensionPath, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
      });
      const saved = new SQL.Database(fs.readFileSync(dbFile));
      const version = saved.exec("PRAGMA user_version")[0].values[0][0];
      saved.close();
      await database.initDatabase(fakeContext);
      return version;
    };

    it("should clear a version 2 index on open", async () => {
      const logStub = sinon.stub(logger, "log");
      try {
        database.setSeededFromTemplate(true);
        await reopenVersion2Database();

        assert.isTrue(database.isEmpty());
        assert.isFalse(database.wasSeededFromTemplate());
        assert.isTrue(
          logStub.calledWith("Index schema upgraded; the workspace will be reindexed.")
        );
      } finally {
        logStub.restore();
        database.setSeededFromTemplate(false);
      }
    });

    it("should backfill is_secondary when opening a version 3 index", async () => {
      database.closeDatabase();
      await writeVersion2Database(3, [
        ["file:///workspace/server_test.go", "server_test.go", 0],
        ["file:///workspace/server.go", "server.go", 0],
      ]);
      await database.initDatabase(fakeContext);

      assert.equal(database.getCount(), 2);
      assert.deepEqual(
        database.search("server").map((item) => `${item.label} ${item.description}`),
        ["server.go file", "server_test.go file · test"]
      );
    });

    it("should set the schema version to 6 after migrating", async () => {
      const logStub = sinon.stub(logger, "log");
      try {
        await reopenVersion2Database();

        assert.equal(await readSchemaVersion(), 6);
      } finally {
        logStub.restore();
      }
    });

    it("should create file_state when migrating to schema 5 without deleting symbols", async () => {
      database.closeDatabase();
      await writeVersion2Database(4);
      await database.initDatabase(fakeContext);

      assert.equal(database.getCount(), 2);
      assert.equal(database.getFileStates().size, 0);
      database.upsertFileStates([["file:///workspace/server.go", { mtime: 1, size: 2 }]]);
      assert.deepEqual(database.getFileStates().get("file:///workspace/server.go"), {
        mtime: 1,
        size: 2,
      });
      assert.equal(await readSchemaVersion(), 6);
    });

    it("should report no baseline when file_state is empty and symbols exist", async () => {
      database.closeDatabase();
      await writeVersion2Database(4);
      await database.initDatabase(fakeContext);

      assert.isFalse(database.hasFileStateBaseline());
      database.upsertFileStates([["file:///workspace/server.go", { mtime: 1, size: 2 }]]);
      assert.isTrue(database.hasFileStateBaseline());
    });
  });

  describe("persistence", () => {
    const setups = getPersistenceTestSetups(fakeContext.extensionPath);

    const loadSqlJs = () =>
      require("sql.js")({
        locateFile: () =>
          path.join(fakeContext.extensionPath, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
      });

    const countSavedRows = async (filePath: string) => {
      const SQL = await loadSqlJs();
      const saved = new SQL.Database(fs.readFileSync(filePath));
      try {
        return saved.exec("SELECT count(*) FROM symbols")[0].values[0][0];
      } finally {
        saved.close();
      }
    };

    beforeEach(setups.beforeEach);

    afterEach(setups.afterEach);

    after(async () => {
      await database.initDatabase(fakeContext);
    });

    it("should keep cache_size and temp_store after an export", async () => {
      await setups.init();
      const SQL = await loadSqlJs();
      const exportSpy = setups.sandbox.spy(SQL.Database.prototype, "export");
      database.insertSymbol(item1);
      await database.persistToFile();

      assert.isTrue(exportSpy.calledOnce);
      const connection = exportSpy.thisValues[0];
      assert.equal(connection.exec("PRAGMA cache_size")[0].values[0][0], -64000);
      assert.equal(connection.exec("PRAGMA temp_store")[0].values[0][0], 2);
    });

    it("should not write the file when nothing changed since the last save", async () => {
      await setups.init();
      database.insertSymbol(item1);
      await database.persistToFile();
      const writeFileSpy = setups.spyWriteFile();

      await database.persistToFile();

      assert.isTrue(writeFileSpy.notCalled);
    });

    it("should not write the file after removing a path that is not indexed", async () => {
      await setups.init();
      database.insertSymbol(item1);
      await database.persistToFile();
      const writeFileSpy = setups.spyWriteFile();

      database.deleteByUri("file:///project/.git/index.lock");
      database.deleteByUriPrefix("file:///project/.git/index.lock");
      await database.persistToFile();

      assert.isTrue(writeFileSpy.notCalled);
    });

    it("should write the file after an insert marks the database dirty", async () => {
      await setups.init();
      await database.persistToFile();
      const writeFileSpy = setups.spyWriteFile();

      database.insertSymbol(item1);
      await database.persistToFile();

      assert.isTrue(writeFileSpy.calledOnce);
      assert.equal(await countSavedRows(setups.indexPath()), 1);
    });

    it("should replace the file atomically through a temp file", async () => {
      await setups.init();
      const writeFileSpy = setups.spyWriteFile();
      const renameSpy = setups.spyRename();
      database.insertSymbol(item1);

      await database.persistToFile();

      const tempPath = setups.indexPath() + ".tmp";
      assert.equal(writeFileSpy.firstCall.args[0], tempPath);
      assert.deepEqual(renameSpy.firstCall.args, [tempPath, setups.indexPath()]);
      assert.isFalse(fs.existsSync(tempPath));
    });

    it("should run one more save when a save is requested during a save", async () => {
      await setups.init();
      const writeFileSpy = setups.spyWriteFile();
      database.insertSymbol(item1);

      const first = database.persistToFile();
      database.insertSymbol(item2);
      const second = database.persistToFile();
      await Promise.all([first, second]);

      assert.equal(writeFileSpy.callCount, 2);
      assert.equal(await countSavedRows(setups.indexPath()), 2);
    });

    it("should keep the database dirty when the write fails", async () => {
      await setups.init();
      setups.failWriteFileOnce();
      database.insertSymbol(item1);

      await database.persistToFile();
      assert.isFalse(fs.existsSync(setups.indexPath()));
      assert.isTrue(
        setups.logStub().calledWith(sinon.match(/^Failed to save index: .*disk full/))
      );

      await database.persistToFile();
      assert.equal(await countSavedRows(setups.indexPath()), 1);
    });

    it("should move an unreadable index file aside and start empty", async () => {
      fs.mkdirSync(path.dirname(setups.indexPath()), { recursive: true });
      fs.writeFileSync(setups.indexPath(), "not a database at all, just text");

      await setups.init();

      assert.isTrue(database.isReady());
      assert.isTrue(database.isEmpty());
      assert.isFalse(fs.existsSync(setups.indexPath()));
      assert.equal(
        fs.readFileSync(setups.indexPath() + ".corrupt", "utf8"),
        "not a database at all, just text"
      );
    });

    it("should delete a leftover temp file on init", async () => {
      fs.mkdirSync(path.dirname(setups.indexPath()), { recursive: true });
      fs.writeFileSync(setups.indexPath() + ".tmp", "half written");

      await setups.init();

      assert.isFalse(fs.existsSync(setups.indexPath() + ".tmp"));
    });

    it("should not write the shared template on a debounced save", async () => {
      await setups.initWithSharing();
      const clock = setups.sandbox.useFakeTimers();
      database.insertSymbol(item1);

      database.schedulePersist();
      clock.tick(10000);
      clock.restore();
      await database.persistToFile();

      assert.equal(await countSavedRows(setups.indexPath()), 1);
      assert.isFalse(fs.existsSync(setups.templateDbPath()));
      assert.isFalse(fs.existsSync(setups.templateMetaPath()));
    });

    it("should write the shared template after a full index", async () => {
      await setups.initWithSharing();
      database.insertSymbolsBatch([item1, item2]);

      await database.flushPersist();

      assert.equal(await countSavedRows(setups.templateDbPath()), 2);
      const meta = JSON.parse(fs.readFileSync(setups.templateMetaPath(), "utf8"));
      assert.equal(meta.fingerprint, FINGERPRINT);
      assert.equal(meta.symbolCount, 2);
      assert.equal(meta.commit, HEAD_COMMIT);
      assert.deepEqual(meta.dirtyPaths, DIRTY_PATHS);
      assert.equal(
        meta.templateRootUri,
        vscode.workspace.workspaceFolders![0].uri.toString()
      );
      assert.deepEqual(
        fs.readdirSync(setups.globalDir()).filter((file) => file.endsWith(".tmp")),
        []
      );
    });

    it("should compute the repository fingerprint once per init", async () => {
      const fingerprintStub = await setups.initWithSharing();
      database.insertSymbol(item1);
      await database.flushPersist();
      database.insertSymbol(item2);
      await database.flushPersist();
      database.insertSymbol(item3);
      await database.persistToFile();
      database.closeDatabase();

      assert.equal(fingerprintStub.callCount, 1);
      assert.equal(await countSavedRows(setups.templateDbPath()), 3);
    });

    it("should not refresh the shared template on exit when the index changed after the last save", async () => {
      await setups.initWithSharing();
      database.insertSymbol(item1);
      await database.flushPersist();
      database.insertSymbol(item2);

      database.closeDatabase();

      assert.equal(await countSavedRows(setups.indexPath()), 2);
      assert.equal(await countSavedRows(setups.templateDbPath()), 1);
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

