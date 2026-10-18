import * as sinon from "sinon";
import * as vscode from "vscode";
import { dataService } from "../../symbols/dataService";
import { database, FileState } from "../../database";
import { logger } from "../../platform/logger";
import { changes } from "../../indexing/changes";
import { stubChanges } from "../util/changesStub";
import { stubMultiple } from "../util/stubHelpers";

export const fileUri = (name: string) => vscode.Uri.file(`/workspace/src/${name}`);

const state = (mtime: number, size: number): FileState => ({ mtime, size });

function stubDisk(
  sandbox: sinon.SinonSandbox,
  onDisk: Map<string, FileState>,
  stored: Map<string, FileState>,
  indexedUris: string[] = [...stored.keys()]
) {
  const [queuedStub, indexStub, upsertFileStatesStub] = [stubChanges(sandbox), ...stubMultiple(
    [
      {
        object: changes,
        method: "reindex",
        returns: Promise.resolve(),
      },
      {
        object: database,
        method: "upsertFileStates",
      },
      {
        object: dataService,
        method: "fetchUris",
        returns: Promise.resolve([...onDisk.keys()].map((uri) => vscode.Uri.parse(uri))),
      },
      {
        object: dataService,
        method: "statUri",
        callsFake: (uri: vscode.Uri) => Promise.resolve(onDisk.get(uri.toString())),
      },
      {
        object: database,
        method: "hasFileStateBaseline",
        returns: stored.size > 0 || indexedUris.length === 0,
      },
      {
        object: database,
        method: "getFileStates",
        returns: stored,
      },
      {
        object: database,
        method: "getIndexedUris",
        returns: indexedUris,
      },
      {
        object: database,
        method: "schedulePersist",
      },
      {
        object: logger,
        method: "log",
      },
    ],
    sandbox
  )];
  return { queuedStub, indexStub, upsertFileStatesStub };
}

function manyFiles(count: number, mtime: number): Map<string, FileState> {
  const files = new Map<string, FileState>();
  for (let i = 0; i < count; i++) {
    files.set(fileUri(`file${i}.ts`).toString(), state(mtime, 100));
  }
  return files;
}

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();
  const a = fileUri("a.ts").toString();
  const b = fileUri("b.ts").toString();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    reconcile: {
      setupForUnchangedFiles: () => {
        const files = new Map([
          [a, state(1, 10)],
          [b, state(2, 20)],
        ]);
        return stubDisk(sandbox, files, new Map(files));
      },

      setupForMtimeChange: () =>
        stubDisk(sandbox, new Map([[a, state(5, 10)]]), new Map([[a, state(1, 10)]])),

      setupForSizeChange: () =>
        stubDisk(sandbox, new Map([[a, state(1, 11)]]), new Map([[a, state(1, 10)]])),

      setupForNewFile: () =>
        stubDisk(
          sandbox,
          new Map([
            [a, state(1, 10)],
            [b, state(2, 20)],
          ]),
          new Map([[a, state(1, 10)]])
        ),

      setupForRemovedFile: () =>
        stubDisk(
          sandbox,
          new Map([[a, state(1, 10)]]),
          new Map([
            [a, state(1, 10)],
            [b, state(2, 20)],
          ])
        ),

      setupForQuarterOfFilesChanged: () => {
        const stored = manyFiles(10000, 1);
        const onDisk = new Map(stored);
        [...onDisk.keys()].slice(0, 2501).forEach((uri) => onDisk.set(uri, state(2, 100)));
        return stubDisk(sandbox, onDisk, stored);
      },

      setupForBaseline: () =>
        stubDisk(
          sandbox,
          new Map([
            [a, state(1, 10)],
            [b, state(2, 20)],
          ]),
          new Map(),
          [a, b]
        ),
    },
  };
};
