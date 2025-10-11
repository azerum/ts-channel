import { makeAbortablePromise } from './makeAbortablePromise.js'

export function sleep<const T>(ms: number, value: T, signal?: AbortSignal): Promise<T> {
    return makeAbortablePromise(resolve => {
        const handle = setTimeout(() => {
            resolve(value)
        }, ms)

        return () => clearTimeout(handle)
    }, signal)
}

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
