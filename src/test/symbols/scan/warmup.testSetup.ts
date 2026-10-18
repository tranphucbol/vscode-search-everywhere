import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/settings/config";
import { warmup } from "../../../symbols/scan/warmup";
import { logger } from "../../../platform/logger";
import { asyncUtils } from "../../../shared/async";
import { workspaceFolders } from "../../../shared/workspaceFolders";
import { getDocumentSymbolItemSingleLineArray } from "../../util/itemMockFactory";
import { stubMultiple } from "../../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();
  return {
    beforeEach: () => {
      sandbox.stub(logger, "log");
    },
    afterEach: () => {
      sandbox.restore();
    },

    warmup: {
      setupForWarmup: (
        readyExtensions: string[],
        namesOnlyGlob = "**/*.json",
        plaintextExtensions: string[] = []
      ) => {
        warmup.resetLanguageWarmup();
        const extensionOf = (uri: vscode.Uri) => uri.path.split(".").pop()!;
        const isReady = (uri: vscode.Uri) =>
          readyExtensions.includes(extensionOf(uri));
        const [openTextDocumentStub, executeCommandStub, sleepStub] =
          stubMultiple(
            [
              {
                object: vscode.workspace,
                method: "openTextDocument",
                callsFake: async (uri: vscode.Uri) => ({
                  languageId: plaintextExtensions.includes(extensionOf(uri))
                    ? "plaintext"
                    : extensionOf(uri),
                }),
              },
              {
                object: vscode.commands,
                method: "executeCommand",
                callsFake: async (_command: string, uri: vscode.Uri) =>
                  isReady(uri) ? getDocumentSymbolItemSingleLineArray(1) : [],
              },
              {
                object: asyncUtils,
                method: "sleep",
              },
              {
                object: config,
                method: "fetchIndexNamesOnly",
                returns: namesOnlyGlob,
              },
              {
                object: workspaceFolders,
                method: "normalizeUriPath",
                callsFake: (path: string) => path.replace("/./fake", ""),
              },
            ],
            sandbox
          );
        return { openTextDocumentStub, executeCommandStub, sleepStub };
      },
    },
  };
};
