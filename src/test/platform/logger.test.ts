import { assert } from "chai";
import { logger } from "../../platform/logger";
import { getTestSetups } from "./logger.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Logger", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  beforeEach(() => setups.beforeEach());
  afterEach(() => setups.afterEach());

  describe("init", () => {
    it("should output channel be created", () => {
      const [createOutputChannelStub] =
        setups.init.setupForCreatingOutputChannel();
      logger.init();
      assert.equal(createOutputChannelStub.calledOnce, true);
    });
  });

  describe("log", () => {
    it("should log message with timestamp", () => {
      const {
        stubs: [outputChannelInnerStub],
        expectedMessage,
        fakeTimer,
      } = setups.log.setupForLoggingMessageWithTimestamp();
      logger.log("test message");

      assert.equal(
        outputChannelInnerStub.calledOnceWith(expectedMessage),
        true
      );

      fakeTimer.restore();
    });
  });

  describe("logAction", () => {
    it("should log message with executed action", () => {
      const {
        stubs: [outputChannelInnerStub],
        expectedMessage,
        fakeTimer,
        action,
      } = setups.logAction.setupForLoggingExecutedAction();
      logger.logAction(action);

      assert.equal(
        outputChannelInnerStub.calledOnceWith(expectedMessage),
        true
      );

      fakeTimer.restore();
    });
  });

  describe("logScanTime", () => {
    it("should log message with scan time", () => {
      const {
        stubs: [outputChannelInnerStub],
        expectedMessage,
        fakeTimer,
        indexStats,
      } = setups.logScanTime.setupForLoggingScanTimeWithStats();
      logger.logScanTime(indexStats);

      assert.equal(
        outputChannelInnerStub.calledOnceWith(expectedMessage),
        true
      );

      fakeTimer.restore();
    });
  });

  describe("logStructure", () => {
    it("should log message with scanned workspace struture", () => {
      const {
        stubs: [outputChannelInnerStub],
        expectedMessage,
        fakeTimer,
        workspaceData,
      } = setups.logStructure.setupForLoggingWorkspaceStructure();
      logger.logStructure(workspaceData);

      assert.equal(
        outputChannelInnerStub.calledOnceWith(expectedMessage),
        true
      );

      fakeTimer.restore();
    });
  });

  describe("getStructure", () => {
    it("should return tree structure based on workspace data", () => {
      const workspaceData =
        setups.getStructure.setupForReturningTreeStructureFromWorkspaceData();
      assert.equal(
        logger.getStructure(workspaceData),
        `{
  "fake": {
    "fake-1.ts": "4 items"
  },
  "fake-other": {
    "fake-2.ts": "1 item"
  },
  "fake-another": {
    "fake-3.ts": "0 items"
  }
}`
      );
    });
  });
});
