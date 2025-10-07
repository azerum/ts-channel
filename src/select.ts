import { shuffle } from './_fisherYatesShuffle.js'
import { AbortablePromise } from './AbortablePromise.js'
import type { SelectablePromise } from './channel-api.js'

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

/**
 * ### Overview
 * 
 * Similar to `select {}` statement in Go`: tries to perform multiple reads/writes 
 * at once. The first read/write that  can be performed wins the race. The 
 * remaining operations are cancelled in such way that channels remain intact 
 * (no values read from/written into them)
 * 
 * If multiple operations can be performed simultaneously (e.g. if you 
 * try to perform read on two non-empty channels), one operation is selected
 * at random
 * 
 * Example: read from `a: ReadableChannel<number>` or `b: ReadableChannel<boolean>`, 
 * whichever is readable first:
 * 
 * ```ts
 * const result = await select({ 
 *  a: a.raceRead(),
 *  b: b.raceRead()
 * })
 * 
 * result.type // 'a' | 'b'
 * result.value // number | boolean | undefined
 * ```
 * 
 * This is similar to:
 * 
 * ```ts
 * await Promise.race([a.read(), b.read()])
 * ```
 * 
 * Except:
 * 
 * - `Promise.race()` will not cancel the read from `b` - next value written
 * into `b` will be lost
 * 
 * - `Promise.race()` is not fair - it always selects the first promise in
 * the array if multiple are resolved
 * 
 * ### Other operations
 * 
 * Writes can be raced too:
 * 
 * ```ts
 * select({ didWrite: ch.raceWrite(42) })
 * ```
 * 
 * Also see {@link raceTimeout}, {@link raceAbortSignal}, {@link raceNever}
 */
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


/**
 * Returns a {@link SelectablePromise} that resolves once the passed signal aborts.
 * Meant to be used with {@link select}, to cancel reads/writes to channels
 * based on the signal
 * 
 * The promise resolves with `signal.reason`
 * 
 * After {@link select} completes, guarantees to remove any listeners added
 * to `signal` (no memory leaks)
 * 
 * @example
 * 
 * Read a value or abort (either return a special value or throw on abort):
 * 
 * ```ts
 * const result = await select({ 
 *  value: ch.raceRead(),
 *  aborted: raceAbortSignal(signal)
 * })
 * 
 * switch (result.type) {
 *  case 'value':
 *    // Did read a value (or undefined if `ch` was closed)
 *    return result.value
 *  
 *  case 'aborted':
 *    // Signal aborted before read. result.value is signal.reason
 *    return 'aborted'
 * 
 *    // Alternatively, you can throw exception that `signal.throwIfAborted()`
 *    // would throw
 *    throw result.value
 * }
 * ```
 */
export function raceAbortSignal(signal: AbortSignal): SelectablePromise<unknown> {
    return {
        wait(value, cancelSignal) {
            return new AbortablePromise(resolve => {
                if (signal.aborted) {
                    resolve(value)
                    return null
                }

                const listener = () => resolve(value)
                signal.addEventListener('abort', listener, { once: true })

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
 * A {@link SelectablePromise} that never wins {@link select} 
 * race. Useful when you need to select something conditionally
 * 
 * > Warning: if you call {@link SelectablePromise.wait} directly and `await`
 * and/or add callbacks with `.then()` on the returned promise, you may leak
 * memory. That's because the promise never resolves. Memory is not leaked
 * if you pass `signal` and abort it  
 * >
 * > Usually you don't use that method directly
 * 
 * @example
 * 
 * ```ts
 * // Performs read on `ch`, optionally cancels the read if `signal`
 * // is provided and is aborted. Throws on abort
 * async function readOrCancel(ch: ReadableChannel<number>, signal?: AbortSignal): Promise<number | undefined> {
 *  const result = await select({ 
 *    read: ch.raceRead(),
 *    aborted: signal ? raceAbortSignal(signal) : raceNever
 *  })
 * 
 *  switch (result.type) {
 *    case 'read': return result.value
 *    case 'aborted': throw result.value
 *  }
 * }
 * ```
 */
export const raceNever: SelectablePromise<never> = {
    wait(_value, signal) {
        return new AbortablePromise(() => {
            return null
        }, signal)
    },

    attempt() {
        return [false]
    },
}

/**
 * Returns a {@link SelectablePromise} that resolves after given time.
 * Meant to be used to cancel reads/writes on timeout with {@link select}
 * 
 * @example
 * 
 * Write into channel or timeout
 * 
 * ```ts
 * select({ wrote: ch.raceWrite(42), timedOut: raceTimeout(1000) })
 * ```
 */
export function raceTimeout(ms: number): SelectablePromise<void> {
    let elapsed = false

    return {
        wait(value, signal) {
            return new AbortablePromise(resolve => {
                const handle = setTimeout(() => {
                    elapsed = true
                    resolve(value)
                }, ms)

                return () => clearTimeout(handle)
            }, signal)
        },

        attempt() {
            return elapsed ? [true, undefined] : [false]
        },
    }
}

/**
 * Type-level check that `value` is `never`. Useful for exhaustive
 * matching, e.g. for return value of {@link select}
 * 
 * If you provide value that is not of type `never`, there will be a 
 * compile-time error. As a failsafe, this function will throw at runtime
 * if it is ever called (code with `never` values is supposed to be unreachable)
 */
export function assertNever(value: never): never {
    throw new Error(
        `Expected code to be unreachable. Got value: ${JSON.stringify(value)}`
    )
}
