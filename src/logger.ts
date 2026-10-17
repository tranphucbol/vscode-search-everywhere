import * as vscode from "vscode";
import { Action, IndexStats, WorkspaceData } from "./types";
import { workspaceFolders } from "./shared/workspaceFolders";

function init() {
  const channel = vscode.window.createOutputChannel("Search everywhere");
  setChannel(channel);
}

function log(message: string) {
  const timestamp = logger.getTimestamp();
  const channel = logger.getChannel();
  channel.appendLine(`[${timestamp}] ${message}`);
}

function logAction(action: Action) {
  const message = `Execute action - type: ${action.type} | fn: ${
    action.fn.name
  } | trigger: ${action.trigger} ${action.uri ? `| uri: ${action.uri}` : ""}`;
  logger.log(message);
}

function logScanTime(indexStats: IndexStats) {
  const message = `Workspace scan completed - elapsed time: ${indexStats.ElapsedTimeInSeconds}s | scanned files: ${indexStats.ScannedUrisCount} | indexed items: ${indexStats.IndexedItemsCount}`;
  logger.log(message);
}

function logStructure(data: WorkspaceData) {
  const message = `Scanned files:
  ${logger.getStructure(data)}`;
  logger.log(message);
}

function getDataForBuildingStructure(data: WorkspaceData) {
  const uriWithNoOfItems = Array.from(data.items).map((keyValue) => {
    const [key, value] = keyValue;
    let normalizedPath = workspaceFolders.normalizeUriPath(key);
    normalizedPath = normalizedPath.replace("/", "");
    const itemsCount = value.elements.length;
    return [normalizedPath, itemsCount] as const;
  });
  return new Map<string, number>(uriWithNoOfItems);
}

function buildStructure(paths: string[], normalizedData: Map<string, number>) {
  const structure: { [key: string]: {} } = {};
  paths.forEach(function (path) {
    const splittedPath = path.split("/");
    splittedPath.reduce((currentStructure, node, index) => {
      let text: {} | string = {};
      if (index === splittedPath.length - 1) {
        const value = normalizedData.get(path) || 0;
        text = `${value} ${value === 1 ? "item" : "items"}`;
      }
      return currentStructure[node] || (currentStructure[node] = text);
    }, structure);
  });
  return structure;
}

function getStructure(data: WorkspaceData) {
  if (data.items.size > 500) {
    return `[Structure omitted for large workspace (${data.items.size} files, ${data.count} items)]`;
  }
  const normalizedData = getDataForBuildingStructure(data);
  const paths = Array.from(normalizedData.keys());
  const structure = buildStructure(paths, normalizedData);

  return JSON.stringify(structure, null, 2);
}

function getTimestamp() {
  const date = new Date();

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

let channel: vscode.OutputChannel;

function setChannel(newChannel: vscode.OutputChannel) {
  channel = newChannel;
}

function getChannel() {
  return channel;
}

export const logger = {
  getTimestamp,
  getChannel,
  init,
  log,
  logAction,
  logScanTime,
  getStructure,
  logStructure,
};
