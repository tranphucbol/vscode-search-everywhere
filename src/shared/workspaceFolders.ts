import * as vscode from "vscode";

function getWorkspaceFoldersPaths(): string[] {
  return (
    (vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.map(
        (wf: vscode.WorkspaceFolder) => wf.uri.path
      )) ||
    []
  );
}

function getCommonSubstringFromStart(strings: string[]) {
  const A = strings.concat().sort(),
    a1 = A[0],
    a2 = A[A.length - 1],
    L = a1.length;
  let i = 0;

  while (i < L && a1.charAt(i) === a2.charAt(i)) {
    i++;
  }
  return a1.substring(0, i);
}

function hasWorkspaceAnyFolder(): boolean {
  return !!(
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length
  );
}

function hasWorkspaceMoreThanOneFolder(): boolean {
  return !!(
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 1
  );
}

function hasWorkspaceChanged(
  event: vscode.WorkspaceFoldersChangeEvent
): boolean {
  return !!event.added.length || !!event.removed.length;
}

function normalizeUriPath(path: string): string {
  const workspaceFoldersPaths = getWorkspaceFoldersPaths();
  let normalizedPath = path;

  if (workspaceFolders.hasWorkspaceMoreThanOneFolder()) {
    normalizedPath = normalizedPath.replace(
      workspaceFolders.getWorkspaceFoldersCommonPathProp(),
      ""
    );
  } else {
    workspaceFoldersPaths.forEach((wfPath: string) => {
      normalizedPath = normalizedPath.replace(wfPath, "");
    });
  }

  return normalizedPath;
}

function setWorkspaceFoldersCommonPath() {
  if (workspaceFolders.hasWorkspaceMoreThanOneFolder()) {
    const workspaceFoldersPaths = getWorkspaceFoldersPaths();
    const workspaceFoldersCommonPathTemp = getCommonSubstringFromStart(
      workspaceFoldersPaths
    );
    const workspaceFoldersCommonPathArray =
      workspaceFoldersCommonPathTemp.split("/");
    workspaceFoldersCommonPathArray.pop();

    setWorkspaceFoldersCommonPathProp(
      workspaceFoldersCommonPathArray.join("/")
    );
  }
}

let workspaceFoldersCommonPath = "";

function setWorkspaceFoldersCommonPathProp(
  newWorkspaceFoldersCommonPath: string
) {
  workspaceFoldersCommonPath = newWorkspaceFoldersCommonPath;
}

function getWorkspaceFoldersCommonPathProp() {
  return workspaceFoldersCommonPath;
}

export const workspaceFolders = {
  getWorkspaceFoldersCommonPathProp,
  setWorkspaceFoldersCommonPath,
  hasWorkspaceAnyFolder,
  hasWorkspaceMoreThanOneFolder,
  hasWorkspaceChanged,
  normalizeUriPath,
};
