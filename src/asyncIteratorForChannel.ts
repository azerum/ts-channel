import { type NotUndefined, type ReadableChannel } from './channel-api.js'

export function asyncIteratorForChannel<T extends NotUndefined>(
    channel: Pick<ReadableChannel<T>, 'read'>
): AsyncIterator<T> {
    return {
        async next() {
            const value = await channel.read()

            if (value === undefined) {
                return { done: true, value: undefined }
            }

            return { done: false, value }
        }
    }
}
