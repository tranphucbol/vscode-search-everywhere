import * as sinon from "sinon";
import * as vscode from "vscode";
import { quickPick } from "../../../quickPick/quickPick";
import { quickPickState } from "../../../quickPick/state";
import { itemLoader } from "../../../quickPick/view/itemLoader";
import { handOff } from "../../../quickPick/input/handOff";
import { stubMultiple } from "../../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    handOff: {
      setupForHandOff: ({
        handOffPrefixes = true,
        quickTextSearch = true,
      }: { handOffPrefixes?: boolean; quickTextSearch?: boolean } = {}) => {
        const control = vscode.window.createQuickPick<vscode.QuickPickItem>();
        // VS Code fires onDidHide when the quick pick is hidden.
        sandbox.stub(control, "hide").callsFake(() => quickPick.handleDidHide());
        const [executeCommandStub, getCommandsStub, loadItemsStub] =
          stubMultiple(
            [
              {
                object: vscode.commands,
                method: "executeCommand",
                returns: Promise.resolve(),
              },
              {
                object: vscode.commands,
                method: "getCommands",
                returns: Promise.resolve(
                  quickTextSearch ? ["workbench.action.quickTextSearch"] : []
                ),
              },
              { object: itemLoader, method: "loadItems" },
              { object: itemLoader, method: "loadHelpItems" },
              { object: quickPickState, method: "getControl", returns: control },
              {
                object: quickPickState,
                method: "getHandOffPrefixes",
                returns: handOffPrefixes,
              },
              {
                object: handOff,
                method: "supportsQuickTextSearch",
                returns: Promise.resolve(quickTextSearch),
              },
              {
                object: quickPickState,
                method: "getShouldUseItemsFilterPhrases",
                returns: true,
              },
              { object: quickPickState, method: "getHelpPhrase", returns: "?" },
              {
                object: quickPickState,
                method: "getCategories",
                returns: [{ name: "Types", phrase: ">>", kinds: [4] }],
              },
              {
                object: quickPickState,
                method: "getItemsFilterPhrases",
                returns: { 11: "ff" },
              },
            ],
            sandbox
          );
        const handOffCalls = () =>
          executeCommandStub
            .getCalls()
            .map((call) => call.args)
            .filter(([command]) => command !== "setContext");

        return {
          control,
          executeCommandStub,
          getCommandsStub,
          loadItemsStub,
          handOffCalls,
        };
      },
    },
  };
};
