export interface PoolOpts {
  concurrency?: number;
  shouldCancel?: () => boolean;
}

/**
 * Map items to promises with a bounded concurrency pool.
 * Stops dispatching new work when shouldCancel() returns true.
 */
export async function pMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  opts: PoolOpts = {}
): Promise<R[]> {
  const concurrency = Math.max(1, Math.min(opts.concurrency || 16, items.length || 1));
  const out = new Array<R>(items.length);
  let idx = 0;

  const worker = async () => {
    while (true) {
      if (opts.shouldCancel?.()) return;
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}