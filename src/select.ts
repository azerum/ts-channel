import { shuffle } from './_fisherYatesShuffle.js'
import type { NotUndefined, ReadableChannel } from './channel-api.js'
import { makeAbortSignal } from './_makeAbortSignal.js'
import type { NonEmptyArray } from './NonEmptyArray.js'

/**
 * @internal Internal helper: can be removed without notice
 */
export type InferSelectResult<TArgs> = 
    TArgs extends ReadableChannel<infer U>[]
        ? SelectResult<U>
        : never

export type SelectResult<T extends NotUndefined> = 
    [ReadableChannel<T>, T | undefined]

/**
 * Like `select {}` statement in Go, or `alts!` statement from Clojure's 
 * `core.async`. Currently supports only reading, not writing
 * 
 * Allows to read from multiple channels at once, whichever has a value or 
 * closes first. This is similar to `Promise.race(channels.map(c => c.read()))`,
 * except:
 * 
 * - Only the selected channel will be read from. Values of other channels will
 * remain intact (`Promise.race` example would read from all channels and 
 * discard other values)
 * 
 * - `select()` tries to be fair: if multiple channels have a value, one is 
 * selected at random (`Promise.race` would always select the one earlier in 
 * the array). This is similar to behavior of Go's `select {}`
 * 
 * @param signal Optionally provide AbortSignal to cancel the call. Once
 * the signal is aborted, `select()` will throw {@link AbortedError}
 * and cancel all reads
 * 
 * @returns Tuple of `[channel, value]` - the selected channel and the value
 * read from it. `value` is `undefined` if the channel has closed
 * 
 * @example 
 * 
 * Read from `ch` or timeout:
 * 
 * ```ts
 * const [winnerCh, value] = await select([ch, timeout(1000)])
 * 
 * if (winnerCh !== ch) {
 *  // Timed out
 * }
 * ```
 * 
 * Read from `ch` or throw when `signal` is aborted:
 * 
 * ```ts
 * const [_, value] = await select([ch], signal)
 * ```
 */
export async function select<
    const TArgs extends NonEmptyArray<ReadableChannel<NotUndefined>>
>(
    channels: TArgs,
    signal?: AbortSignal
): Promise<InferSelectResult<TArgs>> {
    if (channels.length === 0) {
        throw new Error('select() requires at least one channel')
    }

    const [usedSignal, abort] = makeAbortSignal(signal)

    const promises = channels.map(
        (ch, index) => ch.waitUntilReadable(index, usedSignal)
    )
    
    while (true) {
        // Shuffle the array on every re-run to keep select() fair. Remember
        // that Promise.race() picks the first settled promise
        shuffle(promises)

        const winnerIndex = await Promise.race(promises)
        const ch = channels[winnerIndex]!

        const result = ch.tryRead()

        if (result !== undefined || ch.closed) {
            abort()
            
            //@ts-expect-error
            return [ch, result]
        }

        promises[winnerIndex] = ch.waitUntilReadable(winnerIndex, usedSignal)
    }
}
