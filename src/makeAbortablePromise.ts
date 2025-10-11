import { NamedError } from './_NamedError.js'

/**
 * Helper to write promises that can be cancelled without: (1) leaking
 * 'abort' listeners on the signal and (2) forgetting to write cleanup
 * logic
 * 
 * Accepts an `AbortSignal` and an executor function - similar to 
 * `(resolve, reject) => void` passed to `new Promise`, except this one 
 * has type `(resolve, reject) => cleanupOnAbort | null`:
 * 
 * - `resolve()`/`reject()` resolve/reject the promise as usual
 * 
 * - When `signal` is aborted before `resolve()`/`reject()` is called, the promise 
 * automatically rejects with `AbortedError`. If provided, `cleanupOnAbort` is 
 * called afterwards
 * 
 * For example, here's cancellable `setTimeout()`:
 * 
 * ```ts
 * function sleep(ms: number, signal?: AbortSignal) {
 *      return makeAbortablePromise((resolve, _reject) => {
 *          const handle = setTimeout(() => resolve(), ms)
 * 
 *          // Called only if `signal` is aborted before `setTimeout` callback 
 *          // is executed
 *          return () => clearTimeout(ms)
 *      }, signal)
 * }
 * ```
 * 
 * This code does not leaving dangling timer if `sleep()` is cancelled
 * 
 * This code also does not leak `'abort'` listener on `signal` - the 
 * listener is always removed, regardless of whether `sleep()` has completed
 * or got cancelled
 * 
 * Finally, if `signal` is not provided, the promise behaves just like regular one,
 * and `cleanupOnAbort` is never called
 *
 * > Tip: if you want to return a special value instead of throwing upon cancelling,
 * just wrap the promise in `try { return await promise } catch (exception) { if (exception instanceof AbortedException) { return ... } throw exception }`
 * or similar
 * 
 * Detailed semantics:
 * 
 * - As with usual promise, if `resolve()`/`reject()` are called after
 * the promise is settled (either via `resolve()`/`reject()`, or by cancelling
 * `signal`), they have no effect
 * 
 * - If `signal` is already aborted at the moment of the call, `executor()` is
 * not even ran - promise rejected with `AbortedError` is returned immediately
 * 
 * - Adds `abort` listener on `AbortSignal`. After promise settles,
 * the listener is always removed (no leaks)
 * 
 * - `cleanupOnAbortFn` is guaranteed to be called only once, and only if 
 * `resolve()`/`reject()` have not been called
 * 
 * - Race condition is possible where `'abort'` *fires*, than `resolve()`/`reject()`
 * is called, then `'abort'` is *handled*. In such case `resolve()`/`reject()`
 * always win
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
