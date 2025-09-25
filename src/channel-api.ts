import type { AbortedError } from './AbortablePromise.js'
import { NamedError } from './_NamedError.js'

export interface BaseReadableChannel<out T> {
    /**
     * Blocks until the channel has a value to read - either a value in the buffer
     * or a blocked {@link WritableChannel.write}. Returns `undefined`
     * if the channel is closed
     */
    read: () => Promise<T | undefined>
}

export interface ReadableChannel<out T> extends BaseReadableChannel<T>, AsyncIterable<T> {
    get closed(): boolean

    /**
     * @returns `undefined` if the channel is closed or empty. Use 
     * {@link ReadableChannel.closed} to tell the cases apart
     */
    tryRead: () => T | undefined

    /**
     * Blocks until the channel is "readable". "Readable" means that the 
     * next call to {@link ReadableChannel.read} will not block. In other words, 
     * readable channel either has a value in buffer, has a blocked 
     * {@link WritableChannel.write}, or is closed
     * 
     * If channel is already readable, resolves immediately
     * 
     * @param value Value to return on resolution
     * 
     * @param signal Can be used to cancel the wait. After cancelling, 
     * the returned promise will reject with {@link AbortedError}
     */
    waitUntilReadable: <const T>(value: T, signal?: AbortSignal) => Promise<T>
}

export interface WritableChannel<in T> {
    get closed(): boolean

    /**
     * Blocks until the channel has a free space in buffer. If the channel
     * is unbuffered, blocks until {@link ReadableChannel.read} is 
     * performed
     * 
     * Note: writing `undefined` into channels is not supported to make
     * sure the return value of {@link ReadableChannel.read} is 
     * unambiguous
     * 
     * @throws {CannotWriteIntoClosedChannel} If the channel is already closed 
     * OR if the channel was closed while this call was blocked
     */
    write: (value: Exclude<T, undefined>) => Promise<void>

    /**
     * Closes the channel. Closed channel does not accept new writes
     * ({@link WritableChannel.write} after close will throw)
     * 
     * Calls to {@link ReadableChannel.read} will consume values remained
     * in the buffer (if any), and then eventually will keep returning `undefined`
     * 
     * Idempotent
     */
    close: () => void
}

export class CannotWriteIntoClosedChannel extends NamedError {}
