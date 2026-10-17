import { assert } from "chai";
import { database } from "../../database";
import { useTestDatabase } from "../util/databaseFixtures";

describe("Database query text", () => {
  useTestDatabase();

  describe("extractCleanName and extractCleanStem", () => {
    it("should extract normalized clean name without punctuation", () => {
      assert.equal(database.extractCleanName("MapService"), "mapservice");
      assert.equal(database.extractCleanName("map.service.ts"), "mapservicets");
      assert.equal(database.extractCleanName("map-service_worker"), "mapserviceworker");
    });

    it("should extract clean stem stripping extension for files", () => {
      assert.equal(database.extractCleanStem("MapService"), "mapservice");
      assert.equal(database.extractCleanStem("map.service.ts"), "mapservice");
      assert.equal(database.extractCleanStem("map-service.js"), "mapservice");
      assert.equal(database.extractCleanStem("map_service.py"), "mapservice");
      assert.equal(database.extractCleanStem(".gitignore"), "gitignore");
      assert.equal(database.extractCleanStem("map.service.spec.ts"), "mapservicespec");
    });
  });

  describe("extractCleanContainer", () => {
    it("should store the cleaned container chain", () => {
      assert.equal(database.extractCleanContainer("Outer.Inner"), "outer.inner");
      assert.equal(database.extractCleanContainer("My_Mod.Sub-Cls"), "mymod.subcls");
      assert.equal(database.extractCleanContainer("a..b"), "a.b");
      assert.equal(database.extractCleanContainer(undefined), "");
    });
  });
});
