import { asyncIteratorForChannel } from './asyncIteratorForChannel.js'
import type { NotUndefined, ReadableChannel, WritableChannel } from './channel-api.js'

/**
 * Applies function to values before they are written into the channel
 */
export function mapWritableChannel<T extends NotUndefined, R extends NotUndefined>(
    channel: WritableChannel<R>,
    fn: (value: T) => R
): WritableChannel<T> {
    return {
        get closed() {
            return channel.closed
        },

        async write(value) {
            const result = fn(value)
            await channel.write(result)
        },

        close() {
            channel.close()
        },
    }
}

/**
 * Applies function to values after they are read from the channel
 */
export function mapReadableChannel<T extends NotUndefined, R extends NotUndefined>(
    channel: ReadableChannel<T>,
    fn: (value: T) => R
): ReadableChannel<R> {
    return {
        get closed() {
            return channel.closed
        },

        async read() {
            const value = await channel.read()

            if (value === undefined) {
                return undefined
            }

            return fn(value)
        },

        tryRead() {
            const value = channel.tryRead()
            
            if (value === undefined) {
                return undefined
            }

            return fn(value)
        },

        [Symbol.asyncIterator]() {
            return asyncIteratorForChannel(this)
        },

        waitUntilReadable(value, signal) {
            return channel.waitUntilReadable(value, signal)
        },
    }
}
