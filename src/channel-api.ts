import { NamedError } from './_NamedError.js'

/**
 * `undefined` cannot be written into channels as {@link ReadableChannel.read}
 * uses `undefined` as a special value. That's why channel interfaces have 
 * `T extends NotUndefined` constraint
 * 
 * `null` is allowed
 */
export type NotUndefined = {} | null

export interface HasClosed {
    /**
     * Returns `true` after {@link WritableChannel.close} was called on the channel.
     * See {@link WritableChannel.close} for the explanation of what are closed
     * channels
     */
    get closed(): boolean
}

/**
 * Channel that can be read from. Implements `AsyncIterable`, hence can be
 * used with `for await` loop
 */
export interface ReadableChannel<T extends NotUndefined> extends HasClosed, AsyncIterable<T> {
    /**
     * Reads a value from the channel. If there are no values, blocks until
     * there is
     * 
     * If channel is buffered, takes next value from the buffer. This unblocks
     * first of blocked {@link WritableChannel.write} calls if there are any
     * 
     * If channel is unbuffered, simply unblocks the first of blocked 
     * {@link WritableChannel.write}
     * 
     * If the channel is closed and has no values left in the buffer, 
     * returns `undefined`
     * 
     * Concurrent calls are allowed - each read will get own value (no 
     * two reads will get the same value). If multiple calls are blocked,
     * they will unblock one-by-one in unspecified order
     * 
     * > Note: each blocked call occupies memory, and there is no limit on 
     * how many calls there can be at once. Typically, programs have a fixed
     * or a finite number of reads, so this should not be a problem
     */
    read: () => Promise<T | undefined>

    /**
     * Non-blocking version of {@link ReadableChannel.read}. Unlike 
     * {@link ReadableChannel.read}, if channel has no values, returns `undefined`
     * 
     * This means `undefined` is returned in two cases: (1) the channel is open
     * but has no values, and the channel is closed and has no values. Use
     * {@link ReadableChannel.closed} to tell those apart
     */
    tryRead: () => T | undefined

    /**
     * Blocks until the channel is "readable", meaning that it either:
     * 
     * - Has a value (value in the buffer or a blocked {@link WritableChannel.write} call)
     * - Is closed
     * 
     * Intuitively, a channel is "readable", when the next 
     * {@link ReadableChannel.read} call on it will not block
     * 
     * @param value Specify value that will be returned once the wait unblocks
     * 
     * @param signal Use the signal to cancel the wait. This frees up memory
     * occupied by it. After cancelling, the wait will throw {@link AbortedError}
     */
    waitUntilReadable: <const R>(value: R, signal?: AbortSignal) => Promise<R>

    /**
     * Returns the number of currently blocked {@link ReadableChannel.waitUntilReadable}
     * calls
     */
    get readableWaitsCount(): number

    /**
     * Like {@link ReadableChannel.read}, but can be used with {@link select}
     */
    raceRead: () => Selectable<T | undefined>
}

/**
 * Channel that can be written into
 */
export interface WritableChannel<T extends NotUndefined> extends HasClosed {
    /**
     * Writes value to the channel. If there is no free space in the channel,
     * blocks until there is. This gives backpressure: if writer is faster than 
     * reader, the channel buffer will eventually fill up and the writer will 
     * start to block
     * 
     * If channel is buffered, tries to write value in the buffer, and blocks
     * if the buffer is full. If channel is unbuffered, waits for 
     * {@link ReadableChannel.read} call (resolved immediately if there is a
     * blocked {@link ReadableChannel.read} call already)
     * 
     * If the channel was closed before the call, or became closed while
     * the call was blocked, throws {@link CannotWriteIntoClosedChannel}
     * 
     * Order of values is guaranteed for sequential writes: after 
     * `await ch.write(1); await ch.write(2)`, `1` is guaranteed to be read
     * before `2`. Order is not guaranteed for concurrent writes: after
     * `await Promise.race([ch.write(1), ch.write(2)])`, `1` and `2` can appear
     * in any order when reading
     * 
     * > Note: in current implementation, order of values is the same as 
     * order of calls to `write()`, so example above will always give `1, 2`. 
     * This will change in future if `worker_threads` support will be implemented.
     * It is not advisable to rely on this
     */
    write: (value: T) => Promise<void>

    /**
     * Non-blocking version of {@link WritableChannel.write}. Returns `true`
     * is the value was written into the channel. Returns `false` when
     * {@link WritableChannel.write} would block. **Throws** if the channel 
     * is closed
     */ 
    tryWrite: (value: T) => boolean

    /**
     * Closes the channel. Closed channels cannot be written to. They can
     * still be read from if there are values left in the buffer
     * 
     * More precisely, after close:
     * 
     * - Blocked calls to {@link WritableChannel.write} will unblock by throwing
     * {@link CannotWriteIntoClosedChannel}
     * 
     * - Future calls to {@link WritableChannel.write} will throw {@link CannotWriteIntoClosedChannel}
     * immediately
     * 
     * - Calls to {@link ReadableChannel.read} will consume the values left
     * in the buffer before returning `undefined` 
     * 
     * Unlike in Go, this method is idempotent
     */
    close: () => void

    /**
     * Blocks until the channel is "writable", meaning that it either:
     * 
     * - Is closed
     * - Has a free space in the buffer
     * - Has a blocked {@link ReadableChannel.read} call
     * 
     * Intuitively, a channel is "writable", when the next 
     * {@link WritableChannel.write} call on it will not block (will resolve
     * or reject immediately)
     * 
     * @param value Specify value that will be returned once the wait unblocks
     * 
     * @param signal Use the signal to cancel the wait. This frees up memory
     * occupied by it. After cancelling, the wait will throw {@link AbortedError}
     */
    waitUntilWritable: <const R>(value: R, signal?: AbortSignal) => Promise<R>

    /**
     * Returns the number of currently blocked {@link WritableChannel.waitUntilWritable}
     * calls
     */
    get writableWaitsCount(): number

    /**
     * Like {@link WritableChannel.write}, but can be used with {@link select}
     */
    raceWrite: (value: T) => Selectable<void> 
}

export class CannotWriteIntoClosedChannel extends NamedError {}

export interface Selectable<T> {
    wait: <const R>(value: R, signal: AbortSignal) => Promise<R>

    /**
     * Callers must not mutate the returned value
     */
    attempt: () => SelectableAttemptResult<T>
}

export type SelectableAttemptResult<T> = 
    | { readonly ok: true, readonly value: T }
    | { readonly ok: false }
