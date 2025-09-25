import { shuffle } from './_fisherYatesShuffle.js'
import type { ReadableChannel } from './channel-api.js'

type NonEmptyArray<T> = [T, ...T[]]

type SelectResult<TArgs> = 
    TArgs extends ReadableChannel<infer U>[]
        ? [ReadableChannel<U>, U | undefined]
        : never

export async function select<
    const TArgs extends NonEmptyArray<ReadableChannel<unknown>>
>(
    channels: TArgs
): Promise<SelectResult<TArgs>> {
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
