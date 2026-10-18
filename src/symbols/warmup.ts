import * as vscode from "vscode";
import { documentSymbols } from "./documentSymbols";
import { files } from "./files";
import { logger } from "../platform/logger";
import { asyncUtils } from "../shared/async";

type Progress = vscode.Progress<{
  message?: string | undefined;
  increment?: number | undefined;
}>;

const WARMUP_POLL_MS = 500;
const WARMUP_TIMEOUT_MS = 15_000;
// jdtls imports the Maven/Gradle build before it answers; 15 s is not enough on a cold start.
const SLOW_WARMUP_TIMEOUT_MS = 120_000;
const SLOW_LANGUAGES = new Set(["java", "kt"]);
const SCRIPT_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx"]);
const LANGUAGE_NAMES: { [language: string]: string } = {
  typescript: "TypeScript",
  go: "Go",
  java: "Java",
  kt: "Kotlin",
  py: "Python",
  cs: "C#",
  rs: "Rust",
};

const readyLanguages = new Set<string>();

function getLanguage(uri: vscode.Uri): string | undefined {
  const fileName = uri.path.split("/").pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return undefined;
  }
  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  return SCRIPT_EXTENSIONS.has(extension) ? "typescript" : extension;
}

function getLanguageName(language: string): string {
  return LANGUAGE_NAMES[language] || `.${language}`;
}

function isWarmupSample(uri: vscode.Uri): boolean {
  const path = uri.path.toLowerCase();
  return (
    !files.isNonSymbolFile(uri) &&
    !files.isNamesOnly(uri) &&
    !path.endsWith(".d.ts") &&
    !path.includes("test") &&
    !path.includes("fixtures")
  );
}

function pickWarmupSamples(uris: vscode.Uri[]): Map<string, vscode.Uri> {
  const urisByLanguage = new Map<string, vscode.Uri[]>();
  for (const uri of uris) {
    const language = getLanguage(uri);
    if (!language || readyLanguages.has(language) || !isWarmupSample(uri)) {
      continue;
    }
    const languageUris = urisByLanguage.get(language) || [];
    languageUris.push(uri);
    urisByLanguage.set(language, languageUris);
  }

  const samples = new Map<string, vscode.Uri>();
  urisByLanguage.forEach((languageUris, language) =>
    samples.set(language, languageUris[Math.floor(languageUris.length / 2)])
  );
  return samples;
}

async function warmupLanguageServers(
  uris: vscode.Uri[],
  isCancelled: () => boolean,
  progress?: Progress
): Promise<Set<string>> {
  const timedOut = new Set<string>();
  if (uris.length <= 1) {
    return timedOut;
  }

  const samples = pickWarmupSamples(uris);
  await Promise.all(
    Array.from(samples.entries()).map(async ([language, sampleUri]) => {
      const result = await warmupLanguageServer(
        language,
        sampleUri,
        isCancelled,
        progress
      );
      result === "ready" && readyLanguages.add(language);
      result === "timedOut" && timedOut.add(language);
    })
  );

  timedOut.size &&
    logger.log(
      `Language servers not ready after warm-up: ${Array.from(timedOut)
        .map(getLanguageName)
        .join(", ")}`
    );
  return timedOut;
}

async function warmupLanguageServer(
  language: string,
  sampleUri: vscode.Uri,
  isCancelled: () => boolean,
  progress?: Progress
): Promise<"ready" | "timedOut" | "unsupported"> {
  const languageName = getLanguageName(language);
  const timeoutMs = SLOW_LANGUAGES.has(language)
    ? SLOW_WARMUP_TIMEOUT_MS
    : WARMUP_TIMEOUT_MS;
  const maxAttempts = Math.ceil(timeoutMs / WARMUP_POLL_MS);
  const startedAt = Date.now();

  logger.log(`Waiting for the ${languageName} language server: ${sampleUri.path}`);
  try {
    const document = await vscode.workspace.openTextDocument(sampleUri);
    // No installed extension claims the file (e.g. .proto without a protobuf extension), so no
    // symbol provider will ever answer; waiting would only delay every index by the timeout.
    if (document?.languageId === "plaintext") {
      logger.log(
        `No extension provides the ${languageName} language; its files are indexed without symbols.`
      );
      return "unsupported";
    }
  } catch (e) {
    logger.log(`Failed to open sample document ${sampleUri.path}: ${e}`);
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const elapsedMs = Date.now() - startedAt;
    if (isCancelled() || elapsedMs >= timeoutMs) {
      break;
    }

    progress?.report({
      message: `Waiting for the ${languageName} language server (${Math.round(
        elapsedMs / 1000
      )} s)…`,
    });

    const rawSymbols = await documentSymbols.loadAllSymbolsForUri(sampleUri);
    if (rawSymbols && rawSymbols.length > 0) {
      logger.log(
        `The ${languageName} language server is ready after ${elapsedMs} ms.`
      );
      return "ready";
    }

    await asyncUtils.sleep(WARMUP_POLL_MS);
  }

  logger.log(
    `The ${languageName} language server returned no symbols within ${
      timeoutMs / 1000
    } s.`
  );
  return "timedOut";
}

function resetLanguageWarmup() {
  readyLanguages.clear();
}

export const warmup = {
  getLanguage,
  warmupLanguageServers,
  resetLanguageWarmup,
};
