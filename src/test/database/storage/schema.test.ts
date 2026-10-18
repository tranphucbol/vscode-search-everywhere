import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import { database } from "../../../database";
import { logger } from "../../../platform/logger";
import { fakeContext, item1, useTestDatabase } from "../../util/databaseFixtures";

describe("Database schema", () => {
  useTestDatabase();

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

    const writeVersion4Database = async () => {
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
        range_end_line INTEGER DEFAULT 0, range_end_char INTEGER DEFAULT 0,
        is_secondary INTEGER DEFAULT 0)`);
      legacy.run(
        `INSERT INTO symbols (uri, name, clean_name, clean_stem, symbol_kind, label, description,
          range_start_line, range_start_char, range_end_line, range_end_char)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["file:///workspace/src/User.ts", "save", "save", "save", 5, "save", "method", 10, 2, 16, 3]
      );
      legacy.run("PRAGMA user_version = 4");
      fs.writeFileSync(dbFile, Buffer.from(legacy.export()));
      legacy.close();
    };

    const readColumnNames = async () => {
      database.closeDatabase();
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs({
        locateFile: () =>
          path.join(fakeContext.extensionPath, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
      });
      const saved = new SQL.Database(fs.readFileSync(dbFile));
      const columns = saved
        .exec("PRAGMA table_info(symbols)")[0]
        .values.map((row: any[]) => row[1]);
      saved.close();
      await database.initDatabase(fakeContext);
      return columns;
    };

    it("should add the name position columns when migrating to schema 6 without deleting symbols", async () => {
      database.closeDatabase();
      await writeVersion4Database();
      await database.initDatabase(fakeContext);

      assert.equal(database.getCount(), 1);
      const columns = await readColumnNames();
      assert.include(columns, "name_start_line");
      assert.include(columns, "name_start_char");
      assert.equal(database.getCount(), 1);
      assert.equal(await readSchemaVersion(), 6);
    });

    it("should return no namePosition for rows written before schema 6", async () => {
      database.closeDatabase();
      await writeVersion4Database();
      await database.initDatabase(fakeContext);

      const [result] = database.search("save");
      assert.equal(result.label, "save");
      assert.isFalse("namePosition" in result);
      assert.equal(result.range!.start.line, 10);
    });
  });
});
