import { assert } from "chai";
import { messages } from "../../shared/messages";
import { getIndexStats } from "../util/mockFactory";
import { getTestSetups } from "./messages.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Messages", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("printNoFolderOpenedMessage", () => {
    it("should display notification", async () => {
      const [showInformationMessageStub] =
        setups.printNoFolderOpenedMessage.setupForDisplayingNotification();
      messages.printNoFolderOpenedMessage();

      assert.equal(showInformationMessageStub.calledOnce, true);
    });
  });

  describe("printErrorMessage", () => {
    it("should display notification", async () => {
      const [showInformationMessageStub] =
        setups.printErrorMessage.setupForDisplayingNotification();
      messages.printErrorMessage(new Error("test error message"));

      assert.equal(showInformationMessageStub.calledOnce, true);
    });
  });

  describe("printStatsMessage", () => {
    it("should display notification with scan stats", async () => {
      const [showInformationMessageStub] =
        setups.printStatsMessage.setupForDisplayingStatsNotification();
      const indexStats = getIndexStats();
      messages.printStatsMessage(indexStats);

      const calledWith = (
        showInformationMessageStub.args[0][0] as string
      ).replaceAll(" ", "");
      const expected = `Elapsed time: ${indexStats.ElapsedTimeInSeconds}s
      Scanned files: ${indexStats.ScannedUrisCount}
      Indexed items: ${indexStats.IndexedItemsCount}`.replaceAll(" ", "");

      assert.equal(calledWith, expected);
    });
  });
});
