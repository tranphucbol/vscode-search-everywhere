import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/settings/config";
import { patternProvider } from "../../../platform/settings/patternProvider";
import { ExcludeMode } from "../../../shared/types";
import { getItems } from "../../util/itemMockFactory";
import { getTextDocumentStub } from "../../util/stubFactory";
import { stubMultiple } from "../../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  const stubConfig = (include: string, alwaysInclude: string[]) => {
    stubMultiple(
      [
        {
          object: config,
          method: "fetchExcludeMode",
          returns: ExcludeMode.SearchEverywhere,
        },
        {
          object: config,
          method: "fetchInclude",
          returns: include,
        },
        {
          object: config,
          method: "fetchAlwaysInclude",
          returns: alwaysInclude,
        },
        {
          object: config,
          method: "fetchExclude",
          returns: ["**/node_modules/**", "**/dist/**"],
        },
        {
          object: config,
          method: "fetchFilesAndSearchExclude",
          returns: [],
        },
        {
          object: vscode.workspace,
          method: "findFiles",
          returns: [],
        },
      ],
      sandbox
    );
  };

  return {
    afterEach: () => {
      sandbox.restore();
    },

    getIncludePatterns: {
      setupForReturningIncludePatterns: () => {
        const patterns = ["**/*.{js,ts}"];
        stubMultiple(
          [
            {
              object: patternProvider,
              method: "getIncludePatterns",
              returns: patterns,
            },
          ],
          sandbox
        );

        return patterns;
      },

      setupForIncludeAndAlwaysInclude: (
        include: string,
        alwaysInclude: string[]
      ) => {
        stubConfig(include, alwaysInclude);
      },
    },

    isAlwaysIncludedOnly: {
      setupForIncludeAndAlwaysInclude: (alwaysInclude: string[]) => {
        stubConfig("**/*.{js,ts}", alwaysInclude);
      },
    },

    isIncluded: {
      setupForIncludeAndAlwaysInclude: (alwaysInclude: string[]) => {
        stubConfig("**/*.{js,ts}", alwaysInclude);
      },

      setupForIncludeAndExcludePatterns: () => {
        stubMultiple(
          [
            {
              object: patternProvider,
              method: "getIncludePatterns",
              returns: ["**/*.{js,ts}"],
            },
            {
              object: patternProvider,
              method: "getExcludeMode",
              returns: ExcludeMode.SearchEverywhere,
            },
            {
              object: patternProvider,
              method: "getExtensionExcludePatterns",
              returns: ["**/node_modules/**", "**/dist/**"],
            },
          ],
          sandbox
        );
      },
    },

    getExcludePatterns: {
      setupForSearchEverywhereExcludeMode: () => {
        const patterns = ["**/.history/**", "**/.vscode/**"];
        const expected = `{${patterns.join(",")}}`;
        stubMultiple(
          [
            {
              object: patternProvider,
              method: "getExcludeMode",
              returns: ExcludeMode.SearchEverywhere,
            },
            {
              object: patternProvider,
              method: "getExtensionExcludePatterns",
              returns: patterns,
            },
          ],
          sandbox
        );

        return expected;
      },

      setupForFilesAndSearchExcludeMode: () => {
        const patterns = ["**/.history/**", "**/.vscode/**"];
        const expected = `{${patterns.join(",")}}`;
        stubMultiple(
          [
            {
              object: patternProvider,
              method: "getExcludeMode",
              returns: ExcludeMode.FilesAndSearch,
            },
            {
              object: patternProvider,
              method: "getFilesAndSearchExcludePatterns",
              returns: patterns,
            },
          ],
          sandbox
        );

        return expected;
      },

      setupForGitignoreExcludeMode: () => {
        const patterns = ["**/.history/**", "**/.vscode/**"];
        const expected = `{${patterns.join(",")}}`;
        stubMultiple(
          [
            {
              object: patternProvider,
              method: "getExcludeMode",
              returns: ExcludeMode.Gitignore,
            },
            {
              object: patternProvider,
              method: "getGitignoreExcludePatterns",
              returns: patterns,
            },
          ],
          sandbox
        );

        return expected;
      },

      setupForMultiplePatternsWithCurlyBraces: () => {
        const patterns = ["**/.history/**", "**/.vscode/**"];
        const expected = `{${patterns.join(",")}}`;
        stubMultiple(
          [
            {
              object: patternProvider,
              method: "getExcludeMode",
              returns: ExcludeMode.SearchEverywhere,
            },
            {
              object: patternProvider,
              method: "getExtensionExcludePatterns",
              returns: patterns,
            },
          ],
          sandbox
        );

        return expected;
      },

      setupForSinglePatternWithoutCurlyBraces: () => {
        const patterns = ["**/.history/**"];
        const expected = "**/.history/**";
        stubMultiple(
          [
            {
              object: patternProvider,
              method: "getExcludeMode",
              returns: ExcludeMode.SearchEverywhere,
            },
            {
              object: patternProvider,
              method: "getExtensionExcludePatterns",
              returns: patterns,
            },
          ],
          sandbox
        );

        return expected;
      },

      setupForEmptyPatternsArray: () => {
        const expected = "";
        stubMultiple(
          [
            {
              object: patternProvider,
              method: "getExcludeMode",
              returns: ExcludeMode.SearchEverywhere,
            },
            {
              object: patternProvider,
              method: "getExtensionExcludePatterns",
              returns: [],
            },
          ],
          sandbox
        );

        return expected;
      },
    },

    fetchConfig: {
      setupForFetchingExcludeMode: () => {
        const expected = ExcludeMode.Gitignore;
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
              returns: expected,
            },
            {
              object: config,
              method: "fetchInclude",
            },
            {
              object: config,
              method: "fetchAlwaysInclude",
              returns: [],
            },
            {
              object: config,
              method: "fetchExclude",
            },
            {
              object: config,
              method: "fetchFilesAndSearchExclude",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: [],
            },
          ],
          sandbox
        );
        return expected;
      },

      setupForFetchingIncludePatterns: () => {
        const expected = "**/*.{js,ts}";
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
            },
            {
              object: config,
              method: "fetchInclude",
              returns: expected,
            },
            {
              object: config,
              method: "fetchAlwaysInclude",
              returns: [],
            },
            {
              object: config,
              method: "fetchExclude",
            },
            {
              object: config,
              method: "fetchFilesAndSearchExclude",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: [],
            },
          ],
          sandbox
        );
        return expected;
      },

      setupForFetchingExtensionExcludePatterns: () => {
        const expected = ["**/.history/**", "**/.vscode/**"];
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
            },
            {
              object: config,
              method: "fetchInclude",
            },
            {
              object: config,
              method: "fetchAlwaysInclude",
              returns: [],
            },
            {
              object: config,
              method: "fetchExclude",
              returns: expected,
            },
            {
              object: config,
              method: "fetchFilesAndSearchExclude",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: [],
            },
          ],
          sandbox
        );
        return expected;
      },

      setupForFetchingFilesAndSearchExcludePatterns: () => {
        const expected = ["**/.history/**", "**/.vscode/**"];
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
            },
            {
              object: config,
              method: "fetchInclude",
            },
            {
              object: config,
              method: "fetchAlwaysInclude",
              returns: [],
            },
            {
              object: config,
              method: "fetchExclude",
            },
            {
              object: config,
              method: "fetchFilesAndSearchExclude",
              returns: expected,
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: [],
            },
          ],
          sandbox
        );
        return expected;
      },

      setupForFetchingGitignoreExcludePatternsWhenFileFound: () => {
        const textDocument = getTextDocumentStub();
        const expected = ["dist", "out", ".vscode", ".history"];
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
            },
            {
              object: config,
              method: "fetchInclude",
            },
            {
              object: config,
              method: "fetchAlwaysInclude",
              returns: [],
            },
            {
              object: config,
              method: "fetchExclude",
            },
            {
              object: config,
              method: "fetchFilesAndSearchExclude",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: getItems(1),
            },
            {
              object: vscode.workspace,
              method: "openTextDocument",
              returns: textDocument,
            },
            {
              object: textDocument,
              method: "getText",
              returns:
                "# Project\ndist\nout\n\n# IDE config files\n\n.vscode\n.history\n\n",
            },
          ],
          sandbox
        );
        return expected;
      },

      setupForFallingBackToExtensionSettingsWhenGitignoreNotFound: () => {
        const expected = ["**/.history/**", "**/.vscode/**"];
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
            },
            {
              object: config,
              method: "fetchInclude",
            },
            {
              object: config,
              method: "fetchAlwaysInclude",
              returns: [],
            },
            {
              object: config,
              method: "fetchExclude",
              returns: expected,
            },
            {
              object: config,
              method: "fetchFilesAndSearchExclude",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: [],
            },
          ],
          sandbox
        );
        return expected;
      },

      setupForFallingBackToExtensionSettingsWhenGitignoreEmpty: () => {
        const textDocument = getTextDocumentStub();
        const expected = ["**/.history/**", "**/.vscode/**"];
        stubMultiple(
          [
            {
              object: config,
              method: "fetchExcludeMode",
            },
            {
              object: config,
              method: "fetchInclude",
            },
            {
              object: config,
              method: "fetchAlwaysInclude",
              returns: [],
            },
            {
              object: config,
              method: "fetchExclude",
              returns: expected,
            },
            {
              object: config,
              method: "fetchFilesAndSearchExclude",
            },
            {
              object: vscode.workspace,
              method: "findFiles",
              returns: getItems(1),
            },
            {
              object: vscode.workspace,
              method: "openTextDocument",
              returns: textDocument,
            },
            {
              object: textDocument,
              method: "getText",
              returns: "",
            },
          ],
          sandbox
        );
        return expected;
      },
    },
  };
};
