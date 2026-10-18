import * as vscode from "vscode";
import { fetchShouldDisplayNotificationInStatusBar } from "../../platform/config";

let progressStep = 0;
let currentProgressValue = 0;
let countScannedUri = 0;

function resetProgress() {
  setCurrentProgressValue(0);
  setProgressStep(0);
  countScannedUri = 0;
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
  return !!indexingProgress.getProgressStep();
}

function calculateProgressStep(urisCount: number): void {
  setProgressStep(100 / urisCount);
}

function increaseCurrentProgressValue(): void {
  const progressStep = indexingProgress.getProgressStep();
  const currentProgressValue = indexingProgress.getCurrentProgressValue();
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
    increment: indexingProgress.getProgressStep(),
    message: ` ${countScannedUri} / ${urisCount} ... ${`${Math.round(
      indexingProgress.getCurrentProgressValue()
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

export const indexingProgress = {
  resetProgress,
  getProgressStep,
  getCurrentProgressValue,
  handleDidItemIndexed,
  getNotificationLocation,
  getNotificationTitle,
};
