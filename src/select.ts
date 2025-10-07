import { shuffle } from './_fisherYatesShuffle.js'
import { AbortablePromise } from './AbortablePromise.js'
import type { ReadableChannel, SelectablePromise } from './channel-api.js'
import { Channel } from './Channel.js'

export type SelectArgsLike = Record<string, SelectablePromise<unknown>>

export interface SelectResultLike {
    type: PropertyKey
    value: unknown
}

export type SelectResult<TArgs extends SelectArgsLike> = ({
    [K in StringKeyof<TArgs>]: {
        type: K
        value: InferSelectablePromiseType<TArgs[K]>
    }
})[StringKeyof<TArgs>]

type StringKeyof<T> = Extract<keyof T, string>

type InferSelectablePromiseType<T> = 
    T extends SelectablePromise<infer U> 
        ? U
    : never

export async function select<TArgs extends SelectArgsLike>(
    args: TArgs
): Promise<SelectResult<TArgs>> {
    const c = new AbortController()

    const promises = Object.entries(args).map((typeAndP) => {
        const [_, p] = typeAndP
        return p.wait(typeAndP, c.signal)
    })
    
    try {
        while (true) {
            shuffle(promises)
    
            const [winner, index] = await Promise.race(
                promises.map((p, index) => p.then(r => [r, index] as const))
            )
    
            const [type, p] = winner
            const maybeResult = p.attempt()
    
            if (maybeResult[0]) {
                //@ts-expect-error
                return {  
                    type,
                    value: maybeResult[1],
                }
            }
    
            promises[index] = p.wait(winner, c.signal)
        }
    }
    finally {
        c.abort()
    }
}

export function returnOnAborted(signal: AbortSignal): SelectablePromise<unknown> {
    return {
        wait(value, cancelSignal) {
            return new AbortablePromise(resolve => {
                if (signal.aborted) {
                    resolve(value)
                    return null
                }

                const listener = () => resolve(value)
                signal.addEventListener('abort', listener)

                return () => {
                    signal.removeEventListener('abort', listener)
                }
            }, cancelSignal)
        },

        attempt() {
            if (signal.aborted) {
                return [true, signal.reason]
            }

            return [false]
        },
    }
}

/**
 * Returns a channel that closes after given time
 */
export function timeout(ms: number): ReadableChannel<never> {
    const ch = new Channel<never>(0)

    setTimeout(() => {
        ch.close()
    }, ms)

    return ch
}
