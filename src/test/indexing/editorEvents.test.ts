import { assert } from "chai";
import { ActionType } from "../../shared/types";
import { editorEvents } from "../../indexing/editorEvents";
import { unsavedFiles } from "../../indexing/unsavedFiles";
import {
  getFileCreateEvent,
  getFileDeleteEvent,
  getFileRenameEvent,
  getTextDocumentChangeEvent,
} from "../util/eventMockFactory";
import { getTextDocumentStub } from "../util/stubFactory";
import { getTestSetups } from "./editorEvents.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("EditorEvents", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("handleDidChangeTextDocument", () => {
    it("should queue update if text document has changed and exists in workspace", async () => {
      const [queuedStub] =
        setups.handleDidChangeTextDocument.setupForRegisteringUpdateActionWhenDocumentChangedAndExistsInWorkspace();
      const textDocumentChangeEvent = getTextDocumentChangeEvent(true);
      await editorEvents.handleDidChangeTextDocument(textDocumentChangeEvent);

      assert.equal(queuedStub.calledTwice, true);
      assert.equal(queuedStub.args[0][0], ActionType.Remove);
      assert.equal(queuedStub.args[1][0], ActionType.Update);
    });

    it("should do nothing if text document does not exist in workspace", async () => {
      const [queuedStub] =
        setups.handleDidChangeTextDocument.setupForDoingNothingWhenDocumentNotExistInWorkspace();
      const textDocumentChangeEvent = getTextDocumentChangeEvent(true);
      await editorEvents.handleDidChangeTextDocument(textDocumentChangeEvent);

      assert.equal(queuedStub.calledOnce, false);
    });

    it("should do nothing if text document has not changed", async () => {
      const [queuedStub] =
        setups.handleDidChangeTextDocument.setupForDoingNothingWhenDocumentNotChanged();
      const textDocumentChangeEvent = await getTextDocumentChangeEvent();
      await editorEvents.handleDidChangeTextDocument(textDocumentChangeEvent);

      assert.equal(queuedStub.calledOnce, false);
    });

    it("should add uri to not saved array if text document has changed and exists in workspace", async () => {
      setups.handleDidChangeTextDocument.setupForAddingUriToNotSavedArrayWhenDocumentChangedAndExistsInWorkspace();
      const textDocumentChangeEvent = getTextDocumentChangeEvent(true);
      await editorEvents.handleDidChangeTextDocument(textDocumentChangeEvent);

      assert.equal(unsavedFiles.getAll().size, 1);
    });
  });

  describe("handleDidRenameFiles", () => {
    it("should queue an update and a removal for each renamed or moved file", async () => {
      const [queuedStub] =
        setups.handleDidRenameFiles.setupForRegisteringRemoveAndUpdateActionsForRenamedFiles();

      await editorEvents.handleDidRenameFiles(getFileRenameEvent());

      assert.equal(queuedStub.callCount, 4);
      assert.equal(queuedStub.args[0][0], ActionType.Update);
      assert.equal(queuedStub.args[1][0], ActionType.Remove);
      assert.equal(queuedStub.args[2][0], ActionType.Update);
      assert.equal(queuedStub.args[3][0], ActionType.Remove);
    });

    it("should queue one update for renamed or moved directory", async () => {
      const [queuedStub] =
        setups.handleDidRenameFiles.setupForRegisteringUpdateActionForRenamedDirectory();

      await editorEvents.handleDidRenameFiles(getFileRenameEvent(true));

      assert.equal(queuedStub.calledOnce, true);
      assert.equal(queuedStub.args[0][0], ActionType.Update);
    });
  });

  describe("handleDidCreateFiles", () => {
    it("should queue update when file is created", async () => {
      const [queuedStub] =
        setups.handleDidCreateFiles.setupForRegisteringUpdateActionWhenFileCreated();
      await editorEvents.handleDidCreateFiles(getFileCreateEvent());

      assert.equal(queuedStub.calledOnce, true);
      assert.equal(queuedStub.args[0][0], ActionType.Update);
    });

    it("should queue update when directory is created", async () => {
      const [queuedStub] =
        setups.handleDidCreateFiles.setupForRegisteringUpdateActionWhenDirectoryCreated();
      await editorEvents.handleDidCreateFiles(getFileCreateEvent());

      assert.equal(queuedStub.calledOnce, true);
      assert.equal(queuedStub.args[0][0], ActionType.Update);
    });

    it("should add uri to not saved array", async () => {
      setups.handleDidCreateFiles.setupForAddingUriToNotSavedArray();
      await editorEvents.handleDidCreateFiles(getFileCreateEvent());

      assert.equal(unsavedFiles.getAll().size, 1);
    });
  });

  describe("handleDidDeleteFiles", () => {
    it("should queue remove when file is deleted", async () => {
      const [queuedStub] =
        setups.handleDidDeleteFiles.setupForRegisteringRemoveActionWhenFileDeleted();
      await editorEvents.handleDidDeleteFiles(getFileDeleteEvent());

      assert.equal(queuedStub.calledOnce, true);
      assert.equal(queuedStub.args[0][0], ActionType.Remove);
    });

    it("should queue remove when directory is deleted", async () => {
      const [queuedStub] =
        setups.handleDidDeleteFiles.setupForRegisteringRemoveActionWhenDirectoryDeleted();
      await editorEvents.handleDidDeleteFiles(getFileDeleteEvent());

      assert.equal(queuedStub.calledOnce, true);
      assert.equal(queuedStub.args[0][0], ActionType.Remove);
    });
  });

  describe("handleDidSaveTextDocument", () => {
    it("should remove uri from not saved array", async () => {
      setups.handleDidSaveTextDocument.setupForRemovingUriFromNotSavedArray();
      await editorEvents.handleDidSaveTextDocument(
        getTextDocumentStub(undefined, "/test/path2")
      );

      assert.equal(unsavedFiles.getAll().size, 2);
    });
  });

  describe("register", () => {
    it("should listen to text changes, renames, creations, deletions and saves", () => {
      const stubs = setups.register.setupForRegisteringListeners();

      editorEvents.register();

      stubs.forEach((stub) => assert.equal(stub.calledOnce, true));
    });
  });
});
