import { shuffle } from './_fisherYatesShuffle.js'
import type { ReadableChannel } from './channel-api.js'

type SelectResult<TArgs> = 
    TArgs extends ReadableChannel<infer U>[]
        ? U | undefined
        : never

export async function select<const TArgs extends ReadableChannel<unknown>[]>(
    channels: TArgs
): Promise<SelectResult<TArgs>> {
    const controller = new AbortController()

    const promises = channels.map(
        (ch, index) => ch.waitForReadReady(index, controller.signal)
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
            return result
        }

        promises[winnerIndex] = ch.waitForReadReady(winnerIndex, controller.signal)
    }
}
