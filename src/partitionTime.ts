import type { NonEmptyArray } from './NonEmptyArray.js'
import type { ReadableChannel } from './channel-api.js'
import { select } from './select.js'
import { timeout } from './timeout.js'

/**
 * Reads from `source` in groups of size `groupSize`. The returned iterable
 * closes once `source` does. If more than `nextValueTimeoutMs` elapses since
 * last read from `source`, yields incomplete group. Useful for batch processing
 * that does not block for long time
 * 
 * @example
 * 
 * Simple example:
 * 
 * ```ts
 * function numbers(): ReadableChannel<number> {
 *  const ch = new Channel<number>(0)
 * 
 *  void (async () => {
 *      for (let i = 0;; ++i) {
 *          await ch.write(i)
 *      }
 *  })()
 * 
 *  return ch
 * }
 * 
 * // This gives iterable:
 * // [0, 1, 2]
 * // [3, 4, 5]
 * // [6, 7, 8]
 * // ...
 * const groups = partitionTime(numbers(), 3, 1000)
 * ```
 * 
 * Grouping with timeout:
 * 
 * ```ts
 * function producer(): ReadableChannel<Something> {
 *  // ...
 * }
 * 
 * async function saver(values: ReadableChannel<Something>) {
 *  const batchedValues = partitionTime(values, 50, 10_000)
 * 
 *  // Does not wait for longer than 10s if `producer()` produces
 *  // less than 50 values
 *  for await (const batch of batchedValues)) {
 *      await insertInDb(batch)
 *  }
 * }
 * ```
 */
export async function* partitionTime<T>(
    source: ReadableChannel<T>,
    groupSize: number,
    nextValueTimeoutMs: number,
): AsyncIterable<[T, ...T[]]> {
    while (true) {
        const first = await source.read()
    
        // source closed
        if (first === undefined) {
            return
        }

        const group = await collectGroup(first)
        yield group
    }

    async function collectGroup(first: T): Promise<NonEmptyArray<T>> {
        const group: NonEmptyArray<T> = [first]
        
        while (group.length < groupSize) {
            const [_, result] = await select([
                source,
                timeout(nextValueTimeoutMs)
            ])

            // Either timed out or source has closed
            if (result === undefined) {
                return group
            }

            group.push(result)
        }

        return group
    }
}
