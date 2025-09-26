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
 * - Adds `abort` listener on `AbortSignal`. After the promise settles,
 * the listener is always removed (no leaks)
 * 
 * - If `abort` fires before `resolve` or `reject` is called, 
 * calls `cleanupOnAbort` function is called and rejects with `AbortedError` 
 * 
 * - If `resolve` or `reject` is called before `abort` is fired, resolves/rejects
 * as a regular promise
 * 
 * - `cleanupOnAbort` is guaranteed to be called at most once, and only if
 * `resolve` or `reject` has not been called yet
 * 
 * - Race condition is possible where `abort` fires, than `resolve` or `reject`
 * is performed before `abort` is handled. In such case `resolve`/`reject`
 * always wins.
 * 
 * - If passed `AbortSignal` is already aborted, does not call `executor` at 
 * all, and rejects with `AbortedError`
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
export class AbortablePromise<T> extends Promise<T> {
    private hasSettled = false

    constructor(
        executor: (
            resolve: (value: T) => void, 
            reject: (exception: unknown) => void
        ) => (() => void),
        
        signal?: AbortSignal
    ) {
        let resolve!: (value: T) => void
        let reject!: (exception: unknown) => void

        super((doResolve, doReject) => {
            resolve = value => {
                doResolve(value)
                this.hasSettled = true
            }

            reject = reason => {
                doReject(reason)
                this.hasSettled = true
            }
        })

        if (signal?.aborted) {
            reject(new AbortedError())
            return
        }

        const abortListener = () => {
            if (!this.hasSettled) {
                rejectAndRemoveListener(new AbortedError())
                cleanupOnAborted()
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

        if (!this.hasSettled) {
            signal?.addEventListener('abort', abortListener, { once: true })
        }
    }
}

export class AbortedError extends NamedError {}
