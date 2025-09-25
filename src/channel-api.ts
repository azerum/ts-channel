import { NamedError } from './_NamedError.js'

export interface BaseReadableChannel<T> {
    /**
     * Blocks until the channel has a value to read - either a value in the buffer
     * or a blocked {@link WritableChannel.write}. Returns `undefined`
     * if the channel is closed
     */
    read: () => Promise<T | undefined>
}

export interface ReadableChannel<T> extends BaseReadableChannel<T> {
    get closed(): boolean

    /**
     * @returns `undefined` if the channel is closed or empty. Use 
     * {@link ReadableChannel.closed} to tell the cases apart
     */
    tryRead: () => T | undefined

    /**
     * Blocks until the channel is read-ready. Read-ready means that either 
     * (a) the channel is closed or (b) the channel has values in buffer or
     * blocked writes. Intuitively, `read()` called on read-ready channel 
     * will never block
     * 
     * If multiple waits are performed on the same channel, only one 
     * of them (randomly chosen) is unblocked once the channel becomes
     * read-ready
     * 
     * Resolves immediately if the channel is ready-ready
     */
    waitForReadReady: <const T>(value: T, signal?: AbortSignal) => Promise<T>
}

export interface WritableChannel<T> {
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
     * Idempotent
     */
    close: () => void
}

export class CannotWriteIntoClosedChannel extends NamedError {}
