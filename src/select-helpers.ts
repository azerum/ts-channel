import { makeAbortablePromise } from './makeAbortablePromise.js'

/**
 * Promise version of `setTimeout()`: resolves with `value` after `ms` ms. 
 * Can be cancelled with `signal`: when cancelled, throws `AbortedError` and
 * clears the timer
 */
export function sleep<const T>(ms: number, value: T, signal?: AbortSignal): Promise<T> {
    return makeAbortablePromise(resolve => {
        const handle = setTimeout(() => {
            resolve(value)
        }, ms)

        return () => clearTimeout(handle)
    }, signal)
}

/**
 * Waits for `signal` to abort, resolves with `signal.reason` when it is aborted.
 * The wait can be cancelled by providing a *second* signal - `cancelSignal`. 
 * When `cancelSignal` is cancelled, promise rejects with `AbortedError`
 * 
 * Any listeners added on both `signal` and `cancelSignal` are
 * always removed by the time the promise is settled - no leaks
 * 
 * Note that this function is curried - `returnOnAbort(signal)(cancelSignal)`
 * instead of `returnOnAbort(signal, cancelSignal)`. This is to encourage cleanup
 * of listeners when using it with {@link select}. Compare:
 * 
 * Listener is removed once {@link select} completes:
 * 
 * ```ts
 * await select({ 
 *  aborted: returnOnAbort(mySignal),
 *  someOtherOp: something,
 * })
 * ```
 * 
 * Listener is not removed until `mySignal` aborts:
 * 
 * ```ts
 * await select({ 
 *  aborted: returnOnAbort(mySignal)(),
 *  someOtherOp: something,
 * })
 * ```
 * 
 * In former we pass `(cancelSignal?: AbortSignal) => Promise<unknown>`, which 
 * allows cancellation via `cancelSignal`. In later we pass `Promise<unknown>`,
 * which cannot be cancelled
 */
export function returnOnAbort(signal: AbortSignal) {
    return (cancelSignal?: AbortSignal): Promise<unknown> => {
        return makeAbortablePromise(resolve => {
            const listener = () => resolve(signal.reason)
            signal.addEventListener('abort', listener, { once: true })

            return () => {
                signal.removeEventListener('abort', listener)
            }
        }, cancelSignal)
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
