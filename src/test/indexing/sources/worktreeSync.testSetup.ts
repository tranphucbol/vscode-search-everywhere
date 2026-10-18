import * as sinon from "sinon";
import * as vscode from "vscode";
import { database } from "../../../database";
import { gitService } from "../../../platform/gitService";
import { logger } from "../../../platform/logger";
import { changes } from "../../../indexing/queue/changes";
import { reconciler } from "../../../indexing/sources/reconciler";
import { worktreeSync } from "../../../indexing/sources/worktreeSync";
import { warmup } from "../../../symbols/scan/warmup";
import { stubChanges } from "../../util/changesStub";
import { stubMultiple } from "../../util/stubHelpers";

const seededRoot = vscode.Uri.file("/workspace");

function stubSeededWorktree(
  sandbox: sinon.SinonSandbox,
  options: {
    commit?: string;
    changedPaths?: string[];
    workingTreePaths?: string[];
    existingPaths?: string[];
  }
) {
  const folder = { uri: seededRoot, name: "workspace", index: 0 };
  const existingPaths = options.existingPaths || [];
  const queuedStub = stubChanges(sandbox);
  const [indexStub, restatAllStub, warmupStub] = stubMultiple(
    [
      {
        object: changes,
        method: "reindex",
      },
      {
        object: reconciler,
        method: "restatAll",
        returns: Promise.resolve(0),
      },
      {
        object: warmup,
        method: "warmupLanguageServers",
        returns: Promise.resolve(new Set<string>()),
      },
      {
        object: database,
        method: "getSeedMeta",
        returns: { commit: options.commit },
      },
      {
        object: vscode.workspace,
        method: "getWorkspaceFolder",
        callsFake: (uri: vscode.Uri) =>
          uri.fsPath.startsWith(seededRoot.fsPath) ? folder : undefined,
      },
      {
        object: gitService,
        method: "getChangedPathsBetween",
        returns: Promise.resolve(options.changedPaths),
      },
      {
        object: gitService,
        method: "getWorkingTreePaths",
        returns: Promise.resolve(options.workingTreePaths || []),
      },
      {
        object: gitService,
        method: "getRepoRoot",
        returns: Promise.resolve(seededRoot.fsPath),
      },
      {
        object: worktreeSync,
        method: "isIndexableFile",
        callsFake: (uri: vscode.Uri) => existingPaths.includes(uri.fsPath),
      },
      {
        object: logger,
        method: "log",
      },
    ],
    sandbox
  );
  return { queuedStub, indexStub, restatAllStub, warmupStub };
}

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    syncSeededWorktree: {
      setupForTemplateCommit: () =>
        stubSeededWorktree(sandbox, {
          commit: "abc123",
          changedPaths: ["src/changed.ts"],
          workingTreePaths: ["src/edited.ts"],
          existingPaths: ["/workspace/src/changed.ts", "/workspace/src/edited.ts"],
        }),

      setupForDeletedFile: () =>
        stubSeededWorktree(sandbox, {
          commit: "abc123",
          changedPaths: ["src/deleted.ts", "src/kept.ts"],
          existingPaths: ["/workspace/src/kept.ts"],
        }),

      setupForMissingTemplateCommit: () => stubSeededWorktree(sandbox, {}),

      setupForFailedDiff: () =>
        stubSeededWorktree(sandbox, { commit: "abc123", changedPaths: undefined }),
    },
  };
};
