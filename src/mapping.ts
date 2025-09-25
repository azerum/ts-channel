import { asyncIteratorForChannel } from './asyncIteratorForChannel.js'
import type { ReadableChannel, WritableChannel } from './channel-api.js'

/**
 * Applies function to values before they are written into the channel
 */
export function mapWritableChannel<T, R>(
    channel: WritableChannel<R>,
    fn: (value: Exclude<T, undefined>) => Exclude<R, undefined>
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
export function mapReadableChannel<T, R>(
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
