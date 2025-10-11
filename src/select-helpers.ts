import { AbortablePromise } from './AbortablePromise.js'

export function sleep<const T>(ms: number, value: T, signal?: AbortSignal): Promise<T> {
    return new AbortablePromise(resolve => {
        const handle = setTimeout(() => {
            resolve(value)
        }, ms)

        return () => clearTimeout(handle)
    }, signal)
}

export function returnOnAbort(signal: AbortSignal) {
    return (cancelSignal?: AbortSignal): Promise<unknown> => {
        return new AbortablePromise(resolve => {
            const listener = () => resolve(signal.reason)
            signal.addEventListener('abort', listener, { once: true })

            return () => {
                signal.removeEventListener('abort', listener)
            }
        }, cancelSignal)
    }
}
