import * as vscode from "vscode";

export enum ActionTrigger {
  Search = "Search",
  Reload = "Reload",
  Startup = "Startup",
  ConfigurationChange = "ConfigurationChange",
  WorkspaceFoldersChange = "WorkspaceFoldersChange",
  DidChangeTextDocument = "DidChangeTextDocument",
  DidRenameFiles = "DidRenameFiles",
  DidCreateFiles = "DidCreateFiles",
  DidDeleteFiles = "DidDeleteFiles",
  ReloadUnsavedUri = "ReloadUnsavedUri",
  RetryWithoutSymbols = "RetryWithoutSymbols",
  Reconcile = "Reconcile",
  DidChangeFileSystem = "DidChangeFileSystem",
}

export enum ActionType {
  Rebuild = "Rebuild",
  Update = "Update",
  Remove = "Remove",
}

export enum DetailedActionType {
  CreateNewFile = "CreateNewFile",
  CreateNewDirectory = "CreateNewDirectory",
  RenameOrMoveFile = "RenameOrMoveFile",
  RenameOrMoveDirectory = "RenameOrMoveDirectory",
  RemoveFile = "RemoveFile",
  RemoveDirectory = "RemoveDirectory",
  TextChange = "TextChange",
  ReloadUnsavedUri = "ReloadUnsavedUri",
}

export enum ExcludeMode {
  SearchEverywhere = "search everywhere",
  FilesAndSearch = "files and search",
  Gitignore = "gitignore",
}

export interface Action {
  type: ActionType;
  fn: Function;
  trigger?: string;
  uri?: vscode.Uri;
  id?: number;
}

export interface Icons {
  [symbolKind: number]: string;
}

export interface IndexStats {
  ElapsedTimeInSeconds: number;
  ScannedUrisCount: number;
  IndexedItemsCount: number;
}

export interface Item {
  uri: vscode.Uri;
  elements: Array<vscode.DocumentSymbol | vscode.Uri>;
}

export interface ItemsFilter {
  allowedKinds?: number[];
  ignoredKinds?: number[];
  ignoredNames?: string[];
}

export interface Category {
  name: string;
  phrase: string;
  kinds: number[];
  icon?: string;
}

// location and toggle were finalized in VS Code 1.109; @types/vscode is pinned to 1.64.
export interface CategoryButton extends vscode.QuickInputButton {
  categoryIndex: number; // -1 is All
  location?: number;
  toggle?: { checked: boolean };
}

export interface ItemsFilterPhrases {
  [symbolKind: number]: string;
}

export type HandOffTarget = "commands" | "text";

// 1 exact, 2 strong (prefix, anchored), 3 weak (substring, later word, any order), 4 fuzzy.
export type MatchBand = 1 | 2 | 3 | 4;

export interface QuickPickItem extends vscode.QuickPickItem {
  uri: vscode.Uri;
  symbolKind: number;
  range?: Range;
  // Start of the symbol's name; range covers the whole declaration, doc comment included.
  namePosition?: vscode.Position;
  isHelp?: boolean;
  filterPhrase?: string;
  handOff?: HandOffTarget;
  targetPosition?: vscode.Position;
  containerName?: string;
  matchBand?: MatchBand;
  isSecondary?: boolean;
  // Declared here because @types/vscode is pinned to 1.64:
  // iconPath was finalized in VS Code 1.81, resourceUri in VS Code 1.108.
  iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon;
  resourceUri?: vscode.Uri;
}

export interface Range {
  start: vscode.Position;
  end: vscode.Position;
}

export interface WorkspaceData {
  items: Map<string, Item>;
  count: number;
  urisToRetry?: vscode.Uri[];
}
