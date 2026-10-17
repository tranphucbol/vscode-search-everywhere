import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../config";
import { dataConverter } from "../../dataConverter";
import { liveSymbols } from "../../liveSymbols";
import { logger } from "../../logger";
import { patternProvider } from "../../patternProvider";
import { ItemsFilter } from "../../types";
import { stubMultiple } from "../util/stubHelpers";

const WORKSPACE_ROOT = "/workspace";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  const stubProviders = (
    symbols: vscode.SymbolInformation[] | Promise<never>,
    itemsFilter: ItemsFilter = {}
  ) => {
    const [executeCommandStub] = stubMultiple(
      [
        {
          object: vscode.commands,
          method: "executeCommand",
          returns: symbols instanceof Promise ? symbols : Promise.resolve(symbols),
        },
        {
          object: vscode.workspace,
          method: "getWorkspaceFolder",
          callsFake: (uri: vscode.Uri) =>
            uri.scheme === "file" && uri.path.startsWith(`${WORKSPACE_ROOT}/`)
              ? { uri: vscode.Uri.file(WORKSPACE_ROOT), name: "workspace", index: 0 }
              : undefined,
        },
        {
          object: vscode.workspace,
          method: "asRelativePath",
          callsFake: (uri: vscode.Uri) =>
            uri.path.slice(WORKSPACE_ROOT.length + 1),
        },
        {
          object: patternProvider,
          method: "isIncluded",
          callsFake: (relativePath: string) =>
            !relativePath.startsWith("node_modules/"),
        },
        { object: config, method: "fetchItemsFilter", returns: itemsFilter },
        { object: dataConverter, method: "getIcons", returns: {} },
        { object: logger, method: "log" },
      ],
      sandbox
    );
    return executeCommandStub;
  };

  return {
    beforeEach: () => {
      liveSymbols.resetTimeoutLog();
    },
    afterEach: () => {
      sandbox.restore();
    },
    stubProviders,
    useFakeTimers: () => sandbox.useFakeTimers(),
  };
};
