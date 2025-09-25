import type { ReadableChannel } from './channel-api.js'
import { Channel } from './Channel.js'

/**
 * @internal Might be removed without notice
 */
export type IterableElementType<T> = 
    T extends AsyncIterable<infer U>
        ? U
        : never

/**
 * Merges AsyncIterables into a channel that yields values as soon as any 
 * iterable does
 * 
 * The returned channel closes once all iterables are closed
 * 
 * @param resultCapacity Capacity of the buffer of the returned channel. 0
 * would be a default choice
 */
export function merge<TSources extends AsyncIterable<any>[]>(
    sources: TSources,
    resultCapacity: number,
): ReadableChannel<IterableElementType<TSources[number]>> {
    type T = IterableElementType<TSources[number]>
    const output = new Channel<T>(resultCapacity)
    
    void main()
    return output

    async function main() {
        const promises = sources.map(worker)
        await Promise.all(promises)

        output.close()
    }

    async function worker(source: AsyncIterable<T>) {
        for await (const value of source) {
            await output.write(value)
        }
    }
}
