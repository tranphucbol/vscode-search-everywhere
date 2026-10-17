import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../cache";
import { setActivePresets } from "../../presets";

export const defaultInclude = "**/*.{js,jsx,ts,tsx}";
export const defaultExclude = ["**/node_modules/**", "**/dist/**"];

interface PresetSetupOptions {
  markers: string[];
  userSettings?: { [key: string]: unknown };
  languagePresets?: string;
}

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();
  const directories: string[] = [];

  function createFolder(files: string[]): vscode.WorkspaceFolder {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-presets-"));
    directories.push(root);
    files.forEach((file) => {
      const filePath = path.join(root, file);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "");
    });
    return { uri: vscode.Uri.file(root), name: path.basename(root), index: 0 };
  }

  function stubConfiguration(
    userSettings: { [key: string]: unknown },
    languagePresets: string
  ) {
    const defaults: { [key: string]: unknown } = {
      include: defaultInclude,
      exclude: defaultExclude,
      itemsFilter: { allowedKinds: [], ignoredKinds: [], ignoredNames: [] },
      excludeProperties: false,
      excludeVariables: false,
      languagePresets,
    };
    const valueOf = (key: string) =>
      key in userSettings ? userSettings[key] : defaults[key];

    sandbox.stub(vscode.workspace, "getConfiguration").returns({
      get: (section: string, defaultValue: unknown) => {
        const key = section.replace(/^searchEverywhere\./, "");
        const value = valueOf(key);
        return value === undefined ? defaultValue : value;
      },
      inspect: (key: string) => ({
        key,
        defaultValue: defaults[key],
        globalValue: userSettings[key],
      }),
    } as unknown as vscode.WorkspaceConfiguration);
    sandbox.stub(cache, "getConfigByKey").returns(undefined);
    sandbox.stub(cache, "updateConfigByKey");
  }

  return {
    afterEach: () => {
      sandbox.restore();
      setActivePresets([]);
      directories
        .splice(0)
        .forEach((directory) =>
          fs.rmSync(directory, { recursive: true, force: true })
        );
    },

    createFolder,

    setupForPresets: ({
      markers,
      userSettings = {},
      languagePresets = "auto",
    }: PresetSetupOptions) => {
      const folder = createFolder(markers);
      stubConfiguration(userSettings, languagePresets);
      return folder;
    },
  };
};
