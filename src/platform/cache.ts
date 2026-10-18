import * as vscode from "vscode";
import { QuickPickItem } from "../shared/types";

export const cacheKeys = {
  dataCacheKey: "data",
  configCacheKey: "config",
  notSaveUriPathsKey: "notSavedUris",
  recentItemsKey: "recentItems",
  indexedConfigKey: "indexedConfig",
};

let extensionContext: vscode.ExtensionContext;

export function initCache(context: vscode.ExtensionContext) {
  extensionContext = context;
}

export function getData(): QuickPickItem[] | undefined {
  const data: any = extensionContext.workspaceState.get(cacheKeys.dataCacheKey);

  return data && data.length ? data : [];
}

export function updateData(data: QuickPickItem[]): void {
  extensionContext.workspaceState.update(cacheKeys.dataCacheKey, data);
}

export function getNotSavedUriPaths(): string[] {
  const paths: string[] | undefined = extensionContext.workspaceState.get(
    cacheKeys.notSaveUriPathsKey
  );

  return paths || [];
}

export function updateNotSavedUriPaths(paths: string[]): void {
  extensionContext.workspaceState.update(cacheKeys.notSaveUriPathsKey, paths);
}

export function getConfigByKey<T>(key: string): T | undefined {
  const cache: any = extensionContext.workspaceState.get(
    cacheKeys.configCacheKey
  );

  return cache ? cache[key] : undefined;
}

export function updateConfigByKey<T>(key: string, value: T): void {
  let cache: any =
    extensionContext.workspaceState.get(cacheKeys.configCacheKey) || {};
  cache[key] = value;

  extensionContext.workspaceState.update(cacheKeys.configCacheKey, cache);
}

export function clear(): void {
  clearData();
  clearConfig();
  clearRecentItems();
}

export function clearConfig(): void {
  extensionContext.workspaceState.update(cacheKeys.configCacheKey, {});
}

function clearData(): void {
  extensionContext.workspaceState.update(cacheKeys.dataCacheKey, []);
}

export function clearNotSavedUriPaths(): void {
  extensionContext.workspaceState.update(cacheKeys.notSaveUriPathsKey, []);
}

export function getIndexedConfig(): string | undefined {
  return extensionContext?.workspaceState?.get(cacheKeys.indexedConfigKey);
}

export function updateIndexedConfig(snapshot: string): void {
  extensionContext?.workspaceState?.update(
    cacheKeys.indexedConfigKey,
    snapshot
  );
}

export function getRecentItems<T>(): T[] {
  const items: T[] | undefined = extensionContext?.workspaceState?.get(
    cacheKeys.recentItemsKey
  );
  return items || [];
}

export function updateRecentItems<T>(items: T[]): void {
  extensionContext?.workspaceState?.update(cacheKeys.recentItemsKey, items);
}

export function clearRecentItems(): void {
  extensionContext?.workspaceState?.update(cacheKeys.recentItemsKey, []);
}
