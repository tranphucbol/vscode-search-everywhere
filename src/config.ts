import * as vscode from "vscode";
import { getConfigByKey, updateConfigByKey } from "./cache";
import { effectiveValue, getActivePresets, PresetKey } from "./presets";
import {
  Category,
  ExcludeMode,
  Icons,
  ItemsFilter,
  ItemsFilterPhrases,
} from "./types";

const defaultSection = "searchEverywhere";
const CODICON_ID_REGEX = /^[a-z0-9-]+$/;
const keys = {
  shouldDisplayNotificationInStatusBar: {
    name: "shouldDisplayNotificationInStatusBar",
    value: false,
  },
  shouldInitOnStartup: {
    name: "shouldInitOnStartup",
    value: false,
  },
  shouldHighlightSymbol: {
    name: "shouldHighlightSymbol",
    value: false,
  },
  shouldUseDebounce: {
    name: "shouldUseDebounce",
    value: false,
  },
  icons: {
    name: "icons",
    value: {} as Icons,
  },
  itemsFilter: {
    name: "itemsFilter",
    value: {
      allowedKinds: [],
      ignoredKinds: [],
      ignoredNames: [],
    } as ItemsFilter,
  },
  excludeProperties: {
    name: "excludeProperties",
    value: true,
  },
  excludeVariables: {
    name: "excludeVariables",
    value: false,
  },
  shouldUseItemsFilterPhrases: {
    name: "shouldUseItemsFilterPhrases",
    value: false,
  },
  itemsFilterPhrases: {
    name: "itemsFilterPhrases",
    value: {} as ItemsFilterPhrases,
  },
  categories: {
    name: "categories",
    value: [
      {
        name: "Types",
        phrase: "@@",
        kinds: [4, 9, 10, 22],
        icon: "symbol-class",
      },
      {
        name: "Members",
        phrase: "!!",
        kinds: [5, 6, 7, 8, 11, 12, 13, 21, 23, 24],
        icon: "symbol-method",
      },
      { name: "Files", phrase: "$$", kinds: [0], icon: "files" },
    ] as Category[],
  },
  helpPhrase: {
    name: "helpPhrase",
    value: "?",
  },
  shouldItemsBeSorted: {
    name: "shouldItemsBeSorted",
    value: false,
  },
  shouldSearchSelection: {
    name: "shouldSearchSelection",
    value: true,
  },
  exclude: {
    name: "exclude",
    value: [] as string[],
  },
  include: {
    name: "include",
    value: "",
  },
  excludeMode: {
    name: "excludeMode",
    value: ExcludeMode.SearchEverywhere,
  },
  shouldWorkspaceDataBeCached: {
    name: "shouldWorkspaceDataBeCached",
    value: true,
  },
  shareCacheAcrossWorktrees: {
    name: "shareCacheAcrossWorktrees",
    value: true,
  },
  showRecentItemsOnEmptyQuery: {
    name: "showRecentItemsOnEmptyQuery",
    value: true,
  },
  recentItemsLimit: {
    name: "recentItemsLimit",
    value: 10,
  },
  rankRecentItemsHigher: {
    name: "rankRecentItemsHigher",
    value: true,
  },
  useFileIconTheme: {
    name: "useFileIconTheme",
    value: false,
  },
  previewOnSelect: {
    name: "previewOnSelect",
    value: true,
  },
  restoreLastQuery: {
    name: "restoreLastQuery",
    value: true,
  },
  indexNamesOnly: {
    name: "indexNamesOnly",
    value:
      "**/*.{json,jsonc,yaml,yml,xml,properties,toml,ini,csv,md,txt,lock,sum,mod,work,gradle,sql}",
  },
  secondaryCode: {
    name: "secondaryCode",
    value: [
      "**/*_test.go",
      "**/mock_*.go",
      "**/mocks/**",
      "**/*.pb.go",
      "**/*_gen.go",
      "**/*.gen.go",
      "**/zz_generated*",
      "**/src/test/**",
      "**/generated/**",
      "**/generated-sources/**",
      "**/__tests__/**",
      "**/*.{test,spec}.{ts,tsx,js,jsx}",
    ],
  },
  languagePresets: {
    name: "languagePresets",
    value: "auto",
  },
};

function getConfigurationByKey<T>(
  key: string,
  defaultValue: T,
  customSection?: string
): T {
  return getConfiguration<T>(
    `${customSection ? customSection : defaultSection}.${key}`,
    defaultValue
  );
}

function get<T>(key: string, defaultValue: T, customSection?: string): T {
  const cacheKey = `${customSection ? customSection : defaultSection}.${key}`;
  let value = getConfigByKey<T>(cacheKey);
  if (!value) {
    value = getConfigurationByKey<T>(key, defaultValue, customSection);
    updateConfigByKey(cacheKey, value);
  }
  return value as T;
}

function getUserValue<T>(key: string): T | undefined {
  const inspected = vscode.workspace
    .getConfiguration(defaultSection)
    .inspect<T>(key);
  if (!inspected) {
    return undefined;
  }
  return inspected.workspaceFolderValue !== undefined
    ? inspected.workspaceFolderValue
    : inspected.workspaceValue !== undefined
    ? inspected.workspaceValue
    : inspected.globalValue;
}

function withPresets<T>(key: PresetKey, value: T): T {
  const presets = getActivePresets();
  if (!presets.length || fetchLanguagePresets() !== "auto") {
    return value;
  }
  return effectiveValue(key, getUserValue<T>(key), presets);
}

function getFilesExclude(): string[] {
  return get(keys.exclude.name, keys.exclude.value, "files");
}

function getSearchExclude(): string[] {
  return get(keys.exclude.name, keys.exclude.value, "search");
}

function getConfiguration<T>(section: string, defaultValue: T): T {
  const config = vscode.workspace.getConfiguration("");
  return config.get<T>(section, defaultValue);
}

export function fetchShouldDisplayNotificationInStatusBar(): boolean {
  return get(
    keys.shouldDisplayNotificationInStatusBar.name,
    keys.shouldDisplayNotificationInStatusBar.value
  );
}

export function fetchShouldInitOnStartup(): boolean {
  return get(keys.shouldInitOnStartup.name, keys.shouldInitOnStartup.value);
}

export function fetchShouldHighlightSymbol(): boolean {
  return get(keys.shouldHighlightSymbol.name, keys.shouldHighlightSymbol.value);
}

export function fetchShouldUseDebounce(): boolean {
  return get(keys.shouldUseDebounce.name, keys.shouldUseDebounce.value);
}

export function fetchIcons(): Icons {
  return get(keys.icons.name, keys.icons.value);
}

export function fetchShouldExcludeProperties(): boolean {
  return get(keys.excludeProperties.name, keys.excludeProperties.value);
}

export function fetchShouldExcludeVariables(): boolean {
  return get(keys.excludeVariables.name, keys.excludeVariables.value);
}

export function fetchItemsFilter(): ItemsFilter {
  const filter = withPresets(
    "itemsFilter",
    get(keys.itemsFilter.name, keys.itemsFilter.value)
  );
  const shouldExcludeProperties = fetchShouldExcludeProperties();
  const shouldExcludeVariables = fetchShouldExcludeVariables();

  if (shouldExcludeProperties || shouldExcludeVariables) {
    const ignored = new Set(filter.ignoredKinds || []);
    const allowed = new Set(filter.allowedKinds || []);

    // vscode.SymbolKind.Property = 6
    if (shouldExcludeProperties && !allowed.has(6)) {
      ignored.add(6);
    }
    // vscode.SymbolKind.Variable = 12
    if (shouldExcludeVariables && !allowed.has(12)) {
      ignored.add(12);
    }
    return {
      ...filter,
      ignoredKinds: Array.from(ignored),
    };
  }
  return filter;
}

export function fetchShouldUseItemsFilterPhrases(): boolean {
  return get(
    keys.shouldUseItemsFilterPhrases.name,
    keys.shouldUseItemsFilterPhrases.value
  );
}

export function fetchItemsFilterPhrases(): ItemsFilterPhrases {
  return get(keys.itemsFilterPhrases.name, keys.itemsFilterPhrases.value);
}

export function fetchCategories(): Category[] {
  const categories = get(keys.categories.name, keys.categories.value);
  if (!Array.isArray(categories)) {
    return [];
  }
  return categories
    .filter(
      (category) =>
        !!category &&
        typeof category.phrase === "string" &&
        category.phrase.length > 0 &&
        Array.isArray(category.kinds) &&
        category.kinds.length > 0
    )
    .map((category) => {
      if (category.icon === undefined || isCodiconId(category.icon)) {
        return category;
      }
      const { icon, ...rest } = category;
      return rest;
    });
}

function isCodiconId(icon: unknown): boolean {
  return typeof icon === "string" && CODICON_ID_REGEX.test(icon);
}

export function fetchHelpPhrase(): string {
  return get(keys.helpPhrase.name, keys.helpPhrase.value);
}

export function fetchShouldItemsBeSorted(): boolean {
  return get(keys.shouldItemsBeSorted.name, keys.shouldItemsBeSorted.value);
}

export function fetchShouldSearchSelection(): boolean {
  return get(keys.shouldSearchSelection.name, keys.shouldSearchSelection.value);
}

export function fetchPreviewOnSelect(): boolean {
  return get(keys.previewOnSelect.name, keys.previewOnSelect.value);
}

export function fetchRestoreLastQuery(): boolean {
  return get(keys.restoreLastQuery.name, keys.restoreLastQuery.value);
}

export function fetchIndexNamesOnly(): string {
  return get(keys.indexNamesOnly.name, keys.indexNamesOnly.value);
}

export function fetchSecondaryCode(): string[] {
  const globs = get(keys.secondaryCode.name, keys.secondaryCode.value);
  return Array.isArray(globs)
    ? globs.filter((glob) => typeof glob === "string" && glob.length > 0)
    : [];
}

export function fetchExclude(): string[] {
  return withPresets("exclude", get(keys.exclude.name, keys.exclude.value));
}

export function fetchInclude(): string {
  return withPresets("include", get(keys.include.name, keys.include.value));
}

/**
 * The effective settings an index was built with, as a string to compare
 * against the next start: a preset appearing or going away changes it.
 */
export function fetchIndexedConfigSnapshot(): string {
  return JSON.stringify({
    presets: fetchLanguagePresets() === "auto" ? getActivePresets() : [],
    include: fetchInclude(),
    exclude: fetchExclude(),
    itemsFilter: fetchItemsFilter(),
  });
}

export function fetchLanguagePresets(): string {
  return get(keys.languagePresets.name, keys.languagePresets.value);
}

export function fetchFilesAndSearchExclude(): string[] {
  let excludePatterns: Array<string> = [];
  const filesExcludePatterns = getFilesExclude();
  const searchExcludePatterns = getSearchExclude();

  const allExcludePatterns = Object.assign(
    {},
    filesExcludePatterns,
    searchExcludePatterns
  );
  for (let [key, value] of Object.entries(allExcludePatterns)) {
    value && excludePatterns.push(key);
  }

  return excludePatterns;
}

export function fetchExcludeMode(): ExcludeMode {
  return get(keys.excludeMode.name, keys.excludeMode.value);
}

export function fetchShouldWorkspaceDataBeCached(): boolean {
  return get(
    keys.shouldWorkspaceDataBeCached.name,
    keys.shouldWorkspaceDataBeCached.value
  );
}

export function fetchShareCacheAcrossWorktrees(): boolean {
  return get(
    keys.shareCacheAcrossWorktrees.name,
    keys.shareCacheAcrossWorktrees.value
  );
}

export function fetchShowRecentItemsOnEmptyQuery(): boolean {
  return get(
    keys.showRecentItemsOnEmptyQuery.name,
    keys.showRecentItemsOnEmptyQuery.value
  );
}

export function fetchRecentItemsLimit(): number {
  return get(
    keys.recentItemsLimit.name,
    keys.recentItemsLimit.value
  );
}

export function fetchRankRecentItemsHigher(): boolean {
  return get(
    keys.rankRecentItemsHigher.name,
    keys.rankRecentItemsHigher.value
  );
}

export function fetchUseFileIconTheme(): boolean {
  return get(keys.useFileIconTheme.name, keys.useFileIconTheme.value);
}
