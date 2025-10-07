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
            await channel.write(fn(value))
        },

        tryWrite(value) {
            return channel.tryWrite(fn(value))
        },

        waitUntilWritable(value, signal) {
            return channel.waitUntilWritable(value, signal)
        },

        get writableWaitsCount() {
            return channel.writableWaitsCount
        },

        raceWrite(value) {
            return channel.raceWrite(fn(value))
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
            return value === undefined ? undefined : fn(value)
        },

        tryRead() {
            const value = channel.tryRead()
            return value === undefined ? undefined : fn(value)
        },

        waitUntilReadable(value, signal) {
            return channel.waitUntilReadable(value, signal)
        },

        get readableWaitsCount() {
            return channel.readableWaitsCount
        },

        raceRead() {
            const p = channel.raceRead()
            
            return {
                wait(value, signal) {
                    return p.wait(value, signal)
                },

                attempt() {
                    const value = p.attempt()

                    if (value[0]) {
                        return [true, fn(value[1]!)]
                    }

                    return value
                },
            }
        },

        [Symbol.asyncIterator]() {
            return asyncIteratorForChannel(this)
        },
    }
}
