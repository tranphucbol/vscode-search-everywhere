import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { database } from "../../../database";
import { fakeContext, item1, item2, item3, useTestDatabase } from "../../util/databaseFixtures";
import {
  DIRTY_PATHS,
  FINGERPRINT,
  getPersistenceTestSetups,
  HEAD_COMMIT,
} from "./persistence.testSetup";

describe("Database persistence", () => {
  useTestDatabase();

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
});
