import * as vscode from "vscode";

function isVscodeVersionAtLeast(
  major: number,
  minor: number,
  version: string = vscode.version
): boolean {
  const match = /^(\d+)\.(\d+)/.exec(version || "");
  if (!match) {
    return false;
  }
  const actualMajor = parseInt(match[1]);
  const actualMinor = parseInt(match[2]);
  return (
    actualMajor > major || (actualMajor === major && actualMinor >= minor)
  );
}

// QuickPickItem.resourceUri (file icon theme support) was finalized in VS Code 1.108.
function supportsQuickPickFileIconTheme(): boolean {
  return isVscodeVersionAtLeast(1, 108);
}

function supportsQuickInputButtonToggle(
  version: string = vscode.version
): boolean {
  return isVscodeVersionAtLeast(1, 109, version);
}

export const vscodeVersion = {
  isVscodeVersionAtLeast,
  supportsQuickPickFileIconTheme,
  supportsQuickInputButtonToggle,
};
