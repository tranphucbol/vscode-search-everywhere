import * as vscode from "vscode";
import { clearConfig } from "../../platform/cache";
import {
  fetchExcludeMode,
  fetchSecondaryCode,
  isDebounceConfigurationToggled,
  isSortingConfigurationToggled,
} from "../../platform/config";
import { dataConverter } from "../../symbols/dataConverter";
import { dataService } from "../../symbols/dataService";
import { database } from "../../database";
import { fileWatcher } from "./fileWatcher";
import { isRootMarker, markerFileGlob, refreshPresets } from "../../platform/presets";
import { ActionTrigger, ExcludeMode } from "../../shared/types";
import { asyncUtils } from "../../shared/async";
import { workspaceFolders } from "../../shared/workspaceFolders";
import {
  onDidDebounceConfigToggleEventEmitter,
  onDidSortingConfigToggleEventEmitter,
  onWillReindexOnConfigurationChangeEventEmitter,
} from "../../shared/events";
import { changes } from "../queue/changes";

const defaultSection = "searchEverywhere";

function reloadComponents() {
  dataConverter.reload();
  dataService.reload();
}

async function handleDidChangeConfiguration(
  event: vscode.ConfigurationChangeEvent
) {
  clearConfig();
  if (settingsEvents.shouldReindexOnConfigurationChange(event)) {
    reloadComponents();
    settingsEvents.shouldRestartFileWatcher(event) && fileWatcher.startWatching();
    onWillReindexOnConfigurationChangeEventEmitter.fire();
    await changes.reindex(ActionTrigger.ConfigurationChange);
  } else if (isDebounceConfigurationToggled(event)) {
    onDidDebounceConfigToggleEventEmitter.fire();
  } else if (isSortingConfigurationToggled(event)) {
    onDidSortingConfigToggleEventEmitter.fire();
  } else if (event.affectsConfiguration(`${defaultSection}.secondaryCode`)) {
    database.recomputeSecondary(fetchSecondaryCode());
    database.schedulePersist();
  } else if (settingsEvents.shouldRestartFileWatcher(event)) {
    fileWatcher.startWatching();
  }
}

function shouldRestartFileWatcher(
  event: vscode.ConfigurationChangeEvent
): boolean {
  return ["include", "exclude", "excludeMode", "watchFileSystem"].some(
    (config: string) => event.affectsConfiguration(`${defaultSection}.${config}`)
  );
}

async function handleDidChangeWorkspaceFolders(
  event: vscode.WorkspaceFoldersChangeEvent
) {
  if (workspaceFolders.hasWorkspaceChanged(event)) {
    workspaceFolders.setWorkspaceFoldersCommonPath();
    await refreshPresets();
    await settingsEvents.reloadConfig();
    await changes.reindex(ActionTrigger.WorkspaceFoldersChange);
  }
}

async function handleDidChangeMarkerFile(uri: vscode.Uri) {
  if (isRootMarker(uri) && (await refreshPresets())) {
    await settingsEvents.reloadConfig();
    onWillReindexOnConfigurationChangeEventEmitter.fire();
    await changes.reindex(ActionTrigger.ConfigurationChange);
  }
}

async function reloadConfig() {
  clearConfig();
  await dataService.fetchConfig();
  dataConverter.fetchConfig();
}

function shouldReindexOnConfigurationChange(
  event: vscode.ConfigurationChangeEvent
): boolean {
  const excludeMode = fetchExcludeMode();
  const excluded: string[] = [
    "shouldDisplayNotificationInStatusBar",
    "shouldInitOnStartup",
    "shouldHighlightSymbol",
    "shouldUseDebounce",
    "shouldItemsBeSorted",
    "shouldWorkspaceDataBeCached",
    "shouldSearchSelection",
    "useFileIconTheme",
    "categories",
    "itemsFilterPhrases",
    "helpPhrase",
    "previewOnSelect",
    "restoreLastQuery",
    "searchLanguageServersWhileIndexing",
    "secondaryCode",
    "watchFileSystem",
  ].map((config: string) => `${defaultSection}.${config}`);

  return (
    (event.affectsConfiguration("searchEverywhere") &&
      !excluded.some((config: string) => event.affectsConfiguration(config))) ||
    (excludeMode === ExcludeMode.FilesAndSearch &&
      (event.affectsConfiguration("files.exclude") ||
        event.affectsConfiguration("search.exclude")))
  );
}

function register(): void {
  vscode.workspace.onDidChangeConfiguration(
    asyncUtils.debounce(settingsEvents.handleDidChangeConfiguration, 250)
  );
  vscode.workspace.onDidChangeWorkspaceFolders(
    asyncUtils.debounce(settingsEvents.handleDidChangeWorkspaceFolders, 250)
  );

  const markerWatcher = vscode.workspace.createFileSystemWatcher(
    markerFileGlob,
    false,
    true,
    false
  );
  markerWatcher.onDidCreate(settingsEvents.handleDidChangeMarkerFile);
  markerWatcher.onDidDelete(settingsEvents.handleDidChangeMarkerFile);
}

export const settingsEvents = {
  handleDidChangeConfiguration,
  shouldReindexOnConfigurationChange,
  shouldRestartFileWatcher,
  handleDidChangeWorkspaceFolders,
  handleDidChangeMarkerFile,
  reloadConfig,
  register,
};
