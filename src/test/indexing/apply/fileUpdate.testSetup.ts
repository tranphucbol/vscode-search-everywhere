import * as sinon from "sinon";
import * as vscode from "vscode";
import * as config from "../../../platform/config";
import { scan } from "../../../symbols/scan/scan";
import { database } from "../../../database";
import { logger } from "../../../platform/logger";
import { asyncUtils } from "../../../shared/async";
import { messages } from "../../../shared/messages";
import { fileUpdate } from "../../../indexing/apply/fileUpdate";
import { dataConverter } from "../../../symbols/items/dataConverter";
import { getWorkspaceData } from "../../util/mockFactory";
import { getDocumentSymbolItemSingleLineArray } from "../../util/itemMockFactory";
import {
  getQpItems,
  getQpItemsSymbolAndUri,
} from "../../util/qpItemMockFactory";
import { stubMultiple } from "../../util/stubHelpers";

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  return {
    afterEach: () => {
      sandbox.restore();
    },

    downloadData: {
      setupForDataDownload: () => {
        stubMultiple(
          [
            {
              object: scan,
              method: "fetchData",
              returns: Promise.resolve(getWorkspaceData()),
            },
            {
              object: dataConverter,
              method: "convertToQpData",
              returns: getQpItems(),
            },
          ],
          sandbox
        );
        return getQpItems();
      },
    },

    updateCacheByPath: {
      setupForUpdatingDataWhenFileTextChanged: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: fileUpdate,
              method: "downloadData",
              returns: Promise.resolve(getQpItemsSymbolAndUri("./fake-new/")),
            },
            {
              object: database,
              method: "insertSymbolsBatch",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForUpdatingDataWhenFileCreated: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: fileUpdate,
              method: "downloadData",
              returns: Promise.resolve(getQpItems(1)),
            },
            {
              object: database,
              method: "insertSymbolsBatch",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForUpdatingDataWhenFileRenamedOrMoved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: fileUpdate,
              method: "downloadData",
              returns: Promise.resolve(getQpItems(1)),
            },
            {
              object: database,
              method: "insertSymbolsBatch",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForUpdatingDataForAllUrisWhenFolderRenamedOrMoved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForUpdatingDataWhenFileReloadedIfUnsaved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: fileUpdate,
              method: "downloadData",
              returns: Promise.resolve(getQpItemsSymbolAndUri("./fake-new/")),
            },
            {
              object: database,
              method: "insertSymbolsBatch",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },
    },

    removeFromCacheByPath: {
      setupForRemovingGivenUriFromStoredDataWhenFileRemoved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForRemovingGivenUriFromStoredDataWhenFileRenamedOrMoved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForRemovingGivenUriFromStoredDataWhenTextInFileChanged: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForRemovingAllUrisForGivenFolderUriWhenDirectoryRemoved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUriPrefix",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForRemovingAllUrisForGivenFolderUriWhenDirectoryRenamed: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUriPrefix",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForRemovingPathAndChildrenWhenFileOrDirectoryRemoved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: database,
              method: "deleteByUriPrefix",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },

      setupForRemovingGivenUriWhenFileReloadedIfUnsaved: () => {
        return stubMultiple(
          [
            {
              object: database,
              method: "deleteByUri",
            },
            {
              object: database,
              method: "schedulePersist",
            },
          ],
          sandbox
        );
      },
    },
  };
};
