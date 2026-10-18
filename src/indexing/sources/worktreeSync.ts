import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { database } from "../../database";
import { gitService } from "../../platform/gitService";
import { logger } from "../../platform/logger";
import { patternProvider } from "../../platform/settings/patternProvider";
import { ActionTrigger, DetailedActionType } from "../../shared/types";
import { changes } from "../queue/changes";
import { reconciler } from "./reconciler";

async function syncSeededWorktree(rootPath: string): Promise<void> {
  const meta = database.getSeedMeta();
  const commit = meta && meta.commit;
  if (!commit) {
    logger.log(
      "The shared cache template records no commit; indexing the seeded worktree in full."
    );
    await indexSeededWorktreeInFull();
    return;
  }

  const [changedPaths, workingTreePaths, repoRoot] = await Promise.all([
    gitService.getChangedPathsBetween(rootPath, commit),
    gitService.getWorkingTreePaths(rootPath),
    gitService.getRepoRoot(rootPath),
  ]);
  if (!changedPaths || !repoRoot) {
    logger.log(
      `Could not diff the seeded worktree against template commit ${commit}; indexing it in full.`
    );
    await indexSeededWorktreeInFull();
    return;
  }

  const relativePaths = new Set([
    ...changedPaths,
    ...workingTreePaths,
    ...((meta && meta.dirtyPaths) || []),
  ]);
  logger.log(
    `Syncing ${relativePaths.size} files changed since template commit ${commit} for seeded worktree...`
  );

  const uris = [...relativePaths]
    .map((relativePath) => vscode.Uri.file(path.join(repoRoot, relativePath)))
    .filter((uri) => vscode.workspace.getWorkspaceFolder(uri));
  const actions = uris.map((uri) => {
    return worktreeSync.isIndexableFile(uri)
      ? changes.queueUpdate(uri, DetailedActionType.TextChange, ActionTrigger.Startup)
      : changes.queueRemove(uri, DetailedActionType.RemoveFile, ActionTrigger.Startup);
  });
  await Promise.all(actions);
  // The template's mtimes come from another checkout, so they say nothing about this one.
  await reconciler.restatAll();
}

function isIndexableFile(uri: vscode.Uri): boolean {
  try {
    if (!fs.statSync(uri.fsPath).isFile()) {
      return false;
    }
  } catch {
    return false;
  }
  return patternProvider.isIncluded(vscode.workspace.asRelativePath(uri, false));
}

async function indexSeededWorktreeInFull(): Promise<void> {
  await changes.reindex(ActionTrigger.Startup);
}

export const worktreeSync = {
  syncSeededWorktree,
  isIndexableFile,
};
