import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/config";
import { database } from "../../../database";
import { gitService } from "../../../platform/gitService";
import { logger } from "../../../platform/logger";
import { stubMultiple } from "../../util/stubHelpers";

export const INDEX_FILE_NAME = "search-everywhere-index.db";
export const FINGERPRINT = "fingerprint-1";
export const HEAD_COMMIT = "commit-1";
export const DIRTY_PATHS = ["src/dirty.ts"];

export const getPersistenceTestSetups = (extensionPath: string) => {
  const sandbox = sinon.createSandbox();
  let rootDir = "";

  const getContext = (): any => ({
    extensionPath,
    storageUri: vscode.Uri.file(path.join(rootDir, "workspace")),
    globalStorageUri: vscode.Uri.file(path.join(rootDir, "global")),
  });

  const stubSharing = () =>
    stubMultiple(
      [
        {
          object: config,
          method: "fetchShareCacheAcrossWorktrees",
          returns: true,
        },
        {
          object: gitService,
          method: "getRepoFingerprint",
          returns: Promise.resolve(FINGERPRINT),
        },
        {
          object: gitService,
          method: "getHeadCommit",
          returns: Promise.resolve(HEAD_COMMIT),
        },
        {
          object: gitService,
          method: "getWorkingTreePaths",
          returns: Promise.resolve(DIRTY_PATHS),
        },
        {
          object: vscode.workspace,
          method: "workspaceFolders",
          returns: [
            {
              index: 0,
              name: "project",
              uri: vscode.Uri.file(path.join(rootDir, "project")),
            },
          ],
          isNotMethod: true,
        },
      ],
      sandbox
    );

  return {
    beforeEach: async () => {
      database.closeDatabase();
      rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "search-everywhere-persist-"));
      sandbox.stub(logger, "log");
    },
    afterEach: () => {
      database.closeDatabase();
      sandbox.restore();
      fs.rmSync(rootDir, { recursive: true, force: true });
    },

    getContext,
    indexPath: () => path.join(rootDir, "workspace", INDEX_FILE_NAME),
    globalDir: () => path.join(rootDir, "global"),
    templateDbPath: () => path.join(rootDir, "global", `repo-${FINGERPRINT}.db`),
    templateMetaPath: () => path.join(rootDir, "global", `repo-${FINGERPRINT}.json`),
    logStub: () => logger.log as sinon.SinonStub,
    sandbox,

    init: () => database.initDatabase(getContext()),
    initWithSharing: async () => {
      const [, fingerprintStub] = stubSharing();
      await database.initDatabase(getContext());
      return fingerprintStub;
    },
    spyWriteFile: () => sandbox.spy(fs.promises, "writeFile"),
    spyRename: () => sandbox.spy(fs.promises, "rename"),
    failWriteFileOnce: () => {
      const stub = sandbox.stub(fs.promises, "writeFile");
      stub.onFirstCall().rejects(new Error("disk full"));
      stub.callThrough();
      return stub;
    },
  };
};
