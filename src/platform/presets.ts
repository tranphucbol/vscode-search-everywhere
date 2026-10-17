import * as vscode from "vscode";
import { ItemsFilter } from "../shared/types";

export type PresetName = "go" | "java";
export type PresetKey = "include" | "exclude" | "itemsFilter";

interface Preset {
  markers: string[];
  includeExtensions: string[];
  exclude: string[];
  ignoredKinds: number[];
}

const presetDefinitions: { [name in PresetName]: Preset } = {
  go: {
    markers: ["go.mod", "go.work"],
    includeExtensions: ["go", "mod", "work", "proto", "yaml", "yml", "json"],
    exclude: ["**/vendor/**", "**/bin/**", "**/testdata/**"],
    // vscode.SymbolKind.TypeParameter = 25
    ignoredKinds: [25],
  },
  java: {
    markers: [
      "pom.xml",
      "build.gradle",
      "build.gradle.kts",
      "settings.gradle",
      "settings.gradle.kts",
    ],
    includeExtensions: [
      "java",
      "kt",
      "kts",
      "xml",
      "yml",
      "yaml",
      "properties",
      "gradle",
      "sql",
    ],
    exclude: ["**/target/**", "**/build/**", "**/.gradle/**", "**/.idea/**"],
    ignoredKinds: [],
  },
};

const presetNames = Object.keys(presetDefinitions) as PresetName[];

export const markerFileGlob = `**/{${presetNames
  .map((name) => presetDefinitions[name].markers.join(","))
  .join(",")}}`;

let activePresets: PresetName[] = [];

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    return false;
  }
}

async function hasAnyMarker(
  folder: vscode.WorkspaceFolder,
  markers: string[]
): Promise<boolean> {
  const found = await Promise.all(
    markers.map((marker) => exists(vscode.Uri.joinPath(folder.uri, marker)))
  );
  return found.some(Boolean);
}

export async function detectPresets(
  folders: readonly vscode.WorkspaceFolder[]
): Promise<PresetName[]> {
  const detected: PresetName[] = [];
  for (const name of presetNames) {
    const markers = presetDefinitions[name].markers;
    const found = await Promise.all(
      folders.map((folder) => hasAnyMarker(folder, markers))
    );
    found.some(Boolean) && detected.push(name);
  }
  return detected;
}

/**
 * Detects the presets of the open workspace folders again and keeps them
 * until the next call. Returns whether the detected presets changed.
 */
export async function refreshPresets(): Promise<boolean> {
  const detected = await detectPresets(vscode.workspace.workspaceFolders || []);
  const changed = detected.join(",") !== activePresets.join(",");
  activePresets = detected;
  return changed;
}

export function getActivePresets(): PresetName[] {
  return activePresets;
}

export function setActivePresets(presets: PresetName[]): void {
  activePresets = presets;
}

/** Whether a created or deleted file is a marker at a workspace folder root. */
export function isRootMarker(uri: vscode.Uri): boolean {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return false;
  }
  return presetNames.some((name) =>
    presetDefinitions[name].markers.some(
      (marker) =>
        vscode.Uri.joinPath(folder.uri, marker).toString() === uri.toString()
    )
  );
}

function getDefaultValue<T>(key: PresetKey): T | undefined {
  return vscode.workspace.getConfiguration("searchEverywhere").inspect<T>(key)
    ?.defaultValue;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function presetInclude(presets: PresetName[]): string {
  const extensions = unique(
    presets.flatMap((name) => presetDefinitions[name].includeExtensions)
  );
  return `**/*.{${extensions.join(",")}}`;
}

function presetExclude(presets: PresetName[]): string[] {
  const defaultExclude = getDefaultValue<string[]>("exclude") || [];
  return unique([
    ...defaultExclude,
    ...presets.flatMap((name) => presetDefinitions[name].exclude),
  ]);
}

function presetItemsFilter(presets: PresetName[]): ItemsFilter {
  const defaultFilter = getDefaultValue<ItemsFilter>("itemsFilter") || {
    allowedKinds: [],
    ignoredKinds: [],
    ignoredNames: [],
  };
  return {
    ...defaultFilter,
    ignoredKinds: unique([
      ...(defaultFilter.ignoredKinds || []),
      ...presets.flatMap((name) => presetDefinitions[name].ignoredKinds),
    ]),
  };
}

/**
 * Returns the value a setting takes with the given presets: the user's own
 * value when they set one at any level, otherwise the presets' value, or the
 * contributed default when there is no preset.
 */
export function effectiveValue<T>(
  key: PresetKey,
  userValue: T | undefined,
  presets: PresetName[]
): T {
  if (userValue !== undefined) {
    return userValue;
  }
  if (!presets.length) {
    return getDefaultValue<T>(key) as T;
  }
  const values: { [k in PresetKey]: () => unknown } = {
    include: () => presetInclude(presets),
    exclude: () => presetExclude(presets),
    itemsFilter: () => presetItemsFilter(presets),
  };
  return values[key]() as T;
}
