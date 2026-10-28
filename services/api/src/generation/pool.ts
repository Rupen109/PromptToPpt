/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Results come back in item order.
 * If one call fails, no NEW item is started, the ones already running finish (so their work is not thrown away), and the first error is rethrown.
 * `onDone` fires as each item completes — used to checkpoint finished work before a later item fails.
 */
export async function runPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, onDone?: (result: R, index: number) => void | Promise<void>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  let failed: { error: unknown } | null = null
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++
      try {
        out[i] = await fn(items[i]!, i)
        await onDone?.(out[i]!, i)
      } catch (error) {
        failed ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  if (failed) throw (failed as { error: unknown }).error
  return out
}
