import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { database } from "../../database";
import { gitService } from "../../platform/gitService";
import { logger } from "../../platform/logger";
import { patternProvider } from "../../platform/settings/patternProvider";
import { ActionTrigger, DetailedActionType } from "../../shared/types";
import { warmup } from "../../symbols/scan/warmup";
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
  const urisToUpdate = uris.filter((uri) => worktreeSync.isIndexableFile(uri));
  const urisToRemove = uris.filter((uri) => !urisToUpdate.includes(uri));
  // No language server runs yet in a window just opened, and a one-file update does not wait
  // for one, so without this the files would be indexed without their symbols.
  await warmup.warmupLanguageServers(urisToUpdate, () => false);
  await Promise.all([
    ...urisToUpdate.map((uri) =>
      changes.queueUpdate(uri, DetailedActionType.TextChange, ActionTrigger.Startup)
    ),
    ...urisToRemove.map((uri) =>
      changes.queueRemove(uri, DetailedActionType.RemoveFile, ActionTrigger.Startup)
    ),
  ]);
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
