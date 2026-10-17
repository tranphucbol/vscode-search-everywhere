import * as sinon from "sinon";
import * as vscode from "vscode";
import { workspaceFolders } from "../../shared/workspaceFolders";
import { getItem } from "../util/itemMockFactory";
import { getQpItem } from "../util/qpItemMockFactory";
import { stubMultiple } from "../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  const stubWorkspaceFolders = (paths: string[] | undefined) => {
    let index = 0;

    const folders = paths
      ? paths.map((path) => ({
          index: index++,
          name: path,
          uri: vscode.Uri.file(path),
        }))
      : undefined;

    stubMultiple(
      [
        {
          object: vscode.workspace,
          method: "workspaceFolders",
          returns: folders,
          isNotMethod: true,
        },
      ],
      sandbox
    );
  };

  return {
    afterEach: () => {
      sandbox.restore();
    },

    hasWorkspaceAnyFolder: {
      setupForReturningTrueWhenWorkspaceHasFolders: () => {
        stubWorkspaceFolders(["/#"]);
      },

      setupForReturningFalseWhenWorkspaceHasNoFolders: () => {
        stubWorkspaceFolders([]);
      },
    },

    hasWorkspaceMoreThanOneFolder: {
      setupForReturningTrueWhenWorkspaceHasMultipleFolders: () => {
        stubWorkspaceFolders(["/#", "/test/#"]);
      },

      setupForReturningFalseWhenWorkspaceHasOneOrNoFolders: () => {
        stubWorkspaceFolders(["/#"]);
      },
    },

    normalizeUriPath: {
      setupForRemovingWorkspacePartWhenMultipleFolders: () => {
        stubWorkspaceFolders([
          "/common/path/folder1/subfolder",
          "/common/path/folder2/subfolder",
        ]);
        stubMultiple(
          [
            {
              object: workspaceFolders,
              method: "getWorkspaceFoldersCommonPathProp",
              returns: "/common/path",
            },
          ],
          sandbox
        );
        return {
          item: getItem("/common/path/folder1/subfolder/"),
          qpItem: getQpItem("/folder1/subfolder/"),
        };
      },

      setupForRemovingWorkspacePartWhenSingleFolder: () => {
        stubWorkspaceFolders(["/test/path/to/workspace"]);

        return {
          item: getItem("/test/path/to/workspace/"),
          qpItem: getQpItem(""),
        };
      },

      setupForKeepingWorkspacePartWhenNoFolders: () => {
        stubWorkspaceFolders(undefined);

        return {
          item: getItem(),
          qpItem: getQpItem(),
        };
      },
    },

    setWorkspaceFoldersCommonPath: {
      setupForDoingNothingWhenSingleFolder: () => {
        stubWorkspaceFolders(["/#"]);
      },

      setupForDoingNothingWhenNoFolders: () => {
        stubWorkspaceFolders(undefined);
      },

      setupForExtractingCommonPathWhenMultipleFolders: () => {
        stubWorkspaceFolders([
          "/common/path/folder1/subfolder",
          "/common/path/folder2/subfolder",
        ]);
      },
    },
  };
};
