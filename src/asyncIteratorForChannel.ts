import { type BaseReadableChannel } from './channel-api.js'

export function asyncIteratorForChannel<T>(
    channel: BaseReadableChannel<T>
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
