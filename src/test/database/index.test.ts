import { assert } from "chai";
import { database } from "../../database";
import { useTestDatabase } from "../util/databaseFixtures";

describe("Database", () => {
  useTestDatabase();

  describe("initDatabase", () => {
    it("should initialize database and report isReady true", () => {
      assert.equal(database.isReady(), true);
    });
  });
});
