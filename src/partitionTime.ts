import type { NonEmptyArray } from './_NonEmptyArray.js'
import type { ReadableChannel } from './channel-api.js'
import { select } from './select.js'
import { timeout } from './timeout.js'

export interface PartitionTime<T> {
    source: ReadableChannel<T>
    groupSize: number
    nextValueTimeoutMs: number
}

/**
 * Reads from `source` in groups of size `groupSize`. The returned iterable
 * closes once `source` does. If more than `nextValueTimeoutMs` elapses since
 * last read from `source`, yields incomplete group. Useful for batch processing
 * that does not block for long time
 * 
 * @example
 * 
 * ```ts
 * function producer(): ReadableChannel<T> {
 *  // ...
 * }
 * 
 * async function saver(values: ReadableChannel<T>) {
 *  const batchedValues = partitionTime({ 
 *      source: values, 
 *      groupSize: 50, 
 *      nextValueTimeoutMs: 10_000 
 *  })
 * 
 *  // Does not wait for longer than 10s if `producer()` produces
 *  // less than 50 values
 *  for await (const batch of batchedValues)) {
 *      await insertInDb(batch)
 *  }
 * }
 * ```
 */
export async function* partitionTime<T>({
    source,
    groupSize,
    nextValueTimeoutMs,
}: PartitionTime<T>): AsyncIterable<[T, ...T[]]> {
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
