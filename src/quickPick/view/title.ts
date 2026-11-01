import * as vscode from "vscode";
import { Category, CategoryButton, LibraryButton } from "../../shared/types";
import { vscodeVersion } from "../../shared/vscodeVersion";
import { quickPickState, session } from "../state";

const ALL_ICON = "list-flat";
const FALLBACK_CATEGORY_ICON = "filter";
const ACTIVE_ICON = "check";
// vscode.QuickInputButtonLocation.Inline, added after the pinned @types/vscode.
const INLINE_BUTTON_LOCATION = 2;
const LIBRARY_ICON = "library";
const INCLUDE_LIBRARIES_SHORTCUT =
  process.platform === "darwin" ? "⌥⌘P" : "Ctrl+Alt+P";

function buildCategoryButtons(active?: Category): CategoryButton[] {
  const categories = quickPickState.getCategories() || [];
  const toggles = vscodeVersion.supportsQuickInputButtonToggle();
  const entries = [
    { categoryIndex: -1, icon: ALL_ICON, tooltip: "All · Tab" },
    ...categories.map((category, categoryIndex) => ({
      categoryIndex,
      icon: category.icon || FALLBACK_CATEGORY_ICON,
      tooltip: `${category.name} (${category.phrase}) · Tab`,
    })),
  ];
  const activeIndex = active ? categories.indexOf(active) : -1;

  return entries.map(({ categoryIndex, icon, tooltip }) => {
    const checked = categoryIndex === activeIndex;
    return toggles
      ? {
          categoryIndex,
          iconPath: new vscode.ThemeIcon(icon),
          tooltip,
          location: INLINE_BUTTON_LOCATION,
          toggle: { checked },
        }
      : {
          categoryIndex,
          iconPath: new vscode.ThemeIcon(checked ? ACTIVE_ICON : icon),
          tooltip,
        };
  });
}

function buildLibraryButton(checked: boolean): LibraryButton {
  const tooltip = `Include libraries · ${INCLUDE_LIBRARIES_SHORTCUT}`;
  return vscodeVersion.supportsQuickInputButtonToggle()
    ? {
        includeLibraries: true,
        iconPath: new vscode.ThemeIcon(LIBRARY_ICON),
        tooltip,
        location: INLINE_BUTTON_LOCATION,
        toggle: { checked },
      }
    : {
        includeLibraries: true,
        iconPath: new vscode.ThemeIcon(checked ? ACTIVE_ICON : LIBRARY_ICON),
        tooltip,
      };
}

let renderedButtonsKey: string | undefined;

function updateTitle(category?: Category, forceButtons = false): void {
  const control = quickPickState.getControl();
  if (!control || session.fileScopeUri) {
    return;
  }
  const categories = quickPickState.getCategories() || [];
  const showCategories =
    quickPickState.getShouldUseItemsFilterPhrases() && categories.length > 0;
  const buttonsKey = [
    showCategories,
    category ? categories.indexOf(category) : -1,
    session.includeLibraries,
  ].join();
  // loadItems runs on every keystroke; redrawing unchanged buttons there is wasted work.
  // Hiding the quick pick and leaving file scope clear the buttons, so an empty list redraws.
  if (
    !forceButtons &&
    renderedButtonsKey === buttonsKey &&
    control.buttons.length > 0
  ) {
    return;
  }
  renderedButtonsKey = buttonsKey;
  control.buttons = [
    ...(showCategories ? buildCategoryButtons(category) : []),
    buildLibraryButton(session.includeLibraries),
  ];
}

export const title = {
  buildCategoryButtons,
  buildLibraryButton,
  updateTitle,
};
