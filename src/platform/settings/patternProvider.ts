import * as vscode from "vscode";
import {
  fetchExclude,
  fetchExcludeMode,
  fetchFilesAndSearchExclude,
  fetchAlwaysInclude,
  fetchInclude,
} from "./config";
import { ExcludeMode } from "../../shared/types";
import { matchesGlob, mergeGlobs } from "../../shared/glob";

const endLineRegex = /[^\r\n]+/g;
const gitignoreFilePattern = "**/.gitignore";

async function getGitignoreExclude() {
  const gitignoreExcludePatterns = await getGitignoreOrFallbackExclude();
  return gitignoreExcludePatterns;
}

async function getGitignoreOrFallbackExclude(): Promise<string[]> {
  const gitignoreExclude = await fetchGitignoreExclude();
  const fallbackExclude = patternProvider.getFallbackExcludePatterns();

  return gitignoreExclude || fallbackExclude;
}

async function fetchGitignoreExclude(): Promise<string[] | null> {
  const gitignoreFile = await getGitignoreFile();
  if (gitignoreFile) {
    const text = await getGitignoreFileText(gitignoreFile);
    const lines = textToLines(text);
    return lines.length ? removeLinesWithComments(lines) : null;
  }
  return null;
}

async function getGitignoreFile(): Promise<vscode.Uri | null> {
  const files = await vscode.workspace.findFiles(gitignoreFilePattern);

  return files.length >= 1 ? files[0] : null;
}

async function getGitignoreFileText(uri: vscode.Uri): Promise<string> {
  const document = await vscode.workspace.openTextDocument(uri);
  return document.getText();
}

function textToLines(text: string): string[] {
  return text.match(endLineRegex) || [];
}

function removeLinesWithComments(lines: string[]): string[] {
  return lines.filter((line) => !line.startsWith("#"));
}

function getExcludePatternsAsString(patterns: string[]): string {
  const excludePatternsFormat: { [k: number]: string } = {
    0: "",
    1: patterns[0],
    [patterns.length > 1 ? patterns.length : -1]: `{${patterns.join(",")}}`,
  };

  return excludePatternsFormat[patterns.length];
}

function getActiveExcludePatterns(): string[] {
  const excludePatterns: { [k: string]: string[] } = {
    [ExcludeMode.SearchEverywhere]:
      patternProvider.getExtensionExcludePatterns(),
    [ExcludeMode.FilesAndSearch]:
      patternProvider.getFilesAndSearchExcludePatterns(),
    [ExcludeMode.Gitignore]: patternProvider.getGitignoreExcludePatterns(),
  };

  return excludePatterns[patternProvider.getExcludeMode()];
}

async function getExcludePatterns(): Promise<string> {
  return getExcludePatternsAsString(getActiveExcludePatterns());
}

function isExcluded(relativePath: string): boolean {
  return matchesGlob(relativePath, getActiveExcludePatterns());
}

function isIncluded(relativePath: string): boolean {
  return (
    matchesGlob(relativePath, patternProvider.getIncludePatterns()) &&
    !patternProvider.isExcluded(relativePath)
  );
}

function isAlwaysIncludedOnly(relativePath: string): boolean {
  return (
    matchesGlob(relativePath, alwaysIncludePatterns) &&
    !(includePattern && matchesGlob(relativePath, includePattern)) &&
    !patternProvider.isExcluded(relativePath)
  );
}

async function fetchConfig() {
  const excludeMode = fetchExcludeMode();
  setExcludeMode(excludeMode);

  setIncludePatterns(fetchInclude(), fetchAlwaysInclude());

  const extensionExcludePatterns = fetchExclude();
  setExtensionExcludePatterns(extensionExcludePatterns);

  const fallbackExcludePatterns = patternProvider.getExtensionExcludePatterns();
  setFallbackExcludePatterns(fallbackExcludePatterns);

  const filesAndSearchExcludePatterns = fetchFilesAndSearchExclude();
  setFilesAndSearchExcludePatterns(filesAndSearchExcludePatterns);

  const gitignoreExcludePatterns = await getGitignoreExclude();
  setGitignoreExcludePatterns(gitignoreExcludePatterns);
}

function getExcludeMode() {
  return excludeMode;
}

function setExcludeMode(newExcludeMode: ExcludeMode) {
  excludeMode = newExcludeMode;
}

function getIncludePatterns(): string[] {
  return includePatterns;
}

function getIncludeGlob(): string {
  return mergeGlobs(patternProvider.getIncludePatterns());
}

function setIncludePatterns(include: string, alwaysInclude: string[]) {
  includePattern = include;
  alwaysIncludePatterns = alwaysInclude.filter((glob) => !!glob);
  includePatterns = Array.from(
    new Set([include, ...alwaysIncludePatterns].filter((glob) => !!glob))
  );
}

function getExtensionExcludePatterns() {
  return extensionExcludePatterns;
}

function setExtensionExcludePatterns(newExtensionExcludePatterns: string[]) {
  extensionExcludePatterns = newExtensionExcludePatterns;
}

function getFallbackExcludePatterns() {
  return fallbackExcludePatterns;
}

function setFallbackExcludePatterns(newFallbackExcludePatterns: string[]) {
  fallbackExcludePatterns = newFallbackExcludePatterns;
}

function getFilesAndSearchExcludePatterns() {
  return filesAndSearchExcludePatterns;
}

function setFilesAndSearchExcludePatterns(
  newFilesAndSearchExcludePatterns: string[]
) {
  filesAndSearchExcludePatterns = newFilesAndSearchExcludePatterns;
}

function getGitignoreExcludePatterns() {
  return gitignoreExcludePatterns;
}

function setGitignoreExcludePatterns(newGitignoreExcludePatterns: string[]) {
  gitignoreExcludePatterns = newGitignoreExcludePatterns;
}

let excludeMode = ExcludeMode.SearchEverywhere;
let includePattern = "";
let alwaysIncludePatterns: string[] = [];
let includePatterns: string[] = [];
let extensionExcludePatterns: string[] = [];
let filesAndSearchExcludePatterns: string[] = [];
let gitignoreExcludePatterns: string[] = [];
let fallbackExcludePatterns: string[] = [];

export const patternProvider = {
  getExcludeMode,
  getIncludePatterns,
  getIncludeGlob,
  getExtensionExcludePatterns,
  getFilesAndSearchExcludePatterns,
  getGitignoreExcludePatterns,
  getFallbackExcludePatterns,
  getExcludePatterns,
  isExcluded,
  isIncluded,
  isAlwaysIncludedOnly,
  fetchConfig,
};
