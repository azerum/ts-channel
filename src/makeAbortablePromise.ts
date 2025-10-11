import { NamedError } from './_NamedError.js'

/**
 * Extends Promise constructor to accept not just a `(resolve, reject) => void` 
 * function, but `(resolve, reject) => cleanupOnAbortFn` and `AbortSignal`
 * 
 * Helps to write promises that can be cancelled without leaking `abort` 
 * listeners on the signal, and without forgetting to write cleanup logic.
 * See the example below
 * 
 * Semantics:
 * 
 * - Adds `abort` listener on `AbortSignal`. After promise settles,
 * the listener is always removed (no leaks)
 * 
 * - If `resolve` or `reject` are called before `abort` fires, resolves/rejects
 * as a usual promise
 * 
 * - If `abort` fires before `resolve` or `reject` are called, 
 * calls `cleanupOnAbortFn` and rejects with `AbortedError` 
 * 
 *  - If the passed `AbortSignal` is already aborted, does not call `executor` at 
 * all, and rejects with `AbortedError`
 * 
 * - `cleanupOnAbortFn` is guaranteed to be called only once, and only if 
 * `resolve`/`reject` has not been called
 * 
 * - Race condition is possible where `abort` fires, than `resolve`/`reject`
 * happens, then `abort` is handled. In such case `resolve`/`reject`
 * always wins
 * 
 * @example
 *
 * Promisified `setTimeout` with cancellation that removes the timer
 * 
 * ```ts
 * function sleep(ms: number, signal?: AbortSignal) {
 *      return new AbortablePromise((resolve, _reject) => {
 *          const handle = setTimeout(() => resolve(), ms)
 * 
 *          // Called only if `signal` is aborted before `setTimeout` callback 
 *          // is executed
 *          return () => clearTimeout(ms)
 *      }, signal)
 * }
 * ```
 */
export function makeAbortablePromise<T>(
    executor: (
        resolve: (value: T) => void,
        reject: (exception: unknown) => void
    ) => (() => void) | null,

    signal?: AbortSignal
): Promise<T> {
    return new Promise<T>((doResolve, doReject) => {
        let hasSettled = false

        const resolve = (value: T) => {
            doResolve(value)
            hasSettled = true
        }

        const reject = (reason: unknown) => {
            doReject(reason)
            hasSettled = true
        }

        if (signal?.aborted) {
            reject(new AbortedError())
            return
        }

        const abortListener = () => {
            if (!hasSettled) {
                rejectAndRemoveListener(new AbortedError())
                cleanupOnAborted?.call(undefined)
            }
        }

        const resolveAndRemoveListener = (value: T) => {
            signal?.removeEventListener('abort', abortListener)
            resolve(value)
        }

        const rejectAndRemoveListener = (reason: unknown) => {
            signal?.removeEventListener('abort', abortListener)
            reject(reason)
        }

        const cleanupOnAborted = executor(
            resolveAndRemoveListener,
            rejectAndRemoveListener
        )

        if (!hasSettled) {
            signal?.addEventListener('abort', abortListener, { once: true })
        }
    })
}

export class AbortedError extends NamedError { }
