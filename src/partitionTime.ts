import type { NotUndefined, ReadableChannel } from './channel-api.js'
import { raceTimeout, select } from './select.js'

/**
 * Reads from `source` channel in groups of size `groupSize`. However, if more
 * than `nextValueTimeoutMs` elapse since the last read from `source`, yields
 * an incomplete group (with length < `groupSize`) early
 * 
 * The returned iterable is closed once `source` closes. If there is an 
 * incomplete group, it is yielded before closing
 * 
 * Never yields empty arrays
 * 
 * @param groupSize Must be an integer >= 1
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
export async function* partitionTime<T extends NotUndefined>(
    source: ReadableChannel<T>,
    groupSize: number,
    nextValueTimeoutMs: number,
): AsyncIterable<[T, ...T[]]> {
    if (!Number.isInteger(groupSize) || groupSize < 1) {
        throw new Error(`groupSize must be an integer >= 1. Got: ${groupSize}`)
    }

    while (true) {
        const first = await source.read()
    
        // source closed
        if (first === undefined) {
            return
        }

        const group = await collectGroup(first)
        yield group
    }

    async function collectGroup(first: T): Promise<[T, ...T[]]> {
        const group: [T, ...T[]] = [first]
        
        while (group.length < groupSize) {
            const winner = await select({
                value: source.raceRead(),
                timeout: raceTimeout(nextValueTimeoutMs),
            })

            switch (winner.type) {
                case 'value': {
                    if (winner.value === undefined) {
                        // source has closed
                        return group
                    }

                    group.push(winner.value)
                    continue
                }

                case 'timeout': {
                    return group
                }
            }
        }

        return group
    }
}
