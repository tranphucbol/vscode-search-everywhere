import { itemLoader } from "../view/itemLoader";
import { query } from "../input/query";
import { quickPickState, session } from "../state";
import { title } from "../view/title";

function cycleCategory(direction: 1 | -1): void {
  const control = quickPickState.getControl();
  const categories = quickPickState.getCategories() || [];
  if (!control || session.fileScopeUri || !categories.length) {
    return;
  }

  const { category } = query.resolveFilterPhrase(control.value || "");
  const positions = categories.length + 1;
  const current = category ? categories.indexOf(category) + 1 : 0;
  const next = (current + direction + positions) % positions;
  selectCategory(next - 1);
}

function selectCategory(index: number): void {
  const control = quickPickState.getControl();
  const categories = quickPickState.getCategories() || [];
  if (!control || session.fileScopeUri || !categories.length) {
    return;
  }

  const { kinds, rest } = query.resolveFilterPhrase(control.value || "");
  const queryText = kinds ? rest : (control.value || "").trim();
  const phrase = categories[index] ? categories[index].phrase : "";

  control.value = `${phrase}${queryText}`;
  itemLoader.loadItems();
}

function clickCategory(categoryIndex: number): void {
  const control = quickPickState.getControl();
  const categories = quickPickState.getCategories() || [];
  const { category } = query.resolveFilterPhrase(control?.value || "");
  const activeIndex = category ? categories.indexOf(category) : -1;
  if (categoryIndex === activeIndex) {
    // VS Code has already unchecked the toggle that was clicked.
    title.updateTitle(category, true);
  } else {
    selectCategory(categoryIndex);
  }
}

function toggleIncludeLibraries(): void {
  const control = quickPickState.getControl();
  if (!control || session.fileScopeUri) {
    return;
  }
  session.includeLibraries = !session.includeLibraries;
  title.updateTitle(
    query.resolveFilterPhrase(control.value || "").category,
    true
  );
  itemLoader.loadItems();
}

export const categories = {
  cycleCategory,
  selectCategory,
  clickCategory,
  toggleIncludeLibraries,
};
