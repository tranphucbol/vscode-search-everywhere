import { performance } from "perf_hooks";
import * as vscode from "vscode";
import { actionProcessor } from "./actionProcessor";
import * as cache from "./cache";
import {
  fetchExclude,
  fetchInclude,
  fetchIndexedConfigSnapshot,
  fetchLanguagePresets,
  fetchShouldDisplayNotificationInStatusBar,
} from "./config";
import { dataConverter } from "./dataConverter";
import { dataService } from "./dataService";
import { database, FileState } from "./database";
import { onDidItemIndexed } from "./shared/events";
import { logger } from "./logger";
import { getActivePresets } from "./presets";
import { Action, ActionType, QuickPickItem, WorkspaceData } from "./types";
import { asyncUtils } from "./shared/async";
import { messages } from "./shared/messages";
import { workspaceFolders } from "./shared/workspaceFolders";
import {
  onDidIndexWorkspaceEventEmitter,
  onWillIndexWorkspaceEventEmitter,
} from "./shared/events";

function getData(query?: string, limit?: number): QuickPickItem[] {
  if (!database.isReady()) {
    const cached = cache.getData();
    return cached || [];
  }
  return database.search(query || "", limit);
}

async function index(trigger: string): Promise<void> {
  await registerAction(ActionType.Rebuild, indexWithProgress, trigger);
}

async function reindex(trigger: string): Promise<void> {
  cache.clear();
  database.clearAll();
  await workspaceIndexer.index(trigger);
}

async function indexWithProgress(): Promise<void> {
  workspaceFolders.hasWorkspaceAnyFolder()
    ? await vscode.window.withProgress(
        {
          location: workspaceIndexer.getNotificationLocation(),
          title: workspaceIndexer.getNotificationTitle(),
          cancellable: true,
        },
        indexWithProgressTask
      )
    : messages.printNoFolderOpenedMessage();
}

async function registerAction(
  type: ActionType,
  fn: Function,
  trigger: string,
  uri?: vscode.Uri
): Promise<void> {
  const action: Action = {
    type,
    fn,
    trigger,
    uri,
  };
  await actionProcessor.register(action);
}

function isRebuilding(): boolean {
  const current = actionProcessor.getPreviousAction();
  return (
    (!!current && current.type === ActionType.Rebuild) ||
    actionProcessor.queue.some((action) => action.type === ActionType.Rebuild)
  );
}

async function downloadData(
  uris?: vscode.Uri[],
  fileStates?: Array<[string, FileState]>
): Promise<QuickPickItem[]> {
  const items: QuickPickItem[] = [];
  const workspaceData = await dataService.fetchData(uris, undefined, (batch, fileState) => {
    items.push(...batch);
    fileStates && fileState && fileStates.push(fileState);
  });
  if (items.length === 0 && workspaceData && workspaceData.items) {
    return dataConverter.convertToQpData(workspaceData);
  }
  return items;
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
    handleDidItemIndexed.bind(null, progress)
  );

  const startMeasure = startTimeMeasurement();
  const data = await indexWorkspace(progress);

  resetProgress();
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

function resetProgress() {
  setCurrentProgressValue(0);
  setProgressStep(0);
  countScannedUri = 0;
}

function handleCancellationRequested() {
  workspaceIndexer.cancelIndexing();
}

function handleDidItemIndexed(
  progress: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>,
  urisCount: number
) {
  !isProgressStepCalculated() && calculateProgressStep(urisCount);
  increaseCurrentProgressValue();
  reportCurrentProgress(progress, urisCount);
}

function isProgressStepCalculated(): boolean {
  return !!workspaceIndexer.getProgressStep();
}

function calculateProgressStep(urisCount: number): void {
  setProgressStep(100 / urisCount);
}

function increaseCurrentProgressValue(): void {
  const progressStep = workspaceIndexer.getProgressStep();
  const currentProgressValue = workspaceIndexer.getCurrentProgressValue();
  setCurrentProgressValue(currentProgressValue + progressStep);
}

function reportCurrentProgress(
  progress: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>,
  urisCount: number
): void {
  countScannedUri++;
  progress.report({
    increment: workspaceIndexer.getProgressStep(),
    message: ` ${countScannedUri} / ${urisCount} ... ${`${Math.round(
      workspaceIndexer.getCurrentProgressValue()
    )}%`}`,
  });
}

function getNotificationLocation(): vscode.ProgressLocation {
  return fetchShouldDisplayNotificationInStatusBar()
    ? vscode.ProgressLocation.Window
    : vscode.ProgressLocation.Notification;
}

function getNotificationTitle(): string {
  return fetchShouldDisplayNotificationInStatusBar()
    ? "Indexing..."
    : "Indexing workspace... file";
}

function setProgressStep(newProgressStep: number) {
  progressStep = newProgressStep;
}

function getProgressStep() {
  return progressStep;
}

function setCurrentProgressValue(newCurrentProgressValue: number) {
  currentProgressValue = newCurrentProgressValue;
}

function getCurrentProgressValue() {
  return currentProgressValue;
}

let progressStep = 0;
let currentProgressValue = 0;
let countScannedUri = 0;

function convertMsToSec(timeInMs: number) {
  return Math.floor((timeInMs % (1000 * 60)) / 1000);
}

export const workspaceIndexer = {
  convertMsToSec,
  getProgressStep,
  getCurrentProgressValue,
  getData,
  index,
  reindex,
  indexWithProgress,
  indexWithProgressTask,
  registerAction,
  isRebuilding,
  downloadData,
  cancelIndexing,
  handleCancellationRequested,
  handleDidItemIndexed,
  getNotificationLocation,
  getNotificationTitle,
};
