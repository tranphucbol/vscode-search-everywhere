import { assert } from "chai";
import * as config from "../../../platform/settings/config";
import { detectPresets, setActivePresets } from "../../../platform/settings/presets";
import {
  defaultExclude,
  defaultInclude,
  getTestSetups,
} from "./presets.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Presets", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  async function applyDetectedPresets(
    folder: Parameters<typeof detectPresets>[0][number]
  ) {
    setActivePresets(await detectPresets([folder]));
  }

  describe("effective settings", () => {
    it("should use the Go preset when go.mod is present and include is not set", async () => {
      const folder = setups.setupForPresets({ markers: ["go.mod"] });
      await applyDetectedPresets(folder);

      assert.equal(
        config.fetchInclude(),
        "**/*.{go,mod,work,proto,yaml,yml,json}"
      );
      assert.deepEqual(config.fetchItemsFilter().ignoredKinds, [25]);
    });

    it("should keep the user's include when go.mod is present", async () => {
      const folder = setups.setupForPresets({
        markers: ["go.mod"],
        userSettings: { include: "**/*.go" },
      });
      await applyDetectedPresets(folder);

      assert.equal(config.fetchInclude(), "**/*.go");
    });

    it("should combine the Go and Java presets when go.mod and pom.xml are present", async () => {
      const folder = setups.setupForPresets({ markers: ["go.mod", "pom.xml"] });
      await applyDetectedPresets(folder);

      assert.equal(
        config.fetchInclude(),
        "**/*.{go,mod,work,proto,yaml,yml,json,java,kt,kts,xml,properties,gradle,sql}"
      );
      assert.includeMembers(config.fetchExclude(), [
        "**/vendor/**",
        "**/target/**",
      ]);
    });

    it("should keep the default include when only package.json is present", async () => {
      const folder = setups.setupForPresets({ markers: ["package.json"] });
      await applyDetectedPresets(folder);

      assert.equal(config.fetchInclude(), defaultInclude);
      assert.deepEqual(config.fetchExclude(), defaultExclude);
    });

    it("should keep the default include when languagePresets is off", async () => {
      const folder = setups.setupForPresets({
        markers: ["go.mod"],
        languagePresets: "off",
      });
      await applyDetectedPresets(folder);

      assert.equal(config.fetchInclude(), defaultInclude);
      assert.deepEqual(config.fetchItemsFilter().ignoredKinds, []);
    });

    it("should add preset excludes to the default exclude list", async () => {
      const folder = setups.setupForPresets({ markers: ["go.mod"] });
      await applyDetectedPresets(folder);

      assert.deepEqual(config.fetchExclude(), [
        ...defaultExclude,
        "**/vendor/**",
        "**/bin/**",
        "**/testdata/**",
      ]);
    });
  });

  describe("detectPresets", () => {
    it("should detect Gradle Kotlin builds as Java", async () => {
      const folder = setups.createFolder(["build.gradle.kts"]);

      assert.deepEqual(await detectPresets([folder]), ["java"]);
    });

    it("should ignore marker files below the folder root", async () => {
      const folder = setups.createFolder([
        "tools/go.mod",
        "service/pom.xml",
      ]);

      assert.deepEqual(await detectPresets([folder]), []);
    });

    it("should detect a preset from any workspace folder", async () => {
      const goFolder = setups.createFolder(["go.work"]);
      const javaFolder = setups.createFolder(["settings.gradle"]);

      assert.deepEqual(await detectPresets([goFolder, javaFolder]), [
        "go",
        "java",
      ]);
    });
  });
});
