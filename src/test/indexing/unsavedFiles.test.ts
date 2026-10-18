import { assert } from "chai";
import { unsavedFiles } from "../../indexing/unsavedFiles";
import { getTestSetups } from "./unsavedFiles.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("UnsavedFiles", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("reloadAll", () => {
    it("should queue a removal and an update for each unsaved uri", async () => {
      const [queuedStub] =
        setups.reloadAll.setupForQueueingTwiceForEachUnsavedUri();
      await unsavedFiles.reloadAll();

      assert.equal(queuedStub.callCount, 4);
    });

    it("should clear array of unsaved uris", async () => {
      setups.reloadAll.setupForClearingArrayOfUnsavedUris();
      await unsavedFiles.reloadAll();

      assert.equal(unsavedFiles.getAll().size, 0);
    });
  });
});
