import { performance } from "perf_hooks";
import * as vscode from "vscode";
import * as cache from "../platform/cache";
import {
  fetchExclude,
  fetchInclude,
  fetchIndexedConfigSnapshot,
  fetchLanguagePresets,
} from "../platform/config";
import { dataConverter } from "../symbols/dataConverter";
import { dataService } from "../symbols/dataService";
import { indexingProgress } from "./progress";
import { database, FileState } from "../database";
import { onDidItemIndexed } from "../shared/events";
import { logger } from "../platform/logger";
import { getActivePresets } from "../platform/presets";
import { QuickPickItem, WorkspaceData } from "../shared/types";
import { asyncUtils } from "../shared/async";
import { messages } from "../shared/messages";
import { workspaceFolders } from "../shared/workspaceFolders";
import {
  onDidIndexWorkspaceEventEmitter,
  onWillIndexWorkspaceEventEmitter,
} from "../shared/events";

function getData(query?: string, limit?: number): QuickPickItem[] {
  if (!database.isReady()) {
    const cached = cache.getData();
    return cached || [];
  }
  return database.search(query || "", limit);
}

async function indexWithProgress(): Promise<void> {
  workspaceFolders.hasWorkspaceAnyFolder()
    ? await vscode.window.withProgress(
        {
          location: indexingProgress.getNotificationLocation(),
          title: indexingProgress.getNotificationTitle(),
          cancellable: true,
        },
        indexWithProgressTask
      )
    : messages.printNoFolderOpenedMessage();
}

function cancelIndexing(): void {
  dataService.cancel();
  dataConverter.cancel();
}

async function indexWithProgressTask(
  progress: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>,
  token: vscode.CancellationToken
): Promise<void> {
  const handleCancellationRequestedSubscription = token.onCancellationRequested(
    handleCancellationRequested
  );

  const handleDidItemIndexedSubscription = onDidItemIndexed(
    indexingProgress.handleDidItemIndexed.bind(null, progress)
  );

  const startMeasure = startTimeMeasurement();
  const data = await indexWorkspace(progress);

  indexingProgress.resetProgress();
  handleCancellationRequestedSubscription.dispose();
  handleDidItemIndexedSubscription.dispose();

  // necessary for proper way to complete progress
  asyncUtils.sleep(250);

  const elapsedTimeInMs = getTimeElapsed(startMeasure);
  const elapsedTimeInSec = workspaceIndexer.convertMsToSec(elapsedTimeInMs);

  printStats(data, elapsedTimeInSec);
}

function startTimeMeasurement() {
  return performance.now();
}

function getTimeElapsed(start: number) {
  const end = performance.now();
  return end - start;
}

function printStats(data: WorkspaceData, elapsedTime: number) {
  const indexStats = {
    ElapsedTimeInSeconds: elapsedTime,
    ScannedUrisCount: data.items.size,
    IndexedItemsCount: data.count,
  };

  messages.printStatsMessage(indexStats);
  logger.logScanTime(indexStats);
  logger.logStructure(data);
}

async function indexWorkspace(
  progress?: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>
): Promise<WorkspaceData> {
  onWillIndexWorkspaceEventEmitter.fire();
  database.clearAll();
  logEffectiveConfig();
  cache.updateIndexedConfig(fetchIndexedConfigSnapshot());

  let batch: QuickPickItem[] = [];
  let fileStates: Array<[string, FileState]> = [];
  const BATCH_SIZE = 2500;

  const flush = () => {
    database.insertSymbolsBatch(batch);
    database.upsertFileStates(fileStates);
    batch = [];
    fileStates = [];
  };

  const onBatch = (items: QuickPickItem[], fileState?: [string, FileState]) => {
    batch.push(...items);
    fileState && fileStates.push(fileState);
    if (batch.length >= BATCH_SIZE) {
      flush();
    }
  };

  const data = await dataService.fetchData(undefined, progress, onBatch);

  if (batch.length > 0 || fileStates.length > 0) {
    flush();
  }

  progress?.report({ message: "Saving index database..." });
  database.flushPersist();
  onDidIndexWorkspaceEventEmitter.fire(data.urisToRetry || []);

  return data;
}

function logEffectiveConfig() {
  const presets =
    fetchLanguagePresets() === "auto" ? getActivePresets() : [];
  logger.log(
    `Indexing with presets: ${presets.length ? presets.join(", ") : "none"}; ` +
      `include: ${fetchInclude()}; exclude: ${fetchExclude().join(", ")}`
  );
}

function handleCancellationRequested() {
  workspaceIndexer.cancelIndexing();
}

function convertMsToSec(timeInMs: number) {
  return Math.floor((timeInMs % (1000 * 60)) / 1000);
}

export const workspaceIndexer = {
  convertMsToSec,
  getData,
  indexWithProgress,
  indexWithProgressTask,
  cancelIndexing,
  handleCancellationRequested,
};
