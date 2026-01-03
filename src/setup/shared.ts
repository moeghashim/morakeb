export const spinnerFrames = ['|', '/', '-', '\\'] as const;

export function nextSpinnerFrame(current: number): number {
  return (current + 1) % spinnerFrames.length;
}

export function createStatusMap<T extends ReadonlyArray<string>, V>(
  order: T,
  initial: V,
): Record<T[number], V> {
  return order.reduce((acc, key) => {
    acc[key as T[number]] = initial;
    return acc;
  }, {} as Record<T[number], V>);
}
