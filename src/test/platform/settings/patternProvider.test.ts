import { assert } from "chai";
import { patternProvider } from "../../../platform/settings/patternProvider";
import { getTestSetups } from "./patternProvider.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("PatternProvider", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("getIncludePatterns", () => {
    it("should return include patterns", () => {
      const includePatterns =
        setups.getIncludePatterns.setupForReturningIncludePatterns();

      assert.deepEqual(patternProvider.getIncludePatterns(), includePatterns);
    });

    it("should return the include pattern followed by the always include patterns", async () => {
      setups.getIncludePatterns.setupForIncludeAndAlwaysInclude("**/*.ts", [
        "**/*.{yaml,yml}",
        "**/Dockerfile",
      ]);
      await patternProvider.fetchConfig();

      assert.deepEqual(patternProvider.getIncludePatterns(), [
        "**/*.ts",
        "**/*.{yaml,yml}",
        "**/Dockerfile",
      ]);
    });

    it("should drop empty and duplicate include patterns", async () => {
      setups.getIncludePatterns.setupForIncludeAndAlwaysInclude("**/*.ts", [
        "",
        "**/*.ts",
        "**/*.md",
        "**/*.md",
      ]);
      await patternProvider.fetchConfig();

      assert.deepEqual(patternProvider.getIncludePatterns(), [
        "**/*.ts",
        "**/*.md",
      ]);
    });
  });

  describe("isAlwaysIncludedOnly", () => {
    it("should report a file matched only by an always include pattern as always included only", async () => {
      setups.isAlwaysIncludedOnly.setupForIncludeAndAlwaysInclude([
        "**/*.{json,yaml,md}",
      ]);
      await patternProvider.fetchConfig();

      assert.equal(patternProvider.isAlwaysIncludedOnly("config/app.yaml"), true);
      assert.equal(
        patternProvider.isAlwaysIncludedOnly("node_modules/x/package.json"),
        false
      );
    });

    it("should not report a file matched by include as always included only", async () => {
      setups.isAlwaysIncludedOnly.setupForIncludeAndAlwaysInclude([
        "**/*.{ts,md}",
      ]);
      await patternProvider.fetchConfig();

      assert.equal(patternProvider.isAlwaysIncludedOnly("src/user.ts"), false);
      assert.equal(patternProvider.isAlwaysIncludedOnly("README.md"), true);
    });
  });

  describe("getExcludePatterns", () => {
    it("should return exclude patterns from extension settings where exclude mode is set to 'search everywhere'", async () => {
      const excludePatterns =
        setups.getExcludePatterns.setupForSearchEverywhereExcludeMode();

      assert.equal(await patternProvider.getExcludePatterns(), excludePatterns);
    });

    it("should return exclude patterns from files and search settings where exclude mode is set to 'files and search'", async () => {
      const excludePatterns =
        setups.getExcludePatterns.setupForFilesAndSearchExcludeMode();

      assert.equal(await patternProvider.getExcludePatterns(), excludePatterns);
    });

    it("should return exclude patterns from gitignore file where exclude mode is set to 'gitignore'", async () => {
      const excludePatterns =
        setups.getExcludePatterns.setupForGitignoreExcludeMode();

      assert.equal(await patternProvider.getExcludePatterns(), excludePatterns);
    });

    it("should return exclude patterns separated with comma and surrounded with curly braces if there are two or more patterns", async () => {
      const excludePatterns =
        setups.getExcludePatterns.setupForMultiplePatternsWithCurlyBraces();

      assert.equal(await patternProvider.getExcludePatterns(), excludePatterns);
    });

    it("should return exclude pattern without comma and surrounding of curly braces if there is only one pattern", async () => {
      const excludePatterns =
        setups.getExcludePatterns.setupForSinglePatternWithoutCurlyBraces();

      assert.equal(await patternProvider.getExcludePatterns(), excludePatterns);
    });

    it("should return empty string if there is not any pattern", async () => {
      const excludePatterns =
        setups.getExcludePatterns.setupForEmptyPatternsArray();

      assert.equal(await patternProvider.getExcludePatterns(), excludePatterns);
    });
  });

  describe("isIncluded", () => {
    it("should include a path matching the include glob and no exclude", () => {
      setups.isIncluded.setupForIncludeAndExcludePatterns();

      assert.equal(patternProvider.isIncluded("src/app/UserService.ts"), true);
      assert.equal(patternProvider.isIncluded("src/app/README.md"), false);
    });

    it("should exclude a path matching an exclude glob", () => {
      setups.isIncluded.setupForIncludeAndExcludePatterns();

      assert.equal(
        patternProvider.isIncluded("node_modules/lib/index.js"),
        false
      );
      assert.equal(patternProvider.isIncluded("packages/a/dist/a.js"), false);
    });

    it("should include a config file matched only by an always include pattern", async () => {
      setups.isIncluded.setupForIncludeAndAlwaysInclude([
        "**/*.{yaml,md}",
        "**/{.env,.env.*,Dockerfile}",
      ]);
      await patternProvider.fetchConfig();

      assert.equal(patternProvider.isIncluded("src/app/README.md"), true);
      assert.equal(patternProvider.isIncluded("deploy/values.yaml"), true);
      assert.equal(patternProvider.isIncluded(".env.local"), true);
      assert.equal(patternProvider.isIncluded("docker/Dockerfile"), true);
      assert.equal(patternProvider.isIncluded("notes.txt"), false);
    });

    it("should not include an always included file that is excluded", async () => {
      setups.isIncluded.setupForIncludeAndAlwaysInclude(["**/*.json"]);
      await patternProvider.fetchConfig();

      assert.equal(
        patternProvider.isIncluded("node_modules/lib/package.json"),
        false
      );
      assert.equal(patternProvider.isIncluded("dist/manifest.json"), false);
    });
  });

  describe("fetchConfig", () => {
    it("should fetch exclude mode", async () => {
      const excludeMode = setups.fetchConfig.setupForFetchingExcludeMode();
      await patternProvider.fetchConfig();
      assert.equal(patternProvider.getExcludeMode(), excludeMode);
    });

    it("should fetch include patterns", async () => {
      const includePatterns =
        setups.fetchConfig.setupForFetchingIncludePatterns();
      await patternProvider.fetchConfig();
      assert.deepEqual(patternProvider.getIncludePatterns(), [includePatterns]);
    });

    it("should fetch extension exclude patterns", async () => {
      const extensionExcludePatterns =
        setups.fetchConfig.setupForFetchingExtensionExcludePatterns();
      await patternProvider.fetchConfig();
      assert.equal(
        patternProvider.getExtensionExcludePatterns(),
        extensionExcludePatterns
      );
    });

    it("should fetch files and search exclude patterns", async () => {
      const filesAndSearchExcludePatterns =
        setups.fetchConfig.setupForFetchingFilesAndSearchExcludePatterns();
      await patternProvider.fetchConfig();
      assert.equal(
        patternProvider.getFilesAndSearchExcludePatterns(),
        filesAndSearchExcludePatterns
      );
    });

    it("should fetch gitignore exclude patterns if file is found", async () => {
      const gitignoreExcludePatterns =
        setups.fetchConfig.setupForFetchingGitignoreExcludePatternsWhenFileFound();
      await patternProvider.fetchConfig();
      assert.deepEqual(
        patternProvider.getGitignoreExcludePatterns(),
        gitignoreExcludePatterns
      );
    });

    it("should set exclude patterns from extension settings if gitignore file is not found", async () => {
      const gitignoreExcludePatterns =
        setups.fetchConfig.setupForFallingBackToExtensionSettingsWhenGitignoreNotFound();
      await patternProvider.fetchConfig();
      assert.deepEqual(
        patternProvider.getGitignoreExcludePatterns(),
        gitignoreExcludePatterns
      );
    });

    it("should set exclude patterns from extension settings if gitignore file is found but is empty", async () => {
      const gitignoreExcludePatterns =
        setups.fetchConfig.setupForFallingBackToExtensionSettingsWhenGitignoreEmpty();
      await patternProvider.fetchConfig();
      assert.deepEqual(
        patternProvider.getGitignoreExcludePatterns(),
        gitignoreExcludePatterns
      );
    });
  });
});
