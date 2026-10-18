import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./index");

    const vscodeExecutablePath =
      process.platform === "darwin"
        ? "/Applications/Visual Studio Code.app/Contents/MacOS/Code"
        : undefined;

    const userDataDir = path.resolve(__dirname, "../../.vscode-test/user-data");
    // Sharing ~/.vscode/extensions with a separate user data dir lets this
    // instance delete extensions installed only in the user's other profiles:
    // VS Code removes extensions that no profile it knows about references.
    const extensionsDir = path.resolve(
      __dirname,
      "../../.vscode-test/extensions"
    );

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
      launchArgs: [
        "--disable-extensions",
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
      ],
    });
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

main();
