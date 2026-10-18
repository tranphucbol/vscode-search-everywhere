import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/settings/config";
import { files } from "../../../symbols/scan/files";
import { database, FileState } from "../../../database";
import { fileWatcher } from "../../../indexing/sources/fileWatcher";
import { logger } from "../../../platform/logger";
import { patternProvider } from "../../../platform/settings/patternProvider";
import { ExcludeMode } from "../../../shared/types";
import { changes } from "../../../indexing/queue/changes";
import { reconciler } from "../../../indexing/sources/reconciler";
import {
  FakeFileSystemWatcher,
  getFileSystemWatcherStub,
} from "../../util/stubFactory";
import { stubChanges } from "../../util/changesStub";
import { insertAt, stubMultiple } from "../../util/stubHelpers";

const workspaceRoot = "/workspace";

export const fileUri = (relativePath: string) =>
  vscode.Uri.file(`${workspaceRoot}/${relativePath}`);

interface WatcherOptions {
  watchFileSystem?: boolean;
  openUris?: vscode.Uri[];
  stored?: Map<string, FileState>;
  onDisk?: Map<string, FileState>;
}

function stubWatcher(sandbox: sinon.SinonSandbox, options: WatcherOptions = {}) {
  const watchers: FakeFileSystemWatcher[] = [];
  const stored = options.stored || new Map<string, FileState>();
  const onDisk = options.onDisk || new Map<string, FileState>();
  const openDocuments = (options.openUris || []).map(
    (uri) => ({ uri } as vscode.TextDocument)
  );

  const [
    createFileSystemWatcherStub,
    queuedStub,
    reconcileStub,
    deleteByUriStub,
    deleteByUriPrefixStub,
  ] = insertAt(stubMultiple(
    [
      {
        object: vscode.workspace,
        method: "createFileSystemWatcher",
        callsFake: (...args: any[]) => {
          const watcher = getFileSystemWatcherStub(
            ...(args as Parameters<typeof getFileSystemWatcherStub>)
          );
          watchers.push(watcher);
          return watcher;
        },
      },
      {
        object: reconciler,
        method: "reconcile",
        returns: Promise.resolve(),
      },
      {
        object: database,
        method: "deleteByUri",
      },
      {
        object: database,
        method: "deleteByUriPrefix",
      },
      {
        object: database,
        method: "schedulePersist",
      },
      {
        object: database,
        method: "isReady",
        returns: true,
      },
      {
        object: database,
        method: "isEmpty",
        returns: false,
      },
      {
        object: database,
        method: "getFileState",
        callsFake: (uri: string) => stored.get(uri),
      },
      {
        object: files,
        method: "statUri",
        callsFake: async (uri: vscode.Uri) => onDisk.get(uri.toString()),
      },
      {
        object: changes,
        method: "isRebuilding",
        returns: false,
      },
      {
        object: config,
        method: "fetchWatchFileSystem",
        returns: options.watchFileSystem !== false,
      },
      {
        object: patternProvider,
        method: "getIncludePatterns",
        returns: "**/*.ts",
      },
      {
        object: patternProvider,
        method: "getExcludeMode",
        returns: ExcludeMode.SearchEverywhere,
      },
      {
        object: patternProvider,
        method: "getExtensionExcludePatterns",
        returns: ["**/node_modules/**", "**/generated/**"],
      },
      {
        object: vscode.workspace,
        method: "getWorkspaceFolder",
        callsFake: (uri: vscode.Uri) =>
          uri.path.startsWith(`${workspaceRoot}/`)
            ? { uri: vscode.Uri.file(workspaceRoot), name: "workspace", index: 0 }
            : undefined,
      },
      {
        object: vscode.workspace,
        method: "asRelativePath",
        callsFake: (uri: vscode.Uri) =>
          uri.path.replace(`${workspaceRoot}/`, ""),
      },
      {
        object: vscode.workspace,
        method: "textDocuments",
        returns: openDocuments,
        isNotMethod: true,
      },
      {
        object: logger,
        method: "log",
      },
    ],
    sandbox
  ), 1, stubChanges(sandbox));

  fileWatcher.startWatching();

  const fire = (kind: "create" | "change" | "delete", uri: vscode.Uri) =>
    watchers.forEach((watcher) =>
      kind === "create"
        ? watcher.fireCreate(uri)
        : kind === "change"
        ? watcher.fireChange(uri)
        : watcher.fireDelete(uri)
    );

  return {
    fire,
    watchers,
    createFileSystemWatcherStub,
    queuedStub,
    reconcileStub,
    deleteByUriStub,
    deleteByUriPrefixStub,
  };
}

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      fileWatcher.stopWatching();
      sandbox.restore();
    },
    processBatch: {
      setupForIncludedFile: () => stubWatcher(sandbox),
      setupForOpenFile: (uri: vscode.Uri) =>
        stubWatcher(sandbox, {
          openUris: [uri],
          stored: new Map([[uri.toString(), { mtime: 1, size: 10 }]]),
          onDisk: new Map([[uri.toString(), { mtime: 2, size: 10 }]]),
        }),
      setupForUnchangedState: (uri: vscode.Uri) =>
        stubWatcher(sandbox, {
          stored: new Map([[uri.toString(), { mtime: 1, size: 10 }]]),
          onDisk: new Map([[uri.toString(), { mtime: 1, size: 10 }]]),
        }),
    },
    startWatching: {
      setupForDisabledWatching: () =>
        stubWatcher(sandbox, { watchFileSystem: false }),
    },
  };
};
