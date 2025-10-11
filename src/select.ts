import { attemptNotOk } from './_attempt-results.js'
import { shuffle } from './_fisherYatesShuffle.js'
import { NamedError } from './_NamedError.js'
import { AbortablePromise } from './AbortablePromise.js'
import type { Selectable, SelectableAttemptResult } from './channel-api.js'

export type SelectArgsMap = Record<string, NullableSelectArg>

export type NullableSelectArg = 
    | SelectArg
    | null

export type SelectArg =
    | Selectable<unknown>
    | Promise<unknown>
    | ((signal: AbortSignal) => Promise<unknown>)

export interface SelectResultLike {
    type: PropertyKey
    value: unknown
}

export type SelectResult<TArgs extends SelectArgsMap> = ({
    [K in StringKeyof<TArgs>]: {
        type: K
        value: InferSelectArgResult<TArgs[K]>
    }
})[StringKeyof<TArgs>]

type StringKeyof<T> = Extract<keyof T, string>

type InferSelectArgResult<T> =
    T extends Selectable<infer U>
        ? U
    : T extends Promise<infer U>
        ? U
    : T extends (signal: AbortSignal) => Promise<infer U>
        ? U
    : never

export class SelectError extends NamedError {
    constructor(readonly argName: string, cause: unknown) {
        super(`Error in argument ${argName}`, { cause })
    }
}

export async function select<TArgs extends SelectArgsMap>(
    args: TArgs
): Promise<SelectResult<TArgs>> {
    const c = new AbortController()

    const nameAndArg = Object.entries(args)
    shuffle(nameAndArg)

    const promises: Promise<WaitResult>[] = []

    nameAndArg.forEach(([name, arg], index) => {
        if (arg === null) {
            return
        }

        const p = waitForArg(arg, name, index, c.signal)
        promises.push(p)
    })

    if (promises.length === 0) {
        throw new Error(
            `select() requires at least one non-null operation. Received: ${JSON.stringify(args)}`
        )
    }

    try {
        while (true) {
            const winner = await Promise.race(promises)

            if (winner.type === 'promise') {
                const r = {
                    type: winner.name,
                    value: winner.value,
                }

                //@ts-expect-error
                return r
            }

            let attemptResult: SelectableAttemptResult<unknown>

            try {
                attemptResult = winner.self.attempt()
            }
            catch (exception) {
                throw new SelectError(winner.name, exception)
            }

            if (attemptResult.ok) {
                const r = {
                    type: winner.name,
                    value: attemptResult.value,
                }

                //@ts-expect-error
                return r
            }
            
            promises[winner.index] = winner.self.wait(winner, c.signal)
        }
    }
    finally {
        c.abort()
    }
}

/**
 * Note: we could instead define how to map each SelectArg into Selectable
 * and keep `select()` code uniform, but the goal here is to avoid, as much as
 * possible, adding async/await indirection. Perhaps helps for performance,
 * but mainly makes fairness more predictable
 */
function waitForArg(
    arg: SelectArg,
    name: string,
    index: number,
    signal: AbortSignal
): Promise<WaitResult> {
    if (arg instanceof Promise) {
        return arg
            .then(
                value => ({ type: 'promise', name, value }),

                error => {
                    throw new SelectError(name, error)
                },
            )
    }

    if (typeof arg === 'function') {
        return arg(signal).then(
            value => ({ type: 'promise', name, value }),

            error => {
                throw new SelectError(name, error)
            },
        )
    }

    return arg.wait(
        { type: 'selectable', name, index, self: arg }, 
        signal
    )
    .catch(error => {
        throw new SelectError(name, error)
    })
}

type WaitResult =
    | { type: 'promise', name: string, value: unknown }
    | { type: 'selectable', name: string, index: number, self: Selectable<unknown> }

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

// TODO: rework below

/**
 * Returns a {@link Selectable} that resolves once the passed signal aborts.
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
export function raceAbortSignal(signal: AbortSignal): Selectable<unknown> {
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
                return { ok: true, value: signal.reason }
            }

            return attemptNotOk
        },
    }
}
