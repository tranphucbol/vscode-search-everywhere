import { assert } from "chai";
import * as vscode from "vscode";
import { workspace } from "../../indexing/workspace";
import { getTestSetups } from "./workspace.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Workspace", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("init", () => {
    it("should clear an index built with other effective settings", async () => {
      const [clearAllStub] = setups.init.setupForComparingIndexedConfig(
        '{"presets":[]}',
        '{"presets":["go"]}'
      );
      await workspace.init();

      assert.equal(clearAllStub.calledOnce, true);
    });

    it("should keep an index built with the same effective settings", async () => {
      const [clearAllStub] = setups.init.setupForComparingIndexedConfig(
        '{"presets":["go"]}',
        '{"presets":["go"]}'
      );
      await workspace.init();

      assert.equal(clearAllStub.called, false);
    });

    it("should keep an index that has no recorded settings", async () => {
      const [clearAllStub] = setups.init.setupForComparingIndexedConfig(
        undefined,
        '{"presets":["go"]}'
      );
      await workspace.init();

      assert.equal(clearAllStub.called, false);
    });

    it("should workspaceFolders.setWorkspaceFoldersCommonPath method be invoked", async () => {
      const [setWorkspaceFoldersCommonPathStub] =
        setups.init.setupForInvokingSetWorkspaceFoldersCommonPath();
      await workspace.init();

      assert.equal(setWorkspaceFoldersCommonPathStub.calledOnce, true);
    });

    it("should dataService.fetchConfig method be invoked", async () => {
      const [fetchConfigStub] =
        setups.init.setupForInvokingDataServiceFetchConfig();
      await workspace.init();

      assert.equal(fetchConfigStub.calledOnce, true);
    });

    it("should dataConverter.fetchConfig method be invoked", async () => {
      const [fetchConfigStub] =
        setups.init.setupForInvokingDataConverterFetchConfig();
      await workspace.init();

      assert.equal(fetchConfigStub.calledOnce, true);
    });
  });

  describe("registerEventListeners", () => {
    it("should register workspace event listeners", () => {
      const [
        onDidChangeConfigurationStub,
        onDidChangeWorkspaceFoldersStub,
        onDidChangeTextDocumentStub,
        onDidSaveTextDocumentStub,
        onWillIndexWorkspaceStub,
        onDidIndexWorkspaceStub,
      ] =
        setups.registerEventListeners.setupForRegisteringWorkspaceEventListeners();

      workspace.registerEventListeners();

      assert.equal(onDidChangeConfigurationStub.calledOnce, true);
      assert.equal(onDidChangeWorkspaceFoldersStub.calledOnce, true);
      assert.equal(onDidChangeTextDocumentStub.calledOnce, true);
      assert.equal(onDidSaveTextDocumentStub.calledOnce, true);
      assert.equal(onWillIndexWorkspaceStub.calledOnce, true);
      assert.equal(onDidIndexWorkspaceStub.calledOnce, true);
    });

    it("should stop the retry queue when an index starts and restart it with the files to retry when it finishes", () => {
      const stubs =
        setups.registerEventListeners.setupForRegisteringWorkspaceEventListeners();
      const { stopStub, startStub } =
        setups.registerEventListeners.setupForRetryQueue();
      const urisToRetry = [vscode.Uri.file("/fake/server.go")];

      workspace.registerEventListeners();
      stubs[4].firstCall.args[0]();
      stubs[5].firstCall.args[0](urisToRetry);

      assert.equal(stopStub.calledOnce, true);
      assert.deepEqual(startStub.firstCall.args[0], urisToRetry);
    });
  });
});
