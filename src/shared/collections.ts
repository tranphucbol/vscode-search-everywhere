function getLastFromArray<T>(array: T[], predicate: (item: T) => boolean): T {
  return [...array].reverse().find(predicate) as T;
}

function groupBy<T>(
  array: T[],
  keyGetter: (...args: any[]) => string
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  array.forEach((item: T) => {
    const key = keyGetter(item);
    const collection = map.get(key);
    !collection ? map.set(key, [item]) : collection.push(item);
  });
  return map;
}

export const collections = {
  getLastFromArray,
  groupBy,
};
