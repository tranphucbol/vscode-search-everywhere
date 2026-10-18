import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../../platform/cache";
import { files } from "../../../symbols/scan/files";
import { pathUtils } from "../../../shared/paths";
import { stubChanges } from "../../util/changesStub";
import { insertAt, stubMultiple } from "../../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    handleDidChangeTextDocument: {
      setupForRegisteringUpdateActionWhenDocumentChangedAndExistsInWorkspace:
        () => {
          return [stubChanges(sandbox), ...stubMultiple(
            [
              {
                object: files,
                method: "isUriExistingInWorkspace",
                returns: Promise.resolve(true),
              },
            ],
            sandbox
          )];
        },

      setupForDoingNothingWhenDocumentNotExistInWorkspace: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: files,
              method: "isUriExistingInWorkspace",
              returns: Promise.resolve(false),
            },
          ],
          sandbox
        )];
      },

      setupForDoingNothingWhenDocumentNotChanged: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: files,
              method: "isUriExistingInWorkspace",
              returns: Promise.resolve(true),
            },
          ],
          sandbox
        )];
      },

      setupForAddingUriToNotSavedArrayWhenDocumentChangedAndExistsInWorkspace:
        () => {
          let notSavedUris: string[] = [];

          insertAt(stubMultiple(
            [
              {
                object: cache,
                method: "getNotSavedUriPaths",
                callsFake: () => notSavedUris,
              },
              {
                object: cache,
                method: "updateNotSavedUriPaths",
                callsFake: (paths: string[]) => (notSavedUris = paths),
              },
              {
                object: files,
                method: "isUriExistingInWorkspace",
                returns: Promise.resolve(true),
              },
            ],
            sandbox
          ), 2, stubChanges(sandbox));
        },
    },

    handleDidRenameFiles: {
      setupForRegisteringRemoveAndUpdateActionsForRenamedFiles: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: false,
            },
          ],
          sandbox
        )];
      },

      setupForRegisteringUpdateActionForRenamedDirectory: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: true,
            },
          ],
          sandbox
        )];
      },
    },

    handleDidCreateFiles: {
      setupForRegisteringUpdateActionWhenFileCreated: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: false,
            },
          ],
          sandbox
        )];
      },

      setupForRegisteringUpdateActionWhenDirectoryCreated: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: true,
            },
          ],
          sandbox
        )];
      },

      setupForAddingUriToNotSavedArray: () => {
        let notSavedUris: string[] = [];

        return insertAt(stubMultiple(
          [
            {
              object: cache,
              method: "getNotSavedUriPaths",
              callsFake: () => notSavedUris,
            },
            {
              object: cache,
              method: "updateNotSavedUriPaths",
              callsFake: (paths: string[]) => (notSavedUris = paths),
            },
            {
              object: pathUtils,
              method: "isDirectory",
              returns: true,
            },
          ],
          sandbox
        ), 2, stubChanges(sandbox));
      },
    },

    handleDidDeleteFiles: {
      setupForRegisteringRemoveActionWhenFileDeleted: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: false,
            },
          ],
          sandbox
        )];
      },

      setupForRegisteringRemoveActionWhenDirectoryDeleted: () => {
        return [stubChanges(sandbox), ...stubMultiple(
          [
            {
              object: pathUtils,
              method: "isDirectory",
              returns: true,
            },
          ],
          sandbox
        )];
      },
    },

    handleDidSaveTextDocument: {
      setupForRemovingUriFromNotSavedArray: () => {
        let notSavedUris: string[] = [
          "/test/path1",
          "/test/path2",
          "/test/path3",
        ];

        return stubMultiple(
          [
            {
              object: cache,
              method: "getNotSavedUriPaths",
              callsFake: () => notSavedUris,
            },
            {
              object: cache,
              method: "updateNotSavedUriPaths",
              callsFake: (paths: string[]) => (notSavedUris = paths),
            },
          ],
          sandbox
        );
      },
    },

    register: {
      setupForRegisteringListeners: () => {
        return stubMultiple(
          [
            {
              object: vscode.workspace,
              method: "onDidChangeTextDocument",
            },
            {
              object: vscode.workspace,
              method: "onDidRenameFiles",
            },
            {
              object: vscode.workspace,
              method: "onDidCreateFiles",
            },
            {
              object: vscode.workspace,
              method: "onDidDeleteFiles",
            },
            {
              object: vscode.workspace,
              method: "onDidSaveTextDocument",
            },
          ],
          sandbox
        );
      },
    },
  };
};
