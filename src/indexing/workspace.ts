import { clearConfig, getIndexedConfig } from "../platform/cache";
import { fetchIndexedConfigSnapshot } from "../platform/config";
import { dataConverter } from "../symbols/dataConverter";
import { dataService } from "../symbols/dataService";
import { database } from "../database";
import { fileWatcher } from "./fileWatcher";
import { logger } from "../platform/logger";
import { refreshPresets } from "../platform/presets";
import { workspaceFolders } from "../shared/workspaceFolders";
import { onDidIndexWorkspace, onWillIndexWorkspace } from "../shared/events";
import { editorEvents } from "./editorEvents";
import { settingsEvents } from "./settingsEvents";
import { retryQueue } from "./retryQueue";

function clearIndexBuiltWithOtherConfig() {
  const indexedConfig = getIndexedConfig();
  if (indexedConfig && indexedConfig !== fetchIndexedConfigSnapshot()) {
    logger.log(
      "Language presets or index settings changed since the last index; the workspace will be reindexed."
    );
    database.clearAll();
  }
}

async function init() {
  workspaceFolders.setWorkspaceFoldersCommonPath();
  clearConfig();
  await refreshPresets();
  clearIndexBuiltWithOtherConfig();
  await dataService.fetchConfig();
  dataConverter.fetchConfig();
  workspace.registerEventListeners();
}

function registerEventListeners(): void {
  settingsEvents.register();
  editorEvents.register();

  fileWatcher.startWatching();

  onWillIndexWorkspace(() => retryQueue.stop());
  onDidIndexWorkspace((urisToRetry) => retryQueue.start(urisToRetry));
}

export const workspace = {
  init,
  registerEventListeners,
};
