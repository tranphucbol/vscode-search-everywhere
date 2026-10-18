import { assert } from "chai";
import * as vscode from "vscode";
import { indexingProgress } from "../../indexing/progress";
import { getTestSetups } from "./progress.testSetup";
import { getProgress } from "../util/mockFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Progress", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("getNotificationLocation", () => {
    it("should return vscode.ProgressLocation.Notification if shouldDisplayNotificationInStatusBar returns false", () => {
      setups.getNotificationLocation.setupForNotificationLocation();
      assert.equal(
        indexingProgress.getNotificationLocation(),
        vscode.ProgressLocation.Notification
      );
    });

    it("should return vscode.ProgressLocation.Window if shouldDisplayNotificationInStatusBar returns true", () => {
      setups.getNotificationLocation.setupForWindowLocation();
      assert.equal(
        indexingProgress.getNotificationLocation(),
        vscode.ProgressLocation.Window
      );
    });
  });

  describe("getNotificationTitle", () => {
    it("should return 'Indexing workspace... file' if shouldDisplayNotificationInStatusBar returns false", () => {
      setups.getNotificationTitle.setupForNotificationTitle();
      assert.equal(
        indexingProgress.getNotificationTitle(),
        "Indexing workspace... file"
      );
    });

    it("should return 'Indexing...' if shouldDisplayNotificationInStatusBar returns true", () => {
      setups.getNotificationTitle.setupForStatusBarTitle();
      assert.equal(indexingProgress.getNotificationTitle(), "Indexing...");
    });
  });

  describe("handleDidItemIndexed", () => {
    it("should call calculateProgressStep and other progress methods on first call", () => {
      setups.handleDidItemIndexed.setupForProgressCalculation();
      // Call the method twice to test the calculation
      indexingProgress.handleDidItemIndexed(getProgress(), 5);
      indexingProgress.handleDidItemIndexed(getProgress(), 5);

      assert.equal(indexingProgress.getProgressStep(), 20);
    });

    it("should call progress.report method", () => {
      const progress = getProgress();
      setups.handleDidItemIndexed.setupForProgressReporting();
      indexingProgress.handleDidItemIndexed(progress, 5);

      assert.equal(progress.report.calledOnce, true);
    });
  });
});
