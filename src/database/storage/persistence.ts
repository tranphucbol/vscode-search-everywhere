import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { fetchShareCacheAcrossWorktrees } from "../../platform/config";
import { gitService } from "../../platform/gitService";
import { logger } from "../../platform/logger";
import { createTables } from "./schema";
import { markDirty, state } from "../state";
import { getCount } from "./store";

let dbPath: string;
let sqlJs: any;
let persistTimer: NodeJS.Timeout | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let seedMeta: SeedMeta | undefined;
let persistInFlight: Promise<void> | undefined;
let persistPending = false;
let persistPendingTemplate = false;
let repoFingerprint: string | undefined;
let repoFingerprintResolved = false;
let templateGitState: TemplateGitState | undefined;
let templateGitStateEpoch = -1;
// Bumped by closeDatabase so a background save that outlives its connection does not rename
// its file over the newer one written on shutdown.
let dbGeneration = 0;

interface TemplateGitState {
  commit?: string;
  dirtyPaths: string[];
}

export interface SeedMeta {
  commit?: string;
  dirtyPaths?: string[];
}

const PERSIST_DEBOUNCE_MS = 10000;
const TEMP_SUFFIX = ".tmp";
// The shutdown save may run while a background save still writes TEMP_SUFFIX.
const EXIT_TEMP_SUFFIX = ".exit.tmp";
const CORRUPT_SUFFIX = ".corrupt";
// Worktrees of one repository share a template, and their windows may write it at the same time.
const TEMPLATE_TEMP_SUFFIX = `.${process.pid}${TEMP_SUFFIX}`;
const TEMPLATE_EXIT_TEMP_SUFFIX = `.${process.pid}${EXIT_TEMP_SUFFIX}`;

export async function initDatabase(
  context: vscode.ExtensionContext
): Promise<void> {
  const initSqlJs = require("sql.js");

  let locateFileOpt: any = undefined;
  if (context && context.extensionPath) {
    const candidates = [
      path.join(
        context.extensionPath,
        "node_modules",
        "sql.js",
        "dist",
        "sql-wasm.wasm"
      ),
      path.join(
        __dirname,
        "..",
        "..",
        "node_modules",
        "sql.js",
        "dist",
        "sql-wasm.wasm"
      ),
      path.join(
        __dirname,
        "..",
        "node_modules",
        "sql.js",
        "dist",
        "sql-wasm.wasm"
      ),
    ];
    const wasmPath = candidates.find((p) => fs.existsSync(p));
    if (wasmPath) {
      locateFileOpt = (file: string) => {
        if (file.endsWith(".wasm")) {
          return wasmPath;
        }
        return file;
      };
    }
  }

  sqlJs = await initSqlJs(
    locateFileOpt ? { locateFile: locateFileOpt } : undefined
  );

  extensionContext = context;
  const storageUri = (context && (context.storageUri || context.globalStorageUri)) || undefined;
  if (storageUri && storageUri.fsPath) {
    const storagePath = storageUri.fsPath;
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    dbPath = path.join(storagePath, "search-everywhere-index.db");
  }

  state.dirty = false;
  state.templateStale = false;
  repoFingerprint = undefined;
  repoFingerprintResolved = false;
  templateGitState = undefined;
  templateGitStateEpoch = -1;
  if (dbPath) {
    removeLeftoverTempFiles();
  }
  if (dbPath && fetchShareCacheAcrossWorktrees()) {
    await resolveRepoFingerprint();
  }

  if (dbPath && fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      state.db = new sqlJs.Database(fileBuffer);
      // SQLite reads the header lazily, so a damaged file only fails on the first query.
      state.db.exec("SELECT count(*) FROM sqlite_master");
    } catch {
      if (state.db) {
        try {
          state.db.close();
        } catch {}
      }
      moveCorruptFileAside();
      state.db = new sqlJs.Database();
    }
  } else {
    let seeded = false;
    const template = fetchShareCacheAcrossWorktrees() ? getTemplateTarget() : undefined;
    if (dbPath && template) {
      try {
        if (fs.existsSync(template.dbPath) && fs.existsSync(template.metaPath)) {
          const meta = JSON.parse(fs.readFileSync(template.metaPath, "utf8"));
          seedMeta = { commit: meta.commit, dirtyPaths: meta.dirtyPaths };
          const templateRootUriStr = meta.templateRootUri;
          const currentRootUriStr = template.rootUri;

          const fileBuffer = fs.readFileSync(template.dbPath);
          state.db = new sqlJs.Database(fileBuffer);

          if (templateRootUriStr && templateRootUriStr !== currentRootUriStr) {
            state.db.run("UPDATE symbols SET uri = replace(uri, ?, ?)", [
              templateRootUriStr,
              currentRootUriStr,
            ]);
            try {
              state.db.run("UPDATE file_state SET uri = replace(uri, ?, ?)", [
                templateRootUriStr,
                currentRootUriStr,
              ]);
            } catch {
              // Templates written before schema 5 have no file_state table.
            }
          }

          markDirty();
          writeIndexFileSync(false);
          // The template already holds these rows; only later changes make it stale.
          state.templateStale = false;

          state.seededFromTemplate = true;
          seeded = true;
          logger.log(
            `Seeded database from shared repository template (fingerprint: ${template.fingerprint})`
          );
        }
      } catch (error) {
        logger.log(`Failed to seed database from template: ${error}`);
      }
    }

    if (!seeded) {
      state.db = new sqlJs.Database();
    }
  }

  applyConnectionPragmas();

  createTables();
}

function applyConnectionPragmas(): void {
  try {
    state.db.run("PRAGMA synchronous = OFF;");
    state.db.run("PRAGMA journal_mode = MEMORY;");
    state.db.run("PRAGMA temp_store = MEMORY;");
    state.db.run("PRAGMA cache_size = -64000;"); // Bounded to 64 MB dynamic RAM ceiling per window
  } catch {
    // Ignore PRAGMA errors on in-memory databases
  }
}

// sql.js closes and reopens the connection to export it, which puts every PRAGMA back to its
// default (sql-wasm-debug.js, Database.export); without re-applying them search reads through
// a 2 MB page cache for the rest of the session.
function exportDatabase(): Uint8Array {
  const data = state.db.export();
  applyConnectionPragmas();
  return data;
}

function removeLeftoverTempFiles(): void {
  for (const suffix of [TEMP_SUFFIX, EXIT_TEMP_SUFFIX]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // Usually absent; nothing else to do when it cannot be removed.
    }
  }
}

function moveCorruptFileAside(): void {
  try {
    fs.renameSync(dbPath, dbPath + CORRUPT_SUFFIX);
  } catch (error) {
    try {
      fs.unlinkSync(dbPath);
    } catch {}
    logger.log(`Failed to move the unreadable index file aside: ${error}`);
  }
  logger.log("Index file could not be read; it was moved aside and the workspace will be reindexed.");
}

// Wraps the exported bytes without the second full copy Buffer.from(data) would make.
function exportBuffer(): Buffer {
  const data = exportDatabase();
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function logSaved(buffer: Buffer, startedAt: number): void {
  const megabytes = (buffer.byteLength / 1024 / 1024).toFixed(1);
  logger.log(`Saved index (${megabytes} MB) in ${Date.now() - startedAt} ms`);
}

// Clears state.dirty before exporting, so writes made while the file is being written mark the next
// save; a failed write sets it again so the next save retries.
async function writeIndexFile(includeTemplate: boolean): Promise<void> {
  if (!state.db || !dbPath) {
    return;
  }
  if (includeTemplate && state.templateStale && fetchShareCacheAcrossWorktrees()) {
    await resolveRepoFingerprint();
  }
  const staleTemplate = getStaleTemplateTarget();
  const template = includeTemplate ? staleTemplate : undefined;
  const writeIndex = state.dirty;
  if (!writeIndex && !template) {
    return;
  }
  const startedAt = Date.now();
  const generation = dbGeneration;
  const exportedEpoch = state.changeEpoch;
  const targetPath = dbPath;
  state.dirty = false;
  if (template) {
    state.templateStale = false;
  }
  let buffer: Buffer;
  let symbolCount = 0;
  try {
    buffer = exportBuffer();
    if (template) {
      symbolCount = getCount();
    }
  } catch (error) {
    state.dirty = state.dirty || writeIndex;
    state.templateStale = state.templateStale || !!template;
    logger.log(`Failed to save index: ${error}`);
    return;
  }
  if (writeIndex) {
    try {
      if (!(await replaceFile(targetPath, buffer, TEMP_SUFFIX, generation))) {
        return;
      }
    } catch (error) {
      state.dirty = true;
      state.templateStale = state.templateStale || !!template;
      logger.log(`Failed to save index: ${error}`);
      return;
    }
    logSaved(buffer, startedAt);
  }
  if (!staleTemplate) {
    return;
  }
  // Read after the export, so a file changed in between is at worst listed as state.dirty too.
  const gitState = await captureTemplateGitState();
  if (generation === dbGeneration && exportedEpoch === state.changeEpoch) {
    templateGitState = gitState;
    templateGitStateEpoch = exportedEpoch;
  }
  if (template) {
    await writeSharedTemplate(buffer, false, template, symbolCount, gitState, generation);
  }
}

// The shutdown save cannot wait for git. It reuses the state read by the last background save,
// and leaves the older, self-consistent template in place when the index changed after it.
function getCurrentTemplateGitState(): TemplateGitState | undefined {
  return templateGitStateEpoch === state.changeEpoch ? templateGitState : undefined;
}

async function captureTemplateGitState(): Promise<TemplateGitState> {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return { dirtyPaths: [] };
  }
  const rootPath = workspaceFolder.uri.fsPath;
  const [commit, dirtyPaths] = await Promise.all([
    gitService.getHeadCommit(rootPath),
    gitService.getWorkingTreePaths(rootPath),
  ]);
  return { commit, dirtyPaths };
}

function writeIndexFileSync(includeTemplate: boolean): void {
  if (!state.db || !dbPath) {
    return;
  }
  const staleTemplate = includeTemplate ? getStaleTemplateTarget() : undefined;
  const gitState = staleTemplate && getCurrentTemplateGitState();
  if (staleTemplate && !gitState) {
    logger.log("Shared index template not refreshed on exit: the index changed after the last background save.");
  }
  const template = gitState ? staleTemplate : undefined;
  const writeIndex = state.dirty;
  if (!writeIndex && !template) {
    return;
  }
  const startedAt = Date.now();
  state.dirty = false;
  if (template) {
    state.templateStale = false;
  }
  let buffer: Buffer;
  let symbolCount = 0;
  try {
    buffer = exportBuffer();
    if (template) {
      symbolCount = getCount();
    }
    if (writeIndex) {
      replaceFileSync(dbPath, buffer, EXIT_TEMP_SUFFIX);
    }
  } catch (error) {
    state.dirty = state.dirty || writeIndex;
    state.templateStale = state.templateStale || !!template;
    logger.log(`Failed to save index: ${error}`);
    return;
  }
  if (writeIndex) {
    logSaved(buffer, startedAt);
  }
  if (template) {
    writeSharedTemplate(buffer, true, template, symbolCount, gitState!, dbGeneration);
  }
}

/**
 * Writes the database, then its meta, each through a temp file, so a worktree seeding from the
 * template never pairs new meta with an old database.
 */
function writeSharedTemplate(
  buffer: Buffer,
  sync: true,
  target: TemplateTarget,
  symbolCount: number,
  gitState: TemplateGitState,
  generation: number
): void;
function writeSharedTemplate(
  buffer: Buffer,
  sync: false,
  target: TemplateTarget,
  symbolCount: number,
  gitState: TemplateGitState,
  generation: number
): Promise<void>;
function writeSharedTemplate(
  buffer: Buffer,
  sync: boolean,
  target: TemplateTarget,
  symbolCount: number,
  gitState: TemplateGitState,
  generation: number
): Promise<void> | void {
  const meta = JSON.stringify({
    fingerprint: target.fingerprint,
    templateRootUri: target.rootUri,
    symbolCount,
    lastUpdated: Date.now(),
    commit: gitState.commit,
    dirtyPaths: gitState.dirtyPaths,
  });
  const onError = (error: unknown) => {
    if (generation === dbGeneration) {
      state.templateStale = true;
    }
    logger.log(`Failed to save shared index template: ${error}`);
  };
  if (sync) {
    try {
      fs.mkdirSync(target.dir, { recursive: true });
      replaceFileSync(target.dbPath, buffer, TEMPLATE_EXIT_TEMP_SUFFIX);
      replaceFileSync(target.metaPath, meta, TEMPLATE_EXIT_TEMP_SUFFIX);
    } catch (error) {
      onError(error);
    }
    return;
  }
  return (async () => {
    try {
      await fs.promises.mkdir(target.dir, { recursive: true });
      if (await replaceFile(target.dbPath, buffer, TEMPLATE_TEMP_SUFFIX, generation)) {
        await replaceFile(target.metaPath, meta, TEMPLATE_TEMP_SUFFIX, generation);
      }
    } catch (error) {
      onError(error);
    }
  })();
}

// Returns false, leaving the target untouched, when the database was closed during the write:
// the shutdown save has already written newer bytes there.
async function replaceFile(
  targetPath: string,
  data: Buffer | string,
  tempSuffix: string,
  generation: number
): Promise<boolean> {
  const tempPath = targetPath + tempSuffix;
  await fs.promises.writeFile(tempPath, data);
  if (generation !== dbGeneration) {
    await fs.promises.unlink(tempPath).catch(() => undefined);
    return false;
  }
  await fs.promises.rename(tempPath, targetPath);
  return true;
}

function replaceFileSync(targetPath: string, data: Buffer | string, tempSuffix: string): void {
  const tempPath = targetPath + tempSuffix;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, targetPath);
}

interface TemplateTarget {
  fingerprint: string;
  rootUri: string;
  dir: string;
  dbPath: string;
  metaPath: string;
}

function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
}

function getTemplateTarget(): TemplateTarget | undefined {
  const workspaceFolder = getWorkspaceFolder();
  if (
    !repoFingerprint ||
    !workspaceFolder ||
    !extensionContext ||
    !extensionContext.globalStorageUri
  ) {
    return undefined;
  }
  const dir = extensionContext.globalStorageUri.fsPath;
  return {
    fingerprint: repoFingerprint,
    rootUri: workspaceFolder.uri.toString(),
    dir,
    dbPath: path.join(dir, `repo-${repoFingerprint}.db`),
    metaPath: path.join(dir, `repo-${repoFingerprint}.json`),
  };
}

function getStaleTemplateTarget(): TemplateTarget | undefined {
  if (!state.templateStale || !fetchShareCacheAcrossWorktrees()) {
    return undefined;
  }
  return getTemplateTarget();
}

// Runs git, so at most once per initDatabase; the result cannot change while the window is open.
async function resolveRepoFingerprint(): Promise<void> {
  if (repoFingerprintResolved) {
    return;
  }
  repoFingerprintResolved = true;
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder || !extensionContext || !extensionContext.globalStorageUri) {
    return;
  }
  try {
    repoFingerprint = await gitService.getRepoFingerprint(workspaceFolder.uri.fsPath);
  } catch {
    repoFingerprint = undefined;
  }
}

/**
 * Saves the index in the background when it changed since the last save, and with
 * `includeTemplate` also the shared worktree template when it changed since it was last written.
 * Single-flight: a call made while a save is writing returns that save's promise, which then
 * runs one more save with the options of every call that waited. Never rejects; a failed save
 * is logged and retried by the next call.
 */
export function persistToFile(
  options: { includeTemplate: boolean } = { includeTemplate: false }
): Promise<void> {
  if (persistInFlight) {
    persistPending = true;
    persistPendingTemplate = persistPendingTemplate || options.includeTemplate;
    return persistInFlight;
  }
  const run = async () => {
    let includeTemplate = options.includeTemplate;
    try {
      do {
        persistPending = false;
        await writeIndexFile(includeTemplate);
        includeTemplate = persistPendingTemplate;
        persistPendingTemplate = false;
      } while (persistPending);
    } finally {
      persistInFlight = undefined;
    }
  };
  persistInFlight = run();
  return persistInFlight;
}

/**
 * Saves the index and the shared template synchronously when they changed; only for shutdown,
 * where VS Code does not wait for promises.
 */
export function persistToFileSync(): void {
  writeIndexFileSync(true);
}

/** Cancels a scheduled save and saves now, shared template included; used after a full index. */
export function flushPersist(): Promise<void> {
  cancelScheduledPersist();
  return persistToFile({ includeTemplate: true });
}

function cancelScheduledPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
}

export function wasSeededFromTemplate(): boolean {
  return state.seededFromTemplate;
}

export function setSeededFromTemplate(value: boolean): void {
  state.seededFromTemplate = value;
}

export function getSeedMeta(): SeedMeta | undefined {
  return seedMeta;
}

export function clearSharedCache(): void {
  if (extensionContext && extensionContext.globalStorageUri) {
    const globalDir = extensionContext.globalStorageUri.fsPath;
    if (fs.existsSync(globalDir)) {
      const files = fs.readdirSync(globalDir);
      for (const file of files) {
        if (
          file.startsWith("repo-") &&
          (file.endsWith(".db") || file.endsWith(".json") || file.endsWith(TEMP_SUFFIX))
        ) {
          try {
            fs.unlinkSync(path.join(globalDir, file));
          } catch {
            // ignore
          }
        }
      }
      logger.log("Shared repository cache cleared successfully.");
    }
  }
}

export function schedulePersist(): void {
  cancelScheduledPersist();
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    persistToFile();
  }, PERSIST_DEBOUNCE_MS);
}

export function deleteDatabaseFile(): void {
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
}

export function closeDatabase(): void {
  cancelScheduledPersist();
  if (state.db) {
    persistToFileSync();
    state.db.close();
    state.db = undefined;
  }
  dbGeneration++;
  persistPending = false;
  persistPendingTemplate = false;
}

export function isReady(): boolean {
  return !!state.db;
}
