import { assert } from "chai";
import { workspaceFolders } from "../../shared/workspaceFolders";
import { getWorkspaceFoldersChangeEvent } from "../util/eventMockFactory";
import { getTestSetups } from "./workspaceFolders.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("WorkspaceFolders", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("hasWorkspaceAnyFolder", () => {
    it("should return true if workspace contains at least one folder", () => {
      setups.hasWorkspaceAnyFolder.setupForReturningTrueWhenWorkspaceHasFolders();
      assert.equal(workspaceFolders.hasWorkspaceAnyFolder(), true);
    });

    it("should return false if workspace does not contain any folder", () => {
      setups.hasWorkspaceAnyFolder.setupForReturningFalseWhenWorkspaceHasNoFolders();
      assert.equal(workspaceFolders.hasWorkspaceAnyFolder(), false);
    });
  });

  describe("hasWorkspaceMoreThanOneFolder", () => {
    it("should return true if workspace contains more than one folder", () => {
      setups.hasWorkspaceMoreThanOneFolder.setupForReturningTrueWhenWorkspaceHasMultipleFolders();
      assert.equal(workspaceFolders.hasWorkspaceMoreThanOneFolder(), true);
    });

    it("should return false if workspace contains either one folder or any", () => {
      setups.hasWorkspaceMoreThanOneFolder.setupForReturningFalseWhenWorkspaceHasOneOrNoFolders();
      assert.equal(workspaceFolders.hasWorkspaceMoreThanOneFolder(), false);
    });
  });

  describe("hasWorkspaceChanged", () => {
    it("should return true if amount of opened folders in workspace has changed", () => {
      assert.equal(
        workspaceFolders.hasWorkspaceChanged(
          getWorkspaceFoldersChangeEvent(true)
        ),
        true
      );
    });

    it("should return false if amount of opened folders in workspace has not changed", () => {
      assert.equal(
        workspaceFolders.hasWorkspaceChanged(
          getWorkspaceFoldersChangeEvent(false)
        ),
        false
      );
    });
  });

  describe("normalizeUriPath", () => {
    it("should return uri path without workspace part if workspace has more than one folder", () => {
      const { item, qpItem } =
        setups.normalizeUriPath.setupForRemovingWorkspacePartWhenMultipleFolders();
      assert.equal(workspaceFolders.normalizeUriPath(item.path), qpItem.uri.path);
    });

    it("should return uri path without workspace part if workspace has only one folder", () => {
      const { item, qpItem } =
        setups.normalizeUriPath.setupForRemovingWorkspacePartWhenSingleFolder();
      assert.equal(workspaceFolders.normalizeUriPath(item.path), qpItem.uri.path);
    });

    it("should return uri path with workspace part if workspace doesn't have any folder", () => {
      const { item, qpItem } =
        setups.normalizeUriPath.setupForKeepingWorkspacePartWhenNoFolders();
      assert.equal(workspaceFolders.normalizeUriPath(item.path), qpItem.uri.path);
    });
  });

  describe("setWorkspaceFoldersCommonPath", () => {
    it("should do nothing if workspace has only one folder", () => {
      setups.setWorkspaceFoldersCommonPath.setupForDoingNothingWhenSingleFolder();
      workspaceFolders.setWorkspaceFoldersCommonPath();
      assert.equal(workspaceFolders.getWorkspaceFoldersCommonPathProp(), "");
    });

    it("should do nothing if workspace doesn't have any folder", () => {
      setups.setWorkspaceFoldersCommonPath.setupForDoingNothingWhenNoFolders();
      workspaceFolders.setWorkspaceFoldersCommonPath();
      assert.equal(workspaceFolders.getWorkspaceFoldersCommonPathProp(), "");
    });

    it("should extract common path if workspace has more than one folder", () => {
      setups.setWorkspaceFoldersCommonPath.setupForExtractingCommonPathWhenMultipleFolders();
      workspaceFolders.setWorkspaceFoldersCommonPath();
      assert.equal(
        workspaceFolders.getWorkspaceFoldersCommonPathProp(),
        "/common/path"
      );
    });
  });
});
