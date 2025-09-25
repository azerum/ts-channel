import { shuffle } from './_fisherYatesShuffle.js'
import type { ReadableChannel } from './channel-api.js'
import type { NonEmptyArray } from './NonEmptyArray.js'

/**
 * @internal Might be removed without notice
 */
export type SelectResult<TArgs> = 
    TArgs extends ReadableChannel<infer U>[]
        ? [ReadableChannel<U>, U | undefined]
        : never

/**
 * Like `select {}` statement in Go, but only reading from channel is supported.
 * Attempts to read from all channels at once, unblocks with the value of the
 * first readable channel. For definition of "readable", see {@link ReadableChannel.waitUntilReadable}
 * 
 * If multiple channels are readable, selects one at random
 */
export async function select<
    const TArgs extends NonEmptyArray<ReadableChannel<unknown>>
>(
    channels: TArgs
): Promise<SelectResult<TArgs>> {
    if (channels.length === 0) {
        throw new Error('select() requires at least one channel')
    }

    const controller = new AbortController()

    const promises = channels.map(
        (ch, index) => ch.waitUntilReadable(index, controller.signal)
    )
    
    while (true) {
        // Shuffle the array on every re-run to keep select() fair. Remember
        // that Promise.race() picks the first settled promise
        shuffle(promises)

        const winnerIndex = await Promise.race(promises)
        const ch = channels[winnerIndex]!

        const result = ch.tryRead()

        if (result !== undefined || ch.closed) {
            controller.abort()
            
            //@ts-expect-error
            return [ch, result]
        }

        promises[winnerIndex] = ch.waitUntilReadable(winnerIndex, controller.signal)
    }
}
