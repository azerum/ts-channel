import { shuffle } from './_fisherYatesShuffle.js'
import { NamedError } from './_NamedError.js'
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
 * NOTE: implementation should make best effort to ensure that each `arg`
 * uses the same number of `.then()`/`catch()`/`await` on each arg. This
 * is needed to ensure fairness
 * 
 * Any added `then()` delays settling of the promise, so if 
 * user passed two resolved SelectArgs of different types, 
 * say a1: Promise and a2: Selectable, but this function uses different number 
 * of `then()`s for each, one with the least `then()`s will always win the race:
 * 
 * This always prints 2:
 * 
 * ```ts
 * console.log(await Promise.race([
 *  Promise.resolve(1).then().then(),
 *  Promise.resolve(2).then(),
 * ]))
 * ```
 * 
 * As users don't see the machinery of `select()`, for them it would be
 * confusing
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
