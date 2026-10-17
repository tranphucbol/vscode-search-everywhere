function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
  immediate: boolean = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | undefined;

  return function (this: any, ...args: Parameters<T>): void {
    const context = this;
    const callNow = immediate && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = undefined;
      if (!immediate) {
        fn.apply(context, args);
      }
    }, wait);

    if (callNow) {
      fn.apply(context, args);
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepAndExecute(ms: number, fn: Function): Promise<void> {
  setTimeout(async () => {
    await fn();
  }, ms);
}

export const asyncUtils = {
  debounce,
  sleep,
  sleepAndExecute,
};
